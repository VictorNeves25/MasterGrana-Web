import { useState } from 'react';

export default function CartaoPendencia({ pendencia, onResponder }) {
  const [valorDigitado, setValorDigitado] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function responder(texto) {
    if (enviando) return;
    setEnviando(true);
    try {
      await onResponder(texto);
    } finally {
      setEnviando(false);
    }
  }

  function enviarValor(e) {
    e.preventDefault();
    if (!valorDigitado.trim()) return;
    responder(valorDigitado.trim());
    setValorDigitado('');
  }

  return (
    <div className="cartao-pendencia">
      <p className="titulo-pendencia">{pendencia.titulo}</p>
      {pendencia.valor != null && <p className="valor-pendencia">R$ {pendencia.valor.toFixed(2)}</p>}

      {pendencia.opcoes && (
        <div className="opcoes-pendencia">
          {pendencia.opcoes.map((op) => (
            <button key={op} onClick={() => responder(op)} disabled={enviando}>
              {op}
            </button>
          ))}
        </div>
      )}

      {pendencia.campoValor && (
        <form className="campo-valor-pendencia" onSubmit={enviarValor}>
          <input
            value={valorDigitado}
            onChange={(e) => setValorDigitado(e.target.value)}
            placeholder="Ex: 65.90"
            inputMode="decimal"
            disabled={enviando}
            autoFocus
          />
          <button type="submit" disabled={enviando || !valorDigitado.trim()}>OK</button>
        </form>
      )}
    </div>
  );
}
