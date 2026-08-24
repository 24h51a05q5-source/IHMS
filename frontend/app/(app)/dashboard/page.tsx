'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Building2, Users, BedDouble, TrendingUp, IndianRupee, Wallet,
  AlertTriangle, MessageSquareWarning, Activity, ArrowUpRight, ArrowDownRight,
  ShieldCheck, PlusCircle,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/dashboard/stat-card';
import { ChartCard } from '@/components/dashboard/chart-card';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import { reportsApi } from '@/lib/api/reports.api';
import { getCachedData } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { useRealtimeEvent } from '@/lib/realtime/use-realtime';
import type { OwnerDashboardData, ApiError } from '@/lib/types';

function OwnerDashboardPageContent() {
  const { user, currentBranchId } = useAuth();
  const [data, setData] = useState<OwnerDashboardData | null>(() =>
    getCachedData<OwnerDashboardData>('/dashboard/owner', currentBranchId ? { branchId: currentBranchId } : undefined)
  );
  const [loading, setLoading] = useState<boolean>(() => !data);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await reportsApi.ownerDashboard(currentBranchId || undefined);
      setData(res);
      setError(null);
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
    <div className="w-full max-w-full min-w-0 space-y-3.5 sm:space-y-5">
      {/* Welcome Hero Banner */}
      <div className="w-full min-w-0 relative overflow-hidden rounded-xl bg-[#18233A] p-3.5 sm:p-5 lg:p-6 text-white border border-[#283754]">
        <div className="relative z-10 flex flex-col gap-3.5 sm:gap-4 md:flex-row md:items-center md:justify-between min-w-0">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300 border border-white/10 mb-0.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#38BDF8]" /> Verified ERP Environment
            </div>
            <h1 className="welcome-title page-title text-lg sm:text-2xl lg:text-3xl font-bold tracking-tight text-white break-words">
              Welcome back, {user?.name || 'Hostel Owner'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-medium">
              Hostel operational overview and real-time financial controls.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0 w-full sm:w-auto">
            <Link href="/students/new" className="flex-1 sm:flex-initial">
              <Button className="w-full sm:w-auto h-9 text-xs sm:text-sm gap-1.5 bg-[#E87545] hover:bg-[#D66434] text-white font-bold">
                <PlusCircle className="h-4 w-4" /> Add Student
              </Button>
            </Link>
            <Link href="/finance" className="flex-1 sm:flex-initial">
              <Button variant="outline" className="w-full sm:w-auto h-9 text-xs sm:text-sm bg-white/10 hover:bg-white/20 text-white border-white/20 hover:text-white font-bold">
                View Finance
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="w-full min-w-0 grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        <StatCard label="Total Hostels" value={data?.totalHostels ?? 0} icon={Building2} accent="neutral" loading={loading} />
        <StatCard label="Total Students" value={data?.totalStudents ?? 0} icon={Users} accent="info" loading={loading} />
        <StatCard label="Total Beds" value={data?.totalBeds ?? 0} icon={BedDouble} accent="neutral" loading={loading} />
        <StatCard
          label="Occupancy"
          value={data ? `${data.occupancyPct}%` : '—'}
          icon={TrendingUp}
          accent="primary"
          hint={data ? `${data.occupiedBeds} occ · ${data.availableBeds} avail` : undefined}
          loading={loading}
        />
        <StatCard label="Monthly Collection" value={fmt(data?.monthlyCollection)} icon={IndianRupee} accent="info" loading={loading} />
        <StatCard label="Outstanding Fees" value={fmt(data?.outstandingFees)} icon={Wallet} accent="error" loading={loading} />
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
      <div className="w-full min-w-0 grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {loading ? (
          <>
            <CardSkeleton className="h-64 sm:h-80 rounded-xl" />
            <CardSkeleton className="h-64 sm:h-80 rounded-xl" />
          </>
        ) : (
          <>
            <ChartCard title="Collection vs Expenses" description="Monthly financial trend">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.collectionTrend || []} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#111827', fontWeight: 600 }} stroke="#CBD5E1" />
                  <YAxis width={45} tick={{ fontSize: 10, fill: '#111827', fontWeight: 600 }} stroke="#CBD5E1" tickFormatter={(v) => `₹${v >= 1000 ? v / 1000 + 'k' : v}`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4, fontWeight: 600 }} />
                  <Bar dataKey="collection" name="Collection" fill="#E87545" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#18233A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Occupancy Trend" description="Bed occupancy percentage over time">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.occupancyTrend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E87545" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#E87545" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#111827', fontWeight: 600 }} stroke="#CBD5E1" />
                  <YAxis width={40} tick={{ fontSize: 10, fill: '#111827', fontWeight: 600 }} stroke="#CBD5E1" domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                  <Area type="monotone" dataKey="occupancy" name="Occupancy" stroke="#E87545" strokeWidth={2.5} fill="url(#occGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </>
        )}
      </div>

      {/* Recent activity + pending approvals */}
      <div className="w-full min-w-0 grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Recent Activity */}
        <div className="w-full min-w-0 rounded-xl border border-[#CBD5E1] bg-white p-3.5 sm:p-5 lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-2 sm:pb-2.5">
            <h3 className="card-title text-sm sm:text-base font-bold text-[#111827]">Recent Activity</h3>
            <span className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
              <Activity className="h-3.5 w-3.5" />
            </span>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} className="h-10 bg-white" />)}
            </div>
          ) : data?.recentActivity?.length ? (
            <ul className="space-y-2 divide-y divide-[#F1F5F9] min-w-0">
              {data.recentActivity.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-2.5 pt-2 text-xs text-[#111827] min-w-0">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#ECE9E1] text-[#E87545] border border-[#DDD8CC] mt-0.5">
                      <Activity className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[#111827] text-xs break-words leading-snug">{a.description}</p>
                      <p className="text-[10px] text-[#64748B] font-medium sm:hidden mt-0.5">{timeAgo(a.timestamp)}</p>
                    </div>
                  </div>
                  <span className="hidden sm:inline-block shrink-0 font-medium text-[#64748B] text-[11px] sm:text-xs">{timeAgo(a.timestamp)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-xs text-[#64748B] font-medium">No recent activity recorded.</p>
          )}
        </div>

        {/* Action Items */}
        <div className="w-full min-w-0 rounded-xl border border-[#CBD5E1] bg-white p-3.5 sm:p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-2 sm:pb-2.5">
            <h3 className="card-title text-sm sm:text-base font-bold text-[#111827]">Action Items</h3>
            <span className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg bg-[#ECE9E1] text-[#E87545] border border-[#DDD8CC]">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="space-y-2">
            <ActionRow label="Pending Approvals" count={data?.pendingApprovals ?? 0} variant="warning" />
            <ActionRow label="Pending Complaints" count={data?.pendingComplaints ?? 0} variant="error" />
            <ActionRow label="Outstanding Fees" count={data ? 1 : 0} value={data ? fmt(data.outstandingFees) : '—'} variant="error" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OwnerDashboardPage() {
  return (
    <PageErrorBoundary fallbackTitle="Unable to load Dashboard">
      <OwnerDashboardPageContent />
    </PageErrorBoundary>
  );
}

function ActionRow({ label, count, value, variant }: { label: string; count: number; value?: string; variant: 'warning' | 'error' | 'info' }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-2.5 transition-colors hover:bg-white min-w-0">
      <span className="text-xs font-semibold text-[#111827] truncate min-w-0 flex-1">{label}</span>
      <div className="shrink-0">
        {value ? (
          <Badge variant={variant} className="font-bold text-[11px]">{value}</Badge>
        ) : (
          <Badge variant={count > 0 ? variant : 'outline'} className="font-bold text-[11px]">{count} PENDING</Badge>
        )}
      </div>
    </div>
  );
}

const tooltipStyle = {
  background: '#FFFFFF',
  border: '1px solid #CBD5E1',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#111827',
  fontWeight: 700,
  boxShadow: 'none',
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
