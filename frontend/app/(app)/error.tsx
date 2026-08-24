'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App Error Boundary caught error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-md rounded-xl border border-[#CBD5E1] bg-white p-8 space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FEE2E2] text-[#C62828]">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-black text-[#111827]">Something went wrong</h2>
        <p className="text-xs font-semibold text-[#64748B] leading-relaxed">
          {error?.message || 'An unexpected error occurred while loading this page.'}
        </p>
        <div className="pt-2">
          <Button onClick={() => reset()} className="gap-2 bg-[#E87545] hover:bg-[#D66434] text-white font-bold text-xs">
            <RefreshCw className="h-4 w-4" /> Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}
