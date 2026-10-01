import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi } from '../services/endpoints';
import { getToken, setToken } from '../services/api';
import type { RoleCode } from '../types';

export interface AuthUser {
  id: number;
  login: string;
  displayName: string | null;
  role: RoleCode;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (login: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then((me) =>
        setUser({ id: me.id, login: me.login, displayName: me.displayName, role: me.role as RoleCode }),
      )
      .catch(() => {
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function signIn(login: string, password: string) {
    const res = await authApi.login(login, password);
    setToken(res.token);
    setUser({
      id: res.user.id,
      login: res.user.login,
      displayName: res.user.displayName,
      role: res.user.role as RoleCode,
    });
  }

  function signOut() {
    setToken(null);
    setUser(null);
  }

  const value: AuthContextValue = {
    user,
    loading,
    isAdmin: user?.role === 'ADMIN',
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
