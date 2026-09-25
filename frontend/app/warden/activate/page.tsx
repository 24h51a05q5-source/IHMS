'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck, User, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle,
  Sparkles, ArrowRight, ArrowLeft, RotateCcw, Building2, CheckCircle2
} from 'lucide-react';
import { authApi } from '@/lib/api/auth.api';
import { setTokens } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type WardenActivationStep = 'EMAIL' | 'OTP' | 'TERMS' | 'CREATE_PASSWORD' | 'ALREADY_ACTIVATED';

function WardenActivationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get('email') || searchParams.get('identifier') || '';

  const [step, setStep] = useState<WardenActivationStep>('EMAIL');
  const [email, setEmail] = useState(initialEmail);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [wardenName, setWardenName] = useState('');

  // OTP State (6 digits)
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Password & Terms State
  const [activationToken, setActivationToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);

  // Timer & Cooldown
  const [cooldown, setCooldown] = useState(0);

  // Feedback State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 'OTP' || cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [step, cooldown]);

  const clearMessages = () => {
    setError(null);
    setNotice(null);
  };

  // ── Step 1: Send OTP ───────────────────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) return;

    clearMessages();
    setLoading(true);

    try {
      const res = await authApi.sendWardenOtp(cleanEmail);
      if (res.alreadyActivated) {
        setNotice(res.message || 'Your Warden account is already activated. Please sign in with your email and password.');
        setStep('ALREADY_ACTIVATED');
        return;
      }

      setMaskedEmail(res.maskedEmail || cleanEmail);
      if (res.name) setWardenName(res.name);
      setNotice(res.message || `Verification code sent to ${res.maskedEmail || cleanEmail}.`);
      setCooldown(res.cooldownSeconds || 60);
      setStep('OTP');
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      setError(err?.message || 'Access denied or Warden account not found. Please verify your email or contact your hostel owner.');
    } finally {
      setLoading(false);
    }
  };

  // ── OTP Handlers ───────────────────────────────────────────────────────────
  const handleDigitChange = (index: number, val: string) => {
    const cleaned = val.replace(/\D/g, '');
    if (!cleaned) {
      const next = [...otpDigits];
      next[index] = '';
      setOtpDigits(next);
      return;
    }
    if (cleaned.length > 1) {
      const next = [...otpDigits];
      for (let i = 0; i < cleaned.length && index + i < 6; i++) {
        next[index + i] = cleaned[i];
      }
      setOtpDigits(next);
      const nextFocus = Math.min(5, index + cleaned.length);
      otpInputRefs.current[nextFocus]?.focus();
      return;
    }
    const next = [...otpDigits];
    next[index] = cleaned[0];
    setOtpDigits(next);
    clearMessages();
    if (index < 5) otpInputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasteData) return;
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < Math.min(6, pasteData.length); i++) {
      next[i] = pasteData[i];
    }
    setOtpDigits(next);
    clearMessages();
    const focusIndex = Math.min(5, pasteData.length);
    otpInputRefs.current[focusIndex]?.focus();
  };

  const otpCode = otpDigits.join('');

  // ── Step 2: Verify OTP ─────────────────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (otpCode.length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.verifyWardenActivationOtp(email.trim(), otpCode);
      setActivationToken(res.activationToken);
      setNotice(res.message || 'Verification successful! Please review and agree to the Warden Terms & Conditions.');
      setStep('TERMS');
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldown > 0) return;
    clearMessages();
    setLoading(true);
    try {
      const res = await authApi.resendWardenActivationOtp(email.trim());
      setNotice(res.message || 'A new verification code has been sent to your email.');
      setOtpDigits(['', '', '', '', '', '']);
      setCooldown(60);
      otpInputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err?.message || 'Failed to resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Terms Agreement ───────────────────────────────────────────────
  const handleAcceptTermsStep = (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!agreeToTerms) {
      setError('You must read and agree to the Warden Terms & Conditions to proceed.');
      return;
    }
    setStep('CREATE_PASSWORD');
    setNotice('Terms agreed! Please set your new account password.');
  };

  // ── Step 4: Set Password & Activate ───────────────────────────────────────
  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!agreeToTerms) {
      setError('You must accept the Warden Terms & Conditions to activate your account.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError('Password must contain at least one uppercase letter.');
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setError('Password must contain at least one lowercase letter.');
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setError('Password must contain at least one number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.activateWardenAccount(activationToken, newPassword, confirmPassword, agreeToTerms);
      if (res.accessToken) {
        setTokens(res.accessToken, res.refreshToken);
      }
      setNotice('Warden account activated successfully! Redirecting to Warden Dashboard...');
      setTimeout(() => {
        window.location.href = '/warden/dashboard';
      }, 800);
    } catch (err: any) {
      setError(err?.message || 'Failed to activate Warden account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F3F1EC] p-4 text-[#111827]">
      <div className="w-full max-w-[430px] space-y-4">
        {/* Top Brand Logo */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#18233A] text-white shadow-md border border-[#283754]">
            <ShieldCheck className="h-6 w-6 text-[#38BDF8]" />
          </div>
          <h1 className="text-2xl font-black text-[#111827]">Warden Account Activation</h1>
          <p className="text-xs font-semibold text-[#64748B]">Integrated Hostel Management System (IHMS ERP)</p>
        </div>

        <div className="rounded-2xl border border-[#CBD5E1] bg-white p-6 sm:p-7 space-y-5 shadow-sm">
          {/* Progress Indicator */}
          {step !== 'ALREADY_ACTIVATED' && (
            <div className="flex items-center justify-between text-xs font-bold text-[#64748B] border-b border-slate-100 pb-3">
              <span className={step === 'EMAIL' ? 'text-[#E87545] font-black' : 'text-emerald-600'}>1. Email</span>
              <span>→</span>
              <span className={step === 'OTP' ? 'text-[#E87545] font-black' : step === 'TERMS' || step === 'CREATE_PASSWORD' ? 'text-emerald-600' : ''}>2. OTP</span>
              <span>→</span>
              <span className={step === 'TERMS' ? 'text-[#E87545] font-black' : step === 'CREATE_PASSWORD' ? 'text-emerald-600' : ''}>3. Terms</span>
              <span>→</span>
              <span className={step === 'CREATE_PASSWORD' ? 'text-[#E87545] font-black' : ''}>4. Password</span>
            </div>
          )}

          {/* Feedback Alerts */}
          {notice && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-900 flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{notice}</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span className="leading-tight">{error}</span>
            </div>
          )}

          {/* STEP: ALREADY ACTIVATED */}
          {step === 'ALREADY_ACTIVATED' && (
            <div className="space-y-4 text-center py-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-[#111827]">Account Already Activated</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Your Warden account for <span className="font-semibold text-slate-900">{email}</span> is already activated and has a password set. You do not need to activate again.
                </p>
              </div>

              <div className="pt-2 space-y-3">
                <Link
                  href={`/login?role=warden&email=${encodeURIComponent(email)}`}
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm font-bold text-white shadow-sm transition-colors"
                >
                  Go to Warden Sign In <ArrowRight className="h-4 w-4 ml-2" />
                </Link>

                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('EMAIL');
                      clearMessages();
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800"
                  >
                    ← Try another email
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 1: Enter Registered Email */}
          {step === 'EMAIL' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wardenEmailInput" className="text-xs font-bold text-[#111827]">
                  Registered Warden Email Address
                </Label>
                <div className="relative flex items-center">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                  <Input
                    id="wardenEmailInput"
                    type="email"
                    required
                    autoFocus
                    placeholder="e.g. warden@hostel.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearMessages();
                    }}
                    style={{ paddingLeft: '42px' }}
                    className="h-11 w-full box-border rounded-xl border-[#E5E7EB] bg-white text-sm font-semibold focus:border-[#E87545]"
                  />
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  Enter the email address registered by your Hostel Owner.
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading || !email.trim()}
                className="h-11 w-full rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm font-bold text-white shadow-sm"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Send Activation OTP
              </Button>

              <div className="text-center pt-2">
                <Link href="/login?role=warden" className="text-xs font-bold text-slate-500 hover:text-slate-800">
                  ← Back to Warden Sign In
                </Link>
              </div>
            </form>
          )}

          {/* STEP 2: Enter 6-Digit OTP */}
          {step === 'OTP' && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs space-y-1">
                <p className="font-bold text-emerald-900">
                  Verification OTP sent to: <span className="font-mono text-emerald-950 font-extrabold">{maskedEmail}</span>
                </p>
                <p className="text-[11px] text-emerald-700">Code is valid for 10 minutes.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-[#111827] text-center block">
                  Enter 6-Digit Verification Code
                </Label>
                <div className="flex items-center justify-center gap-2" onPaste={handlePaste}>
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => { otpInputRefs.current[idx] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      className="h-12 w-11 text-center text-xl font-black font-mono rounded-xl border border-[#CBD5E1] bg-white focus:border-[#E87545] focus:ring-2 focus:ring-[#E87545]/20 focus:outline-none"
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setStep('EMAIL')}
                  className="font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <button
                  type="button"
                  disabled={cooldown > 0 || loading}
                  onClick={handleResendOtp}
                  className="font-bold text-[#E87545] hover:underline disabled:opacity-50 flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                </button>
              </div>

              <Button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="h-11 w-full rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm font-bold text-white shadow-sm"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Verify OTP'}
              </Button>
            </form>
          )}

          {/* STEP 3: Review & Agree to Warden Terms */}
          {step === 'TERMS' && (
            <form onSubmit={handleAcceptTermsStep} className="space-y-4">
              <div className="rounded-xl border border-purple-200 bg-purple-50/80 p-3.5 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-900">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-purple-700" />
                  Warden Operational Terms & Conditions
                </div>
                <p className="text-[11px] font-medium text-purple-700">
                  Please review the operational terms, confidentiality duties, and scope limits of your Warden role.
                </p>
              </div>

              <div className="rounded-xl border border-[#CBD5E1] bg-[#F8F7F4] p-4 space-y-3">
                <div className="space-y-1.5 text-xs text-[#111827] leading-relaxed">
                  <p className="font-bold text-sm">Key Warden Clauses:</p>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 text-xs">
                    <li>Warden access is created & authorized by the Hostel Owner.</li>
                    <li>Access is limited strictly to assigned branches and operational duties.</li>
                    <li>Financial, banking, and Cashfree KYC settings cannot be altered by Wardens.</li>
                    <li>Student personal records and contact data must be kept confidential.</li>
                  </ul>
                </div>

                <div className="pt-2 border-t border-[#CBD5E1]">
                  <label htmlFor="wAgreeToTerms" className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      id="wAgreeToTerms"
                      checked={agreeToTerms}
                      onChange={(e) => {
                        setAgreeToTerms(e.target.checked);
                        clearMessages();
                      }}
                      className="mt-0.5 h-4 w-4 rounded border-[#CBD5E1] text-[#E87545] focus:ring-[#E87545] cursor-pointer accent-[#E87545]"
                    />
                    <div className="text-xs font-semibold text-[#111827] leading-relaxed">
                      I have read and agree to the{' '}
                      <Link
                        href="/terms?role=warden"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-[#E87545] hover:underline underline-offset-2"
                      >
                        Warden Terms & Conditions
                      </Link>
                      .
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => setStep('OTP')}
                  className="font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
              </div>

              <Button
                type="submit"
                disabled={!agreeToTerms}
                className="h-11 w-full rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm font-bold text-white shadow-sm disabled:opacity-50"
              >
                Continue to Set Password <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </form>
          )}

          {/* STEP 4: Create & Confirm Password */}
          {step === 'CREATE_PASSWORD' && (
            <form onSubmit={handleActivate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wNewPw" className="text-xs font-bold text-[#111827]">
                  New Password <span className="text-rose-500">*</span>
                </Label>
                <div className="relative flex items-center">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                  <Input
                    id="wNewPw"
                    type={showNewPw ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); clearMessages(); }}
                    style={{ paddingLeft: '42px', paddingRight: '42px' }}
                    className="h-11 w-full box-border rounded-xl border-[#E5E7EB] bg-white text-sm font-mono font-semibold focus:border-[#E87545]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wConfPw" className="text-xs font-bold text-[#111827]">
                  Confirm Password <span className="text-rose-500">*</span>
                </Label>
                <div className="relative flex items-center">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                  <Input
                    id="wConfPw"
                    type={showConfirmPw ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); clearMessages(); }}
                    style={{ paddingLeft: '42px', paddingRight: '42px' }}
                    className="h-11 w-full box-border rounded-xl border-[#E5E7EB] bg-white text-sm font-mono font-semibold focus:border-[#E87545]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Password Requirements Checklist */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1 text-[11px] font-semibold text-slate-600">
                <p className="font-bold text-slate-800">Password Requirements:</p>
                <p className={newPassword.length >= 8 ? 'text-emerald-700' : 'text-slate-500'}>
                  {newPassword.length >= 8 ? '✓' : '•'} At least 8 characters
                </p>
                <p className={/[A-Z]/.test(newPassword) ? 'text-emerald-700' : 'text-slate-500'}>
                  {/[A-Z]/.test(newPassword) ? '✓' : '•'} At least one uppercase letter (A-Z)
                </p>
                <p className={/[a-z]/.test(newPassword) ? 'text-emerald-700' : 'text-slate-500'}>
                  {/[a-z]/.test(newPassword) ? '✓' : '•'} At least one lowercase letter (a-z)
                </p>
                <p className={/[0-9]/.test(newPassword) ? 'text-emerald-700' : 'text-slate-500'}>
                  {/[0-9]/.test(newPassword) ? '✓' : '•'} At least one number (0-9)
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading || !newPassword || newPassword !== confirmPassword}
                className="h-11 w-full rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm font-bold text-white shadow-sm"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Set Password & Activate'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WardenActivationPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-4">Loading...</div>}>
      <WardenActivationForm />
    </Suspense>
  );
}
