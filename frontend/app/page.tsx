'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { FullScreenLoader } from '@/components/dashboard/loader';
import { authApi } from '@/lib/api/auth.api';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    // 1. Wait until initial session / token verification finishes
    if (loading) return;

    // 2. If user is authenticated, route according to role and password state
    if (user) {
      if (user.mustChangePassword) {
        router.replace('/student/change-password');
      } else if (user.role === 'STUDENT') {
        router.replace('/student');
      } else if (user.role === 'PARENT') {
        router.replace('/parent');
      } else {
        router.replace('/dashboard');
      }
      return;
    }

    // 3. If unauthenticated, check PostgreSQL database setup status
    let active = true;
    (async () => {
      try {
        const setup = await authApi.getSetupStatus();
        if (!active) return;
        if (setup?.hasOrganizations || setup?.isSetupCompleted) {
          router.replace('/signin');
        } else {
          router.replace('/register');
        }
      } catch {
        if (!active) return;
        router.replace('/signin');
      }
    })();

    return () => {
      active = false;
    };
  }, [user, loading, router]);

  return <FullScreenLoader label="Loading IHMS ERP" />;
}
