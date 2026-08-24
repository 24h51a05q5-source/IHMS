'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, Plus, QrCode, Clock, CheckCircle2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { visitorsApi } from '@/lib/api/visitors.api';
import { studentsApi } from '@/lib/api/students.api';
import { getCachedData } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import type { Visitor, ApiError } from '@/lib/types';

function VisitorsPageContent() {
  const { hasRole } = useAuth();
  const cachedVisitors = getCachedData<{ items: Visitor[] }>('/visitors', { pageSize: 100 });
  const cachedStudents = getCachedData<{ items: any[] }>('/students', { pageSize: 100 });

  const [visitors, setVisitors] = useState<Visitor[]>(() => cachedVisitors?.items || []);
  const [students, setStudents] = useState<any[]>(() => cachedStudents?.items || []);
  const [loading, setLoading] = useState(() => !cachedVisitors?.items?.length);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    visitorName: '',
    phone: '',
    relation: 'Parent',
    purpose: 'Visiting Resident',
    studentId: '',
  });

  const loadData = useCallback(async () => {
    try {
      const [vRes, sRes] = await Promise.all([
        visitorsApi.list({ pageSize: 100 }),
        studentsApi.list({ pageSize: 100 }),
      ]);
      setVisitors(vRes?.items || []);
      setStudents(sRes?.items || []);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to load visitors.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.visitorName || !form.studentId) {
      toast.error('Visitor name and resident student are required.');
      return;
    }
    setSubmitting(true);
    try {
      await visitorsApi.checkIn(form);
      toast.success('Visitor check-in logged and digital pass issued!');
      setModalOpen(false);
      setForm({ visitorName: '', phone: '', relation: 'Parent', purpose: 'Visiting Resident', studentId: '' });
      loadData();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to log visitor.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOut = async (id: string) => {
    try {
      await visitorsApi.checkOut(id);
      toast.success('Visitor check-out completed successfully!');
      loadData();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to check out visitor.');
    }
  };

  const insideCount = visitors.filter((v) => v.status === 'CHECKED_IN').length;
  const exitedCount = visitors.filter((v) => v.status === 'CHECKED_OUT').length;

  const filtered = visitors.filter((v) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const matchesSearch =
      (v.visitorName || '').toLowerCase().includes(q) ||
      (v.studentName || '').toLowerCase().includes(q) ||
      (v.phone || '').toLowerCase().includes(q) ||
      (v.purpose || '').toLowerCase().includes(q) ||
      (v.relation || '').toLowerCase().includes(q) ||
      (v.status || '').toLowerCase().includes(q);
    return matchesSearch;
  });

  const columns: Column<any>[] = [
    {
      key: 'visitor',
      header: 'Visitor Details',
      cell: (v) => (
        <div>
          <p className="font-semibold text-foreground">{v.visitorName}</p>
          <p className="text-xs text-muted-foreground">{v.phone || '—'} • {v.relation || 'Guest'}</p>
        </div>
      ),
    },
    {
      key: 'student',
      header: 'Visiting Resident',
      cell: (v) => <span className="font-medium text-xs">{v.studentName || 'Resident'}</span>,
    },
    {
      key: 'purpose',
      header: 'Purpose',
      cell: (v) => <span className="text-xs text-muted-foreground">{v.purpose}</span>,
      hideOnMobile: true,
    },
    {
      key: 'checkInTime',
      header: 'Check-In',
      cell: (v) => <span className="text-xs font-mono">{v.checkInTime ? new Date(v.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (v) => (
        <Badge variant={v.status === 'CHECKED_IN' ? 'warning' : 'success'}>
          {v.status === 'CHECKED_IN' ? 'INSIDE HOSTEL' : 'CHECKED OUT'}
        </Badge>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      cell: (v) =>
        v.status === 'CHECKED_IN' && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => handleCheckOut(v.id)}
          >
            Check Out
          </Button>
        ),
    },
  ];

  const renderMobileVisitorCard = (v: any) => (
    <div className="w-full rounded-xl border border-[#CBD5E1] bg-white p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2 border-b border-[#E4E0D7] pb-2">
        <div>
          <p className="font-bold text-[#111827] text-sm">{v.visitorName}</p>
          <p className="text-xs text-[#64748B]">{v.phone || '—'} • {v.relation || 'Guest'}</p>
        </div>
        <Badge variant={v.status === 'CHECKED_IN' ? 'warning' : 'success'}>
          {v.status === 'CHECKED_IN' ? 'INSIDE' : 'EXITED'}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Visiting Resident</span>
          <p className="font-bold text-[#111827]">{v.studentName || 'Resident'}</p>
        </div>
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Check-In Time</span>
          <p className="font-mono text-[#111827]">{v.checkInTime ? new Date(v.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
        </div>
      </div>
      {v.status === 'CHECKED_IN' && (
        <div className="flex items-center justify-end border-t border-[#E4E0D7] pt-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs font-bold"
            onClick={() => handleCheckOut(v.id)}
          >
            Check Out
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visitor Passes & Gate Control"
        description="Issue verified visitor digital passes, track guest check-ins, and maintain real-time security records"
        action={
          hasRole('ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'WARDEN', 'SECURITY_GUARD') && (
            <Button onClick={() => setModalOpen(true)} className="gap-2 font-bold bg-[#E87545] hover:bg-[#D66434] text-white">
              <Plus className="h-4 w-4" />
              Issue Visitor Pass
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
        <StatCard title="Visitors Inside Now" value={insideCount} icon={Users} />
        <StatCard title="Total Check-Ins" value={visitors.length} icon={Clock} />
        <StatCard title="Exited Successfully" value={exitedCount} icon={CheckCircle2} />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        total={filtered.length}
        page={1}
        pageSize={filtered.length || 10}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by visitor name, phone, resident..."
        mobileRender={renderMobileVisitorCard}
        toolbarRight={
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="h-10 px-3.5 bg-white border-[#CBD5E1] text-[#111827] hover:bg-[#F8FAFC]"
            aria-label="Refresh visitors records"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        }
        rowKey={(v: any) => v.id || Math.random().toString()}
        emptyTitle="No visitors logged yet"
        emptyDescription="Click 'Issue Visitor Pass' to register a guest."
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <form onSubmit={handleCheckIn}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-primary" />
                Issue Visitor Gate Pass
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Resident Student *</label>
                <Select
                  value={form.studentId}
                  onValueChange={(val) => setForm({ ...form, studentId: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select resident" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.customerCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Visitor Name *</label>
                  <Input
                    placeholder="e.g. Ramesh Sharma"
                    value={form.visitorName}
                    onChange={(e) => setForm({ ...form, visitorName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Contact Phone</label>
                  <Input
                    placeholder="e.g. 9848011223"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Relationship</label>
                  <Select
                    value={form.relation}
                    onValueChange={(val) => setForm({ ...form, relation: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Parent">Parent</SelectItem>
                      <SelectItem value="Guardian">Guardian</SelectItem>
                      <SelectItem value="Sibling">Sibling</SelectItem>
                      <SelectItem value="Friend">Friend</SelectItem>
                      <SelectItem value="Delivery">Delivery / Courier</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Purpose of Visit</label>
                  <Input
                    placeholder="e.g. Fee payment & luggage drop"
                    value={form.purpose}
                    onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Issuing...' : 'Issue Pass'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function VisitorsPage() {
  return (
    <PageErrorBoundary fallbackTitle="Unable to load Visitor Passes">
      <VisitorsPageContent />
    </PageErrorBoundary>
  );
}
