import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './pages/Login';
import Cadastro from './pages/Cadastro';
import Painel from './pages/Painel';

function RotaPrivada({ children }) {
  const { usuario } = useAuth();
  if (usuario === undefined) return <TelaCarregando />;
  if (usuario === null) return <Navigate to="/login" replace />;
  return children;
}

function RotaPublica({ children }) {
  const { usuario } = useAuth();
  if (usuario === undefined) return <TelaCarregando />;
  if (usuario) return <Navigate to="/" replace />;
  return children;
}

function TelaCarregando() {
  return <div className="tela-carregando">Carregando…</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<RotaPublica><Login /></RotaPublica>} />
          <Route path="/cadastro" element={<RotaPublica><Cadastro /></RotaPublica>} />
          <Route path="/" element={<RotaPrivada><Painel /></RotaPrivada>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
