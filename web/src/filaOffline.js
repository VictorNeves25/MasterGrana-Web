const CHAVE = 'mastergrana-fila-offline';

export function lerFila() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE)) || [];
  } catch {
    return [];
  }
}

function salvarFila(fila) {
  localStorage.setItem(CHAVE, JSON.stringify(fila));
}

export function adicionarNaFila(texto) {
  const fila = lerFila();
  const item = { id: crypto.randomUUID(), texto, criadoEm: Date.now() };
  fila.push(item);
  salvarFila(fila);
  return item;
}

export function removerDaFila(id) {
  salvarFila(lerFila().filter((i) => i.id !== id));
}
