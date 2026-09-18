import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api, CurrentUser, getToken, LoginResult, setToken } from "../api";

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  completeMfaLogin: (preAuthToken: string, code: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  // Step 1: password only. If the account has MFA enabled, this deliberately returns a
  // pre-auth challenge instead of a session — no token is stored until step 2 succeeds.
  async function login(email: string, password: string): Promise<LoginResult> {
    const result = await api.login(email, password);
    if (result.token && result.user) {
      setToken(result.token);
      setUser(result.user);
    }
    return result;
  }

  // Step 2: exchanges the pre-auth token + a valid TOTP code for a real session.
  async function completeMfaLogin(preAuthToken: string, code: string) {
    const { token, user: loggedInUser } = await api.verifyMfa(preAuthToken, code);
    setToken(token);
    setUser(loggedInUser);
  }

  async function refreshUser() {
    if (getToken()) setUser(await api.me());
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, completeMfaLogin, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
