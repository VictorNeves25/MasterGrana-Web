import { useState } from 'react';
import { api } from '../api';

export default function ModalConvite({ onFechar }) {
  const [codigo, setCodigo] = useState(null);
  const [carregando, setCarregando] = useState(false);

  async function gerar() {
    setCarregando(true);
    try {
      const { codigo } = await api.convite();
      setCodigo(codigo);
    } finally {
      setCarregando(false);
    }
  }

  const link = codigo ? `${window.location.origin}/cadastro?convite=${codigo}` : '';

  return (
    <div className="fundo-modal" onClick={onFechar}>
      <div className="conteudo-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Convidar alguém pra sua conta</h2>
        <p>Gere um código e mande pra pessoa. Ela usa ele na tela de cadastro pra ver os mesmos dados que você.</p>

        {!codigo ? (
          <button className="botao-principal" onClick={gerar} disabled={carregando}>
            {carregando ? 'Gerando…' : 'Gerar código de convite'}
          </button>
        ) : (
          <div className="codigo-convite">
            <span className="valor-codigo">{codigo}</span>
            <p className="ajuda-codigo">Válido por 24 horas. Ou mande este link direto:</p>
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
          </div>
        )}

        <button className="botao-fantasma" onClick={onFechar}>Fechar</button>
      </div>
    </div>
  );
}
