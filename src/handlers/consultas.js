const db = require('../db');

function fmt(v) {
  return `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
}

async function totalPorTipo(familiaId, dataInicio, dataFim, tipo) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(valor),0) AS total FROM transacoes
     WHERE familia_id=$1 AND tipo=$2 AND data >= $3 AND data < $4`,
    [familiaId, tipo, dataInicio, dataFim]
  );
  return Number(rows[0].total);
}

async function gastosPorCategoria(familiaId, dataInicio, dataFim) {
  const { rows } = await db.query(
    `SELECT categoria, COALESCE(SUM(valor),0) AS total FROM transacoes
     WHERE familia_id=$1 AND tipo='despesa' AND data >= $2 AND data < $3
     GROUP BY categoria ORDER BY total DESC`,
    [familiaId, dataInicio, dataFim]
  );
  return rows.map((r) => ({ categoria: r.categoria, total: Number(r.total) }));
}

function limitesMesAtual() {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
  return { inicio, fim };
}

function limitesMesAnterior() {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const fim = new Date(agora.getFullYear(), agora.getMonth(), 1);
  return { inicio, fim };
}

async function saldoMes(familiaId) {
  const { inicio, fim } = limitesMesAtual();
  const receita = await totalPorTipo(familiaId, inicio, fim, 'receita');
  const despesa = await totalPorTipo(familiaId, inicio, fim, 'despesa');
  const saldo = receita - despesa;
  return `📊 *Saldo do mês*\nReceitas: ${fmt(receita)}\nGastos: ${fmt(despesa)}\nSaldo: ${saldo >= 0 ? '✅' : '⚠️'} ${fmt(saldo)}`;
}

// Retorna só o número do saldo atual do mês (receitas - despesas), pra usar em confirmações
async function calcularSaldoMes(familiaId) {
  const { inicio, fim } = limitesMesAtual();
  const receita = await totalPorTipo(familiaId, inicio, fim, 'receita');
  const despesa = await totalPorTipo(familiaId, inicio, fim, 'despesa');
  return receita - despesa;
}

async function gastoPorCategoriaMsg(familiaId, categoriaFiltro) {
  const { inicio, fim } = limitesMesAtual();
  const dados = await gastosPorCategoria(familiaId, inicio, fim);

  if (categoriaFiltro) {
    const item = dados.find((d) => d.categoria.toLowerCase() === categoriaFiltro.toLowerCase());
    return `💸 Você gastou ${fmt(item ? item.total : 0)} com *${categoriaFiltro}* esse mês.`;
  }

  if (dados.length === 0) return '📊 Nenhum gasto registrado esse mês ainda.';

  const linhas = dados.map((d) => `• ${d.categoria}: ${fmt(d.total)}`).join('\n');
  const total = dados.reduce((s, d) => s + d.total, 0);
  return `📊 *Gastos por categoria (mês atual)*\n${linhas}\n\n*Total: ${fmt(total)}*`;
}

async function maiorGastoMsg(familiaId) {
  const { inicio, fim } = limitesMesAtual();
  const dados = await gastosPorCategoria(familiaId, inicio, fim);
  if (dados.length === 0) return 'Ainda não há gastos registrados esse mês.';
  const top = dados[0];
  return `🔎 Sua maior categoria de gasto esse mês é *${top.categoria}*, com ${fmt(top.total)}.`;
}

