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
  QrCode,
  Landmark,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ArrowRight,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { feesApi } from '@/lib/api/fees.api';
import { api } from '@/lib/api/client';

export type PaymentConfigStatus =
  | 'NOT_CONFIGURED'
  | 'NOT_VERIFIED'
  | 'VERIFICATION_IN_PROGRESS'
  | 'VERIFIED'
  | 'OWNER_CONFIRMED'
  | 'VERIFICATION_FAILED'
  | 'ACTIVE';

export default function PaymentGatewaySettingsPage() {
  const [activeTab, setActiveTab] = useState<'HOSTEL_DIRECT' | 'GATEWAY'>('HOSTEL_DIRECT');

  // Gateway state
  const [provider, setProvider] = useState<'RAZORPAY' | 'CASHFREE' | 'PHONEPE'>('RAZORPAY');
  const [mode, setMode] = useState<'TEST' | 'LIVE'>('TEST');
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingGateway, setLoadingGateway] = useState(true);
  const [savingGateway, setSavingGateway] = useState(false);

  // Direct Hostel Settlement state
  const [hostels, setHostels] = useState<any[]>([]);
  const [selectedHostelId, setSelectedHostelId] = useState<string>('');

  // Active / Loaded config object
  const [paymentConfig, setPaymentConfig] = useState<any>(null);

  // Form fields
  const [vpaAddress, setVpaAddress] = useState('');
  const [upiDisplayName, setUpiDisplayName] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [showAccountNumber, setShowAccountNumber] = useState(false);

  const [loadingHostelConfig, setLoadingHostelConfig] = useState(false);
  const [verifyingUpi, setVerifyingUpi] = useState(false);
  const [verifyingBank, setVerifyingBank] = useState(false);
  const [activatingMethod, setActivatingMethod] = useState<'UPI' | 'BANK' | null>(null);

  // Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    method: 'UPI' | 'BANK';
    enteredName: string;
    verifiedName: string;
    isChecked: boolean;
  }>({
    isOpen: false,
    method: 'UPI',
    enteredName: '',
    verifiedName: '',
    isChecked: false,
  });

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/fees/payments/webhook`
      : '/api/fees/payments/webhook';

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

  const loadHostelConfig = useCallback(async (hostelId: string) => {
    if (!hostelId) return;
    setLoadingHostelConfig(true);
    try {
      const data = await feesApi.getHostelPaymentConfig(hostelId);
      setPaymentConfig(data);
      if (data) {
        const upiVal = data.upiConfig?.pendingVpaAddress || data.upiConfig?.vpaAddress || '';
        const upiNameVal = data.upiConfig?.pendingDisplayName || data.upiConfig?.displayName || '';
        const bankBeneficiaryVal = data.bankConfig?.pendingBeneficiaryName || data.bankConfig?.beneficiaryName || '';
        const bankAccVal = data.bankConfig?.pendingAccountNumber || data.bankConfig?.maskedAccountNumber || data.bankConfig?.accountNumber || '';
        const bankIfscVal = data.bankConfig?.pendingIfscCode || data.bankConfig?.ifscCode || '';
        const bankNameVal = data.bankConfig?.pendingBankName || data.bankConfig?.bankName || '';

        setVpaAddress(upiVal);
        setUpiDisplayName(upiNameVal);
        setBeneficiaryName(bankBeneficiaryVal);
        setAccountNumber(bankAccVal);
        setConfirmAccountNumber(bankAccVal);
        setIfscCode(bankIfscVal);
        setBankName(bankNameVal);
      } else {
        setVpaAddress('');
        setUpiDisplayName('');
        setBeneficiaryName('');
        setAccountNumber('');
        setConfirmAccountNumber('');
        setIfscCode('');
        setBankName('');
      }
    } catch {
      setPaymentConfig(null);
      setVpaAddress('');
      setUpiDisplayName('');
      setBeneficiaryName('');
      setAccountNumber('');
      setConfirmAccountNumber('');
      setIfscCode('');
      setBankName('');
    } finally {
      setLoadingHostelConfig(false);
    }
  }, []);

  const loadGatewaySettings = useCallback(async () => {
    setLoadingGateway(true);
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
      setLoadingGateway(false);
    }
  }, []);

  useEffect(() => {
    loadHostels();
    loadGatewaySettings();
  }, [loadHostels, loadGatewaySettings]);

  useEffect(() => {
    if (selectedHostelId) {
      loadHostelConfig(selectedHostelId);
    }
  }, [selectedHostelId, loadHostelConfig]);

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('Webhook URL copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  // STEP 2 & 3: Initiate Verification (Self-Verification by Owner)
  const handleVerifyMethod = async (method: 'UPI' | 'BANK') => {
    if (!selectedHostelId) {
      toast.error('Please select a hostel branch.');
      return;
    }

    if (method === 'UPI') {
      const vpaClean = vpaAddress.trim();
      if (!vpaClean) {
        toast.error('Please enter a valid UPI ID / VPA.');
        return;
      }
      if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(vpaClean)) {
        toast.error('Invalid UPI ID format. Expected format e.g. 9848012345@ybl, name@okaxis, hostel@paytm');
        return;
      }

      setVerifyingUpi(true);
      try {
        const updated = await feesApi.initiateHostelPaymentVerification(selectedHostelId, 'UPI', {
          upiConfig: {
            vpaAddress: vpaClean,
            displayName: upiDisplayName,
          },
        });
        setPaymentConfig(updated);
        toast.success('UPI details verified. Please confirm and activate.');
        setConfirmModal({
          isOpen: true,
          method: 'UPI',
          enteredName: upiDisplayName || vpaClean,
          verifiedName: updated.verification?.verifiedBeneficiaryName || upiDisplayName || vpaClean,
          isChecked: false,
        });
      } catch (err: any) {
        toast.error(err?.message || 'UPI verification failed.');
      } finally {
        setVerifyingUpi(false);
      }
    } else {
      const beneficiaryClean = beneficiaryName.trim();
      const accClean = accountNumber.trim();
      const confirmAccClean = confirmAccountNumber.trim();
      const ifscClean = ifscCode.trim().toUpperCase();

      if (!beneficiaryClean) {
        toast.error('Please enter the Account Holder / Beneficiary Name.');
        return;
      }
      if (!accClean) {
        toast.error('Please enter the Bank Account Number.');
        return;
      }
      if (accClean && !accClean.includes('•') && accClean !== confirmAccClean) {
        toast.error('Account numbers do not match.');
        return;
      }
      if (!ifscClean || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscClean)) {
        toast.error('Invalid IFSC Code format. Expected 11 characters (e.g. SBIN0001234)');
        return;
      }

      setVerifyingBank(true);
      try {
        const updated = await feesApi.initiateHostelPaymentVerification(selectedHostelId, 'BANK', {
          bankConfig: {
            beneficiaryName: beneficiaryClean,
            accountNumber: accClean,
            confirmAccountNumber: confirmAccClean,
            ifscCode: ifscClean,
            bankName,
          },
        });
        setPaymentConfig(updated);
        toast.success('Bank details verified. Please confirm and activate.');
        setConfirmModal({
          isOpen: true,
          method: 'BANK',
          enteredName: beneficiaryClean,
          verifiedName: updated.verification?.verifiedBeneficiaryName || beneficiaryClean,
          isChecked: false,
        });
      } catch (err: any) {
        toast.error(err?.message || 'Bank account verification failed.');
      } finally {
        setVerifyingBank(false);
      }
    }
  };

  // STEP 4 & 5: Owner Confirms and Activates Configuration
  const handleConfirmAndActivate = async () => {
    if (!selectedHostelId || !confirmModal.method) return;
    setActivatingMethod(confirmModal.method);
    try {
      const updated = await feesApi.confirmAndActivateHostelPaymentConfig(selectedHostelId, confirmModal.method);
      setPaymentConfig(updated);
      toast.success(`${confirmModal.method === 'UPI' ? 'UPI' : 'Bank'} payment details are now ACTIVE for student fee payments!`);
      setConfirmModal({ isOpen: false, method: 'UPI', enteredName: '', verifiedName: '', isChecked: false });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to activate payment configuration.');
    } finally {
      setActivatingMethod(null);
    }
  };

  // STEP 6: Cancel Pending Changes
  const handleCancelPending = async (method: 'UPI' | 'BANK') => {
    if (!selectedHostelId) return;
    try {
      const updated = await feesApi.cancelPendingHostelPaymentConfig(selectedHostelId, method);
      setPaymentConfig(updated);
      await loadHostelConfig(selectedHostelId);
      toast.success('Pending edits discarded. Existing active details preserved.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to discard pending edits.');
    }
  };

  const handleSaveGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGateway(true);
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
      await loadGatewaySettings();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save payment configuration.');
    } finally {
      setSavingGateway(false);
    }
  };

  const renderStatusBadge = (status: PaymentConfigStatus) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]">
            <CheckCircle2 className="h-3.5 w-3.5" /> ACTIVE
          </span>
        );
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200">
            <CheckCircle2 className="h-3.5 w-3.5" /> VERIFIED (Pending Activation)
          </span>
        );
      case 'OWNER_CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
            <CheckCircle2 className="h-3.5 w-3.5" /> OWNER CONFIRMED
          </span>
        );
      case 'VERIFICATION_IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-700 border border-amber-200">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> VERIFICATION IN PROGRESS
          </span>
        );
      case 'VERIFICATION_FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-red-50 text-red-700 border border-red-200">
            <XCircle className="h-3.5 w-3.5" /> VERIFICATION FAILED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-600 border border-slate-200">
            <HelpCircle className="h-3.5 w-3.5" /> NOT VERIFIED
          </span>
        );
    }
  };

  const upiStatus: PaymentConfigStatus = paymentConfig?.upiConfig?.status || 'NOT_CONFIGURED';
  const bankStatus: PaymentConfigStatus = paymentConfig?.bankConfig?.status || 'NOT_CONFIGURED';
  const isAutoAvailable = Boolean(paymentConfig?.verification?.isAutoVerificationAvailable);

  return (
    <div className="space-y-4 sm:space-y-5 max-w-4xl mx-auto">
      <PageHeader
        title="Payment & Settlement Settings"
        description="Configure hostel UPI QR codes, bank accounts, and merchant gateway credentials for fee collection"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('HOSTEL_DIRECT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                activeTab === 'HOSTEL_DIRECT'
                  ? 'bg-[#E87545] text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-[#CBD5E1] hover:bg-[#FAFAF7]'
              }`}
            >
              Hostel Settlement Details
            </button>
            <button
              onClick={() => setActiveTab('GATEWAY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                activeTab === 'GATEWAY'
                  ? 'bg-[#E87545] text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-[#CBD5E1] hover:bg-[#FAFAF7]'
              }`}
            >
              Payment Gateway
            </button>
          </div>
        }
      />

      {/* Security Guarantee Banner */}
      <div className="rounded-xl border border-[#CBD5E1] bg-white p-3.5 sm:p-5 flex items-start gap-3.5">
        <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg bg-[#FFF3EB] text-[#E87545] border border-[#FDE6D6]">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="space-y-0.5 sm:space-y-1 text-xs">
          <h3 className="font-black text-black text-sm">Owner Self-Verification & Active Protection</h3>
          <p className="text-slate-600 font-semibold leading-relaxed">
            Verify and activate settlement destinations directly without waiting for admin approval. Existing active payment accounts remain protected until you explicitly confirm replacement.
          </p>
        </div>
      </div>

      {activeTab === 'HOSTEL_DIRECT' ? (
        /* TAB 1: HOSTEL UPI & BANK CONFIGURATION WITH SELF-VERIFICATION */
        <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 lg:p-7 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#CBD5E1] pb-4">
            <div>
              <h3 className="text-base font-black text-black flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#E87545]" />
                Hostel Branch Settlement Configuration
              </h3>
              <p className="text-xs font-semibold text-slate-500">
                Configure unique payment details per hostel branch for student fee collection
              </p>
            </div>

            {hostels.length > 0 && (
              <div className="flex items-center gap-2">
                <Label htmlFor="hostelSelect" className="text-xs font-bold text-slate-700 shrink-0">
                  Select Hostel:
                </Label>
                <select
                  id="hostelSelect"
                  value={selectedHostelId}
                  onChange={(e) => setSelectedHostelId(e.target.value)}
                  className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-bold text-black focus:border-[#E87545] focus:outline-none"
                >
                  {hostels.map((h) => (
                    <option key={h.id || h._id} value={h.id || h._id}>
                      {h.hostelName || h.name || 'Hostel Branch'} ({h.branchName || h.city || 'Main'})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {!isAutoAvailable && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-black text-amber-900">Automatic Account Verification Provider Not Configured</h4>
                <p className="text-amber-800 mt-0.5 leading-relaxed">
                  Automatic bank lookup service is currently unconfigured. You can perform **Owner Self-Verification** by reviewing details and confirming account ownership. Details will be saved as **OWNER_CONFIRMED**.
                </p>
              </div>
            </div>
          )}

          {loadingHostelConfig ? (
            <div className="py-8 text-center text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-[#E87545]" /> Loading settlement configuration...
            </div>
          ) : (
            <div className="space-y-6">
              {/* SECTION A: UPI CONFIGURATION & STAGING */}
              <div className="space-y-4 rounded-xl border border-[#FDE6D6] bg-[#FFF3EB]/40 p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFF3EB] text-[#E87545] border border-[#FDE6D6]">
                      <QrCode className="h-4 w-4" />
                    </span>
                    <h4 className="text-sm font-black text-black">1. Dynamic UPI Payment Destination</h4>
                  </div>
                  {renderStatusBadge(upiStatus)}
                </div>

                {/* Show currently ACTIVE UPI details if present */}
                {paymentConfig?.upiConfig?.vpaAddress && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-xs flex items-center justify-between">
                    <div>
                      <span className="font-bold text-emerald-900 uppercase tracking-wider text-[10px]">Current Active Payee:</span>
                      <p className="font-mono font-black text-emerald-950 text-sm">{paymentConfig.upiConfig.vpaAddress} ({paymentConfig.upiConfig.displayName || 'Hostel'})</p>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Used for Student QR</span>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="vpaAddress" className="text-xs font-bold text-black">
                      UPI ID / VPA *
                    </Label>
                    <Input
                      id="vpaAddress"
                      placeholder="e.g. 9848012345@ybl or hostel@okaxis"
                      value={vpaAddress}
                      onChange={(e) => setVpaAddress(e.target.value)}
                      className="font-mono text-xs font-bold bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="upiDisplayName" className="text-xs font-bold text-black">
                      UPI Display / Beneficiary Name
                    </Label>
                    <Input
                      id="upiDisplayName"
                      placeholder="e.g. Sri Residency Hostel"
                      value={upiDisplayName}
                      onChange={(e) => setUpiDisplayName(e.target.value)}
                      className="text-xs font-bold bg-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  {paymentConfig?.upiConfig?.pendingVpaAddress && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelPending('UPI')}
                      className="gap-1.5 text-xs text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Discard Pending Edits
                    </Button>
                  )}
                  <div className="flex items-center gap-2 ml-auto">
                    {(upiStatus === 'VERIFIED' || upiStatus === 'OWNER_CONFIRMED') && (
                      <Button
                        type="button"
                        onClick={() =>
                          setConfirmModal({
                            isOpen: true,
                            method: 'UPI',
                            enteredName: upiDisplayName || vpaAddress,
                            verifiedName: paymentConfig?.verification?.verifiedBeneficiaryName || upiDisplayName || vpaAddress,
                            isChecked: false,
                          })
                        }
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5"
                      >
                        Confirm and Activate UPI
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => handleVerifyMethod('UPI')}
                      disabled={verifyingUpi}
                      className="bg-[#E87545] hover:bg-[#D66434] text-white font-bold text-xs gap-1.5"
                    >
                      {verifyingUpi ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                      Verify UPI Account
                    </Button>
                  </div>
                </div>
              </div>

              {/* SECTION B: BANK TRANSFER CONFIGURATION & STAGING */}
              <div className="space-y-4 rounded-xl border border-[#CBD5E1] bg-[#FAFAF7] p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ECE9E1] text-[#18233A] border border-[#CBD5E1]">
                      <Landmark className="h-4 w-4" />
                    </span>
                    <h4 className="text-sm font-black text-black">2. Direct Bank Transfer Destination</h4>
                  </div>
                  {renderStatusBadge(bankStatus)}
                </div>

                {/* Show currently ACTIVE Bank details if present */}
                {paymentConfig?.bankConfig?.accountNumber && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-xs flex items-center justify-between">
                    <div>
                      <span className="font-bold text-emerald-900 uppercase tracking-wider text-[10px]">Current Active Bank Account:</span>
                      <p className="font-mono font-black text-emerald-950 text-sm">
                        {paymentConfig.bankConfig.beneficiaryName} — {paymentConfig.bankConfig.maskedAccountNumber || paymentConfig.bankConfig.accountNumber} (IFSC: {paymentConfig.bankConfig.ifscCode})
                      </p>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Active Destination</span>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="beneficiaryName" className="text-xs font-bold text-black">
                      Account Holder / Beneficiary Name *
                    </Label>
                    <Input
                      id="beneficiaryName"
                      placeholder="e.g. Sri Residency Hostel Services"
                      value={beneficiaryName}
                      onChange={(e) => setBeneficiaryName(e.target.value)}
                      className="text-xs font-bold bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="bankName" className="text-xs font-bold text-black">
                      Bank Name
                    </Label>
                    <Input
                      id="bankName"
                      placeholder="e.g. State Bank of India"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="text-xs font-bold bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="accountNumber" className="text-xs font-bold text-black">
                      Bank Account Number *
                    </Label>
                    <div className="relative">
                      <Input
                        id="accountNumber"
                        type={showAccountNumber ? 'text' : 'password'}
                        placeholder="e.g. 123456789012"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        className="font-mono text-xs font-bold bg-white pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAccountNumber(!showAccountNumber)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black"
                      >
                        {showAccountNumber ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirmAccountNumber" className="text-xs font-bold text-black">
                      Confirm Account Number *
                    </Label>
                    <Input
                      id="confirmAccountNumber"
                      type={showAccountNumber ? 'text' : 'password'}
                      placeholder="e.g. 123456789012"
                      value={confirmAccountNumber}
                      onChange={(e) => setConfirmAccountNumber(e.target.value)}
                      className="font-mono text-xs font-bold bg-white"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="ifscCode" className="text-xs font-bold text-black">
                      Bank IFSC Code *
                    </Label>
                    <Input
                      id="ifscCode"
                      placeholder="e.g. SBIN0001234"
                      value={ifscCode}
                      onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                      className="font-mono text-xs font-bold bg-white uppercase max-w-xs"
                      maxLength={11}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  {paymentConfig?.bankConfig?.pendingAccountNumber && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelPending('BANK')}
                      className="gap-1.5 text-xs text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Discard Pending Edits
                    </Button>
                  )}
                  <div className="flex items-center gap-2 ml-auto">
                    {(bankStatus === 'VERIFIED' || bankStatus === 'OWNER_CONFIRMED') && (
                      <Button
                        type="button"
                        onClick={() =>
                          setConfirmModal({
                            isOpen: true,
                            method: 'BANK',
                            enteredName: beneficiaryName,
                            verifiedName: paymentConfig?.verification?.verifiedBeneficiaryName || beneficiaryName,
                            isChecked: false,
                          })
                        }
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5"
                      >
                        Confirm and Activate Bank
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => handleVerifyMethod('BANK')}
                      disabled={verifyingBank}
                      className="bg-[#18233A] hover:bg-[#23314E] text-white font-bold text-xs gap-1.5"
                    >
                      {verifyingBank ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                      Verify Bank Account
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* TAB 2: GATEWAY CONFIGURATION */
        <form onSubmit={handleSaveGateway} className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 lg:p-7 space-y-4 sm:space-y-5">
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
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="submit" disabled={savingGateway} className="gap-2 font-bold">
              {savingGateway ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
              Save Gateway Credentials
            </Button>
          </div>
        </form>
      )}

      {/* STEP 4: OWNER CONFIRMATION MODAL */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 border-b pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-black text-black text-base">Owner Activation Confirmation</h3>
                <p className="text-xs font-bold text-slate-500">Confirm payment settlement destination</p>
              </div>
            </div>

            <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Entered Account Holder:</span>
                <span className="font-bold font-mono text-black">{confirmModal.enteredName}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold text-slate-500">Verified Account Holder:</span>
                <span className="font-black font-mono text-emerald-700">{confirmModal.verifiedName}</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2">
              <h4 className="font-black text-amber-900">Is this the account where you want to receive student payments?</h4>
              <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={confirmModal.isChecked}
                  onChange={(e) => setConfirmModal({ ...confirmModal, isChecked: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#E87545] focus:ring-[#E87545]"
                />
                <span className="font-bold text-slate-800 text-[11px]">
                  I confirm that I own this account and want student fee payments settled directly into this destination.
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                className="font-bold text-xs"
              >
                Cancel
              </Button>

              <Button
                type="button"
                disabled={!confirmModal.isChecked || activatingMethod !== null}
                onClick={handleConfirmAndActivate}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5"
              >
                {activatingMethod ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Confirm and Activate
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
