'use client';

import { Suspense } from 'react';
import LoginPage from '../login/page';
import { FullScreenLoader } from '@/components/dashboard/loader';

export default function SignInPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <LoginPage />
    </Suspense>
  );
}

