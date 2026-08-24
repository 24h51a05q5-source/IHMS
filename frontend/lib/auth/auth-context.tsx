'use client';

import { createContext, useContext } from 'react';
import type { AuthUser, Role, AuthResponse } from '@/lib/types';

export interface BranchInfo {
  id: string;
  code: string;
  branchCode?: string;
  name: string;
  hostelName?: string;
  branchName?: string;
  city?: string;
  state?: string;
  type?: string;
  address?: string;
  capacity?: number;
}

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string, loginType?: 'STUDENT' | 'ADMIN') => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  setBranch: (branchId: string) => void;
  currentBranchId: string | null;
  branches: BranchInfo[];
  currentBranch: BranchInfo | null;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
