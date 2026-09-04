const MAPA = {
  dinheiro: 'Dinheiro',
  especie: 'Dinheiro',
  débito: 'Débito',
  debito: 'Débito',
  crédito: 'Crédito',
  credito: 'Crédito',
  cartao: 'Crédito',
  cartão: 'Crédito',
  pix: 'Pix',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  transferência: 'Transferência',
  ted: 'Transferência',
  doc: 'Transferência',
};

function normalizarFormaPagamento(texto) {
  if (!texto) return 'Não informado';
  const chave = texto.trim().toLowerCase();
  return MAPA[chave] || (texto.charAt(0).toUpperCase() + texto.slice(1));
}

module.exports = { normalizarFormaPagamento };
