'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  KeyRound,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/lib/api/auth.api';
import type { ApiError } from '@/lib/types';

type Step = 'IDENTIFY' | 'OTP' | 'NEW_PASSWORD' | 'SUCCESS';

function ForgotPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>('IDENTIFY');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const param = searchParams.get('identifier') || searchParams.get('email') || searchParams.get('ownerId');
    if (param) {
      setIdentifier(param);
    }
  }, [searchParams]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Step 1: Request OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Please enter your Student ID or Email Address.');
      return;
    }
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const res = await authApi.requestPasswordResetOtp(identifier.trim());
      setNotice(res.message || 'If an account exists for this email or ID, a verification code has been sent.');
      setCooldown(60);
      setStep('OTP');
    } catch (err) {
      setError((err as ApiError)?.message || 'Failed to request password reset code.');
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (cooldown > 0 || resending) return;
    setError(null);
    setNotice(null);
    setResending(true);

    try {
      const res = await authApi.resendPasswordResetOtp(identifier.trim());
      setNotice(res.message || 'A new verification code has been sent.');
      setCooldown(60);
    } catch (err) {
      setError((err as ApiError)?.message || 'Failed to resend verification code. Please wait.');
    } finally {
      setResending(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) {
      setError('Please enter the 6-digit verification code sent to your email.');
      return;
    }
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const res = await authApi.verifyPasswordResetOtp(identifier.trim(), otp.trim());
      if (res.resetToken) {
        setResetToken(res.resetToken);
        setStep('NEW_PASSWORD');
      } else {
        setError('Verification succeeded but reset authorization was missing. Please try again.');
      }
    } catch (err) {
      setError((err as ApiError)?.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Create New Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('New Password and Confirm Password do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError('Password must contain at least one uppercase letter (A-Z).');
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setError('Password must contain at least one lowercase letter (a-z).');
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setError('Password must contain at least one number (0-9).');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.resetPasswordWithToken(resetToken, newPassword, confirmPassword);
      setNotice(res.message || 'Password changed successfully. Please sign in with your new password.');
      setStep('SUCCESS');
    } catch (err) {
      setError((err as ApiError)?.message || 'Failed to reset password. Session may have expired.');
    } finally {
      setLoading(false);
    }
  };

  // Password Strength Validations
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] px-3.5 py-6 sm:py-10 selection:bg-[#E87545] selection:text-white">
      <div className="w-full max-w-md space-y-4 sm:space-y-5 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-7">

        {/* Header */}
        <div className="space-y-1.5 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-[#E87545] text-white">
            <Building2 className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-[#111827] sm:text-2xl">
            {step === 'IDENTIFY' && 'Forgot Password'}
            {step === 'OTP' && 'Verify Security Code'}
            {step === 'NEW_PASSWORD' && 'Create New Password'}
            {step === 'SUCCESS' && 'Password Changed!'}
          </h1>
          <p className="text-xs font-medium text-[#64748B] sm:text-sm">
            {step === 'IDENTIFY' && 'Enter your Student ID or registered Email Address to receive a verification code.'}
            {step === 'OTP' && 'Enter the 6-digit verification code sent to your registered email.'}
            {step === 'NEW_PASSWORD' && 'Set a strong password for your IHMS account.'}
            {step === 'SUCCESS' && 'Your password has been updated securely.'}
          </p>
        </div>

        {/* Notice Message */}
        {notice && step !== 'SUCCESS' && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800 flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            <span className="leading-tight">{notice}</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-800 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <span className="leading-tight">{error}</span>
          </div>
        )}

        {/* STEP 1: IDENTIFY ACCOUNT */}
        {step === 'IDENTIFY' && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="identifier" className="text-xs font-bold text-[#111827]">
                Registered Email Address or Student ID
              </Label>
              <div className="relative">
                <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <KeyRound className="h-4 w-4" />
                </div>
                <Input
                  id="identifier"
                  type="text"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="e.g. owner@ihms.com or STU20260001"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="h-11 rounded-xl border-[#E5E7EB] bg-white pl-10 pr-3.5 text-sm font-semibold text-[#111827] placeholder:text-[#94A3B8] placeholder:font-normal focus:border-[#E87545] focus:ring-2 focus:ring-[#E87545]/20 focus:bg-white transition-all"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm font-bold text-white transition-colors cursor-pointer mt-2"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" /> : null}
              <span>Send Verification Code</span>
            </Button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748B] hover:text-[#111827]"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
              </Link>
            </div>
          </form>
        )}

        {/* STEP 2: VERIFY OTP */}
        {step === 'OTP' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="otp" className="text-xs font-bold text-[#111827]">
                6-Digit Verification Code (OTP)
              </Label>
              <div className="relative">
                <Input
                  id="otp"
                  type="text"
                  required
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="h-12 text-center text-xl font-bold tracking-widest rounded-xl border-[#E5E7EB] bg-white text-[#111827] placeholder:text-[#94A3B8] focus:border-[#E87545] focus:ring-2 focus:ring-[#E87545]/20 focus:bg-white transition-all font-mono"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm font-bold text-white transition-colors cursor-pointer mt-2"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" /> : null}
              <span>Verify Code</span>
            </Button>

            {/* Resend OTP Section */}
            <div className="flex items-center justify-between pt-2 text-xs font-semibold text-[#64748B]">
              <button
                type="button"
                onClick={() => {
                  setStep('IDENTIFY');
                  setError(null);
                  setNotice(null);
                }}
                className="hover:text-[#111827] underline"
              >
                Change Email / ID
              </button>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={cooldown > 0 || resending}
                className="inline-flex items-center gap-1.5 text-[#E87545] disabled:text-[#94A3B8] hover:underline disabled:no-underline cursor-pointer"
              >
                {resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}</span>
              </button>
            </div>

            <div className="text-center pt-2 border-t border-[#E5E7EB]">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748B] hover:text-[#111827]"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
              </Link>
            </div>
          </form>
        )}

        {/* STEP 3: CREATE NEW PASSWORD */}
        {step === 'NEW_PASSWORD' && (
          <form onSubmit={handleResetPassword} className="space-y-4">

            {/* New Password */}
            <div className="space-y-1.5">
              <Label htmlFor="newPassword" className="text-xs font-bold text-[#111827]">
                New Password
              </Label>
              <div className="relative">
                <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <Input
                  id="newPassword"
                  type={showNewPw ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-11 rounded-xl border-[#E5E7EB] bg-white pl-10 pr-10 text-sm font-semibold text-[#111827] focus:border-[#E87545] focus:ring-2 focus:ring-[#E87545]/20 focus:bg-white transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#111827] p-1"
                >
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-xs font-bold text-[#111827]">
                Confirm New Password
              </Label>
              <div className="relative">
                <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <Input
                  id="confirmPassword"
                  type={showConfirmPw ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11 rounded-xl border-[#E5E7EB] bg-white pl-10 pr-10 text-sm font-semibold text-[#111827] focus:border-[#E87545] focus:ring-2 focus:ring-[#E87545]/20 focus:bg-white transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#111827] p-1"
                >
                  {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Password Requirement Indicators */}
            <div className="space-y-1.5 rounded-xl border border-[#E5E7EB] bg-[#F9F8F6] p-3 text-[11px] font-semibold text-[#64748B]">
              <p className="font-bold text-[#111827] mb-1">Password Requirements:</p>
              <div className="grid grid-cols-2 gap-1.5">
                <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                  {hasMinLength ? <Check className="h-3 w-3 stroke-[3]" /> : <X className="h-3 w-3" />}
                  <span>At least 8 characters</span>
                </div>
                <div className={`flex items-center gap-1.5 ${hasUppercase ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                  {hasUppercase ? <Check className="h-3 w-3 stroke-[3]" /> : <X className="h-3 w-3" />}
                  <span>1 uppercase letter (A-Z)</span>
                </div>
                <div className={`flex items-center gap-1.5 ${hasLowercase ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                  {hasLowercase ? <Check className="h-3 w-3 stroke-[3]" /> : <X className="h-3 w-3" />}
                  <span>1 lowercase letter (a-z)</span>
                </div>
                <div className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                  {hasNumber ? <Check className="h-3 w-3 stroke-[3]" /> : <X className="h-3 w-3" />}
                  <span>1 number (0-9)</span>
                </div>
                <div className={`flex items-center gap-1.5 col-span-2 ${passwordsMatch ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                  {passwordsMatch ? <Check className="h-3 w-3 stroke-[3]" /> : <X className="h-3 w-3" />}
                  <span>Passwords match</span>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !hasMinLength || !hasUppercase || !hasLowercase || !hasNumber || !passwordsMatch}
              className="h-12 w-full rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm font-bold text-white transition-colors cursor-pointer mt-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" /> : null}
              <span>Update Password</span>
            </Button>
          </form>
        )}

        {/* STEP 4: SUCCESS */}
        {step === 'SUCCESS' && (
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-10 w-10 stroke-[2.5]" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#111827]">Password Changed Successfully</h2>
              <p className="text-xs text-[#64748B]">Please sign in with your new password.</p>
            </div>
            <Button
              onClick={() => router.push('/login')}
              className="h-12 w-full rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm font-bold text-white transition-colors cursor-pointer"
            >
              Return to Sign In
            </Button>
          </div>
        )}

        {/* Footer Security Notice */}
        <div className="border-t border-[#E5E7EB] pt-4 text-center">
          <p className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-[#78716C]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#087A45]" />
            <span>Encrypted with 256-bit authentication security</span>
          </p>
        </div>

      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5F3EF]">
          <Loader2 className="h-8 w-8 animate-spin text-[#E87545]" />
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
