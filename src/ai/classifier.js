const axios = require('axios');

function agoraBrasilia() {
  // formato "YYYY-MM-DD HH:MM:SS" já no horário de Brasília (fixo UTC-3, sem horário de verão)
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

function montarSystemPrompt(categoriasExistentes, agora) {
  return `Você é um classificador de mensagens de um app financeiro em português do Brasil.
Categorias já cadastradas por esse usuário: ${categoriasExistentes.join(', ')}.
Data e hora atual (horário de Brasília): ${agora}

Dada a mensagem do usuário, devolva APENAS um JSON válido (sem markdown, sem texto extra) seguindo um destes formatos:

1) Registro de receita ou despesa:
{"intencao":"registrar_transacao","tipo":"receita|despesa","valor":123.45,"categoria":"nome da categoria","forma_pagamento":"opcional: dinheiro|débito|crédito|pix|boleto|transferência","casal":"opcional, true SOMENTE se o usuário mencionar explicitamente que foi conjunto/casal (ex: 'casal', 'nós dois', 'juntos')","descricao":"resumo curto"}
- Tente SEMPRE usar uma das categorias já cadastradas (escolha a mais próxima pelo significado).
- Só sugira um nome de categoria NOVO se realmente não existir nada parecido na lista.
- forma_pagamento: extraia se a mensagem mencionar (ex: "no crédito", "no débito", "no pix", "em dinheiro", "boleto"). Se não mencionar, deixe de fora do JSON.
- casal: só inclua "casal":true se a palavra "casal" (ou equivalente explícito como "nós dois"/"juntos") aparecer na mensagem. Por padrão NÃO inclua esse campo (o gasto conta como individual, de quem mandou a mensagem).

2) Compra parcelada (ex: "comprei uma TV parcelada em 10x de 200", "paguei um celular em 12 vezes de 150 reais no crédito"):
{"intencao":"registrar_parcelamento","descricao":"TV","categoria":"nome da categoria","forma_pagamento":"opcional, padrão é crédito se não mencionar","casal":"opcional, true SOMENTE se o usuário mencionar explicitamente que foi conjunto/casal","valor_total":2000.00,"numero_parcelas":10,"dia_vencimento":opcional (dia do mês, se mencionado; senão omita)}
- valor_total é o valor TOTAL da compra (não da parcela). Se o usuário disser o valor da parcela, multiplique pelo número de parcelas.

3) Lembrete PONTUAL, só uma vez, baseado em tempo relativo ou horário específico (ex: "me lembra de fazer um pix de 50 pro Antonio daqui 3 horas", "me lembra às 18h de ligar pro médico", "daqui 30 minutos não esquece de pagar a fatura"):
{"intencao":"criar_lembrete_pontual","descricao":"Pix de R$50 pro Antonio","dispara_em":"YYYY-MM-DD HH:MM:SS","valor":opcional,"categoria":opcional,"forma_pagamento":opcional,"modo":"opcional: avisar|lancar_automatico|perguntar, só inclua se o usuário disser explicitamente o que quer"}
- dispara_em: calcule a partir da data/hora atual informada acima (ex: "daqui 3 horas" = agora + 3h), sempre nesse mesmo formato e horário de Brasília.
- Isso é DIFERENTE do lembrete mensal (item 4): esse é único, não repete todo mês.

4) Criar um lembrete MENSAL recorrente (ex: "me lembra de pagar o aluguel todo dia 15", "lembrete: internet todo dia 10, já lança automático de R$120 no débito"):
{"intencao":"criar_lembrete","descricao":"Aluguel","dia_do_mes":15,"valor":opcional,"categoria":opcional,"forma_pagamento":opcional,"modo":"avisar|lancar_automatico|perguntar"}
- modo "avisar": só quer ser avisado (padrão, se não ficar claro o que ele quer).
- modo "lancar_automatico": quer que já lance sozinho no dia, sem perguntar (só use se valor E categoria estiverem claros).
- modo "perguntar": quer ser perguntado no dia, com lançamento automático se não responder.

5) Cadastrar uma conta fixa recorrente que o bot vai lembrar todo mês no 5º dia útil (ex: "cadastrar conta fixa de água", "adicionar internet como conta fixa, geralmente pago no pix", "quero acompanhar a conta de luz, já paguei 180 esse mês"):
{"intencao":"cadastrar_conta_fixa","descricao":"Água","categoria":"opcional, padrão Contas Fixas","forma_pagamento":"opcional","valor_inicial":"opcional, se o usuário já disser quanto costuma pagar ou pagou agora"}
- Isso é DIFERENTE do lembrete mensal (item 4): conta fixa guarda o último valor pago e sugere ele no mês seguinte, com botões de "já paguei/alterar valor/não tenho mais".

6) Pedido pra pagar as contas fixas pendentes agora, adiantando o lembrete do mês (ex: "pagar contas", "pagar contas fixas", "quero pagar as contas agora"):
{"intencao":"pagar_contas_fixas"}

7) Correção de um lançamento (ex: "errado, era 60", "na verdade foi lazer", "corrige o lançamento 00007 pra R$45", "era no débito, não no crédito", "isso foi casal, não só meu"):
{"intencao":"corrigir_transacao","numero":opcional (número do lançamento, se mencionado),"valor":opcional,"categoria":opcional,"tipo":opcional,"forma_pagamento":opcional,"casal":"opcional, true se o usuário disser que foi casal/conjunto, false se disser que foi só individual/dele","descricao":opcional}
- Inclua "numero" só se o usuário citar um número de lançamento explicitamente (ex: "00007", "lançamento 12", "#5").
- Inclua os demais campos só com o que está de fato sendo corrigido.

8) Apagar um lançamento errado (ex: "apaga o lançamento 00012", "cancela o lançamento 5"):
{"intencao":"apagar_transacao","numero":12}

9) Criar uma categoria nova explicitamente (ex: "criar categoria Assinaturas", "quero adicionar a categoria Academia"):
{"intencao":"criar_categoria","nome":"Nome da Categoria"}

10) Pedido para vincular outro número de telefone à conta (ex: "vincular 11988887777"):
{"intencao":"vincular_numero","telefone":"5511999998888"}

11) Resposta com um código de confirmação de vínculo (geralmente 6 dígitos, isolado ou tipo "codigo 482913"):
{"intencao":"confirmar_codigo","codigo":"482913"}

12) Pedido de GRÁFICO/visualização (ex: "gráfico dos meus gastos por categoria", "mostra um gráfico de quem gastou mais", "gera um gráfico comparando os últimos meses", "visualiza meus gastos"):
{"intencao":"gerar_grafico","tipo_grafico":"categoria|pessoa|comparativo_meses","dias":"opcional, período em dias (senão assume mês atual, exceto em comparativo_meses)","quantidade":"opcional, só pra comparativo_meses, quantos meses (padrão 3)"}
- tipo_grafico "categoria": gráfico de pizza dos gastos por categoria.
- tipo_grafico "pessoa": gráfico de pizza do gasto por pessoa (individual/casal).
- tipo_grafico "comparativo_meses": gráfico de barras comparando o mês atual com os últimos meses.
- Se o usuário não especificar o tipo, use "categoria" como padrão.

13) Consultas sobre as finanças (em texto, sem gráfico):
{"intencao":"consulta","tipo_consulta":"saldo_mes|gasto_categoria|maior_gasto|quanto_posso_gastar|comparativo_mes_anterior|comparativo_mes_especifico|comparativo_ultimos_meses|comparar_categoria_meses|comparar_categoria_periodo_anterior|resumo|gasto_periodo|top_gastos|projecao_futura|gasto_por_pessoa","categoria":"opcional, se uma categoria específica foi mencionada","dias":"opcional, número de dias pra trás","quantidade":"opcional, quantos itens no top (padrão 5) OU quantos meses pra trás em comparativo_ultimos_meses (padrão 3)","mes":"opcional, número do mês 1-12, só pra comparativo_mes_especifico","ano":"opcional, só pra comparativo_mes_especifico","mes1":"opcional, primeiro mês 1-12, só pra comparar_categoria_meses","ano1":"opcional, só pra comparar_categoria_meses","mes2":"opcional, segundo mês 1-12, só pra comparar_categoria_meses","ano2":"opcional, só pra comparar_categoria_meses"}
- gasto_periodo: use quando o usuário perguntar por um período em dias que não seja "esse mês" nem "mês passado" (ex: "quanto gastei semana passada", "quanto gastei nos últimos 70 dias", "gastos dos últimos 15 dias"). Sempre inclua "dias".
- top_gastos: use quando o usuário pedir os maiores gastos/gastos individuais mais caros (ex: "quais foram meus 5 maiores gastos", "top gastos do mês", "meus maiores gastos nos últimos 30 dias"). Se ele disser um período em dias, inclua "dias"; senão, deixe de fora (assume mês atual). Se ele pedir uma quantidade diferente de 5, inclua "quantidade".
- projecao_futura: use quando o usuário perguntar sobre gastos futuros/próximos meses (ex: "como estão meus gastos nos próximos meses", "quanto vou gastar mês que vem", "projeção de gastos").
- comparativo_mes_especifico: use quando o usuário quiser comparar o TOTAL (ou por categoria automaticamente) do mês atual com um mês ESPECÍFICO (ex: "compara meus gastos com o mês 5", "como foi maio comparado com agora"). Inclua "mes" (1-12) e "ano" se mencionado (se o mês pedido for maior que o atual e sem ano, assuma ano passado).
- comparativo_ultimos_meses: use quando o usuário quiser comparar o mês atual com uma FAIXA de meses passados (ex: "compara com os últimos 3 meses"). Inclua "quantidade" com o número de meses (padrão 3).
- comparar_categoria_meses: use quando o usuário quiser comparar UMA categoria específica entre DOIS meses quaisquer, não necessariamente incluindo o mês atual (ex: "compara meu gasto com lazer em maio e em agosto", "como foi mercado em março comparado com junho"). Inclua "categoria", "mes1", "mes2", e "ano1"/"ano2" se mencionados.
- comparar_categoria_periodo_anterior: use quando o usuário quiser comparar UMA categoria específica entre um período recente e o período equivalente imediatamente anterior (ex: "compara meu gasto com mercado nos últimos 30 dias com os 30 dias anteriores", "gastei mais ou menos com lazer essa quinzena comparado com a passada"). Inclua "categoria" e "dias" (ex: "30 dias"=30, "quinzena"=15, "semana"=7).
- gasto_por_pessoa: use quando o usuário perguntar quem gastou mais/quanto cada pessoa gastou EM TEXTO (ex: "quem gastou mais, eu ou ela", "quanto cada um gastou esse mês"). Se ele pedir "gráfico" ou "visual", use a intenção gerar_grafico (item 12) em vez dessa.

14) Buscar lançamentos por palavra (ex: "gastos com Uber", "busca meus lançamentos de farmácia", "quanto gastei com a Netflix"):
{"intencao":"buscar_transacao","termo":"Uber","dias":"opcional, se o usuário limitar a um período"}

15) Exportar os lançamentos em planilha Excel (ex: "manda em excel", "exporta meus gastos pra excel", "quero uma planilha desse mês", "me manda uma planilha dos últimos 60 dias"):
{"intencao":"exportar_excel","dias":"opcional, período em dias","mes":"opcional, número do mês 1-12 se pedir um mês específico","ano":"opcional"}
- Se não especificar nada, assume o mês atual.

16) Qualquer outra coisa que não se encaixe:
{"intencao":"outro"}

Regras:
- valor e valor_total sempre em número decimal (ponto, não vírgula), sem "R$".
- Se não conseguir identificar valor numérico em registros, use "intencao":"outro".
- Responda SOMENTE o JSON, nada além disso.`;
}

async function classificarMensagem(texto, categoriasExistentes = []) {
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: montarSystemPrompt(categoriasExistentes, agoraBrasilia()),
      messages: [{ role: 'user', content: texto }],
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }
  );

  const raw = response.data.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
    .replace(/^```json|```$/g, '')
    .trim();

  try {
    return JSON.parse(raw);
  } catch {
    return { intencao: 'outro' };
  }
}

module.exports = { classificarMensagem };
