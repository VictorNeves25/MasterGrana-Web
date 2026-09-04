const express = require('express');
const db = require('../db');
const webpush = require('web-push');
const { autenticar } = require('../middleware/autenticar');
const { classificarMensagem } = require('../ai/classifier');
const { listarCategorias } = require('../handlers/categorias');
const { processarIntencao } = require('../intencoes');
const { tentarResolverPendencias } = require('../pendencias');

const router = express.Router();
router.use(autenticar);

// Mensagem de texto livre — o mesmo cérebro do WhatsApp, só que via HTTP.
// Primeiro checa se essa mensagem resolve alguma pendência em aberto
// (parcela, conta fixa, lembrete); só chama a IA se não for o caso.
router.post('/mensagem', async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ erro: 'Mensagem vazia.' });

    const pendencia = await tentarResolverPendencias(req.usuario, texto);
    if (pendencia.resolvido) {
      return res.json({ tipo: 'texto', texto: pendencia.texto || '👍' });
    }

    const categoriasExistentes = await listarCategorias(req.usuario.familia_id);
    const dados = await classificarMensagem(texto, categoriasExistentes);
    const resultado = await processarIntencao(req.usuario, dados, 'web');

    if (resultado.tipo === 'arquivo') {
      const { buffer, nomeArquivo } = resultado.arquivo;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
      return res.send(Buffer.from(buffer));
    }

    res.json(resultado);
  } catch (err) {
    console.error('Erro processando mensagem web:', err);
    res.status(500).json({ tipo: 'texto', texto: '⚠️ Deu um erro aqui do meu lado. Pode tentar de novo?' });
  }
});

router.get('/categorias', async (req, res) => {
  const categorias = await listarCategorias(req.usuario.familia_id);
  res.json({ categorias });
});

// ---------- Pendências (parcelas, contas fixas, lembretes) como cartões no app ----------
router.get('/pendencias', async (req, res) => {
  const usuarioId = req.usuario.id;

  const [confirmacoes, contasFixas, lembretes, diaUtil] = await Promise.all([
    db.query(
      `SELECT * FROM confirmacoes_pendentes WHERE usuario_id=$1 AND status='pendente' AND expira_em > now() ORDER BY criado_em DESC`,
      [usuarioId]
    ),
    db.query(
      `SELECT * FROM contas_fixas_pendentes WHERE usuario_id=$1 AND status IN ('aguardando_resposta','aguardando_novo_valor') ORDER BY criado_em DESC`,
      [usuarioId]
    ),
    db.query(
      `SELECT * FROM lembretes_pontuais WHERE usuario_id=$1 AND status IN ('aguardando_modo','aguardando_confirmacao') ORDER BY criado_em DESC`,
      [usuarioId]
    ),
    db.query(
      `SELECT * FROM config_contas_fixas WHERE familia_id=$1 AND status='aguardando'`,
      [req.usuario.familia_id]
    ),
  ]);

  const pendencias = [];

  for (const c of confirmacoes.rows) {
    pendencias.push({
      origem: 'confirmacao',
      id: c.id,
      titulo: c.descricao,
      valor: Number(c.valor),
      opcoes: c.tipo === 'parcela' ? ['Sim', 'Cancela', 'Quitei'] : ['Sim', 'Cancela'],
      expiraEm: c.expira_em,
    });
  }

  for (const c of contasFixas.rows) {
    if (c.status === 'aguardando_resposta') {
      pendencias.push({
        origem: 'contafixa',
        id: c.id,
        titulo: `Pagar conta de ${c.descricao}`,
        valor: c.valor_sugerido != null ? Number(c.valor_sugerido) : null,
        opcoes: ['Já paguei', 'Alterar valor', 'Não tenho mais'],
      });
    } else {
      pendencias.push({
        origem: 'contafixa',
        id: c.id,
        titulo: `Quanto foi "${c.descricao}" dessa vez?`,
        campoValor: true,
      });
    }
  }

  for (const l of lembretes.rows) {
    if (l.status === 'aguardando_modo') {
      pendencias.push({
        origem: 'lembretepontual',
        id: l.id,
        titulo: `Como agir no lembrete "${l.descricao}"?`,
        opcoes: ['Automático', 'Pergunta', 'Só avisa'],
      });
    } else {
      pendencias.push({
        origem: 'lembretepontual',
        id: l.id,
        titulo: `Já fez "${l.descricao}"?`,
        valor: l.valor != null ? Number(l.valor) : null,
        opcoes: ['Sim', 'Ainda não', 'Cancela'],
      });
    }
  }

  for (const d of diaUtil.rows) {
    pendencias.push({
      origem: 'diautil',
      id: d.id,
      titulo: 'Qual é o 5º dia útil desse mês? (considerando feriados)',
      campoValor: true,
    });
  }

  res.json({ pendencias });
});

// Responde uma pendência (clique de botão ou valor digitado). O texto enviado
// é o mesmo texto que apareceria numa mensagem de WhatsApp — reaproveita a
// mesma lógica de reconhecimento por trás dos dois canais.
router.post('/pendencias/responder', async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ erro: 'Resposta vazia.' });

    const resultado = await tentarResolverPendencias(req.usuario, texto);
    if (!resultado.resolvido) {
      return res.status(404).json({ erro: 'Não encontrei essa pendência (pode já ter expirado).' });
    }
    res.json({ texto: resultado.texto || null });
  } catch (err) {
    console.error('Erro respondendo pendência:', err);
    res.status(500).json({ erro: 'Erro ao processar a resposta.' });
  }
});

// Excel: entrega o arquivo direto como download (não passa pelo /mensagem porque
// o corpo da resposta aqui é o arquivo binário, não JSON)
router.post('/exportar-excel', async (req, res) => {
  try {
    const { gerarArquivoExcel } = require('../handlers/exportar');
    const { buffer, nomeArquivo } = await gerarArquivoExcel(req.usuario, req.body || {});

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Erro exportando excel:', err);
    res.status(500).json({ erro: 'Erro ao gerar a planilha.' });
  }
});

// ---------- Notificações push ----------
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:contato@mastergrana.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

router.get('/push/chave-publica', (req, res) => {
  res.json({ chave: process.env.VAPID_PUBLIC_KEY || null });
});

router.post('/push/inscrever', async (req, res) => {
  const { endpoint, keys } = req.body.subscription || {};
  if (!endpoint || !keys) return res.status(400).json({ erro: 'Inscrição inválida.' });

  await db.query(
    `INSERT INTO push_subscriptions (usuario_id, endpoint, p256dh, auth)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET usuario_id = EXCLUDED.usuario_id`,
    [req.usuario.id, endpoint, keys.p256dh, keys.auth]
  );

  res.json({ ok: true });
});

module.exports = router;

