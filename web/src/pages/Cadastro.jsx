import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import AlternadorTema from '../components/AlternadorTema';

export default function Cadastro() {
  const { registrar } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [codigoConvite, setCodigoConvite] = useState(params.get('convite') || '');
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      await registrar({ nome, email, senha, codigoConvite: codigoConvite || undefined });
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
        <p className="subtitulo-auth">Crie sua conta pra começar a registrar seus gastos.</p>

        <form onSubmit={enviar} className="form-auth">
          <label>
            Nome ou apelido
            <input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              minLength={6}
              required
            />
          </label>
          <label>
            Código de convite <span className="opcional-auth">(opcional — se alguém já te convidou)</span>
            <input value={codigoConvite} onChange={(e) => setCodigoConvite(e.target.value.toUpperCase())} />
          </label>
          {erro && <p className="erro-auth">{erro}</p>}
          <button type="submit" className="botao-principal" disabled={carregando}>
            {carregando ? 'Criando conta…' : 'Criar conta'}
          </button>
        </form>

        <p className="rodape-auth">
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
