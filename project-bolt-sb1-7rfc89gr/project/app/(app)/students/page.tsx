'use client';

import { useCallback, useEffect, useState } from 'react';
import { MoreHorizontal, UserPlus, Power, PowerOff, Eye, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { studentsApi } from '@/lib/api/students.api';
import { useAuth } from '@/lib/auth/auth-context';
import type { Paginated, PortalAccessStatus, Student, ApiError } from '@/lib/types';

export default function StudentsPage() {
  const { currentBranchId } = useAuth();
  const [data, setData] = useState<Paginated<Student>>({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [accessTarget, setAccessTarget] = useState<{ student: Student; next: PortalAccessStatus } | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await studentsApi.list({ page, pageSize: 10, search, branchId: currentBranchId || undefined });
      setData(res);
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load students.');
    } finally {
      setLoading(false);
    }
  }, [page, search, currentBranchId]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const toggleAccess = async () => {
    if (!accessTarget) return;
    setAccessLoading(true);
    try {
      const res = await studentsApi.setPortalAccess(accessTarget.student.id, accessTarget.next);
      setData((d) => ({
        ...d,
        items: d.items.map((s) => (s.id === res.student.id ? res.student : s)),
      }));
      toast.success(
        accessTarget.next === 'ENABLED'
          ? `Portal access enabled for ${accessTarget.student.name}`
          : `Portal access disabled for ${accessTarget.student.name}`,
      );
      setAccessTarget(null);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to update portal access.');
    } finally {
      setAccessLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await studentsApi.remove(deleteTarget.id);
      setData((d) => ({ ...d, items: d.items.filter((s) => s.id !== deleteTarget.id), total: d.total - 1 }));
      toast.success(`${deleteTarget.name} removed.`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to remove student.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const feeBadge = (s: Student) => {
    const map: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
      PAID: 'success', PARTIAL: 'warning', OVERDUE: 'error', NO_DUE: 'info',
    };
    return <Badge variant={map[s.feeStatus || 'NO_DUE']}>{s.feeStatus?.replace('_', ' ') || 'NO DUE'}</Badge>;
  };

  const columns: Column<Student>[] = [
    {
      key: 'name',
      header: 'Student',
      sortable: true,
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{s.name}</p>
          <p className="truncate text-xs text-muted-foreground">{s.email || s.phone || '—'}</p>
        </div>
      ),
    },
    { key: 'customerCode', header: 'Customer Code', cell: (s) => <span className="font-mono text-xs">{s.customerCode}</span> },
    { key: 'room', header: 'Room', cell: (s) => s.roomNumber || '—', hideOnMobile: true },
    { key: 'bed', header: 'Bed', cell: (s) => s.bedNumber || '—', hideOnMobile: true },
    {
      key: 'fee',
      header: 'Fee Status',
      cell: (s) => (
        <div className="flex flex-col items-start gap-1">
          {feeBadge(s)}
          {s.feeOutstanding ? <span className="text-xs text-muted-foreground">₹{s.feeOutstanding.toLocaleString('en-IN')} due</span> : null}
        </div>
      ),
    },
    {
      key: 'portal',
      header: 'Portal Access',
      cell: (s) => (
        <Badge variant={s.portalAccess === 'ENABLED' ? 'success' : s.portalAccess === 'PENDING' ? 'warning' : 'error'}>
          {s.portalAccess}
        </Badge>
      ),
    },
  ];

  const rowActions = (s: Student) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={`/students/${s.id}`} className="flex items-center"><Eye className="mr-2 h-4 w-4" /> View profile</a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {s.portalAccess === 'ENABLED' ? (
          <DropdownMenuItem className="text-amber-600" onClick={() => setAccessTarget({ student: s, next: 'DISABLED' })}>
            <PowerOff className="mr-2 h-4 w-4" /> Disable access
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem className="text-emerald-600" onClick={() => setAccessTarget({ student: s, next: 'ENABLED' })}>
            <Power className="mr-2 h-4 w-4" /> Give portal access
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-rose-600" onClick={() => setDeleteTarget(s)}>
          <Trash2 className="mr-2 h-4 w-4" /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Student Management"
        description="Admit students, manage portal access, and track fee status"
        actions={
          <Button asChild>
            <a href="/students/new"><UserPlus className="mr-2 h-4 w-4" /> Admit Student</a>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data.items}
        total={data.total}
        page={page}
        pageSize={data.pageSize}
        loading={loading}
        error={error}
        search={search}
        onSearchChange={(v) => { setPage(1); setSearch(v); }}
        onPageChange={setPage}
        onRetry={load}
        rowKey={(s) => s.id}
        rowActions={rowActions}
        emptyTitle="No students found"
        emptyDescription="Admit your first student to get started."
        emptyAction={{ label: 'Admit Student', onClick: () => (window.location.href = '/students/new') }}
      />

      <ConfirmDialog
        open={!!accessTarget}
        title={accessTarget?.next === 'ENABLED' ? 'Give Portal Access' : 'Disable Portal Access'}
        description={
          accessTarget?.next === 'ENABLED'
            ? `${accessTarget.student.name} will be able to log into the student portal. They will receive login instructions via email.`
            : `${accessTarget?.student.name} will immediately lose access to the student portal. They cannot log in until access is re-enabled.`
        }
        confirmLabel={accessTarget?.next === 'ENABLED' ? 'Enable Access' : 'Disable Access'}
        destructive={accessTarget?.next === 'DISABLED'}
        loading={accessLoading}
        onConfirm={toggleAccess}
        onCancel={() => setAccessTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove Student"
        description={`Are you sure you want to remove ${deleteTarget?.name}? This action cannot be undone.`}
        confirmLabel="Remove permanently"
        destructive
        loading={deleteLoading}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
