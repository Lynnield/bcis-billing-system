import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import type { AuthUser, LoginRequest } from "@/lib/api-client";

// Idle time before the session auto-locks. The main process still holds the
// token throughout — locking only blocks the renderer UI until the current
// user's password is re-entered; it never logs the user out.
const IDLE_LOCK_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "wheel", "touchstart"] as const;

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isLocked: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  lock: () => void;
  unlock: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAuthenticated = !!user;

  const lock = useCallback(() => {
    setIsLocked(true);
  }, []);

  // Re-enters the current user's password without disturbing the stored
  // session token — a successful call just replaces it with an identical,
  // freshly-issued one. Reuses the existing login IPC/route rather than
  // adding a parallel "verify password" endpoint.
  const unlock = useCallback(
    async (password: string) => {
      if (!user) throw new Error("No active session to unlock");
      const session = await window.bcis.auth.login({ identifier: user.username, password });
      if (!session.isAuthenticated || !session.user) {
        throw new Error("Incorrect password");
      }
      setUser(session.user);
      setIsLocked(false);
    },
    [user],
  );

  // Idle auto-lock: any user activity resets the timer; once authenticated
  // and unlocked, 15 minutes of inactivity locks the session automatically.
  useEffect(() => {
    if (!isAuthenticated || isLocked) return;

    const resetTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setIsLocked(true), IDLE_LOCK_MS);
    };

    resetTimer();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer);
    }
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [isAuthenticated, isLocked]);

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
      setIsLocked(false);
    } else {
      throw new Error("Login failed: no session returned");
    }
  };

  const logout = async () => {
    await window.bcis.auth.logout();
    setUser(null);
    setIsLocked(false);
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
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated, isLocked, login, logout, refreshSession, lock, unlock }}>
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