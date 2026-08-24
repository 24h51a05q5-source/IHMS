'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BedDouble, CalendarCheck, IndianRupee, Wallet, MessageSquareWarning,
  CreditCard, ChevronRight, Megaphone, AlertCircle, ShieldAlert, ShieldCheck,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/dashboard/stat-card';
import { ChartCard } from '@/components/dashboard/chart-card';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { Badge, Money } from '@/components/dashboard/confirm-dialog';
import { reportsApi } from '@/lib/api/reports.api';
import { announcementsApi } from '@/lib/api/announcements.api';
import { getCachedData } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { useRealtimeEvent } from '@/lib/realtime/use-realtime';
import type { StudentDashboardData, Announcement, ApiError } from '@/lib/types';

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<StudentDashboardData | null>(() =>
    getCachedData<StudentDashboardData>('/dashboard/student')
  );
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState<boolean>(() => !data);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [res, annRes] = await Promise.allSettled([
        reportsApi.studentDashboard(),
        announcementsApi.studentList(),
      ]);
      if (res.status === 'fulfilled') {
        setData(res.value);
        setError(null);
      }
      if (annRes.status === 'fulfilled') {
        setAnnouncements(annRes.value || []);
      }
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load student dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeEvent('announcement.created', load);
  useRealtimeEvent('payment.success', load);
  useRealtimeEvent('fee.updated', load);
  useRealtimeEvent('complaint.updated', load);
  useRealtimeEvent('leave.updated', load);

  if (error) return <ErrorState message={error} onRetry={load} />;

  const attendanceData = [
    { month: 'Jun', present: 92 },
    { month: 'Jul', present: 88 },
    { month: 'Aug', present: 95 },
    { month: 'Sep', present: 90 },
    { month: 'Oct', present: 96 },
    { month: 'Nov', present: 94 },
  ];

  const studentName = user?.name ? user.name : 'Student';

  return (
    <div className="space-y-4 sm:space-y-5.5">
      {/* Welcome Hero Banner */}
      <div className="relative overflow-hidden rounded-xl bg-[#18233A] p-4 sm:p-6 lg:p-7 text-white border border-[#283754]">
        <div className="relative z-10 flex flex-col gap-4 sm:gap-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-sky-300 border border-white/10 mb-0.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#38BDF8]" /> Verified Student Portal
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white">
              Welcome back, {studentName}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-medium">
              Student ID: <span className="font-mono font-bold text-sky-300">{data?.profile?.customerCode || 'STU-001'}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5 sm:gap-3 shrink-0">
            <Link href="/student/fees">
              <Button className="gap-1.5 bg-[#E87545] hover:bg-[#D66434] text-white font-bold">
                <CreditCard className="h-4 w-4" /> Pay Fees
              </Button>
            </Link>
            <Link href="/student/mess">
              <Button variant="outline" className="bg-white/10 hover:bg-white/20 text-white border-white/20 hover:text-white font-bold">
                Mess Menu
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Accommodation Info Banner */}
      <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-[#CBD5E1] pb-2.5 sm:pb-3 mb-3.5 sm:mb-4">
          <div>
            <h3 className="text-base font-black text-[#000000]">Your Accommodation</h3>
            <p className="text-xs font-semibold text-[#64748B]">Current hostel room and bed allocation</p>
          </div>
          <Button variant="outline" size="sm" asChild className="font-bold">
            <Link href="/student/room">View Room Details</Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 text-xs">
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Hostel</span>
            <p className="mt-1 text-sm font-black text-[#111827] truncate">{data?.profile?.hostelName || user?.hostelName || user?.organizationName || 'Hostel'}</p>
          </div>
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Building & Floor</span>
            <p className="mt-1 text-sm font-black text-[#111827]">Building A · Floor 1</p>
          </div>
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Room Number</span>
            <p className="mt-1 text-sm font-black text-[#111827] font-mono">{data?.profile?.roomNumber || '101'}</p>
          </div>
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Bed Number</span>
            <p className="mt-1 text-sm font-black text-[#E87545] font-mono">{data?.profile?.bedNumber || 'B01'}</p>
          </div>
        </div>
      </div>

      {/* Announcements Widget */}
      {announcements.length > 0 && (
        <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-5 lg:p-6 space-y-3 sm:space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#CBD5E1] pb-2.5 sm:pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FEE2E2] text-[#C62828] border border-[#FECACA]">
                <Megaphone className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-[#000000]">Hostel Announcements</h3>
                  {announcements.some((a) => !a.isRead) && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#C62828] bg-[#FEE2E2] px-2 py-0.5 rounded-full">
                      {announcements.filter((a) => !a.isRead).length} New
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-[#64748B]">Official updates from hostel administration</p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild className="font-bold">
              <Link href="/student/announcements" className="gap-1">
                View All <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-2.5 sm:gap-3 sm:grid-cols-2">
            {announcements.slice(0, 2).map((ann) => {
              const isUrgent = ann.priority === 'URGENT';
              const isImportant = ann.priority === 'IMPORTANT';

              const cardStyle = isUrgent
                ? 'border-l-4 border-l-[#C62828] border-[#FECACA] bg-[#FFFBFB]'
                : isImportant
                  ? 'border-l-4 border-l-[#E87545] border-[#FED7AA] bg-[#FFFDF8]'
                  : 'border border-[#CBD5E1] bg-[#F8FAFC]';

              return (
                <Link
                  key={ann.id}
                  href="/student/announcements"
                  className={`rounded-xl p-3 sm:p-3.5 transition-all duration-150 hover:bg-[#F1F5F9] ${cardStyle} block space-y-1`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-sm text-[#111827] line-clamp-1">{ann.title}</span>
                    {isUrgent ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-[#FEE2E2] text-[#C62828] shrink-0">
                        <ShieldAlert className="h-3 w-3" /> URGENT
                      </span>
                    ) : isImportant ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-[#FEF3C7] text-[#C94F18] shrink-0">
                        <AlertCircle className="h-3 w-3" /> IMPORTANT
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs font-semibold text-[#475569] line-clamp-2 leading-relaxed">{ann.message}</p>
                  <p className="text-[10px] font-bold text-[#64748B] pt-0.5">
                    Posted: {new Date(ann.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Outstanding Fee" value={data ? fmt(data.fee.outstanding) : '—'} icon={Wallet} accent={data?.fee.outstanding ? 'error' : 'neutral'} loading={loading} />
        <StatCard label="Total Fee" value={data ? fmt(data.fee.total) : '—'} icon={IndianRupee} accent="primary" loading={loading} />
        <StatCard label="Attendance" value={data?.attendancePct != null ? `${data.attendancePct}%` : '—'} icon={CalendarCheck} accent="info" loading={loading} />
        <StatCard label="Open Complaints" value={data?.pendingComplaints ?? 0} icon={MessageSquareWarning} accent="neutral" loading={loading} />
      </div>

      {/* Fee summary + quick actions */}
      <div className="grid gap-3.5 sm:gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-5 lg:p-6 lg:col-span-2 space-y-3 sm:space-y-4">
          {loading ? <CardSkeleton className="h-40 bg-[#F8FAFC]" /> : (
            <>
              <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-2.5 sm:pb-3">
                <h3 className="text-base font-black text-[#000000]">Hostel Fee Overview</h3>
                <Badge variant={data?.fee.outstanding ? 'warning' : 'success'}>
                  {data?.fee.outstanding ? 'Outstanding Balance' : 'Fully Settled'}
                </Badge>
              </div>
              <div className="grid gap-2.5 sm:gap-4 sm:grid-cols-3">
                <FeeStat label="Total Fee" value={data?.fee.total} />
                <FeeStat label="Total Paid" value={data?.fee.paid} tone="success" />
                <FeeStat label="Outstanding" value={data?.fee.outstanding} tone={data?.fee.outstanding ? 'error' : 'neutral'} />
              </div>
              {data?.fee.outstanding ? (
                <div className="flex flex-col gap-2.5 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[11px] font-bold text-[#64748B] uppercase">Upcoming Due Date</p>
                    <p className="text-xs font-black text-[#111827] mt-0.5">{data.fee.nextDueDate ? new Date(data.fee.nextDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</p>
                  </div>
                  <Button size="sm" asChild className="font-bold bg-[#E87545] hover:bg-[#D66434] text-white">
                    <Link href="/student/fees"><CreditCard className="mr-1.5 h-3.5 w-3.5" /> Pay Now</Link>
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Quick links */}
        <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-5 lg:p-6 space-y-3 sm:space-y-3.5">
          <h3 className="text-base font-black text-[#000000] border-b border-[#CBD5E1] pb-2.5 sm:pb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
            <QuickLink href="/student/room" icon={BedDouble} label="My Room" />
            <QuickLink href="/student/fees" icon={IndianRupee} label="My Fees" />
            <QuickLink href="/student/profile" icon={Wallet} label="My Profile" />
            <QuickLink href="/student/announcements" icon={Megaphone} label="Announcements" />
            <QuickLink href="/student/attendance" icon={CalendarCheck} label="Attendance" />
            <QuickLink href="/student/complaints" icon={MessageSquareWarning} label="Complaints" />
          </div>
        </div>
      </div>

      {/* Attendance chart */}
      <ChartCard title="Attendance Trend" description="Your monthly attendance percentage">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={attendanceData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#E87545" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#E87545" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#111827', fontWeight: 600 }} stroke="#CBD5E1" />
            <YAxis tick={{ fontSize: 11, fill: '#111827', fontWeight: 600 }} stroke="#CBD5E1" domain={[0, 100]} unit="%" />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
            <Area type="monotone" dataKey="present" name="Present" stroke="#E87545" strokeWidth={2.5} fill="url(#attGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function FeeStat({ label, value, tone = 'neutral' }: { label: string; value?: number; tone?: 'neutral' | 'success' | 'error' }) {
  const tones = {
    neutral: 'text-[#111827]',
    success: 'text-[#087A45]',
    error: 'text-[#C62828]',
  };
  return (
    <div className="rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-3 sm:p-3.5">
      <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">{label}</p>
      <p className={`mt-0.5 sm:mt-1 text-lg sm:text-xl font-black font-mono ${tones[tone]}`}><Money value={value || 0} /></p>
    </div>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 sm:gap-1.5 rounded-lg border border-[#CBD5E1] bg-white p-2.5 sm:p-3 text-center transition-colors duration-150 hover:border-[#E87545] hover:bg-[#F8FAFC]"
    >
      <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-[#E87545]" />
      <span className="text-xs font-bold text-[#111827]">{label}</span>
    </Link>
  );
}

const tooltipStyle = {
  background: '#FFFFFF',
  border: '1px solid #CBD5E1',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#000000',
  fontWeight: 700,
  boxShadow: 'none',
};

function fmt(v?: number): string {
  if (v === undefined || v === null) return '—';
  return `₹${v.toLocaleString('en-IN')}`;
}
