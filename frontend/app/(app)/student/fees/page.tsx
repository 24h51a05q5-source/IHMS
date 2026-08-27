'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CreditCard,
  Loader2,
  Download,
  CheckCircle2,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Clock,
  ArrowRight,
  Sparkles,
  Lock,
  Wallet,
  Receipt,
  Check,
  Copy,
  QrCode,
  Landmark,
  Upload,
  ExternalLink,
  FileImage,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n/language-context';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { Badge } from '@/components/dashboard/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PaymentReceiptModal } from '@/components/dashboard/payment-receipt-modal';
import { studentsApi } from '@/lib/api/students.api';
import { getCachedData } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import type { FeeSummaryData, FeeInstallment, Payment, PaymentReceipt, ApiError } from '@/lib/types';

function InstallmentBadge({ status }: { status: string }) {
  if (status === 'PAID') {
    return (
      <span className="inline-flex items-center rounded-full bg-[#E8F5ED] px-2.5 py-0.5 text-xs font-black text-[#087A45] border border-[#B4E2C7] uppercase tracking-wider">
        PAID
      </span>
    );
  }
  if (status === 'PARTIALLY_PAID') {
    return (
      <span className="inline-flex items-center rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-black text-[#C94F18] border border-[#FDE68A] uppercase tracking-wider">
        PARTIAL
      </span>
    );
  }
  if (status === 'OVERDUE') {
    return (
      <span className="inline-flex items-center rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-xs font-black text-[#C62828] border border-[#FECACA] uppercase tracking-wider">
        OVERDUE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-black text-[#C94F18] border border-[#FDE68A] uppercase tracking-wider">
      PENDING
    </span>
  );
}

export default function StudentFeesPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const cachedFees = getCachedData<FeeSummaryData>('/student/fees');
  const [feeData, setFeeData] = useState<FeeSummaryData | null>(() => cachedFees);
  const [loading, setLoading] = useState(() => !cachedFees);
  const [error, setError] = useState<string | null>(null);

  // Payment Form State
  const [paymentOption, setPaymentOption] = useState<'FULL_DUE' | 'CUSTOM'>('FULL_DUE');
  const [customAmount, setCustomAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'BANK_TRANSFER'>('UPI');
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string | null>(
    () => cachedFees?.currentDueInstallment?.id || null
  );

  // Zero-Gateway Payment Modal State
  const [zeroGatewayModalOpen, setZeroGatewayModalOpen] = useState(false);
  const [loadingPaymentDetails, setLoadingPaymentDetails] = useState(false);
  const [zeroGatewayData, setZeroGatewayData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'UPI' | 'BANK'>('UPI');
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string>('PENDING');
  const [remainingTimeSeconds, setRemainingTimeSeconds] = useState<number>(900);

  // Submission State
  const [utrNumber, setUtrNumber] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Receipt Modal State
  const [activeReceipt, setActiveReceipt] = useState<PaymentReceipt | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await studentsApi.getMyFees();
      setFeeData(res);
      if (res && res.currentDueInstallment) {
        setSelectedInstallmentId(res.currentDueInstallment.id);
      }
      setError(null);
    } catch (err) {
      if (!feeData) {
        setError((err as ApiError)?.message || 'Unable to load your fee records.');
      }
    } finally {
      setLoading(false);
    }
  }, [feeData]);

  // Real-Time Dynamic Payment Polling & Countdown Timer
  useEffect(() => {
    let pollTimer: NodeJS.Timeout | null = null;
    let countdownTimer: NodeJS.Timeout | null = null;

    if (zeroGatewayModalOpen && activePaymentId && (paymentStatus === 'PENDING' || paymentStatus === 'QR_GENERATED')) {
      pollTimer = setInterval(async () => {
        try {
          const res = await studentsApi.getPaymentStatus(activePaymentId);
          if (res.success && res.data) {
            const status = res.data.status;
            setPaymentStatus(status);

            if (status === 'SUCCESS' || status === 'VERIFIED') {
              if (pollTimer) clearInterval(pollTimer);
              setZeroGatewayModalOpen(false);
              toast.success('Payment verified successfully! Digital receipt generated.');
              const recNo = res.data.receiptNumber || res.data.paymentNumber || activePaymentId;
              openReceiptForPayment(recNo);
              await load();
            } else if (status === 'EXPIRED') {
              if (pollTimer) clearInterval(pollTimer);
              toast.error('Payment QR code has expired. Please generate a new request.');
            } else if (status === 'AMOUNT_MISMATCH') {
              if (pollTimer) clearInterval(pollTimer);
              toast.error('Partial or mismatched payment received. Please contact hostel manager.');
            }
          }
        } catch {
          /* ignore transient polling glitches */
        }
      }, 3000);

      countdownTimer = setInterval(() => {
        setRemainingTimeSeconds((prev) => {
          if (prev <= 1) {
            if (countdownTimer) clearInterval(countdownTimer);
            setPaymentStatus('EXPIRED');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      if (countdownTimer) clearInterval(countdownTimer);
    };
  }, [zeroGatewayModalOpen, activePaymentId, paymentStatus, load]);

  useEffect(() => {
    load();
  }, [load]);

  const installments: FeeInstallment[] = Array.isArray(feeData?.installments) ? feeData.installments : [];
  const payments: Payment[] = Array.isArray(feeData?.payments) ? feeData.payments : [];

  const currentDueInst =
    feeData?.currentDueInstallment ||
    installments.find(
      (inst) =>
        inst.status === 'PENDING' ||
        inst.status === 'PARTIALLY_PAID' ||
        inst.status === 'OVERDUE'
    ) ||
    installments.find((inst) => (inst.remainingAmount || 0) > 0) ||
    null;

  const isMonthly = feeData?.paymentPlan === 'MONTHLY';
  const totalFeeAmount = feeData?.totalFee || 0;
  const totalPaidAmount = feeData?.totalPaid || 0;
  const approvedAdjAmount = feeData?.approvedAdjustments || 0;
  const outstandingBal = feeData?.outstandingBalance ?? Math.max(0, totalFeeAmount - totalPaidAmount - approvedAdjAmount);

  const defaultDueAmount = currentDueInst ? currentDueInst.remainingAmount : outstandingBal;
  const maxPayable = isMonthly && !feeData?.allowAdvancePayment ? defaultDueAmount : outstandingBal;

  const payAmountNumber = paymentOption === 'FULL_DUE' ? defaultDueAmount : Number(customAmount) || 0;

  const isValidAmount =
    payAmountNumber > 0 &&
    payAmountNumber <= maxPayable &&
    !isNaN(payAmountNumber) &&
    /^\d+(\.\d{1,2})?$/.test(String(payAmountNumber));

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleOpenPaymentModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidAmount) return;

    setLoadingPaymentDetails(true);
    try {
      const details = await studentsApi.initiateDynamicQrPayment({
        amount: payAmountNumber,
        installmentId: selectedInstallmentId || currentDueInst?.id,
      });

      if (details.success && details.data) {
        setZeroGatewayData(details.data);
        setActivePaymentId(details.data.paymentId || details.data.paymentNumber);
        setPaymentStatus('PENDING');
        setRemainingTimeSeconds(details.data.paymentDetails?.expiresInSeconds || 900);
        setUtrNumber('');
        setProofFile(null);
        setProofPreview(null);
        setZeroGatewayModalOpen(true);
      } else {
        toast.error('Could not fetch hostel payment configuration.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to initialize hostel payment details.');
    } finally {
      setLoadingPaymentDetails(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size exceeds 5MB limit.');
      return;
    }

    setProofFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setProofPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitPaymentRef = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!utrNumber || !utrNumber.trim()) {
      toast.error('Please enter the UTR or Bank Transaction Reference Number.');
      return;
    }

    setSubmittingPayment(true);
    try {
      let uploadedProofUrl: string | undefined = undefined;
      if (proofPreview) {
        const uploadRes = await studentsApi.uploadPaymentProof(proofPreview);
        uploadedProofUrl = uploadRes.url;
      }

      await studentsApi.submitZeroGatewayPayment({
        amount: payAmountNumber,
        paymentMethod,
        transactionRef: utrNumber.trim(),
        proofUrl: uploadedProofUrl,
        installmentId: selectedInstallmentId || currentDueInst?.id,
        notes: `Submitted via IHMS Student Portal (${paymentMethod})`,
      });

      setZeroGatewayModalOpen(false);
      toast.success('Payment submitted successfully! It is now under verification by the hostel owner.');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit transaction reference.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const openReceiptForPayment = async (paymentIdOrNumber: string) => {
    try {
      const receipt = await studentsApi.getReceipt(paymentIdOrNumber);
      setActiveReceipt(receipt);
      setReceiptModalOpen(true);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to load payment receipt.');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <CardSkeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  if (!feeData || (!totalFeeAmount && installments.length === 0)) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Hostel Fees" description="View your fee details and payment plan" />
        <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-white p-12 text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No Fee Plan Configured</h3>
          <p className="max-w-md mx-auto text-xs text-slate-500 leading-relaxed">
            Your hostel fee plan has not yet been configured by the hostel administration. Please contact the hostel administrator.
          </p>
          <Button variant="outline" size="sm" onClick={load} className="mt-2 font-bold">
            Check Again
          </Button>
        </div>
      </div>
    );
  }

  const isOverdue = currentDueInst?.status === 'OVERDUE';
  const hasPendingDue = currentDueInst && currentDueInst.remainingAmount > 0;

  return (
    <div className="space-y-4 sm:space-y-5.5 max-w-6xl mx-auto">
      {/* Top Header */}
      <PageHeader
        title={t('fees.title', 'My Hostel Fees')}
        description={t('fees.description', 'View your payment plan, installment schedule, and pay directly to your hostel owner')}
        actions={
          <div className="flex items-center gap-2">
            {(user?.ihmsId || (feeData as any)?.student?.ihmsId || (feeData as any)?.student?.ihms_id) && (
              <Badge variant="outline" className="px-2.5 py-0.5 text-xs font-mono font-bold bg-white text-[#111827] border-[#CBD5E1]">
                Student ID: {user?.ihmsId || (feeData as any)?.student?.ihmsId || (feeData as any)?.student?.ihms_id}
              </Badge>
            )}
            <Badge variant={isMonthly ? 'info' : 'default'} className="px-2.5 py-0.5 text-xs font-bold">
              {isMonthly ? 'Monthly Payment Plan' : 'One-Time Payment Plan'}
            </Badge>
          </div>
        }
      />

      {/* Overdue / Reminder Banner */}
      {hasPendingDue && (
        <div className="relative overflow-hidden rounded-xl border-l-4 border-l-rose-500 border border-[#CBD5E1] bg-white p-3.5 sm:p-4.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 border border-rose-100 mt-0.5">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-black uppercase tracking-wider text-rose-600">
                    {isOverdue ? 'Payment Overdue' : 'Payment Reminder'}
                  </p>
                  <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                    {currentDueInst.month}
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-slate-800">
                  Your {currentDueInst.month} installment has{' '}
                  <span className="font-mono font-bold text-slate-900">₹{currentDueInst.remainingAmount.toLocaleString('en-IN')}</span> remaining.
                </p>
                <p className="text-[11px] sm:text-xs text-slate-500">
                  Due Date:{' '}
                  <span className="font-medium text-slate-700">
                    {new Date(currentDueInst.dueDate).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </p>
              </div>
            </div>

            <div className="shrink-0 sm:self-center">
              <Button
                size="sm"
                onClick={() => {
                  setPaymentOption('FULL_DUE');
                  window.scrollTo({ top: 300, behavior: 'smooth' });
                }}
                className="w-full sm:w-auto font-bold bg-[#E87545] hover:bg-[#D66434] text-white"
              >
                Pay Now <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 1. FEE SUMMARY CARDS */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        {/* Total Fee */}
        <div className="group rounded-xl border border-[#CBD5E1] bg-white p-3 sm:p-4 transition-colors hover:border-[#E87545]">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <p className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-[#64748B] truncate">TOTAL FEE</p>
              <p className="text-lg sm:text-2xl font-black font-mono tracking-tight text-[#111827] truncate">
                ₹{totalFeeAmount.toLocaleString('en-IN')}
              </p>
              <p className="text-[11px] sm:text-xs text-[#64748B] font-semibold truncate">
                {isMonthly ? `${installments.length} Installments` : 'Full Duration'}
              </p>
            </div>
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-[#ECE9E1] text-[#18233A] border border-[#CBD5E1]">
              <Wallet className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
          </div>
        </div>

        {/* Total Paid */}
        <div className="group rounded-xl border border-[#CBD5E1] bg-white p-3 sm:p-4 transition-colors hover:border-[#E87545]">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <p className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-[#64748B] truncate">TOTAL PAID</p>
              <p className="text-lg sm:text-2xl font-black font-mono tracking-tight text-[#111827] truncate">
                ₹{totalPaidAmount.toLocaleString('en-IN')}
              </p>
              <p className="text-[11px] sm:text-xs text-[#087A45] font-bold truncate">Verified paid</p>
            </div>
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]">
              <CheckCircle2 className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
          </div>
        </div>

        {/* Outstanding */}
        <div className="group rounded-xl border border-[#CBD5E1] bg-white p-3 sm:p-4 transition-colors hover:border-[#E87545]">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <p className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-[#64748B] truncate">OUTSTANDING</p>
              <p className={`text-lg sm:text-2xl font-black font-mono tracking-tight truncate ${outstandingBal > 0 ? 'text-[#C62828]' : 'text-[#111827]'}`}>
                ₹{outstandingBal.toLocaleString('en-IN')}
              </p>
              <p className="text-[11px] sm:text-xs text-[#64748B] font-semibold truncate">
                {approvedAdjAmount > 0 ? `₹${approvedAdjAmount.toLocaleString('en-IN')} discount` : 'Remaining'}
              </p>
            </div>
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-[#FEE2E2] text-[#C62828] border border-[#FECACA]">
              <AlertCircle className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
          </div>
        </div>

        {/* Next Payment */}
        <div className="group rounded-xl border border-[#CBD5E1] bg-white p-3 sm:p-4 transition-colors hover:border-[#E87545]">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <p className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-[#64748B] truncate">NEXT PAYMENT</p>
              <p className="text-lg sm:text-2xl font-black font-mono tracking-tight text-[#111827] truncate">
                ₹{(currentDueInst ? currentDueInst.remainingAmount : 0).toLocaleString('en-IN')}
              </p>
              <p className="text-[11px] sm:text-xs text-[#E87545] font-bold truncate">
                {currentDueInst
                  ? `Due: ${new Date(currentDueInst.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                  : 'All settled'}
              </p>
            </div>
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-[#FFF3EB] text-[#E87545] border border-[#FDE6D6]">
              <Calendar className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. CURRENT PAYMENT HERO & FORM */}
      <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 lg:p-7">
        <div className="grid gap-5 sm:gap-7 lg:grid-cols-12">
          {/* Left Info */}
          <div className="space-y-4 sm:space-y-5 lg:col-span-7">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#FFF3EB] text-[#E87545] border border-[#FDE6D6]">
                  <Calendar className="h-3.5 w-3.5" />
                </span>
                <p className="text-xs font-black uppercase tracking-wider text-[#E87545]">
                  CURRENT PAYMENT
                </p>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-black lg:text-3xl mt-1">
                {currentDueInst ? currentDueInst.month : 'All Dues Cleared'}
              </h2>
            </div>

            {currentDueInst ? (
              <div className="space-y-3.5 sm:space-y-4">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Amount Due</p>
                  <p className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-black sm:text-4xl mt-0.5 sm:mt-1">
                    ₹{currentDueInst.amount.toLocaleString('en-IN')}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2.5 sm:gap-4 rounded-xl border border-[#CBD5E1] bg-[#FAFAF7] p-3 sm:p-4">
                  <div>
                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-500">Already Paid</p>
                    <p className="text-sm sm:text-base font-black font-mono text-black mt-0.5">
                      ₹{currentDueInst.paidAmount.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-500">Remaining</p>
                    <p className={`text-sm sm:text-base font-black font-mono mt-0.5 ${currentDueInst.remainingAmount > 0 ? 'text-[#C62828]' : 'text-black'}`}>
                      ₹{currentDueInst.remainingAmount.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-500">Due Date</p>
                    <p className="text-[11px] sm:text-xs font-black text-black mt-0.5 sm:mt-1">
                      {new Date(currentDueInst.dueDate).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold text-slate-600">Status:</span>
                  <span className="inline-flex items-center rounded-full border border-[#FDE68A] bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-black text-[#C94F18] uppercase tracking-wider">
                    {currentDueInst.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-[#B4E2C7] bg-[#E8F5ED] p-4 sm:p-5 text-center space-y-1">
                <CheckCircle2 className="mx-auto h-7 w-7 sm:h-8 sm:w-8 text-[#087A45]" />
                <p className="text-sm font-black text-[#087A45]">No Pending Installments</p>
                <p className="text-xs text-[#087A45] font-semibold">All your scheduled hostel fee installments are fully paid.</p>
              </div>
            )}
          </div>

          {/* Right Payment Action Box */}
          <div className="rounded-xl border border-[#CBD5E1] bg-[#FAFAF7] p-4 sm:p-6 lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-black flex items-center gap-2">
                <Lock className="h-4 w-4 text-[#E87545]" />
                Hostel Fee Payment
              </h3>
              <span className="text-[11px] font-bold text-slate-500">Direct Owner Settlement</span>
            </div>

            {defaultDueAmount > 0 ? (
              <form onSubmit={handleOpenPaymentModal} className="space-y-4">
                <RadioGroup
                  value={paymentOption}
                  onValueChange={(v) => {
                    setPaymentOption(v as 'FULL_DUE' | 'CUSTOM');
                    if (v === 'FULL_DUE') setCustomAmount('');
                  }}
                  className="space-y-2.5"
                >
                  <div
                    onClick={() => setPaymentOption('FULL_DUE')}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3.5 text-xs transition-all ${
                      paymentOption === 'FULL_DUE'
                        ? 'border-[#E87545] bg-[#FFF3EB] font-black text-black'
                        : 'border-[#CBD5E1] bg-white text-slate-700 hover:border-[#E87545]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <RadioGroupItem value="FULL_DUE" id="opt-full" />
                      <Label htmlFor="opt-full" className="cursor-pointer font-bold text-black">
                        {isMonthly ? 'Pay Full Installment Due' : 'Pay Full Balance'}
                      </Label>
                    </div>
                    <span className="font-mono font-black text-[#E87545] text-sm">₹{defaultDueAmount.toLocaleString('en-IN')}</span>
                  </div>

                  <div
                    onClick={() => setPaymentOption('CUSTOM')}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3.5 text-xs transition-all ${
                      paymentOption === 'CUSTOM'
                        ? 'border-[#E87545] bg-[#FFF3EB] font-black text-black'
                        : 'border-[#CBD5E1] bg-white text-slate-700 hover:border-[#E87545]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <RadioGroupItem value="CUSTOM" id="opt-custom" />
                      <Label htmlFor="opt-custom" className="cursor-pointer font-bold text-black">Pay Custom Amount</Label>
                    </div>
                  </div>
                </RadioGroup>

                {paymentOption === 'CUSTOM' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] text-slate-600 font-bold">
                      <span>Enter Amount (₹)</span>
                      <span>Max: ₹{maxPayable.toLocaleString('en-IN')}</span>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={maxPayable}
                      step="any"
                      placeholder={`e.g. ${Math.min(5000, maxPayable)}`}
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="font-mono font-bold bg-white"
                      required
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">Preferred Method</Label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('UPI')}
                      className={`rounded-xl border py-2 text-center font-black transition-all ${
                        paymentMethod === 'UPI'
                          ? 'border-[#E87545] bg-[#FFF3EB] text-[#E87545]'
                          : 'border-[#CBD5E1] bg-white text-slate-700 hover:bg-[#F3F1EC]'
                      }`}
                    >
                      UPI / QR Code
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('BANK_TRANSFER')}
                      className={`rounded-xl border py-2 text-center font-black transition-all ${
                        paymentMethod === 'BANK_TRANSFER'
                          ? 'border-[#E87545] bg-[#FFF3EB] text-[#E87545]'
                          : 'border-[#CBD5E1] bg-white text-slate-700 hover:bg-[#F3F1EC]'
                      }`}
                    >
                      Bank Transfer
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loadingPaymentDetails || !isValidAmount}
                  className="w-full h-12 text-sm font-black tracking-wide bg-[#E87545] hover:bg-[#D66434] text-white"
                >
                  {loadingPaymentDetails ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Pay ₹{payAmountNumber.toLocaleString('en-IN')} Now
                </Button>
              </form>
            ) : (
              <div className="rounded-xl border border-[#B4E2C7] bg-[#E8F5ED] p-5 text-center space-y-1">
                <Check className="mx-auto h-6 w-6 text-[#087A45]" />
                <p className="text-xs font-black text-[#087A45]">No Payment Due</p>
                <p className="text-[11px] text-[#087A45] font-semibold">Your account has 0 outstanding obligations.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. PAYMENT SCHEDULE */}
      <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-[#CBD5E1]">
          <div>
            <h3 className="text-base font-black text-black">Payment Schedule</h3>
            <p className="text-xs font-semibold text-slate-500">
              Verified monthly breakdown and due date status
            </p>
          </div>
          {feeData.allowAdvancePayment && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 py-0.5 text-[11px] font-black text-[#2563EB]">
              <Sparkles className="h-3 w-3 text-[#2563EB]" /> Advance Payments Allowed
            </span>
          )}
        </div>

        {installments.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-[#CBD5E1] rounded-xl font-bold">
            No installments configured for this fee plan.
          </div>
        ) : (
          <div className="divide-y divide-[#CBD5E1] rounded-xl border border-[#CBD5E1] overflow-hidden">
            {installments.map((inst) => {
              const isDueNow = inst.id === currentDueInst?.id;
              return (
                <div
                  key={inst.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 gap-3 transition-colors ${
                    isDueNow
                      ? 'border-l-4 border-l-[#E87545] bg-[#FFF3EB] font-bold'
                      : 'bg-white hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg font-mono font-black text-xs sm:text-sm ${
                        inst.status === 'PAID'
                          ? 'bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]'
                          : inst.status === 'PARTIALLY_PAID'
                          ? 'bg-[#FEF3C7] text-[#C94F18] border border-[#FDE68A]'
                          : inst.status === 'OVERDUE'
                          ? 'bg-[#FEE2E2] text-[#C62828] border border-[#FECACA]'
                          : 'bg-[#FEF3C7] text-[#C94F18] border border-[#FDE68A]'
                      }`}
                    >
                      #{inst.installmentNumber}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-black">{inst.month}</p>
                        {isDueNow && (
                          <span className="rounded-full bg-[#E87545] px-2 py-0.5 text-[9px] font-black text-white">
                            CURRENT DUE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 font-bold">
                        <Clock className="h-3 w-3 text-[#E87545]" /> Due:{' '}
                        {new Date(inst.dueDate).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6">
                    <div className="text-left sm:text-right">
                      <p className="font-mono text-sm font-black text-black">₹{inst.amount.toLocaleString('en-IN')}</p>
                      {inst.status === 'PARTIALLY_PAID' ? (
                        <p className="text-xs text-[#C62828] font-bold">
                          ₹{inst.remainingAmount.toLocaleString('en-IN')} Left
                        </p>
                      ) : inst.status === 'PAID' ? (
                        <p className="text-xs text-[#087A45] font-bold">₹{inst.paidAmount.toLocaleString('en-IN')} Paid</p>
                      ) : null}
                    </div>

                    <InstallmentBadge status={inst.status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. PAYMENT HISTORY & RECEIPTS */}
      <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 space-y-3.5">
        <div className="flex items-center justify-between pb-2 border-b border-[#CBD5E1]">
          <div>
            <h3 className="text-base font-black text-black">Payment History</h3>
            <p className="text-xs font-semibold text-slate-500">Authenticated transaction records and downloadable receipts</p>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 font-bold border border-dashed border-[#CBD5E1] rounded-xl">
            No payment transactions recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-[#CBD5E1] overflow-hidden rounded-xl border border-[#CBD5E1]">
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 gap-3 hover:bg-[#F8FAFC] transition-colors"
              >
                <div className="min-w-0 flex items-center gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF3EB] text-[#E87545] border border-[#FDE6D6]">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-xs font-black text-black">{p.paymentNumber || p.id}</p>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                          p.status === 'VERIFIED' || p.status === 'SUCCESS'
                            ? 'bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]'
                            : p.status === 'UNDER_VERIFICATION' || p.status === 'SUBMITTED'
                            ? 'bg-[#FEF3C7] text-[#C94F18] border border-[#FDE68A]'
                            : 'bg-[#FEE2E2] text-[#C62828] border border-[#FECACA]'
                        }`}
                      >
                        {p.status === 'UNDER_VERIFICATION' ? 'UNDER VERIFICATION' : p.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-bold mt-0.5">
                      {new Date(p.date || (p as any).createdAt || Date.now()).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}{' '}
                      · {p.method || (p as any).paymentMethod} · Ref: <span className="font-mono text-black">{p.transactionRef || 'N/A'}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <span className="font-mono text-base font-black text-black">
                    ₹{p.amount.toLocaleString('en-IN')}
                  </span>
                  {(p.status === 'VERIFIED' || p.status === 'SUCCESS') && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openReceiptForPayment(p.paymentNumber || p.id)}
                      className="gap-1.5 text-xs font-bold"
                    >
                      <Download className="h-3.5 w-3.5 text-[#2563EB]" /> Receipt
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ZERO-GATEWAY DYNAMIC HOSTEL PAYMENT MODAL */}
      <Dialog open={zeroGatewayModalOpen} onOpenChange={setZeroGatewayModalOpen}>
        <DialogContent className="sm:max-w-xl rounded-xl border border-[#CBD5E1] bg-white p-5 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF3EB] text-[#E87545] border border-[#FDE6D6]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center text-lg font-black text-black">
              Hostel Payment — Direct Settlement
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-slate-500 font-medium">
              {zeroGatewayData?.student?.hostelName || 'Hostel'} Payment Portal
            </DialogDescription>
          </DialogHeader>

          {zeroGatewayData && !zeroGatewayData.configured ? (
            <div className="py-6 text-center space-y-4">
              <div className="rounded-xl border border-[#FDE68A] bg-[#FEF3C7] p-5 text-center space-y-2">
                <AlertCircle className="mx-auto h-7 w-7 text-[#C94F18]" />
                <p className="text-sm font-black text-[#C94F18]">Payment Details Not Configured</p>
                <p className="text-xs text-[#C94F18] font-semibold leading-relaxed">
                  {zeroGatewayData.message}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setZeroGatewayModalOpen(false)}
                className="w-full font-bold bg-[#E87545] hover:bg-[#D66434] text-white"
              >
                Close
              </Button>
            </div>
          ) : zeroGatewayData ? (
            <div className="space-y-4 py-1 text-xs">
              {/* Top Payable Summary */}
              <div className="rounded-xl border border-[#CBD5E1] bg-[#FAFAF7] p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Payable Amount</p>
                  <p className="text-xl font-black font-mono text-black">
                    ₹{payAmountNumber.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Payment Note / Ref</p>
                  <p className="font-mono text-xs font-black text-[#E87545]">
                    {zeroGatewayData.paymentDetails.transactionNote}
                  </p>
                </div>
              </div>

              {/* Payment Methods Switcher */}
              <div className="flex border-b border-[#CBD5E1]">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('UPI');
                    setPaymentMethod('UPI');
                  }}
                  className={`flex-1 py-2.5 text-xs font-black text-center border-b-2 transition-all ${
                    activeTab === 'UPI'
                      ? 'border-[#E87545] text-[#E87545] bg-[#FFF3EB]/40'
                      : 'border-transparent text-slate-500 hover:text-black'
                  }`}
                >
                  <QrCode className="inline-block h-3.5 w-3.5 mr-1.5" />
                  UPI / Dynamic QR Code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('BANK');
                    setPaymentMethod('BANK_TRANSFER');
                  }}
                  className={`flex-1 py-2.5 text-xs font-black text-center border-b-2 transition-all ${
                    activeTab === 'BANK'
                      ? 'border-[#E87545] text-[#E87545] bg-[#FFF3EB]/40'
                      : 'border-transparent text-slate-500 hover:text-black'
                  }`}
                >
                  <Landmark className="inline-block h-3.5 w-3.5 mr-1.5" />
                  Direct Bank Transfer
                </button>
              </div>

              {activeTab === 'UPI' && zeroGatewayData.paymentDetails.upi ? (
                /* TAB 1 & 2: DYNAMIC UPI QR & NATIVE APP LINK */
                <div className="space-y-4 text-center">
                  {paymentStatus === 'EXPIRED' ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center space-y-2">
                      <AlertCircle className="mx-auto h-6 w-6 text-rose-600" />
                      <p className="text-xs font-black text-rose-700">Dynamic Payment QR Expired</p>
                      <p className="text-[11px] text-rose-600 font-semibold">The 15-minute validity duration for this QR code has elapsed.</p>
                      <Button
                        type="button"
                        onClick={handleOpenPaymentModal}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
                      >
                        Generate New Dynamic QR
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Live Polling & Timer Banner */}
                      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-center space-y-1">
                        <div className="flex items-center justify-center gap-2 text-amber-800 font-black text-xs">
                          <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                          Waiting for payment confirmation...
                        </div>
                        <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-amber-700 font-mono">
                          <Clock className="h-3.5 w-3.5 text-amber-600" />
                          QR Expiry:{' '}
                          <span>
                            {Math.floor(remainingTimeSeconds / 60)
                              .toString()
                              .padStart(2, '0')}
                            :
                            {(remainingTimeSeconds % 60).toString().padStart(2, '0')}
                          </span>
                        </div>
                      </div>

                      <div className="inline-block p-3 bg-white rounded-xl border border-[#CBD5E1] shadow-sm">
                        {zeroGatewayData.paymentDetails.upi.qrDataUrl ? (
                          <img
                            src={zeroGatewayData.paymentDetails.upi.qrDataUrl}
                            alt="Dynamic Hostel UPI QR"
                            className="w-48 h-48 mx-auto object-contain"
                          />
                        ) : (
                          <div className="w-48 h-48 flex items-center justify-center text-slate-400 font-bold">
                            QR Unavailable
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <div className="space-y-2 max-w-sm mx-auto">
                    <div className="flex items-center justify-between rounded-lg border border-[#CBD5E1] bg-[#FAFAF7] px-3 py-2">
                      <div className="text-left">
                        <p className="text-[10px] font-bold text-slate-500">Hostel UPI ID (VPA)</p>
                        <p className="font-mono text-xs font-black text-black">
                          {zeroGatewayData.paymentDetails.upi.vpaAddress}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(zeroGatewayData.paymentDetails.upi.vpaAddress, 'UPI ID')}
                        className="h-7 text-[11px] font-bold gap-1"
                      >
                        {copiedField === 'UPI ID' ? <Check className="h-3 w-3 text-[#087A45]" /> : <Copy className="h-3 w-3" />}
                        {copiedField === 'UPI ID' ? 'Copied' : 'Copy'}
                      </Button>
                    </div>

                    {zeroGatewayData.paymentDetails.upi.intentUrl && (
                      <a
                        href={zeroGatewayData.paymentDetails.upi.intentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#087A45] hover:bg-[#066337] px-4 py-2.5 text-xs font-black text-white shadow-sm transition-all"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Installed UPI App (GPay / PhonePe / Paytm)
                      </a>
                    )}
                  </div>
                </div>
              ) : activeTab === 'BANK' && zeroGatewayData.paymentDetails.bank ? (
                /* TAB 3: DIRECT BANK TRANSFER */
                <div className="space-y-3 rounded-xl border border-[#CBD5E1] bg-[#FAFAF7] p-4">
                  <p className="text-xs font-black text-black">Hostel Owner Bank Account Details (IMPS / NEFT / RTGS)</p>
                  
                  <div className="grid gap-2.5 sm:grid-cols-2 text-xs">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-bold text-slate-500">Beneficiary Name</p>
                      <p className="font-bold text-black">{zeroGatewayData.paymentDetails.bank.beneficiaryName}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-bold text-slate-500">Bank Name</p>
                      <p className="font-bold text-black">{zeroGatewayData.paymentDetails.bank.bankName || 'N/A'}</p>
                    </div>

                    <div className="flex items-center justify-between rounded-lg bg-white border border-[#CBD5E1] p-2 sm:col-span-2">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500">Account Number</p>
                        <p className="font-mono font-black text-black text-sm">{zeroGatewayData.paymentDetails.bank.accountNumber}</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(zeroGatewayData.paymentDetails.bank.accountNumber, 'Account Number')}
                        className="h-7 text-[11px] font-bold gap-1"
                      >
                        {copiedField === 'Account Number' ? <Check className="h-3 w-3 text-[#087A45]" /> : <Copy className="h-3 w-3" />}
                        {copiedField === 'Account Number' ? 'Copied' : 'Copy'}
                      </Button>
                    </div>

                    <div className="flex items-center justify-between rounded-lg bg-white border border-[#CBD5E1] p-2 sm:col-span-2">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500">IFSC Code</p>
                        <p className="font-mono font-black text-black text-sm">{zeroGatewayData.paymentDetails.bank.ifscCode}</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(zeroGatewayData.paymentDetails.bank.ifscCode, 'IFSC Code')}
                        className="h-7 text-[11px] font-bold gap-1"
                      >
                        {copiedField === 'IFSC Code' ? <Check className="h-3 w-3 text-[#087A45]" /> : <Copy className="h-3 w-3" />}
                        {copiedField === 'IFSC Code' ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center text-xs font-bold text-slate-500">
                  Selected payment method is not configured by this hostel. Please choose another method.
                </div>
              )}

              {/* PAYMENT SUBMISSION FORM */}
              <form onSubmit={handleSubmitPaymentRef} className="space-y-3 pt-2 border-t border-[#CBD5E1]">
                <h4 className="text-xs font-black uppercase tracking-wider text-black">
                  Step 2: Submit Payment Reference For Verification
                </h4>

                <div className="space-y-1.5">
                  <Label htmlFor="utrInput" className="text-xs font-bold text-black">
                    UTR / Bank Transaction Reference Number *
                  </Label>
                  <Input
                    id="utrInput"
                    placeholder="e.g. 423910849201 or UTR1293049182"
                    value={utrNumber}
                    onChange={(e) => setUtrNumber(e.target.value)}
                    className="font-mono text-xs font-bold bg-white"
                    required
                  />
                  <p className="text-[11px] text-slate-500 font-semibold">
                    12-digit UTR/RRN from your payment app receipt
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="proofInput" className="text-xs font-bold text-black">
                    Upload Payment Screenshot / Proof (Optional)
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="proofInput"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      className="text-xs file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#FFF3EB] file:text-[#E87545] hover:file:bg-[#FDE6D6]"
                    />
                    {proofPreview && (
                      <div className="h-10 w-10 shrink-0 rounded-lg border border-[#CBD5E1] overflow-hidden bg-slate-100">
                        <img src={proofPreview} alt="Proof preview" className="h-full w-full object-cover" />
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter className="pt-2">
                  <Button
                    type="submit"
                    disabled={submittingPayment || !utrNumber.trim()}
                    className="w-full h-11 font-black text-xs uppercase tracking-wider bg-[#E87545] hover:bg-[#D66434] text-white"
                  >
                    {submittingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Submit Payment For Verification
                  </Button>
                </DialogFooter>
              </form>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* DIGITAL RECEIPT MODAL */}
      <PaymentReceiptModal
        open={receiptModalOpen}
        onOpenChange={setReceiptModalOpen}
        receipt={activeReceipt}
      />
    </div>
  );
}
