const cron = require('node-cron');
const db = require('./db');
const { inserirTransacao, montarConfirmacao } = require('./handlers/registrar');
const { criarPendencia, processarExpiradas } = require('./handlers/confirmacoes');
const { avancarFila } = require('./handlers/contasFixas');
const { perguntarDiaUtilDoMes, buscarDiaConfirmado } = require('./handlers/configContasFixas');
const { gastoPeriodoMsg, resumoFechadoMsg, NOMES_MESES } = require('./handlers/consultas');
const { enviarMensagem, enviarBotoes } = require('./whatsapp');
const { notificar, notificarComOpcoes } = require('./push');

function primeiroDiaDoMes() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Calcula o dia do mês (número) que corresponde ao Nº-ésimo dia útil (seg-sex, sem
// levar feriados em conta) daquele mês/ano.
function calcularEnesimoDiaUtil(ano, mesIndex, n) {
  const d = new Date(ano, mesIndex, 1);
  let uteis = 0;
  while (true) {
    const diaSemana = d.getDay(); // 0=domingo, 6=sábado
    if (diaSemana !== 0 && diaSemana !== 6) {
      uteis++;
      if (uteis === n) return d.getDate();
    }
    d.setDate(d.getDate() + 1);
  }
}

async function buscarUsuario(usuarioId) {
  const { rows } = await db.query('SELECT * FROM usuarios WHERE id=$1', [usuarioId]);
  return rows[0];
}

async function processarParcelasDoDia() {
  const hoje = new Date().getDate();
  const { rows } = await db.query(
    `SELECT * FROM parcelamentos
     WHERE ativo = true AND dia_vencimento = $1 AND parcelas_lancadas < numero_parcelas
       AND (ultimo_mes_processado IS NULL OR ultimo_mes_processado < $2)`,
    [hoje, primeiroDiaDoMes()]
  );

  for (const p of rows) {
    const usuario = await buscarUsuario(p.usuario_id);
    if (!usuario) continue;

    await db.query(`UPDATE parcelamentos SET ultimo_mes_processado=$1 WHERE id=$2`, [primeiroDiaDoMes(), p.id]);

    await criarPendencia({
      tipo: 'parcela',
      referenciaId: p.id,
      usuario,
      descricao: `${p.descricao} (parcela ${p.parcelas_lancadas + 1}/${p.numero_parcelas})`,
      categoria: p.categoria,
      formaPagamento: p.forma_pagamento,
      valor: p.valor_parcela,
    });
  }
}

async function processarLembretesDoDia() {
  const hoje = new Date().getDate();
  const { rows } = await db.query(
    `SELECT * FROM lembretes
     WHERE ativo = true AND dia_do_mes = $1
       AND (ultimo_mes_processado IS NULL OR ultimo_mes_processado < $2)`,
    [hoje, primeiroDiaDoMes()]
  );

  for (const l of rows) {
    const usuario = await buscarUsuario(l.usuario_id);
    if (!usuario) continue;

    await db.query(`UPDATE lembretes SET ultimo_mes_processado=$1 WHERE id=$2`, [primeiroDiaDoMes(), l.id]);

    if (l.modo === 'avisar') {
      await notificar(usuario, `⏰ Lembrete: hoje é dia de *${l.descricao}*.`, 'Lembrete');
    } else if (l.modo === 'lancar_automatico') {
      const numero = await inserirTransacao(usuario, {
        tipo: 'despesa',
        valor: l.valor,
        categoria: l.categoria,
        formaPagamento: l.forma_pagamento,
        descricao: l.descricao,
      });
      const confirmacao = await montarConfirmacao(usuario, {
        numero,
        tipo: 'despesa',
        valor: l.valor,
        categoria: l.categoria,
        formaPagamento: l.forma_pagamento,
        criada: false,
      });
      await notificar(usuario, `⏰ Lembrete lançado automático:\n${confirmacao}`, 'Lembrete lançado');
    } else if (l.modo === 'perguntar') {
      await criarPendencia({
        tipo: 'lembrete',
        referenciaId: l.id,
        usuario,
        descricao: l.descricao,
        categoria: l.categoria,
        formaPagamento: l.forma_pagamento,
        valor: l.valor,
      });
    }
  }
}

async function processarLembretesPontuaisDevidos() {
  const { rows } = await db.query(
    `SELECT * FROM lembretes_pontuais WHERE status = 'agendado' AND dispara_em <= now()`
  );

  for (const l of rows) {
    const usuario = await buscarUsuario(l.usuario_id);
    if (!usuario) continue;

    if (l.modo === 'avisar') {
      await notificar(usuario, `⏰ Lembrete: *${l.descricao}*.`, 'Lembrete');
      await db.query(`UPDATE lembretes_pontuais SET status='concluido' WHERE id=$1`, [l.id]);
    } else if (l.modo === 'lancar_automatico') {
      const numero = await inserirTransacao(usuario, {
        tipo: 'despesa',
        valor: l.valor,
        categoria: l.categoria,
        formaPagamento: l.forma_pagamento,
        descricao: l.descricao,
      });
      const confirmacao = await montarConfirmacao(usuario, {
        numero,
        tipo: 'despesa',
        valor: l.valor,
        categoria: l.categoria,
        formaPagamento: l.forma_pagamento,
        criada: false,
      });
      await db.query(`UPDATE lembretes_pontuais SET status='concluido' WHERE id=$1`, [l.id]);
      await notificar(usuario, `⏰ Lembrete lançado automático:\n${confirmacao}`, 'Lembrete lançado');
    } else if (l.modo === 'perguntar') {
      await db.query(`UPDATE lembretes_pontuais SET status='aguardando_confirmacao' WHERE id=$1`, [l.id]);
      await notificarComOpcoes(
        usuario,
        `⏰ Chegou a hora: *${l.descricao}* — R$ ${Number(l.valor).toFixed(2)}\nVocê já fez?`,
        [
          { id: 'ja_fiz', titulo: 'Sim' },
          { id: 'ainda_nao', titulo: 'Ainda não' },
          { id: 'cancelar_lembrete', titulo: 'Cancela' },
        ],
        'Chegou a hora'
      );
    }
  }
}

async function perguntarDiaUtilSeForDiaPrimeiro() {
  if (new Date().getDate() !== 1) return;

  const { rows } = await db.query(
    `SELECT DISTINCT usuario_id FROM contas_fixas WHERE ativa = true`
  );
  for (const row of rows) {
    const usuario = await buscarUsuario(row.usuario_id);
    if (usuario) await perguntarDiaUtilDoMes(usuario);
  }
}

// Toda segunda-feira, manda o resumo da semana passada pra cada pessoa, sem precisar pedir
async function enviarResumoSemanal() {
  const hoje = new Date();
  if (hoje.getDay() !== 1) return; // 1 = segunda-feira

  const { rows } = await db.query(`SELECT * FROM usuarios`);
  for (const usuario of rows) {
    const msg = await gastoPeriodoMsg(usuario.familia_id, 7, null);
    await notificar(usuario, `🗓️ *Resumo automático da semana*\n\n${msg}`, 'Resumo da semana');
  }
}

// Todo dia 1º, manda o fechamento do mês que acabou de terminar, sem precisar pedir
async function enviarResumoMensal() {
  const hoje = new Date();
  if (hoje.getDate() !== 1) return;

  const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const { rows } = await db.query(`SELECT * FROM usuarios`);
  for (const usuario of rows) {
    const msg = await resumoFechadoMsg(usuario.familia_id, mesPassado.getFullYear(), mesPassado.getMonth());
    await notificar(
      usuario,
      `📅 *Fechamento de ${NOMES_MESES[mesPassado.getMonth()]}/${mesPassado.getFullYear()}*\n\n${msg}`,
      'Fechamento do mês'
    );
  }
}

async function processarContasFixasDoMes() {
  const hoje = new Date();

  // agrupa por quem cadastrou cada conta fixa ainda não processada esse mês,
  // e começa a fila pra cada um (ela mesma encadeia até acabar)
  const { rows } = await db.query(
    `SELECT DISTINCT familia_id, usuario_id FROM contas_fixas
     WHERE ativa = true AND (ultimo_mes_processado IS NULL OR ultimo_mes_processado < $1)`,
    [primeiroDiaDoMes()]
  );

  for (const row of rows) {
    const diaConfirmado = await buscarDiaConfirmado(row.familia_id);
    // usa o dia que a família combinou; se ninguém respondeu ainda, cai no cálculo automático
    const diaAlvo = diaConfirmado ?? calcularEnesimoDiaUtil(hoje.getFullYear(), hoje.getMonth(), 5);

    if (hoje.getDate() !== diaAlvo) continue;

    const usuario = await buscarUsuario(row.usuario_id);
    if (usuario) await avancarFila(usuario);
  }
}

function iniciarAgendador() {
  // todo dia às 08:00: pergunta o dia útil (se for dia 1º), processa parcelas, lembretes e contas fixas
  cron.schedule('0 8 * * *', async () => {
    try {
      await perguntarDiaUtilSeForDiaPrimeiro();
      await processarParcelasDoDia();
      await processarLembretesDoDia();
      await processarContasFixasDoMes();
      await enviarResumoSemanal();
      await enviarResumoMensal();
    } catch (err) {
      console.error('Erro no agendador diário:', err);
    }
  });

  // a cada 5 minutos, lança sozinho o que passou do prazo de confirmação e dispara lembretes pontuais
  cron.schedule('*/5 * * * *', async () => {
    try {
      await processarExpiradas();
      await processarLembretesPontuaisDevidos();
    } catch (err) {
      console.error('Erro processando confirmações/lembretes pontuais:', err);
    }
  });

  console.log('Agendador iniciado: parcelas/lembretes às 08:00, confirmações e lembretes pontuais a cada 5min.');
}

module.exports = { iniciarAgendador };
