const db = require('../db');
const { enviarMensagem } = require('../whatsapp');

const PRAZO_MS = 90 * 1000; // 1:30

function gerarCodigo() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Alguém pede pra se vincular à conta de outro número (o "dono")
async function solicitarVinculo(telefoneRequisitante, telefoneAlvo) {
  const { rows } = await db.query(`SELECT * FROM usuarios WHERE telefone=$1 AND dono=true`, [telefoneAlvo]);

  if (rows.length === 0) {
    return `Não encontrei nenhuma conta com o número ${telefoneAlvo}. Peça pra essa pessoa mandar uma mensagem pro bot primeiro (isso cria a conta dela automaticamente).`;
  }

  const dono = rows[0];

  const existente = await db.query(`SELECT * FROM usuarios WHERE telefone=$1`, [telefoneRequisitante]);
  if (existente.rows.length && existente.rows[0].familia_id === dono.familia_id) {
    return 'Vocês já estão vinculados na mesma conta família! 👍';
  }

  const codigo = gerarCodigo();
  const expiraEm = new Date(Date.now() + PRAZO_MS);

  await db.query(
    `INSERT INTO solicitacoes_vinculo (familia_id, telefone_solicitante, telefone_aprovador, codigo, expira_em)
     VALUES ($1,$2,$3,$4,$5)`,
    [dono.familia_id, telefoneRequisitante, dono.telefone, codigo, expiraEm]
  );

  await enviarMensagem(
    dono.telefone,
    `🔐 O número ${telefoneRequisitante} quer se vincular à sua conta financeira.\nResponda com o código *${codigo}* nos próximos 1:30 pra confirmar. Se não foi você que pediu, pode ignorar.`
  );

  return `Pedido enviado! Peça pra pessoa dona da conta confirmar com o código que chegou no WhatsApp dela — ela tem 1 minuto e meio.`;
}

// Dono responde com o código recebido pra confirmar o vínculo
async function confirmarCodigo(telefoneAprovador, codigo) {
  const { rows } = await db.query(
    `SELECT * FROM solicitacoes_vinculo
     WHERE telefone_aprovador=$1 AND codigo=$2 AND status='pendente'
     ORDER BY criado_em DESC LIMIT 1`,
    [telefoneAprovador, codigo]
  );

  if (rows.length === 0) {
    return '❌ Não encontrei nenhum pedido de vínculo pendente com esse código.';
  }

  const solicitacao = rows[0];

  if (new Date(solicitacao.expira_em) < new Date()) {
    await db.query(`UPDATE solicitacoes_vinculo SET status='expirado' WHERE id=$1`, [solicitacao.id]);
    return '⏰ Esse código expirou (o prazo é de 1:30). Peça pra pessoa solicitar o vínculo de novo.';
  }

  await db.query(
    `INSERT INTO usuarios (telefone, familia_id, dono)
     VALUES ($1, $2, false)
     ON CONFLICT (telefone) DO UPDATE SET familia_id = EXCLUDED.familia_id, dono = false`,
    [solicitacao.telefone_solicitante, solicitacao.familia_id]
  );

  await db.query(`UPDATE solicitacoes_vinculo SET status='aprovado' WHERE id=$1`, [solicitacao.id]);

  await enviarMensagem(
    solicitacao.telefone_solicitante,
    '✅ Vínculo confirmado! Agora vocês compartilham os mesmos dados financeiros — pode perguntar "quanto gastamos esse mês" que já vem tudo junto.'
  );

  return '✅ Vínculo confirmado com sucesso!';
}

module.exports = { solicitarVinculo, confirmarCodigo };
