const db = require('../db');
const { inserirTransacao, montarConfirmacao } = require('./registrar');
const { notificar, notificarComOpcoes } = require('../push');

const JANELA_CONFIRMACAO_MIN = 30;

async function criarPendencia({ tipo, referenciaId, usuario, descricao, categoria, formaPagamento, valor }) {
  const expiraEm = new Date(Date.now() + JANELA_CONFIRMACAO_MIN * 60 * 1000);
  await db.query(
    `INSERT INTO confirmacoes_pendentes
       (tipo, referencia_id, familia_id, usuario_id, descricao, categoria, forma_pagamento, valor, expira_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [tipo, referenciaId, usuario.familia_id, usuario.id, descricao, categoria, formaPagamento || 'Não informado', valor, expiraEm]
  );

  const botoes = [
    { id: 'confirmar_pendencia', titulo: 'Sim' },
    { id: 'cancelar_pendencia', titulo: 'Cancela' },
  ];
  if (tipo === 'parcela') {
    botoes.push({ id: 'quitar_parcelamento', titulo: 'Quitei' });
  }

  await notificarComOpcoes(
    usuario,
    `❓ *${descricao}* — R$ ${Number(valor).toFixed(2)}\nSe não responder em ${JANELA_CONFIRMACAO_MIN} minutos, eu lanço automaticamente.`,
    botoes,
    'Confirmação pendente'
  );
}

// Procura uma pendência aberta desse usuário (ainda dentro do prazo)
async function buscarPendenteAtiva(usuarioId) {
  const { rows } = await db.query(
    `SELECT * FROM confirmacoes_pendentes
     WHERE usuario_id = $1 AND status = 'pendente' AND expira_em > now()
     ORDER BY criado_em DESC LIMIT 1`,
    [usuarioId]
  );
  return rows[0] || null;
}

const PALAVRAS_QUITAR = ['quitei', 'quitar', 'quitação', 'quitacao', 'paguei tudo', 'adiantei'];
const PALAVRAS_CONFIRMA = ['sim', 'ok', 'pode', 'confirma', 'confirmo', 'lança', 'lanca', 'manda'];
const PALAVRAS_CANCELA = ['não', 'nao', 'cancela', 'cancelar', 'pula', 'pular', 'ignora'];

function classificarRespostaSimples(texto) {
  const t = texto.trim().toLowerCase();
  if (PALAVRAS_QUITAR.some((p) => t === p || t.includes(p))) return 'quitar';
  if (PALAVRAS_CONFIRMA.some((p) => t === p || t.startsWith(p + ' ') || t.includes(p))) return 'confirmar';
  if (PALAVRAS_CANCELA.some((p) => t === p || t.startsWith(p + ' ') || t.includes(p))) return 'cancelar';
  return null;
}

// Chamado a cada mensagem recebida, antes da IA. Se houver pendência e a resposta
// for um "sim"/"cancela"/"quitei" simples, resolve na hora sem gastar chamada de IA.
async function tentarResolverComMensagem(usuario, texto) {
  const pendencia = await buscarPendenteAtiva(usuario.id);
  if (!pendencia) return null;

  const acao = classificarRespostaSimples(texto);
  if (acao === 'confirmar') return lancarPendencia(pendencia, 'confirmado', '✅ Confirmado!');
  if (acao === 'cancelar') return cancelar(pendencia);
  if (acao === 'quitar' && pendencia.tipo === 'parcela') return quitarParcelamento(pendencia);
  return null; // deixa a mensagem seguir pro fluxo normal (IA)
}

async function buscarUsuarioCompleto(usuarioId) {
  const { rows } = await db.query(`SELECT * FROM usuarios WHERE id=$1`, [usuarioId]);
  return rows[0];
}

async function lancarPendencia(pendencia, statusFinal, prefixo) {
  const usuario = await buscarUsuarioCompleto(pendencia.usuario_id);

  const numero = await inserirTransacao(usuario, {
    tipo: 'despesa',
    valor: pendencia.valor,
    categoria: pendencia.categoria,
    formaPagamento: pendencia.forma_pagamento,
    descricao: pendencia.descricao,
  });

  await db.query(`UPDATE confirmacoes_pendentes SET status=$1 WHERE id=$2`, [statusFinal, pendencia.id]);
  await atualizarOrigem(pendencia);

  const confirmacao = await montarConfirmacao(usuario, {
    numero,
    tipo: 'despesa',
    valor: pendencia.valor,
    categoria: pendencia.categoria,
    formaPagamento: pendencia.forma_pagamento,
    criada: false,
  });

  return `${prefixo}\n${confirmacao}`;
}

async function cancelar(pendencia) {
  await db.query(`UPDATE confirmacoes_pendentes SET status='cancelado' WHERE id=$1`, [pendencia.id]);
  return `👍 Beleza, não lancei *${pendencia.descricao}* dessa vez.`;
}

// Usuário adiantou o pagamento de todas as parcelas restantes de uma vez
async function quitarParcelamento(pendencia) {
  const usuario = await buscarUsuarioCompleto(pendencia.usuario_id);

  const { rows } = await db.query(`SELECT * FROM parcelamentos WHERE id=$1`, [pendencia.referencia_id]);
  const parcelamento = rows[0];
  if (!parcelamento) {
    return await lancarPendencia(pendencia, 'confirmado', '✅ Confirmado!'); // fallback de segurança
  }

  const parcelasRestantes = parcelamento.numero_parcelas - parcelamento.parcelas_lancadas;
  const valorTotal = Math.round(parcelasRestantes * Number(parcelamento.valor_parcela) * 100) / 100;

  const numero = await inserirTransacao(usuario, {
    tipo: 'despesa',
    valor: valorTotal,
    categoria: pendencia.categoria,
    formaPagamento: pendencia.forma_pagamento,
    descricao: `${parcelamento.descricao} (quitação de ${parcelasRestantes} parcelas restantes)`,
  });

  await db.query(`UPDATE confirmacoes_pendentes SET status='quitado' WHERE id=$1`, [pendencia.id]);
  await db.query(
    `UPDATE parcelamentos SET parcelas_lancadas = numero_parcelas, ativo = false WHERE id = $1`,
    [parcelamento.id]
  );

  const confirmacao = await montarConfirmacao(usuario, {
    numero,
    tipo: 'despesa',
    valor: valorTotal,
    categoria: pendencia.categoria,
    formaPagamento: pendencia.forma_pagamento,
    criada: false,
  });

  return `🏁 Parcelamento quitado! Lancei as ${parcelasRestantes} parcelas restantes de uma vez.\n${confirmacao}`;
}

// Roda periodicamente (scheduler): lança sozinho tudo que passou do prazo sem resposta
async function processarExpiradas() {
  const { rows } = await db.query(
    `SELECT * FROM confirmacoes_pendentes WHERE status='pendente' AND expira_em <= now()`
  );

  for (const pendencia of rows) {
    const mensagem = await lancarPendencia(pendencia, 'auto_confirmado', '⏱️ Você não respondeu, lancei automático:');

    const { rows: userRows } = await db.query(`SELECT * FROM usuarios WHERE id=$1`, [pendencia.usuario_id]);
    if (userRows[0]) {
      await notificar(userRows[0], mensagem, 'Lançamento automático');
    }
  }
}

// Atualiza contadores no parcelamento de origem, se for o caso
async function atualizarOrigem(pendencia) {
  if (pendencia.tipo !== 'parcela') return;
  await db.query(
    `UPDATE parcelamentos SET parcelas_lancadas = parcelas_lancadas + 1 WHERE id = $1`,
    [pendencia.referencia_id]
  );
  await db.query(
    `UPDATE parcelamentos SET ativo = false WHERE id = $1 AND parcelas_lancadas >= numero_parcelas`,
    [pendencia.referencia_id]
  );
}

module.exports = { criarPendencia, tentarResolverComMensagem, processarExpiradas };
