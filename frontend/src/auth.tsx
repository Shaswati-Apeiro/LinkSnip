import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getToken, setToken, api } from "./api";

interface AuthCtx {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(() => getToken());

  const login = useCallback((t: string) => {
    setToken(t);
    setTok(t);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setTok(null);
  }, []);

  return <Ctx.Provider value={{ token, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { token, logout } = useAuth();
  const [state, setState] = useState<"loading" | "ok">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // A valid session token is not enough: the backend only lets verified (or
      // whitelisted) users through /me and every protected route. Probe /me to
      // determine actual access; unverified users get 403 from the API.
      if (!token) {
        setState("ok");
        return;
      }
      try {
        await api.me();
        if (!cancelled) setState("ok");
      } catch {
        // 401 (invalid/expired) or 403 (unverified): clear the token so React
        // navigation rules apply; auth screens handle the "verify" guidance.
        if (!cancelled) {
          logout();
          setState("ok");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  // A token may still be present but unusable (cleared above) — drop to /auth,
  // which shows the sign-in / verify-email flow.
  if (!token) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}