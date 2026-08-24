'use client';

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label?: string;
  title?: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  trend?: { value: number; positive?: boolean };
  accent?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'accent' | 'neutral';
  loading?: boolean;
}

const iconStyleMap: Record<NonNullable<StatCardProps['accent']>, { bg: string; text: string; border: string; topBorder: string }> = {
  primary: { bg: 'bg-[#ECE9E1]', text: 'text-[#E87545]', border: 'border-[#DDD8CC]', topBorder: 'border-t-[#E87545]' },
  warning: { bg: 'bg-[#FEF3C7]', text: 'text-[#C94F18]', border: 'border-[#FDE68A]', topBorder: 'border-t-[#C94F18]' },
  info: { bg: 'bg-[#EFF6FF]', text: 'text-[#2563EB]', border: 'border-[#BFDBFE]', topBorder: 'border-t-[#2563EB]' },
  accent: { bg: 'bg-[#EFF6FF]', text: 'text-[#2563EB]', border: 'border-[#BFDBFE]', topBorder: 'border-t-[#2563EB]' },
  success: { bg: 'bg-[#E8F5ED]', text: 'text-[#087A45]', border: 'border-[#B4E2C7]', topBorder: 'border-t-[#087A45]' },
  error: { bg: 'bg-[#FEE2E2]', text: 'text-[#C62828]', border: 'border-[#FECACA]', topBorder: 'border-t-[#C62828]' },
  neutral: { bg: 'bg-[#F8FAFC]', text: 'text-[#111827]', border: 'border-[#E4E0D7]', topBorder: 'border-t-[#111827]' },
};

export function StatCard({ label, title, value, icon: Icon, hint, trend, accent = 'neutral', loading }: StatCardProps) {
  const displayLabel = label || title || '';
  const style = iconStyleMap[accent] || iconStyleMap.neutral;

  return (
    <div className={cn(
      'group relative rounded-xl border border-[#CBD5E1] bg-white p-3 sm:p-4 transition-colors duration-150 hover:border-[#E87545] flex flex-col justify-between'
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="stat-card-title metric-title card-label truncate text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-[#475569]">
            {displayLabel}
          </p>
          {loading ? (
            <div className="h-6 sm:h-8 w-20 sm:w-28 animate-pulse rounded-lg bg-[#F8FAFC]" />
          ) : (
            <p className="stat-value dashboard-number metric-value text-lg sm:text-2xl font-extrabold tracking-tight text-[#111827] tabular-nums">
              {value}
            </p>
          )}
          {hint && <p className="truncate text-[10px] sm:text-xs font-medium text-[#64748B]">{hint}</p>}
        </div>

        <div className={cn('flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg border', style.bg, style.text, style.border)}>
          <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
        </div>
      </div>

      {trend && !loading && (
        <div className="mt-2.5 pt-2 border-t border-[#CBD5E1] flex items-center gap-1.5 text-[11px]">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold text-[10px]',
              trend.positive ? 'bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]' : 'bg-[#FEE2E2] text-[#C62828] border border-[#FECACA]'
            )}
          >
            {trend.positive ? '+' : ''}{trend.value}%
          </span>
          <span className="text-[#64748B] font-semibold">vs last month</span>
        </div>
      )}
    </div>
  );
}
