const db = require('../db');
const { garantirCategoria } = require('./categorias');
const { calcularSaldoMes, fmt, gastosPorCategoria, totalPorTipo, limitesMesAtual } = require('./consultas');
const { normalizarFormaPagamento } = require('./formaPagamento');

const JANELA_CORRECAO_MIN = 15; // minutos em que a última transação pode ser corrigida sem informar o número

function formatarNumero(n) {
  return String(n).padStart(5, '0');
}

function definirQuemGastou(usuario, casal) {
  if (casal) return 'Casal';
  return usuario.nome || 'Não informado';
}

async function registrarTransacao(usuario, dados) {
  const { tipo, valor, descricao } = dados;
  const { nome: categoria, criada } = await garantirCategoria(usuario.familia_id, dados.categoria);
  const formaPagamento = normalizarFormaPagamento(dados.forma_pagamento);
  const quemGastou = definirQuemGastou(usuario, dados.casal);

  const numero = await inserirTransacao(usuario, { tipo, valor, categoria, descricao, formaPagamento, quemGastou });
  return montarConfirmacao(usuario, { numero, tipo, valor, categoria, formaPagamento, quemGastou, criada });
}

// Insere a linha em transacoes com o número sequencial da família. Reutilizada
// pelo registro manual e pelos lançamentos automáticos de parcela/lembrete.
// Se quemGastou não for informado, usa o nome do usuário que está lançando.
async function inserirTransacao(usuario, { tipo, valor, categoria, descricao, formaPagamento, quemGastou }) {
  const { rows } = await db.query(
    `INSERT INTO transacoes (familia_id, usuario_id, tipo, valor, categoria, forma_pagamento, quem_gastou, descricao, numero)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
       (SELECT COALESCE(MAX(numero), 0) + 1 FROM transacoes WHERE familia_id = $1))
     RETURNING numero`,
    [
      usuario.familia_id,
      usuario.id,
      tipo,
      valor,
      categoria,
      formaPagamento || 'Não informado',
      quemGastou || usuario.nome || 'Não informado',
      descricao || null,
    ]
  );
  return rows[0].numero;
}

// Corrige uma transação: por número (sem limite de tempo) ou, se não informado,
// a última transação lançada por esse usuário dentro da janela de tempo.
async function corrigirTransacao(usuario, dados) {
  let atual;

  if (dados.numero) {
    const { rows } = await db.query(
      `SELECT * FROM transacoes WHERE familia_id = $1 AND numero = $2`,
      [usuario.familia_id, Number(dados.numero)]
    );
    if (rows.length === 0) {
      return `Não encontrei o lançamento *${formatarNumero(dados.numero)}* na sua família. Confere o número?`;
    }
    atual = rows[0];
  } else {
    const { rows } = await db.query(
      `SELECT * FROM transacoes
       WHERE usuario_id = $1
         AND criado_em >= now() - interval '${JANELA_CORRECAO_MIN} minutes'
       ORDER BY criado_em DESC LIMIT 1`,
      [usuario.id]
    );
    if (rows.length === 0) {
      return `Não achei nenhum lançamento seu nos últimos ${JANELA_CORRECAO_MIN} minutos. Se for um lançamento mais antigo, me diga o número dele (ex: "corrige o lançamento 00007").`;
    }
    atual = rows[0];
  }

  const novoTipo = dados.tipo || atual.tipo;
  const novoValor = dados.valor != null ? dados.valor : Number(atual.valor);
  const novaDescricao = dados.descricao !== undefined ? dados.descricao : atual.descricao;
  const novaFormaPagamento = dados.forma_pagamento
    ? normalizarFormaPagamento(dados.forma_pagamento)
    : atual.forma_pagamento;
  const novoQuemGastou = dados.casal !== undefined ? definirQuemGastou(usuario, dados.casal) : atual.quem_gastou;

  let novaCategoria = atual.categoria;
  let categoriaCriada = false;
  if (dados.categoria) {
    const resultado = await garantirCategoria(usuario.familia_id, dados.categoria);
    novaCategoria = resultado.nome;
    categoriaCriada = resultado.criada;
  }

  await db.query(
    `UPDATE transacoes SET tipo=$1, valor=$2, categoria=$3, forma_pagamento=$4, quem_gastou=$5, descricao=$6 WHERE id=$7`,
    [novoTipo, novoValor, novaCategoria, novaFormaPagamento, novoQuemGastou, novaDescricao, atual.id]
  );

  const confirmacao = await montarConfirmacao(usuario, {
    numero: atual.numero,
    tipo: novoTipo,
    valor: novoValor,
    categoria: novaCategoria,
    formaPagamento: novaFormaPagamento,
    quemGastou: novoQuemGastou,
    criada: categoriaCriada,
  });

  return `✏️ Corrigido!\n${confirmacao}`;
}

