'use client';

import { createContext, useContext } from 'react';
import type { AuthUser, Role } from '@/lib/types';

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  setBranch: (branchId: string) => void;
  currentBranchId: string | null;
  branches: { id: string; code: string; name: string }[];
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
