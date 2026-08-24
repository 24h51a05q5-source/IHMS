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
    <div className="rounded-xl border border-[#CBD5E1] bg-white p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 border-b border-[#CBD5E1] pb-3">
        <div className="min-w-0 space-y-0.5">
          <h3 className="truncate text-base font-extrabold text-[#000000]">{title}</h3>
          {description && <p className="text-xs font-semibold text-[#64748B]">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div>
        <div style={{ height }} className="w-full">
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