// Apaga uma transação lançada errada, por número
async function apagarTransacao(usuario, dados) {
  const { rows } = await db.query(
    `DELETE FROM transacoes WHERE familia_id = $1 AND numero = $2 RETURNING *`,
    [usuario.familia_id, Number(dados.numero)]
  );
  if (rows.length === 0) {
    return `Não encontrei o lançamento *${formatarNumero(dados.numero)}* na sua família.`;
  }
  const saldo = await calcularSaldoMes(usuario.familia_id);
  return `🗑️ Lançamento ${formatarNumero(dados.numero)} apagado.\nsaldo: ${fmt(saldo)}`;
}

// Checa se a categoria tem meta definida e se esse gasto já estourou o limite do mês
async function verificarEstouroMeta(usuario, categoria) {
  const { rows } = await db.query(`SELECT percentual FROM metas WHERE familia_id=$1 AND categoria=$2`, [
    usuario.familia_id,
    categoria,
  ]);
  if (rows.length === 0) return null;
  const percentual = Number(rows[0].percentual);

  const { inicio, fim } = limitesMesAtual();
  const receita = await totalPorTipo(usuario.familia_id, inicio, fim, 'receita');
  if (receita === 0) return null; // sem receita registrada ainda, não dá pra calcular o limite

  const limite = (receita * percentual) / 100;
  const dadosCategoria = await gastosPorCategoria(usuario.familia_id, inicio, fim);
  const gastoAtual = dadosCategoria.find((d) => d.categoria === categoria)?.total || 0;

  if (gastoAtual > limite) {
    return `⚠️ Passou do limite de *${categoria}* (${fmt(limite)}, ${percentual}% da renda) — já gastou ${fmt(
      gastoAtual
    )} esse mês.`;
  }
  return null;
}

async function montarConfirmacao(usuario, { numero, tipo, valor, categoria, formaPagamento, quemGastou, criada }) {
  const saldo = await calcularSaldoMes(usuario.familia_id);
  const avisoCategoria = criada ? `\n(categoria *${categoria}* criada agora)` : '';
  const quem = quemGastou || usuario.nome || 'Não informado';

  let avisoMeta = '';
  if (tipo === 'despesa') {
    const alerta = await verificarEstouroMeta(usuario, categoria);
    if (alerta) avisoMeta = `\n\n${alerta}`;
  }

  return (
    `Lançamento: ${formatarNumero(numero)}\n` +
    `${quem}\n` +
    `categoria: ${categoria}\n` +
    `forma de pagamento: ${formaPagamento || 'Não informado'}\n` +
    `${tipo === 'receita' ? 'valor recebido' : 'valor'}: ${fmt(valor)}\n` +
    `saldo: ${fmt(saldo)}` +
    avisoCategoria +
    avisoMeta
  );
}

module.exports = {
  registrarTransacao,
  corrigirTransacao,
  apagarTransacao,
  inserirTransacao,
  montarConfirmacao,
  formatarNumero,
};
