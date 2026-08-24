'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Building2, Users, BedDouble, TrendingUp, IndianRupee, Wallet,
  AlertTriangle, MessageSquareWarning, Activity, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { ChartCard } from '@/components/dashboard/chart-card';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { reportsApi } from '@/lib/api/reports.api';
import { useAuth } from '@/lib/auth/auth-context';
import { useRealtimeEvent } from '@/lib/realtime/use-realtime';
import type { OwnerDashboardData, ApiError } from '@/lib/types';

export default function OwnerDashboardPage() {
  const { currentBranchId } = useAuth();
  const [data, setData] = useState<OwnerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportsApi.ownerDashboard(currentBranchId || undefined);
      setData(res);
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [currentBranchId]);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time refresh hooks
  useRealtimeEvent('payment.success', load);
  useRealtimeEvent('fee.updated', load);
  useRealtimeEvent('student.updated', load);
  useRealtimeEvent('complaint.created', load);
  useRealtimeEvent('bed.updated', load);

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Owner Dashboard"
        description="Financial and operational overview across your hostel branches"
      />

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total Hostels" value={data?.totalHostels ?? 0} icon={Building2} accent="primary" loading={loading} />
        <StatCard label="Total Students" value={data?.totalStudents ?? 0} icon={Users} accent="info" loading={loading} />
        <StatCard label="Total Beds" value={data?.totalBeds ?? 0} icon={BedDouble} accent="neutral" loading={loading} />
        <StatCard
          label="Occupancy"
          value={data ? `${data.occupancyPct}%` : '—'}
          icon={TrendingUp}
          accent="success"
          hint={data ? `${data.occupiedBeds} occupied · ${data.availableBeds} available` : undefined}
          loading={loading}
        />
        <StatCard label="Monthly Collection" value={fmt(data?.monthlyCollection)} icon={IndianRupee} accent="success" loading={loading} />
        <StatCard label="Outstanding Fees" value={fmt(data?.outstandingFees)} icon={Wallet} accent="warning" loading={loading} />
        <StatCard
          label="Net Profit / Loss"
          value={fmt(data?.netProfitLoss)}
          icon={(data?.netProfitLoss ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight}
          accent={(data?.netProfitLoss ?? 0) >= 0 ? 'success' : 'error'}
          hint={data ? `Expenses: ${fmt(data.monthlyExpenses)}` : undefined}
          loading={loading}
        />
        <StatCard label="Pending Complaints" value={data?.pendingComplaints ?? 0} icon={MessageSquareWarning} accent="error" loading={loading} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {loading ? (
          <>
            <CardSkeleton className="h-80" />
            <CardSkeleton className="h-80" />
          </>
        ) : (
          <>
            <ChartCard title="Collection vs Expenses" description="Monthly financial trend">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.collectionTrend || []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `₹${v / 1000}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="collection" name="Collection" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Occupancy Trend" description="Bed occupancy percentage over time">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.occupancyTrend || []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                  <Area type="monotone" dataKey="occupancy" name="Occupancy" stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#occGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </>
        )}
      </div>

      {/* Recent activity + pending approvals */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-premium lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight">Recent Activity</h3>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
            </span>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} className="h-12" />)}
            </div>
          ) : data?.recentActivity?.length ? (
            <ul className="space-y-1">
              {data.recentActivity.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-muted/40">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Activity className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{a.description}</span>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">{timeAgo(a.timestamp)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No recent activity to show.</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-premium">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight">Action Items</h3>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="space-y-2.5">
            <ActionRow label="Pending Approvals" count={data?.pendingApprovals ?? 0} variant="warning" />
            <ActionRow label="Pending Complaints" count={data?.pendingComplaints ?? 0} variant="error" />
            <ActionRow label="Outstanding Fees" count={data ? 1 : 0} value={data ? fmt(data.outstandingFees) : '—'} variant="info" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionRow({ label, count, value, variant }: { label: string; count: number; value?: string; variant: 'warning' | 'error' | 'info' }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3.5 py-3 transition-colors hover:bg-muted/30">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {value ? (
        <Badge variant={variant}>{value}</Badge>
      ) : (
        <Badge variant={count > 0 ? variant : 'outline'}>{count} pending</Badge>
      )}
    </div>
  );
}

const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '0.5rem',
  fontSize: '12px',
  color: 'hsl(var(--foreground))',
  boxShadow: '0 4px 12px -2px hsl(222 47% 11% / 0.08)',
};

function fmt(v?: number): string {
  if (v === undefined || v === null) return '—';
  return `₹${v.toLocaleString('en-IN')}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
