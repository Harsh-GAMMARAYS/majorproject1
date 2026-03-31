'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { RoomUser } from '@/types/api';
import {
  clearSession,
  fetchCurrentUser,
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from '@/lib/api';

interface AuthContextValue {
  user: RoomUser | null;
  loading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (email: string, displayName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<RoomUser | null>(getCurrentUser());
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
    } catch {
      clearSession();
      setUser(null);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      if (!getCurrentUser()) {
        setLoading(false);
        return;
      }
      await refreshUser();
      setLoading(false);
    };
    void bootstrap();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email: string, password: string, remember: boolean = true) => {
        const session = await loginRequest(email, password, remember);
        setUser(session.user);
      },
      register: async (email: string, displayName: string, password: string) => {
        const session = await registerRequest(email, displayName, password);
        setUser(session.user);
      },
      logout: async () => {
        await logoutRequest();
        setUser(null);
      },
      refreshUser,
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
