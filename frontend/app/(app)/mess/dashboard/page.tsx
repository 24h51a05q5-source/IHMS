'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export default function AliasMessDashboardPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/mess');
  }, [router]);

  return (
    <div className="flex h-64 items-center justify-center">
      <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  );
}
