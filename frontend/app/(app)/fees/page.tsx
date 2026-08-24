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
  ArrowDownToLine,
  Building2,
  Calendar,
  User,
  CreditCard,
  FileText,
  Banknote,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import { PaymentReceiptModal } from '@/components/dashboard/payment-receipt-modal';
import { feesApi } from '@/lib/api/fees.api';
import { paymentsApi } from '@/lib/api/payments.api';
import { studentsApi } from '@/lib/api/students.api';
import { getCachedData } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import type { ApiError, Payment, PaymentReceipt, Fee } from '@/lib/types';

function FeesPageContent() {
  const { user, hasRole } = useAuth();

  const cachedFees = getCachedData<{ items: any[] }>('/fees', { pageSize: 150 });
  const cachedPayments = getCachedData<{ items: Payment[] }>('/payments', { pageSize: 150 });
  const cachedStudents = getCachedData<{ items: any[] }>('/students', { pageSize: 150 });

  const [fees, setFees] = useState<any[]>(() => cachedFees?.items || []);
  const [payments, setPayments] = useState<Payment[]>(() => cachedPayments?.items || []);
  const [students, setStudents] = useState<any[]>(() => cachedStudents?.items || []);
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
      const [fRes, pRes, sRes] = await Promise.all([
        feesApi.list({ pageSize: 150 }),
        paymentsApi.list({ pageSize: 150 }),
        studentsApi.list({ pageSize: 150 }),
      ]);
      setFees(fRes?.items || []);
      setPayments(pRes?.items || []);
      setStudents(sRes?.items || []);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to load fee ledger.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Selected student metadata for auto-populating
  const selectedStudentObj = students.find((s) => s.id === payForm.studentId);
  const selectedFeeObj = fees.find((f) => f.studentId === payForm.studentId);

  const handleStudentSelect = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
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

      // Open Receipt Modal immediately with full data
      if (res.receipt || res.payment) {
        setActiveReceipt(res.receipt || null);
        setActivePayment(res.payment || null);
        setReceiptModalOpen(true);
      }

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

      loadData();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const openReceiptForPayment = (payment: Payment) => {
    setActivePayment(payment);
    setActiveReceipt(null);
    setReceiptModalOpen(true);
  };

  const handleDownloadPdf = async (paymentId: string, receiptNum?: string) => {
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
      toast.info('Opened receipt in new window.');
    }
  };

  const totalDemanded = fees.reduce((acc, f) => acc + (f.total || 0), 0);
  const totalCollected = fees.reduce((acc, f) => acc + (f.paid || 0), 0);
  const totalOutstanding = fees.reduce((acc, f) => acc + (f.outstanding || 0), 0);
  const overdueCount = fees.filter((f) => f.status === 'OVERDUE' || f.outstanding > 0).length;

  const filteredFees = fees.filter((f) => {
    const q = search.toLowerCase().trim();
    const matchesSearch = !q || (
      (f.studentName || '').toLowerCase().includes(q) ||
      (f.customerCode || '').toLowerCase().includes(q) ||
      (f.studentId || '').toLowerCase().includes(q) ||
      (f.roomNumber || '').toLowerCase().includes(q) ||
      (f.bedNumber || '').toLowerCase().includes(q) ||
      (f.hostelName || '').toLowerCase().includes(q)
    );
    const matchesStatus = statusFilter === 'ALL' || f.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredPayments = payments.filter((p) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (p.studentName || '').toLowerCase().includes(q) ||
      (p.customerCode || '').toLowerCase().includes(q) ||
      (p.studentId || '').toLowerCase().includes(q) ||
      (p.receiptNo || p.receiptNumber || p.paymentNumber || '').toLowerCase().includes(q) ||
      (p.transactionRef || '').toLowerCase().includes(q) ||
      (p.method || '').toLowerCase().includes(q) ||
      (p.notes || '').toLowerCase().includes(q)
    );
  });

  const feeColumns: Column<any>[] = [
    {
      key: 'student',
      header: 'Student / Resident',
      cell: (f) => (
        <div>
          <p className="font-extrabold text-slate-950 text-sm">{f.studentName || 'Student'}</p>
          <p className="text-xs font-mono font-bold text-[#E87545]">{f.customerCode || f.studentId}</p>
        </div>
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
            {new Date(p.paidAt || p.date).toLocaleDateString('en-IN', {
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
            {p.roomNumber ? ` · Room ${p.roomNumber}` : ''}
            {p.bedNumber ? ` · Bed ${p.bedNumber}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'feeType',
      header: 'Fee Type',
      cell: (p) => (
        <span className="text-xs font-bold text-slate-800">
          {p.feeType || p.installmentMonth || 'Hostel Rent'}
        </span>
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
          {p.method || 'CASH'}
        </span>
      ),
    },
    {
      key: 'receivedBy',
      header: 'Received By',
      cell: (p) => <span className="text-xs font-bold text-slate-700">{p.receivedBy || 'Staff'}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (p) => (
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5 font-bold text-slate-800 hover:text-black gap-1"
            onClick={() => openReceiptForPayment(p)}
          >
            <Receipt className="h-3.5 w-3.5 text-primary" /> View Receipt
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-slate-700 hover:text-black"
            onClick={() => handleDownloadPdf(p.id, p.receiptNo || p.receiptNumber || p.paymentNumber)}
            title="Download PDF Receipt"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const renderMobileFeeCard = (f: any) => {
    return (
      <div className="w-full rounded-xl border border-[#CBD5E1] bg-white p-3.5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-[#E4E0D7] pb-2">
          <div className="min-w-0">
            <p className="font-bold text-[#111827] text-sm truncate">{f.studentName || 'Student'}</p>
            <p className="font-mono text-xs font-bold text-[#E87545]">{f.customerCode || f.studentId}</p>
          </div>
          <Badge variant={f.status === 'PAID' ? 'success' : f.status === 'OVERDUE' ? 'error' : 'warning'} className="font-bold text-[11px] shrink-0">
            {f.status || 'PENDING'}
          </Badge>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Total Demanded</span>
            <p className="font-bold text-[#111827] font-mono">₹{(f.total || 0).toLocaleString('en-IN')}</p>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Collected</span>
            <p className="font-bold text-emerald-700 font-mono">₹{(f.paid || 0).toLocaleString('en-IN')}</p>
          </div>
          <div className="col-span-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Outstanding Balance</span>
            <p className={`font-bold font-mono text-sm ${(f.outstanding || 0) > 0 ? 'text-[#C62828]' : 'text-slate-500'}`}>
              ₹{(f.outstanding || 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-end border-t border-[#E4E0D7] pt-2.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 font-bold border-[#CBD5E1] text-[#111827] hover:bg-[#F3F1EC]"
            onClick={() => {
              handleStudentSelect(f.studentId);
              setPayModalOpen(true);
            }}
          >
            <Banknote className="h-3.5 w-3.5 text-[#087A45]" />
            Record Cash
          </Button>
        </div>
      </div>
    );
  };

  const renderMobilePaymentCard = (p: Payment) => {
    return (
      <div className="w-full rounded-xl border border-[#CBD5E1] bg-white p-3.5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-[#E4E0D7] pb-2">
          <div className="min-w-0">
            <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-slate-100 text-[#111827] border border-[#CBD5E1]">
              {p.receiptNo || p.receiptNumber || p.paymentNumber || 'REC-OFFLINE'}
            </span>
            <p className="font-bold text-[#111827] text-sm mt-1 truncate">{p.studentName || 'Student'}</p>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black uppercase bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7] shrink-0">
            {p.method || 'CASH'}
          </span>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Student ID & Room</span>
            <p className="font-bold text-[#111827] truncate">
              {p.customerCode || p.studentId}{p.roomNumber ? ` • Room ${p.roomNumber}` : ''}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Payment Date</span>
            <p className="font-bold text-[#111827]">
              {new Date(p.paidAt || p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Fee Type</span>
            <p className="font-bold text-[#111827]">{p.feeType || p.installmentMonth || 'Hostel Rent'}</p>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Amount Paid</span>
            <p className="font-mono text-sm font-black text-emerald-700">₹{(p.amount || 0).toLocaleString('en-IN')}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-[#E4E0D7] pt-2.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs px-2.5 font-bold border-[#CBD5E1] text-[#111827] hover:bg-[#F3F1EC] gap-1"
            onClick={() => openReceiptForPayment(p)}
          >
            <Receipt className="h-3.5 w-3.5 text-[#E87545]" /> View Receipt
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-slate-700 hover:text-black"
            onClick={() => handleDownloadPdf(p.id, p.receiptNo || p.receiptNumber || p.paymentNumber)}
            title="Download PDF Receipt"
          >
            <ArrowDownToLine className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5.5 w-full pb-8">
      <PageHeader
        title="Fees & Cash Payment Engine"
        description="Record cash collections at hostel counter, generate official printable receipts, and track student ledgers."
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
              className="gap-2 font-black bg-[#E87545] hover:bg-[#D66434] text-white"
            >
              <Banknote className="h-4 w-4" />
              Record Cash Payment
            </Button>
          )
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <StatCard title="Total Demanded" value={`₹${totalDemanded.toLocaleString('en-IN')}`} icon={DollarSign} />
        <StatCard title="Total Collected" value={`₹${totalCollected.toLocaleString('en-IN')}`} icon={CheckCircle2} />
        <StatCard title="Outstanding Balance" value={`₹${totalOutstanding.toLocaleString('en-IN')}`} icon={AlertCircle} />
        <StatCard title="Pending Defaulters" value={overdueCount} icon={Clock} />
      </div>

      {/* Main Tabs: Ledger vs Payment Receipts */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3.5 sm:space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-3 bg-[#F8FAFC] p-2.5 sm:p-3 rounded-xl border border-[#CBD5E1]">
          <TabsList className="bg-white border border-[#CBD5E1] p-1 rounded-lg">
            <TabsTrigger value="ledger" className="gap-2">
              <DollarSign className="h-4 w-4" /> Fee Ledger Accounts
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <Receipt className="h-4 w-4" /> Payment Receipts ({payments.length})
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <SearchInput
              placeholder="Search by student name, ID, receipt..."
              value={search}
              onChange={setSearch}
              className="h-9 font-bold"
              containerClassName="w-full sm:w-64"
            />
            {activeTab === 'ledger' && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 h-9 font-bold text-xs bg-white border-[1.5px] border-[#CBD5E1] text-[#111827]">
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
            <Button variant="outline" size="sm" onClick={loadData} className="h-9 px-3 border-[#CBD5E1] bg-white text-[#111827]">
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
            mobileRender={renderMobileFeeCard}
            rowKey={(f: any) => f.id || f._id}
            emptyTitle="No fee ledger entries found"
            emptyDescription="All student fee accounts are reconciled."
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
            mobileRender={renderMobilePaymentCard}
            rowKey={(p: Payment) => p.id}
            emptyTitle="No payment records found"
            emptyDescription="Recorded payments and receipts will appear here."
          />
        </TabsContent>
      </Tabs>

      {/* RECORD CASH PAYMENT DIALOG */}
      <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
        <DialogContent className="sm:max-w-[540px] w-[calc(100vw-32px)] max-h-[90vh] overflow-y-auto bg-white border border-[#CBD5E1] rounded-xl scrollbar-thin">
          <form onSubmit={handleRecordPayment}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-black text-slate-950 text-lg">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-[#087A45] border border-emerald-200">
                  <Banknote className="h-4 w-4" />
                </span>
                Record Cash Fee Payment
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-3.5 py-4 text-xs">
              {/* Student Selector */}
              <div className="space-y-1">
                <label className="font-bold text-slate-950">Select Student / Resident *</label>
                <Select
                  value={payForm.studentId}
                  onValueChange={handleStudentSelect}
                >
                  <SelectTrigger className="font-bold text-slate-900">
                    <SelectValue placeholder="Choose student" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="font-bold">
                        {s.name || s.fullName} ({s.customerCode || s.studentId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Student Auto-Filled Context Card */}
              {selectedStudentObj && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-600">Hostel & Room:</span>
                    <span className="font-extrabold text-slate-900">
                      {selectedStudentObj.branchName || 'Hostel Branch'} • Room {selectedStudentObj.roomNumber || selectedStudentObj.roomCode || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-600">Outstanding Balance:</span>
                    <span className="font-mono font-black text-amber-700 text-sm">
                      ₹{(selectedFeeObj?.outstanding || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              )}

              {/* Fee Type & Payment Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-950">Fee Category *</label>
                  <Select
                    value={payForm.feeType}
                    onValueChange={(val) => setPayForm({ ...payForm, feeType: val })}
                  >
                    <SelectTrigger className="font-bold text-slate-900">
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
                  <label className="font-bold text-slate-950">Amount Paid (₹) *</label>
                  <Input
                    type="number"
                    placeholder="e.g. 8000"
                    value={payForm.amount}
                    onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                    className="font-mono font-bold text-slate-950"
                    required
                  />
                </div>
              </div>

              {/* Payment Date & Payment Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-950">Payment Date</label>
                  <Input
                    type="date"
                    value={payForm.paymentDate}
                    onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
                    className="font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-950">Payment Mode</label>
                  <Select
                    value={payForm.method}
                    onValueChange={(val) => setPayForm({ ...payForm, method: val })}
                  >
                    <SelectTrigger className="font-bold text-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash (Counter)</SelectItem>
                      <SelectItem value="MANUAL">Manual / Other Offline</SelectItem>
                      <SelectItem value="BANK_TRANSFER">Direct Bank Transfer</SelectItem>
                      <SelectItem value="UPI">UPI / QR Code</SelectItem>
                      <SelectItem value="CARD">Debit / Credit Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Received By */}
              <div className="space-y-1">
                <label className="font-bold text-slate-950">Received By (Staff / Owner)</label>
                <Input
                  value={payForm.receivedBy}
                  onChange={(e) => setPayForm({ ...payForm, receivedBy: e.target.value })}
                  placeholder="Staff or Owner Name"
                  className="font-bold"
                />
              </div>

              {/* Notes / Description */}
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

