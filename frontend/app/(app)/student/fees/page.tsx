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
  Printer,
  FileText,
  Clock,
  ArrowRight,
  Sparkles,
  Lock,
  Wallet,
  Receipt,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { Badge, Money } from '@/components/dashboard/confirm-dialog';
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

export default function StudentFeesPage() {
  const { user } = useAuth();
  const cachedFees = getCachedData<FeeSummaryData>('/student/fees');
  const [feeData, setFeeData] = useState<FeeSummaryData | null>(() => cachedFees);
  const [loading, setLoading] = useState(() => !cachedFees);
  const [error, setError] = useState<string | null>(null);

  // Payment Form State
  const [paymentOption, setPaymentOption] = useState<'FULL_DUE' | 'CUSTOM'>('FULL_DUE');
  const [customAmount, setCustomAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'CARD' | 'NET_BANKING'>('UPI');
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string | null>(() => cachedFees?.currentDueInstallment?.id || null);

  // Modals & Gateway State
  const [onlineUnavailableModalOpen, setOnlineUnavailableModalOpen] = useState(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<PaymentReceipt | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);

  // Active Pending Order
  const [currentOrder, setCurrentOrder] = useState<{
    paymentId: string;
    paymentNumber: string;
    gatewayOrderId: string;
    amount: number;
    installmentMonth?: string;
  } | null>(null);

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

  useEffect(() => {
    load();
  }, [load]);

  // Safe normalized collections
  const installments: FeeInstallment[] = Array.isArray(feeData?.installments) ? feeData.installments : [];
  const payments: Payment[] = Array.isArray(feeData?.payments) ? feeData.payments : [];
  const adjustments = Array.isArray(feeData?.adjustments) ? feeData.adjustments : [];

  // Safe determination of current due installment
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

  // Selected payment amount
  const payAmountNumber = paymentOption === 'FULL_DUE' ? defaultDueAmount : Number(customAmount) || 0;
  const remainingPreview = Math.max(0, outstandingBal - payAmountNumber);

  // Validation
  const isValidAmount =
    payAmountNumber > 0 &&
    payAmountNumber <= maxPayable &&
    !isNaN(payAmountNumber) &&
    /^\d+(\.\d{1,2})?$/.test(String(payAmountNumber));

  const handleOpenSummary = (e: React.FormEvent) => {
    e.preventDefault();
    setOnlineUnavailableModalOpen(true);
    toast.info('Online payments are not available yet. This feature will be available in the next update. Please contact your hostel administrator to complete the payment.');
  };

  const handleProceedToGateway = async () => {
    if (!feeData || !isValidAmount) return;
    setSummaryModalOpen(false);
    setPaying(true);

    try {
      const initRes = await studentsApi.initiatePayment({
        amount: payAmountNumber,
        installmentId: selectedInstallmentId || currentDueInst?.id,
        paymentMethod,
        idempotencyKey: `IDEM-${Date.now()}-${user?.studentId || user?.id}`,
      });

      setCurrentOrder({
        paymentId: initRes.paymentId,
        paymentNumber: initRes.paymentNumber,
        gatewayOrderId: initRes.gatewayOrderId,
        amount: initRes.amount,
        installmentMonth: initRes.installmentMonth,
      });

      setCheckoutModalOpen(true);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to initialize payment gateway.');
    } finally {
      setPaying(false);
    }
  };

  const handleAuthorizePayment = async () => {
    if (!currentOrder) return;
    setVerifying(true);

    try {
      const gatewayPaymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const verifyRes = await studentsApi.verifyPayment({
        paymentId: currentOrder.paymentId,
        gatewayOrderId: currentOrder.gatewayOrderId,
        gatewayPaymentId,
        gatewaySignature: 'SANDBOX_VERIFIED_SIGNATURE',
      });

      setCheckoutModalOpen(false);
      setCurrentOrder(null);
      setActiveReceipt(verifyRes.receipt);
      setReceiptModalOpen(true);
      toast.success('Payment verified and official receipt generated!');
      load();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Payment confirmation failed.');
    } finally {
      setVerifying(false);
    }
  };

  const handleCancelPaymentOrder = async () => {
    if (!currentOrder) return;
    try {
      await studentsApi.cancelPayment(currentOrder.paymentId, 'Cancelled by student');
      setCheckoutModalOpen(false);
      setCurrentOrder(null);
      toast.info('Payment cancelled.');
    } catch {
      setCheckoutModalOpen(false);
      setCurrentOrder(null);
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

  // No Fee Plan Configured state
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
    <div className="space-y-4 sm:space-y-5.5">
      {/* Top Header */}
      <PageHeader
        title="My Hostel Fees"
        description="View your payment plan, installment schedule, and make verified fee payments"
        actions={
          <Badge variant={isMonthly ? 'info' : 'default'} className="px-2.5 py-0.5 text-xs font-bold">
            {isMonthly ? 'Monthly Payment Plan' : 'One-Time Payment Plan'}
          </Badge>
        }
      />

      {/* Overdue / Payment Reminder Alert */}
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
                className="w-full sm:w-auto font-bold"
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
        <div className="group rounded-xl border border-[#CBD5E1] bg-white p-3 sm:p-4 transition-colors duration-150 hover:border-[#E87545]">
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
        <div className="group rounded-xl border border-[#CBD5E1] bg-white p-3 sm:p-4 transition-colors duration-150 hover:border-[#E87545]">
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
        <div className="group rounded-xl border border-[#CBD5E1] bg-white p-3 sm:p-4 transition-colors duration-150 hover:border-[#E87545]">
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

        {/* Next Due / Current Month */}
        <div className="group rounded-xl border border-[#CBD5E1] bg-white p-3 sm:p-4 transition-colors duration-150 hover:border-[#E87545]">
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

      {/* 2. CURRENT PAYMENT HERO SECTION */}
      <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 lg:p-7">
        <div className="grid gap-5 sm:gap-7 lg:grid-cols-12">
          {/* Left Details */}
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
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[#000000] lg:text-3xl mt-1">
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

          {/* Right Action Payment Box */}
          <div className="rounded-xl border border-[#CBD5E1] bg-[#FAFAF7] p-4 sm:p-6 lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-[#000000] flex items-center gap-2">
                <Lock className="h-4 w-4 text-[#E87545]" />
                Make Fee Payment
              </h3>
              <span className="text-[11px] font-bold text-slate-500">256-bit Secure</span>
            </div>

            {defaultDueAmount > 0 ? (
              <form onSubmit={handleOpenSummary} className="space-y-4">
                {/* Options */}
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

                {/* Custom Amount Input */}
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
                      className="font-mono font-bold"
                      required
                    />
                  </div>
                )}

                {/* Payment Method Selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">Payment Method</Label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {(['UPI', 'CARD', 'NET_BANKING'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`rounded-xl border py-2.5 text-center font-black transition-all ${
                          paymentMethod === m
                            ? 'border-[#E87545] bg-[#FFF3EB] text-[#E87545]'
                            : 'border-[#CBD5E1] bg-white text-slate-700 hover:bg-[#F3F1EC]'
                        }`}
                      >
                        {m === 'UPI' ? 'UPI' : m === 'CARD' ? 'Card' : 'Net Banking'}
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={paying || !isValidAmount}
                  className="w-full h-12 text-sm font-black tracking-wide bg-[#E87545] hover:bg-[#D66434] text-white"
                >
                  {paying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Pay Now
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
            <h3 className="text-base font-black text-[#000000]">Payment Schedule</h3>
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
                          : inst.status === 'PENDING'
                          ? 'bg-[#FEF3C7] text-[#C94F18] border border-[#FDE68A]'
                          : 'bg-[#F8FAFC] text-[#18233A] border border-[#CBD5E1]'
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
            <h3 className="text-base font-black text-[#000000]">Payment History</h3>
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
                          p.status === 'SUCCESS'
                            ? 'bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]'
                            : p.status === 'PENDING'
                            ? 'bg-[#FEF3C7] text-[#C94F18] border border-[#FDE68A]'
                            : 'bg-[#FEE2E2] text-[#C62828] border border-[#FECACA]'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-bold mt-0.5">
                      {new Date(p.date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {p.method}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <span className="font-mono text-base font-black text-black">
                    ₹{p.amount.toLocaleString('en-IN')}
                  </span>
                  {p.status === 'SUCCESS' && (
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

      {/* PHASE 1: ONLINE PAYMENT UNAVAILABLE NOTICE MODAL */}
      <Dialog open={onlineUnavailableModalOpen} onOpenChange={setOnlineUnavailableModalOpen}>
        <DialogContent className="sm:max-w-md rounded-xl border border-[#CBD5E1] bg-white">
          <DialogHeader>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-[#FFF3EB] text-[#E87545] border border-[#FDE6D6]">
              <AlertCircle className="h-7 w-7 text-[#E87545]" />
            </div>
            <DialogTitle className="text-center text-lg font-black text-black">
              Online Payments Notice
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-slate-500 font-medium">
              Hostel Fee Payment System
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-center space-y-4">
            <div className="rounded-xl border border-[#CBD5E1] bg-[#FAFAF7] p-5 text-center">
              <p className="text-sm font-bold text-slate-800 leading-relaxed">
                Online payments are not available yet. This feature will be available in the next update. Please contact your hostel administrator to complete the payment.
              </p>
            </div>

            <div className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] p-3.5 text-xs text-[#2563EB] font-bold text-left flex items-start gap-2.5">
              <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Please pay directly to your Hostel Owner / Administrator using Cash or other manual methods. Once received, your administrator will record the payment and generate your official receipt.
              </span>
            </div>
          </div>

          <DialogFooter className="sm:justify-center">
            <Button
              type="button"
              onClick={() => setOnlineUnavailableModalOpen(false)}
              className="w-full sm:w-auto px-8 h-10 font-bold bg-[#E87545] hover:bg-[#D66434] text-white"
            >
              OK, Got It
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PAYMENT SUMMARY CONFIRMATION MODAL */}
      <Dialog open={summaryModalOpen} onOpenChange={setSummaryModalOpen}>
        <DialogContent className="sm:max-w-md rounded-xl border border-[#CBD5E1] bg-white">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF3EB] text-[#E87545] border border-[#FDE6D6]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center text-lg font-black text-black">Payment Summary</DialogTitle>
            <DialogDescription className="text-center text-xs text-slate-500 font-medium">
              Review transaction details before redirecting to the payment gateway.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="rounded-xl border border-[#CBD5E1] bg-[#FAFAF7] p-4 space-y-2.5">
              <div className="flex justify-between">
                <span className="text-slate-600 font-bold">Current Outstanding Balance:</span>
                <span className="font-mono font-black text-black">
                  ₹{outstandingBal.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 font-bold">Payment Amount:</span>
                <span className="font-mono font-black text-[#E87545] text-sm">
                  ₹{payAmountNumber.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="border-t border-[#CBD5E1] pt-2 flex justify-between">
                <span className="text-slate-600 font-bold">Remaining After Payment:</span>
                <span className="font-mono font-black text-black">
                  ₹{remainingPreview.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] p-3 text-[11px] text-[#2563EB] font-semibold leading-relaxed">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#2563EB] mt-0.5" />
              <span>
                Final balances are verified and committed by the server upon cryptographic gateway confirmation.
              </span>
            </div>
          </div>

          <DialogFooter className="sm:justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setSummaryModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleProceedToGateway}
              disabled={paying}
            >
              {paying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Proceed to Gateway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GATEWAY CHECKOUT MODAL */}
      <Dialog open={checkoutModalOpen} onOpenChange={(open) => !open && handleCancelPaymentOrder()}>
        <DialogContent className="sm:max-w-md rounded-xl border border-[#CBD5E1] bg-white">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-[#E87545] text-white">
              <Lock className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center text-lg font-black text-black">Secure Payment Gateway</DialogTitle>
            <DialogDescription className="text-center text-xs text-slate-500 font-medium">
              Order ID: <span className="font-mono font-bold text-black">{currentOrder?.gatewayOrderId}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-[#CBD5E1] bg-white p-5 text-center space-y-1">
              <p className="text-xs font-bold text-slate-500">Amount to Pay</p>
              <p className="text-3xl font-black font-mono text-black">
                ₹{currentOrder?.amount.toLocaleString('en-IN')}
              </p>
              <p className="text-[11px] font-bold text-slate-600">
                Payment For: {currentOrder?.installmentMonth || 'Hostel Fee'}
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <p className="font-black text-black">Select Mode:</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-[#E87545] bg-[#FFF3EB] p-2.5 text-center font-black text-[#E87545]">
                  UPI / QR
                </div>
                <div className="rounded-xl border border-[#E4E0D7] bg-white p-2.5 text-center text-slate-700 font-bold hover:bg-[#F3F1EC]">
                  Card
                </div>
                <div className="rounded-xl border border-[#E4E0D7] bg-white p-2.5 text-center text-slate-700 font-bold hover:bg-[#F3F1EC]">
                  Net Banking
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-[#FAFAF7] p-3 text-[11px] text-slate-600 text-center font-bold border border-[#E4E0D7]">
              🔒 256-bit Encrypted Transaction with Cryptographic Signature Verification
            </div>
          </div>

          <DialogFooter className="sm:justify-between gap-2">
            <Button type="button" variant="ghost" onClick={handleCancelPaymentOrder} disabled={verifying}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAuthorizePayment}
              disabled={verifying}
            >
              {verifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...
                </>
              ) : (
                'Authorize Payment'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OFFICIAL VERIFIABLE PAYMENT RECEIPT MODAL */}
      <PaymentReceiptModal
        open={receiptModalOpen}
        onOpenChange={setReceiptModalOpen}
        receipt={activeReceipt}
      />
    </div>
  );
}

function InstallmentBadge({ status }: { status: string }) {
  const map: Record<string, { variant: 'success' | 'warning' | 'error' | 'outline' | 'info'; label: string }> = {
    PAID: { variant: 'success', label: 'PAID' },
    PARTIALLY_PAID: { variant: 'warning', label: 'PARTIALLY PAID' },
    PENDING: { variant: 'warning', label: 'PENDING' },
    OVERDUE: { variant: 'error', label: 'OVERDUE' },
    UPCOMING: { variant: 'outline', label: 'UPCOMING' },
  };

  const conf = map[status] || { variant: 'outline', label: status };
  return <Badge variant={conf.variant}>{conf.label}</Badge>;
}
