'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { FullScreenLoader } from '@/components/dashboard/loader';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    } else if (user.role === 'STUDENT') {
      router.replace('/student');
    } else if (user.role === 'PARENT') {
      router.replace('/parent');
    } else {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  return <FullScreenLoader label="Loading IHMS ERP" />;
}
