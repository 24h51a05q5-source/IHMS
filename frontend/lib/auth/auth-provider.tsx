'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthContext, type AuthContextValue, type BranchInfo } from './auth-context';
import { authApi } from '@/lib/api/auth.api';
import { reportsApi } from '@/lib/api/reports.api';
import { clearTokens, getAccessToken, registerTermsRequiredHandler, registerUnauthorizedHandler, setTokens } from '@/lib/api/client';
import type { AuthUser, Role } from '@/lib/types';

const BRANCH_KEY = 'ihms_current_branch';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchInfo[]>([]);

  // Hard safety timer: Guarantee loading screen never hangs beyond 3.5 seconds
  useEffect(() => {
    if (!loading) return;
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 3500);
    return () => clearTimeout(safetyTimer);
  }, [loading]);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setUser(null);
      clearTokens();
      setLoading(false);
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        if (path !== '/signin' && path !== '/login' && path !== '/register') {
          router.replace('/signin?expired=true');
        }
      }
    });

    registerTermsRequiredHandler(() => {
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        if (path !== '/terms' && path !== '/signin' && path !== '/login' && path !== '/register') {
          router.replace('/terms');
        }
      }
    });
  }, [router]);

  useEffect(() => {
    let active = true;
    (async () => {
      const token = getAccessToken();
      if (!token) {
        if (active) setLoading(false);
        return;
      }
      try {
        const me = await authApi.me();
        if (active && me && me.id) {
          setUser(me);
          if (me.hostelBranchId) setCurrentBranchId(me.hostelBranchId);
        } else if (active) {
          clearTokens();
          setUser(null);
        }
      } catch (err) {
        if (active) {
          console.warn('[Auth] Session check failed, clearing invalid session');
          clearTokens();
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const refreshBranches = useCallback(async () => {
    if (!user || user.role === 'STUDENT' || user.role === 'PARENT') return;
    try {
      const list = await reportsApi.branchList();
      if (list && Array.isArray(list)) {
        setBranches(list);
        const stored = typeof window !== 'undefined' ? window.localStorage.getItem(BRANCH_KEY) : null;
        setCurrentBranchId((prev) => {
          if (prev && list.some((b) => b.id === prev)) return prev;
          if (stored && list.some((b) => b.id === stored)) return stored;
          if (user.hostelBranchId && list.some((b) => b.id === user.hostelBranchId)) return user.hostelBranchId;
          return list[0]?.id || null;
        });
      }
    } catch {
      // ignore branch load errors gracefully
    }
  }, [user]);

  // Load accessible branches when user is available
  useEffect(() => {
    refreshBranches();
  }, [refreshBranches]);

  const refreshUser = useCallback(async () => {
    try {
      const token = getAccessToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      const me = await authApi.me();
      if (me && me.id) {
        setUser(me);
        if (me.hostelBranchId) setCurrentBranchId(me.hostelBranchId);
        try {
          await refreshBranches();
        } catch {
          // ignore
        }
      } else {
        clearTokens();
        setUser(null);
      }
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [refreshBranches]);

  // Listen to cross-component hostel update events
  useEffect(() => {
    const handleUpdate = () => {
      refreshBranches();
      refreshUser();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('ihms:branch-updated', handleUpdate);
      window.addEventListener('ihms:hostel-updated', handleUpdate);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('ihms:branch-updated', handleUpdate);
        window.removeEventListener('ihms:hostel-updated', handleUpdate);
      }
    };
  }, [refreshBranches, refreshUser]);

  const login = useCallback(async (identifier: string, password: string, loginType?: 'STUDENT' | 'ADMIN') => {
    const res = await authApi.login(identifier, password, loginType);
    setTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
    setCurrentBranchId(res.user.hostelBranchId || null);
    setLoading(false);
    return res;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
    clearTokens();
    setUser(null);
    setLoading(false);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(BRANCH_KEY);
    }
    router.replace('/signin');
  }, [router]);

  const setBranch = useCallback((branchId: string) => {
    setCurrentBranchId(branchId);
    if (typeof window !== 'undefined') window.localStorage.setItem(BRANCH_KEY, branchId);
  }, []);

  const hasRole = useCallback(
    (...roles: Role[]) => (user ? roles.includes(user.role) : false),
    [user],
  );

  const currentBranch = useMemo<BranchInfo | null>(() => {
    if (!branches.length) return null;
    return branches.find((b) => b.id === currentBranchId) || branches[0] || null;
  }, [branches, currentBranchId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      logout,
      refreshUser,
      refreshBranches,
      hasRole,
      setBranch,
      currentBranchId,
      branches,
      currentBranch,
    }),
    [user, loading, login, logout, refreshUser, refreshBranches, hasRole, setBranch, currentBranchId, branches, currentBranch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
