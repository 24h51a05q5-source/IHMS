'use client';

import { useCallback, useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState, EmptyState } from '@/components/dashboard/states';
import { Badge, Money } from '@/components/dashboard/confirm-dialog';
import { paymentsApi } from '@/lib/api/payments.api';
import { useAuth } from '@/lib/auth/auth-context';
import type { Payment, ApiError } from '@/lib/types';

export default function StudentPaymentsPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const statusVariant: Record<Payment['status'], 'success' | 'warning' | 'error' | 'info'> = {
    SUCCESS: 'success', PENDING: 'warning', FAILED: 'error', REFUNDED: 'info',
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Payment History" description="All your hostel fee payments" />
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} className="h-16" />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !payments.length ? (
        <EmptyState icon={<CreditCard className="h-6 w-6" />} title="No payments yet" description="Your payment history will appear here." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <ul className="divide-y divide-border">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10"><CreditCard className="h-4 w-4 text-primary" /></div>
                  <div>
                    <p className="text-sm font-medium"><Money value={p.amount} /></p>
                    <p className="text-xs text-muted-foreground">{new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {p.method}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.receiptNo && <span className="font-mono text-xs text-muted-foreground">{p.receiptNo}</span>}
                  <Badge variant={statusVariant[p.status]}>{p.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
