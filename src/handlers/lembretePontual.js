const db = require('../db');
const { garantirCategoria } = require('./categorias');
const { normalizarFormaPagamento } = require('./formaPagamento');
const { inserirTransacao, montarConfirmacao } = require('./registrar');
const { notificarComOpcoes } = require('../push');

const SNOOZE_MIN = 30;

// "YYYY-MM-DD HH:MM:SS" em horário de Brasília (UTC-3, fixo) -> Date correto em UTC
function parseHorarioBrasilia(texto) {
  const iso = texto.trim().replace(' ', 'T');
  return new Date(`${iso}-03:00`);
}

function formatarHorario(data) {
  return data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}

async function criarLembretePontual(usuario, dados) {
  const disparaEm = parseHorarioBrasilia(dados.dispara_em);
  let categoria = null;
  if (dados.categoria) {
    const resultado = await garantirCategoria(usuario.familia_id, dados.categoria);
    categoria = resultado.nome;
  }
  const formaPagamento = dados.forma_pagamento ? normalizarFormaPagamento(dados.forma_pagamento) : 'Não informado';
  const valor = dados.valor != null ? Number(dados.valor) : null;
  const modoInformado = dados.modo && ['avisar', 'lancar_automatico', 'perguntar'].includes(dados.modo) ? dados.modo : null;

  const status = modoInformado ? 'agendado' : 'aguardando_modo';

  await db.query(
    `INSERT INTO lembretes_pontuais
       (familia_id, usuario_id, descricao, categoria, forma_pagamento, valor, dispara_em, modo, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [usuario.familia_id, usuario.id, dados.descricao, categoria, formaPagamento, valor, disparaEm, modoInformado, status]
  );

  if (modoInformado) {
    return `⏰ Lembrete agendado pra ${formatarHorario(disparaEm)}: *${dados.descricao}*.`;
  }

  await notificarComOpcoes(
    usuario,
    `⏰ Lembrete agendado pra ${formatarHorario(disparaEm)}: *${dados.descricao}*.\n\nQuando chegar a hora, o que você quer que eu faça?`,
    [
      { id: 'modo_automatico', titulo: 'Automático' },
      { id: 'modo_perguntar', titulo: 'Pergunta' },
      { id: 'modo_avisar', titulo: 'Só avisa' },
    ],
    'Lembrete agendado'
  );
  return null; // já enviado (WhatsApp: botões; web: push + cartão de pendência no app)
}

// Chamado a cada mensagem recebida (se não houver outra pendência em aberto).
// Resolve a escolha do modo pra um lembrete pontual recém-criado.
async function tentarResolverModo(usuario, texto) {
  const { rows } = await db.query(
    `SELECT * FROM lembretes_pontuais
     WHERE usuario_id = $1 AND status = 'aguardando_modo'
     ORDER BY criado_em DESC LIMIT 1`,
    [usuario.id]
  );
  if (rows.length === 0) return null;
  const lembrete = rows[0];

  const t = texto.trim().toLowerCase();
  let modo = null;
  if (/(autom[aá]tic|direto|sem perguntar|sozinho)/.test(t)) modo = 'lancar_automatico';
  else if (/(pergunt|confirma antes)/.test(t)) modo = 'perguntar';
  else if (/(s[oó] avis|apenas avis)/.test(t)) modo = 'avisar';

  if (!modo) return null; // não reconheceu, deixa seguir pro fluxo normal

  if (modo !== 'avisar' && (!lembrete.valor || !lembrete.categoria)) {
    // sem valor/categoria não dá pra lançar despesa sozinho, cai pra avisar
    modo = 'avisar';
  }

  await db.query(`UPDATE lembretes_pontuais SET modo=$1, status='agendado' WHERE id=$2`, [modo, lembrete.id]);
  return `👍 Combinado! Vou seguir esse plano quando chegar a hora do lembrete "${lembrete.descricao}".`;
}

// Resolve resposta de "já fez?" pra lembrete no modo perguntar
async function tentarResolverConfirmacao(usuario, texto) {
  const { rows } = await db.query(
    `SELECT * FROM lembretes_pontuais
     WHERE usuario_id = $1 AND status = 'aguardando_confirmacao'
     ORDER BY dispara_em DESC LIMIT 1`,
    [usuario.id]
  );
  if (rows.length === 0) return null;
  const lembrete = rows[0];
  const t = texto.trim().toLowerCase();

  if (/^(sim|ja fiz|já fiz|feito|pronto|confirmo|confirmado)/.test(t)) {
    const numero = await inserirTransacao(usuario, {
      tipo: 'despesa',
      valor: lembrete.valor,
      categoria: lembrete.categoria,
      formaPagamento: lembrete.forma_pagamento,
      descricao: lembrete.descricao,
    });
    await db.query(`UPDATE lembretes_pontuais SET status='concluido' WHERE id=$1`, [lembrete.id]);
    const confirmacao = await montarConfirmacao(usuario, {
      numero,
      tipo: 'despesa',
      valor: lembrete.valor,
      categoria: lembrete.categoria,
      formaPagamento: lembrete.forma_pagamento,
      criada: false,
    });
    return `✅ Beleza!\n${confirmacao}`;
  }

  if (/^(cancela|cancelar|esquece)/.test(t)) {
    await db.query(`UPDATE lembretes_pontuais SET status='cancelado' WHERE id=$1`, [lembrete.id]);
    return `👍 Cancelado o lembrete "${lembrete.descricao}".`;
  }

  // "ainda não" ou qualquer outra coisa: adia e pergunta de novo mais tarde
  const novoHorario = new Date(Date.now() + SNOOZE_MIN * 60 * 1000);
  await db.query(`UPDATE lembretes_pontuais SET status='agendado', dispara_em=$1 WHERE id=$2`, [novoHorario, lembrete.id]);
  return `Sem problema, te pergunto de novo em ${SNOOZE_MIN} minutos.`;
}

module.exports = { criarLembretePontual, tentarResolverModo, tentarResolverConfirmacao };
