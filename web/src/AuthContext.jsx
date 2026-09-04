import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(undefined); // undefined = carregando, null = deslogado

  useEffect(() => {
    api.me().then(setUsuario).catch(() => setUsuario(null));
  }, []);

  async function login(email, senha) {
    await api.login({ email, senha });
    setUsuario(await api.me());
  }

  async function registrar(dados) {
    await api.registrar(dados);
    setUsuario(await api.me());
  }

  async function sair() {
    await api.logout();
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, login, registrar, sair }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
