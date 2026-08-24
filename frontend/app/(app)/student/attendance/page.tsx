'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState, EmptyState } from '@/components/dashboard/states';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { attendanceApi } from '@/lib/api/attendance.api';
import { getCachedData } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import type { AttendanceRecord, Paginated, ApiError } from '@/lib/types';

import { SearchInput } from '@/components/ui/search-input';

export default function StudentAttendancePage() {
  const { user } = useAuth();
  const cachedAttendance = user?.studentId ? getCachedData<Paginated<AttendanceRecord>>(`/attendance/student/${user.studentId}`, { pageSize: 30 }) : null;
  const [data, setData] = useState<AttendanceRecord[]>(() => cachedAttendance?.items || []);
  const [loading, setLoading] = useState(() => !cachedAttendance?.items?.length);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!user?.studentId) return;
    try {
      const res: Paginated<AttendanceRecord> = await attendanceApi.getByStudent(user.studentId, { pageSize: 30 });
      setData(res.items || []);
      setError(null);
    } catch (err) {
      if (!data.length) {
        setError((err as ApiError)?.message || 'Unable to load attendance.');
      }
    } finally {
      setLoading(false);
    }
  }, [user?.studentId]);

  useEffect(() => { load(); }, [load]);

  const statusVariant: Record<AttendanceRecord['status'], 'success' | 'error' | 'warning' | 'info'> = {
    PRESENT: 'success', ABSENT: 'error', LATE: 'warning', LEAVE: 'info', HOLIDAY: 'info',
  };

  const filteredAttendance = data.filter((r) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const dateFormatted = new Date(r.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).toLowerCase();
    return (
      (r.status || '').toLowerCase().includes(q) ||
      (r.checkInTime || '').toLowerCase().includes(q) ||
      dateFormatted.includes(q)
    );
  });

  return (
    <div className="space-y-3.5 sm:space-y-5">
      <PageHeader title="My Attendance" description="Your daily attendance records" />

      {data.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-[#F8FAFC] p-2.5 sm:p-3 rounded-xl border border-[#CBD5E1]">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search attendance by date, status, check-in..."
            className="h-9 sm:h-10 text-xs sm:text-sm font-semibold"
            containerClassName="w-full sm:w-80"
          />
          <div className="text-xs font-bold text-[#64748B]">
            {search.trim() ? `Showing ${filteredAttendance.length} matching logs` : `${data.length} total records`}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} className="h-14" />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !filteredAttendance.length ? (
        <EmptyState
          icon={<CalendarCheck className="h-6 w-6" />}
          title={search ? 'No matching attendance logs' : 'No attendance records'}
          description={search ? `No attendance logs match "${search}". Try searching for another date or status.` : 'Your attendance will appear here once recorded.'}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#CBD5E1] bg-white">
          <ul className="divide-y divide-[#CBD5E1]">
            {filteredAttendance.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {new Date(r.date).getDate()}
                  </div>
                  <div>
                    <p className="font-medium">{new Date(r.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
                    {r.checkInTime && <p className="text-xs text-muted-foreground">Check-in: {r.checkInTime}</p>}
                  </div>
                </div>
                <Badge variant={statusVariant[r.status]}>{r.status}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
