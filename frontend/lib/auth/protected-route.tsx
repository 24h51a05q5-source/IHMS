'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './auth-context';
import type { Role } from '@/lib/types';
import { FullScreenLoader } from '@/components/dashboard/loader';
import { toast } from 'sonner';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const hasAlertedRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/signin');
      return;
    }

    if (!pathname) return;

    // First-login mandatory password change enforcement
    if (user.mustChangePassword && pathname !== '/student/change-password') {
      router.replace('/student/change-password');
      return;
    }

    // If user already changed password and visits /student/change-password, send them to appropriate dashboard
    if (!user.mustChangePassword && pathname === '/student/change-password') {
      router.replace(user.role === 'STUDENT' ? '/student' : '/dashboard');
      return;
    }

    // Student role boundary: Prevent students from accessing owner/admin routes
    if (user.role === 'STUDENT') {
      const adminPrefixes = [
        '/dashboard',
        '/owner',
        '/students',
        '/rooms',
        '/fees',
        '/finance',
        '/inventory',
        '/reports',
        '/hostels',
        '/accountant',
        '/warden',
        '/security',
        '/mess',
      ];
      if (adminPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'))) {
        if (hasAlertedRef.current !== pathname) {
          toast.error('You do not have permission to access this page.');
          hasAlertedRef.current = pathname;
        }
        router.replace('/student');
        return;
      }
    }

    // Owner / Staff role boundary: Prevent non-students from accessing student-only portal pages
    if (user.role !== 'STUDENT') {
      const studentPrefixes = ['/student'];
      const isStudentOnlyRoute = pathname === '/student' || (pathname.startsWith('/student/') && pathname !== '/student/change-password');
      if (isStudentOnlyRoute) {
        if (hasAlertedRef.current !== pathname) {
          toast.error('You do not have permission to access this page.');
          hasAlertedRef.current = pathname;
        }
        router.replace('/dashboard');
        return;
      }
    }
  }, [loading, user, router, pathname]);

  if (loading) return <FullScreenLoader />;
  if (!user) return <FullScreenLoader label="Redirecting to sign in" />;
  return <>{children}</>;
}

export function RoleGuard({ roles, children, fallback }: { roles: Role[]; children: ReactNode; fallback?: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && !roles.includes(user.role)) {
      toast.error('You do not have permission to access this page.');
      router.replace(user.role === 'STUDENT' ? '/student' : '/dashboard');
    }
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
        <p className="text-lg font-semibold text-[#111827]">Access restricted</p>
        <p className="mt-1 text-sm text-[#475569]">You do not have permission to view this page.</p>
      </div>
    </div>
  );
}
