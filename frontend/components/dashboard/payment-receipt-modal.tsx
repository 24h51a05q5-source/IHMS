'use client';

import { useState } from 'react';
import { Printer, Download, CheckCircle2, Building2, Calendar, User, CreditCard, FileText, ArrowDownToLine, X, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { paymentsApi } from '@/lib/api/payments.api';
import { toast } from 'sonner';
import type { PaymentReceipt, Payment } from '@/lib/types';

interface PaymentReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: PaymentReceipt | null;
  payment?: Payment | null;
}

export function PaymentReceiptModal({ open, onOpenChange, receipt, payment }: PaymentReceiptModalProps) {
  const [downloading, setDownloading] = useState(false);

  if (!receipt && !payment) return null;

  const data: PaymentReceipt = receipt || {
    id: payment?.id || '',
    paymentId: payment?.id || '',
    studentId: payment?.studentId || '',
    receiptNumber: payment?.receiptNumber || payment?.receiptNo || payment?.paymentNumber || 'REC-OFFLINE',
    studentName: payment?.studentName || 'Student',
    customerCode: payment?.customerCode || payment?.studentId || '',
    amount: payment?.amount || 0,
    remainingBalance: 0,
    paymentMethod: payment?.method || 'CASH',
    paymentStatus: payment?.status === 'SUCCESS' ? 'PAID' : (payment?.status || 'PAID'),
    feeType: payment?.feeType || 'Hostel Rent',
    roomNumber: payment?.roomNumber || '',
    bedNumber: payment?.bedNumber || '',
    issuedBy: payment?.receivedBy || 'Authorized Staff',
    notes: payment?.notes || '',
    issuedAt: payment?.paidAt || payment?.date || new Date().toISOString(),
    transactionRef: payment?.transactionRef || payment?.paymentNumber || 'N/A',
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    const paymentId = data.paymentId || data.id;
    if (!paymentId) {
      toast.error('Payment identifier not found for PDF download.');
      return;
    }
    setDownloading(true);
    try {
      const blob = await paymentsApi.downloadReceipt(paymentId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IHMS-Receipt-${data.receiptNumber || paymentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Receipt PDF downloaded successfully!');
    } catch (err) {
      const pdfUrl = paymentsApi.getReceiptPdfUrl(paymentId);
      window.open(pdfUrl, '_blank');
      toast.info('Opened receipt in new window.');
    } finally {
      setDownloading(false);
    }
  };

  const receiptNum = data.receiptNumber || data.receiptNo || 'REC-OFFLINE';
  const isFullyPaid = (data.remainingBalance || 0) <= 0;
  const issueDate = data.issuedAt || data.date || new Date().toISOString();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-32px)] max-h-[90vh] p-0 flex flex-col overflow-hidden bg-white border border-[#CBD5E1] rounded-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Payment Receipt #{receiptNum}</DialogTitle>
        </DialogHeader>

        {/* Scrollable Printable Content Area */}
        <div className="printable-receipt receipt-content flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 text-[#111827] scrollbar-thin">
          {/* Header Bar */}
          <div className="rounded-xl bg-[#111827] p-4 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E87545] text-white">
                  <Building2 className="h-4 w-4" />
                </span>
                <span className="text-lg font-bold tracking-tight text-white">IHMS</span>
                <span className="text-xs text-[#9CA3AF] font-semibold">· Hostel Management System</span>
              </div>
              <p className="text-xs font-semibold text-[#D1D5DB]">
                {data.hostelName || 'Official Fee Payment Receipt'}
              </p>
            </div>

            <div className="text-left sm:text-right space-y-0.5">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#F97316] text-white">
                Receipt #{receiptNum}
              </span>
              <p className="text-[11px] font-medium text-[#D1D5DB]">
                {new Date(issueDate).toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          {/* Status Badge & Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl border border-[#BBF7D0] bg-[#DCFCE7]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[#16A34A] shrink-0" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#16A34A]">
                  Payment Status: {isFullyPaid ? 'Fully Paid' : 'Partially Paid'}
                </p>
                <p className="text-[11px] font-medium text-[#15803D]">
                  Transaction Verified & Confirmed in Hostel Ledger
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase text-[#15803D]">Payment Mode</span>
              <p className="text-xs font-bold text-[#16A34A]">{data.paymentMethod || 'CASH'}</p>
            </div>
          </div>

          {/* Details Grid */}
          <div className="rounded-xl border border-[#E9ECEF] bg-[#F9FAFB] p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] pb-2 border-b border-[#E5E7EB] mb-3">
              Student & Accommodation Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-6 text-xs">
              <div>
                <span className="text-[#6B7280] font-medium">Student Name:</span>
                <p className="font-bold text-[#1F2937] text-sm">{data.studentName}</p>
              </div>
              <div>
                <span className="text-[#6B7280] font-medium">Student ID / Customer Code:</span>
                <p className="font-bold text-[#F97316] font-mono text-sm">{data.customerCode || 'N/A'}</p>
              </div>
              <div>
                <span className="text-[#6B7280] font-medium">Room & Bed Number:</span>
                <p className="font-semibold text-[#1F2937]">
                  {data.roomNumber ? `Room ${data.roomNumber}` : 'Standard Room'}
                  {data.bedNumber ? ` · Bed ${data.bedNumber}` : ''}
                </p>
              </div>
              <div>
                <span className="text-[#6B7280] font-medium">Fee Category:</span>
                <p className="font-semibold text-[#1F2937]">{data.feeType || data.installmentMonth || 'Hostel Rent'}</p>
              </div>
              <div>
                <span className="text-[#6B7280] font-medium">Received By (Staff / Owner):</span>
                <p className="font-semibold text-[#1F2937]">{data.issuedBy || 'Authorized Staff'}</p>
              </div>
              <div>
                <span className="text-[#6B7280] font-medium">Transaction Reference:</span>
                <p className="font-mono text-[#1F2937] font-semibold truncate">{data.transactionRef || receiptNum}</p>
              </div>
            </div>
          </div>

          {/* Breakdown Table */}
          <div className="rounded-xl border border-[#E9ECEF] overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <thead className="receipt-table-header bg-[#F9FAFB] text-[#6B7280] border-b border-[#E9ECEF]">
                <tr>
                  <th className="py-2.5 px-4 text-left font-bold uppercase tracking-wider text-[#6B7280]">
                    Fee Item / Description
                  </th>
                  <th className="py-2.5 px-4 text-right font-bold uppercase tracking-wider text-[#6B7280]">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F3F5]">
                <tr className="bg-white">
                  <td className="py-2.5 px-4 font-medium text-[#374151]">
                    {data.feeType || 'Hostel Rent'} Payment
                    {data.notes && <span className="block text-[11px] text-[#6B7280] mt-0.5">{data.notes}</span>}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-[#1F2937] font-mono text-sm">
                    ₹{(data.amount || 0).toLocaleString('en-IN')}
                  </td>
                </tr>
                <tr className="bg-[#FFF7ED] border-t border-[#FFEDD5]">
                  <td className="py-2.5 px-4 font-bold text-[#F97316] text-sm uppercase">Total Amount Paid</td>
                  <td className="py-2.5 px-4 text-right font-bold text-[#F97316] font-mono text-base">
                    ₹{(data.amount || 0).toLocaleString('en-IN')}
                  </td>
                </tr>
                <tr className="bg-[#F9FAFB]">
                  <td className="py-2.5 px-4 font-medium text-[#6B7280]">Remaining Balance:</td>
                  <td className="py-2.5 px-4 text-right font-bold text-[#1F2937] font-mono">
                    ₹{(data.remainingBalance || 0).toLocaleString('en-IN')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer Authenticity Note */}
          <div className="rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] p-3 text-[11px] text-[#6B7280] space-y-0.5">
            <p className="font-bold text-[#374151] flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-[#F97316]" /> Authenticity & Verification
            </p>
            <p>
              This official receipt is digitally recorded and generated by the IHMS Hostel Management System. It serves as valid proof of payment. For questions or adjustments, contact hostel administration.
            </p>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="receipt-actions shrink-0 border-t border-[#E5E7EB] bg-white p-4 flex flex-wrap items-center justify-between gap-2.5 z-10">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-[#6B7280] font-semibold hover:bg-[#F9FAFB]">
            Close
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 font-semibold text-[#374151] border-[#D1D5DB] bg-white hover:bg-[#F9FAFB]"
            >
              <Printer className="h-4 w-4 text-[#6B7280]" /> Print Receipt
            </Button>

            <Button
              size="sm"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="gap-1.5 font-bold bg-[#F97316] hover:bg-[#EA580C] text-white shadow-xs"
            >
              <ArrowDownToLine className="h-4 w-4" />
              {downloading ? 'Generating PDF...' : 'Download PDF'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
