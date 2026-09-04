import { useEffect, useState } from 'react';
import { obterTemaInicial, aplicarTema } from '../tema';

export default function AlternadorTema({ className = '' }) {
  const [tema, setTema] = useState(obterTemaInicial());

  useEffect(() => {
    aplicarTema(tema);
  }, [tema]);

  return (
    <button
      type="button"
      className={`botao-fantasma alternador-tema ${className}`}
      onClick={() => setTema((t) => (t === 'claro' ? 'escuro' : 'claro'))}
      aria-label={tema === 'claro' ? 'Ativar modo escuro' : 'Ativar modo claro'}
      title={tema === 'claro' ? 'Modo escuro' : 'Modo claro'}
    >
      {tema === 'claro' ? '🌙' : '☀️'}
    </button>
  );
}
