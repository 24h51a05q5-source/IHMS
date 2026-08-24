'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthContext, type AuthContextValue } from './auth-context';
import { authApi } from '@/lib/api/auth.api';
import { reportsApi } from '@/lib/api/reports.api';
import { clearTokens, getAccessToken, registerUnauthorizedHandler, setTokens } from '@/lib/api/client';
import { isMockEnabled, mockLogin, mockMe, mockBranches } from '@/lib/mocks/auth';
import type { AuthUser, Role } from '@/lib/types';

const BRANCH_KEY = 'ihms_current_branch';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<{ id: string; code: string; name: string }[]>([]);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setUser(null);
      clearTokens();
      router.replace('/login');
    });
  }, [router]);

  useEffect(() => {
    let active = true;
    (async () => {
      const token = getAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = isMockEnabled()
          ? await mockMe(token)
          : await authApi.me();
        if (!active) return;
        setUser(me);
        if (me.hostelBranchId) setCurrentBranchId(me.hostelBranchId);
      } catch {
        if (!active) return;
        clearTokens();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Load accessible branches when user is available
  useEffect(() => {
    if (!user) return;
    if (isMockEnabled()) {
      setBranches(mockBranches);
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(BRANCH_KEY) : null;
      setCurrentBranchId(stored || user.hostelBranchId || mockBranches[0]?.id || null);
      return;
    }
    reportsApi
      .branchList()
      .then((b) => {
        setBranches(b);
        const stored = typeof window !== 'undefined' ? window.localStorage.getItem(BRANCH_KEY) : null;
        setCurrentBranchId(stored || user.hostelBranchId || b[0]?.id || null);
      })
      .catch(() => setBranches([]));
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const res = isMockEnabled()
      ? await mockLogin(email, password)
      : await authApi.login(email, password);
    setTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
    setCurrentBranchId(res.user.hostelBranchId || null);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (!isMockEnabled()) await authApi.logout();
    } catch {
      /* ignore */
    }
    clearTokens();
    setUser(null);
    router.replace('/login');
  }, [router]);

  const setBranch = useCallback((branchId: string) => {
    setCurrentBranchId(branchId);
    if (typeof window !== 'undefined') window.localStorage.setItem(BRANCH_KEY, branchId);
  }, []);

  const hasRole = useCallback(
    (...roles: Role[]) => (user ? roles.includes(user.role) : false),
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout, hasRole, setBranch, currentBranchId, branches }),
    [user, loading, login, logout, hasRole, setBranch, currentBranchId, branches],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
