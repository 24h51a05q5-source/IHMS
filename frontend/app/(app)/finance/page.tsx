'use client';

import { useCallback, useEffect, useState } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Plus, Receipt, Search, RefreshCw, Calendar, ArrowUpRight, BarChart3, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { financeApi } from '@/lib/api/finance.api';
import { getCachedData } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import type { Expense, Voucher, ProfitAndLoss, ApiError } from '@/lib/types';

function FinancePageContent() {
  const { hasRole, currentBranchId } = useAuth();

  const cachedExpenses = getCachedData<Expense[]>('/finance/expenses', { branchId: currentBranchId || undefined });
  const cachedVouchers = getCachedData<Voucher[]>('/finance/vouchers', { branchId: currentBranchId || undefined });
  const cachedPnl = getCachedData<ProfitAndLoss>('/finance/pnl', { branchId: currentBranchId || undefined });

  const [expenses, setExpenses] = useState<Expense[]>(() => cachedExpenses || []);
  const [vouchers, setVouchers] = useState<Voucher[]>(() => cachedVouchers || []);
  const [pnl, setPnl] = useState<ProfitAndLoss | null>(() => cachedPnl);
  const [loading, setLoading] = useState(() => !cachedExpenses?.length && !cachedPnl);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    category: 'ELECTRICITY',
    amount: '',
    paymentMethod: 'UPI',
    paidTo: '',
    description: '',
    invoiceOrBillNumber: '',
  });

  const loadData = useCallback(async () => {
    try {
      const [eList, vList, pData] = await Promise.all([
        financeApi.listExpenses({ branchId: currentBranchId || undefined }),
        financeApi.listVouchers({ branchId: currentBranchId || undefined }),
        financeApi.getProfitAndLoss({ branchId: currentBranchId || undefined }),
      ]);
      setExpenses(eList || []);
      setVouchers(vList || []);
      setPnl(pData);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to load finance records.');
    } finally {
      setLoading(false);
    }
  }, [currentBranchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.paidTo || !form.amount) {
      toast.error('Vendor / Payee and amount are required.');
      return;
    }
    setSubmitting(true);
    try {
      await financeApi.recordExpense({
        ...form,
        amount: Number(form.amount),
        branchId: currentBranchId || undefined,
      });
      toast.success('Expense recorded and journal entry posted!');
      setModalOpen(false);
      setForm({
        category: 'ELECTRICITY',
        amount: '',
        paymentMethod: 'UPI',
        paidTo: '',
        description: '',
        invoiceOrBillNumber: '',
      });
      loadData();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to record expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const totalRevenue = pnl?.summary?.totalIncome || 0;
  const totalExpenses = pnl?.summary?.totalExpenses || 0;
  const netProfit = pnl?.summary?.netProfitOrLoss || 0;
  const isProfitable = pnl?.summary?.isProfitable ?? netProfit >= 0;

  const filteredExpenses = expenses.filter((e) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const matchesSearch =
      (e.paidTo || '').toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q) ||
      (e.expenseNumber || '').toLowerCase().includes(q) ||
      (e.category || '').toLowerCase().includes(q) ||
      (e.paymentMethod || '').toLowerCase().includes(q) ||
      (e.invoiceOrBillNumber || '').toLowerCase().includes(q) ||
      String(e.amount || '').includes(q);
    const matchesCat = categoryFilter === 'ALL' || e.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const filteredVouchers = vouchers.filter((v) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (v.voucherNumber || '').toLowerCase().includes(q) ||
      (v.account || '').toLowerCase().includes(q) ||
      (v.narration || '').toLowerCase().includes(q) ||
      (v.voucherType || '').toLowerCase().includes(q) ||
      String(v.debit || '').includes(q) ||
      String(v.credit || '').includes(q)
    );
  });

  const expenseColumns: Column<any>[] = [
    {
      key: 'number',
      header: 'Expense #',
      cell: (e) => (
        <div>
          <p className="font-mono text-xs font-semibold text-foreground">{e.expenseNumber}</p>
          <p className="text-xs text-muted-foreground">{new Date(e.date).toLocaleDateString('en-IN')}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      cell: (e) => <Badge variant="info">{e.category.replace('_', ' ')}</Badge>,
    },
    {
      key: 'paidTo',
      header: 'Vendor / Paid To',
      cell: (e) => (
        <div>
          <p className="font-medium text-foreground">{e.paidTo}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{e.description || '—'}</p>
        </div>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      cell: (e) => <span className="text-xs font-medium">{e.paymentMethod}</span>,
      hideOnMobile: true,
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: (e) => <span className="font-mono text-xs font-bold text-rose-600">₹{e.amount.toLocaleString('en-IN')}</span>,
    },
  ];

  const voucherColumns: Column<any>[] = [
    {
      key: 'voucher',
      header: 'Voucher #',
      cell: (v) => <span className="font-mono text-xs font-semibold">{v.voucherNumber}</span>,
    },
    {
      key: 'account',
      header: 'Ledger Account',
      cell: (v) => <Badge variant="default">{v.account}</Badge>,
    },
    {
      key: 'narration',
      header: 'Narration',
      cell: (v) => <span className="text-xs text-muted-foreground truncate max-w-[260px]">{v.narration}</span>,
    },
    {
      key: 'debit',
      header: 'Debit (₹)',
      cell: (v) => (
        <span className={`font-mono text-xs font-semibold ${v.debit > 0 ? 'text-rose-600' : 'text-muted-foreground'}`}>
          {v.debit > 0 ? `₹${v.debit.toLocaleString('en-IN')}` : '—'}
        </span>
      ),
    },
    {
      key: 'credit',
      header: 'Credit (₹)',
      cell: (v) => (
        <span className={`font-mono text-xs font-semibold ${v.credit > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
          {v.credit > 0 ? `₹${v.credit.toLocaleString('en-IN')}` : '—'}
        </span>
      ),
    },
  ];

  const renderMobileExpenseCard = (e: any) => (
    <div className="w-full rounded-xl border border-[#CBD5E1] bg-white p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2 border-b border-[#E4E0D7] pb-2">
        <div>
          <p className="font-bold text-[#111827] text-sm truncate">{e.paidTo}</p>
          <p className="font-mono text-xs font-bold text-[#64748B]">{e.expenseNumber} • {new Date(e.date).toLocaleDateString('en-IN')}</p>
        </div>
        <span className="font-mono text-sm font-black text-rose-600">₹{e.amount.toLocaleString('en-IN')}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Category</span>
          <div className="pt-0.5"><Badge variant="info">{e.category.replace('_', ' ')}</Badge></div>
        </div>
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Method</span>
          <p className="font-bold text-[#111827] pt-0.5">{e.paymentMethod}</p>
        </div>
        {e.description && (
          <div className="col-span-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Description</span>
            <p className="text-[#64748B] text-xs mt-0.5">{e.description}</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderMobileVoucherCard = (v: any) => (
    <div className="w-full rounded-xl border border-[#CBD5E1] bg-white p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2 border-b border-[#E4E0D7] pb-2">
        <div>
          <p className="font-mono text-xs font-bold text-[#111827]">{v.voucherNumber}</p>
          <p className="text-[11px] text-[#64748B]">{v.narration || 'Journal Entry'}</p>
        </div>
        <Badge variant="default">{v.account}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Debit</span>
          <p className={`font-mono font-bold ${v.debit > 0 ? 'text-rose-600' : 'text-[#64748B]'}`}>
            {v.debit > 0 ? `₹${v.debit.toLocaleString('en-IN')}` : '—'}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Credit</span>
          <p className={`font-mono font-bold ${v.credit > 0 ? 'text-emerald-600' : 'text-[#64748B]'}`}>
            {v.credit > 0 ? `₹${v.credit.toLocaleString('en-IN')}` : '—'}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance & General Ledger"
        description="Track organization income, operating expenses, double-entry vouchers, and Profit & Loss"
        action={
          hasRole('ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'ACCOUNTANT') && (
            <Button onClick={() => setModalOpen(true)} className="gap-2 font-bold bg-[#E87545] hover:bg-[#D66434] text-white">
              <Plus className="h-4 w-4" />
              Record Expense
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <StatCard title="Total Revenue" value={`₹${totalRevenue.toLocaleString('en-IN')}`} icon={TrendingUp} accent="success" />
        <StatCard title="Total Expenses" value={`₹${totalExpenses.toLocaleString('en-IN')}`} icon={TrendingDown} accent="error" />
        <StatCard
          title="Net Profit / Loss"
          value={`₹${netProfit.toLocaleString('en-IN')}`}
          icon={ArrowUpRight}
          accent={isProfitable ? 'success' : 'error'}
          hint={isProfitable ? 'Net Surplus' : 'Net Deficit'}
        />
        <StatCard title="Posted Vouchers" value={vouchers.length} icon={Receipt} />
      </div>

      <Tabs defaultValue="expenses" className="space-y-4">
        <TabsList className="bg-[#ECE9E1] border border-[#DDD8CC]">
          <TabsTrigger value="expenses" className="gap-2">
            <Receipt className="h-4 w-4" /> Expenses ({expenses.length})
          </TabsTrigger>
          <TabsTrigger value="vouchers" className="gap-2">
            <BarChart3 className="h-4 w-4" /> Double-Entry Vouchers ({vouchers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="space-y-4">
          <DataTable
            columns={expenseColumns}
            data={filteredExpenses}
            total={filteredExpenses.length}
            page={1}
            pageSize={filteredExpenses.length || 10}
            loading={loading}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search transactions..."
            mobileRender={renderMobileExpenseCard}
            filters={
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40 h-10 bg-white border-[1.5px] border-[#CBD5E1] text-[#111827]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent className="bg-white border-[1.5px] border-[#CBD5E1]">
                  <SelectItem value="ALL">All Categories</SelectItem>
                  <SelectItem value="ELECTRICITY">Electricity</SelectItem>
                  <SelectItem value="FOOD_PROVISIONS">Food Provisions</SelectItem>
                  <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                  <SelectItem value="SALARY">Staff Salary</SelectItem>
                  <SelectItem value="INTERNET">Internet & WiFi</SelectItem>
                  <SelectItem value="WATER">Water Supply</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            }
            toolbarRight={
              <Button variant="outline" size="sm" onClick={loadData} className="h-10 px-3.5 border-[#CBD5E1] bg-white text-[#111827] hover:bg-[#F8FAFC]" aria-label="Refresh finance records">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            }
            rowKey={(e: any) => e.id || e.expenseNumber || Math.random().toString()}
            emptyTitle="No expenses recorded yet"
            emptyDescription="Click 'Record Expense' to post your first transaction."
          />
        </TabsContent>

        <TabsContent value="vouchers" className="space-y-4">
          <DataTable
            columns={voucherColumns}
            data={filteredVouchers}
            total={filteredVouchers.length}
            page={1}
            pageSize={filteredVouchers.length || 10}
            loading={loading}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search transactions..."
            mobileRender={renderMobileVoucherCard}
            toolbarRight={
              <Button variant="outline" size="sm" onClick={loadData} className="h-10 px-3.5 border-[#CBD5E1] bg-white text-[#111827] hover:bg-[#F8FAFC]" aria-label="Refresh vouchers">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            }
            rowKey={(v: any) => v.id || v.voucherNumber || Math.random().toString()}
            emptyTitle="No ledger vouchers generated yet"
            emptyDescription="Vouchers are posted automatically upon financial transactions."
          />
        </TabsContent>
      </Tabs>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <form onSubmit={handleRecordExpense}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                Record Operating Expense
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Expense Category</label>
                  <Select
                    value={form.category}
                    onValueChange={(val) => setForm({ ...form, category: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ELECTRICITY">Electricity Bill</SelectItem>
                      <SelectItem value="FOOD_PROVISIONS">Mess Provisions</SelectItem>
                      <SelectItem value="MAINTENANCE">Repairs & Maintenance</SelectItem>
                      <SelectItem value="SALARY">Staff Salary</SelectItem>
                      <SelectItem value="INTERNET">Internet & Cable</SelectItem>
                      <SelectItem value="WATER">Water Supply</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Amount (₹) *</label>
                  <Input
                    type="number"
                    placeholder="e.g. 4500"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Paid To (Vendor / Contractor) *</label>
                <Input
                  placeholder="e.g. TSSPDCL Electricity Board"
                  value={form.paidTo}
                  onChange={(e) => setForm({ ...form, paidTo: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Payment Method</label>
                  <Select
                    value={form.paymentMethod}
                    onValueChange={(val) => setForm({ ...form, paymentMethod: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UPI">UPI Transfer</SelectItem>
                      <SelectItem value="BANK_TRANSFER">Net Banking</SelectItem>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="CARD">Credit / Debit Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Bill / Invoice #</label>
                  <Input
                    placeholder="e.g. INV-9821"
                    value={form.invoiceOrBillNumber}
                    onChange={(e) => setForm({ ...form, invoiceOrBillNumber: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Description / Notes</label>
                <Input
                  placeholder="e.g. Monthly transformer maintenance & power bill"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Recording...' : 'Post Expense'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function FinancePage() {
  return (
    <PageErrorBoundary fallbackTitle="Unable to load Finance Ledger">
      <FinancePageContent />
    </PageErrorBoundary>
  );
}
