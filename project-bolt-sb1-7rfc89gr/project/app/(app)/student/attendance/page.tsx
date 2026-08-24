'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState, EmptyState } from '@/components/dashboard/states';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { attendanceApi } from '@/lib/api/attendance.api';
import { useAuth } from '@/lib/auth/auth-context';
import type { AttendanceRecord, Paginated, ApiError } from '@/lib/types';

export default function StudentAttendancePage() {
  const { user } = useAuth();
  const [data, setData] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.studentId) return;
    setLoading(true);
    setError(null);
    try {
      const res: Paginated<AttendanceRecord> = await attendanceApi.getByStudent(user.studentId, { pageSize: 30 });
      setData(res.items);
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load attendance.');
    } finally {
      setLoading(false);
    }
  }, [user?.studentId]);

  useEffect(() => { load(); }, [load]);

  const statusVariant: Record<AttendanceRecord['status'], 'success' | 'error' | 'warning' | 'info'> = {
    PRESENT: 'success', ABSENT: 'error', LATE: 'warning', LEAVE: 'info', HOLIDAY: 'info',
  };

  return (
    <div className="space-y-5">
      <PageHeader title="My Attendance" description="Your daily attendance records" />
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} className="h-14" />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data.length ? (
        <EmptyState icon={<CalendarCheck className="h-6 w-6" />} title="No attendance records" description="Your attendance will appear here once recorded." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <ul className="divide-y divide-border">
            {data.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
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
