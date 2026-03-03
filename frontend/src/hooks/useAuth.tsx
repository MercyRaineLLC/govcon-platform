import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'CONSULTANT';
}

interface Firm {
  id: string;
  name: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  firm: Firm | null;
}

interface AuthContextValue extends AuthState {
  login: (token: string, user: User, firm: Firm) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => {
    try {
      const stored = localStorage.getItem('govcon_auth');
      return stored ? JSON.parse(stored) : { token: null, user: null, firm: null };
    } catch {
      return { token: null, user: null, firm: null };
    }
  });

  const value = useMemo(() => ({
    ...auth,
    isAuthenticated: !!auth.token,
    login: (token: string, user: User, firm: Firm) => {
      const state = { token, user, firm };
      setAuth(state);
      localStorage.setItem('govcon_auth', JSON.stringify(state));
    },
    logout: () => {
      setAuth({ token: null, user: null, firm: null });
      localStorage.removeItem('govcon_auth');
    },
  }), [auth]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}