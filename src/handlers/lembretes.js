const db = require('../db');
const { garantirCategoria } = require('./categorias');
const { normalizarFormaPagamento } = require('./formaPagamento');

const NOMES_MODO = {
  avisar: 'só vou te avisar no dia, você lança manualmente',
  lancar_automatico: 'vou lançar a despesa automaticamente no dia, sem perguntar',
  perguntar: 'vou te perguntar no dia e, se não responder em 30 minutos, lanço sozinho',
};

async function criarLembrete(usuario, dados) {
  const { descricao, dia_do_mes } = dados;
  let modo = dados.modo || 'avisar';
  let categoria = null;
  let valor = dados.valor != null ? Number(dados.valor) : null;
  const formaPagamento = dados.forma_pagamento ? normalizarFormaPagamento(dados.forma_pagamento) : 'Não informado';

  if (dados.categoria) {
    const resultado = await garantirCategoria(usuario.familia_id, dados.categoria);
    categoria = resultado.nome;
  }

  // lançar automático/perguntar exigem valor e categoria; sem isso, cai pra "avisar"
  if (modo !== 'avisar' && (valor == null || !categoria)) {
    modo = 'avisar';
  }

  await db.query(
    `INSERT INTO lembretes (familia_id, usuario_id, descricao, categoria, forma_pagamento, valor, dia_do_mes, modo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [usuario.familia_id, usuario.id, descricao, categoria, formaPagamento, valor, dia_do_mes, modo]
  );

  return `⏰ Lembrete criado: *${descricao}*, todo dia ${dia_do_mes}.\nModo: ${NOMES_MODO[modo]}.`;
}

module.exports = { criarLembrete };
