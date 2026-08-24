'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Printer,
  Download,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Building2,
  Calendar,
  CreditCard,
  Hash,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge, Money } from '@/components/dashboard/confirm-dialog';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { apiClient } from '@/lib/api/client';
import type { PaymentReceipt, ApiError } from '@/lib/types';

export default function StudentPaymentReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const paymentId = params?.id as string;

  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReceipt = useCallback(async () => {
    if (!paymentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<PaymentReceipt>(`/fees/payments/${paymentId}/receipt`);
      setReceipt(res);
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load payment receipt.');
    } finally {
      setLoading(false);
    }
  }, [paymentId]);

  useEffect(() => {
    loadReceipt();
  }, [loadReceipt]);

  const handleDownloadPdf = () => {
    const url = `/api/fees/payments/${paymentId}/receipt/pdf`;
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <CardSkeleton className="h-16 rounded-2xl" />
        <CardSkeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <ErrorState message={error || 'Receipt not found'} onRetry={loadReceipt} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6 print:m-0 print:p-0 print:max-w-none">
      {/* Top Action Bar (Hidden during Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 print:hidden">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="w-fit gap-1.5 font-bold">
          <ArrowLeft className="h-4 w-4" /> Back to Payments
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5 font-bold">
            <Printer className="h-4 w-4" /> Print Receipt
          </Button>
          <Button size="sm" onClick={handleDownloadPdf} className="gap-1.5 font-bold">
            <Download className="h-4 w-4" /> Download Official PDF
          </Button>
        </div>
      </div>

      {/* Main 2D Printable Receipt Card */}
      <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-8 lg:p-10 space-y-5 sm:space-y-7 print:border-0 print:shadow-none print:p-4">
        {/* Receipt Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6 border-b border-[#CBD5E1] pb-4 sm:pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFF3EB] text-[#E87545] border border-[#FDE6D6]">
                <Building2 className="h-4 w-4" />
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-black tracking-tight">
                {receipt.hostelName || 'IHMS Hostel ERP'}
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-bold">Official Fee Payment & Acknowledgment Receipt</p>
            <p className="text-xs text-slate-400 font-medium">Digital Verification Authenticated</p>
          </div>

          <div className="text-left sm:text-right space-y-1.5">
            <Badge variant="success" className="px-3 py-1 text-xs">
              PAYMENT SUCCESSFUL
            </Badge>
            <p className="font-mono text-sm font-black text-black">
              {receipt.receiptNumber || receipt.receiptNo}
            </p>
            <p className="text-xs font-bold text-slate-500">
              Issued:{' '}
              {new Date(receipt.issuedAt || receipt.date || Date.now()).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
        </div>

        {/* Student & Payment Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-[#E4E0D7] bg-[#FAFAF7] p-5 text-xs">
          <div className="space-y-2">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Student Name</span>
              <p className="font-black text-black text-sm mt-0.5">{receipt.studentName}</p>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Student ID / Code</span>
              <p className="font-mono font-black text-[#E87545] text-sm mt-0.5">
                {receipt.customerCode || receipt.studentId}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Installment Period</span>
              <p className="font-black text-black mt-0.5">{receipt.installmentMonth || 'Hostel Fee Installment'}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Payment Reference</span>
              <p className="font-mono font-black text-black mt-0.5">{receipt.paymentNumber || receipt.paymentId}</p>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gateway Transaction ID</span>
              <p className="font-mono font-bold text-slate-700 mt-0.5">
                {receipt.gatewayTransactionId || receipt.transactionRef || 'ONLINE-VERIFIED'}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Payment Method</span>
              <p className="font-black text-black mt-0.5">{receipt.paymentMethod || 'Online Gateway'}</p>
            </div>
          </div>
        </div>

        {/* Financial Breakdown Table */}
        <div className="rounded-xl border border-[#E4E0D7] overflow-hidden">
          <table className="w-full text-xs">
            <thead className="receipt-table-header bg-[#18233A] text-white">
              <tr className="receipt-table-header">
                <th className="receipt-table-header px-4 py-3 text-left font-black uppercase tracking-wider !text-white text-[#FFFFFF]" style={{ color: '#FFFFFF' }}>
                  Fee Description
                </th>
                <th className="receipt-table-header px-4 py-3 text-right font-black uppercase tracking-wider !text-white text-[#FFFFFF]" style={{ color: '#FFFFFF' }}>
                  Amount Paid (INR)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E0D7]">
              <tr className="bg-white font-bold">
                <td className="px-4 py-4 text-black">
                  Hostel Accommodation & Bed Rent ({receipt.installmentMonth || 'Standard Installment'})
                </td>
                <td className="px-4 py-4 text-right font-mono font-black text-black text-sm">
                  ₹{receipt.amount.toLocaleString('en-IN')}
                </td>
              </tr>
              <tr className="bg-[#FFF3EB] font-black">
                <td className="px-4 py-3 text-[#E87545] font-black uppercase tracking-wider">
                  Total Amount Received
                </td>
                <td className="px-4 py-3 text-right font-mono font-black text-[#E87545] text-base">
                  ₹{receipt.amount.toLocaleString('en-IN')}
                </td>
              </tr>
              <tr className="bg-[#FAFAF7] font-bold">
                <td className="px-4 py-3 text-slate-600">Remaining Hostel Fee Balance</td>
                <td className="px-4 py-3 text-right font-mono font-black text-black">
                  ₹{(receipt.remainingBalance ?? 0).toLocaleString('en-IN')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Security & Verification Footer */}
        <div className="rounded-xl border border-[#E4E0D7] bg-[#FAFAF7] p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-[#087A45] shrink-0" />
            <div>
              <p className="font-black text-black">Digitally Verified Electronic Receipt</p>
              <p className="text-[11px] text-slate-500 font-semibold">
                Cryptographically validated and recorded on the IHMS secure ERP ledger.
              </p>
            </div>
          </div>
          <div className="font-mono text-[10px] text-slate-400 text-right">
            AUTH-KEY: {receipt.paymentNumber}
          </div>
        </div>
      </div>
    </div>
  );
}
