const db = require('../db');
const { garantirCategoria } = require('./categorias');
const { inserirTransacao, montarConfirmacao } = require('./registrar');
const { normalizarFormaPagamento } = require('./formaPagamento');

async function registrarParcelamento(usuario, dados) {
  const { descricao, numero_parcelas } = dados;
  const { nome: categoria, criada } = await garantirCategoria(usuario.familia_id, dados.categoria);
  const formaPagamento = normalizarFormaPagamento(dados.forma_pagamento || 'crédito');

  const valorTotal = Number(dados.valor_total);
  const valorParcela = Math.round((valorTotal / numero_parcelas) * 100) / 100;
  const diaVencimento = dados.dia_vencimento || new Date().getDate();
  const mesAtual = new Date();
  mesAtual.setDate(1);

  const { rows } = await db.query(
    `INSERT INTO parcelamentos
       (familia_id, usuario_id, descricao, categoria, forma_pagamento, valor_parcela, numero_parcelas,
        parcelas_lancadas, dia_vencimento, ultimo_mes_processado, ativo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,$9,true)
     RETURNING id`,
    [
      usuario.familia_id,
      usuario.id,
      descricao,
      categoria,
      formaPagamento,
      valorParcela,
      numero_parcelas,
      diaVencimento,
      mesAtual,
    ]
  );

  // já lança a primeira parcela na hora da compra
  const quemGastou = dados.casal ? 'Casal' : (usuario.nome || 'Não informado');
  const numero = await inserirTransacao(usuario, {
    tipo: 'despesa',
    valor: valorParcela,
    categoria,
    formaPagamento,
    quemGastou,
    descricao: `${descricao} (parcela 1/${numero_parcelas})`,
  });

  const confirmacao = await montarConfirmacao(usuario, {
    numero,
    tipo: 'despesa',
    valor: valorParcela,
    categoria,
    formaPagamento,
    quemGastou,
    criada,
  });

  if (numero_parcelas > 1) {
    return (
      `🧾 Compra parcelada registrada: ${descricao} em ${numero_parcelas}x de R$ ${valorParcela.toFixed(2)}\n` +
      `As próximas parcelas caem todo dia ${diaVencimento}, e eu aviso quando chegar a hora.\n\n${confirmacao}`
    );
  }
  return confirmacao;
}

module.exports = { registrarParcelamento };
