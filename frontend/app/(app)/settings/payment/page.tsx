'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Lock, Key, Copy, Check, Eye, EyeOff, Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { feesApi } from '@/lib/api/fees.api';

export default function PaymentGatewaySettingsPage() {
  const [provider, setProvider] = useState<'RAZORPAY' | 'CASHFREE' | 'PHONEPE'>('RAZORPAY');
  const [mode, setMode] = useState<'TEST' | 'LIVE'>('TEST');
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/fees/payments/webhook`
    : '/api/fees/payments/webhook';

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await feesApi.getPaymentSettings();
      if (data) {
        setProvider((data.provider || 'RAZORPAY') as any);
        setMode((data.environment || 'TEST') as any);
        setKeyId(data.keyId || '');
        setKeySecret(data.maskedSecret || '');
        setWebhookSecret(data.webhookSecret || '');
        setMerchantId(data.merchantId || '');
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('Webhook URL copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await feesApi.updatePaymentSettings({
        provider,
        environment: mode,
        keyId,
        keySecret: keySecret.includes('***') ? undefined : keySecret,
        webhookSecret: webhookSecret.includes('***') ? undefined : webhookSecret,
        merchantId,
      });
      toast.success('Payment gateway configuration saved securely in PostgreSQL.');
      await loadSettings();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save payment configuration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 max-w-4xl mx-auto">
      <PageHeader
        title="Payment Gateway Settings"
        description="Configure your Razorpay or UPI payment credentials to accept hostel fee payments directly"
        actions={
          <Badge variant={mode === 'LIVE' ? 'success' : 'warning'} className="px-3 py-1 text-xs">
            {mode === 'LIVE' ? '🟢 LIVE PRODUCTION' : '🟡 TEST / SANDBOX MODE'}
          </Badge>
        }
      />

      {/* Security Banner */}
      <div className="rounded-xl border border-[#CBD5E1] bg-white p-3.5 sm:p-5 flex items-start gap-3.5">
        <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg bg-[#FFF3EB] text-[#E87545] border border-[#FDE6D6]">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="space-y-0.5 sm:space-y-1 text-xs">
          <h3 className="font-black text-black text-sm">Direct Owner Settlement Guarantee</h3>
          <p className="text-slate-600 font-semibold leading-relaxed">
            All student fee payments are cryptographically verified by the IHMS backend and settled directly into the owner’s linked merchant account. IHMS never holds student funds in escrow.
          </p>
        </div>
      </div>

      {/* Gateway Configuration Form */}
      <form onSubmit={handleSave} className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 lg:p-7 space-y-4 sm:space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-[#CBD5E1] pb-3 sm:pb-4">
          <div>
            <h3 className="text-base font-black text-black">Payment Provider & Environment</h3>
            <p className="text-xs font-semibold text-slate-500">Select your active gateway and environment mode</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('TEST')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                mode === 'TEST'
                  ? 'bg-[#FEF3C7] text-[#C94F18] border border-[#FDE68A]'
                  : 'bg-white text-slate-600 border border-[#CBD5E1] hover:bg-[#FAFAF7]'
              }`}
            >
              Test Mode
            </button>
            <button
              type="button"
              onClick={() => setMode('LIVE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                mode === 'LIVE'
                  ? 'bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]'
                  : 'bg-white text-slate-600 border border-[#CBD5E1] hover:bg-[#FAFAF7]'
              }`}
            >
              Live Production
            </button>
          </div>
        </div>

        {/* Provider Selector */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-slate-700">Supported Gateway Provider</Label>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {[
              { id: 'RAZORPAY', label: 'Razorpay', badge: 'Active' },
              { id: 'CASHFREE', label: 'Cashfree', badge: 'Available' },
              { id: 'PHONEPE', label: 'PhonePe PG', badge: 'Available' },
            ].map((p) => (
              <div
                key={p.id}
                onClick={() => setProvider(p.id as any)}
                className={`cursor-pointer rounded-xl border p-3 sm:p-4 text-center transition-all ${
                  provider === p.id
                    ? 'border-[#E87545] bg-[#FFF3EB]'
                    : 'border-[#CBD5E1] bg-white hover:border-[#E87545]'
                }`}
              >
                <p className="font-black text-sm text-black">{p.label}</p>
                <span className="inline-block mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#E87545]">
                  {p.badge}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Credentials Grid */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="keyId" className="text-xs font-bold text-black">
              Key ID (Client API Key) *
            </Label>
            <div className="relative">
              <Key className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="keyId"
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                className="pl-10 font-mono text-xs font-bold"
                required
              />
            </div>
            <p className="text-[11px] text-slate-500 font-semibold">Public identifier used for client checkout initialization</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="keySecret" className="text-xs font-bold text-black">
              Key Secret (HMAC Signature Secret) *
            </Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="keySecret"
                type={showSecret ? 'text' : 'password'}
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
                className="pl-10 pr-10 font-mono text-xs font-bold"
                required
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black"
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 font-semibold">Stored in private backend environment vault</p>
          </div>
        </div>

        {/* Webhook Configuration */}
        <div className="space-y-3 rounded-xl border border-[#E4E0D7] bg-[#FAFAF7] p-5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-black">
              Webhook Endpoint (For Automatic Async Confirmation)
            </h4>
            <span className="text-[11px] font-bold text-[#087A45]">Ready to Receive Events</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={webhookUrl}
              readOnly
              className="font-mono text-xs font-bold bg-white"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyWebhook}
              className="shrink-0 gap-1 font-bold"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[#087A45]" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-[11px] text-slate-600 font-semibold">
            Add this endpoint into your Razorpay Dashboard → Webhooks. Subscribe to event: <code className="font-mono font-bold text-black">payment.captured</code>
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" disabled={saving} className="gap-2 font-bold">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
            Save Gateway Credentials
          </Button>
        </div>
      </form>
    </div>
  );
}
