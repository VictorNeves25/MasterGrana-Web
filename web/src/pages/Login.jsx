import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import AlternadorTema from '../components/AlternadorTema';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      await login(email, senha);
      navigate('/');
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="tela-auth">
      <div className="cartao-auth">
        <AlternadorTema className="alternador-canto" />
        <div className="marca-auth">
          <span className="selo-auth">M</span>
          <h1>MasterGrana</h1>
        </div>
        <p className="subtitulo-auth">Controle financeiro do casal, numa conversa só.</p>

        <form onSubmit={enviar} className="form-auth">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label>
            Senha
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </label>
          {erro && <p className="erro-auth">{erro}</p>}
          <button type="submit" className="botao-principal" disabled={carregando}>
            {carregando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="rodape-auth">
          Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
        </p>
      </div>
    </div>
  );
}
