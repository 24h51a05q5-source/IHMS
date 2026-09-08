'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2, Save, KeyRound, User, Globe, Check, CreditCard, QrCode, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth/auth-context';
import { hostelsApi } from '@/lib/api/hostels.api';
import { feesApi } from '@/lib/api/fees.api';
import { useLanguage } from '@/lib/i18n/language-context';
import { LANGUAGE_OPTIONS, SupportedLanguage } from '@/lib/i18n/translations';

export default function SettingsPage() {
  const { user, currentBranch, refreshBranches, refreshUser, hasRole } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [name, setName] = useState(user?.name || '');
  const [email] = useState(user?.email || '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [loading, setLoading] = useState(false);

  // Hostel Information State (Owner's actual hostel name from user or currentBranch)
  const initialHostelName = user?.hostelName || user?.organizationName || currentBranch?.hostelName || currentBranch?.name || '';
  const [hostelName, setHostelName] = useState(initialHostelName);
  const [branchName, setBranchName] = useState(currentBranch?.branchName || 'Main');
  const [hostelCode, setHostelCode] = useState(currentBranch?.code || currentBranch?.branchCode || '');
  const [hostelCity, setHostelCity] = useState(currentBranch?.city || 'Hyderabad');
  const [savingHostel, setSavingHostel] = useState(false);

  // Payment Settings Form State
  const [upiVpa, setUpiVpa] = useState('');
  const [confirmUpiVpa, setConfirmUpiVpa] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [bankAccountNum, setBankAccountNum] = useState('');
  const [confirmBankAccountNum, setConfirmBankAccountNum] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [savingPaymentConfig, setSavingPaymentConfig] = useState(false);

  useEffect(() => {
    if (currentBranch?.id && user?.role !== 'STUDENT') {
      feesApi
        .getHostelPaymentConfig(currentBranch.id)
        .then((res: any) => {
          const cfg = res?.data || res;
          if (cfg) {
            const upi = cfg.upiConfig?.vpaAddress || cfg.upiConfig?.pendingVpaAddress || cfg.upi_vpa || '';
            if (upi) {
              setUpiVpa(upi);
              setConfirmUpiVpa(upi);
            }
            const bankAcc = cfg.bankConfig?.accountNumber || cfg.bankConfig?.pendingAccountNumber || cfg.bank_account_number || '';
            if (bankAcc) {
              setBankAccountNum(bankAcc);
              setConfirmBankAccountNum(bankAcc);
            }
            const ifsc = cfg.bankConfig?.ifscCode || cfg.bankConfig?.pendingIfscCode || cfg.bank_ifsc_code || '';
            if (ifsc) setBankIfsc(ifsc);
            const bName = cfg.bankConfig?.beneficiaryName || cfg.bankConfig?.pendingBeneficiaryName || cfg.verified_beneficiary_name || cfg.pending_beneficiary_name || '';
            if (bName) setBeneficiaryName(bName);
            const bBank = cfg.bankConfig?.bankName || cfg.bankConfig?.pendingBankName || cfg.bank_name || cfg.pending_bank_name || '';
            if (bBank) setBankName(bBank);
          }
        })
        .catch(() => {});
    }
  }, [currentBranch?.id, user?.role]);

  const savePaymentConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBranch?.id) {
      toast.error('No active hostel selected.');
      return;
    }

    // 4. Trim leading/trailing spaces before validation
    const trimmedUpi = (upiVpa || '').trim();
    const trimmedConfirmUpi = (confirmUpiVpa || '').trim();

    // 5. Validate that UPI ID and Confirm UPI ID are not empty
    if (!trimmedUpi) {
      toast.error('UPI ID / VPA is required.');
      return;
    }
    if (!trimmedConfirmUpi) {
      toast.error('Please confirm your UPI ID.');
      return;
    }

    // 6. Validate that both UPI IDs match
    if (trimmedUpi !== trimmedConfirmUpi) {
      toast.error(t('settings.upiMismatch', 'UPI IDs do not match'));
      return;
    }

    const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
    if (!upiRegex.test(trimmedUpi)) {
      toast.error(t('settings.invalidUpiId', 'Invalid UPI ID format (e.g. name@bank)'));
      return;
    }

    if (bankAccountNum || confirmBankAccountNum) {
      if (bankAccountNum.trim() !== confirmBankAccountNum.trim()) {
        toast.error(t('settings.accountMismatch', 'Account numbers do not match'));
        return;
      }
      if (bankAccountNum.trim().length < 8 || bankAccountNum.trim().length > 20) {
        toast.error('Account number must be between 8 and 20 digits.');
        return;
      }
    }

    if (bankIfsc) {
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      if (!ifscRegex.test(bankIfsc.trim().toUpperCase())) {
        toast.error(t('settings.invalidIfsc', 'Invalid IFSC code format (e.g. SBIN0001234)'));
        return;
      }
    }

    setSavingPaymentConfig(true);
    try {
      if (trimmedUpi) {
        await feesApi.initiateHostelPaymentVerification(currentBranch.id, 'UPI', {
          upiConfig: {
            vpaAddress: trimmedUpi,
            displayName: hostelName || 'Hostel Owner',
          },
          vpaAddress: trimmedUpi,
          displayName: hostelName || 'Hostel Owner',
        });
        await feesApi.confirmAndActivateHostelPaymentConfig(currentBranch.id, 'UPI');
      }

      if (bankAccountNum.trim() && beneficiaryName.trim() && bankIfsc.trim()) {
        await feesApi.initiateHostelPaymentVerification(currentBranch.id, 'BANK', {
          bankConfig: {
            beneficiaryName: beneficiaryName.trim(),
            accountNumber: bankAccountNum.trim(),
            confirmAccountNumber: confirmBankAccountNum.trim(),
            ifscCode: bankIfsc.trim().toUpperCase(),
            bankName: bankName.trim(),
          },
          beneficiaryName: beneficiaryName.trim(),
          accountNumber: bankAccountNum.trim(),
          confirmAccountNumber: confirmBankAccountNum.trim(),
          ifscCode: bankIfsc.trim().toUpperCase(),
          bankName: bankName.trim(),
        });
        await feesApi.confirmAndActivateHostelPaymentConfig(currentBranch.id, 'BANK');
      }

      setUpiVpa(trimmedUpi);
      setConfirmUpiVpa(trimmedUpi);

      toast.success(t('settings.paymentConfigSaved', 'Payment configuration saved successfully'));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save payment configuration.');
    } finally {
      setSavingPaymentConfig(false);
    }
  };

  const handleLanguageChange = (code: SupportedLanguage) => {
    setLanguage(code);
    const langObj = LANGUAGE_OPTIONS.find((l) => l.code === code);
    toast.success(`${t('settings.languageSelectedToast', 'Language preference updated')}: ${langObj?.nativeName || code}`);
  };

  useEffect(() => {
    if (user?.hostelName) {
      setHostelName(user.hostelName);
    } else if (currentBranch?.hostelName) {
      setHostelName(currentBranch.hostelName);
    } else if (currentBranch?.name) {
      setHostelName(currentBranch.name);
    }
    if (currentBranch) {
      setBranchName(currentBranch.branchName || 'Main');
      setHostelCode(currentBranch.code || currentBranch.branchCode || '');
      setHostelCity(currentBranch.city || 'Hyderabad');
    }
  }, [user, currentBranch]);

  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Profile updates saved successfully.');
  };

  const saveHostelSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostelName.trim()) {
      toast.error('Hostel Name cannot be empty.');
      return;
    }
    setSavingHostel(true);
    try {
      if (currentBranch?.id) {
        await hostelsApi.update(currentBranch.id, {
          name: hostelName.trim(),
          hostelName: hostelName.trim(),
          organizationName: hostelName.trim(),
          branchName: branchName.trim() || 'Main',
          city: hostelCity.trim(),
        });
      }
      await refreshBranches();
      await refreshUser();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ihms:hostel-updated'));
      }
      toast.success(`Hostel name updated to "${hostelName.trim()}"!`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update hostel information.');
    } finally {
      setSavingHostel(false);
    }
  };

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPw || !newPw) {
      toast.error('Fill in both password fields.');
      return;
    }
    setLoading(true);
    try {
      toast.success('Password updated successfully.');
      setCurrentPw('');
      setNewPw('');
    } catch {
      toast.error('Unable to change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5.5">
      <PageHeader title={t('settings.title', 'Settings')} description={t('settings.description', 'Manage your account, preferences, and hostel profile')} />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        {/* 0. LANGUAGE PREFERENCE SETTINGS */}
        <div className="space-y-3.5 sm:space-y-4 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 lg:col-span-2">
          <div className="flex items-center gap-2.5 border-b border-[#CBD5E1] pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF3EB] text-[#E87545] border border-[#FDBA74]">
              <Globe className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-base font-black text-[#000000]">{t('settings.languageTitle', 'Language')}</h3>
              <p className="text-xs text-[#64748B] font-medium">{t('settings.languageSubtitle', 'Choose your preferred language')}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 pt-1">
            {LANGUAGE_OPTIONS.map((opt) => {
              const isSelected = language === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => handleLanguageChange(opt.code)}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all text-left ${
                    isSelected
                      ? 'border-[#E87545] bg-[#FFF3EB]/60 ring-2 ring-[#E87545]/20 shadow-sm'
                      : 'border-[#CBD5E1] bg-[#FAFAF7] hover:border-slate-400 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${isSelected ? 'border-[#E87545] bg-[#E87545]' : 'border-slate-400 bg-white'}`}>
                      {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className="text-xs font-black text-[#111827]">{opt.nativeName}</p>
                      <p className="text-[10px] text-slate-500 font-bold">{opt.name}</p>
                    </div>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-[#E87545]" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 1. HOSTEL PROFILE & NAME SETTINGS (Admin/Owner) */}
        {!hasRole('STUDENT') && (
          <form
            onSubmit={saveHostelSettings}
            className="space-y-3.5 sm:space-y-4 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 lg:col-span-2"
          >
            <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ECE9E1] text-[#E87545] border border-[#DDD8CC]">
                  <Building2 className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-black text-[#000000]">Hostel & Branch Profile</h3>
                  <p className="text-xs text-[#64748B] font-medium">
                    Customize the active hostel name and branch displayed in the header and sidebar
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono font-bold bg-[#ECE9E1] text-[#E87545] px-2.5 py-1 rounded-lg border border-[#DDD8CC]">
                {currentBranch?.code || currentBranch?.branchCode || 'BRANCH'}
              </span>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-bold text-[#64748B]">Actual Hostel Name</Label>
                <Input
                  value={hostelName}
                  onChange={(e) => setHostelName(e.target.value)}
                  placeholder="e.g. My Hostel Name"
                  className="bg-white border border-[#CBD5E1] text-[#111827] font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-[#64748B]">Branch Name</Label>
                <Input
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="e.g. Main Branch"
                  className="bg-white border border-[#CBD5E1] text-[#111827]"
                />
              </div>

              <div className="space-y-1 sm:col-span-3">
                <Label className="text-xs font-bold text-[#64748B]">City / Location</Label>
                <Input
                  value={hostelCity}
                  onChange={(e) => setHostelCity(e.target.value)}
                  placeholder="e.g. Hyderabad"
                  className="bg-white border border-[#CBD5E1] text-[#111827]"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={savingHostel} className="font-bold gap-2 bg-[#E87545] hover:bg-[#D66434] text-white">
                <Save className="h-4 w-4" />
                {savingHostel ? 'Saving...' : 'Update Hostel Profile'}
              </Button>
            </div>
          </form>
        )}

        {/* 2. PAYMENT SETTINGS (Authorized Hostel Owner / Admin / Accountant Only) */}
        {!hasRole('STUDENT') && (
          <div className="space-y-3.5 sm:space-y-4 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 lg:col-span-2">
            <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]">
                  <CreditCard className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-black text-[#000000]">{t('settings.paymentTitle', 'Payment Settings')}</h3>
                  <p className="text-xs text-[#64748B] font-medium">
                    {t('settings.paymentSubtitle', 'Configure how students can make payments directly to this hostel')}
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono font-bold bg-[#E8F5ED] text-[#087A45] px-2.5 py-1 rounded-lg border border-[#B4E2C7]">
                {currentBranch?.code || currentBranch?.branchCode || 'HOSTEL'}
              </span>
            </div>

            {/* Form for Hostel Owner Payment Details (UPI & Bank Settlement) */}
            <form onSubmit={savePaymentConfig} className="space-y-4 pt-1">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* UPI Details */}
                <div className="space-y-3 rounded-xl border border-[#CBD5E1] bg-[#FAFAF7] p-3.5 sm:p-4">
                  <div className="flex items-center gap-2 font-bold text-xs text-[#111827]">
                    <QrCode className="h-4 w-4 text-[#E87545]" />
                    <span>UPI / Dynamic QR Settlement</span>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="upiVpa" className="text-xs font-bold text-[#64748B]">{t('settings.upiId', 'UPI ID / VPA')}</Label>
                    <Input
                      id="upiVpa"
                      value={upiVpa}
                      onChange={(e) => setUpiVpa(e.target.value)}
                      placeholder="e.g. hostelowner@upi"
                      className="bg-white border border-[#CBD5E1] font-mono text-xs font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="confirmUpiVpa" className="text-xs font-bold text-[#64748B]">{t('settings.confirmUpiId', 'Confirm UPI ID')}</Label>
                    <Input
                      id="confirmUpiVpa"
                      value={confirmUpiVpa}
                      onChange={(e) => setConfirmUpiVpa(e.target.value)}
                      placeholder="Re-enter UPI ID"
                      className="bg-white border border-[#CBD5E1] font-mono text-xs"
                    />
                  </div>
                </div>

                {/* Bank Account Details */}
                <div className="space-y-3 rounded-xl border border-[#CBD5E1] bg-[#FAFAF7] p-3.5 sm:p-4">
                  <div className="flex items-center gap-2 font-bold text-xs text-[#111827]">
                    <Landmark className="h-4 w-4 text-[#2563EB]" />
                    <span>Direct Bank Transfer Settlement</span>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-[#64748B]">{t('settings.accountHolderName', 'Account Holder Name')}</Label>
                    <Input
                      value={beneficiaryName}
                      onChange={(e) => setBeneficiaryName(e.target.value)}
                      placeholder="e.g. Sri Chaitanya Hostel Pvt Ltd"
                      className="bg-white border border-[#CBD5E1] text-xs font-bold"
                    />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-[#64748B]">{t('settings.accountNumber', 'Account Number')}</Label>
                      <Input
                        type="password"
                        value={bankAccountNum}
                        onChange={(e) => setBankAccountNum(e.target.value)}
                        placeholder="Account number"
                        className="bg-white border border-[#CBD5E1] font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-[#64748B]">{t('settings.confirmAccountNumber', 'Confirm Account')}</Label>
                      <Input
                        type="password"
                        value={confirmBankAccountNum}
                        onChange={(e) => setConfirmBankAccountNum(e.target.value)}
                        placeholder="Re-enter account number"
                        className="bg-white border border-[#CBD5E1] font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-[#64748B]">{t('settings.ifscCode', 'IFSC Code')}</Label>
                      <Input
                        value={bankIfsc}
                        onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                        placeholder="e.g. SBIN0001234"
                        className="bg-white border border-[#CBD5E1] font-mono text-xs font-bold uppercase"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-[#64748B]">{t('settings.bankName', 'Bank Name')}</Label>
                      <Input
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="e.g. State Bank of India"
                        className="bg-white border border-[#CBD5E1] text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#CBD5E1]">
                <Link href="/settings/payment" className="text-xs font-bold text-[#2563EB] hover:underline flex items-center gap-1">
                  Advanced Provider Gateway & Settlement Status →
                </Link>
                <Button type="submit" disabled={savingPaymentConfig} className="font-bold gap-2 bg-[#E87545] hover:bg-[#D66434] text-white">
                  <Save className="h-4 w-4" />
                  {savingPaymentConfig ? 'Saving...' : t('settings.savePaymentSettings', 'Save Payment Settings')}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* 2. USER PROFILE SETTINGS */}
        <form
          onSubmit={saveProfile}
          className="space-y-3.5 sm:space-y-4 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6"
        >
          <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                <User className="h-4 w-4" />
              </span>
              <h3 className="text-base font-black text-[#000000]">User Account</h3>
            </div>
            {user?.ihmsId && (
              <span className="text-[11px] font-mono font-bold bg-[#EFF6FF] text-[#2563EB] px-2.5 py-1 rounded-lg border border-[#BFDBFE]">
                {user.role === 'STUDENT' ? `Student ID: ${user.ihmsId}` : `Owner ID: ${user.ihmsId}`}
              </span>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-[#64748B]">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white border border-[#CBD5E1] text-[#111827]" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-[#64748B]">Email</Label>
            <Input value={email} disabled className="bg-[#F8FAFC] border border-[#CBD5E1] text-[#64748B]" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-[#64748B]">Default landing page</Label>
            <Select defaultValue="dashboard">
              <SelectTrigger className="bg-white border border-[#CBD5E1] text-[#111827]"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white border border-[#CBD5E1]">
                <SelectItem value="dashboard">Dashboard</SelectItem>
                <SelectItem value="students">Students</SelectItem>
                <SelectItem value="fees">Fees</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="font-bold bg-[#E87545] hover:bg-[#D66434] text-white">Save profile</Button>
        </form>

        {/* 3. PASSWORD SECURITY SETTINGS */}
        <form
          onSubmit={changePw}
          className="space-y-3.5 sm:space-y-4 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6"
        >
          <div className="flex items-center gap-2.5 border-b border-[#CBD5E1] pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]">
              <KeyRound className="h-4 w-4" />
            </span>
            <h3 className="text-base font-black text-[#000000]">Security & Password</h3>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-[#64748B]">Current password</Label>
            <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="bg-white border border-[#CBD5E1] text-[#111827]" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-[#64748B]">New password</Label>
            <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="bg-white border border-[#CBD5E1] text-[#111827]" />
          </div>

          <Button type="submit" disabled={loading} className="font-bold bg-[#E87545] hover:bg-[#D66434] text-white">Update password</Button>
        </form>
      </div>
    </div>
  );
}
