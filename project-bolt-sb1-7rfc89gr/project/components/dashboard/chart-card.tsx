'use client';

import { ResponsiveContainer, type ResponsiveContainerProps } from 'recharts';

interface ChartCardProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  height?: number;
  loading?: boolean;
  error?: string | null;
  children: React.ReactElement<ResponsiveContainerProps>;
}

export function ChartCard({ title, description, actions, height = 300, loading, error, children }: ChartCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-premium transition-shadow hover:shadow-premium-hover">
      <div className="flex items-start justify-between gap-3 p-5 pb-0">
        <div className="min-w-0 space-y-0.5">
          <h3 className="truncate text-sm font-semibold tracking-tight sm:text-base">{title}</h3>
          {description && <p className="text-xs text-muted-foreground sm:text-sm">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className="p-5 pt-4">
        <div style={{ height }} className="w-full">
          {loading ? (
            <div className="h-full w-full animate-pulse rounded-lg bg-muted/40" />
          ) : error ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{error}</div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
