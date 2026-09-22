"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import {
  getStoredTokens,
  getStoredUserJson,
  setStoredTokens,
  setStoredUserJson,
} from "@/lib/api/client";
import type { User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): User | null {
  const tokens = getStoredTokens();
  const raw = getStoredUserJson();
  if (!tokens || !raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    setStoredTokens(null);
    setStoredUserJson(null);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Start identical on server and client to avoid hydration mismatch.
  // Restore session from localStorage only after mount.
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(readStoredUser());
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api.login(email, password);
    setStoredTokens(session.tokens);
    setStoredUserJson(JSON.stringify(session.user));
    setUser(session.user);
    return session.user;
  }, []);

  const logout = useCallback(() => {
    setStoredTokens(null);
    setStoredUserJson(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
