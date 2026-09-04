const db = require('../db');
const { gastosPorCategoria, totalPorTipo, limitesMesAtual, limitesPeriodo, NOMES_MESES } = require('./consultas');

const CORES = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
];

function urlGrafico(config) {
  const base = `https://quickchart.io/chart?backgroundColor=white&width=600&height=400&c=`;
  return base + encodeURIComponent(JSON.stringify(config));
}

// Agrupa categorias além das top N num "Outros", pra manter a URL curta e o gráfico legível
function limitarFatias(dados, max = 8) {
  if (dados.length <= max) return dados;
  const top = dados.slice(0, max - 1);
  const outros = dados.slice(max - 1).reduce((s, d) => s + d.total, 0);
  return [...top, { categoria: 'Outros', total: outros }];
}

async function graficoCategoria(familiaId, dias) {
  const { inicio, fim } = dias ? limitesPeriodo(dias) : limitesMesAtual();
  const dadosBrutos = await gastosPorCategoria(familiaId, inicio, fim);
  if (dadosBrutos.length === 0) return null;

  const dados = limitarFatias(dadosBrutos);
  const rotuloPeriodo = dias ? `últimos ${dias} dias` : 'mês atual';

  const config = {
    type: 'pie',
    data: {
      labels: dados.map((d) => d.categoria),
      datasets: [{ data: dados.map((d) => d.total), backgroundColor: CORES }],
    },
    options: {
      plugins: {
        title: { display: true, text: `Gastos por categoria (${rotuloPeriodo})`, font: { size: 16 } },
        legend: { position: 'right' },
      },
    },
  };

  return { url: urlGrafico(config), legenda: `📊 Gastos por categoria — ${rotuloPeriodo}` };
}

async function graficoPorPessoa(familiaId, dias) {
  const { inicio, fim } = dias ? limitesPeriodo(dias) : limitesMesAtual();
  const { rows } = await db.query(
    `SELECT COALESCE(quem_gastou, 'Não informado') AS quem, COALESCE(SUM(valor),0) AS total
     FROM transacoes WHERE familia_id=$1 AND tipo='despesa' AND data >= $2 AND data < $3
     GROUP BY quem ORDER BY total DESC`,
    [familiaId, inicio, fim]
  );
  if (rows.length === 0) return null;

  const rotuloPeriodo = dias ? `últimos ${dias} dias` : 'mês atual';

  const config = {
    type: 'pie',
    data: {
      labels: rows.map((r) => r.quem),
      datasets: [{ data: rows.map((r) => Number(r.total)), backgroundColor: CORES }],
    },
    options: {
      plugins: {
        title: { display: true, text: `Gasto por pessoa (${rotuloPeriodo})`, font: { size: 16 } },
        legend: { position: 'right' },
      },
    },
  };

  return { url: urlGrafico(config), legenda: `📊 Gasto por pessoa — ${rotuloPeriodo}` };
}

async function graficoComparativoMeses(familiaId, meses = 3) {
  const atual = limitesMesAtual();
  const labels = [];
  const valores = [];

  for (let i = meses; i >= 0; i--) {
    const inicio = new Date(atual.inicio.getFullYear(), atual.inicio.getMonth() - i, 1);
    const fim = new Date(atual.inicio.getFullYear(), atual.inicio.getMonth() - i + 1, 1);
    const total = await totalPorTipo(familiaId, inicio, fim, 'despesa');
    labels.push(`${NOMES_MESES[inicio.getMonth()].slice(0, 3)}/${inicio.getFullYear()}`);
    valores.push(total);
  }

  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Gastos', data: valores, backgroundColor: '#4E79A7' }],
    },
    options: {
      plugins: {
        title: { display: true, text: `Comparativo dos últimos ${meses + 1} meses`, font: { size: 16 } },
        legend: { display: false },
      },
    },
  };

  return { url: urlGrafico(config), legenda: `📊 Comparativo dos últimos ${meses + 1} meses` };
}

async function gerarGrafico(familiaId, dados) {
  const tipo = dados.tipo_grafico || 'categoria';
  switch (tipo) {
    case 'pessoa':
      return graficoPorPessoa(familiaId, dados.dias);
    case 'comparativo_meses':
      return graficoComparativoMeses(familiaId, dados.quantidade || 3);
    case 'categoria':
    default:
      return graficoCategoria(familiaId, dados.dias);
  }
}

module.exports = { gerarGrafico };
