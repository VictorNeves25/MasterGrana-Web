const db = require('../db');
const { garantirCategoria } = require('./categorias');
const { normalizarFormaPagamento } = require('./formaPagamento');
const { inserirTransacao, montarConfirmacao } = require('./registrar');
const { notificar, notificarComOpcoes } = require('../push');

// Sentinela: sinaliza pro server.js que a mensagem já foi tratada e enviada
// por essa função (não precisa mandar mais nada, e não deve tentar outros fluxos).
const JA_ENVIADO = Symbol('ja_enviado');

function primeiroDiaDoMes() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function cadastrarContaFixa(usuario, dados) {
  const { nome: categoria } = await garantirCategoria(usuario.familia_id, dados.categoria || 'Contas Fixas');
  const formaPagamento = normalizarFormaPagamento(dados.forma_pagamento || null);
  const valorInicial = dados.valor_inicial != null ? Number(dados.valor_inicial) : null;

  await db.query(
    `INSERT INTO contas_fixas (familia_id, usuario_id, descricao, categoria, forma_pagamento, ultimo_valor)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [usuario.familia_id, usuario.id, dados.descricao, categoria, formaPagamento, valorInicial]
  );

  return `📌 Conta fixa cadastrada: *${dados.descricao}*. Todo mês, no 5º dia útil, eu vou te lembrar de pagar (você também pode adiantar a qualquer momento mandando "pagar contas").`;
}

// Pega a próxima conta fixa não processada nesse mês (da família toda) e manda o lembrete
// pro usuário informado. Encadeia sozinha: sempre que uma é resolvida, chama de novo
// pra próxima, até acabar a fila. Sempre envia direto (nunca retorna texto pro chamador mandar).
async function avancarFila(usuario) {
  const { rows } = await db.query(
    `SELECT * FROM contas_fixas
     WHERE familia_id = $1 AND ativa = true
       AND (ultimo_mes_processado IS NULL OR ultimo_mes_processado < $2)
       AND id NOT IN (
         SELECT conta_fixa_id FROM contas_fixas_pendentes
         WHERE status IN ('aguardando_resposta','aguardando_novo_valor')
       )
     ORDER BY id LIMIT 1`,
    [usuario.familia_id, primeiroDiaDoMes()]
  );

  if (rows.length === 0) {
    await notificar(usuario, '✅ Todas as contas fixas desse mês já estão em dia!', 'Contas fixas');
    return;
  }

  const conta = rows[0];

  if (conta.ultimo_valor == null) {
    await db.query(
      `INSERT INTO contas_fixas_pendentes
         (conta_fixa_id, familia_id, usuario_id, descricao, categoria, forma_pagamento, valor_sugerido, status)
       VALUES ($1,$2,$3,$4,$5,$6,NULL,'aguardando_novo_valor')`,
      [conta.id, usuario.familia_id, usuario.id, conta.descricao, conta.categoria, conta.forma_pagamento]
    );
    await notificar(usuario, `Lembrete\npagar conta de ${conta.descricao}\nQuanto foi dessa vez?`, 'Conta fixa');
    return;
  }

  await db.query(
    `INSERT INTO contas_fixas_pendentes
       (conta_fixa_id, familia_id, usuario_id, descricao, categoria, forma_pagamento, valor_sugerido, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'aguardando_resposta')`,
    [conta.id, usuario.familia_id, usuario.id, conta.descricao, conta.categoria, conta.forma_pagamento, conta.ultimo_valor]
  );

  await notificarComOpcoes(
    usuario,
    `Lembrete\npagar conta de ${conta.descricao} ${Number(conta.ultimo_valor).toFixed(2)}`,
    [
      { id: 'ja_paguei', titulo: 'Já paguei' },
      { id: 'alterar_valor', titulo: 'Alterar valor' },
      { id: 'nao_tenho_mais', titulo: 'Não tenho mais' },
    ],
    'Conta fixa'
  );
}

// Resolve clique nos botões (já paguei / alterar valor / não tenho mais).
// Retorna: null (sem pendência pra esse usuário, segue o fluxo normal),
// JA_ENVIADO (tratou e já mandou tudo), ou uma string (texto pro server.js mandar).
async function tentarResolverResposta(usuario, texto) {
  const { rows } = await db.query(
    `SELECT * FROM contas_fixas_pendentes
     WHERE usuario_id = $1 AND status = 'aguardando_resposta'
     ORDER BY criado_em DESC LIMIT 1`,
    [usuario.id]
  );
  if (rows.length === 0) return null;
  const pendencia = rows[0];
  const t = texto.trim().toLowerCase();

  if (/^(j[aá] paguei|paguei|pago)/.test(t)) {
    const numero = await inserirTransacao(usuario, {
      tipo: 'despesa',
      valor: pendencia.valor_sugerido,
      categoria: pendencia.categoria,
      formaPagamento: pendencia.forma_pagamento,
      descricao: pendencia.descricao,
    });
    await marcarConcluida(pendencia);
    const confirmacao = await montarConfirmacao(usuario, {
      numero,
      tipo: 'despesa',
      valor: pendencia.valor_sugerido,
      categoria: pendencia.categoria,
      formaPagamento: pendencia.forma_pagamento,
      criada: false,
    });
    await notificar(usuario, `✅ Beleza!\n${confirmacao}`, 'Conta fixa paga');
    await avancarFila(usuario); // manda o próximo da fila (ou "tudo em dia"), depois da confirmação
    return JA_ENVIADO;
  }

  if (/alterar/.test(t)) {
    await db.query(`UPDATE contas_fixas_pendentes SET status='aguardando_novo_valor' WHERE id=$1`, [pendencia.id]);
    return `Quanto você pagou de *${pendencia.descricao}* dessa vez?`;
  }

  if (/(n[aã]o tenho mais|nao tenho|cancela)/.test(t)) {
    await db.query(`UPDATE contas_fixas SET ativa=false WHERE id=$1`, [pendencia.conta_fixa_id]);
    await db.query(`UPDATE contas_fixas_pendentes SET status='concluido' WHERE id=$1`, [pendencia.id]);
    await notificar(usuario, `👍 Beleza, removi *${pendencia.descricao}* das contas fixas.`, 'Conta fixa removida');
    await avancarFila(usuario);
    return JA_ENVIADO;
  }

  return null;
}

// Resolve a resposta com o novo valor (número em texto livre)
async function tentarResolverNovoValor(usuario, texto) {
  const { rows } = await db.query(
    `SELECT * FROM contas_fixas_pendentes
     WHERE usuario_id = $1 AND status = 'aguardando_novo_valor'
     ORDER BY criado_em DESC LIMIT 1`,
    [usuario.id]
  );
  if (rows.length === 0) return null;
  const pendencia = rows[0];

  const match = texto.replace(',', '.').match(/(\d+(\.\d+)?)/);
  if (!match) {
    return 'Não entendi o valor. Pode mandar só o número, tipo "65.90"?';
  }
  const novoValor = Number(match[1]);

  const numero = await inserirTransacao(usuario, {
    tipo: 'despesa',
    valor: novoValor,
    categoria: pendencia.categoria,
    formaPagamento: pendencia.forma_pagamento,
    descricao: pendencia.descricao,
  });

  await db.query(`UPDATE contas_fixas SET ultimo_valor=$1, ultimo_mes_processado=$2 WHERE id=$3`, [
    novoValor,
    primeiroDiaDoMes(),
    pendencia.conta_fixa_id,
  ]);
  await marcarConcluida(pendencia);

  const confirmacao = await montarConfirmacao(usuario, {
    numero,
    tipo: 'despesa',
    valor: novoValor,
    categoria: pendencia.categoria,
    formaPagamento: pendencia.forma_pagamento,
    criada: false,
  });

  await notificar(usuario, `✅ Beleza!\n${confirmacao}`, 'Conta fixa paga');
  await avancarFila(usuario);
  return JA_ENVIADO;
}

async function marcarConcluida(pendencia) {
  await db.query(`UPDATE contas_fixas_pendentes SET status='concluido' WHERE id=$1`, [pendencia.id]);
  await db.query(`UPDATE contas_fixas SET ultimo_mes_processado=$1 WHERE id=$2`, [primeiroDiaDoMes(), pendencia.conta_fixa_id]);
}

module.exports = { cadastrarContaFixa, avancarFila, tentarResolverResposta, tentarResolverNovoValor, JA_ENVIADO };