async function comparativoMesAnteriorMsg(familiaId) {
  const atual = limitesMesAtual();
  const anterior = limitesMesAnterior();

  const gastoAtual = await totalPorTipo(familiaId, atual.inicio, atual.fim, 'despesa');
  const gastoAnterior = await totalPorTipo(familiaId, anterior.inicio, anterior.fim, 'despesa');

  const diff = gastoAtual - gastoAnterior;
  const pct = gastoAnterior > 0 ? ((diff / gastoAnterior) * 100).toFixed(1) : 'N/A';
  const seta = diff > 0 ? '📈 mais' : diff < 0 ? '📉 menos' : '➡️ igual';

  return `📅 *Comparativo com o mês passado*\nMês passado: ${fmt(gastoAnterior)}\nEsse mês (até agora): ${fmt(
    gastoAtual
  )}\nVocê está gastando ${seta}${diff !== 0 ? ` (${pct}%)` : ''}.`;
}

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Compara o mês atual com qualquer outro mês específico (ex: "compara com maio", "vs mês 5")
async function comparativoMesEspecificoMsg(familiaId, mes, ano) {
  const mesIndex = mes - 1; // 1-12 -> 0-11
  const inicioAlvo = new Date(ano, mesIndex, 1);
  const fimAlvo = new Date(ano, mesIndex + 1, 1);

  const atual = limitesMesAtual();
  const gastoAtual = await totalPorTipo(familiaId, atual.inicio, atual.fim, 'despesa');
  const gastoAlvo = await totalPorTipo(familiaId, inicioAlvo, fimAlvo, 'despesa');

  const nomeMesAlvo = `${NOMES_MESES[mesIndex]}/${ano}`;
  const nomeMesAtual = `${NOMES_MESES[atual.inicio.getMonth()]}/${atual.inicio.getFullYear()}`;

  if (gastoAlvo === 0) {
    return `Não encontrei nenhum gasto registrado em ${nomeMesAlvo}.`;
  }

  const diff = gastoAtual - gastoAlvo;
  const pct = ((diff / gastoAlvo) * 100).toFixed(1);
  const seta = diff > 0 ? '📈 mais' : diff < 0 ? '📉 menos' : '➡️ igual';

  // diferença por categoria, pra dar mais contexto
  const catsAlvo = await gastosPorCategoria(familiaId, inicioAlvo, fimAlvo);
  const catsAtual = await gastosPorCategoria(familiaId, atual.inicio, atual.fim);
  const todasCategorias = [...new Set([...catsAlvo.map((c) => c.categoria), ...catsAtual.map((c) => c.categoria)])];

  const linhasCategoria = todasCategorias
    .map((cat) => {
      const valorAlvo = catsAlvo.find((c) => c.categoria === cat)?.total || 0;
      const valorAtual = catsAtual.find((c) => c.categoria === cat)?.total || 0;
      const diffCat = valorAtual - valorAlvo;
      if (diffCat === 0) return null;
      const setaCat = diffCat > 0 ? '📈' : '📉';
      return `• ${cat}: ${fmt(valorAlvo)} → ${fmt(valorAtual)} (${setaCat} ${fmt(Math.abs(diffCat))})`;
    })
    .filter(Boolean)
    .join('\n');

  return (
    `📅 *${nomeMesAtual} vs ${nomeMesAlvo}*\n${nomeMesAlvo}: ${fmt(gastoAlvo)}\n${nomeMesAtual} (até agora): ${fmt(
      gastoAtual
    )}\nVocê está gastando ${seta} (${Math.abs(pct)}%)\n${linhasCategoria ? `\nPor categoria:\n${linhasCategoria}` : ''}`
  );
}

