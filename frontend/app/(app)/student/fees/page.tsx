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
  Building2,
  Smartphone,
  Monitor,
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
import { paymentsApi, DynamicUpiQrResponse } from '@/lib/api/payments.api';
import { getCachedData } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import type { FeeSummaryData, FeeInstallment, Payment, PaymentReceipt, ApiError } from '@/lib/types';

function formatCurrency(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null || amount === '') return '₹0';
  const num = Number(amount);
  if (isNaN(num)) return '₹0';
  return `₹${num.toLocaleString('en-IN')}`;
}

function formatDate(dateValue: string | Date | undefined | null, options?: Intl.DateTimeFormatOptions): string {
  if (!dateValue) return 'N/A';
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-IN', options || { day: 'numeric', month: 'short', year: 'numeric' });
}

function InstallmentBadge({ status }: { status?: string }) {
  const s = (status || '').toUpperCase();
  if (s === 'PAID') {
    return (
      <span className="inline-flex items-center rounded-full bg-[#E8F5ED] px-2.5 py-0.5 text-xs font-black text-[#087A45] border border-[#B4E2C7] uppercase tracking-wider">
        PAID
      </span>
    );
  }
  if (s === 'PARTIALLY_PAID' || s === 'PARTIAL') {
    return (
      <span className="inline-flex items-center rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-black text-[#C94F18] border border-[#FDE68A] uppercase tracking-wider">
        PARTIAL
      </span>
    );
  }
  if (s === 'OVERDUE') {
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
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string | null>(
    () => cachedFees?.currentDueInstallment?.id || null
  );

  // Cashfree Multi-Tenant Dynamic UPI QR Modal State
  const [zeroGatewayModalOpen, setZeroGatewayModalOpen] = useState(false);
  const [loadingPaymentDetails, setLoadingPaymentDetails] = useState(false);
  const [cashfreeOrder, setCashfreeOrder] = useState<DynamicUpiQrResponse | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED'>('PENDING');
  const [paidReceiptInfo, setPaidReceiptInfo] = useState<{ receiptNumber?: string | null; amount: number; utr?: string | null } | null>(null);
  const [remainingTimeSeconds, setRemainingTimeSeconds] = useState<number>(900);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Device-Aware Checkout State (Mobile UPI Intent vs Desktop Dynamic QR)
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [viewModeOverride, setViewModeOverride] = useState<'AUTO' | 'MOBILE' | 'DESKTOP'>('AUTO');

  useEffect(() => {
    const checkDevice = () => {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const isMobileUa = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
      const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768;
      setIsMobileDevice(isMobileUa || isSmallScreen);
    };
    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  const isMobileView = viewModeOverride === 'MOBILE' || (viewModeOverride === 'AUTO' && isMobileDevice);

  // Receipt Modal State
  const [activeReceipt, setActiveReceipt] = useState<PaymentReceipt | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [hostelPaymentConfig, setHostelPaymentConfig] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [res, pmtCfgRes] = await Promise.all([
        studentsApi.getMyFees(),
        studentsApi.getPaymentInitiationDetails().catch(() => null),
      ]);
      setFeeData(res);
      if (pmtCfgRes) {
        const cfgData = (pmtCfgRes as any)?.data !== undefined ? (pmtCfgRes as any).data : pmtCfgRes;
        setHostelPaymentConfig(cfgData);
      }
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

  // Phase 3 & 4: Silent Polling every 2.5 seconds for Cashfree Payment Confirmation Handshake
  useEffect(() => {
    let pollTimer: NodeJS.Timeout | null = null;
    let countdownTimer: NodeJS.Timeout | null = null;

    if (zeroGatewayModalOpen && cashfreeOrder?.orderId && paymentStatus === 'PENDING') {
      pollTimer = setInterval(async () => {
        try {
          const res = await paymentsApi.getOrderStatus(cashfreeOrder.orderId);
          if (res) {
            const status = res.status;
            if (status === 'PAID' || status === 'SUCCESS') {
              setPaymentStatus('PAID');
              setPaidReceiptInfo({
                receiptNumber: res.receiptNumber,
                amount: res.amount,
                utr: res.utr,
              });
              if (pollTimer) clearInterval(pollTimer);
              toast.success('Payment received successfully! Digital receipt generated.');
              await load();
            } else if (status === 'EXPIRED') {
              setPaymentStatus('EXPIRED');
              if (pollTimer) clearInterval(pollTimer);
              toast.error('Dynamic UPI QR expired. Please generate a new request.');
            } else if (status === 'FAILED') {
              setPaymentStatus('FAILED');
              if (pollTimer) clearInterval(pollTimer);
              toast.error('Payment attempt failed. Please try again.');
            }
          }
        } catch {
          /* ignore transient polling glitches */
        }
      }, 2500);

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
  }, [zeroGatewayModalOpen, cashfreeOrder?.orderId, paymentStatus, load]);

  useEffect(() => {
    load();
  }, [load]);

  const installments: FeeInstallment[] = Array.isArray(feeData?.installments) ? feeData.installments : [];
  const payments: Payment[] = Array.isArray(feeData?.payments) ? feeData.payments : [];

  const currentDueInst =
    feeData?.currentDueInstallment ||
    installments.find((inst) => {
      const s = (inst.status || '').toUpperCase();
      return s === 'PENDING' || s === 'PARTIALLY_PAID' || s === 'PARTIAL' || s === 'OVERDUE';
    }) ||
    installments.find((inst) => Number(inst.remainingAmount ?? (inst as any).balanceAmount ?? 0) > 0) ||
    null;

  const isMonthly = feeData?.paymentPlan === 'MONTHLY';
  const totalFeeAmount = Number(feeData?.totalFee) || 0;
  const totalPaidAmount = Number(feeData?.totalPaid) || 0;
  const approvedAdjAmount = Number(feeData?.approvedAdjustments) || 0;
  const outstandingBal =
    feeData?.outstandingBalance !== undefined && feeData?.outstandingBalance !== null
      ? Number(feeData.outstandingBalance)
      : Math.max(0, totalFeeAmount - totalPaidAmount - approvedAdjAmount);

  const currentDueRemaining = currentDueInst
    ? Number(currentDueInst.remainingAmount ?? (currentDueInst as any).balanceAmount ?? 0)
    : 0;
  const defaultDueAmount = currentDueInst ? currentDueRemaining : outstandingBal;
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

  // Phase 2: Generate Cashfree Dynamic UPI QR (Customer Fee Bearer Model)
  const handleOpenPaymentModal = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isValidAmount) return;

    setLoadingPaymentDetails(true);
    try {
      const res = await paymentsApi.createUpiQrOrder({
        amount: payAmountNumber,
        installmentId: selectedInstallmentId || currentDueInst?.id,
      });

      if (!res || !res.orderId) {
        throw new Error('Failed to create Cashfree Dynamic UPI QR order');
      }

      setCashfreeOrder(res);
      setPaymentStatus('PENDING');
      setPaidReceiptInfo(null);
      setRemainingTimeSeconds(res.expiresInSeconds || 900);
      setZeroGatewayModalOpen(true);
    } catch (err: any) {
      toast.error(err?.message || 'Unable to generate dynamic UPI QR code. Please contact hostel administration.');
    } finally {
      setLoadingPaymentDetails(false);
    }
  };

  const handleCancelPayment = () => {
    setZeroGatewayModalOpen(false);
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
  const hasPendingDue = Boolean(
    currentDueInst && Number(currentDueInst.remainingAmount ?? (currentDueInst as any).balanceAmount ?? 0) > 0
  );

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
      {hasPendingDue && currentDueInst && (
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
                  <span className="font-mono font-bold text-slate-900">
                    {formatCurrency(currentDueInst.remainingAmount ?? (currentDueInst as any).balanceAmount)}
                  </span>{' '}
                  remaining.
                </p>
                <p className="text-[11px] sm:text-xs text-slate-500">
                  Due Date:{' '}
                  <span className="font-medium text-slate-700">
                    {formatDate(currentDueInst.dueDate, {
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
                {formatCurrency(totalFeeAmount)}
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
                {formatCurrency(totalPaidAmount)}
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
                {formatCurrency(outstandingBal)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#64748B] font-semibold truncate">
                {approvedAdjAmount > 0 ? `${formatCurrency(approvedAdjAmount)} discount` : 'Remaining'}
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
                {formatCurrency(currentDueInst ? (currentDueInst.remainingAmount ?? (currentDueInst as any).balanceAmount ?? 0) : 0)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#E87545] font-bold truncate">
                {currentDueInst
                  ? `Due: ${formatDate(currentDueInst.dueDate, { day: 'numeric', month: 'short' })}`
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
                    {formatCurrency(currentDueInst.amount)}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2.5 sm:gap-4 rounded-xl border border-[#CBD5E1] bg-[#FAFAF7] p-3 sm:p-4">
                  <div>
                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-500">Already Paid</p>
                    <p className="text-sm sm:text-base font-black font-mono text-black mt-0.5">
                      {formatCurrency(currentDueInst.paidAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-500">Remaining</p>
                    <p className={`text-sm sm:text-base font-black font-mono mt-0.5 ${Number(currentDueInst.remainingAmount ?? (currentDueInst as any).balanceAmount ?? 0) > 0 ? 'text-[#C62828]' : 'text-black'}`}>
                      {formatCurrency(currentDueInst.remainingAmount ?? (currentDueInst as any).balanceAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-500">Due Date</p>
                    <p className="text-[11px] sm:text-xs font-black text-black mt-0.5 sm:mt-1">
                      {formatDate(currentDueInst.dueDate)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold text-slate-600">Status:</span>
                  <InstallmentBadge status={currentDueInst.status} />
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
                    <span className="font-mono font-black text-[#E87545] text-sm">{formatCurrency(defaultDueAmount)}</span>
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
                      <span>Max: {formatCurrency(maxPayable)}</span>
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

                {/* DYNAMIC CHECKOUT TRANSPARENCY & CONVENIENCE FEE BREAKDOWN */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-[#E87545]" />
                      Payment Transparency Breakdown
                    </span>
                    <span className="text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                      Customer Fee Bearer
                    </span>
                  </div>

                  <div className="rounded-lg bg-[#F8F9FA] p-2.5 font-mono text-xs border border-slate-200/80 space-y-1.5">
                    <div className="flex justify-between items-center text-slate-700">
                      <span className="font-sans font-semibold">Base Rent / Fee:</span>
                      <span className="font-bold text-black">{formatCurrency(payAmountNumber)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 text-[11px]">
                      <span className="font-sans">Platform Convenience Fee:</span>
                      <span className="font-bold text-slate-800">₹1.50</span>
                    </div>
                    <div className="border-t border-slate-200 pt-1.5 flex justify-between items-center font-bold text-black">
                      <span className="font-sans font-black text-xs text-[#E87545]">Total to Pay:</span>
                      <span className="text-sm font-black text-[#E87545]">
                        ₹{(payAmountNumber + 1.5).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-md bg-slate-50 border border-slate-200 p-2 text-[10px] text-slate-600 font-mono">
                    Base Rent: ₹{payAmountNumber.toLocaleString('en-IN')} | Convenience Fee: ₹1.50 | Total to Pay: ₹{(payAmountNumber + 1.5).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 space-y-2 text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                        <QrCode className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-xs font-black text-emerald-950">100% Dynamic UPI QR Checkout</p>
                        <p className="text-[10px] text-emerald-700 font-semibold">Customer Fee Bearer • ₹0 Platform Gateway Cost</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-emerald-200/80 px-2 py-0.5 text-[9px] font-black text-emerald-900 uppercase tracking-wider">
                      UPI ONLY
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-relaxed font-medium">
                    Scan with any UPI app (Google Pay, PhonePe, Paytm, BHIM). 100% of your base hostel fee is credited directly to your hostel owner.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={loadingPaymentDetails || !isValidAmount}
                  className="w-full h-12 text-sm font-black tracking-wide bg-[#E87545] hover:bg-[#D66434] text-white flex items-center justify-center gap-2 shadow-sm"
                >
                  {loadingPaymentDetails ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                  Generate UPI QR for {formatCurrency(payAmountNumber)}
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
                          : inst.status === 'PARTIALLY_PAID' || (inst.status as string) === 'PARTIAL'
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
                        {formatDate(inst.dueDate, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6">
                    <div className="text-left sm:text-right">
                      <p className="font-mono text-sm font-black text-black">{formatCurrency(inst.amount)}</p>
                      {inst.status === 'PARTIALLY_PAID' || (inst.status as string) === 'PARTIAL' ? (
                        <p className="text-xs text-[#C62828] font-bold">
                          {formatCurrency(inst.remainingAmount ?? (inst as any).balanceAmount)} Left
                        </p>
                      ) : inst.status === 'PAID' ? (
                        <p className="text-xs text-[#087A45] font-bold">{formatCurrency(inst.paidAmount)} Paid</p>
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
                      {formatDate(p.date || (p as any).createdAt, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}{' '}
                      · {p.method || (p as any).paymentMethod || 'Payment'} · Ref:{' '}
                      <span className="font-mono text-black">{p.transactionRef || 'N/A'}</span>
                    </p>
                    {(p.status === 'UNDER_VERIFICATION' || p.status === 'SUBMITTED') && (
                      <p className="text-[11px] font-bold text-amber-700 mt-1">
                        Awaiting hostel owner verification · Balance updates once approved
                      </p>
                    )}
                    {p.status === 'REJECTED' && ((p as any).rejectionReason || (p as any).rejection_reason) && (
                      <p className="text-[11px] font-bold text-rose-600 mt-1">
                        Rejected by owner: {(p as any).rejectionReason || (p as any).rejection_reason}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <span className="font-mono text-base font-black text-black">
                    {formatCurrency(p.amount)}
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

      {/* CASHFREE 100% DYNAMIC UPI QR PAYMENT MODAL */}
      <Dialog open={zeroGatewayModalOpen} onOpenChange={setZeroGatewayModalOpen}>
<DialogContent className="w-[calc(100vw-16px)] sm:w-full sm:max-w-lg md:max-w-xl rounded-2xl border border-[#CBD5E1] bg-white p-4 sm:p-6 max-h-[calc(100dvh-20px)] sm:max-h-[90vh] overflow-y-auto shadow-2xl">
          <DialogHeader className="text-center space-y-1 pb-1">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF3EB] text-[#E87545] border border-[#FDE6D6] shadow-sm">
              {isMobileView ? <Smartphone className="h-7 w-7" /> : <QrCode className="h-7 w-7" />}
            </div>
            <DialogTitle className="text-center text-xl font-black text-black">
              {paymentStatus === 'PAID'
                ? 'Payment Successful'
                : isMobileView
                ? 'Mobile 1-Tap UPI Checkout'
                : 'Dynamic UPI QR Checkout'}
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-slate-500 font-medium">
              {cashfreeOrder?.hostelName || 'Hostel Fee Portal'} • Cashfree Easy Split Routing
            </DialogDescription>
          </DialogHeader>

          {/* SUCCESS HANDSHAKE SCREEN */}
          {paymentStatus === 'PAID' ? (
            <div className="space-y-5 py-2 text-center">
              <div className="rounded-2xl border border-[#B4E2C7] bg-[#E8F5ED] p-6 space-y-3">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#087A45] text-white shadow-lg">
                  <CheckCircle2 className="h-9 w-9" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#087A45]">Payment Verified!</h3>
                  <p className="text-xs text-[#066337] font-medium mt-1">
                    Your fee has been received and ledgered into your student balance.
                  </p>
                </div>
                <div className="rounded-xl bg-white border border-[#B4E2C7] p-3 text-left space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans font-bold">Amount Paid:</span>
                    <span className="font-black text-black">
                      {formatCurrency(paidReceiptInfo?.amount || cashfreeOrder?.amount || payAmountNumber)}
                    </span>
                  </div>
                  {paidReceiptInfo?.receiptNumber && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans font-bold">Receipt No:</span>
                      <span className="font-bold text-[#087A45]">{paidReceiptInfo.receiptNumber}</span>
                    </div>
                  )}
                  {paidReceiptInfo?.utr && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans font-bold">Bank UTR:</span>
                      <span className="font-bold text-slate-700">{paidReceiptInfo.utr}</span>
                    </div>
                  )}
                  {cashfreeOrder?.orderId && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans font-bold">Order ID:</span>
                      <span className="font-bold text-slate-600 truncate max-w-[200px]">{cashfreeOrder.orderId}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                {paidReceiptInfo?.receiptNumber && (
                  <Button
                    type="button"
                    onClick={() => {
                      setZeroGatewayModalOpen(false);
                      openReceiptForPayment(paidReceiptInfo.receiptNumber!);
                    }}
                    className="flex-1 h-11 font-black text-xs uppercase tracking-wider bg-[#087A45] hover:bg-[#066337] text-white gap-2 shadow-sm"
                  >
                    <Download className="h-4 w-4" /> View Digital Receipt
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setZeroGatewayModalOpen(false)}
                  className="h-11 font-bold text-xs uppercase tracking-wider text-slate-700 border-slate-300"
                >
                  Close
                </Button>
              </div>
            </div>
          ) : paymentStatus === 'FAILED' ? (
            /* FAILED PAYMENT SCREEN */
            <div className="space-y-4 py-4 text-center">
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 space-y-3">
                <AlertCircle className="mx-auto h-12 w-12 text-rose-600" />
                <h3 className="text-base font-black text-rose-800">Payment Attempt Failed</h3>
                <p className="text-xs text-rose-700 max-w-sm mx-auto">
                  The payment attempt was declined or cancelled (e.g. incorrect UPI PIN/VPA or bank decline). No funds were deducted. Please try again.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={handleOpenPaymentModal}
                  className="flex-1 h-11 font-black text-xs uppercase tracking-wider bg-[#E87545] hover:bg-[#D66434] text-white shadow-sm"
                >
                  Retry Payment / New QR
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelPayment}
                  className="h-11 text-xs font-bold text-slate-600"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : paymentStatus === 'EXPIRED' ? (
            /* EXPIRED QR CODE SCREEN */
            <div className="space-y-4 py-4 text-center">
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 space-y-3">
                <AlertCircle className="mx-auto h-12 w-12 text-rose-600" />
                <h3 className="text-base font-black text-rose-800">This QR code has expired</h3>
                <p className="text-xs text-rose-700 max-w-sm mx-auto">
                  This QR code has expired. Please click here to generate a new one. No amount has been debited.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={handleOpenPaymentModal}
                  className="flex-1 h-11 font-black text-xs uppercase tracking-wider bg-[#E87545] hover:bg-[#D66434] text-white shadow-sm"
                >
                  Click here to generate a new one
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelPayment}
                  className="h-11 text-xs font-bold text-slate-600"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            /* ACTIVE PENDING UPI QR / INTENT CHECKOUT */
            <div className="space-y-4 py-1 text-xs">
              {/* Amount Breakdown Box */}
              <div className="rounded-xl border border-[#CBD5E1] bg-[#FAFAF7] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      Total Payable Amount
                    </p>
                    <p className="text-2xl font-black font-mono text-black">
                      {formatCurrency(cashfreeOrder?.amount ?? (payAmountNumber + (cashfreeOrder?.platformMicroFee || 3)))}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center rounded-full bg-[#E8F5ED] px-2.5 py-1 text-[10px] font-black text-[#087A45] border border-[#B4E2C7]">
                      Cashfree Easy Split
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[11px] text-slate-600">
                  <span>Hostel Base Fee (100% credited to hostel owner):</span>
                  <span className="font-mono font-bold text-black">
                    {formatCurrency(cashfreeOrder?.baseAmount ?? payAmountNumber)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>Platform Micro-Fee (Flat System Handling):</span>
                  <span className="font-mono font-bold text-[#087A45]">
                    ₹{Number(cashfreeOrder?.platformMicroFee ?? 3).toFixed(2)}
                  </span>
                </div>

                <div className="rounded-lg bg-slate-100 p-2.5 text-[11px] font-mono text-slate-800 border border-slate-200">
                  Base Rent: ₹{Number(cashfreeOrder?.baseAmount ?? payAmountNumber).toLocaleString('en-IN')} | Platform Micro-Fee: ₹{Number(cashfreeOrder?.platformMicroFee ?? 3).toFixed(2)} | Total to Pay: ₹{Number(cashfreeOrder?.amount ?? (payAmountNumber + 3)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>

                <div className="rounded-lg bg-[#F8FAFC] border border-slate-200 p-2 text-[10px] text-slate-600 leading-relaxed">
                  <span className="font-bold text-slate-800">Cashfree Easy Split:</span> Zero hidden charges. Cashfree automatically splits this payment at transaction time: 100% of your base hostel rent is routed directly to your hostel owner&apos;s verified bank account, and the flat ₹3.00 micro-fee is routed to the platform.
                </div>
              </div>

              {/* Device Mode Switcher (Mobile 1-Tap vs Desktop QR) */}
              <div className="flex items-center justify-between rounded-xl bg-slate-100 p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setViewModeOverride('MOBILE')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
                    isMobileView
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80 font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5 text-[#E87545]" />
                  <span>Mobile 1-Tap UPI</span>
                  {isMobileDevice && <span className="text-[9px] bg-slate-200 text-slate-700 px-1 rounded font-normal">Detected</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setViewModeOverride('DESKTOP')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
                    !isMobileView
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80 font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Monitor className="h-3.5 w-3.5 text-[#087A45]" />
                  <span>Desktop QR Code</span>
                  {!isMobileDevice && <span className="text-[9px] bg-slate-200 text-slate-700 px-1 rounded font-normal">Detected</span>}
                </button>
              </div>

              {/* Waiting Indicator & Countdown Timer */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-center space-y-1">
                <div className="flex items-center justify-center gap-2 text-amber-900 font-black text-xs">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                  Waiting for payment confirmation...
                </div>
                <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-amber-700 font-mono">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  Expires in:{' '}
                  <span>
                    {Math.floor(remainingTimeSeconds / 60)
                      .toString()
                      .padStart(2, '0')}
                    :
                    {(remainingTimeSeconds % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              </div>

              {/* CONDITIONAL RENDERING: MOBILE VIEW (NO QR) VS DESKTOP VIEW (QR) */}
              {isMobileView ? (
                /* MOBILE VIEW: Clean 1-Tap Deep-Link Buttons (NO QR) */
                <div className="space-y-3 pt-1">
                  <div className="rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] p-3 text-center">
                    <p className="text-xs font-black text-[#166534]">
                      ⚡ Instant UPI Intent Checkout
                    </p>
                    <p className="text-[11px] text-[#15803D] mt-0.5">
                      Tap your preferred UPI app below to pay directly. No QR scanning or screenshot upload needed.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Google Pay */}
                    <a
                      href={cashfreeOrder?.upiAppLinks?.gpay || `tez://upi/pay?pa=${encodeURIComponent(cashfreeOrder?.upiId || '')}&pn=${encodeURIComponent(cashfreeOrder?.hostelName || 'Hostel')}&am=${(cashfreeOrder?.amount || payAmountNumber + 3).toFixed(2)}&cu=INR&tr=${cashfreeOrder?.orderId || ''}`}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white hover:bg-slate-50 p-3 text-xs font-bold text-slate-800 shadow-sm transition-all group hover:border-[#4285F4]"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#4285F4] font-black text-sm">
                          G
                        </div>
                        <div className="text-left">
                          <p className="font-extrabold text-slate-900">Google Pay</p>
                          <p className="text-[10px] text-slate-500 font-medium">1-Tap Direct UPI</p>
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-[#4285F4]" />
                    </a>

                    {/* PhonePe */}
                    <a
                      href={cashfreeOrder?.upiAppLinks?.phonepe || `phonepe://pay?pa=${encodeURIComponent(cashfreeOrder?.upiId || '')}&pn=${encodeURIComponent(cashfreeOrder?.hostelName || 'Hostel')}&am=${(cashfreeOrder?.amount || payAmountNumber + 3).toFixed(2)}&cu=INR&tr=${cashfreeOrder?.orderId || ''}`}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white hover:bg-slate-50 p-3 text-xs font-bold text-slate-800 shadow-sm transition-all group hover:border-[#5f259f]"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-[#5f259f] font-black text-sm">
                          Pe
                        </div>
                        <div className="text-left">
                          <p className="font-extrabold text-slate-900">PhonePe</p>
                          <p className="text-[10px] text-slate-500 font-medium">1-Tap Direct UPI</p>
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-[#5f259f]" />
                    </a>

                    {/* Paytm */}
                    <a
                      href={cashfreeOrder?.upiAppLinks?.paytm || `paytmmp://pay?pa=${encodeURIComponent(cashfreeOrder?.upiId || '')}&pn=${encodeURIComponent(cashfreeOrder?.hostelName || 'Hostel')}&am=${(cashfreeOrder?.amount || payAmountNumber + 3).toFixed(2)}&cu=INR&tr=${cashfreeOrder?.orderId || ''}`}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white hover:bg-slate-50 p-3 text-xs font-bold text-slate-800 shadow-sm transition-all group hover:border-[#00BAF2]"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-[#00BAF2] font-black text-xs">
                          Paytm
                        </div>
                        <div className="text-left">
                          <p className="font-extrabold text-slate-900">Paytm UPI</p>
                          <p className="text-[10px] text-slate-500 font-medium">1-Tap Direct UPI</p>
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-[#00BAF2]" />
                    </a>

                    {/* Generic UPI Intent / Any App */}
                    <a
                      href={cashfreeOrder?.upiAppLinks?.generic || cashfreeOrder?.upiIntentUrl || `upi://pay?pa=${encodeURIComponent(cashfreeOrder?.upiId || '')}&pn=${encodeURIComponent(cashfreeOrder?.hostelName || 'Hostel')}&am=${(cashfreeOrder?.amount || payAmountNumber + 3).toFixed(2)}&cu=INR&tr=${cashfreeOrder?.orderId || ''}`}
                      className="flex items-center justify-between rounded-xl border border-[#087A45] bg-[#E8F5ED] hover:bg-[#D9EFE2] p-3 text-xs font-bold text-[#087A45] shadow-sm transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#087A45] text-white font-black text-xs">
                          UPI
                        </div>
                        <div className="text-left">
                          <p className="font-extrabold text-[#087A45]">Other UPI App</p>
                          <p className="text-[10px] text-[#066337] font-medium">BHIM, Cred, Navi, etc.</p>
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-[#087A45]" />
                    </a>
                  </div>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => setViewModeOverride('DESKTOP')}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline decoration-slate-300"
                    >
                      Prefer to scan a QR code from another device? Switch to Desktop QR
                    </button>
                  </div>
                </div>
              ) : (
                /* DESKTOP VIEW: Dynamic Scannable QR Code */
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="inline-block p-3.5 bg-white rounded-2xl border-2 border-dashed border-[#CBD5E1] shadow-sm">
                      {cashfreeOrder?.qrDataUrl ? (
                        <img
                          src={cashfreeOrder.qrDataUrl}
                          alt="Cashfree Dynamic UPI QR Code"
                          className="w-52 h-52 mx-auto object-contain rounded-lg"
                        />
                      ) : (
                        <div className="w-52 h-52 flex flex-col items-center justify-center text-slate-400 gap-2 font-bold">
                          <QrCode className="h-12 w-12 text-slate-300" />
                          Generating Dynamic QR...
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 font-semibold mt-2">
                      Scan using Google Pay, PhonePe, Paytm, BHIM, or any UPI app
                    </p>
                  </div>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setViewModeOverride('MOBILE')}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline decoration-slate-300"
                    >
                      On mobile or prefer 1-tap app buttons? Switch to Mobile UPI
                    </button>
                  </div>
                </div>
              )}

              {/* VPA / UPI ID Copy Row */}
              {cashfreeOrder?.upiId && (
                <div className="flex items-center justify-between rounded-xl border border-[#CBD5E1] bg-[#FAFAF7] px-3.5 py-2.5">
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-slate-500">Cashfree UPI VPA</p>
                    <p className="font-mono text-xs font-black text-black">
                      {cashfreeOrder.upiId}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(cashfreeOrder.upiId!, 'UPI VPA')}
                    className="h-8 text-[11px] font-bold gap-1"
                  >
                    {copiedField === 'UPI VPA' ? <Check className="h-3.5 w-3.5 text-[#087A45]" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedField === 'UPI VPA' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelPayment}
                  className="h-10 text-xs font-bold text-rose-600 border-rose-200 hover:bg-rose-50"
                >
                  Cancel Payment
                </Button>
              </div>
            </div>
          )}
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
