'use client';

import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Receipt, Download, Eye } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/page-header';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState, EmptyState } from '@/components/dashboard/states';
import { Badge, Money } from '@/components/dashboard/confirm-dialog';
import { Button } from '@/components/ui/button';
import { paymentsApi } from '@/lib/api/payments.api';
import { useAuth } from '@/lib/auth/auth-context';
import type { Payment, ApiError } from '@/lib/types';

import { SearchInput } from '@/components/ui/search-input';

export default function StudentPaymentsPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!user?.studentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await paymentsApi.getByStudent(user.studentId);
      setPayments(res);
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load payments.');
    } finally {
      setLoading(false);
    }
  }, [user?.studentId]);

  useEffect(() => { load(); }, [load]);

  const statusVariant: Record<Payment['status'], 'success' | 'warning' | 'error' | 'outline'> = {
    CREATED: 'warning',
    PENDING: 'warning',
    PROCESSING: 'warning',
    SUCCESS: 'success',
    FAILED: 'error',
    CANCELLED: 'error',
    REFUNDED: 'outline',
    REVERSED: 'error',
  };

  const handleDownloadPdf = (paymentId: string) => {
    const token = localStorage.getItem('accessToken');
    const url = `/api/fees/payments/${paymentId}/receipt/pdf`;
    window.open(url, '_blank');
  };

  const filteredPayments = payments.filter((p) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (p.receiptNo || p.receiptNumber || p.paymentNumber || '').toLowerCase().includes(q) ||
      (p.method || '').toLowerCase().includes(q) ||
      (p.status || '').toLowerCase().includes(q) ||
      (p.transactionRef || '').toLowerCase().includes(q) ||
      String(p.amount || '').includes(q) ||
      (p.date ? new Date(p.date).toLocaleDateString('en-IN') : '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Payment History"
        description="All your authenticated hostel fee payment transactions and receipts"
      />

      {payments.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-[#F8FAFC] p-2.5 sm:p-3 rounded-xl border border-[#CBD5E1]">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search payments by receipt #, method, amount..."
            className="h-9 sm:h-10 text-xs sm:text-sm font-semibold"
            containerClassName="w-full sm:w-80"
          />
          <div className="text-xs font-bold text-[#64748B]">
            {search.trim() ? `Showing ${filteredPayments.length} matching transactions` : `${payments.length} total receipts`}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5">{Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} className="h-16 sm:h-18 rounded-xl" />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !filteredPayments.length ? (
        <EmptyState
          icon={<CreditCard className="h-6 w-6 text-[#E87545]" />}
          title={search ? 'No matching payments found' : 'No payments yet'}
          description={search ? `No payment receipts match "${search}". Try searching for another keyword.` : 'Your authenticated payment history will appear here once processed.'}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#CBD5E1] bg-white">
          <ul className="divide-y divide-[#CBD5E1]">
            {filteredPayments.map((p) => (
              <li key={p.id} className="flex flex-col gap-2.5 p-3.5 sm:p-4.5 sm:flex-row sm:items-center sm:justify-between hover:bg-[#F8FAFC] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-[#FFF3EB] text-[#E87545] border border-[#FDE6D6]">
                    <Receipt className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <div>
                    <p className="text-base font-black font-mono text-black"><Money value={p.amount} /></p>
                    <p className="text-xs font-bold text-slate-500 mt-0.5">
                      {new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {p.method}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {p.receiptNo && (
                    <span className="font-mono text-xs font-black text-black bg-[#FAFAF7] border border-[#E4E0D7] px-2.5 py-1 rounded-lg">
                      {p.receiptNo}
                    </span>
                  )}
                  <Badge variant={statusVariant[p.status]}>{p.status}</Badge>

                  {p.status === 'SUCCESS' && (
                    <div className="flex items-center gap-2">
                      <Link href={`/student/payments/${p.id}/receipt`}>
                        <Button variant="outline" size="sm" className="gap-1 text-xs">
                          <Eye className="h-3.5 w-3.5 text-[#E87545]" /> View
                        </Button>
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDownloadPdf(p.id)}
                        className="gap-1 text-xs font-bold"
                      >
                        <Download className="h-3.5 w-3.5 text-[#2563EB]" /> PDF
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
