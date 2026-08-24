'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  MoreHorizontal,
  UserPlus,
  Power,
  PowerOff,
  Eye,
  EyeOff,
  Trash2,
  KeyRound,
  Check,
  X,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import { studentsApi } from '@/lib/api/students.api';
import { getCachedData, clearApiCache } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import type { Paginated, Student, ApiError } from '@/lib/types';

interface SuccessModalData {
  title: string;
  studentName: string;
  studentId: string;
  message: string;
}

function StudentsPageContent() {
  const { currentBranchId } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const cachedData = getCachedData<Paginated<Student>>('/students', { page, pageSize: 10, search: search || undefined, branchId: currentBranchId || undefined });
  const [data, setData] = useState<Paginated<Student>>(() => {
    if (cachedData && typeof cachedData === 'object') {
      if (Array.isArray((cachedData as any).items)) return cachedData;
      if (Array.isArray(cachedData)) return { items: cachedData, total: (cachedData as any).length, page: 1, pageSize: 10, totalPages: Math.ceil((cachedData as any).length / 10) || 1 };
    }
    return { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
  });
  const [loading, setLoading] = useState(() => !cachedData);
  const [error, setError] = useState<string | null>(null);

  // Enable Access Modal
  const [enableModalTarget, setEnableModalTarget] = useState<Student | null>(null);
  const [enableTempPw, setEnableTempPw] = useState('');
  const [enableConfirmPw, setEnableConfirmPw] = useState('');
  const [showEnablePw, setShowEnablePw] = useState(false);
  const [showEnableConfirmPw, setShowEnableConfirmPw] = useState(false);
  const [enableLoading, setEnableLoading] = useState(false);

  // Disable Access Confirmation Dialog
  const [disableTarget, setDisableTarget] = useState<Student | null>(null);
  const [disableLoading, setDisableLoading] = useState(false);

  // Reset Password Modal
  const [resetModalTarget, setResetModalTarget] = useState<Student | null>(null);
  const [resetTempPw, setResetTempPw] = useState('');
  const [resetConfirmPw, setResetConfirmPw] = useState('');
  const [showResetPw, setShowResetPw] = useState(false);
  const [showResetConfirmPw, setShowResetConfirmPw] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Success Confirmation Modal
  const [successModal, setSuccessModal] = useState<SuccessModalData | null>(null);

  // Delete Target
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await studentsApi.list({ page, pageSize: 10, search, branchId: currentBranchId || undefined });
      if (res) {
        if (Array.isArray(res)) {
          setData({ items: res, total: res.length, page: 1, pageSize: 10, totalPages: Math.ceil(res.length / 10) || 1 });
        } else if (res.items && Array.isArray(res.items)) {
          setData(res);
        } else {
          setData({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
        }
      } else {
        setData({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
      }
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load students.');
      setData((prev) => prev || { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
    } finally {
      setLoading(false);
    }
  }, [page, search, currentBranchId]);

  useEffect(() => {
    load();
  }, [load]);

  // Validation rules for enabling portal
  const enableMinLen = enableTempPw.length >= 8;
  const enableUpper = /[A-Z]/.test(enableTempPw);
  const enableLower = /[a-z]/.test(enableTempPw);
  const enableNum = /[0-9]/.test(enableTempPw);
  const enableMatch = enableTempPw.length > 0 && enableTempPw === enableConfirmPw;
  const enableIsValid = enableMinLen && enableUpper && enableLower && enableNum && enableMatch;

  // Validation rules for resetting password
  const resetMinLen = resetTempPw.length >= 8;
  const resetUpper = /[A-Z]/.test(resetTempPw);
  const resetLower = /[a-z]/.test(resetTempPw);
  const resetNum = /[0-9]/.test(resetTempPw);
  const resetMatch = resetTempPw.length > 0 && resetTempPw === resetConfirmPw;
  const resetIsValid = resetMinLen && resetUpper && resetLower && resetNum && resetMatch;

  const handleEnableAccess = async () => {
    if (!enableModalTarget) return;

    setEnableLoading(true);
    try {
      const targetId = enableModalTarget.id || enableModalTarget.studentId || enableModalTarget.customerCode;
      const res = await studentsApi.setPortalAccess(targetId, 'ENABLED');
      setData((d) => ({
        ...d,
        items: d.items.map((s) =>
          (s.id === res.student.id || s.customerCode === res.student.customerCode || s.studentId === res.student.studentId || s.id === enableModalTarget.id)
            ? { ...s, ...res.student, portalAccess: 'ENABLED' }
            : s
        ),
      }));

      const target = enableModalTarget;
      setEnableModalTarget(null);
      setEnableTempPw('');
      setEnableConfirmPw('');

      setSuccessModal({
        title: 'Activation OTP Sent Successfully',
        studentName: target.name,
        studentId: target.studentId || target.customerCode,
        message: "Activation OTP sent successfully to the student's registered email. The student will use this OTP to activate the account and create their own secure password.",
      });
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to send activation OTP.');
    } finally {
      setEnableLoading(false);
    }
  };

  const handleDisableAccess = async () => {
    if (!disableTarget) return;
    setDisableLoading(true);
    try {
      const targetId = disableTarget.id || disableTarget.studentId || disableTarget.customerCode;
      const res = await studentsApi.setPortalAccess(targetId, 'DISABLED');
      setData((d) => ({
        ...d,
        items: d.items.map((s) =>
          (s.id === res.student.id || s.customerCode === res.student.customerCode || s.studentId === res.student.studentId || s.id === disableTarget.id)
            ? { ...s, ...res.student, portalAccess: 'DISABLED' }
            : s
        ),
      }));
      toast.success(`Portal access disabled for ${disableTarget.name}`);
      setDisableTarget(null);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to disable portal access.');
    } finally {
      setDisableLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalTarget || !resetIsValid) return;

    setResetLoading(true);
    try {
      const targetId = resetModalTarget.id || resetModalTarget.studentId || resetModalTarget.customerCode;
      const res = await studentsApi.resetPassword(targetId, resetTempPw);
      setData((d) => ({
        ...d,
        items: d.items.map((s) =>
          (s.id === resetModalTarget.id || s.customerCode === resetModalTarget.customerCode || s.studentId === resetModalTarget.studentId || s.customerCode === res.customerCode || s.studentId === res.studentId)
            ? { ...s, portalAccess: 'ENABLED' }
            : s
        ),
      }));

      const target = resetModalTarget;
      setResetModalTarget(null);
      setResetTempPw('');
      setResetConfirmPw('');

      setSuccessModal({
        title: 'Student Password Reset Successfully',
        studentName: target.name,
        studentId: target.studentId || target.customerCode,
        message: 'The new temporary password has been set. The student must change this password upon their next login.',
      });
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to reset student password.');
    } finally {
      setResetLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteLoading) return;
    setDeleteLoading(true);
    try {
      const targetId = deleteTarget.id || deleteTarget.studentId || deleteTarget.customerCode;
      await studentsApi.remove(targetId);
      clearApiCache('/students');
      clearApiCache('/dashboard');
      setData((d) => ({
        ...d,
        items: d.items.filter(
          (s) => s.id !== deleteTarget.id && s.studentId !== deleteTarget.studentId && s.customerCode !== deleteTarget.customerCode
        ),
        total: Math.max(0, d.total - 1),
      }));
      toast.success(`${deleteTarget.name} removed successfully.`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to remove student.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const feeBadge = (s?: Student | null) => {
    if (!s) return <Badge variant="outline">NO DUE</Badge>;
    const status = String(s.feeStatus || 'NO_DUE').toUpperCase();
    const map: Record<string, 'success' | 'warning' | 'error' | 'outline'> = {
      PAID: 'success',
      PARTIAL: 'warning',
      OVERDUE: 'error',
      NO_DUE: 'outline',
    };
    return <Badge variant={map[status] || 'outline'}>{status.replace(/_/g, ' ')}</Badge>;
  };

  const columns: Column<Student>[] = [
    {
      key: 'name',
      header: 'Student',
      sortable: true,
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-black text-black">{s?.name || (s as any)?.fullName || 'Unnamed Student'}</p>
          <p className="truncate text-xs font-semibold text-slate-500">{s?.email || s?.phone || '—'}</p>
        </div>
      ),
    },
    {
      key: 'customerCode',
      header: 'Student ID',
      cell: (s) => (
        <span className="font-mono text-xs font-black text-[#E87545]">
          {s?.studentId || s?.customerCode || '—'}
        </span>
      ),
    },
    { key: 'room', header: 'Room', cell: (s) => <span className="font-bold text-black">{s?.roomNumber || '—'}</span>, hideOnMobile: true },
    { key: 'bed', header: 'Bed', cell: (s) => <span className="font-bold text-black">{s?.bedNumber || '—'}</span>, hideOnMobile: true },
    {
      key: 'fee',
      header: 'Fee Status',
      cell: (s) => (
        <div className="flex flex-col items-start gap-1">
          {feeBadge(s)}
          {s?.feeOutstanding && Number(s.feeOutstanding) > 0 ? (
            <span className="text-xs font-bold text-[#C62828]">₹{Number(s.feeOutstanding).toLocaleString('en-IN')} due</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'portal',
      header: 'Portal Access',
      cell: (s) => (
        <Badge variant={s?.portalAccess === 'ENABLED' ? 'success' : 'outline'}>
          {s?.portalAccess === 'ENABLED' ? 'Active' : 'Disabled'}
        </Badge>
      ),
    },
  ];

  const rowActions = (s?: Student | null) => {
    if (!s) return null;
    const studentId = s.id || s.studentId || s.customerCode;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-[#ECE9E1]" aria-label="Actions">
            <MoreHorizontal className="h-4 w-4 text-black" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 rounded-xl border border-[#CBD5E1] bg-white">
          <DropdownMenuItem asChild>
            <a href={`/students/${studentId}`} className="flex items-center font-bold text-black hover:bg-[#ECE9E1] cursor-pointer">
              <Eye className="mr-2 h-4 w-4 text-[#E87545]" /> View Student
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-[#CBD5E1]" />
          {s.portalAccess === 'ENABLED' ? (
            <>
              <DropdownMenuItem
                className="text-[#C94F18] font-bold focus:text-[#C94F18] hover:bg-[#FFF3EB] cursor-pointer"
                onClick={() => setDisableTarget(s)}
              >
                <PowerOff className="mr-2 h-4 w-4" /> Disable Portal Access
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-[#E87545] font-bold focus:text-[#E87545] hover:bg-[#FFF3EB] cursor-pointer"
                onClick={() => {
                  setResetModalTarget(s);
                  setResetTempPw('');
                  setResetConfirmPw('');
                }}
              >
                <KeyRound className="mr-2 h-4 w-4" /> Reset Portal Password
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              className="text-[#087A45] font-bold focus:text-[#087A45] hover:bg-[#E8F5ED] cursor-pointer"
              onClick={() => {
                setEnableModalTarget(s);
                setEnableTempPw('');
                setEnableConfirmPw('');
              }}
            >
              <ShieldCheck className="mr-2 h-4 w-4" /> Enable Portal Access
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="bg-[#CBD5E1]" />
          <DropdownMenuItem className="text-[#C62828] font-bold focus:text-[#C62828] hover:bg-[#FEE2E2] cursor-pointer" onClick={() => setDeleteTarget(s)}>
            <Trash2 className="mr-2 h-4 w-4" /> Remove Student
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const studentList = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data)
    ? (data as unknown as Student[])
    : [];

  const filteredStudents = studentList.filter((s) => {
    if (!s) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (s.name || (s as any)?.fullName || '').toLowerCase().includes(q) ||
      (s.customerCode || s.studentId || '').toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (s.roomNumber || '').toLowerCase().includes(q) ||
      (s.bedNumber || '').toLowerCase().includes(q) ||
      (s.guardianName || '').toLowerCase().includes(q)
    );
  });

  const renderMobileStudentCard = (s: Student) => {
    const studentId = s.id || s.studentId || s.customerCode;
    return (
      <div className="w-full rounded-xl border border-[#CBD5E1] bg-white p-3.5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-[#E4E0D7] pb-2">
          <div className="min-w-0">
            <a
              href={`/students/${studentId}`}
              className="font-bold text-[#111827] text-sm hover:text-[#E87545] transition-colors truncate block"
            >
              {s.name || (s as any)?.fullName || 'Unnamed Student'}
            </a>
            <p className="font-mono text-xs font-bold text-[#E87545]">{s.studentId || s.customerCode || '—'}</p>
          </div>
          <Badge variant={s.portalAccess === 'ENABLED' ? 'success' : 'outline'} className="font-bold text-[11px] shrink-0">
            {s.portalAccess === 'ENABLED' ? 'Portal Active' : 'No Access'}
          </Badge>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Room & Bed</span>
            <p className="font-bold text-[#111827]">
              {s.roomNumber ? `Room ${s.roomNumber}` : 'Unassigned'} • {s.bedNumber ? `Bed ${s.bedNumber}` : '—'}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Contact</span>
            <p className="font-semibold text-[#111827] truncate">{s.phone || s.email || '—'}</p>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Fee Status</span>
            <div className="pt-0.5">{feeBadge(s)}</div>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Outstanding</span>
            <p className={`font-bold font-mono ${s.feeOutstanding && Number(s.feeOutstanding) > 0 ? 'text-[#C62828]' : 'text-slate-500'}`}>
              ₹{(Number(s.feeOutstanding) || 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[#E4E0D7] pt-2.5">
          <a
            href={`/students/${studentId}`}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#E87545] hover:underline"
          >
            <Eye className="h-3.5 w-3.5" /> View Profile
          </a>
          <div className="flex items-center gap-1.5">{rowActions(s)}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Student Management"
        description="Admit students, manage portal access, and track fee status"
        actions={
          <Button asChild className="gap-1.5 font-bold bg-[#E87545] hover:bg-[#D66434] text-white">
            <a href="/students/new">
              <UserPlus className="h-4 w-4" /> Admit Student
            </a>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filteredStudents}
        total={data?.total ?? filteredStudents.length}
        page={page}
        pageSize={data?.pageSize || 10}
        loading={loading}
        error={error}
        search={search}
        searchPlaceholder="Search by student name, ID, phone, email, room, bed..."
        mobileRender={renderMobileStudentCard}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        onPageChange={setPage}
        onRetry={load}
        rowKey={(s) => s?.id || s?.studentId || s?.customerCode || Math.random().toString()}
        rowActions={rowActions}
        emptyTitle="No students found"
        emptyDescription="Admit your first student to get started."
        emptyAction={{ label: 'Admit Student', onClick: () => (window.location.href = '/students/new') }}
      />

      {/* ENABLE PORTAL ACCESS CONFIRMATION MODAL */}
      <Dialog
        open={!!enableModalTarget}
        onOpenChange={(open) => {
          if (!open) {
            setEnableModalTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center text-lg font-bold">Enable Student Portal Access</DialogTitle>
          </DialogHeader>

          {enableModalTarget && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Student:</span>
                <span className="font-semibold text-foreground">{enableModalTarget.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Student ID:</span>
                <span className="font-mono font-bold text-primary">{enableModalTarget.studentId || enableModalTarget.customerCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Registered Email:</span>
                <span className="font-medium text-foreground">{enableModalTarget.email || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hostel:</span>
                <span className="font-medium text-foreground">{enableModalTarget.hostelName || 'Main Hostel'}</span>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground leading-relaxed text-center px-1">
            An activation OTP will be sent to the student&apos;s registered email. The student will use this OTP to securely activate their portal and create their own password.
          </p>

          <DialogFooter className="pt-2 sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEnableModalTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleEnableAccess}
              disabled={enableLoading}
              className="bg-[#E87545] hover:bg-[#D66434] text-white font-bold"
            >
              {enableLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send Activation OTP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RESET PASSWORD MODAL (Admin Creates New Temporary Password) */}
      <Dialog
        open={!!resetModalTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResetModalTarget(null);
            setResetTempPw('');
            setResetConfirmPw('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <KeyRound className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center text-lg font-bold">Reset Student Password</DialogTitle>
            <DialogDescription className="text-center text-xs">
              Create a new temporary password for the student. They must change it on their next login.
            </DialogDescription>
          </DialogHeader>

          {resetModalTarget && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Student:</span>
                <span className="font-semibold text-foreground">{resetModalTarget.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Student ID:</span>
                <span className="font-mono font-bold text-primary">{resetModalTarget.studentId || resetModalTarget.customerCode}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleResetPassword} className="space-y-3.5 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="resetTempPw" className="text-xs font-medium">
                New Temporary Password *
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="resetTempPw"
                  type={showResetPw ? 'text' : 'password'}
                  required
                  placeholder="e.g. Rahul@123"
                  value={resetTempPw}
                  onChange={(e) => setResetTempPw(e.target.value)}
                  className="h-9 pl-9 pr-10 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPw(!showResetPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showResetPw ? 'Hide password' : 'Show password'}
                >
                  {showResetPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="resetConfirmPw" className="text-xs font-bold text-black">
                Confirm Password *
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="resetConfirmPw"
                  type={showResetConfirmPw ? 'text' : 'password'}
                  required
                  placeholder="Re-enter password"
                  value={resetConfirmPw}
                  onChange={(e) => setResetConfirmPw(e.target.value)}
                  className="h-10 pl-9 pr-10 text-sm font-bold"
                />
                <button
                  type="button"
                  onClick={() => setShowResetConfirmPw(!showResetConfirmPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black"
                  aria-label={showResetConfirmPw ? 'Hide password' : 'Show password'}
                >
                  {showResetConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Validation Checklist */}
            <div className="rounded-xl border-[1.5px] border-[#CBD5E1] bg-[#FAFAF7] p-3 text-[11px] space-y-1.5">
              <p className="font-bold text-black">Password Requirements:</p>
              <div className="grid grid-cols-2 gap-1 text-slate-600">
                <RequirementItem met={resetMinLen} label="Min 8 chars" />
                <RequirementItem met={resetUpper} label="1 uppercase letter" />
                <RequirementItem met={resetLower} label="1 lowercase letter" />
                <RequirementItem met={resetNum} label="1 number" />
              </div>
              <RequirementItem met={resetMatch} label="Passwords match" />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResetModalTarget(null);
                  setResetTempPw('');
                  setResetConfirmPw('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={resetLoading || !resetIsValid}
              >
                {resetLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Reset Password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Disable Confirmation Dialog */}
      <ConfirmDialog
        open={!!disableTarget}
        title="Disable Portal Access"
        description={`${disableTarget?.name} will immediately lose access to the student portal. Their active login sessions will be blocked until re-enabled.`}
        confirmLabel="Disable Access"
        destructive
        loading={disableLoading}
        onConfirm={handleDisableAccess}
        onCancel={() => setDisableTarget(null)}
      />

      {/* Delete Student Dialog */}
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

      {/* SUCCESS CONFIRMATION MODAL */}
      <Dialog
        open={!!successModal}
        onOpenChange={(open) => {
          if (!open) setSuccessModal(null);
        }}
      >
        <DialogContent className="sm:max-w-md rounded-xl border border-[#CBD5E1] bg-white">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center text-lg font-black text-black">{successModal?.title}</DialogTitle>
            <DialogDescription className="text-center text-xs font-bold text-slate-500">
              {successModal?.studentName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="rounded-xl border-[1.5px] border-[#CBD5E1] bg-[#FAFAF7] p-3 text-center">
              <p className="text-[11px] font-bold text-slate-500">Student ID</p>
              <p className="font-mono text-lg font-black text-[#E87545] mt-0.5">{successModal?.studentId}</p>
            </div>

            <div className="rounded-xl border border-[#B4E2C7] bg-[#E8F5ED] p-3.5 text-xs text-center text-[#087A45] font-bold leading-relaxed">
              {successModal?.message}
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-[#FDE68A] bg-[#FEF3C7] p-3 text-xs text-[#C94F18] font-bold">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                For security reasons, passwords are not stored in plain text or shown again after this dialog is closed.
              </span>
            </div>
          </div>

          <DialogFooter className="sm:justify-center">
            <Button
              type="button"
              className="w-full sm:w-36"
              onClick={() => setSuccessModal(null)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RequirementItem({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {met ? (
        <Check className="h-3 w-3 text-[#087A45] shrink-0" />
      ) : (
        <X className="h-3 w-3 text-slate-400 shrink-0" />
      )}
      <span className={met ? 'text-black font-bold' : 'text-slate-500 font-medium'}>{label}</span>
    </div>
  );
}

export default function StudentsPage() {
  return (
    <PageErrorBoundary fallbackTitle="Unable to load Student Management">
      <StudentsPageContent />
    </PageErrorBoundary>
  );
}

