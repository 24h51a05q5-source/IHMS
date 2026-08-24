'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-context';
import type { Role } from '@/lib/types';
import { FullScreenLoader } from '@/components/dashboard/loader';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) return <FullScreenLoader label="Preparing your workspace" />;
  if (!user) return <FullScreenLoader label="Redirecting to sign in" />;
  return <>{children}</>;
}

export function RoleGuard({ roles, children, fallback }: { roles: Role[]; children: ReactNode; fallback?: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && !roles.includes(user.role)) router.replace('/dashboard');
  }, [loading, user, roles, router]);

  if (loading) return <FullScreenLoader />;
  if (!user) return null;
  if (!roles.includes(user.role)) return <>{fallback ?? <ForbiddenNotice />}</>;
  return <>{children}</>;
}

function ForbiddenNotice() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6">
      <div className="text-center">
        <p className="text-lg font-semibold">Access restricted</p>
        <p className="mt-1 text-sm text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    </div>
  );
}
