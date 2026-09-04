const CHAVE = 'mastergrana-tema';

export function obterTemaInicial() {
  const salvo = localStorage.getItem(CHAVE);
  if (salvo === 'claro' || salvo === 'escuro') return salvo;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

export function aplicarTema(tema) {
  document.documentElement.setAttribute('data-tema', tema);
  localStorage.setItem(CHAVE, tema);
}
