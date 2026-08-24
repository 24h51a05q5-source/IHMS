import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, action, className }: PageHeaderProps) {
  const displayActions = actions || action;
  return (
    <div className={cn('flex flex-col gap-2.5 pb-3 sm:pb-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#CBD5E1] mb-3.5 sm:mb-5', className)}>
      <div className="min-w-0 space-y-0.5 sm:space-y-1">
        <h1 className="page-title text-xl sm:text-2xl font-bold tracking-tight text-[#000000] break-words">{title}</h1>
        {description && <p className="text-xs sm:text-sm font-medium text-[#475569] break-words">{description}</p>}
      </div>
      {displayActions && <div className="flex shrink-0 flex-wrap items-center gap-2">{displayActions}</div>}
    </div>
  );
}