// Total gasto de UMA categoria específica num intervalo de datas qualquer
async function totalCategoriaPeriodo(familiaId, categoria, inicio, fim) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(valor),0) AS total FROM transacoes
     WHERE familia_id=$1 AND tipo='despesa' AND categoria ILIKE $2 AND data >= $3 AND data < $4`,
    [familiaId, categoria, inicio, fim]
  );
  return Number(rows[0].total);
}

function montarComparacao(rotuloA, valorA, rotuloB, valorB, categoria) {
  const diff = valorB - valorA;
  const pct = valorA > 0 ? ((diff / valorA) * 100).toFixed(1) : 'N/A';
  const seta = diff > 0 ? '📈 mais' : diff < 0 ? '📉 menos' : '➡️ igual';

  return (
    `📊 *${categoria}: ${rotuloA} vs ${rotuloB}*\n` +
    `${rotuloA}: ${fmt(valorA)}\n${rotuloB}: ${fmt(valorB)}\n` +
    `${rotuloB} teve ${seta}${diff !== 0 && valorA > 0 ? ` (${Math.abs(pct)}%)` : ''} que ${rotuloA}.`
  );
}

// Compara uma categoria específica entre dois meses quaisquer (ex: "compara lazer de maio com agosto")
async function comparativoCategoriaMesesMsg(familiaId, categoria, mes1, ano1, mes2, ano2) {
  const inicio1 = new Date(ano1, mes1 - 1, 1);
  const fim1 = new Date(ano1, mes1, 1);
  const inicio2 = new Date(ano2, mes2 - 1, 1);
  const fim2 = new Date(ano2, mes2, 1);

  const valor1 = await totalCategoriaPeriodo(familiaId, categoria, inicio1, fim1);
  const valor2 = await totalCategoriaPeriodo(familiaId, categoria, inicio2, fim2);

  const rotulo1 = `${NOMES_MESES[mes1 - 1]}/${ano1}`;
  const rotulo2 = `${NOMES_MESES[mes2 - 1]}/${ano2}`;

  return montarComparacao(rotulo1, valor1, rotulo2, valor2, categoria);
}

// Compara uma categoria entre "os últimos N dias" e "os N dias imediatamente antes desses"
async function comparativoCategoriaPeriodoAnteriorMsg(familiaId, categoria, dias) {
  const fimAtual = new Date();
  const inicioAtual = new Date();
  inicioAtual.setDate(inicioAtual.getDate() - dias);

  const fimAnterior = new Date(inicioAtual);
  const inicioAnterior = new Date(inicioAtual);
  inicioAnterior.setDate(inicioAnterior.getDate() - dias);

  const valorAtual = await totalCategoriaPeriodo(familiaId, categoria, inicioAtual, fimAtual);
  const valorAnterior = await totalCategoriaPeriodo(familiaId, categoria, inicioAnterior, fimAnterior);

  return montarComparacao(`${dias} dias anteriores a esses`, valorAnterior, `últimos ${dias} dias`, valorAtual, categoria);
}

// Compara o mês atual com a média dos últimos N meses (ex: "compara com os últimos 3 meses")
async function comparativoUltimosMesesMsg(familiaId, meses = 3) {
  const atual = limitesMesAtual();
  const gastoAtual = await totalPorTipo(familiaId, atual.inicio, atual.fim, 'despesa');

  const linhasMeses = [];
  let somaAnteriores = 0;

  for (let i = meses; i >= 1; i--) {
    const inicio = new Date(atual.inicio.getFullYear(), atual.inicio.getMonth() - i, 1);
    const fim = new Date(atual.inicio.getFullYear(), atual.inicio.getMonth() - i + 1, 1);
    const total = await totalPorTipo(familiaId, inicio, fim, 'despesa');
    somaAnteriores += total;
    linhasMeses.push(`• ${NOMES_MESES[inicio.getMonth()]}/${inicio.getFullYear()}: ${fmt(total)}`);
  }

  const media = somaAnteriores / meses;
  const diff = gastoAtual - media;
  const pct = media > 0 ? ((diff / media) * 100).toFixed(1) : 'N/A';
  const seta = diff > 0 ? '📈 mais' : diff < 0 ? '📉 menos' : '➡️ igual';
  const nomeMesAtual = `${NOMES_MESES[atual.inicio.getMonth()]}/${atual.inicio.getFullYear()}`;

  return (
    `📅 *Comparativo com os últimos ${meses} meses*\n${linhasMeses.join('\n')}\n` +
    `Média dos últimos ${meses} meses: ${fmt(media)}\n\n` +
    `${nomeMesAtual} (até agora): ${fmt(gastoAtual)}\nVocê está gastando ${seta} que a média${
      diff !== 0 ? ` (${Math.abs(pct)}%)` : ''
    }.`
  );
}

async function quantoPossoGastarMsg(familiaId, categoriaFiltro) {
  const { inicio, fim } = limitesMesAtual();
  const receitaMes = await totalPorTipo(familiaId, inicio, fim, 'receita');

  const { rows: metas } = await db.query(
    `SELECT categoria, percentual FROM metas WHERE familia_id=$1${categoriaFiltro ? ' AND categoria=$2' : ''}`,
    categoriaFiltro ? [familiaId, categoriaFiltro] : [familiaId]
  );

  if (metas.length === 0) {
    return categoriaFiltro
      ? `Você ainda não definiu uma meta pra *${categoriaFiltro}*. Envie algo como "quero gastar 30% com ${categoriaFiltro}".`
      : 'Você ainda não definiu metas de orçamento. Envie algo como "quero gastar 30% com lazer, 40% com contas fixas e 30% com investimento".';
  }

  if (receitaMes === 0) {
    return '⚠️ Ainda não registrei nenhuma receita esse mês, então não dá pra calcular o limite (que é baseado em % da renda).';
  }

  const gastosPorCat = await gastosPorCategoria(familiaId, inicio, fim);
  const linhas = [];
  for (const m of metas) {
    const limite = (receitaMes * Number(m.percentual)) / 100;
    const gasto = gastosPorCat.find((g) => g.categoria === m.categoria)?.total || 0;
    const restante = limite - gasto;
    linhas.push(
      `• ${m.categoria}: limite ${fmt(limite)} (${m.percentual}%) — gasto ${fmt(gasto)} — ${
        restante >= 0 ? `ainda pode gastar ${fmt(restante)}` : `⚠️ passou ${fmt(Math.abs(restante))} do limite`
      }`
    );
  }
  return `🎯 *Quanto você ainda pode gastar (baseado nas metas)*\n${linhas.join('\n')}`;
}

async function resumoMsg(familiaId) {
  const saldo = await saldoMes(familiaId);
  const categorias = await gastoPorCategoriaMsg(familiaId, null);
  return `${saldo}\n\n${categorias}`;
}

// Resumo de um mês FECHADO específico (ex: pro fechamento automático no dia 1º),
// diferente de resumoMsg que sempre olha o mês atual.
async function resumoFechadoMsg(familiaId, ano, mesIndex) {
  const inicio = new Date(ano, mesIndex, 1);
  const fim = new Date(ano, mesIndex + 1, 1);

  const receita = await totalPorTipo(familiaId, inicio, fim, 'receita');
  const despesa = await totalPorTipo(familiaId, inicio, fim, 'despesa');
  const dados = await gastosPorCategoria(familiaId, inicio, fim);

  const linhas = dados.map((d) => `• ${d.categoria}: ${fmt(d.total)}`).join('\n');
  const saldo = receita - despesa;

  return (
    `📊 Receitas: ${fmt(receita)}\nGastos: ${fmt(despesa)}\nSaldo final: ${saldo >= 0 ? '✅' : '⚠️'} ${fmt(saldo)}\n\n` +
    `*Por categoria:*\n${linhas || 'Nenhum gasto registrado.'}`
  );
}

function limitesPeriodo(dias) {
  const fim = new Date();
  fim.setHours(23, 59, 59, 999);
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - dias);
  inicio.setHours(0, 0, 0, 0);
  return { inicio, fim };
}

// "Quanto gastei nos últimos N dias" / "semana passada" (tratado como últimos 7 dias corridos)
async function gastoPeriodoMsg(familiaId, dias, categoriaFiltro) {
  const { inicio, fim } = limitesPeriodo(dias);
  const rotulo = dias === 7 ? 'nos últimos 7 dias' : `nos últimos ${dias} dias`;

  if (categoriaFiltro) {
    const dados = await gastosPorCategoria(familiaId, inicio, fim);
    const item = dados.find((d) => d.categoria.toLowerCase() === categoriaFiltro.toLowerCase());
    return `💸 Você gastou ${fmt(item ? item.total : 0)} com *${categoriaFiltro}* ${rotulo}.`;
  }

  const despesa = await totalPorTipo(familiaId, inicio, fim, 'despesa');
  const dados = await gastosPorCategoria(familiaId, inicio, fim);
  const linhas = dados.map((d) => `• ${d.categoria}: ${fmt(d.total)}`).join('\n');

  return `📊 *Gastos ${rotulo}*\n${linhas || 'Nenhum gasto no período.'}\n\n*Total: ${fmt(despesa)}*`;
}

// Top N maiores gastos individuais (mês atual por padrão, ou período em dias se informado)
async function topGastosMsg(familiaId, dias, quantidade = 5) {
  const { inicio, fim } = dias ? limitesPeriodo(dias) : limitesMesAtual();
  const rotulo = dias ? `nos últimos ${dias} dias` : 'no mês atual';

  const { rows } = await db.query(
    `SELECT numero, categoria, valor, descricao, data FROM transacoes
     WHERE familia_id=$1 AND tipo='despesa' AND data >= $2 AND data < $3
     ORDER BY valor DESC LIMIT $4`,
    [familiaId, inicio, fim, quantidade]
  );

  if (rows.length === 0) return `Nenhum gasto registrado ${rotulo}.`;

  const linhas = rows.map((r, i) => {
    const dataFmt = new Date(r.data).toLocaleDateString('pt-BR');
    const desc = r.descricao ? ` — ${r.descricao}` : '';
    return `${i + 1}. ${fmt(r.valor)} — ${r.categoria}${desc} (${dataFmt})`;
  });

  return `🏆 *Top ${rows.length} maiores gastos ${rotulo}*\n${linhas.join('\n')}`;
}

// Projeção dos próximos 3 meses: soma o que já está agendado (parcelas + contas fixas)
// e mostra a média histórica de gasto por categoria dos últimos 3 meses, como referência.
async function projecaoFuturaMsg(familiaId) {
  const hoje = new Date();
  const nomesMeses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];

  const { rows: parcelamentos } = await db.query(
    `SELECT valor_parcela, numero_parcelas, parcelas_lancadas FROM parcelamentos
     WHERE familia_id=$1 AND ativo=true`,
    [familiaId]
  );
  const { rows: contasFixas } = await db.query(
    `SELECT ultimo_valor FROM contas_fixas WHERE familia_id=$1 AND ativa=true AND ultimo_valor IS NOT NULL`,
    [familiaId]
  );

  const linhasAgendado = [];
  for (let i = 1; i <= 3; i++) {
    const dataMes = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    let totalMes = 0;

    for (const p of parcelamentos) {
      const restantes = p.numero_parcelas - p.parcelas_lancadas;
      if (restantes >= i) totalMes += Number(p.valor_parcela);
    }
    for (const c of contasFixas) {
      totalMes += Number(c.ultimo_valor);
    }

    linhasAgendado.push(`• ${nomesMeses[dataMes.getMonth()]}/${dataMes.getFullYear()}: ${fmt(totalMes)}`);
  }

  // média histórica por categoria dos últimos 3 meses completos (não conta o mês atual, que está incompleto)
  const fimHistorico = limitesMesAtual().inicio;
  const inicioHistorico = new Date(fimHistorico);
  inicioHistorico.setMonth(inicioHistorico.getMonth() - 3);

  const { rows: historico } = await db.query(
    `SELECT categoria, COALESCE(SUM(valor),0) AS total FROM transacoes
     WHERE familia_id=$1 AND tipo='despesa' AND data >= $2 AND data < $3
     GROUP BY categoria ORDER BY total DESC`,
    [familiaId, inicioHistorico, fimHistorico]
  );

  const linhasHistorico = historico
    .filter((h) => Number(h.total) > 0)
    .map((h) => `• ${h.categoria}: ${fmt(Number(h.total) / 3)}/mês`);

  return (
    `📈 *Projeção dos próximos meses*\n\n` +
    `*Compromissos já agendados* (parcelas + contas fixas):\n${linhasAgendado.join('\n')}\n\n` +
    `*Média histórica por categoria* (últimos 3 meses, referência geral):\n${
      linhasHistorico.length ? linhasHistorico.join('\n') : 'Sem histórico suficiente ainda.'
    }\n\n` +
    `⚠️ Isso não inclui gastos novos que ainda não foram lançados nem previstos.`
  );
}

// Quem gastou mais (ex: "quem gastou mais, mili/victor/casal")
async function gastoPorPessoaMsg(familiaId, dias) {
  const { inicio, fim } = dias ? limitesPeriodo(dias) : limitesMesAtual();
  const rotulo = dias ? `nos últimos ${dias} dias` : 'esse mês';

  const { rows } = await db.query(
    `SELECT COALESCE(quem_gastou, 'Não informado') AS quem, COALESCE(SUM(valor),0) AS total
     FROM transacoes
     WHERE familia_id=$1 AND tipo='despesa' AND data >= $2 AND data < $3
     GROUP BY quem ORDER BY total DESC`,
    [familiaId, inicio, fim]
  );

  if (rows.length === 0) return `Nenhum gasto registrado ${rotulo}.`;

  const linhas = rows.map((r) => `• ${r.quem}: ${fmt(Number(r.total))}`).join('\n');
  const maior = rows[0];

  return `👥 *Gasto por pessoa (${rotulo})*\n${linhas}\n\n🏆 Quem mais gastou: *${maior.quem}* com ${fmt(Number(maior.total))}`;
}

// Busca lançamentos por palavra na descrição ou categoria (ex: "gastos com Uber")
async function buscarTransacoesMsg(familiaId, termo, dias) {
  let query = `SELECT numero, tipo, valor, categoria, descricao, data FROM transacoes
     WHERE familia_id=$1 AND (descricao ILIKE $2 OR categoria ILIKE $2)`;
  const params = [familiaId, `%${termo}%`];

  if (dias) {
    const { inicio, fim } = limitesPeriodo(dias);
    query += ` AND data >= $3 AND data < $4`;
    params.push(inicio, fim);
  }
  query += ` ORDER BY data DESC, numero DESC LIMIT 20`;

  const { rows } = await db.query(query, params);
  if (rows.length === 0) return `Não achei nenhum lançamento com "${termo}".`;

  const linhas = rows.map((r) => {
    const dataFmt = new Date(r.data).toLocaleDateString('pt-BR');
    const desc = r.descricao ? ` (${r.descricao})` : '';
    return `• #${String(r.numero).padStart(5, '0')} — ${fmt(r.valor)} — ${r.categoria}${desc} — ${dataFmt}`;
  });

  return `🔍 *Resultados pra "${termo}"*\n${linhas.join('\n')}`;
}

