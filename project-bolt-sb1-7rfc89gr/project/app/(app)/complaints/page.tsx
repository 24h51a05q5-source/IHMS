'use client';

import { useCallback, useEffect, useState } from 'react';
import { MoreHorizontal, MessageSquareWarning, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { complaintsApi } from '@/lib/api/complaints.api';
import { useAuth } from '@/lib/auth/auth-context';
import type { Complaint, ComplaintStatus, Paginated, ApiError } from '@/lib/types';

export default function OwnerComplaintsPage() {
  const { currentBranchId } = useAuth();
  const [data, setData] = useState<Paginated<Complaint>>({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await complaintsApi.list({ page, pageSize: 10, status: statusFilter as ComplaintStatus || undefined });
      setData(res);
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load complaints.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, currentBranchId]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const updateStatus = async (id: string, status: ComplaintStatus) => {
    try {
      await complaintsApi.updateStatus(id, status);
      setData((d) => ({ ...d, items: d.items.map((c) => (c.id === id ? { ...c, status } : c)) }));
      toast.success(`Marked as ${status.replace('_', ' ').toLowerCase()}.`);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to update.');
    }
  };

  const statusVariant: Record<ComplaintStatus, 'info' | 'warning' | 'success' | 'default'> = {
    OPEN: 'info', IN_PROGRESS: 'warning', RESOLVED: 'success', CLOSED: 'default',
  };

  const columns: Column<Complaint>[] = [
    { key: 'title', header: 'Title', cell: (c) => <div className="min-w-0"><p className="truncate font-medium">{c.title}</p><p className="truncate text-xs text-muted-foreground">{c.studentName || '—'}</p></div> },
    { key: 'category', header: 'Category', cell: (c) => c.category || '—', hideOnMobile: true },
    { key: 'priority', header: 'Priority', cell: (c) => <Badge variant={c.priority === 'URGENT' ? 'error' : c.priority === 'HIGH' ? 'warning' : 'info'}>{c.priority}</Badge> },
    { key: 'status', header: 'Status', cell: (c) => <Badge variant={statusVariant[c.status]}>{c.status.replace('_', ' ')}</Badge> },
    { key: 'date', header: 'Date', cell: (c) => new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), hideOnMobile: true },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Complaints" description="Review and resolve student and staff complaints" />
      <DataTable
        columns={columns}
        data={data.items}
        total={data.total}
        page={page}
        pageSize={data.pageSize}
        loading={loading}
        error={error}
        onPageChange={setPage}
        onRetry={load}
        rowKey={(c) => c.id}
        emptyTitle="No complaints found"
        emptyDescription="Complaints from students and staff will appear here."
        filters={
          <Select value={statusFilter} onValueChange={(v) => { setPage(1); setStatusFilter(v === 'ALL' ? '' : v); }}>
            <SelectTrigger className="w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="IN_PROGRESS">In progress</SelectItem>
              <SelectItem value="RESOLVED">Resolved</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
            </SelectContent>
          </Select>
        }
        rowActions={(c) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => updateStatus(c.id, 'IN_PROGRESS')}>Mark in progress</DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatus(c.id, 'RESOLVED')}><CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" /> Mark resolved</DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatus(c.id, 'CLOSED')}>Close complaint</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />
    </div>
  );
}
