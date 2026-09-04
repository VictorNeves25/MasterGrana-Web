# Finanças via WhatsApp

Controle financeiro pessoal/familiar por mensagens no WhatsApp, com IA interpretando o texto livre.

## O que já está pronto
- **Onboarding**: primeira mensagem de cada número pergunta o nome/apelido antes de qualquer outra coisa, pra usar na atribuição de gastos
- Registro de receitas e despesas por mensagem natural, com forma de pagamento (dinheiro, débito, crédito, pix, boleto, transferência)
- **Atribuição por pessoa**: todo gasto é automaticamente atribuído a quem mandou a mensagem; se disser "casal" (ou "nós dois"/"juntos"), conta como gasto conjunto — dá pra corrigir depois também
- 23 categorias padrão já cadastradas (Mercado, Viagem, Farmácia, Casa, Pet, Combustível, Lazer, Saúde, Salário, Contas Fixas, Investimento, etc.) e novas categorias podem ser criadas a qualquer momento — automaticamente (quando a IA não acha nenhuma parecida) ou explicitamente ("criar categoria Academia")
- Consultas: saldo do mês, gasto por categoria, maior gasto, comparativo com mês passado, com um mês específico ("compara com o mês 5") ou com uma faixa de meses ("compara com os últimos 3 meses"), **comparar uma categoria entre dois períodos à escolha** ("compara meu gasto com lazer em maio e agosto", "mercado nos últimos 30 dias vs os 30 dias anteriores"), "quanto ainda posso gastar", resumo geral, período flexível ("quanto gastei semana passada", "últimos 70 dias"), top maiores gastos, projeção de gastos futuros, e gasto por pessoa ("quem gastou mais")
- **Gráficos**: "gráfico dos meus gastos por categoria", "gráfico de quem gastou mais", "gráfico comparando os últimos meses" — o bot gera e manda a imagem do gráfico direto no WhatsApp (via QuickChart, sem precisar de nenhuma ferramenta externa)
- **Alerta automático de estouro de meta**: sempre que um gasto ultrapassa o limite definido pra categoria (baseado nas metas em %), o bot já avisa na própria confirmação do lançamento
- **Resumos automáticos, sem precisar pedir**: toda segunda-feira de manhã, resumo da semana passada; todo dia 1º, fechamento completo do mês anterior
- **Busca de lançamentos**: "gastos com Uber", "busca meus lançamentos de farmácia"
- **Exportar em Excel**: "manda em excel", "quero uma planilha desse mês", "planilha dos últimos 60 dias" — o bot gera o arquivo .xlsx de verdade e manda como documento no WhatsApp
- Metas de orçamento por % da renda (ex: "30% lazer, 40% contas fixas, 30% investimento")
- Cada lançamento recebe um número sequencial por família (ex: 00001, 00002...), mostrado na confirmação
- Correção de lançamentos: dentro de 15 minutos, basta dizer o que está errado ("errado, era 60"); depois disso (ou pra qualquer lançamento antigo), basta citar o número ("corrige o lançamento 00007 pra R$45")
- Também dá pra apagar um lançamento errado citando o número ("apaga o lançamento 00012")
- **Compras parceladas**: "comprei uma TV parcelada em 10x de 200" já lança a 1ª parcela na hora; as seguintes caem automaticamente todo mês, com aviso e confirmação
- **Lembretes recorrentes mensais**: "me lembra de pagar o aluguel dia 15" — você escolhe se quer só ser avisado, se lança automático, ou se pergunta antes (com 30min pra responder e lançamento automático se não responder)
- **Lembretes pontuais** (uma vez só, por tempo relativo ou horário): "me lembra de fazer um pix de 50 pro Antonio daqui 3 horas" — se você não disser o modo, o bot pergunta na hora da criação; e no modo "perguntar", se você disser "ainda não" quando chegar a hora, ele te pergunta de novo 30 minutos depois
- **Botões interativos**: toda vez que o bot precisa que você escolha entre opções (confirmar parcela, escolher modo de lembrete, "já fez?"), aparece como caixinha clicável no WhatsApp — toca no botão e já envia a resposta, sem precisar digitar
- **Quitar parcelamento**: na pergunta de cada parcela, além de Sim/Cancela tem um terceiro botão "Quitei" — se você adiantou todas as parcelas restantes de uma vez, ele lança o valor total restante numa tacada só e encerra o parcelamento
- **Contas fixas** (água, luz, internet...): cadastre uma vez (`"cadastrar conta fixa de água"`). Todo dia 1º do mês, o bot pergunta qual é o 5º dia útil daquele mês (assim já considera feriados locais, sem precisar de calendário embutido) — se ninguém responder, ele usa um cálculo automático de reserva. No dia combinado, lembra sozinho com o último valor pago sugerido, e três botões: Já paguei / Alterar valor / Não tenho mais. Também dá pra adiantar a qualquer momento mandando `"pagar contas"` — ele vai listando uma de cada vez até você resolver todas
- Vínculo de dois números numa mesma conta família, com código de confirmação (expira em 1:30) — **sem limite de quantas pessoas podem se vincular**

