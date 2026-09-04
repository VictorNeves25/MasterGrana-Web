const ExcelJS = require('exceljs');
const db = require('../db');
const { limitesMesAtual, limitesPeriodo, NOMES_MESES } = require('./consultas');
const { enviarDocumento } = require('../whatsapp');

async function gerarExcelBuffer(familiaId, inicio, fim) {
  const { rows } = await db.query(
    `SELECT numero, data, tipo, categoria, forma_pagamento, quem_gastou, valor, descricao
     FROM transacoes WHERE familia_id=$1 AND data >= $2 AND data < $3
     ORDER BY data, numero`,
    [familiaId, inicio, fim]
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Lançamentos');

  sheet.columns = [
    { header: 'Número', key: 'numero', width: 10 },
    { header: 'Data', key: 'data', width: 12 },
    { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Categoria', key: 'categoria', width: 18 },
    { header: 'Forma de Pagamento', key: 'forma_pagamento', width: 18 },
    { header: 'Quem Gastou', key: 'quem_gastou', width: 14 },
    { header: 'Valor', key: 'valor', width: 12 },
    { header: 'Descrição', key: 'descricao', width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  rows.forEach((r) => {
    sheet.addRow({
      numero: r.numero,
      data: new Date(r.data).toLocaleDateString('pt-BR'),
      tipo: r.tipo === 'receita' ? 'Receita' : 'Despesa',
      categoria: r.categoria,
      forma_pagamento: r.forma_pagamento,
      quem_gastou: r.quem_gastou || '',
      valor: Number(r.valor),
      descricao: r.descricao || '',
    });
  });

  sheet.getColumn('valor').numFmt = '"R$" #,##0.00';

  // linha de total no final
  const totalReceita = rows.filter((r) => r.tipo === 'receita').reduce((s, r) => s + Number(r.valor), 0);
  const totalDespesa = rows.filter((r) => r.tipo === 'despesa').reduce((s, r) => s + Number(r.valor), 0);
  sheet.addRow({});
  const linhaReceita = sheet.addRow({ categoria: 'Total Receitas', valor: totalReceita });
  const linhaDespesa = sheet.addRow({ categoria: 'Total Despesas', valor: totalDespesa });
  linhaReceita.font = { bold: true };
  linhaDespesa.font = { bold: true };

  return workbook.xlsx.writeBuffer();
}

function definirPeriodo(dados) {
  if (dados.mes) {
    const ano = dados.ano || new Date().getFullYear();
    const inicio = new Date(ano, dados.mes - 1, 1);
    const fim = new Date(ano, dados.mes, 1);
    return { inicio, fim, rotulo: `${NOMES_MESES[dados.mes - 1]}-${ano}`.toLowerCase() };
  }
  if (dados.dias) {
    const { inicio, fim } = limitesPeriodo(dados.dias);
    return { inicio, fim, rotulo: `ultimos-${dados.dias}-dias` };
  }
  const { inicio, fim } = limitesMesAtual();
  return { inicio, fim, rotulo: `${NOMES_MESES[inicio.getMonth()]}-${inicio.getFullYear()}`.toLowerCase() };
}

async function exportarExcel(usuario, dados) {
  const { inicio, fim, rotulo } = definirPeriodo(dados);
  const buffer = await gerarExcelBuffer(usuario.familia_id, inicio, fim);
  const nomeArquivo = `lancamentos-${rotulo}.xlsx`;

  await enviarDocumento(usuario.telefone, buffer, nomeArquivo, `📄 Aqui está sua planilha (${rotulo.replace(/-/g, ' ')})`);
  return null; // já enviado direto como arquivo
}

// Versão que só gera o arquivo, sem mandar por WhatsApp — usada pela API web,
// que entrega o arquivo como download HTTP direto.
async function gerarArquivoExcel(usuario, dados) {
  const { inicio, fim, rotulo } = definirPeriodo(dados);
  const buffer = await gerarExcelBuffer(usuario.familia_id, inicio, fim);
  return { buffer, nomeArquivo: `lancamentos-${rotulo}.xlsx` };
}

module.exports = { exportarExcel, gerarArquivoExcel };
