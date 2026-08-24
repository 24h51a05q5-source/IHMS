'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState, EmptyState } from '@/components/dashboard/states';
import { Badge, ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { complaintsApi } from '@/lib/api/complaints.api';
import { getCachedData } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import type { Complaint, ComplaintPriority, ComplaintStatus, ApiError } from '@/lib/types';

import { SearchInput } from '@/components/ui/search-input';

export default function StudentComplaintsPage() {
  const { user } = useAuth();
  const cachedComplaints = user?.studentId ? getCachedData<Complaint[]>(`/complaints/student/${user.studentId}`) : null;
  const [complaints, setComplaints] = useState<Complaint[]>(() => cachedComplaints || []);
  const [loading, setLoading] = useState(() => !cachedComplaints);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'MAINTENANCE', priority: 'MEDIUM' as ComplaintPriority });

  const load = useCallback(async () => {
    if (!user?.studentId) return;
    try {
      const res = await complaintsApi.getByStudent(user.studentId);
      setComplaints(res);
      setError(null);
    } catch (err) {
      if (!complaints.length) {
        setError((err as ApiError)?.message || 'Unable to load complaints.');
      }
    } finally {
      setLoading(false);
    }
  }, [user?.studentId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim() || !user?.studentId) {
      toast.error('Please fill in all fields.');
      return;
    }
    setSubmitting(true);
    try {
      await complaintsApi.create({ studentId: user.studentId, ...form });
      toast.success('Complaint registered.');
      setShowForm(false);
      setForm({ title: '', description: '', category: 'MAINTENANCE', priority: 'MEDIUM' });
      load();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to register complaint.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusVariant: Record<ComplaintStatus, 'info' | 'warning' | 'success' | 'default'> = {
    OPEN: 'info', IN_PROGRESS: 'warning', RESOLVED: 'success', CLOSED: 'default',
  };
  const priorityVariant: Record<ComplaintPriority, 'default' | 'info' | 'warning' | 'error'> = {
    LOW: 'default', MEDIUM: 'info', HIGH: 'warning', URGENT: 'error',
  };

  const filteredComplaints = complaints.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (c.title || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      (c.category || '').toLowerCase().includes(q) ||
      (c.priority || '').toLowerCase().includes(q) ||
      (c.status || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Complaints"
        description="Register and track your complaints"
        actions={<Button onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" /> New Complaint</Button>}
      />

      {complaints.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-[#F8FAFC] p-2.5 sm:p-3 rounded-xl border border-[#CBD5E1]">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search your complaints..."
            className="h-9 sm:h-10 text-xs sm:text-sm font-semibold"
            containerClassName="w-full sm:w-80"
          />
          <div className="text-xs font-bold text-[#64748B]">
            {search.trim() ? `Showing ${filteredComplaints.length} matching complaints` : `${complaints.length} total registered`}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} className="h-20" />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !filteredComplaints.length ? (
        <EmptyState
          title={search ? 'No matching complaints found' : 'No complaints'}
          description={search ? `No complaints match "${search}". Try searching for another keyword.` : "You haven't registered any complaints yet."}
          action={!search ? { label: 'New Complaint', onClick: () => setShowForm(true) } : undefined}
        />
      ) : (
        <div className="space-y-2.5">
          {filteredComplaints.map((c) => (
            <div key={c.id} className="rounded-xl border border-[#CBD5E1] bg-white p-3.5 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-0.5 sm:space-y-1">
                  <p className="text-sm font-bold text-[#111827]">{c.title}</p>
                  <p className="text-xs sm:text-sm text-[#475569]">{c.description}</p>
                  <p className="text-[11px] text-[#64748B] font-semibold">{new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5 pt-1 sm:pt-0">
                  <Badge variant={priorityVariant[c.priority]}>{c.priority}</Badge>
                  <Badge variant={statusVariant[c.status]}>{c.status.replace('_', ' ')}</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <form onSubmit={submit} className="relative w-full max-w-md space-y-3.5 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-5">
            <h2 className="text-base font-semibold">Register Complaint</h2>
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Brief summary" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" required rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Describe the issue in detail" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                    <SelectItem value="MESS">Mess</SelectItem>
                    <SelectItem value="ELECTRICAL">Electrical</SelectItem>
                    <SelectItem value="CLEANLINESS">Cleanliness</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as ComplaintPriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Register
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
