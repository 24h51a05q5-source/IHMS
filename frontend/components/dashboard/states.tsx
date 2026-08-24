'use client';

import { Inbox, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ title = 'Nothing here yet', description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-[#CBD5E1] bg-white px-4 py-8 sm:px-6 sm:py-12 text-center', className)}>
      <div className="mb-2.5 sm:mb-3 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg bg-[#F8FAFC] text-[#64748B] border border-[#CBD5E1]">
        {icon ?? <Inbox className="h-5 w-5 sm:h-6 sm:w-6" />}
      </div>
      <p className="text-sm sm:text-base font-bold text-[#111827]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs sm:text-sm font-semibold text-[#64748B]">{description}</p>}
      {action && (
        <Button size="sm" className="mt-3.5 font-bold" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ message = 'Unable to load this data right now.', onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50/40 px-4 py-8 sm:px-6 sm:py-12 text-center', className)}>
      <div className="mb-2.5 sm:mb-3 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg bg-red-100 text-red-600 border border-red-200">
        <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>
      <p className="text-base font-bold text-[#111827]">Failed to load</p>
      <p className="mt-1 max-w-sm text-xs sm:text-sm font-semibold text-red-600">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-4 font-bold border-red-300 hover:bg-red-100" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}
