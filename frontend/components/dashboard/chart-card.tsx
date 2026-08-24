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

export function ChartCard({ title, description, actions, height, loading, error, children }: ChartCardProps) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-xl border border-[#CBD5E1] bg-white p-3 sm:p-5 lg:p-6 space-y-2.5 sm:space-y-3.5">
      <div className="flex items-start justify-between gap-2 border-b border-[#CBD5E1] pb-2 sm:pb-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h3 className="card-title truncate text-sm sm:text-base font-bold text-[#111827]">{title}</h3>
          {description && <p className="truncate text-[11px] sm:text-xs font-medium text-[#64748B]">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className="w-full min-w-0 overflow-hidden">
        <div style={height ? { height } : undefined} className={height ? 'w-full min-w-0' : 'h-[220px] sm:h-[280px] w-full min-w-0'}>
          {loading ? (
            <div className="h-full w-full animate-pulse rounded-xl bg-[#F8FAFC]" />
          ) : error ? (
            <div className="flex h-full items-center justify-center text-xs font-semibold text-[#C62828]">{error}</div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
