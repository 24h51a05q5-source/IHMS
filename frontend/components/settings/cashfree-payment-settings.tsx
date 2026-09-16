'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Building2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Clock,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { feesApi } from '@/lib/api/fees.api';
import { paymentsApi } from '@/lib/api/payments.api';
import { api } from '@/lib/api/client';

interface CashfreePaymentSettingsProps {
  showHeader?: boolean;
}

export function CashfreePaymentSettings({ showHeader = false }: CashfreePaymentSettingsProps) {
  // Gateway state (Cashfree Platform Engine)
  const [mode, setMode] = useState<'TEST' | 'LIVE'>('TEST');
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingGateway, setLoadingGateway] = useState(true);
  const [savingGateway, setSavingGateway] = useState(false);

  // Hostels & Cashfree Sub-Merchant State
  const [hostels, setHostels] = useState<any[]>([]);
  const [selectedHostelId, setSelectedHostelId] = useState<string>('');
  const [cashfreeStatus, setCashfreeStatus] = useState<{
    vendorId: string;
    status: string;
    bankStatus: string;
    kycStatus: string;
    onboardingUrl?: string;
  } | null>(null);
  const [loadingCashfreeStatus, setLoadingCashfreeStatus] = useState(false);
  const [generatingOnboardingLink, setGeneratingOnboardingLink] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState('/api/webhooks/cashfree');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/webhooks/cashfree`);
    }
  }, []);

  const loadHostels = useCallback(async () => {
    try {
      const res = await api.get<any>('/hostels');
      const list = Array.isArray(res) ? res : (res as any)?.data || [];
      setHostels(list);
      if (list.length > 0 && !selectedHostelId) {
        setSelectedHostelId(list[0].id || list[0]._id);
      }
    } catch {
      // Fallback
    }
  }, [selectedHostelId]);

  const loadCashfreeStatus = useCallback(async (hostelId: string) => {
    if (!hostelId) return;
    setLoadingCashfreeStatus(true);
    try {
      const res = await paymentsApi.getHostelOnboardingStatus(hostelId);
      setCashfreeStatus(res);
    } catch {
      setCashfreeStatus(null);
    } finally {
      setLoadingCashfreeStatus(false);
    }
  }, []);

  const loadGatewaySettings = useCallback(async () => {
    setLoadingGateway(true);
    try {
      const data = await feesApi.getPaymentSettings();
      if (data) {
        setMode((data.environment || 'TEST') as any);

        // If the owner has not saved Cashfree credentials, or the backend returned the default test fallback,
        // keep the fields empty so new owners are prompted to enter their own credentials.
        const isUnconfiguredOrTestFallback =
          !data.keyId ||
          data.keyId === 'TEST_CF_APP_ihms_live_2026' ||
          data.keyId.startsWith('TEST_CF_APP_') ||
          data.isConfigured === false ||
          data.onboardingStatus === 'NOT_CONFIGURED';

        if (isUnconfiguredOrTestFallback) {
          setKeyId('');
          setKeySecret('');
          setWebhookSecret('');
        } else {
          // Existing owner who already saved Cashfree credentials: keep their saved configuration loaded
          setKeyId(data.keyId || '');
          setKeySecret(data.maskedSecret || '');
          setWebhookSecret(data.webhookSecret || '');
        }
      }
    } catch {
      // Keep empty on error
      setKeyId('');
      setKeySecret('');
      setWebhookSecret('');
    } finally {
      setLoadingGateway(false);
    }
  }, []);

  useEffect(() => {
    loadHostels();
    loadGatewaySettings();
  }, [loadHostels, loadGatewaySettings]);

  useEffect(() => {
    if (selectedHostelId) {
      loadCashfreeStatus(selectedHostelId);
    }
  }, [selectedHostelId, loadCashfreeStatus]);

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('Cashfree Webhook URL copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCompleteKyc = async () => {
    if (!selectedHostelId) {
      toast.error('Please select a hostel branch first.');
      return;
    }
    setGeneratingOnboardingLink(true);
    try {
      const res = await paymentsApi.getHostelOnboardingLink(selectedHostelId);
      if (res.onboardingUrl) {
        window.open(res.onboardingUrl, '_blank');
        toast.info('Opening Cashfree Hosted Onboarding portal. Please complete your bank & KYC verification.');
      } else {
        toast.error('Unable to retrieve onboarding URL. Please try again.');
      }
      await loadCashfreeStatus(selectedHostelId);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate onboarding link.');
    } finally {
      setGeneratingOnboardingLink(false);
    }
  };

  const handleSaveGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGateway(true);
    try {
      await feesApi.updatePaymentSettings({
        provider: 'CASHFREE',
        environment: mode,
        keyId,
        keySecret: keySecret?.includes('***') ? undefined : keySecret,
        webhookSecret: webhookSecret?.includes('***') ? undefined : webhookSecret,
      });
      toast.success('Cashfree Gateway credentials saved successfully!');
      await loadGatewaySettings();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save gateway configuration.');
    } finally {
      setSavingGateway(false);
    }
  };

  return (
    <div className="space-y-5">
      {showHeader && (
        <PageHeader
          title="Cashfree Payment Gateway"
          description="Manage Cashfree Easy Split platform keys, automated vendor settlement, and sub-merchant onboarding"
        />
      )}

      {/* CARD 1: CASHFREE EASY SPLIT & SUB-MERCHANT SETTLEMENT */}
      <div className="rounded-2xl border border-[#CBD5E1] bg-white p-5 sm:p-6 lg:p-7 space-y-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#CBD5E1] pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7] shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-black">Sub-Merchant Settlement (Cashfree Easy Split)</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F5ED] px-2 py-0.5 text-[10px] font-black text-[#087A45] border border-[#B4E2C7]">
                  <Sparkles className="h-2.5 w-2.5" /> Direct Settlement
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-500">
                100% of student fee collections settle directly into your verified hostel bank account via Cashfree Easy Split
              </p>
            </div>
          </div>

          {/* Branch selector */}
          {hostels.length > 1 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-500" />
              <select
                value={selectedHostelId}
                onChange={(e) => setSelectedHostelId(e.target.value)}
                className="h-9 text-xs font-bold rounded-lg border border-[#CBD5E1] bg-white px-3 py-1 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#E87545]"
              >
                {hostels.map((h) => (
                  <option key={h.id || h._id} value={h.id || h._id}>
                    {h.name || h.hostelName || 'Branch'} ({h.code || 'MAIN'})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Sub-Merchant Status Board */}
        <div className="rounded-xl border border-[#CBD5E1] bg-[#FAFAF7] p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <p className="text-xs font-black text-slate-900">Cashfree Sub-Merchant Account Status</p>
              <p className="text-[11px] text-slate-500 font-medium">Automated split settlements require completed KYC & verified bank penny drop.</p>
            </div>
            <div className="flex items-center gap-2">
              {cashfreeStatus?.status === 'ACTIVE' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]">
                  <CheckCircle2 className="h-3.5 w-3.5" /> ACTIVE & SETTLING
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-[#FEF3C7] text-[#C94F18] border border-[#FDE68A]">
                  <AlertTriangle className="h-3.5 w-3.5" /> SETUP INCOMPLETE
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingCashfreeStatus}
                onClick={() => selectedHostelId && loadCashfreeStatus(selectedHostelId)}
                className="h-8 text-xs font-bold gap-1 bg-white"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingCashfreeStatus ? 'animate-spin' : ''}`} />
                Refresh Status
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 text-xs">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1 shadow-sm">
              <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Sub-Merchant ID (Vendor ID)</p>
              <p className="font-mono font-black text-slate-900 text-xs truncate">
                {cashfreeStatus?.vendorId || (selectedHostelId ? `ihms_hostel_${String(selectedHostelId).replace(/-/g, '').substring(0, 16)}` : 'Select Hostel')}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1 shadow-sm">
              <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Bank Penny Drop Status</p>
              <div className="flex items-center gap-1.5">
                {cashfreeStatus?.bankStatus === 'VERIFIED' ? (
                  <span className="font-bold text-[#087A45] flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Bank Account Verified
                  </span>
                ) : (
                  <span className="font-bold text-amber-700 flex items-center gap-1">
                    <Clock className="h-4 w-4" /> Pending Penny Drop
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1 shadow-sm">
              <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">KYC Verification</p>
              <div className="flex items-center gap-1.5">
                {cashfreeStatus?.kycStatus === 'VERIFIED' ? (
                  <span className="font-bold text-[#087A45] flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Documents Approved
                  </span>
                ) : (
                  <span className="font-bold text-amber-700 flex items-center gap-1">
                    <Clock className="h-4 w-4" /> Pending Documents
                  </span>
                )}
              </div>
            </div>
          </div>

          {cashfreeStatus?.status !== 'ACTIVE' && (
            <div className="rounded-xl bg-white border border-[#FDE6D6] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div className="space-y-1 text-xs">
                <p className="font-black text-black">Action Required: Complete Cashfree Sub-Merchant KYC</p>
                <p className="text-slate-600 font-medium">
                  Upload business PAN, GSTIN, and Bank Account for automated penny-drop verification via Cashfree’s secure hosted portal.
                </p>
              </div>
              <Button
                type="button"
                disabled={generatingOnboardingLink}
                onClick={handleCompleteKyc}
                className="shrink-0 h-10 font-black text-xs uppercase tracking-wider bg-[#E87545] hover:bg-[#D66434] text-white gap-2 shadow-sm"
              >
                {generatingOnboardingLink ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Complete KYC Setup
              </Button>
            </div>
          )}

          <div className="text-[11px] text-slate-600 font-medium bg-[#FAFAF7] rounded-xl p-3 border border-slate-200 space-y-1">
            <p className="font-bold text-slate-800">
              💡 Zero Deductions & 100% Direct Settlement Architecture:
            </p>
            <p>
              The platform operates strictly as a Technology Service Provider (TSP). 100% of your student&apos;s base fee is routed directly to this verified Cashfree vendor bank account at transaction time. The platform charges ₹0 gateway fee to the hostel owner.
            </p>
          </div>
        </div>
      </div>

      {/* CARD 2: CASHFREE GATEWAY CREDENTIALS & WEBHOOKS */}
      <form onSubmit={handleSaveGateway} className="rounded-2xl border border-[#CBD5E1] bg-white p-5 sm:p-6 lg:p-7 space-y-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#CBD5E1] pb-4">
          <div>
            <h3 className="text-base font-black text-black flex items-center gap-2">
              <Key className="h-5 w-5 text-[#E87545]" />
              Cashfree Gateway Credentials & Webhooks
            </h3>
            <p className="text-xs font-semibold text-slate-500">Configure Cashfree Merchant API keys and real-time webhook endpoints</p>
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
              Sandbox (Test)
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

        {/* Webhook URL configuration */}
        <div className="rounded-xl border border-[#CBD5E1] bg-[#FAFAF7] p-4 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <Label className="text-xs font-bold text-black">Cashfree Server-to-Server Webhook URL</Label>
              <p className="text-[11px] text-slate-500">
                Copy and paste this webhook URL into your Cashfree Merchant Dashboard under Developers &rarr; Webhooks to receive automated, real-time payment and settlement notifications.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyWebhook}
              className="font-bold text-xs gap-1.5 h-8 bg-white border-[#CBD5E1]"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[#087A45]" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy Webhook URL'}
            </Button>
          </div>
          <div className="p-2.5 rounded-lg bg-white border border-[#CBD5E1] font-mono text-xs text-slate-700 select-all break-all">
            {webhookUrl}
          </div>
        </div>

        {/* API Credentials */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-black flex items-center justify-between">
              <span>Cashfree App ID (Client ID)</span>
              <span className="text-[10px] font-normal text-slate-400">Required</span>
            </Label>
            <Input
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="Enter your Cashfree App ID"
              className="bg-white border-[#CBD5E1] font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-black flex items-center justify-between">
              <span>Cashfree Secret Key</span>
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="text-[10px] text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1"
              >
                {showSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showSecret ? 'Hide' : 'Reveal'}
              </button>
            </Label>
            <Input
              type={showSecret ? 'text' : 'password'}
              value={keySecret}
              onChange={(e) => setKeySecret(e.target.value)}
              placeholder="Enter your Cashfree Secret Key"
              className="bg-white border-[#CBD5E1] font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-bold text-black flex items-center justify-between">
              <span>Webhook Signature Secret</span>
              <span className="text-[10px] font-normal text-slate-400">For HMAC-SHA256 verification</span>
            </Label>
            <Input
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="Enter your Cashfree Webhook Signature Secret"
              className="bg-white border-[#CBD5E1] font-mono text-xs"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#CBD5E1]">
          <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-[#087A45]" />
            Keys are encrypted at rest using AES-256 in PostgreSQL.
          </p>
          <Button
            type="submit"
            disabled={savingGateway || loadingGateway}
            className="font-bold text-xs uppercase tracking-wider bg-[#E87545] hover:bg-[#D66434] text-white shadow-sm"
          >
            {savingGateway ? 'Saving Credentials...' : 'Save Cashfree Credentials'}
          </Button>
        </div>
      </form>
    </div>
  );
}
