const BASE = '';

async function chamar(caminho, opcoes = {}) {
  const resp = await fetch(BASE + caminho, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  });

  const tipoConteudo = resp.headers.get('Content-Type') || '';
  if (tipoConteudo.includes('spreadsheetml')) {
    const blob = await resp.blob();
    const nomeArquivo = (resp.headers.get('Content-Disposition') || '').match(/filename="(.+)"/)?.[1] || 'planilha.xlsx';
    return { tipo: 'arquivo-blob', blob, nomeArquivo };
  }

  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(dados.erro || 'Erro na requisição');
  return dados;
}

export const api = {
  registrar: (body) => chamar('/api/auth/registrar', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => chamar('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => chamar('/api/auth/logout', { method: 'POST' }),
  me: () => chamar('/api/auth/me'),
  convite: () => chamar('/api/auth/convite', { method: 'POST' }),
  mensagem: (texto) => chamar('/api/mensagem', { method: 'POST', body: JSON.stringify({ texto }) }),
  pendencias: () => chamar('/api/pendencias'),
  responderPendencia: (texto) => chamar('/api/pendencias/responder', { method: 'POST', body: JSON.stringify({ texto }) }),
  chavePublicaPush: () => chamar('/api/push/chave-publica'),
  inscreverPush: (subscription) =>
    chamar('/api/push/inscrever', { method: 'POST', body: JSON.stringify({ subscription }) }),
};
