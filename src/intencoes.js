const { registrarTransacao, corrigirTransacao, apagarTransacao } = require('./handlers/registrar');
const { processarConsulta, buscarTransacoesMsg } = require('./handlers/consultas');
const { gerarGrafico } = require('./handlers/graficos');
const { exportarExcel, gerarArquivoExcel } = require('./handlers/exportar');
const { definirMetas } = require('./handlers/metas');
const { solicitarVinculo, confirmarCodigo } = require('./handlers/vinculo');
const { criarCategoria } = require('./handlers/categorias');
const { registrarParcelamento } = require('./handlers/parcelamento');
const { criarLembrete } = require('./handlers/lembretes');
const { criarLembretePontual } = require('./handlers/lembretePontual');
const { cadastrarContaFixa, avancarFila } = require('./handlers/contasFixas');
const { enviarImagemPorLink } = require('./whatsapp');

const MENSAGEM_AJUDA =
  'Não entendi 🤔 Alguns exemplos do que posso fazer:\n' +
  '• "Recebi 3000 de salário"\n' +
  '• "Gastei 120 na farmácia"\n' +
  '• "Comprei uma TV parcelada em 10x de 200"\n' +
  '• "Me lembra de pagar o aluguel dia 15"\n' +
  '• "Cadastrar conta fixa de água"\n' +
  '• "Pagar contas"\n' +
  '• "Quanto gastei esse mês?"\n' +
  '• "Gráfico dos meus gastos por categoria"\n' +
  '• "Gastos com Uber"\n' +
  '• "Manda em excel"\n' +
  '• "Quero gastar 30% com lazer, 40% com contas fixas e 30% com investimento"\n' +
  '• "Criar categoria Academia"\n' +
  '• "Corrige o lançamento 00007 pra R$45"\n' +
  '• "Apaga o lançamento 00012"';

function normalizarTelefone(t) {
  return (t || '').replace(/\D/g, '');
}

// canal: 'whatsapp' | 'web'. Retorna sempre um objeto { tipo, texto?, url?, legenda?, arquivo? }
async function processarIntencao(usuario, dados, canal) {
  switch (dados.intencao) {
    case 'registrar_transacao':
      return { tipo: 'texto', texto: await registrarTransacao(usuario, dados) };

    case 'corrigir_transacao':
      return { tipo: 'texto', texto: await corrigirTransacao(usuario, dados) };

    case 'apagar_transacao':
      return { tipo: 'texto', texto: await apagarTransacao(usuario, dados) };

    case 'gerar_grafico': {
      const grafico = await gerarGrafico(usuario.familia_id, dados);
      if (!grafico) return { tipo: 'texto', texto: 'Não achei dados suficientes ainda pra gerar esse gráfico.' };
      if (canal === 'web') return { tipo: 'grafico', url: grafico.url, legenda: grafico.legenda };
      await enviarImagemPorLink(usuario.telefone, grafico.url, grafico.legenda);
      return { tipo: 'nenhuma' };
    }

    case 'registrar_parcelamento':
      return { tipo: 'texto', texto: await registrarParcelamento(usuario, dados) };

    case 'criar_lembrete':
      return { tipo: 'texto', texto: await criarLembrete(usuario, dados) };

    case 'criar_lembrete_pontual':
      return { tipo: 'texto', texto: await criarLembretePontual(usuario, dados) };

    case 'cadastrar_conta_fixa':
      return { tipo: 'texto', texto: await cadastrarContaFixa(usuario, dados) };

    case 'pagar_contas_fixas':
      await avancarFila(usuario); // hoje só funciona bem no canal whatsapp (usa botões); no web ainda é limitado
      return { tipo: 'nenhuma' };

    case 'definir_meta':
      return { tipo: 'texto', texto: await definirMetas(usuario, dados) };

    case 'criar_categoria':
      return { tipo: 'texto', texto: await criarCategoria(usuario, dados) };

    case 'vincular_numero':
      if (canal === 'web') {
        return {
          tipo: 'texto',
          texto: 'Pelo site, use o botão "Convidar" no seu perfil pra gerar um código e compartilhar com quem você quer vincular.',
        };
      }
      return { tipo: 'texto', texto: await solicitarVinculo(usuario.telefone, normalizarTelefone(dados.telefone)) };

    case 'confirmar_codigo':
      if (canal === 'web') {
        return { tipo: 'texto', texto: 'Pelo site, use o campo de "Código de convite" na tela de cadastro.' };
      }
      return { tipo: 'texto', texto: await confirmarCodigo(usuario.telefone, dados.codigo) };

    case 'consulta':
      return { tipo: 'texto', texto: await processarConsulta(usuario, dados) };

    case 'buscar_transacao':
      return { tipo: 'texto', texto: await buscarTransacoesMsg(usuario.familia_id, dados.termo, dados.dias) };

    case 'exportar_excel':
      if (canal === 'web') {
        const arquivo = await gerarArquivoExcel(usuario, dados);
        return { tipo: 'arquivo', arquivo };
      }
      await exportarExcel(usuario, dados);
      return { tipo: 'nenhuma' };

    default:
      return { tipo: 'texto', texto: MENSAGEM_AJUDA };
  }
}

module.exports = { processarIntencao, normalizarTelefone };
