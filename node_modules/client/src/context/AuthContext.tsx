import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi } from '../services/endpoints';
import { getToken, setToken } from '../services/api';
import type { Permission, RoleCode } from '../types';

export interface AuthUser {
  id: number;
  login: string;
  displayName: string | null;
  role: RoleCode;
  /** Libelle lisible du profil (« Direction generale », « Magasinier »...).
   *  Utilise dans la barre laterale : afficher le code TOP_MANAGEMENT y serait
   *  illisible. */
  roleLabel: string;
  /** Droits calcules par le serveur (D16), jamais recalcules ici. */
  permissions: Permission[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /** Le profil dispose-t-il du droit demande ? Source : la reponse du serveur. */
  can: (permission: Permission) => boolean;
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
      .then((me) => setUser(me))
      .catch(() => {
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function signIn(login: string, password: string) {
    const res = await authApi.login(login, password);
    setToken(res.token);
    setUser(res.user);
  }

  function signOut() {
    setToken(null);
    setUser(null);
  }

  const granted = new Set(user?.permissions ?? []);

  const value: AuthContextValue = {
    user,
    loading,
    // Un droit non accorde est un refus : jamais de repli sur le role brut.
    can: (permission) => granted.has(permission),
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