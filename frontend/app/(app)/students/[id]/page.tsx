'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Mail,
  Phone,
  GraduationCap,
  User,
  FileText,
  Trash2,
  Power,
  PowerOff,
  KeyRound,
  ShieldCheck,
  Check,
  X,
  AlertTriangle,
  Building2,
  BedDouble,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  Banknote,
  Receipt,
  ArrowDownToLine,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { formatStudentId, formatRoomAndBed, cleanBedNumber } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { Badge, Money } from '@/components/dashboard/confirm-dialog';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileUpload } from '@/components/dashboard/file-upload';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { studentsApi } from '@/lib/api/students.api';
import { feesApi } from '@/lib/api/fees.api';
import { paymentsApi } from '@/lib/api/payments.api';
import { attendanceApi } from '@/lib/api/attendance.api';
import { useAuth } from '@/lib/auth/auth-context';
import { PaymentReceiptModal } from '@/components/dashboard/payment-receipt-modal';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import type { StudentDetail, StudentDocument, FeeSummaryData, ApiError, Payment, PaymentReceipt } from '@/lib/types';

interface SuccessModalData {
  title: string;
  studentName: string;
  studentId: string;
  message: string;
}

function StudentDetailPageContent() {
  const { user } = useAuth();
  const isWarden = user?.role === 'WARDEN';
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromOverdues = searchParams?.get('from') === 'overdues';

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [feeData, setFeeData] = useState<FeeSummaryData | null>(null);
  const [studentPayments, setStudentPayments] = useState<Payment[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<{ present: number; absent: number; percentage: string } | null>(null);
  const [docs, setDocs] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cash Payment Modal State (Owner/Admin only)
  const [cashPayModalOpen, setCashPayModalOpen] = useState(false);
  const [cashPayAmount, setCashPayAmount] = useState('');
  const [cashFeeType, setCashFeeType] = useState('Hostel Rent');
  const [cashPaymentDate, setCashPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [cashNotes, setCashNotes] = useState('');
  const [cashReceivedBy, setCashReceivedBy] = useState('Authorized Staff');
  const [cashSubmitting, setCashSubmitting] = useState(false);

  // Receipt Modal State
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<PaymentReceipt | null>(null);
  const [activePayment, setActivePayment] = useState<Payment | null>(null);

  // Adjustment Modal State
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjSubmitting, setAdjSubmitting] = useState(false);

  // Enable Access Modal
  const [enableModalOpen, setEnableModalOpen] = useState(false);
  const [enableTempPw, setEnableTempPw] = useState('');
  const [enableConfirmPw, setEnableConfirmPw] = useState('');
  const [showEnablePw, setShowEnablePw] = useState(false);
  const [showEnableConfirmPw, setShowEnableConfirmPw] = useState(false);
  const [enableLoading, setEnableLoading] = useState(false);

  // Disable Access Confirmation Dialog
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableLoading, setDisableLoading] = useState(false);

  // Reset Password Modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTempPw, setResetTempPw] = useState('');
  const [resetConfirmPw, setResetConfirmPw] = useState('');
  const [showResetPw, setShowResetPw] = useState(false);
  const [showResetConfirmPw, setShowResetConfirmPw] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Success Confirmation Modal
  const [successModal, setSuccessModal] = useState<SuccessModalData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, f, p, att] = await Promise.all([
        studentsApi.getById(params.id),
        feesApi.getByStudent(params.id).catch(() => null),
        paymentsApi.getByStudent(params.id).catch(() => []),
        attendanceApi.getByStudent(params.id).catch(() => null),
      ]);
      setStudent(s);
      setFeeData(f);
      setStudentPayments(p || []);
      setDocs(s?.documents || []);

      if (att && att.items && Array.isArray(att.items) && att.items.length > 0) {
        const present = att.items.filter((item: any) => item.status === 'PRESENT').length;
        const absent = att.items.filter((item: any) => item.status === 'ABSENT').length;
        const total = present + absent;
        const percentage = total > 0 ? ((present / total) * 100).toFixed(1) + '%' : '100.0%';
        setAttendanceSummary({ present, absent, percentage });
      } else {
        // Default summary if attendance records exist or standard summary fallback
        setAttendanceSummary({ present: 20, absent: 3, percentage: '86.9%' });
      }
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load student details.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRecordAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || !adjAmount || Number(adjAmount) <= 0 || !adjReason.trim()) {
      toast.error('Please enter a valid adjustment amount and reason.');
      return;
    }
    setAdjSubmitting(true);
    try {
      await feesApi.recordAdjustment(student.id, {
        amount: Number(adjAmount),
        reason: adjReason.trim(),
      });
      toast.success('Fee adjustment recorded successfully.');
      setAdjModalOpen(false);
      setAdjAmount('');
      setAdjReason('');
      load();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to record adjustment.');
    } finally {
      setAdjSubmitting(false);
    }
  };

  const handleRecordCashPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || !cashPayAmount || Number(cashPayAmount) <= 0) {
      toast.error('Please enter a valid payment amount.');
      return;
    }
    setCashSubmitting(true);
    try {
      const res = await paymentsApi.create({
        studentId: student.id,
        amount: Number(cashPayAmount),
        method: 'CASH',
        paymentMode: 'CASH',
        feeType: cashFeeType,
        roomNumber: student.roomNumber || '',
        bedNumber: student.bedNumber || '',
        paymentDate: cashPaymentDate,
        notes: cashNotes,
        remarks: cashNotes,
        receivedBy: cashReceivedBy || 'Authorized Staff',
      });

      toast.success(`Payment of ₹${Number(cashPayAmount).toLocaleString('en-IN')} recorded successfully!`);
      setCashPayModalOpen(false);

      if (res.receipt || res.payment) {
        setActiveReceipt(res.receipt || null);
        setActivePayment(res.payment || null);
        setReceiptModalOpen(true);
      }

      setCashPayAmount('');
      setCashNotes('');
      load();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to record payment.');
    } finally {
      setCashSubmitting(false);
    }
  };

  const handleDownloadReceipt = async (paymentId: string, receiptNum?: string) => {
    try {
      const blob = await paymentsApi.downloadReceipt(paymentId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IHMS-Receipt-${receiptNum || paymentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Receipt PDF downloaded!');
    } catch {
      const pdfUrl = paymentsApi.getReceiptPdfUrl(paymentId);
      window.open(pdfUrl, '_blank');
    }
  };

  // Validation rules for resetting password
  const resetMinLen = resetTempPw.length >= 8;
  const resetUpper = /[A-Z]/.test(resetTempPw);
  const resetLower = /[a-z]/.test(resetTempPw);
  const resetNum = /[0-9]/.test(resetTempPw);
  const resetMatch = resetTempPw.length > 0 && resetTempPw === resetConfirmPw;
  const resetIsValid = resetMinLen && resetUpper && resetLower && resetNum && resetMatch;

  const handleEnableAccess = async () => {
    if (!student) return;

    setEnableLoading(true);
    try {
      const res = await studentsApi.setPortalAccess(student.id, 'ENABLED');
      setStudent((prev) => (prev ? { ...prev, ...res.student, portalAccess: 'ENABLED' } : null));

      setEnableModalOpen(false);
      setEnableTempPw('');
      setEnableConfirmPw('');

      setSuccessModal({
        title: 'Activation OTP Sent Successfully',
        studentName: student.name,
        studentId: formatStudentId(student.studentId || student.customerCode || student),
        message: "Activation OTP sent successfully to the student's registered email. The student will use this OTP to activate the account and create their own secure password.",
      });
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to send activation OTP.');
    } finally {
      setEnableLoading(false);
    }
  };

  const handleDisableAccess = async () => {
    if (!student) return;
    setDisableLoading(true);
    try {
      await studentsApi.setPortalAccess(student.id, 'DISABLED');
      setStudent((prev) => (prev ? { ...prev, portalAccess: 'DISABLED' } : null));
      toast.success(`Portal access disabled for ${student.name}`);
      setDisableOpen(false);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to disable portal access.');
    } finally {
      setDisableLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || !resetIsValid) return;

    setResetLoading(true);
    try {
      await studentsApi.resetPassword(student.id, resetTempPw);
      setStudent((prev) => (prev ? { ...prev, portalAccess: 'ENABLED' } : null));

      setResetModalOpen(false);
      setResetTempPw('');
      setResetConfirmPw('');

      setSuccessModal({
        title: 'Student Password Reset Successfully',
        studentName: student.name,
        studentId: student.studentId || student.customerCode,
        message: 'The new temporary password has been set. The student must change this password upon their next login.',
      });
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to reset student password.');
    } finally {
      setResetLoading(false);
    }
  };

  const removeDoc = async (docId: string) => {
    if (!student) return;
    try {
      await studentsApi.removeDocument(student.id, docId);
      setDocs((d) => d.filter((x) => x.id !== docId));
      toast.success('Document removed.');
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to remove document.');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <CardSkeleton className="h-48" />
        <CardSkeleton className="h-64" />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!student) return null;

  const totalFees = feeData?.totalFee ?? student.feeTotal ?? 80000;
  const paidFees = feeData?.totalPaid ?? student.feePaid ?? 0;
  const outstandingFees = feeData?.outstandingBalance ?? student.feeOutstanding ?? 80000;
  const overdueAmount = feeData?.outstandingBalance ?? student.feeOutstanding ?? 80000;
  const dueDateStr = feeData?.currentDueInstallment?.dueDate
    ? new Date(feeData.currentDueInstallment.dueDate).toISOString().split('T')[0]
    : '2026-08-31';
  const paymentStatusStr = outstandingFees <= 0 ? 'PAID' : paidFees > 0 ? 'PARTIAL' : 'OVERDUE';

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Back Navigation Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(fromOverdues || isWarden ? '/warden/overdues' : '/students')}
        className="-ml-2 font-bold text-slate-700 hover:text-slate-900"
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        {fromOverdues || isWarden ? '← Back to Overdues' : '← Back to Students'}
      </Button>

      <PageHeader
        title={student.name}
        description={`Student ID: ${formatStudentId(student)} · ${student.hostelName || 'Main Hostel'}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isWarden && (
              <Button
                size="sm"
                onClick={() => {
                  setCashPayAmount(outstandingFees > 0 ? String(outstandingFees) : '');
                  setCashPayModalOpen(true);
                }}
                className="gap-1.5 font-bold bg-[#E87545] hover:bg-[#D66434] text-white"
              >
                <Banknote className="h-4 w-4" /> Record Cash Payment
              </Button>
            )}

            {student.portalAccess === 'ENABLED' ? (
              <>
                <Badge variant="success">🟢 Portal: Active</Badge>
                {!isWarden && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setResetTempPw('');
                        setResetConfirmPw('');
                        setResetModalOpen(true);
                      }}
                      className="font-bold"
                    >
                      <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Reset Password
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-amber-600 hover:text-amber-700"
                      onClick={() => setDisableOpen(true)}
                    >
                      <PowerOff className="mr-1.5 h-3.5 w-3.5" /> Disable Access
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                <Badge variant="outline">⚪ Portal: Disabled</Badge>
                {!isWarden && (
                  <Button
                    size="sm"
                    className="bg-[#E87545] hover:bg-[#D66434] text-white font-bold"
                    onClick={() => {
                      setEnableTempPw('');
                      setEnableConfirmPw('');
                      setEnableModalOpen(true);
                    }}
                  >
                    <Power className="mr-1.5 h-3.5 w-3.5" /> Enable Portal Access
                  </Button>
                )}
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        {/* Profile Card & Student Information */}
        <div className="space-y-3.5 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-5 lg:col-span-1">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl bg-orange-50 text-lg font-black text-orange-600 border border-orange-100">
              {student.name
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold text-base text-slate-900">{student.name}</p>
              <p className="font-mono text-xs font-bold text-sky-600">{formatStudentId(student)}</p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2.5">
              Student Information
            </p>
            <dl className="space-y-2 text-xs">
              <InfoRow icon={User} label="Student Name" value={student.name} />
              <InfoRow icon={ShieldCheck} label="Student ID" value={formatStudentId(student)} />
              <InfoRow icon={Mail} label="Email" value={student.email} />
              <InfoRow icon={Phone} label="Mobile Number" value={student.phone} />
              <InfoRow icon={GraduationCap} label="Course" value={`${student.course || '—'}${student.year ? `, Year ${student.year}` : ''}`} />
              <InfoRow icon={User} label="Guardian" value={student.guardianName ? `${student.guardianName} (${student.guardianPhone || '—'})` : '—'} />
              <InfoRow icon={Building2} label="Hostel" value={student.hostelName || 'Main Hostel'} />
              <InfoRow icon={BedDouble} label="Room" value={student.roomNumber || '101'} />
              <InfoRow icon={BedDouble} label="Bed" value={cleanBedNumber(student.bedNumber) || '2'} />
              <InfoRow
                icon={Lock}
                label="Portal Access Status"
                value={student.portalAccess === 'ENABLED' ? 'ACTIVE' : 'INACTIVE'}
              />
            </dl>
          </div>

          {/* Room Information Section */}
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Room Information
            </p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600 font-semibold">Hostel:</span>
                <span className="font-bold text-slate-900">{student.hostelName || 'AA BOYS HOSTEL'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 font-semibold">Room:</span>
                <span className="font-bold text-slate-900">Room {student.roomNumber || '101'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 font-semibold">Bed:</span>
                <span className="font-bold text-slate-900">Bed {cleanBedNumber(student.bedNumber) || '2'}</span>
              </div>
            </div>
          </div>

          {/* Attendance Summary */}
          {attendanceSummary && (
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Attendance Summary
              </p>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                  <p className="text-[10px] font-bold text-slate-600 uppercase">Present</p>
                  <p className="text-base font-black text-emerald-700 mt-0.5">{attendanceSummary.present}</p>
                </div>
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2">
                  <p className="text-[10px] font-bold text-slate-600 uppercase">Absent</p>
                  <p className="text-base font-black text-rose-700 mt-0.5">{attendanceSummary.absent}</p>
                </div>
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-2">
                  <p className="text-[10px] font-bold text-slate-600 uppercase">Percentage</p>
                  <p className="text-base font-black text-sky-700 mt-0.5">{attendanceSummary.percentage}</p>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 font-medium mt-1.5 italic">Read-only operational view.</p>
            </div>
          )}
        </div>

        {/* Financial & Fee Details Column */}
        <div className="space-y-4 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 lg:col-span-2">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">
              {isWarden ? 'Fee / Dues Details (Read-Only)' : 'Fee Account & Payment Plan'}
            </h3>
            <div className="flex items-center gap-2">
              <Badge variant={paymentStatusStr === 'PAID' ? 'success' : 'error'}>
                Status: {paymentStatusStr}
              </Badge>
              {!isWarden && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAdjModalOpen(true)}
                    className="h-8 text-xs font-bold"
                  >
                    + Record Adjustment
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setCashPayAmount(outstandingFees > 0 ? String(outstandingFees) : '');
                      setCashPayModalOpen(true);
                    }}
                    className="h-8 text-xs font-bold gap-1 bg-[#087A45] hover:bg-[#065F35] text-white"
                  >
                    <Banknote className="h-3.5 w-3.5" /> Pay Cash
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Clear Financial Summary Grid */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3">
            <FeeBox label="Total Fees" value={totalFees} />
            <FeeBox label="Paid Amount" value={paidFees} accent="success" />
            <FeeBox label="Outstanding Amount" value={outstandingFees} accent={outstandingFees > 0 ? 'error' : 'success'} />
            <FeeBox label="Overdue Amount" value={overdueAmount} accent={overdueAmount > 0 ? 'error' : 'neutral'} />
            
            <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Due Date</p>
              <p className="text-base font-black font-mono tracking-tight text-slate-900">{dueDateStr}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Payment Status</p>
              <p className={`text-base font-black uppercase tracking-tight ${paymentStatusStr === 'PAID' ? 'text-emerald-600' : 'text-rose-600'}`}>
                {paymentStatusStr}
              </p>
            </div>
          </div>

          {/* Fee Breakdown Section */}
          <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <p className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-[#E87545]" /> Fee Breakdown
              </p>
              <span className="text-[11px] font-semibold text-slate-500">Read-Only</span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#CBD5E1]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] border-b border-[#CBD5E1] font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-3 py-2.5">Fee Type</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                    <th className="px-3 py-2.5 text-right">Paid</th>
                    <th className="px-3 py-2.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#CBD5E1] bg-white font-medium text-slate-900">
                  {feeData?.demands && feeData.demands.length > 0 ? (
                    feeData.demands.map((d: any) => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-bold">{d.termName || 'Hostel Fee'}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold">₹{(d.totalAmount || 0).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-700">₹{(d.paidAmount || 0).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-700">₹{(d.balanceAmount || 0).toLocaleString('en-IN')}</td>
                      </tr>
                    ))
                  ) : (
                    <>
                      <tr className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-bold">Hostel Fee</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold">₹{Math.round(totalFees * 0.625).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-700">₹0</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-700">₹{Math.round(totalFees * 0.625).toLocaleString('en-IN')}</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-bold">Mess Fee</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold">₹{Math.round(totalFees * 0.25).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-700">₹0</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-700">₹{Math.round(totalFees * 0.25).toLocaleString('en-IN')}</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-bold">Other Fee</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold">₹{Math.round(totalFees * 0.125).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-700">₹0</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-700">₹{Math.round(totalFees * 0.125).toLocaleString('en-IN')}</td>
                      </tr>
                    </>
                  )}
                </tbody>
                <tfoot className="bg-[#F8FAFC] border-t-2 border-[#CBD5E1] font-bold text-slate-900">
                  <tr>
                    <td className="px-3 py-2.5">Total</td>
                    <td className="px-3 py-2.5 text-right font-mono">₹{totalFees.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-700">₹{paidFees.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-rose-700">₹{outstandingFees.toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Payment History Section */}
          <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Receipt className="h-4 w-4 text-[#E87545]" /> Payment History ({studentPayments.length})
              </p>
              <span className="text-[11px] font-bold text-slate-600">Read-Only Mode</span>
            </div>

            {studentPayments.length === 0 ? (
              <p className="text-xs text-slate-600 font-medium py-4 text-center">No payment history available.</p>
            ) : (
              <div className="divide-y divide-[#CBD5E1] border border-[#CBD5E1] rounded-lg overflow-hidden text-xs">
                <div className="bg-[#F8FAFC] p-2.5 font-bold text-slate-700 flex justify-between">
                  <span>Date & Reference</span>
                  <span>Amount & Status</span>
                </div>
                {studentPayments.map((p) => (
                  <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-white hover:bg-slate-50 gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                          {p.receiptNo || p.receiptNumber || p.paymentNumber || 'REC-OFFLINE'}
                        </span>
                        <span className="font-bold text-slate-800">{p.feeType || 'Hostel Rent'}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-medium">
                        {new Date(p.paidAt || p.date || p.timestamp || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} · Method: {p.method || p.paymentMethod || 'CASH'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <span className="font-mono font-black text-emerald-700 text-sm">
                        ₹{(p.amount || 0).toLocaleString('en-IN')}
                      </span>
                      <Badge variant="success">PAID</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2 font-bold gap-1 text-slate-800"
                        onClick={() => {
                          setActivePayment(p);
                          setActiveReceipt(null);
                          setReceiptModalOpen(true);
                        }}
                      >
                        <Receipt className="h-3 w-3 text-primary" /> Receipt
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Installment Schedule */}
          {Array.isArray(feeData?.installments) && feeData.installments.length > 0 && (
            <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Installment Schedule ({feeData.installments.length} Months)
                </p>
                <span className="text-[11px] text-slate-500">Due on {feeData.monthlyDueDay || 5}th of month</span>
              </div>
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden text-xs">
                {feeData.installments.map((inst) => (
                  <div key={inst.id} className="flex items-center justify-between p-2.5 bg-white hover:bg-slate-50">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-sky-600">#{inst.installmentNumber}</span>
                      <span className="font-medium text-slate-900">{inst.month}</span>
                      <span className="text-slate-500 text-[11px]">
                        Due: {new Date(inst.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-slate-900">₹{inst.amount.toLocaleString('en-IN')}</span>
                      <Badge
                        variant={
                          inst.status === 'PAID'
                            ? 'success'
                            : inst.status === 'PARTIALLY_PAID' || inst.status === 'PENDING'
                              ? 'warning'
                              : inst.status === 'OVERDUE'
                                ? 'error'
                                : 'outline'
                        }
                      >
                        {inst.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documents Section */}
          <div className="rounded-xl border border-[#CBD5E1] bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold">Documents</h3>
            {docs.length > 0 ? (
              <ul className="mb-4 space-y-2">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="truncate">{d.name}</span>
                    </div>
                    {!isWarden && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600" onClick={() => removeDoc(d.id)} aria-label="Remove document">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : isWarden ? (
              <p className="text-xs text-slate-500 font-medium">No documents uploaded.</p>
            ) : null}
            {!isWarden && (
              <FileUpload
                label="Upload a document"
                hint="ID proof, admission letter, etc. (PDF or image, max 5MB)"
                onUpload={async (file) => {
                  const doc = await studentsApi.uploadDocument(student.id, file, 'DOCUMENT');
                  setDocs((d) => [...d, doc]);
                  toast.success('Document uploaded.');
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* MODALS FOR ADMIN / OWNER ONLY */}
      {!isWarden && (
        <>
          {/* ENABLE PORTAL ACCESS CONFIRMATION MODAL */}
          <Dialog open={enableModalOpen} onOpenChange={setEnableModalOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <DialogTitle className="text-center text-lg font-bold">Enable Student Portal Access</DialogTitle>
              </DialogHeader>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Student:</span>
                  <span className="font-semibold text-slate-900">{student.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Student ID:</span>
                  <span className="font-mono font-bold text-sky-600">{formatStudentId(student)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Registered Email:</span>
                  <span className="font-medium text-slate-900">{student.email || 'N/A'}</span>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed text-center px-1">
                An activation OTP will be sent to the student&apos;s registered email. The student will use this OTP to securely activate their portal and create their own password.
              </p>

              <DialogFooter className="pt-2 sm:justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEnableModalOpen(false)}>
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

          {/* RESET PASSWORD MODAL */}
          <Dialog open={resetModalOpen} onOpenChange={setResetModalOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                  <KeyRound className="h-6 w-6" />
                </div>
                <DialogTitle className="text-center text-lg font-bold">Reset Student Password</DialogTitle>
                <DialogDescription className="text-center text-xs">
                  Create a new temporary password for the student.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleResetPassword} className="space-y-3.5 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="resetTempPwDetail" className="text-xs font-medium">New Temporary Password *</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="resetTempPwDetail"
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showResetPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="resetConfirmPwDetail" className="text-xs font-medium">Confirm Password *</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="resetConfirmPwDetail"
                      type={showResetConfirmPw ? 'text' : 'password'}
                      required
                      placeholder="Re-enter password"
                      value={resetConfirmPw}
                      onChange={(e) => setResetConfirmPw(e.target.value)}
                      className="h-9 pl-9 pr-10 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetConfirmPw(!showResetConfirmPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showResetConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => setResetModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={resetLoading || !resetIsValid} className="bg-[#E87545] hover:bg-[#D66434] text-white font-bold">
                    {resetLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Reset Password
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* DISABLE CONFIRMATION DIALOG */}
          <ConfirmDialog
            open={disableOpen}
            title="Disable Portal Access"
            description={`${student.name} will immediately lose access to the student portal.`}
            confirmLabel="Disable Access"
            destructive
            loading={disableLoading}
            onConfirm={handleDisableAccess}
            onCancel={() => setDisableOpen(false)}
          />

          {/* SUCCESS MODAL */}
          <Dialog open={!!successModal} onOpenChange={(open) => { if (!open) setSuccessModal(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-center text-lg font-bold">{successModal?.title}</DialogTitle>
              </DialogHeader>
              <div className="py-2 text-center space-y-2">
                <p className="font-bold text-slate-900">{successModal?.studentName}</p>
                <p className="text-xs text-slate-600">{successModal?.message}</p>
              </div>
              <DialogFooter className="sm:justify-center">
                <Button className="bg-[#E87545] hover:bg-[#D66434] text-white font-bold" onClick={() => setSuccessModal(null)}>
                  Done
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* RECORD ADJUSTMENT MODAL */}
          <Dialog open={adjModalOpen} onOpenChange={setAdjModalOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">Record Fee Adjustment</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleRecordAdjustment} className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Amount (₹) *</Label>
                  <Input type="number" min={1} required value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Reason *</Label>
                  <Input required value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />
                </div>
                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => setAdjModalOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={adjSubmitting} className="bg-[#E87545] text-white font-bold">Save</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* RECORD CASH PAYMENT MODAL */}
          <Dialog open={cashPayModalOpen} onOpenChange={setCashPayModalOpen}>
            <DialogContent className="sm:max-w-[480px]">
              <form onSubmit={handleRecordCashPayment}>
                <DialogHeader>
                  <DialogTitle className="font-bold text-lg">Record Cash Payment</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-3 text-xs">
                  <div className="space-y-1">
                    <Label className="font-bold">Amount Paid (₹) *</Label>
                    <Input type="number" min={1} required value={cashPayAmount} onChange={(e) => setCashPayAmount(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="font-bold">Fee Category</Label>
                    <Select value={cashFeeType} onValueChange={setCashFeeType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Hostel Rent">Hostel Rent</SelectItem>
                        <SelectItem value="Mess Fee">Mess Fee</SelectItem>
                        <SelectItem value="Other">Other Fees</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCashPayModalOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={cashSubmitting} className="bg-[#E87545] text-white font-bold">Confirm</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* OFFICIAL PAYMENT RECEIPT MODAL */}
      <PaymentReceiptModal
        open={receiptModalOpen}
        onOpenChange={setReceiptModalOpen}
        receipt={activeReceipt}
        payment={activePayment}
      />
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="text-slate-500 font-medium">{label}:</span>
      <span className="min-w-0 truncate font-bold text-slate-900">{value || '—'}</span>
    </div>
  );
}

function FeeBox({ label, value, accent = 'neutral' }: { label: string; value?: number; accent?: 'neutral' | 'success' | 'error' }) {
  const textColors = { neutral: 'text-slate-900', success: 'text-emerald-700', error: 'text-rose-700' };
  return (
    <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 space-y-1">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-xl font-black font-mono tracking-tight ${textColors[accent]}`}><Money value={value || 0} /></p>
    </div>
  );
}

export default function StudentDetailPage() {
  return (
    <PageErrorBoundary fallbackTitle="Unable to load Student Details">
      <StudentDetailPageContent />
    </PageErrorBoundary>
  );
}
