'use client';

import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Loader2, Download, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { Badge, Money } from '@/components/dashboard/confirm-dialog';
import { feesApi } from '@/lib/api/fees.api';
import { paymentsApi } from '@/lib/api/payments.api';
import { useAuth } from '@/lib/auth/auth-context';
import type { Fee, Payment, PaymentReceipt, ApiError } from '@/lib/types';

export default function StudentFeesPage() {
  const { user } = useAuth();
  const [fee, setFee] = useState<Fee | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [method, setMethod] = useState<Payment['method']>('UPI');
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);

  const load = useCallback(async () => {
    if (!user?.studentId) return;
    setLoading(true);
    setError(null);
    try {
      const [f, p] = await Promise.all([
        feesApi.getByStudent(user.studentId),
        paymentsApi.getByStudent(user.studentId),
      ]);
      setFee(f);
      setPayments(p);
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load fee details.');
    } finally {
      setLoading(false);
    }
  }, [user?.studentId]);

  useEffect(() => { load(); }, [load]);

  const payNow = async () => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount.');
      return;
    }
    if (!user?.studentId) return;
    setPaying(true);
    setReceipt(null);
    try {
      const init = await paymentsApi.create({ studentId: user.studentId, feeId: fee?.id, amount, method });
      // Backend may confirm immediately or return a gateway order for the client to process.
      if (init.status === 'SUCCESS' && init.receipt) {
        setReceipt(init.receipt);
        toast.success('Payment successful!');
      } else {
        // Gateway integration point: Antigravity will inject the gateway SDK call here.
        const confirmed = await paymentsApi.confirm(init.paymentId, init.gatewayOrder);
        setReceipt(confirmed.receipt);
        toast.success('Payment successful!');
      }
      setPayAmount('');
      load();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Payment failed. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <div className="space-y-4"><CardSkeleton className="h-48" /><CardSkeleton className="h-64" /></div>;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <PageHeader title="My Fees" description="View your fee details and make payments securely" />

      {/* Pay fee card */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <FeeBox label="Total" value={fee?.total} />
              <FeeBox label="Paid" value={fee?.paid} tone="success" />
              <FeeBox label="Outstanding" value={fee?.outstanding} tone={fee?.outstanding ? 'error' : 'success'} />
            </div>
            {fee?.dueDate && (
              <p className="text-sm text-muted-foreground">
                Next due date: <span className="font-medium text-foreground">{new Date(fee.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </p>
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <h3 className="text-sm font-semibold">Pay towards your fee</h3>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Amount (₹)</label>
              <input
                type="number"
                min={1}
                placeholder={fee?.outstanding ? String(fee.outstanding) : '0'}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Payment method</label>
              <Select value={method} onValueChange={(v) => setMethod(v as Payment['method'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="CARD">Card</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="CASH">Cash (at office)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={payNow} disabled={paying || !fee?.outstanding} className="w-full">
              {paying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
              Pay Now
            </Button>
            {!fee?.outstanding && <p className="text-center text-xs text-emerald-600">You have no outstanding dues.</p>}
          </div>
        </div>
      </div>

      {/* Receipt */}
      {receipt && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900 dark:bg-emerald-950/20">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Payment successful</p>
            <p className="text-sm text-muted-foreground">Receipt No: {receipt.receiptNo} · Amount: <Money value={receipt.amount} /></p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/payments/${receipt.paymentId}/receipt.pdf`} download><Download className="mr-1.5 h-4 w-4" /> Download</a>
          </Button>
        </div>
      )}

      {/* Payment history */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">Payment History</h3>
        {payments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex flex-col gap-2 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium"><Money value={p.amount} /></p>
                  <p className="text-xs text-muted-foreground">{new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {p.method}</p>
                </div>
                <div className="flex items-center gap-2">
                  {p.receiptNo && <span className="font-mono text-xs text-muted-foreground">{p.receiptNo}</span>}
                  <Badge variant={p.status === 'SUCCESS' ? 'success' : p.status === 'PENDING' ? 'warning' : 'error'}>{p.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FeeBox({ label, value, tone = 'neutral' }: { label: string; value?: number; tone?: 'neutral' | 'success' | 'error' }) {
  const tones = { neutral: '', success: 'text-emerald-600 dark:text-emerald-400', error: 'text-rose-600 dark:text-rose-400' };
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tones[tone]}`}><Money value={value || 0} /></p>
    </div>
  );
}
