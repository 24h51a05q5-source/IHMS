'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, Users, BedDouble, CalendarCheck, MessageSquareWarning,
  UserCheck, Megaphone, Utensils, ArrowRight, Activity, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/dashboard/stat-card';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import { useAuth } from '@/lib/auth/auth-context';
import { studentsApi } from '@/lib/api/students.api';
import { roomsApi } from '@/lib/api/rooms.api';
import { complaintsApi } from '@/lib/api/complaints.api';
import { attendanceApi } from '@/lib/api/attendance.api';

function WardenDashboardContent() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalBeds: 0,
    occupiedBeds: 0,
    openComplaints: 0,
    presentToday: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [studentsRes, roomsRes, complaintsRes] = await Promise.all([
        studentsApi.list({ pageSize: 1 }).catch(() => ({ total: 0, items: [] })),
        roomsApi.list().catch(() => []),
        complaintsApi.list({ status: 'OPEN' }).catch(() => ({ total: 0, items: [] })),
      ]);

      let bedsCount = 0;
      let occupiedCount = 0;
      if (Array.isArray(roomsRes)) {
        for (const rm of (roomsRes as any[])) {
          bedsCount += Number(rm.totalBeds || rm.capacity || 0);
          occupiedCount += Number(rm.occupiedBeds || rm.occupied || 0);
        }
      }

      setStats({
        totalStudents: Number(studentsRes.total || 0),
        totalBeds: bedsCount,
        occupiedBeds: occupiedCount,
        openComplaints: Number(complaintsRes.total || (Array.isArray(complaintsRes.items) ? complaintsRes.items.length : 0)),
        presentToday: Number(studentsRes.total || 0),
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load Warden Dashboard metrics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (error) return <ErrorState message={error} onRetry={loadData} />;

  return (
    <div className="w-full max-w-full min-w-0 space-y-4 sm:space-y-6">
      {/* Welcome Hero Banner */}
      <div className="relative overflow-hidden rounded-xl bg-[#18233A] p-4 sm:p-6 text-white border border-[#283754]">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300 border border-white/10 mb-1">
              <ShieldCheck className="h-3.5 w-3.5 text-[#38BDF8]" /> Warden Operations Portal
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-white">
              Welcome back, {user?.name || 'Warden'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-medium">
              Assigned Hostel: <span className="font-bold text-white">{user?.hostelName || user?.organizationName || 'Main Hostel Branch'}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/attendance">
              <Button className="h-9 text-xs sm:text-sm font-bold bg-[#E87545] hover:bg-[#D66434] text-white gap-1.5">
                <CalendarCheck className="h-4 w-4" /> Mark Night Check
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Students"
          value={stats.totalStudents}
          icon={Users}
          accent="info"
          loading={loading}
        />
        <StatCard
          label="Bed Occupancy"
          value={stats.totalBeds > 0 ? `${Math.round((stats.occupiedBeds / stats.totalBeds) * 100)}%` : '—'}
          icon={BedDouble}
          accent="primary"
          hint={`${stats.occupiedBeds} occupied · ${stats.totalBeds - stats.occupiedBeds} available`}
          loading={loading}
        />
        <StatCard
          label="Night Check Attendance"
          value={stats.presentToday}
          icon={CalendarCheck}
          accent="success"
          hint="Daily Student Roll Call"
          loading={loading}
        />
        <StatCard
          label="Open Complaints"
          value={stats.openComplaints}
          icon={MessageSquareWarning}
          accent={stats.openComplaints > 0 ? 'error' : 'neutral'}
          loading={loading}
        />
      </div>

      {/* Operational Quick Actions Grid */}
      <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-5 space-y-4">
        <h2 className="text-sm sm:text-base font-bold text-[#111827]">Operational Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
          <Link href="/students" className="group">
            <div className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-3 text-center transition-all hover:bg-white hover:border-[#E87545] hover:shadow-xs space-y-1.5">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700 group-hover:bg-[#E87545] group-hover:text-white transition-colors">
                <Users className="h-4 w-4" />
              </div>
              <p className="text-xs font-bold text-[#111827]">Students</p>
            </div>
          </Link>

          <Link href="/rooms" className="group">
            <div className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-3 text-center transition-all hover:bg-white hover:border-[#E87545] hover:shadow-xs space-y-1.5">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 group-hover:bg-[#E87545] group-hover:text-white transition-colors">
                <BedDouble className="h-4 w-4" />
              </div>
              <p className="text-xs font-bold text-[#111827]">Rooms & Beds</p>
            </div>
          </Link>

          <Link href="/attendance" className="group">
            <div className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-3 text-center transition-all hover:bg-white hover:border-[#E87545] hover:shadow-xs space-y-1.5">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 group-hover:bg-[#E87545] group-hover:text-white transition-colors">
                <CalendarCheck className="h-4 w-4" />
              </div>
              <p className="text-xs font-bold text-[#111827]">Attendance</p>
            </div>
          </Link>

          <Link href="/visitors" className="group">
            <div className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-3 text-center transition-all hover:bg-white hover:border-[#E87545] hover:shadow-xs space-y-1.5">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-purple-700 group-hover:bg-[#E87545] group-hover:text-white transition-colors">
                <UserCheck className="h-4 w-4" />
              </div>
              <p className="text-xs font-bold text-[#111827]">Visitors</p>
            </div>
          </Link>

          <Link href="/complaints" className="group">
            <div className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-3 text-center transition-all hover:bg-white hover:border-[#E87545] hover:shadow-xs space-y-1.5">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-700 group-hover:bg-[#E87545] group-hover:text-white transition-colors">
                <MessageSquareWarning className="h-4 w-4" />
              </div>
              <p className="text-xs font-bold text-[#111827]">Complaints</p>
            </div>
          </Link>

          <Link href="/announcements" className="group">
            <div className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-3 text-center transition-all hover:bg-white hover:border-[#E87545] hover:shadow-xs space-y-1.5">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 group-hover:bg-[#E87545] group-hover:text-white transition-colors">
                <Megaphone className="h-4 w-4" />
              </div>
              <p className="text-xs font-bold text-[#111827]">Announcements</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function WardenDashboardPage() {
  return (
    <PageErrorBoundary fallbackTitle="Unable to load Warden Dashboard">
      <WardenDashboardContent />
    </PageErrorBoundary>
  );
}
