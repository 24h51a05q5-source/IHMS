'use client';

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  trend?: { value: number; positive?: boolean };
  accent?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'accent' | 'neutral';
  loading?: boolean;
}

const accentMap: Record<NonNullable<StatCardProps['accent']>, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-destructive/10 text-destructive',
  info: 'bg-chart-1/10 text-chart-1',
  accent: 'bg-accent/10 text-accent',
  neutral: 'bg-muted text-muted-foreground',
};

const trendGlow: Record<NonNullable<StatCardProps['accent']>, string> = {
  primary: 'from-primary/5 to-transparent',
  success: 'from-success/5 to-transparent',
  warning: 'from-warning/5 to-transparent',
  error: 'from-destructive/5 to-transparent',
  info: 'from-chart-1/5 to-transparent',
  accent: 'from-accent/5 to-transparent',
  neutral: 'from-muted/30 to-transparent',
};

export function StatCard({ label, value, icon: Icon, hint, trend, accent = 'neutral', loading }: StatCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-premium transition-all duration-300 hover:shadow-premium-hover hover:-translate-y-0.5">
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-60 transition-opacity group-hover:opacity-100', trendGlow[accent])} />
      <div className="relative p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 sm:text-xs">
              {label}
            </p>
            {loading ? (
              <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
            ) : (
              <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-[28px]">{value}</p>
            )}
            {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110', accentMap[accent])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {trend && !loading && (
          <div className="mt-3 flex items-center gap-1.5 text-xs">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold',
                trend.positive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
              )}
            >
              {trend.positive ? '▲' : '▼'} {Math.abs(trend.value)}%
            </span>
            <span className="text-muted-foreground">vs last month</span>
          </div>
        )}
      </div>
    </div>
  );
}
