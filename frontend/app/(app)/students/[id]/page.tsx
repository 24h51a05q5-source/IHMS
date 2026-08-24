'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
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
import { PaymentReceiptModal } from '@/components/dashboard/payment-receipt-modal';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import { Banknote, Receipt, ArrowDownToLine, Plus, CheckCircle2 } from 'lucide-react';
import type { StudentDetail, StudentDocument, FeeSummaryData, ApiError, Payment, PaymentReceipt } from '@/lib/types';

interface SuccessModalData {
  title: string;
  studentName: string;
  studentId: string;
  message: string;
}

function StudentDetailPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [feeData, setFeeData] = useState<FeeSummaryData | null>(null);
  const [studentPayments, setStudentPayments] = useState<Payment[]>([]);
  const [docs, setDocs] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cash Payment Modal State
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
      const [s, f, p] = await Promise.all([
        studentsApi.getById(params.id),
        feesApi.getByStudent(params.id).catch(() => null),
        paymentsApi.getByStudent(params.id).catch(() => []),
      ]);
      setStudent(s);
      setFeeData(f);
      setStudentPayments(p || []);
      setDocs(s.documents || []);
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load student.');
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
        studentId: student.studentId || student.customerCode,
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
      const res = await studentsApi.setPortalAccess(student.id, 'DISABLED');
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
      const res = await studentsApi.resetPassword(student.id, resetTempPw);
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

  return (
    <div className="space-y-4 sm:space-y-5">
      <Button variant="ghost" size="sm" onClick={() => router.push('/students')} className="-ml-2">
        <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to students
      </Button>

      <PageHeader
        title={student.name}
        description={`Student ID: ${student.studentId || student.customerCode} · ${student.hostelName || 'Main Hostel'}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                const outstanding = feeData?.outstandingBalance ?? student.feeOutstanding ?? 0;
                setCashPayAmount(outstanding > 0 ? String(outstanding) : '');
                setCashPayModalOpen(true);
              }}
              className="gap-1.5 font-bold bg-[#E87545] hover:bg-[#D66434] text-white"
            >
              <Banknote className="h-4 w-4" /> Record Cash Payment
            </Button>

            {student.portalAccess === 'ENABLED' ? (
              <>
                <Badge variant="success">🟢 Portal: Active</Badge>
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
            ) : (
              <>
                <Badge variant="outline">⚪ Portal: Disabled</Badge>
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
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        {/* Profile card */}
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
              <p className="font-mono text-xs font-bold text-sky-600">{student.studentId || student.customerCode}</p>
            </div>
          </div>
          <dl className="space-y-2 text-xs border-t border-slate-100 pt-3">
            <InfoRow icon={Mail} label="Email" value={student.email} />
            <InfoRow icon={Phone} label="Phone" value={student.phone} />
            <InfoRow icon={GraduationCap} label="Course" value={`${student.course || '—'}${student.year ? `, Year ${student.year}` : ''}`} />
            <InfoRow icon={User} label="Guardian" value={student.guardianName ? `${student.guardianName} (${student.guardianPhone || '—'})` : '—'} />
            <InfoRow icon={Building2} label="Hostel" value={student.hostelName || 'Main Hostel'} />
            <InfoRow icon={BedDouble} label="Room / Bed" value={`Room ${student.roomNumber || '—'} · Bed ${student.bedNumber || '—'}`} />
          </dl>
        </div>

        {/* Fee summary, Installments + documents */}
        <div className="space-y-4 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">Fee Account & Payment Plan</h3>
            <div className="flex items-center gap-2">
              <Badge variant={feeData?.paymentPlan === 'MONTHLY' ? 'info' : 'default'}>
                {feeData?.paymentPlan === 'MONTHLY' ? 'Monthly Plan' : 'One-Time Plan'}
              </Badge>
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
                  const outstanding = feeData?.outstandingBalance ?? student.feeOutstanding ?? 0;
                  setCashPayAmount(outstanding > 0 ? String(outstanding) : '');
                  setCashPayModalOpen(true);
                }}
                className="h-8 text-xs font-bold gap-1 bg-[#087A45] hover:bg-[#065F35] text-white"
              >
                <Banknote className="h-3.5 w-3.5" /> Pay Cash
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <FeeBox label="Total Fee" value={feeData?.totalFee ?? student.feeTotal} />
            <FeeBox label="Total Paid" value={feeData?.totalPaid ?? student.feePaid} accent="success" />
            <FeeBox label="Adjustments" value={feeData?.approvedAdjustments || 0} />
            <FeeBox
              label="Outstanding Balance"
              value={feeData?.outstandingBalance ?? student.feeOutstanding}
              accent={(feeData?.outstandingBalance ?? student.feeOutstanding) ? 'error' : 'success'}
            />
          </div>

          {/* Payment & Receipt History Section */}
          <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Receipt className="h-4 w-4 text-[#E87545]" /> Payment & Receipt History ({studentPayments.length})
              </p>
              <span className="text-[11px] font-bold text-slate-600">Official Receipts</span>
            </div>

            {studentPayments.length === 0 ? (
              <p className="text-xs text-slate-600 font-medium py-3 text-center">No payment transactions recorded yet.</p>
            ) : (
              <div className="divide-y divide-[#E4E0D7] border border-[#E4E0D7] rounded-lg overflow-hidden text-xs">
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
                        {new Date(p.paidAt || p.date).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · Method: {p.method || 'CASH'} · Received by: {p.receivedBy || 'Staff'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <span className="font-mono font-black text-emerald-700 text-sm">
                        ₹{(p.amount || 0).toLocaleString('en-IN')}
                      </span>
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
                        <Receipt className="h-3 w-3 text-primary" /> View Receipt
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-slate-700 hover:text-black"
                        onClick={() => handleDownloadReceipt(p.id, p.receiptNo || p.receiptNumber || p.paymentNumber)}
                        title="Download PDF"
                      >
                        <ArrowDownToLine className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Installments Table */}
          {Array.isArray(feeData?.installments) && feeData.installments.length > 0 && (
            <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Installment Schedule ({feeData.installments.length} Months)
                </p>
                <span className="text-[11px] text-muted-foreground">Due on {feeData.monthlyDueDay || 5}th of month</span>
              </div>
              <div className="divide-y divide-border border border-border rounded-lg overflow-hidden text-xs">
                {(Array.isArray(feeData?.installments) ? feeData.installments : []).map((inst) => (
                  <div key={inst.id} className="flex items-center justify-between p-2.5 bg-card hover:bg-muted/30">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-primary">#{inst.installmentNumber}</span>
                      <span className="font-medium text-foreground">{inst.month}</span>
                      <span className="text-muted-foreground text-[11px]">
                        Due: {new Date(inst.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-foreground">₹{inst.amount.toLocaleString('en-IN')}</span>
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

          {/* Adjustments History */}
          {Array.isArray(feeData?.adjustments) && feeData.adjustments.length > 0 && (
            <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Approved Adjustments</p>
              <div className="space-y-1.5 text-xs">
                {(Array.isArray(feeData?.adjustments) ? feeData.adjustments : []).map((adj) => (
                  <div key={adj.id} className="flex justify-between items-center rounded-lg border border-border p-2 bg-muted/20">
                    <div>
                      <span className="font-semibold text-foreground">₹{adj.amount.toLocaleString('en-IN')}</span>
                      <p className="text-[11px] text-muted-foreground">{adj.reason} · Approved by {adj.approvedBy}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(adj.date).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-[#CBD5E1] bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold">Documents</h3>
            {docs.length > 0 && (
              <ul className="mb-4 space-y-2">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{d.name}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600" onClick={() => removeDoc(d.id)} aria-label="Remove document">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <FileUpload
              label="Upload a document"
              hint="ID proof, admission letter, etc. (PDF or image, max 5MB)"
              onUpload={async (file) => {
                const doc = await studentsApi.uploadDocument(student.id, file, 'DOCUMENT');
                setDocs((d) => [...d, doc]);
                toast.success('Document uploaded.');
              }}
            />
          </div>
        </div>
      </div>

      {/* ENABLE PORTAL ACCESS CONFIRMATION MODAL */}
      <Dialog
        open={enableModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEnableModalOpen(false);
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

          <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Student:</span>
              <span className="font-semibold text-foreground">{student.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Student ID:</span>
              <span className="font-mono font-bold text-primary">{student.studentId || student.customerCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Registered Email:</span>
              <span className="font-medium text-foreground">{student.email || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hostel:</span>
              <span className="font-medium text-foreground">{student.hostelName || 'Main Hostel'}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed text-center px-1">
            An activation OTP will be sent to the student&apos;s registered email. The student will use this OTP to securely activate their portal and create their own password.
          </p>

          <DialogFooter className="pt-2 sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEnableModalOpen(false)}
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

      {/* RESET PASSWORD MODAL */}
      <Dialog
        open={resetModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setResetModalOpen(false);
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

          <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Student:</span>
              <span className="font-semibold text-foreground">{student.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Student ID:</span>
              <span className="font-mono font-bold text-primary">{student.studentId || student.customerCode}</span>
            </div>
          </div>

          <form onSubmit={handleResetPassword} className="space-y-3.5 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="resetTempPwDetail" className="text-xs font-medium">
                New Temporary Password *
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showResetPw ? 'Hide password' : 'Show password'}
                >
                  {showResetPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="resetConfirmPwDetail" className="text-xs font-medium">
                Confirm Password *
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showResetConfirmPw ? 'Hide password' : 'Show password'}
                >
                  {showResetConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Validation Checklist */}
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-[11px] space-y-1.5">
              <p className="font-semibold text-foreground">Password Requirements:</p>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground">
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
                  setResetModalOpen(false);
                  setResetTempPw('');
                  setResetConfirmPw('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={resetLoading || !resetIsValid}
                className="bg-[#E87545] hover:bg-[#D66434] text-white font-bold"
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
        open={disableOpen}
        title="Disable Portal Access"
        description={`${student.name} will immediately lose access to the student portal. Their active login sessions will be blocked until re-enabled.`}
        confirmLabel="Disable Access"
        destructive
        loading={disableLoading}
        onConfirm={handleDisableAccess}
        onCancel={() => setDisableOpen(false)}
      />

      {/* SUCCESS CONFIRMATION MODAL */}
      <Dialog
        open={!!successModal}
        onOpenChange={(open) => {
          if (!open) setSuccessModal(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center text-lg font-bold">{successModal?.title}</DialogTitle>
            <DialogDescription className="text-center text-xs">
              {successModal?.studentName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-center">
              <p className="text-[11px] font-medium text-muted-foreground">Student ID</p>
              <p className="font-mono text-lg font-bold text-primary mt-0.5">{successModal?.studentId}</p>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-xs text-center text-muted-foreground leading-relaxed">
              {successModal?.message}
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                For security reasons, passwords are not stored in plain text or shown again after this dialog is closed.
              </span>
            </div>
          </div>

          <DialogFooter className="sm:justify-center">
            <Button
              type="button"
              className="w-full sm:w-36 bg-[#E87545] hover:bg-[#D66434] text-white font-bold"
              onClick={() => setSuccessModal(null)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RECORD ADJUSTMENT MODAL */}
      <Dialog open={adjModalOpen} onOpenChange={setAdjModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Record Approved Fee Adjustment</DialogTitle>
            <DialogDescription className="text-xs">
              Apply an approved waiver, scholarship, or discount to reduce the outstanding balance.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordAdjustment} className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Adjustment / Discount Amount (₹) *</Label>
              <Input
                type="number"
                min={1}
                required
                placeholder="e.g. 5000"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Approval Reason & Authority *</Label>
              <Input
                required
                placeholder="e.g. Management Scholarship / Special Covid Waiver"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                className="text-xs"
              />
            </div>

            <DialogFooter className="sm:justify-between gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAdjModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={adjSubmitting} className="bg-[#E87545] hover:bg-[#D66434] text-white font-bold">
                {adjSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Adjustment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* RECORD CASH PAYMENT MODAL */}
      <Dialog open={cashPayModalOpen} onOpenChange={setCashPayModalOpen}>
        <DialogContent className="sm:max-w-[480px] w-[calc(100vw-32px)] max-h-[90vh] overflow-y-auto bg-white border border-[#CBD5E1] rounded-xl scrollbar-thin">
          <form onSubmit={handleRecordCashPayment}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-black text-slate-950 text-lg">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-[#087A45] border border-emerald-200">
                  <Banknote className="h-4 w-4" />
                </span>
                Record Cash Payment for {student.name}
              </DialogTitle>
              <DialogDescription className="text-xs font-semibold text-slate-600">
                Record cash received at hostel office and instantly generate a receipt.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3.5 py-3 text-xs">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600 font-bold">Student ID:</span>
                  <span className="font-mono font-bold text-slate-900">{student.studentId || student.customerCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 font-bold">Outstanding Balance:</span>
                  <span className="font-mono font-black text-amber-700">
                    ₹{(feeData?.outstandingBalance ?? student.feeOutstanding ?? 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="font-bold text-slate-950">Fee Category *</Label>
                  <Select value={cashFeeType} onValueChange={setCashFeeType}>
                    <SelectTrigger className="font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Hostel Rent">Hostel Rent</SelectItem>
                      <SelectItem value="Mess Fee">Mess Fee</SelectItem>
                      <SelectItem value="Electricity">Electricity</SelectItem>
                      <SelectItem value="Maintenance">Maintenance</SelectItem>
                      <SelectItem value="Other">Other Fees</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="font-bold text-slate-950">Amount Paid (₹) *</Label>
                  <Input
                    type="number"
                    min={1}
                    required
                    placeholder="e.g. 8000"
                    value={cashPayAmount}
                    onChange={(e) => setCashPayAmount(e.target.value)}
                    className="font-mono font-bold text-slate-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="font-bold text-slate-950">Payment Date</Label>
                  <Input
                    type="date"
                    value={cashPaymentDate}
                    onChange={(e) => setCashPaymentDate(e.target.value)}
                    className="font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="font-bold text-slate-950">Received By</Label>
                  <Input
                    value={cashReceivedBy}
                    onChange={(e) => setCashReceivedBy(e.target.value)}
                    className="font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="font-bold text-slate-950">Notes / Remarks</Label>
                <Input
                  placeholder="e.g. Paid in cash at reception counter"
                  value={cashNotes}
                  onChange={(e) => setCashNotes(e.target.value)}
                  className="font-medium"
                />
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 pt-3">
              <Button type="button" variant="outline" onClick={() => setCashPayModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={cashSubmitting}
                className="gap-2 font-black bg-[#E87545] hover:bg-[#D66434] text-white"
              >
                {cashSubmitting ? 'Recording...' : 'Confirm & Generate Receipt'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

function RequirementItem({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {met ? (
        <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
      ) : (
        <X className="h-3 w-3 text-muted-foreground/60 shrink-0" />
      )}
      <span className={met ? 'text-foreground font-medium' : ''}>{label}</span>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="min-w-0 truncate font-medium">{value || '—'}</span>
    </div>
  );
}

function FeeBox({ label, value, accent = 'neutral' }: { label: string; value?: number; accent?: 'neutral' | 'success' | 'error' }) {
  const textColors = { neutral: 'text-slate-900', success: 'text-sky-600', error: 'text-rose-600' };
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

