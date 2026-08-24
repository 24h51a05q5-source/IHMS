'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Wallet, IndianRupee, CalendarCheck, MessageSquareWarning, CalendarOff,
  CreditCard, TrendingUp, Bell,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { ChartCard } from '@/components/dashboard/chart-card';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { Button } from '@/components/ui/button';
import { Badge, Money } from '@/components/dashboard/confirm-dialog';
import { reportsApi } from '@/lib/api/reports.api';
import { useAuth } from '@/lib/auth/auth-context';
import { useRealtimeEvent } from '@/lib/realtime/use-realtime';
import type { StudentDashboardData, ApiError } from '@/lib/types';

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportsApi.studentDashboard(user?.studentId);
      setData(res);
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load your dashboard.');
    } finally {
      setLoading(false);
    }
  }, [user?.studentId]);

  useEffect(() => { load(); }, [load]);

  useRealtimeEvent('fee.updated', load);
  useRealtimeEvent('notification.created', load);
  useRealtimeEvent('messMenu.updated', load);

  if (error) return <ErrorState message={error} onRetry={load} />;

  const attendanceData = [
    { month: 'Jan', present: 90 }, { month: 'Feb', present: 85 },
    { month: 'Mar', present: 92 }, { month: 'Apr', present: 88 },
    { month: 'May', present: 95 }, { month: 'Jun', present: 80 },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Welcome, ${user?.name?.split(' ')[0] || 'Student'}`}
        description={data?.profile?.customerCode ? `Customer Code: ${data.profile.customerCode}` : 'Your hostel portal'}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Outstanding Fee" value={data ? fmt(data.fee.outstanding) : '—'} icon={Wallet} accent={data?.fee.outstanding ? 'error' : 'success'} loading={loading} />
        <StatCard label="Total Fee" value={data ? fmt(data.fee.total) : '—'} icon={IndianRupee} accent="primary" loading={loading} />
        <StatCard label="Attendance" value={data?.attendancePct != null ? `${data.attendancePct}%` : '—'} icon={CalendarCheck} accent="info" loading={loading} />
        <StatCard label="Open Complaints" value={data?.pendingComplaints ?? 0} icon={MessageSquareWarning} accent="warning" loading={loading} />
      </div>

      {/* Fee summary + quick actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          {loading ? <CardSkeleton className="h-40" /> : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Hostel Fee Summary</h3>
                <Badge variant={data?.fee.outstanding ? 'warning' : 'success'}>
                  {data?.fee.outstanding ? 'Outstanding' : 'Fully Paid'}
                </Badge>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <FeeStat label="Total" value={data?.fee.total} />
                <FeeStat label="Paid" value={data?.fee.paid} tone="success" />
                <FeeStat label="Outstanding" value={data?.fee.outstanding} tone={data?.fee.outstanding ? 'error' : 'success'} />
              </div>
              {data?.fee.outstanding ? (
                <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Next due date</p>
                    <p className="text-sm font-medium">{data.fee.nextDueDate ? new Date(data.fee.nextDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</p>
                  </div>
                  <Button asChild>
                    <a href="/student/fees"><CreditCard className="mr-2 h-4 w-4" /> Pay Now</a>
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Quick links */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold">Quick Links</h3>
          <div className="grid grid-cols-2 gap-2">
            <QuickLink href="/student/fees" icon={IndianRupee} label="My Fees" />
            <QuickLink href="/student/attendance" icon={CalendarCheck} label="Attendance" />
            <QuickLink href="/student/leave" icon={CalendarOff} label="Apply Leave" />
            <QuickLink href="/student/complaints" icon={MessageSquareWarning} label="Complaints" />
            <QuickLink href="/student/mess" icon={TrendingUp} label="Mess Menu" />
            <QuickLink href="/student/notifications" icon={Bell} label="Notices" />
          </div>
        </div>
      </div>

      {/* Attendance chart */}
      <ChartCard title="Attendance Trend" description="Your monthly attendance percentage">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={attendanceData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" domain={[0, 100]} unit="%" />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
            <Area type="monotone" dataKey="present" name="Present" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#attGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Announcements */}
      {data?.announcements && data.announcements.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold">Announcements</h3>
          <ul className="space-y-2">
            {data.announcements.slice(0, 5).map((a) => (
              <li key={a.id} className="rounded-md border border-border px-3 py-2.5 text-sm">
                <p className="font-medium">{a.title}</p>
                <p className="mt-0.5 text-muted-foreground">{a.message}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FeeStat({ label, value, tone = 'neutral' }: { label: string; value?: number; tone?: 'neutral' | 'success' | 'error' }) {
  const tones = { neutral: 'text-foreground', success: 'text-emerald-600 dark:text-emerald-400', error: 'text-rose-600 dark:text-rose-400' };
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tones[tone]}`}><Money value={value || 0} /></p>
    </div>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <a href={href} className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-center transition-colors hover:border-primary/50 hover:bg-muted/30">
      <Icon className="h-5 w-5 text-primary" />
      <span className="text-xs font-medium">{label}</span>
    </a>
  );
}

const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'hsl(var(--foreground))',
};

function fmt(v?: number): string {
  if (v === undefined || v === null) return '—';
  return `₹${v.toLocaleString('en-IN')}`;
}
