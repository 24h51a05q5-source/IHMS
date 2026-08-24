'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2, Lock, Mail, Phone, User, MapPin, CheckCircle2,
  Copy, ArrowRight, Loader2, Eye, EyeOff, ShieldCheck, Sparkles, AlertCircle, ArrowLeft
} from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { authApi, type RegisterOwnerPayload, type RegisterOwnerResponse, type ExistingHostelAccount } from '@/lib/api/auth.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { ApiError } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [form, setForm] = useState<RegisterOwnerPayload>({
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    ownerPassword: '',
    hostelName: '',
    branchName: 'Main',
    hostelType: 'BOYS',
    phone: '',
    email: '',
    address: '',
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingAccount, setExistingAccount] = useState<ExistingHostelAccount | null>(null);
  const [successData, setSuccessData] = useState<RegisterOwnerResponse | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(user.role === 'STUDENT' ? '/student' : '/dashboard');
    }
  }, [user, authLoading, router]);

  const updateField = (field: keyof RegisterOwnerPayload, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExistingAccount(null);

    const trimmedHostelName = form.hostelName.trim();
    if (!trimmedHostelName) {
      setError('Hostel Name is required.');
      return;
    }
    if (!form.ownerEmail.trim()) {
      setError('Owner Email is required.');
      return;
    }
    if (!form.ownerPassword) {
      setError('Password is required.');
      return;
    }
    if (form.ownerPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }
    if (form.ownerPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const payload: RegisterOwnerPayload = {
        hostelName: trimmedHostelName,
        orgName: trimmedHostelName,
        branchName: (form.branchName || 'Main').trim(),
        hostelType: form.hostelType || 'BOYS',
        ownerName: form.ownerName.trim(),
        ownerEmail: form.ownerEmail.trim().toLowerCase(),
        ownerPhone: (form.ownerPhone || '').trim(),
        ownerPassword: form.ownerPassword,
        email: form.ownerEmail.trim().toLowerCase(),
        phone: (form.ownerPhone || '').trim(),
        address: (form.address || '').trim(),
        city: (form.city || 'Hyderabad').trim(),
        state: (form.state || 'Telangana').trim(),
        pincode: (form.pincode || '').trim(),
      };
      const res = await authApi.register(payload);
      setSuccessData(res);
      setExistingAccount(null);
      toast.success('Registration successful! Please save your Owner ID.');
    } catch (err) {
      const apiErr = err as ApiError;
      const details = apiErr?.details as ExistingHostelAccount | undefined;
      if (details && details.accountAlreadyExists) {
        setExistingAccount(details);
        setError(null);
        return;
      }
      if (apiErr?.statusCode === 409 || (apiErr?.message || '').toLowerCase().includes('already exists')) {
        try {
          const checkRes = await authApi.checkExistingHostel(form.ownerEmail.trim());
          if (checkRes?.data && checkRes.data.accountAlreadyExists) {
            setExistingAccount(checkRes.data);
            setError(null);
            return;
          }
        } catch {
          // fallback
        }
      }
      const msg = apiErr?.message || 'Unable to complete registration. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard!`);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F1EC] py-6 sm:py-10 px-3.5 sm:px-6 lg:px-8">
      {/* Centered Master Container (Max Width 1020px) */}
      <div className="mx-auto w-full max-w-4xl space-y-6 sm:space-y-7">
        
        {/* TOP BAR & NAVIGATION */}
        <div className="flex items-center justify-between">
          {/* Logo & Brand */}
          <Link href="/signin" className="group flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#E87545] text-white">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tracking-tight text-[#18233A]">IHMS ERP</span>
                <span className="rounded-full border border-[#E87545]/30 bg-[#E87545]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#E87545]">
                  Onboarding
                </span>
              </div>
              <p className="text-[11px] font-semibold text-[#64748B]">Integrated Hostel Management System</p>
            </div>
          </Link>

          {/* Back to Sign In Link */}
          <Link
            href="/signin"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#CBD5E1] bg-white px-3.5 py-2 text-xs font-bold text-[#18233A] transition-colors hover:border-[#E87545] hover:text-[#E87545]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
          </Link>
        </div>

        {/* EXISTING HOSTEL ACCOUNT CARD (When Duplicate Owner Email Detected) */}
        {existingAccount ? (
          <div className="animate-fade-in mx-auto max-w-2xl space-y-6 rounded-xl border border-[#CBD5E1] bg-white p-7 sm:p-9">
            
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#E87545] text-white text-xl font-black">
                ⚠️
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[#18233A]">
                    Account Already Registered
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    {existingAccount.status || 'Active'}
                  </span>
                </div>
                <p className="text-xs font-medium text-[#64748B]">
                  This email is already associated with an IHMS hostel owner account.
                </p>
              </div>
            </div>

            {/* Structured Details Box */}
            <div className="space-y-4 rounded-2xl border border-[#CBD5E1] bg-[#F8FAFC] p-5 sm:p-6">
              
              {/* Highlighted OWNER ID Section */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-black uppercase tracking-wider text-[#64748B]">Owner ID</p>
                <div className="flex items-center justify-between rounded-xl border border-[#CBD5E1] bg-white p-3 sm:p-3.5">
                  <div>
                    <span className="font-mono font-black text-base sm:text-xl text-[#E87545] tracking-tight">
                      {existingAccount.ownerId}
                    </span>
                    <p className="text-[11px] font-semibold text-[#8C93A4]">Use this Owner ID or your email to sign in</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(existingAccount.ownerId, 'Owner ID')}
                    className="gap-1.5 h-8 sm:h-9 rounded-xl border-[#CBD5E1] bg-[#FFF8F5] text-xs font-bold text-[#E87545] hover:bg-[#FFEFE8] hover:border-[#E87545] cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#E4E0D7]">
                {/* Organization */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Organization / Hostel</p>
                  <p className="text-sm sm:text-base font-black text-[#18233A] mt-1">{existingAccount.organizationName}</p>
                </div>

                {/* Primary Branch & Location */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Primary Branch</p>
                  <p className="text-xs sm:text-sm font-bold text-[#18233A] mt-1">
                    {existingAccount.branchName} • {existingAccount.location.split(',')[0]}
                  </p>
                </div>

                {/* Registered Email */}
                <div className="sm:col-span-2 pt-2 border-t border-[#E4E0D7]/60">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Registered Email</p>
                  <p className="text-xs font-mono font-bold text-[#18233A] mt-0.5">{existingAccount.maskedEmail}</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Action 1: Sign in with Owner ID */}
                <Button
                  type="button"
                  onClick={() => router.push(`/signin?role=admin&identifier=${encodeURIComponent(existingAccount.ownerId)}`)}
                  className="h-12 w-full rounded-xl bg-[#E87545] hover:bg-[#D66434] text-xs sm:text-sm font-bold text-white transition-colors cursor-pointer gap-1.5"
                >
                  Sign In with Owner ID <ArrowRight className="h-4 w-4" />
                </Button>

                {/* Action 2: Forgot Password */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push(`/forgot-password?identifier=${encodeURIComponent(existingAccount.ownerId)}`)}
                  className="h-12 w-full rounded-xl border-[#CBD5E1] bg-white text-xs sm:text-sm font-bold text-[#18233A] hover:bg-[#FFF3EB] hover:border-[#E87545] hover:text-[#E87545] cursor-pointer"
                >
                  Forgot Password
                </Button>
              </div>

              {/* Action 3: Use Different Email */}
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setExistingAccount(null);
                    setError(null);
                    updateField('ownerEmail', '');
                  }}
                  className="text-xs font-bold text-[#64748B] hover:text-[#E87545] underline transition-colors cursor-pointer"
                >
                  ← Use Different Email for Registration
                </button>
              </div>
            </div>
          </div>
        ) : successData ? (
          /* SUCCESS STATE */
          <div className="animate-fade-in mx-auto max-w-2xl space-y-6 rounded-xl border border-[#CBD5E1] bg-white p-8 sm:p-10">
            <div className="text-center space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#18233A]">
                Registration Successful!
              </h2>
              <p className="text-sm font-medium text-[#64748B] max-w-md mx-auto">
                Your organization and first hostel branch have been established in IHMS ERP.
              </p>
            </div>

            {/* Permanent Credentials Summary Box */}
            <div className="space-y-4 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#CBD5E1] pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Permanent Owner ID</p>
                  <p className="text-2xl font-mono font-black text-[#E87545] tracking-tight">{successData.ownerId}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(successData.ownerId, 'Owner ID')}
                  className="gap-1.5 h-9 rounded-lg border-[#CBD5E1] bg-white text-xs font-bold text-[#18233A] hover:bg-[#FFF3EB] hover:border-[#E87545] hover:text-[#E87545]"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy Owner ID
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 text-xs">
                <div>
                  <span className="font-semibold text-[#64748B]">Organization ID:</span>
                  <p className="font-extrabold text-[#18233A] text-sm mt-0.5">{successData.orgCode || successData.organizationId}</p>
                </div>
                <div>
                  <span className="font-semibold text-[#64748B]">Hostel Branch:</span>
                  <p className="font-extrabold text-[#18233A] text-sm mt-0.5">{successData.hostelName} ({successData.hostelCode})</p>
                </div>
                <div>
                  <span className="font-semibold text-[#64748B]">Owner Name:</span>
                  <p className="font-extrabold text-[#18233A] text-sm mt-0.5">{successData.ownerName}</p>
                </div>
                <div>
                  <span className="font-semibold text-[#64748B]">Registered Email:</span>
                  <p className="font-extrabold text-[#18233A] text-sm mt-0.5">{successData.email}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[#E87545]/30 bg-[#FFF6F0] p-4 text-xs font-medium text-[#18233A]">
              💡 <span className="font-bold text-[#E87545]">Login Tip:</span> You can sign in using either your registered <strong className="text-[#E87545]">Email Address</strong> or your <strong className="text-[#E87545]">Owner ID ({successData.ownerId})</strong>.
            </div>

            <Button
              onClick={() => router.push('/signin')}
              className="h-12 w-full rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm font-bold text-white transition-colors gap-2"
            >
              Continue to Sign In <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          /* REGISTRATION FORM */
          <div className="space-y-6">
            
            {/* Header Title & Onboarding Progress */}
            <div className="text-center space-y-2">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#18233A]">
                Register Your Hostel
              </h1>
              <p className="text-sm font-medium text-[#64748B] max-w-lg mx-auto">
                Set up your master organization account and configure your first hostel branch in a few quick steps.
              </p>

              {/* Minimal Progress Steps */}
              <div className="inline-flex items-center gap-3 pt-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#E87545]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E87545] text-[10px] font-black text-white">1</span>
                  <span>Owner Account</span>
                </div>
                <span className="text-[#D5D1C8]">→</span>
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#E87545]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E87545] text-[10px] font-black text-white">2</span>
                  <span>Hostel Setup</span>
                </div>
                <span className="text-[#D5D1C8]">→</span>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#A8A29E]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#D5D1C8] bg-white text-[10px] font-bold text-[#A8A29E]">3</span>
                  <span>Ready</span>
                </div>
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-6">
              {/* SECTION 1: OWNER INFORMATION CARD */}
              <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-7 space-y-4 sm:space-y-5">
                
                {/* Section Title */}
                <div className="flex items-center gap-3 border-b border-[#CBD5E1] pb-3 sm:pb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF0E8] text-[#E87545] font-black text-sm border border-[#FDDCCE]">
                    1
                  </div>
                  <div>
                    <h2 className="text-base font-black text-[#18233A]">Owner Information</h2>
                    <p className="text-xs font-medium text-[#64748B]">Administrator credentials for system access and ownership controls</p>
                  </div>
                </div>

                {/* Form Fields Grid */}
                <div className="space-y-4">
                  {/* Row 1: Full Name | Phone Number */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="ownerName" className="text-xs font-bold text-[#18233A]">
                        Full Name <span className="text-[#E87545]">*</span>
                      </Label>
                      <Input
                        id="ownerName"
                        name="ownerName"
                        required
                        placeholder="e.g. Vikram Sharma"
                        value={form.ownerName || ''}
                        onChange={(e) => updateField('ownerName', e.target.value)}
                        className="h-11 rounded-xl border-[#CBD5E1] bg-[#FAFAF8] text-sm font-semibold text-[#18233A] placeholder:text-[#94A3B8] focus:border-[#E87545] focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="ownerPhone" className="text-xs font-bold text-[#18233A]">
                        Phone Number <span className="text-[#E87545]">*</span>
                      </Label>
                      <Input
                        id="ownerPhone"
                        name="ownerPhone"
                        required
                        type="tel"
                        placeholder="e.g. +91 98765 43210"
                        value={form.ownerPhone || ''}
                        onChange={(e) => updateField('ownerPhone', e.target.value)}
                        className="h-11 rounded-xl border-[#CBD5E1] bg-[#FAFAF8] text-sm font-semibold text-[#18233A] placeholder:text-[#94A3B8] focus:border-[#E87545] focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Row 2: Email | Password */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="ownerEmail" className="text-xs font-bold text-[#18233A]">
                        Email Address <span className="text-[#E87545]">*</span>
                      </Label>
                      <Input
                        id="ownerEmail"
                        name="ownerEmail"
                        required
                        type="email"
                        placeholder="e.g. vikram@hostelgroup.com"
                        value={form.ownerEmail || ''}
                        onChange={(e) => updateField('ownerEmail', e.target.value)}
                        className="h-11 rounded-xl border-[#CBD5E1] bg-[#FAFAF8] text-sm font-semibold text-[#18233A] placeholder:text-[#94A3B8] focus:border-[#E87545] focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-xs font-bold text-[#18233A]">
                          Password <span className="text-[#E87545]">*</span>
                        </Label>
                        <button
                          type="button"
                          onClick={() => setShowPw(!showPw)}
                          className="text-[11px] font-bold text-[#64748B] hover:text-[#E87545] transition-colors"
                        >
                          {showPw ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <Input
                        id="ownerPassword"
                        name="ownerPassword"
                        required
                        type={showPw ? 'text' : 'password'}
                        placeholder="At least 8 characters"
                        value={form.ownerPassword || ''}
                        onChange={(e) => updateField('ownerPassword', e.target.value)}
                        className="h-11 rounded-xl border-[#CBD5E1] bg-[#FAFAF8] text-sm font-semibold text-[#18233A] placeholder:text-[#94A3B8] focus:border-[#E87545] focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Row 3: Confirm Password */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="confirmPassword" className="text-xs font-bold text-[#18233A]">
                        Confirm Password <span className="text-[#E87545]">*</span>
                      </Label>
                      <Input
                        id="confirmPassword"
                        name="confirmPassword"
                        required
                        type={showPw ? 'text' : 'password'}
                        placeholder="Re-enter password"
                        value={confirmPassword || ''}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="h-11 rounded-xl border-[#CBD5E1] bg-[#FAFAF8] text-sm font-semibold text-[#18233A] placeholder:text-[#94A3B8] focus:border-[#E87545] focus:bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: HOSTEL & BRANCH DETAILS CARD */}
              <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-7 space-y-4 sm:space-y-5">
                
                {/* Section Title */}
                <div className="flex items-center gap-3 border-b border-[#CBD5E1] pb-3 sm:pb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF0E8] text-[#E87545] font-black text-sm border border-[#FDDCCE]">
                    2
                  </div>
                  <div>
                    <h2 className="text-base font-black text-[#18233A]">Hostel & Branch Details</h2>
                    <p className="text-xs font-medium text-[#64748B]">Organization identity and initial branch location details</p>
                  </div>
                </div>

                {/* Form Fields Grid */}
                <div className="space-y-4">
                  {/* Row 1: Hostel Name | Branch Name */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="hostelName" className="text-xs font-bold text-[#18233A]">
                        Hostel Name <span className="text-[#E87545]">*</span>
                      </Label>
                      <Input
                        id="hostelName"
                        name="hostelName"
                        required
                        placeholder="e.g. ABC Boys Hostel"
                        value={form.hostelName || ''}
                        onChange={(e) => updateField('hostelName', e.target.value)}
                        className="h-11 rounded-xl border-[#CBD5E1] bg-[#FAFAF8] text-sm font-semibold text-[#18233A] placeholder:text-[#94A3B8] focus:border-[#E87545] focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="branchName" className="text-xs font-bold text-[#18233A]">
                        Initial Branch Name <span className="text-[#E87545]">*</span>
                      </Label>
                      <Input
                        id="branchName"
                        name="branchName"
                        required
                        placeholder="e.g. Main Branch"
                        value={form.branchName || ''}
                        onChange={(e) => updateField('branchName', e.target.value)}
                        className="h-11 rounded-xl border-[#CBD5E1] bg-[#FAFAF8] text-sm font-semibold text-[#18233A] placeholder:text-[#94A3B8] focus:border-[#E87545] focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Row 2: Hostel Type | City | State */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="hostelType" className="text-xs font-bold text-[#18233A]">
                        Hostel Type <span className="text-[#E87545]">*</span>
                      </Label>
                      <select
                        id="hostelType"
                        name="hostelType"
                        value={form.hostelType || 'BOYS'}
                        onChange={(e) => updateField('hostelType', e.target.value as any)}
                        className="flex h-11 w-full rounded-xl border border-[#CBD5E1] bg-[#FAFAF8] px-3 py-2 text-sm font-semibold text-[#18233A] focus:border-[#E87545] focus:outline-none focus:bg-white cursor-pointer"
                      >
                        <option value="BOYS">Boys Hostel</option>
                        <option value="GIRLS">Girls Hostel</option>
                        <option value="CO_ED">Co-Ed Hostel</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="city" className="text-xs font-bold text-[#18233A]">
                        City <span className="text-[#E87545]">*</span>
                      </Label>
                      <Input
                        id="city"
                        name="city"
                        required
                        placeholder="e.g. Hyderabad"
                        value={form.city || ''}
                        onChange={(e) => updateField('city', e.target.value)}
                        className="h-11 rounded-xl border-[#CBD5E1] bg-[#FAFAF8] text-sm font-semibold text-[#18233A] placeholder:text-[#94A3B8] focus:border-[#E87545] focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="state" className="text-xs font-bold text-[#18233A]">
                        State <span className="text-[#E87545]">*</span>
                      </Label>
                      <Input
                        id="state"
                        name="state"
                        required
                        placeholder="e.g. Telangana"
                        value={form.state || ''}
                        onChange={(e) => updateField('state', e.target.value)}
                        className="h-11 rounded-xl border-[#CBD5E1] bg-[#FAFAF8] text-sm font-semibold text-[#18233A] placeholder:text-[#94A3B8] focus:border-[#E87545] focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Row 3: Street Address | Pincode */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="address" className="text-xs font-bold text-[#18233A]">
                        Street Address
                      </Label>
                      <Input
                        id="address"
                        name="address"
                        placeholder="e.g. Plot 42, Hitech City Main Road, Madhapur"
                        value={form.address || ''}
                        onChange={(e) => updateField('address', e.target.value)}
                        className="h-11 rounded-xl border-[#CBD5E1] bg-[#FAFAF8] text-sm font-semibold text-[#18233A] placeholder:text-[#94A3B8] focus:border-[#E87545] focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="pincode" className="text-xs font-bold text-[#18233A]">
                        Pincode
                      </Label>
                      <Input
                        id="pincode"
                        name="pincode"
                        placeholder="e.g. 500081"
                        value={form.pincode || ''}
                        onChange={(e) => updateField('pincode', e.target.value)}
                        className="h-11 rounded-xl border-[#CBD5E1] bg-[#FAFAF8] text-sm font-semibold text-[#18233A] placeholder:text-[#94A3B8] focus:border-[#E87545] focus:bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Error Message Display */}
              {error && (
                <div className="animate-fade-in rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                    <span>{error}</span>
                  </div>
                </div>
              )}

              {/* SUBMIT BUTTON */}
              <Button
                type="submit"
                className="h-12 w-full rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm sm:text-base font-bold text-white transition-colors cursor-pointer"
                disabled={loading}
              >
                {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin text-white" /> : <Building2 className="mr-2 h-5 w-5 text-white" />}
                Register Hostel & Create Account
              </Button>
            </form>

            {/* Bottom Footer Link */}
            <p className="text-center text-xs font-medium text-[#64748B] pt-2">
              Already have an account?{' '}
              <Link href="/login" className="font-bold text-[#E87545] hover:underline">
                Sign In
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
