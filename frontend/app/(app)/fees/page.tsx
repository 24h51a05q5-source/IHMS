'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DollarSign,
  Plus,
  Receipt,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Printer,
  Download,
  Building2,
  Calendar,
  User,
  CreditCard,
  FileText,
  Banknote,
  ShieldCheck,
  Check,
  X,
  Eye,
  FileImage,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import { PaymentReceiptModal } from '@/components/dashboard/payment-receipt-modal';
import { feesApi } from '@/lib/api/fees.api';
import { paymentsApi } from '@/lib/api/payments.api';
import { studentsApi } from '@/lib/api/students.api';
import { getCachedData } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import type { ApiError, Payment, PaymentReceipt } from '@/lib/types';

function FeesPageContent() {
  const { user, hasRole } = useAuth();

  const cachedFees = getCachedData<{ items: any[] }>('/fees', { pageSize: 150 });
  const cachedPayments = getCachedData<{ items: Payment[] }>('/payments', { pageSize: 150 });
  const cachedStudents = getCachedData<{ items: any[] }>('/students', { pageSize: 150 });

  const [fees, setFees] = useState<any[]>(() => cachedFees?.items || []);
  const [payments, setPayments] = useState<Payment[]>(() => cachedPayments?.items || []);
  const [students, setStudents] = useState<any[]>(() => cachedStudents?.items || []);
  const [pendingVerifications, setPendingVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(() => !cachedFees?.items?.length && !cachedPayments?.items?.length);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState('ledger');

  // Cash Payment Recording Modal State
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Active Receipt Modal State
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<PaymentReceipt | null>(null);
  const [activePayment, setActivePayment] = useState<Payment | null>(null);

  // Pending Verification Action States
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [proofModalOpen, setProofModalOpen] = useState(false);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectPaymentId, setRejectPaymentId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const [payForm, setPayForm] = useState({
    studentId: '',
    amount: '',
    feeType: 'Hostel Rent',
    method: 'CASH',
    paymentDate: new Date().toISOString().split('T')[0],
    receivedBy: user?.name || 'Authorized Staff',
    notes: '',
    feeId: '',
    installmentId: '',
  });

  const loadData = useCallback(async () => {
    try {
      const [fRes, pRes, sRes, pendingRes] = await Promise.all([
        feesApi.list({ pageSize: 150 }),
        paymentsApi.list({ pageSize: 150 }),
        studentsApi.list({ pageSize: 150 }),
        feesApi.getPendingVerifications({ pageSize: 150 }),
      ]);
      setFees(fRes?.items || []);
      setPayments(pRes?.items || []);
      setStudents(sRes?.items || []);
      setPendingVerifications(pendingRes?.items || []);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to load fee ledger.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedStudentObj = students.find((s) => s.id === payForm.studentId);

  const handleStudentSelect = (studentId: string) => {
    const fee = fees.find((f) => f.studentId === studentId);
    const outstanding = fee?.outstanding !== undefined ? fee.outstanding : (fee?.total || 8000);

    setPayForm((prev) => ({
      ...prev,
      studentId,
      amount: outstanding > 0 ? String(outstanding) : '',
      feeId: fee?.id || '',
      receivedBy: user?.name || prev.receivedBy || 'Authorized Staff',
    }));
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payForm.studentId || !payForm.amount || Number(payForm.amount) <= 0) {
      toast.error('Please select a student and enter a valid payment amount.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await paymentsApi.create({
        studentId: payForm.studentId,
        amount: Number(payForm.amount),
        method: payForm.method as any,
        paymentMode: payForm.method,
        feeType: payForm.feeType,
        roomNumber: selectedStudentObj?.roomNumber || selectedStudentObj?.roomCode || '',
        bedNumber: selectedStudentObj?.bedNumber || selectedStudentObj?.bedCode || '',
        paymentDate: payForm.paymentDate,
        notes: payForm.notes,
        remarks: payForm.notes,
        receivedBy: payForm.receivedBy || user?.name || 'Authorized Staff',
        feeId: payForm.feeId || undefined,
        installmentId: payForm.installmentId || undefined,
      });

      toast.success(`Payment of ₹${Number(payForm.amount).toLocaleString('en-IN')} recorded successfully!`);
      setPayModalOpen(false);

      if (res.receipt || res.payment) {
        setActiveReceipt(res.receipt || null);
        setActivePayment(res.payment || null);
        setReceiptModalOpen(true);
      }
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifySubmission = async (paymentId: string) => {
    setVerifyingId(paymentId);
    try {
      const result = await feesApi.verifyPaymentSubmission(paymentId);
      toast.success(result.message || 'Payment verified and official receipt generated!');
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to verify payment.');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleRejectSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectPaymentId) return;

    setRejecting(true);
    try {
      await feesApi.rejectPaymentSubmission(rejectPaymentId, rejectReason);
      toast.info('Payment submission has been rejected.');
      setRejectModalOpen(false);
      setRejectPaymentId(null);
      setRejectReason('');
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reject payment submission.');
    } finally {
      setRejecting(false);
    }
  };

  const filteredFees = fees.filter((f) => {
    const matchSearch =
      !search ||
      (f.studentName || '').toLowerCase().includes(search.toLowerCase()) ||
      (f.customerCode || f.studentId || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || f.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredPayments = payments.filter((p) => {
    if (!search) return true;
    return (
      (p.studentName || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.customerCode || p.studentId || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.receiptNo || p.receiptNumber || p.paymentNumber || '').toLowerCase().includes(search.toLowerCase())
    );
  });

  const filteredVerifications = pendingVerifications.filter((v) => {
    if (!search) return true;
    return (
      (v.studentName || '').toLowerCase().includes(search.toLowerCase()) ||
      (v.customerCode || v.studentId || '').toLowerCase().includes(search.toLowerCase()) ||
      (v.transactionRef || v.paymentNumber || '').toLowerCase().includes(search.toLowerCase())
    );
  });

  const totalDemanded = fees.reduce((sum, f) => sum + (f.total || 0), 0);
  const totalCollected = fees.reduce((sum, f) => sum + (f.paid || 0), 0);
  const totalOutstanding = fees.reduce((sum, f) => sum + (f.outstanding || 0), 0);
  const overdueCount = fees.filter((f) => f.status === 'OVERDUE' || (f.outstanding || 0) > 0).length;

  const feeColumns: Column<any>[] = [
    {
      key: 'student',
      header: 'Student Name & Customer Code',
      cell: (f) => (
        <div>
          <p className="font-extrabold text-slate-950 text-sm">{f.studentName || 'Student'}</p>
          <p className="text-xs font-mono font-bold text-slate-600">{f.customerCode || f.studentId}</p>
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Payment Plan',
      cell: (f) => (
        <span className="text-xs font-bold text-slate-700">
          {f.paymentPlan === 'MONTHLY' ? 'Monthly Installments' : 'One-Time Full Fee'}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total Demanded',
      cell: (f) => <span className="font-mono text-xs font-bold text-slate-900">₹{(f.total || 0).toLocaleString('en-IN')}</span>,
    },
    {
      key: 'paid',
      header: 'Collected',
      cell: (f) => <span className="font-mono text-xs font-bold text-emerald-700">₹{(f.paid || 0).toLocaleString('en-IN')}</span>,
    },
    {
      key: 'outstanding',
      header: 'Outstanding Balance',
      cell: (f) => (
        <span className={`font-mono text-xs font-black ${(f.outstanding || 0) > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
          ₹{(f.outstanding || 0).toLocaleString('en-IN')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (f) => (
        <Badge variant={f.status === 'PAID' ? 'success' : f.status === 'OVERDUE' ? 'error' : 'warning'}>
          {f.status || 'PENDING'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (f) => (
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5 font-bold border-slate-300 text-slate-900 hover:bg-slate-50 hover:text-black"
          onClick={() => {
            handleStudentSelect(f.studentId);
            setPayModalOpen(true);
          }}
        >
          <Banknote className="h-3.5 w-3.5 text-[#087A45]" />
          Record Cash
        </Button>
      ),
    },
  ];

  const paymentColumns: Column<Payment>[] = [
    {
      key: 'receiptNo',
      header: 'Receipt #',
      cell: (p) => (
        <div>
          <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-slate-100 text-slate-900 border border-slate-200">
            {p.receiptNo || p.receiptNumber || p.paymentNumber || 'REC-OFFLINE'}
          </span>
          <p className="text-[11px] font-bold text-slate-600 mt-0.5">
            {new Date(p.paidAt || p.date || (p as any).createdAt || Date.now()).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>
      ),
    },
    {
      key: 'student',
      header: 'Student Name & ID',
      cell: (p) => (
        <div>
          <p className="font-extrabold text-slate-950 text-sm">{p.studentName || 'Student'}</p>
          <p className="text-xs font-mono font-bold text-slate-600">
            {p.customerCode || p.studentId}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount Paid',
      cell: (p) => (
        <span className="font-mono text-sm font-black text-emerald-700">
          ₹{(p.amount || 0).toLocaleString('en-IN')}
        </span>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      cell: (p) => (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black uppercase bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]">
          {p.method || (p as any).paymentMethod || 'CASH'}
        </span>
      ),
    },
  ];

  const verificationColumns: Column<any>[] = [
    {
      key: 'student',
      header: 'Student & Hostel',
      cell: (v) => (
        <div>
          <p className="font-extrabold text-slate-950 text-sm">{v.studentName || 'Student'}</p>
          <p className="text-xs font-mono font-bold text-slate-600">
            {v.customerCode} · {v.hostelName || 'Hostel'}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount & Method',
      cell: (v) => (
        <div>
          <p className="font-mono text-sm font-black text-black">₹{Number(v.amount || 0).toLocaleString('en-IN')}</p>
          <span className="inline-block mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#E87545]">
            {v.paymentMethod || 'UPI'}
          </span>
        </div>
      ),
    },
    {
      key: 'utr',
      header: 'UTR / Bank Ref',
      cell: (v) => (
        <div>
          <span className="font-mono text-xs font-black text-black bg-slate-100 px-2 py-1 rounded border">
            {v.transactionRef}
          </span>
          <p className="text-[10px] text-slate-500 font-bold mt-1">
            Submitted: {new Date(v.submittedAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      ),
    },
    {
      key: 'proof',
      header: 'Screenshot Proof',
      cell: (v) => (
        v.proofUrl ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setProofPreviewUrl(v.proofUrl);
              setProofModalOpen(true);
            }}
            className="h-8 text-xs gap-1 font-bold border-slate-300"
          >
            <FileImage className="h-3.5 w-3.5 text-[#2563EB]" /> View Proof
          </Button>
        ) : (
          <span className="text-xs text-slate-400 font-semibold">No Image</span>
        )
      ),
    },
    {
      key: 'actions',
      header: 'Verification Actions',
      cell: (v) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={verifyingId === v.id}
            onClick={() => handleVerifySubmission(v.id)}
            className="h-8 px-3 text-xs font-black bg-[#087A45] hover:bg-[#066337] text-white gap-1"
          >
            {verifyingId === v.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Verify
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setRejectPaymentId(v.id);
              setRejectReason('');
              setRejectModalOpen(true);
            }}
            className="h-8 px-3 text-xs font-black border-rose-300 text-rose-700 hover:bg-rose-50 gap-1"
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5.5 w-full min-w-0 pb-8 overflow-x-hidden max-w-7xl mx-auto">
      <PageHeader
        title="Fees & Multi-Channel Payment Engine"
        description="Verify student UTR submissions, record cash collections, track hostel ledgers, and issue official receipts."
        action={
          hasRole('ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'ACCOUNTANT') && (
            <Button
              onClick={() => {
                setPayForm({
                  studentId: '',
                  amount: '',
                  feeType: 'Hostel Rent',
                  method: 'CASH',
                  paymentDate: new Date().toISOString().split('T')[0],
                  receivedBy: user?.name || 'Authorized Staff',
                  notes: '',
                  feeId: '',
                  installmentId: '',
                });
                setPayModalOpen(true);
              }}
              className="gap-2 font-black bg-[#E87545] hover:bg-[#D66434] text-white w-full sm:w-auto"
            >
              <Banknote className="h-4 w-4" />
              Record Cash Payment
            </Button>
          )
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4 w-full min-w-0">
        <StatCard title="Total Demanded" value={`₹${totalDemanded.toLocaleString('en-IN')}`} icon={DollarSign} />
        <StatCard title="Total Collected" value={`₹${totalCollected.toLocaleString('en-IN')}`} icon={CheckCircle2} />
        <StatCard title="Outstanding Balance" value={`₹${totalOutstanding.toLocaleString('en-IN')}`} icon={AlertCircle} />
        <StatCard title="Pending Verifications" value={pendingVerifications.length} icon={Clock} />
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3.5 sm:space-y-4 w-full min-w-0">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 bg-[#F8FAFC] p-2.5 sm:p-3 rounded-xl border border-[#CBD5E1] w-full min-w-0">
          <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:flex bg-white border border-[#CBD5E1] p-1 rounded-lg">
            <TabsTrigger value="ledger" className="gap-1.5 px-3 text-xs sm:text-sm font-bold justify-center">
              <DollarSign className="h-4 w-4 shrink-0" />
              <span>Fee Ledgers</span>
            </TabsTrigger>
            <TabsTrigger value="verifications" className="gap-1.5 px-3 text-xs sm:text-sm font-bold justify-center relative">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[#E87545]" />
              <span>Pending Verification</span>
              {pendingVerifications.length > 0 && (
                <span className="ml-1 rounded-full bg-[#E87545] px-1.5 py-0.2 text-[10px] font-black text-white">
                  {pendingVerifications.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 px-3 text-xs sm:text-sm font-bold justify-center">
              <Receipt className="h-4 w-4 shrink-0" />
              <span>Receipts ({payments.length})</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto min-w-0">
            <SearchInput
              placeholder="Search student, UTR, receipt..."
              value={search}
              onChange={setSearch}
              className="h-9 font-bold text-xs"
              containerClassName="flex-1 min-w-0 sm:w-64"
            />
            {activeTab === 'ledger' && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-28 xs:w-32 sm:w-36 shrink-0 h-9 font-bold text-xs bg-white border-[1.5px] border-[#CBD5E1] text-[#111827]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-white border-[1.5px] border-[#CBD5E1]">
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                  <SelectItem value="PARTIAL">Partial</SelectItem>
                  <SelectItem value="OVERDUE">Overdue</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={loadData} className="h-9 px-2.5 sm:px-3 shrink-0 border-[#CBD5E1] bg-white text-[#111827]">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <TabsContent value="ledger">
          <DataTable
            columns={feeColumns}
            data={filteredFees}
            total={filteredFees.length}
            page={1}
            pageSize={filteredFees.length || 10}
            loading={loading}
            hideToolbar
            rowKey={(f: any) => f.id || f._id}
            emptyTitle="No fee ledger entries found"
            emptyDescription="All student fee accounts are reconciled."
          />
        </TabsContent>

        <TabsContent value="verifications">
          <DataTable
            columns={verificationColumns}
            data={filteredVerifications}
            total={filteredVerifications.length}
            page={1}
            pageSize={filteredVerifications.length || 10}
            loading={loading}
            hideToolbar
            rowKey={(v: any) => v.id || v._id}
            emptyTitle="No pending payment verifications"
            emptyDescription="All student zero-gateway UTR submissions have been processed."
          />
        </TabsContent>

        <TabsContent value="history">
          <DataTable
            columns={paymentColumns}
            data={filteredPayments}
            total={filteredPayments.length}
            page={1}
            pageSize={filteredPayments.length || 10}
            loading={loading}
            hideToolbar
            rowKey={(p: any) => String(p.id || p.paymentNumber || Math.random())}
            emptyTitle="No payment records found"
            emptyDescription="No verified receipts issued yet."
          />
        </TabsContent>
      </Tabs>

      {/* RECORD CASH PAYMENT MODAL */}
      <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
        <DialogContent className="sm:max-w-md rounded-xl border border-slate-200 bg-white p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Banknote className="h-5 w-5 text-[#087A45]" /> Record Cash / Counter Payment
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleRecordPayment} className="space-y-4 text-xs pt-1">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-bold text-slate-950">Select Student *</label>
                <Select value={payForm.studentId} onValueChange={handleStudentSelect}>
                  <SelectTrigger className="font-bold text-xs bg-white border-slate-300">
                    <SelectValue placeholder="-- Choose Student --" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-300 max-h-56">
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="font-bold text-xs">
                        {s.fullName || s.name} ({s.customerCode || s.studentId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-950">Amount (₹) *</label>
                  <Input
                    type="number"
                    min={1}
                    value={payForm.amount}
                    onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                    placeholder="8000"
                    className="font-mono font-bold"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-950">Payment Mode</label>
                  <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}>
                    <SelectTrigger className="font-bold text-xs bg-white border-slate-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-300">
                      <SelectItem value="CASH">Cash (Counter)</SelectItem>
                      <SelectItem value="MANUAL">Manual / Other Offline</SelectItem>
                      <SelectItem value="BANK_TRANSFER">Direct Bank Transfer</SelectItem>
                      <SelectItem value="UPI">UPI / QR Code</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-950">Received By (Staff / Owner)</label>
                <Input
                  value={payForm.receivedBy}
                  onChange={(e) => setPayForm({ ...payForm, receivedBy: e.target.value })}
                  placeholder="Staff or Owner Name"
                  className="font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-950">Notes / Remarks</label>
                <Input
                  value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                  placeholder="e.g. Paid cash at hostel reception counter"
                  className="font-medium"
                />
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 pt-3">
              <Button type="button" variant="outline" onClick={() => setPayModalOpen(false)} className="font-bold">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="gap-2 font-black bg-[#E87545] hover:bg-[#D66434] text-white"
              >
                {submitting ? 'Recording...' : 'Confirm & Generate Receipt'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* PROOF SCREENSHOT PREVIEW MODAL */}
      <Dialog open={proofModalOpen} onOpenChange={setProofModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-xl border border-slate-200 bg-white p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900">
              Uploaded Payment Screenshot Proof
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-center">
            {proofPreviewUrl ? (
              <img
                src={proofPreviewUrl}
                alt="Payment proof screenshot"
                className="max-h-96 w-auto mx-auto rounded-lg border border-slate-300 object-contain shadow-sm"
              />
            ) : (
              <p className="text-xs text-slate-500 font-bold">No preview available.</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setProofModalOpen(false)} className="font-bold">
              Close Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REJECTION REASON MODAL */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="sm:max-w-md rounded-xl border border-slate-200 bg-white p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-rose-700 flex items-center gap-2">
              <X className="h-5 w-5 text-rose-600" /> Reject Payment Submission
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Provide a reason for rejecting this student's payment submission.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRejectSubmission} className="space-y-4 text-xs pt-1">
            <div className="space-y-1.5">
              <label className="font-bold text-slate-950">Rejection Reason *</label>
              <Input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. UTR number not found in bank statement"
                className="font-medium"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setRejectModalOpen(false)} className="font-bold">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={rejecting || !rejectReason.trim()}
                className="font-black bg-rose-600 hover:bg-rose-700 text-white"
              >
                {rejecting ? 'Rejecting...' : 'Reject Submission'}
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

export default function FeesPage() {
  return (
    <PageErrorBoundary fallbackTitle="Unable to load Fee Management">
      <FeesPageContent />
    </PageErrorBoundary>
  );
}
