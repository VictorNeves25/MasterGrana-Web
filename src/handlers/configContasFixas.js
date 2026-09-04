const db = require('../db');
const { notificar } = require('../push');

function primeiroDiaDoMes() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

// Chamado todo dia 1º pelo agendador: pergunta pra cada família com contas fixas ativas
// qual é o 5º dia útil desse mês (evita perguntar de novo se já perguntou hoje/esse mês).
async function perguntarDiaUtilDoMes(usuario) {
  const mesRef = primeiroDiaDoMes();

  const { rows } = await db.query(
    `SELECT * FROM config_contas_fixas WHERE familia_id=$1 AND mes_referencia=$2`,
    [usuario.familia_id, mesRef]
  );
  if (rows.length > 0) return; // já perguntou (ou já confirmou) esse mês

  await db.query(
    `INSERT INTO config_contas_fixas (familia_id, mes_referencia, status) VALUES ($1,$2,'aguardando')`,
    [usuario.familia_id, mesRef]
  );

  const nomeMes = MESES[mesRef.getMonth()];
  await notificar(
    usuario,
    `📅 Começou ${nomeMes}! Qual é o 5º dia útil desse mês aí pra você (considerando feriados)? Me manda só o número do dia, ex: "6".\n\nUso essa data pra saber quando lembrar do pagamento das contas fixas.`,
    'Configurar dia útil'
  );
}

// Resolve a resposta com o dia do mês. Retorna null se não houver pergunta pendente
// pra essa família, ou um texto de confirmação/erro se houver.
async function tentarResolverDiaUtil(usuario, texto) {
  const mesRef = primeiroDiaDoMes();
  const { rows } = await db.query(
    `SELECT * FROM config_contas_fixas WHERE familia_id=$1 AND mes_referencia=$2 AND status='aguardando'`,
    [usuario.familia_id, mesRef]
  );
  if (rows.length === 0) return null;

  const match = texto.trim().match(/\b(\d{1,2})\b/);
  if (!match) return null; // não parece resposta a essa pergunta, deixa seguir pro fluxo normal

  const dia = Number(match[1]);
  if (dia < 1 || dia > 28) {
    return 'Isso não parece um dia válido do mês. Me manda só o número, tipo "6".';
  }

  await db.query(
    `UPDATE config_contas_fixas SET dia_lembrete=$1, status='confirmado' WHERE familia_id=$2 AND mes_referencia=$3`,
    [dia, usuario.familia_id, mesRef]
  );

  return `👍 Combinado! Vou lembrar das contas fixas no dia ${dia}.`;
}

// Usado pelo agendador: retorna o dia combinado pra essa família nesse mês, ou null
// se ainda não foi confirmado (sinal pra usar o cálculo automático como plano B).
async function buscarDiaConfirmado(familiaId) {
  const mesRef = primeiroDiaDoMes();
  const { rows } = await db.query(
    `SELECT dia_lembrete FROM config_contas_fixas WHERE familia_id=$1 AND mes_referencia=$2 AND status='confirmado'`,
    [familiaId, mesRef]
  );
  return rows[0]?.dia_lembrete ?? null;
}

module.exports = { perguntarDiaUtilDoMes, tentarResolverDiaUtil, buscarDiaConfirmado };
