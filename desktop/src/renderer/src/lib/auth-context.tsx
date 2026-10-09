import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { AuthUser, LoginRequest } from "@/lib/api-client";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  // Load and validate stored session from main process on startup
  const loadStoredSession = useCallback(async () => {
    try {
      const session = await window.bcis.auth.getSession();
      if (session.isAuthenticated && session.user) {
        setUser(session.user);
      }
    } catch (err) {
      console.error("Failed to load stored session:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStoredSession();
  }, [loadStoredSession]);

  const login = async (credentials: LoginRequest) => {
    const session = await window.bcis.auth.login(credentials);
    if (session.isAuthenticated && session.user) {
      setUser(session.user);
    } else {
      throw new Error("Login failed: no session returned");
    }
  };

  const logout = async () => {
    await window.bcis.auth.logout();
    setUser(null);
  };

  const refreshSession = async () => {
    const session = await window.bcis.auth.refreshSession();
    if (session.isAuthenticated && session.user) {
      setUser(session.user);
    } else {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated, login, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}