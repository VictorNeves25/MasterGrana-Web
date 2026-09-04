import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import ModalConvite from '../components/ModalConvite';
import AlternadorTema from '../components/AlternadorTema';
import CartaoPendencia from '../components/CartaoPendencia';
import { ativarNotificacoes, registrarServiceWorker } from '../push';
import { lerFila, adicionarNaFila, removerDaFila } from '../filaOffline';

function baixarBlob(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

// true só quando o erro é de rede de verdade (sem internet), não um erro do servidor
function erroDeRede(err) {
  return err instanceof TypeError;
}

export default function Painel() {
  const { usuario, sair } = useAuth();
  const [mensagens, setMensagens] = useState([
    {
      autor: 'bot',
      tipo: 'texto',
      texto: `Oi, ${usuario?.nome || ''}! Manda um gasto, uma receita ou uma pergunta — do jeito que você falaria naturalmente. Ex: "Gastei 50 no mercado" ou "quanto gastei esse mês?".`,
    },
  ]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [modalConviteAberto, setModalConviteAberto] = useState(false);
  const [avisoNotificacao, setAvisoNotificacao] = useState(null);
  const [pendencias, setPendencias] = useState([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [sincronizando, setSincronizando] = useState(false);
  const fimDoFeed = useRef(null);

  const atualizarPendencias = useCallback(async () => {
    try {
      const { pendencias } = await api.pendencias();
      setPendencias(pendencias);
    } catch {
      // silencioso — provavelmente só estamos offline
    }
  }, []);

  const processarRespostaBot = useCallback((resposta) => {
    if (resposta.tipo === 'arquivo-blob') {
      baixarBlob(resposta.blob, resposta.nomeArquivo);
      setMensagens((atual) => [...atual, { autor: 'bot', tipo: 'texto', texto: `📄 Planilha baixada: ${resposta.nomeArquivo}` }]);
    } else if (resposta.tipo === 'grafico') {
      setMensagens((atual) => [...atual, { autor: 'bot', tipo: 'grafico', url: resposta.url, legenda: resposta.legenda }]);
    } else if (resposta.tipo === 'texto' && resposta.texto) {
      setMensagens((atual) => [...atual, { autor: 'bot', tipo: 'texto', texto: resposta.texto }]);
    }
  }, []);

  // Manda pro servidor tudo que ficou na fila enquanto estava offline, em ordem
  const sincronizarFila = useCallback(async () => {
    const fila = lerFila();
    if (fila.length === 0) return;

    setSincronizando(true);
    for (const item of fila) {
      try {
        const resposta = await api.mensagem(item.texto);
        setMensagens((atual) =>
          atual.map((m) => (m.filaId === item.id ? { ...m, pendente: false } : m))
        );
        processarRespostaBot(resposta);
        removerDaFila(item.id);
      } catch (err) {
        if (erroDeRede(err)) break; // ainda sem internet, tenta o resto depois
        removerDaFila(item.id); // erro do servidor: descarta pra não travar a fila pra sempre
      }
    }
    setSincronizando(false);
    atualizarPendencias();
  }, [processarRespostaBot, atualizarPendencias]);

  useEffect(() => {
    registrarServiceWorker();
    atualizarPendencias();
    sincronizarFila();

    const intervalo = setInterval(atualizarPendencias, 30000);
    const aoFicarOnline = () => {
      setOnline(true);
      sincronizarFila();
    };
    const aoFicarOffline = () => setOnline(false);

    window.addEventListener('online', aoFicarOnline);
    window.addEventListener('offline', aoFicarOffline);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener('online', aoFicarOnline);
      window.removeEventListener('offline', aoFicarOffline);
    };
  }, [atualizarPendencias, sincronizarFila]);

  useEffect(() => {
    fimDoFeed.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  async function pedirNotificacoes() {
    const resultado = await ativarNotificacoes();
    setAvisoNotificacao(resultado.ok ? 'Notificações ativadas! 🔔' : resultado.motivo);
  }

  async function responderPendencia(texto) {
    setMensagens((atual) => [...atual, { autor: 'voce', tipo: 'texto', texto }]);
    try {
      const resposta = await api.responderPendencia(texto);
      if (resposta.texto) {
        setMensagens((atual) => [...atual, { autor: 'bot', tipo: 'texto', texto: resposta.texto }]);
      }
    } catch {
      setMensagens((atual) => [...atual, { autor: 'bot', tipo: 'texto', texto: '⚠️ Isso precisa de internet — tenta de novo quando reconectar.' }]);
    } finally {
      atualizarPendencias();
    }
  }

  async function enviarMensagem(e) {
    e.preventDefault();
    const textoEnviado = texto.trim();
    if (!textoEnviado || enviando) return;

    setTexto('');
    setEnviando(true);

    try {
      const resposta = await api.mensagem(textoEnviado);
      setMensagens((atual) => [...atual, { autor: 'voce', tipo: 'texto', texto: textoEnviado }]);
      processarRespostaBot(resposta);
    } catch (err) {
      if (erroDeRede(err)) {
        // sem internet: guarda na fila e mostra como "pendente", sem erro nenhum pro usuário
        const item = adicionarNaFila(textoEnviado);
        setMensagens((atual) => [
          ...atual,
          { autor: 'voce', tipo: 'texto', texto: textoEnviado, pendente: true, filaId: item.id },
        ]);
      } else {
        setMensagens((atual) => [
          ...atual,
          { autor: 'voce', tipo: 'texto', texto: textoEnviado },
          { autor: 'bot', tipo: 'texto', texto: '⚠️ Deu um erro aqui do meu lado. Tenta de novo?' },
        ]);
      }
    } finally {
      setEnviando(false);
      atualizarPendencias();
    }
  }

  const filaPendente = lerFila().length;

  return (
    <div className="pagina-painel">
      <header className="topo-painel">
        <div className="marca-topo">
          <span className="selo-auth pequeno">M</span>
          <span className="nome-marca">MasterGrana</span>
        </div>
        <div className="acoes-topo">
          <AlternadorTema />
          <button className="botao-fantasma" onClick={pedirNotificacoes}>🔔</button>
          <button className="botao-fantasma" onClick={() => setModalConviteAberto(true)}>Convidar</button>
          <button className="botao-fantasma" onClick={sair}>Sair</button>
        </div>
      </header>

      {!online && (
        <p className="aviso-offline">
          📡 Sem internet — o que você mandar fica guardado e é enviado sozinho quando reconectar.
        </p>
      )}
      {online && sincronizando && <p className="aviso-notificacao">Sincronizando mensagens pendentes…</p>}
      {online && !sincronizando && filaPendente > 0 && (
        <p className="aviso-notificacao">{filaPendente} mensagem(ns) aguardando envio…</p>
      )}
      {avisoNotificacao && <p className="aviso-notificacao">{avisoNotificacao}</p>}

      <main className="feed-ledger">
        {mensagens.map((m, i) => (
          <LinhaLedger key={i} mensagem={m} />
        ))}
        <div ref={fimDoFeed} />
      </main>

      {pendencias.length > 0 && (
        <div className="lista-pendencias">
          {pendencias.map((p) => (
            <CartaoPendencia key={`${p.origem}-${p.id}`} pendencia={p} onResponder={responderPendencia} />
          ))}
        </div>
      )}

      <form className="barra-entrada" onSubmit={enviarMensagem}>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder='Ex: "Gastei 50 no mercado" ou "quanto gastei esse mês?"'
          disabled={enviando}
          autoFocus
        />
        <button type="submit" disabled={enviando || !texto.trim()}>
          {enviando ? '…' : 'Enviar'}
        </button>
      </form>

      {modalConviteAberto && <ModalConvite onFechar={() => setModalConviteAberto(false)} />}
    </div>
  );
}

function LinhaLedger({ mensagem }) {
  const doUsuario = mensagem.autor === 'voce';
  return (
    <div className={`linha-ledger ${doUsuario ? 'linha-voce' : 'linha-bot'}`}>
      <div className={`ficha ${mensagem.pendente ? 'ficha-pendente' : ''}`}>
        {mensagem.tipo === 'texto' && <pre className="texto-ficha">{mensagem.texto}</pre>}
        {mensagem.tipo === 'grafico' && (
          <div>
            <img src={mensagem.url} alt={mensagem.legenda} className="grafico-ficha" />
            <p className="legenda-ficha">{mensagem.legenda}</p>
          </div>
        )}
        {mensagem.pendente && <p className="marca-pendente">⏳ aguardando conexão…</p>}
      </div>
    </div>
  );
}