## Passo a passo pra colocar no ar

### 1. Banco de dados (Supabase)
1. Crie uma conta grátis em https://supabase.com e um novo projeto
2. Vá em SQL Editor → cole o conteúdo de `schema.sql` → Run
3. Em Project Settings → Database, copie a "Connection string" (modo `URI`) → isso é o seu `DATABASE_URL`

### 2. WhatsApp Cloud API (Meta)
1. Crie uma conta em https://developers.facebook.com e um app do tipo "Business"
2. Adicione o produto "WhatsApp" ao app
3. Em WhatsApp → API Setup, você já ganha um número de teste — pegue o `Temporary access token` e o `Phone number ID`
4. Pra uso permanente, será necessário: verificar seu Business Manager e gerar um token permanente (token de sistema)
5. Guarde `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`
6. Invente uma frase qualquer para `WHATSAPP_VERIFY_TOKEN` (você vai usar ela no passo 4)

### 3. Chave da Anthropic
Gere uma chave em https://console.anthropic.com → API Keys → essa é sua `ANTHROPIC_API_KEY`

### 4. Deploy (Railway)
1. Crie conta em https://railway.app, conecte esse repositório (ou faça upload da pasta)
2. Em Variables, adicione todas as variáveis do `.env.example` com os valores reais
3. Railway vai te dar uma URL pública, tipo `https://seu-app.up.railway.app`
4. No painel da Meta, em WhatsApp → Configuration → Webhook, configure:
   - Callback URL: `https://seu-app.up.railway.app/webhook`
   - Verify Token: o mesmo que você colocou em `WHATSAPP_VERIFY_TOKEN`
   - Subscribe no campo `messages`

### 5. Testar
Mande uma mensagem pro número de teste do WhatsApp:
```
Recebi 3000 de salário
Gastei 120 na farmácia
Quanto gastei esse mês?
```

## Vinculando o segundo número (você + esposa)
1. A pessoa nova manda uma mensagem qualquer pro bot (isso cria a conta dela automaticamente, sozinha)
2. Ela então manda: `vincular 55DDDNUMERO` (o número de quem já é "dono" da conta)
3. Quem é dono recebe um código de 6 dígitos no WhatsApp e tem 1 minuto e meio pra responder com o código
4. A partir daí, os dois números compartilham os mesmos dados — qualquer um pode perguntar "quanto gastamos esse mês"

## Roadmap sugerido pra virar produto público
- Painel web de onboarding (hoje o cadastro é 100% via mensagem)
- Múltiplas famílias por conta com plano de assinatura (Stripe)
- Rate limiting / anti-spam no webhook
- Logs estruturados e monitoramento de erros (ex: Sentry)
- Reintroduzir controle de investimentos (removido por enquanto — ver observação abaixo)

## Sobre os gráficos (QuickChart)
Os gráficos são gerados via [QuickChart.io](https://quickchart.io), um serviço público gratuito que transforma uma configuração de gráfico em uma URL de imagem — sem precisar instalar nada nem gerenciar imagens no servidor. Isso é uma dependência externa (fora do seu controle); se um dia quiser trocar por algo auto-hospedado, dá pra substituir só o `src/handlers/graficos.js` sem mexer no resto.

## Sobre remover e trazer investimentos de volta
Investimentos e a integração com Power BI foram removidos por decisão sua. Se quiser reativar o controle de investimentos depois — mesmo com a aplicação já em uso, com dados reais de transações — isso é seguro de fazer a qualquer momento: seria só recriar a tabela `investimentos` (existia antes, ver histórico) e o comando de registro, sem nenhum impacto nas tabelas existentes (`transacoes`, `metas`, etc. continuam intactas). Nenhuma dependência foi criada entre elas.
