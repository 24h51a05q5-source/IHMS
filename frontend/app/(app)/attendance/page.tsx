'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Users, Clock, CheckCircle2, XCircle, Search, RefreshCw, Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { attendanceApi } from '@/lib/api/attendance.api';
import { leaveApi } from '@/lib/api/leave.api';
import { studentsApi } from '@/lib/api/students.api';
import { getCachedData } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import type { AttendanceRecord, LeaveRequest, ApiError } from '@/lib/types';

function AttendancePageContent() {
  const { hasRole } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const cachedAttendance = getCachedData<{ items: AttendanceRecord[] }>('/attendance', { date: selectedDate, pageSize: 100 });
  const cachedLeaves = getCachedData<{ items: LeaveRequest[] }>('/leave', { pageSize: 100 });
  const cachedStudents = getCachedData<{ items: any[] }>('/students', { pageSize: 100 });

  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => cachedAttendance?.items || []);
  const [leaves, setLeaves] = useState<LeaveRequest[]>(() => cachedLeaves?.items || []);
  const [students, setStudents] = useState<any[]>(() => cachedStudents?.items || []);
  const [loading, setLoading] = useState(() => !cachedAttendance?.items?.length);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [aRes, lRes, sRes] = await Promise.all([
        attendanceApi.list({ date: selectedDate, pageSize: 100 }),
        leaveApi.list({ pageSize: 100 }),
        studentsApi.list({ pageSize: 100 }),
      ]);
      setAttendance(aRes?.items || []);
      setLeaves(lRes?.items || []);
      setStudents(sRes?.items || []);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to load attendance.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleMark = async (studentId: string, status: AttendanceRecord['status']) => {
    try {
      await attendanceApi.mark({
        studentId,
        date: selectedDate,
        status,
      });
      toast.success(`Attendance marked as ${status}`);
      loadData();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to mark attendance.');
    }
  };

  const handleLeaveAction = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await leaveApi.updateStatus(id, status);
      toast.success(`Leave request ${status.toLowerCase()} successfully!`);
      loadData();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to update leave.');
    }
  };

  const presentCount = attendance.filter((a) => a.status === 'PRESENT').length;
  const absentCount = attendance.filter((a) => a.status === 'ABSENT').length;
  const pendingLeaves = leaves.filter((l) => l.status === 'PENDING').length;

  const attendanceColumns: Column<any>[] = [
    {
      key: 'student',
      header: 'Resident',
      cell: (a) => (
        <div>
          <p className="font-semibold text-foreground">{a.studentName || 'Resident'}</p>
          <p className="text-xs font-mono text-muted-foreground">{a.customerCode || a.studentId}</p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      cell: (a) => new Date(a.date).toLocaleDateString('en-IN'),
    },
    {
      key: 'checkIn',
      header: 'Check-in Time',
      cell: (a) => a.checkInTime || '—',
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Attendance Status',
      cell: (a) => (
        <Badge variant={a.status === 'PRESENT' ? 'success' : a.status === 'ABSENT' ? 'error' : 'warning'}>
          {a.status}
        </Badge>
      ),
    },
  ];

  const leaveColumns: Column<any>[] = [
    {
      key: 'resident',
      header: 'Resident',
      cell: (l) => (
        <div>
          <p className="font-semibold text-foreground">{l.studentName || 'Resident'}</p>
          <p className="text-xs font-mono text-muted-foreground">{l.customerCode || l.studentId}</p>
        </div>
      ),
    },
    {
      key: 'duration',
      header: 'Dates',
      cell: (l) => (
        <div className="text-xs">
          <span>{new Date(l.fromDate).toLocaleDateString('en-IN')}</span>
          <span className="text-muted-foreground"> → </span>
          <span>{new Date(l.toDate).toLocaleDateString('en-IN')}</span>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      cell: (l) => <span className="text-xs text-muted-foreground truncate max-w-[200px]">{l.reason}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (l) => (
        <Badge variant={l.status === 'APPROVED' ? 'success' : l.status === 'REJECTED' ? 'error' : 'warning'}>
          {l.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      cell: (l) =>
        l.status === 'PENDING' && hasRole('ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'WARDEN') ? (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-emerald-600 hover:bg-emerald-500/10 border-emerald-500/30"
              onClick={() => handleLeaveAction(l.id, 'APPROVED')}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-rose-600 hover:bg-rose-500/10 border-rose-500/30"
              onClick={() => handleLeaveAction(l.id, 'REJECTED')}
            >
              Reject
            </Button>
          </div>
        ) : null,
    },
  ];

  const filteredAttendance = attendance.filter((a) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (a.studentName || '').toLowerCase().includes(q) ||
      (a.customerCode || a.studentId || '').toLowerCase().includes(q) ||
      (a.status || '').toLowerCase().includes(q) ||
      (a.checkInTime || '').toLowerCase().includes(q) ||
      (a.date ? new Date(a.date).toLocaleDateString('en-IN') : '').toLowerCase().includes(q)
    );
  });

  const filteredLeaves = leaves.filter((l) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (l.studentName || '').toLowerCase().includes(q) ||
      (l.customerCode || l.studentId || '').toLowerCase().includes(q) ||
      (l.reason || '').toLowerCase().includes(q) ||
      (l.status || '').toLowerCase().includes(q) ||
      (l.fromDate ? new Date(l.fromDate).toLocaleDateString('en-IN') : '').toLowerCase().includes(q) ||
      (l.toDate ? new Date(l.toDate).toLocaleDateString('en-IN') : '').toLowerCase().includes(q)
    );
  });

  const renderMobileAttendanceCard = (a: any) => (
    <div className="w-full rounded-xl border border-[#CBD5E1] bg-white p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2 border-b border-[#E4E0D7] pb-2">
        <div>
          <p className="font-bold text-[#111827] text-sm">{a.studentName || 'Resident'}</p>
          <p className="font-mono text-xs font-bold text-[#E87545]">{a.customerCode || a.studentId}</p>
        </div>
        <Badge variant={a.status === 'PRESENT' ? 'success' : a.status === 'ABSENT' ? 'error' : 'warning'}>
          {a.status}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Date</span>
          <p className="font-bold text-[#111827]">{new Date(a.date).toLocaleDateString('en-IN')}</p>
        </div>
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Check-in</span>
          <p className="font-bold text-[#111827]">{a.checkInTime || '—'}</p>
        </div>
      </div>
    </div>
  );

  const renderMobileLeaveCard = (l: any) => (
    <div className="w-full rounded-xl border border-[#CBD5E1] bg-white p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2 border-b border-[#E4E0D7] pb-2">
        <div>
          <p className="font-bold text-[#111827] text-sm">{l.studentName || 'Resident'}</p>
          <p className="font-mono text-xs font-bold text-[#E87545]">{l.customerCode || l.studentId}</p>
        </div>
        <Badge variant={l.status === 'APPROVED' ? 'success' : l.status === 'REJECTED' ? 'error' : 'warning'}>
          {l.status}
        </Badge>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Duration</span>
          <span className="font-semibold text-[#111827]">
            {new Date(l.fromDate).toLocaleDateString('en-IN')} → {new Date(l.toDate).toLocaleDateString('en-IN')}
          </span>
        </div>
        {l.reason && (
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Reason</span>
            <p className="text-[#64748B] mt-0.5">{l.reason}</p>
          </div>
        )}
      </div>
      {l.status === 'PENDING' && hasRole('ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'WARDEN') && (
        <div className="flex items-center justify-end gap-2 border-t border-[#E4E0D7] pt-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs font-bold text-emerald-600 hover:bg-emerald-50 border-emerald-300"
            onClick={() => handleLeaveAction(l.id, 'APPROVED')}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs font-bold text-rose-600 hover:bg-rose-50 border-rose-300"
            onClick={() => handleLeaveAction(l.id, 'REJECTED')}
          >
            Reject
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-5.5">
      <PageHeader
        title="Attendance & Leave Logs"
        description="Real-time biometric and gate check-in logging, daily rosters, and student gate pass approvals"
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <StatCard title="Total Residents" value={students.length} icon={Users} />
        <StatCard title="Present Today" value={presentCount} icon={CheckCircle2} />
        <StatCard title="Absent Today" value={absentCount} icon={XCircle} />
        <StatCard title="Pending Leaves" value={pendingLeaves} icon={Clock} />
      </div>

      <Tabs defaultValue="attendance" className="space-y-3.5 sm:space-y-4">
        <TabsList className="bg-white border border-[#CBD5E1] rounded-lg p-1">
          <TabsTrigger value="attendance" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Daily Attendance
          </TabsTrigger>
          <TabsTrigger value="leaves" className="gap-2">
            <Clock className="h-4 w-4" />
            Leave Requests ({pendingLeaves})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-4">
          <DataTable
            columns={attendanceColumns}
            data={filteredAttendance}
            total={filteredAttendance.length}
            page={1}
            pageSize={filteredAttendance.length || 10}
            loading={loading}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by student name or ID..."
            mobileRender={renderMobileAttendanceCard}
            filters={
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-44 h-10 bg-white border-[#CBD5E1] text-[#111827]"
              />
            }
            toolbarRight={
              <Button variant="outline" size="sm" onClick={loadData} className="h-10 px-3.5 border-[#CBD5E1] bg-white text-[#111827] hover:bg-[#F8FAFC]" aria-label="Refresh attendance">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            }
            rowKey={(a: any) => a.id || Math.random().toString()}
            emptyTitle="No attendance logs found for this date"
            emptyDescription="Log daily attendance using the date selector above."
          />
        </TabsContent>

        <TabsContent value="leaves" className="space-y-4">
          <DataTable
            columns={leaveColumns}
            data={filteredLeaves}
            total={filteredLeaves.length}
            page={1}
            pageSize={filteredLeaves.length || 10}
            loading={loading}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by student name or ID..."
            mobileRender={renderMobileLeaveCard}
            toolbarRight={
              <Button variant="outline" size="sm" onClick={loadData} className="h-10 px-3.5 border-[#CBD5E1] bg-white text-[#111827] hover:bg-[#F8FAFC]" aria-label="Refresh leaves">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            }
            rowKey={(l: any) => l.id || Math.random().toString()}
            emptyTitle="No leave requests submitted"
            emptyDescription="Resident leave applications will appear here."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AttendancePage() {
  return (
    <PageErrorBoundary fallbackTitle="Unable to load Attendance Logs">
      <AttendancePageContent />
    </PageErrorBoundary>
  );
}
