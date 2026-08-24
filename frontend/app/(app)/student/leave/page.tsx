'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarOff, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState, EmptyState } from '@/components/dashboard/states';
import { Badge, ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { leaveApi } from '@/lib/api/leave.api';
import { useAuth } from '@/lib/auth/auth-context';
import type { LeaveRequest, LeaveStatus, ApiError } from '@/lib/types';

import { SearchInput } from '@/components/ui/search-input';

export default function StudentLeavePage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ fromDate: '', toDate: '', reason: '' });

  const load = useCallback(async () => {
    if (!user?.studentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await leaveApi.getByStudent(user.studentId);
      setRequests(res);
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load leave requests.');
    } finally {
      setLoading(false);
    }
  }, [user?.studentId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fromDate || !form.toDate || !form.reason.trim() || !user?.studentId) {
      toast.error('Please fill in all fields.');
      return;
    }
    setSubmitting(true);
    try {
      await leaveApi.create({ studentId: user.studentId, ...form });
      toast.success('Leave request submitted.');
      setShowForm(false);
      setForm({ fromDate: '', toDate: '', reason: '' });
      load();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      await leaveApi.cancel(id);
      setRequests((r) => r.map((x) => (x.id === id ? { ...x, status: 'CANCELLED' as LeaveStatus } : x)));
      toast.success('Request cancelled.');
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to cancel.');
    }
  };

  const statusVariant: Record<LeaveStatus, 'warning' | 'success' | 'error' | 'info'> = {
    PENDING: 'warning', APPROVED: 'success', REJECTED: 'error', CANCELLED: 'info',
  };

  const filteredRequests = requests.filter((r) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (r.reason || '').toLowerCase().includes(q) ||
      (r.status || '').toLowerCase().includes(q) ||
      (r.fromDate ? new Date(r.fromDate).toLocaleDateString('en-IN') : '').toLowerCase().includes(q) ||
      (r.toDate ? new Date(r.toDate).toLocaleDateString('en-IN') : '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-3.5 sm:space-y-5">
      <PageHeader
        title="Leave Requests"
        description="Apply for leave and track your request status"
        actions={<Button onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" /> Apply for Leave</Button>}
      />

      {requests.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-[#F8FAFC] p-2.5 sm:p-3 rounded-xl border border-[#CBD5E1]">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search leave requests..."
            className="h-9 sm:h-10 text-xs sm:text-sm font-semibold"
            containerClassName="w-full sm:w-80"
          />
          <div className="text-xs font-bold text-[#64748B]">
            {search.trim() ? `Showing ${filteredRequests.length} matching requests` : `${requests.length} total applications`}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} className="h-20" />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !filteredRequests.length ? (
        <EmptyState
          icon={<CalendarOff className="h-6 w-6" />}
          title={search ? 'No matching leave requests' : 'No leave requests'}
          description={search ? `No requests match "${search}"` : 'You have not submitted any leave applications yet.'}
          action={{ label: 'Apply for Leave', onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="space-y-2.5">
          {filteredRequests.map((r) => (
            <div key={r.id} className="rounded-xl border border-[#CBD5E1] bg-white p-3.5 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{new Date(r.fromDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — {new Date(r.toDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{r.reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant[r.status]}>{r.status}</Badge>
                  {r.status === 'PENDING' && <Button variant="outline" size="sm" onClick={() => cancel(r.id)}>Cancel</Button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <form onSubmit={submit} className="relative w-full max-w-md space-y-3.5 sm:space-y-4 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-5">
            <h2 className="text-base font-semibold">Apply for Leave</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="from">From date</Label>
                <Input id="from" type="date" required value={form.fromDate} onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to">To date</Label>
                <Input id="to" type="date" required value={form.toDate} onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" required rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Explain the reason for your leave" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Submit Request
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
