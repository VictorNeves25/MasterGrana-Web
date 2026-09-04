const { tentarResolverComMensagem } = require('./handlers/confirmacoes');
const { tentarResolverModo, tentarResolverConfirmacao } = require('./handlers/lembretePontual');
const { tentarResolverResposta, tentarResolverNovoValor, JA_ENVIADO } = require('./handlers/contasFixas');
const { tentarResolverDiaUtil } = require('./handlers/configContasFixas');

// Tenta resolver a mensagem/ação contra qualquer pendência em aberto do usuário,
// na mesma ordem de prioridade usada no webhook do WhatsApp.
// Retorna { resolvido: false } se não havia nada pendente pra essa pessoa,
// ou { resolvido: true, texto } (texto pode ser null quando já foi tudo
// entregue diretamente, ex: botões do WhatsApp).
async function tentarResolverPendencias(usuario, texto) {
  const r1 = await tentarResolverComMensagem(usuario, texto);
  if (r1) return { resolvido: true, texto: r1 };

  const r2 = await tentarResolverModo(usuario, texto);
  if (r2) return { resolvido: true, texto: r2 };

  const r3 = await tentarResolverConfirmacao(usuario, texto);
  if (r3) return { resolvido: true, texto: r3 };

  const r4 = await tentarResolverResposta(usuario, texto);
  if (r4 === JA_ENVIADO) return { resolvido: true, texto: null };
  if (r4) return { resolvido: true, texto: r4 };

  const r5 = await tentarResolverNovoValor(usuario, texto);
  if (r5 === JA_ENVIADO) return { resolvido: true, texto: null };
  if (r5) return { resolvido: true, texto: r5 };

  const r6 = await tentarResolverDiaUtil(usuario, texto);
  if (r6) return { resolvido: true, texto: r6 };

  return { resolvido: false };
}

module.exports = { tentarResolverPendencias };