async function processarConsulta(usuario, dados) {
  const { tipo_consulta, categoria, dias, quantidade, mes, ano, mes1, ano1, mes2, ano2 } = dados;
  const anoAtual = new Date().getFullYear();
  switch (tipo_consulta) {
    case 'saldo_mes':
      return saldoMes(usuario.familia_id);
    case 'gasto_categoria':
      return gastoPorCategoriaMsg(usuario.familia_id, categoria);
    case 'maior_gasto':
      return maiorGastoMsg(usuario.familia_id);
    case 'comparativo_mes_anterior':
      return comparativoMesAnteriorMsg(usuario.familia_id);
    case 'comparativo_mes_especifico':
      return comparativoMesEspecificoMsg(usuario.familia_id, mes, ano || anoAtual);
    case 'comparativo_ultimos_meses':
      return comparativoUltimosMesesMsg(usuario.familia_id, quantidade || 3);
    case 'comparar_categoria_meses':
      return comparativoCategoriaMesesMsg(usuario.familia_id, categoria, mes1, ano1 || anoAtual, mes2, ano2 || anoAtual);
    case 'comparar_categoria_periodo_anterior':
      return comparativoCategoriaPeriodoAnteriorMsg(usuario.familia_id, categoria, dias || 30);
    case 'quanto_posso_gastar':
      return quantoPossoGastarMsg(usuario.familia_id, categoria);
    case 'gasto_periodo':
      return gastoPeriodoMsg(usuario.familia_id, dias || 7, categoria);
    case 'top_gastos':
      return topGastosMsg(usuario.familia_id, dias, quantidade || 5);
    case 'projecao_futura':
      return projecaoFuturaMsg(usuario.familia_id);
    case 'gasto_por_pessoa':
      return gastoPorPessoaMsg(usuario.familia_id, dias);
    case 'resumo':
    default:
      return resumoMsg(usuario.familia_id);
  }
}

module.exports = {
  processarConsulta,
  calcularSaldoMes,
  fmt,
  gastosPorCategoria,
  totalPorTipo,
  limitesMesAtual,
  limitesPeriodo,
  NOMES_MESES,
  resumoFechadoMsg,
  gastoPeriodoMsg,
  buscarTransacoesMsg,
};
