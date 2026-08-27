'use client';

import { useEffect, useState, useRef, Suspense, Component, type ErrorInfo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  Lock,
  User,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
  GraduationCap,
  ShieldCheck,
  Check,
  KeyRound,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Mail,
  Send,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { authApi } from '@/lib/api/auth.api';
import { setTokens } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// ─── Student Flow Steps ──────────────────────────────────────────────────────
//  STEP 1: IDENTIFIER       → Enter Student ID or Email → [Send OTP]
//  STEP 2: OTP              → 6-Digit Code verification → [Verify OTP]
//  STEP 3: CREATE_PASSWORD  → Create & Confirm password → [Create Password & Continue]
//  STEP 4: SIGN_IN          → Normal Password Login (for already active accounts)
type StudentStep = 'IDENTIFIER' | 'OTP' | 'CREATE_PASSWORD' | 'SIGN_IN';

// Mask email: s*****@gmail.com
function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return 's*****@gmail.com';
  const [local, domain] = email.split('@');
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(4, local.length - 2))}@${domain}`;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, login, loading: authLoading } = useAuth();
  const [loginType, setLoginType] = useState<'STUDENT' | 'ADMIN'>('STUDENT');

  // ── Shared inputs ──────────────────────────────────────────────────────────
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  // ── Student Multi-Step ─────────────────────────────────────────────────────
  const [studentStep, setStudentStep] = useState<StudentStep>('IDENTIFIER');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [activationToken, setActivationToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // ── OTP Resend Cooldown ────────────────────────────────────────────────────
  const [cooldown, setCooldown] = useState(0);

  // ── UI Feedback ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── URL Params ─────────────────────────────────────────────────────────────
  const isExpired = searchParams.get('expired') === 'true';
  const paramRole = searchParams.get('role');
  const paramIdentifier =
    searchParams.get('identifier') || searchParams.get('email') || searchParams.get('ownerId');

  useEffect(() => {
    if (paramRole === 'admin') setLoginType('ADMIN');
    else if (paramRole === 'student') setLoginType('STUDENT');
    if (paramIdentifier) setIdentifier(paramIdentifier);
  }, [paramRole, paramIdentifier]);

  // Cooldown countdown timer
  useEffect(() => {
    let t: NodeJS.Timeout;
    if (cooldown > 0) t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      if (user.mustChangePassword) router.replace('/student/change-password');
      else router.replace(user.role === 'STUDENT' ? '/student/dashboard' : user.role === 'PARENT' ? '/parent' : '/dashboard');
    }
  }, [user, authLoading, router]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const clearMessages = () => {
    setError(null);
    setNotice(null);
  };

  const resetToIdentifier = () => {
    setStudentStep('IDENTIFIER');
    setPassword('');
    setOtpDigits(['', '', '', '', '', '']);
    setNewPassword('');
    setConfirmPassword('');
    setActivationToken('');
    setMaskedEmail('');
    setCooldown(0);
    clearMessages();
  };

  const handleTabChange = (type: 'STUDENT' | 'ADMIN') => {
    if (loginType === type) return;
    setLoginType(type);
    setIdentifier('');
    resetToIdentifier();
  };

  // ── 6-Digit OTP Box Handlers ───────────────────────────────────────────────
  const handleOtpDigitChange = (index: number, val: string) => {
    const cleaned = val.replace(/\D/g, '');
    if (!cleaned) {
      const next = [...otpDigits];
      next[index] = '';
      setOtpDigits(next);
      return;
    }

    if (cleaned.length > 1) {
      // Pasted multiple digits
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

    if (index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
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

  const currentOtpString = otpDigits.join('');

  // ── STEP 1: Check Status & Send OTP / Show Password ────────────────────────
  const onSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = identifier.trim();
    if (!cleanId) return;

    clearMessages();
    setLoading(true);

    try {
      const res = await authApi.sendStudentOtp(cleanId);
      const isAlreadyActive = Boolean(res?.alreadyActivated || res?.requiresPassword || res?.status === 'ACTIVATED');

      if (isAlreadyActive) {
        setNotice(res?.message || 'Your account is already activated. Please enter your password to sign in.');
        setStudentStep('SIGN_IN');
        return;
      }

      const emailToMask = res?.maskedEmail || maskEmail(res?.email || cleanId);
      setMaskedEmail(emailToMask);
      setNotice(res?.message || `Verification code sent to ${emailToMask}.`);
      setOtpDigits(['', '', '', '', '', '']);
      setStudentStep('OTP');
      setCooldown(60);
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      const msg = err?.message || 'Unable to check student account status. Please check your Student ID or email.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── STEP 2: Resend OTP ─────────────────────────────────────────────────────
  const onResendOtp = async () => {
    if (cooldown > 0) return;
    clearMessages();
    setLoading(true);

    try {
      const res = await authApi.sendStudentOtp(identifier.trim());
      const emailToMask = res?.maskedEmail || maskEmail(res?.email || identifier.trim());
      setMaskedEmail(emailToMask);
      setNotice(res?.message || 'A new 6-digit verification code has been sent to your registered email.');
      setOtpDigits(['', '', '', '', '', '']);
      setCooldown(60);
      otpInputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err?.message || 'Failed to resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  // ── STEP 2: Verify OTP ─────────────────────────────────────────────────────
  const onVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (currentOtpString.length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.verifyActivationOtp(identifier.trim(), currentOtpString);
      setActivationToken(res?.activationToken || (res as any)?.token || '');
      setNotice(res?.message || 'Verification successful! Please create your new password.');
      setStudentStep('CREATE_PASSWORD');
    } catch (err: any) {
      const msg = err?.message || 'Invalid or expired verification code. Please try again or request a new code.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── STEP 3: Create Password & Activate ─────────────────────────────────────
  const onActivateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

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
      setError('Password and Confirm Password do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.activateStudentAccount(activationToken, newPassword, confirmPassword);
      const token = res?.accessToken || (res as any)?.token;
      const refreshToken = res?.refreshToken;
      if (token) {
        setTokens(token, refreshToken);
      }
      setNotice('Account activated successfully! Redirecting to your dashboard...');
      setTimeout(() => {
        window.location.href = '/student/dashboard';
      }, 500);
    } catch (err: any) {
      setError(err?.message || 'Failed to activate account. Please verify your details.');
    } finally {
      setLoading(false);
    }
  };

  // ── Student Sign In (Already Activated Accounts) ───────────────────────────
  const onStudentSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      await login(identifier.trim(), password, 'STUDENT');
      router.replace('/student/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Incorrect password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Admin / Staff Sign In ──────────────────────────────────────────────────
  const onAdminSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      await login(identifier.trim(), password, 'ADMIN');
    } catch (err: any) {
      setError(err?.message || 'Invalid Admin / Staff credentials.');
    } finally {
      setLoading(false);
    }
  };

  // ── Password Strength Validation ───────────────────────────────────────────
  const pwMinLen = newPassword.length >= 8;
  const pwUpper = /[A-Z]/.test(newPassword);
  const pwLower = /[a-z]/.test(newPassword);
  const pwNum = /[0-9]/.test(newPassword);
  const pwMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const pwValid = pwMinLen && pwUpper && pwLower && pwNum && pwMatch;

  // ── Titles & Subtitles ─────────────────────────────────────────────────────
  const studentMeta: Record<StudentStep, { title: string; subtitle: string }> = {
    IDENTIFIER: {
      title: 'Student Login',
      subtitle: 'Enter your Student ID or registered email to receive an activation OTP.',
    },
    OTP: {
      title: 'Verify OTP',
      subtitle: 'We sent a verification code to your registered email.',
    },
    CREATE_PASSWORD: {
      title: 'Create Your Password',
      subtitle: 'Create and confirm your password to complete account activation.',
    },
    SIGN_IN: {
      title: 'Student Sign In',
      subtitle: 'Enter your password to sign in to your student portal.',
    },
  };

  const meta = loginType === 'ADMIN'
    ? { title: 'Admin / Staff Sign In', subtitle: 'Access your IHMS admin portal.' }
    : (studentMeta[studentStep] || { title: 'Student Portal', subtitle: 'Enter your Student ID or registered email to continue.' });

  return (
    <div className="flex min-h-screen flex-col lg:flex-row bg-[#F3F1EC] text-[#111827] selection:bg-[#E87545] selection:text-white">

      {/* ─── LEFT: Promotional Brand Panel ─────────────────────────────────── */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-[#18233A] p-10 lg:p-12 xl:p-16 text-white lg:flex border-r border-[#243048]">
        {/* Top Logo & System Title */}
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E87545] text-white">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white leading-tight">IHMS ERP</h1>
            <p className="text-xs font-semibold text-[#8A8F9E]">Integrated Hostel Management System</p>
          </div>
        </div>

        {/* Grouped Center Content */}
        <div className="relative z-10 max-w-lg space-y-6 my-auto py-8">
          <div className="space-y-3">
            <h2 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl xl:text-[38px] xl:leading-[1.2]">
              Everything your hostel<br />
              needs, in <span className="text-[#E87545]">one place.</span>
            </h2>
            <p className="text-sm font-medium leading-relaxed text-[#9DA3B4]">
              IHMS ERP simplifies hostel operations by bringing accommodation, student management, attendance, fees, finance, and daily activities into one integrated platform.
            </p>
          </div>

          <div className="space-y-3 pt-1">
            {[
              'Centralized Hostel Management',
              'Student, Room & Accommodation Management',
              'Fees, Finance & Payment Management',
              'Attendance, Announcements & Daily Operations',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-xs font-bold text-[#D0D4E0]">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E87545]/20 text-[#E87545]">
                  <Check className="h-3 w-3 stroke-[3]" />
                </div>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="relative z-10 flex items-center justify-between text-xs font-medium text-[#7E8494] pt-5 border-t border-white/10">
          <span>Integrated Hostel Management System</span>
          <Link href="/register" className="font-bold text-[#E87545] hover:underline">Register your organization →</Link>
        </div>
      </div>

      {/* ─── RIGHT: Auth Card ──────────────────────────────────────────────── */}
      <div className="relative flex flex-1 items-center justify-center p-6 sm:p-10 lg:p-12 min-h-screen">
        <div className="w-full max-w-[430px] space-y-4">

          {/* Mobile logo */}
          <div className="space-y-2 text-center lg:hidden">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-[#E87545] text-white">
              <Building2 className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-[#111827]">IHMS ERP</h1>
            <p className="text-xs font-semibold text-[#64748B]">Integrated Hostel Management System</p>
          </div>

          <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-7 space-y-4">

            {/* Title & Subtitle */}
            <div className="space-y-1 text-center sm:text-left">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[#111827]">{meta.title}</h2>
              <p className="text-xs font-medium text-[#64748B]">{meta.subtitle}</p>
            </div>

            {/* Tab Switcher (Visible on Step 1 or Admin) */}
            {(studentStep === 'IDENTIFIER' || loginType === 'ADMIN') && (
              <div className="grid grid-cols-2 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => handleTabChange('STUDENT')}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-md py-2.5 transition-all cursor-pointer',
                    loginType === 'STUDENT'
                      ? 'bg-white text-[#111827] border border-[#CBD5E1] font-black'
                      : 'text-[#64748B] hover:text-[#111827]'
                  )}
                >
                  <GraduationCap className={cn('h-4 w-4', loginType === 'STUDENT' ? 'text-[#E87545]' : 'text-[#64748B]')} />
                  Student Login
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange('ADMIN')}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg py-2.5 transition-all cursor-pointer',
                    loginType === 'ADMIN'
                      ? 'bg-white text-[#111827] border border-[#CBD5E1] font-black'
                      : 'text-[#64748B] hover:text-[#111827]'
                  )}
                >
                  <Building2 className={cn('h-4 w-4', loginType === 'ADMIN' ? 'text-[#E87545]' : 'text-[#64748B]')} />
                  Admin / Staff
                </button>
              </div>
            )}

            {/* Session Expired Notice */}
            {isExpired && !error && studentStep === 'IDENTIFIER' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs font-medium text-amber-800 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                Your session has expired. Please sign in again.
              </div>
            )}

            {/* Success Notice */}
            {notice && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-900 flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{notice}</span>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span className="leading-tight">{error}</span>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* ADMIN / STAFF SIGN IN                                        */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {loginType === 'ADMIN' && (
              <form onSubmit={onAdminSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="adminIdentifier" className="text-xs font-bold text-[#111827]">
                    Email Address, Owner ID or Staff ID
                  </Label>
                  <div className="student-id-input relative flex items-center">
                    <User className="student-id-icon pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                    <Input
                      id="adminIdentifier"
                      type="text"
                      required
                      autoCapitalize="none"
                      placeholder="e.g. IHM-AA-MN-H-0001 or owner@ihms.com"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      style={{ paddingLeft: '50px' }}
                      className="h-11 w-full box-border rounded-xl border-[#E5E7EB] bg-white !pl-[50px] sm:!pl-[50px] pr-3.5 text-sm font-semibold focus:border-[#E87545] focus:ring-2 focus:ring-[#E87545]/20"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="adminPassword" className="text-xs font-bold text-[#111827]">
                      Password
                    </Label>
                    <Link href="/forgot-password" className="text-xs font-semibold text-[#E87545] hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="password-input relative flex items-center">
                    <Lock className="password-lock-icon pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                    <Input
                      id="adminPassword"
                      type={showPw ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{ paddingLeft: '48px', paddingRight: '48px' }}
                      className="h-11 w-full box-border rounded-xl border-[#E5E7EB] bg-white !pl-12 !pr-12 sm:!pl-12 sm:!pr-12 text-sm font-semibold font-mono focus:border-[#E87545] focus:ring-2 focus:ring-[#E87545]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="password-toggle-icon absolute right-4 top-1/2 -translate-y-1/2 z-10 text-slate-400 hover:text-[#111827] p-0.5 cursor-pointer flex items-center justify-center transition-colors"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 w-full rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm font-bold text-white transition-colors mt-2"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In to Admin Portal
                </Button>
              </form>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* STUDENT STEP 1: Enter Student ID or Registered Email         */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {loginType === 'STUDENT' && studentStep === 'IDENTIFIER' && (
              <form onSubmit={onSendOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="studentIdentifier" className="text-xs font-bold text-[#111827]">
                    Student ID or Registered Email
                  </Label>
                  <div className="student-id-input relative flex items-center">
                    <User className="student-id-icon pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                    <Input
                      id="studentIdentifier"
                      type="text"
                      required
                      autoCapitalize="none"
                      autoFocus
                      placeholder="e.g. IHM-AA-MN-S-0001 or student@email.com"
                      value={identifier}
                      onChange={(e) => {
                        setIdentifier(e.target.value);
                        clearMessages();
                      }}
                      style={{ paddingLeft: '50px' }}
                      className="h-11 w-full box-border rounded-xl border-[#E5E7EB] bg-white !pl-[50px] sm:!pl-[50px] pr-3.5 text-sm font-semibold focus:border-[#E87545] focus:ring-2 focus:ring-[#E87545]/20"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading || !identifier.trim()}
                  className="h-12 w-full rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm font-bold text-white transition-colors mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking Status...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Continue
                    </>
                  )}
                </Button>
              </form>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* STUDENT STEP 2: Verify 6-Digit OTP                            */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {loginType === 'STUDENT' && studentStep === 'OTP' && (
              <form onSubmit={onVerifyOtp} className="space-y-5">
                {/* ID badge with change link */}
                <div className="rounded-xl border border-[#E4E0D7] bg-[#F8F7F4] px-3.5 py-2.5 text-xs font-semibold text-[#64748B] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate text-[#111827] font-bold">{identifier}</span>
                  </div>
                  <button
                    type="button"
                    onClick={resetToIdentifier}
                    className="text-[#E87545] hover:underline font-bold shrink-0 text-xs cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                {/* Masked Email Info Box */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                    <Mail className="h-4 w-4 shrink-0 text-emerald-600" />
                    OTP sent to: <span className="font-mono text-emerald-950 font-extrabold">{maskedEmail || 'registered email'}</span>
                  </div>
                  <p className="text-[11px] font-medium text-emerald-700 pl-6">
                    Verification code is valid for 10 minutes.
                  </p>
                </div>

                {/* 6 Individual OTP Boxes */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-[#111827] text-center block">
                    Enter 6-Digit Verification Code
                  </Label>
                  <div className="flex items-center justify-center gap-2 sm:gap-2.5" onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          otpInputRefs.current[idx] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        className="h-12 w-11 sm:w-12 text-center text-xl font-extrabold font-mono rounded-xl border border-[#D0D5DD] bg-white text-[#111827] shadow-xs focus:border-[#E87545] focus:ring-2 focus:ring-[#E87545]/20 focus:outline-none transition-all"
                      />
                    ))}
                  </div>
                </div>

                {/* Navigation and Resend row */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={resetToIdentifier}
                    className="flex items-center gap-1 font-bold text-slate-500 hover:text-slate-900 cursor-pointer transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </button>

                  <button
                    type="button"
                    disabled={cooldown > 0 || loading}
                    onClick={onResendOtp}
                    className="font-bold text-[#E87545] hover:underline disabled:opacity-50 cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Didn't receive code? Resend OTP"}
                  </button>
                </div>

                {/* Submit button */}
                <Button
                  type="submit"
                  disabled={loading || currentOtpString.length !== 6}
                  className="h-12 w-full rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm font-bold text-white transition-colors"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying Code...
                    </>
                  ) : (
                    'Verify OTP'
                  )}
                </Button>
              </form>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* STUDENT STEP 3: Create & Confirm Password                    */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {loginType === 'STUDENT' && studentStep === 'CREATE_PASSWORD' && (
              <form onSubmit={onActivateAccount} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="newPassword" className="text-xs font-bold text-[#111827]">
                      New Password
                    </Label>
                    <button
                      type="button"
                      onClick={() => setStudentStep('OTP')}
                      className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      <ArrowLeft className="h-3 w-3" /> Back
                    </button>
                  </div>
                  <div className="password-input relative flex items-center">
                    <Lock className="password-lock-icon pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                    <Input
                      id="newPassword"
                      type={showNewPw ? 'text' : 'password'}
                      required
                      autoFocus
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        clearMessages();
                      }}
                      style={{ paddingLeft: '48px', paddingRight: '48px' }}
                      className="h-11 w-full box-border rounded-xl border-[#E5E7EB] bg-white !pl-12 !pr-12 sm:!pl-12 sm:!pr-12 text-sm font-semibold font-mono focus:border-[#E87545] focus:ring-2 focus:ring-[#E87545]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw((s) => !s)}
                      className="password-toggle-icon absolute right-4 top-1/2 -translate-y-1/2 z-10 text-slate-400 hover:text-[#111827] p-0.5 cursor-pointer flex items-center justify-center transition-colors"
                      aria-label={showNewPw ? 'Hide password' : 'Show password'}
                    >
                      {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-xs font-bold text-[#111827]">
                    Confirm Password
                  </Label>
                  <div className="password-input relative flex items-center">
                    <Lock className="password-lock-icon pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPw ? 'text' : 'password'}
                      required
                      placeholder="Confirm your password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        clearMessages();
                      }}
                      style={{ paddingLeft: '48px', paddingRight: '48px' }}
                      className="h-11 w-full box-border rounded-xl border-[#E5E7EB] bg-white !pl-12 !pr-12 sm:!pl-12 sm:!pr-12 text-sm font-semibold font-mono focus:border-[#E87545] focus:ring-2 focus:ring-[#E87545]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw((s) => !s)}
                      className="password-toggle-icon absolute right-4 top-1/2 -translate-y-1/2 z-10 text-slate-400 hover:text-[#111827] p-0.5 cursor-pointer flex items-center justify-center transition-colors"
                      aria-label={showConfirmPw ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Password Requirements Checklist */}
                <div className="rounded-xl border border-[#E4E0D7] bg-[#F8F7F4] p-3 text-[11px]">
                  <p className="font-bold text-[#111827] mb-2">Password Requirements</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { met: pwMinLen, label: 'Min 8 characters' },
                      { met: pwUpper, label: '1 uppercase letter' },
                      { met: pwLower, label: '1 lowercase letter' },
                      { met: pwNum, label: '1 number' },
                    ].map(({ met, label }) => (
                      <div key={label} className={cn('flex items-center gap-1.5 font-semibold', met ? 'text-emerald-600' : 'text-slate-400')}>
                        <Check className={cn('h-3 w-3 stroke-[3]', met ? 'opacity-100' : 'opacity-25')} />
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className={cn('flex items-center gap-1.5 font-semibold mt-1.5', pwMatch ? 'text-emerald-600' : 'text-slate-400')}>
                    <Check className={cn('h-3 w-3 stroke-[3]', pwMatch ? 'opacity-100' : 'opacity-25')} />
                    Passwords match
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading || !pwValid}
                  className="h-12 w-full rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm font-bold text-white transition-colors mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Activating Account...
                    </>
                  ) : (
                    'Create Password & Continue'
                  )}
                </Button>
              </form>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* STUDENT STEP 4: Password Sign In (Account Already ACTIVE)    */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {loginType === 'STUDENT' && studentStep === 'SIGN_IN' && (
              <form onSubmit={onStudentSignIn} className="space-y-4">
                {/* ID badge with change link */}
                <div className="rounded-xl border border-[#E4E0D7] bg-[#F8F7F4] px-3.5 py-2.5 text-xs font-semibold text-[#64748B] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate text-[#111827] font-bold">{identifier}</span>
                  </div>
                  <button
                    type="button"
                    onClick={resetToIdentifier}
                    className="text-[#E87545] hover:underline font-bold shrink-0 text-xs cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="studentPassword" className="text-xs font-bold text-[#111827]">
                      Password
                    </Label>
                    <Link href="/forgot-password" className="text-xs font-semibold text-[#E87545] hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="password-input relative flex items-center">
                    <Lock className="password-lock-icon pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                    <Input
                      id="studentPassword"
                      type={showPw ? 'text' : 'password'}
                      required
                      autoFocus
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearMessages();
                      }}
                      style={{ paddingLeft: '48px', paddingRight: '48px' }}
                      className="h-11 w-full box-border rounded-xl border-[#E5E7EB] bg-white !pl-12 !pr-12 sm:!pl-12 sm:!pr-12 text-sm font-semibold font-mono focus:border-[#E87545] focus:ring-2 focus:ring-[#E87545]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="password-toggle-icon absolute right-4 top-1/2 -translate-y-1/2 z-10 text-slate-400 hover:text-[#111827] p-0.5 cursor-pointer flex items-center justify-center transition-colors"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={resetToIdentifier}
                    className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900 cursor-pointer transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <Button
                    type="submit"
                    disabled={loading || !password}
                    className="flex-1 h-12 rounded-xl bg-[#E87545] hover:bg-[#D66434] text-sm font-bold text-white transition-colors"
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign In to Student Portal
                  </Button>
                </div>
              </form>
            )}

            {/* Footer */}
            <div className="pt-2 text-center text-xs font-medium text-[#64748B]">
              New hostel owner?{' '}
              <Link href="/register" className="font-bold text-[#E87545] hover:underline">
                Register Your Hostel
              </Link>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-[#78716C]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#087A45]" />
            Encrypted with 256-bit authentication security
          </div>
        </div>
      </div>
    </div>
  );
}

class LoginErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[LoginErrorBoundary] Caught React render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-[#F3F1EC]">
          <div className="w-full max-w-md rounded-xl border border-[#CBD5E1] bg-white p-8 space-y-4 shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FEE2E2] text-[#C62828] border border-[#FECACA]">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-black text-[#111827]">Portal Session Error</h2>
            <p className="text-xs font-semibold text-[#64748B] leading-relaxed">
              {this.state.error?.message || 'An unexpected runtime error occurred in the login portal.'}
            </p>
            <div className="flex items-center justify-center gap-2.5 pt-2">
              <Button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = '/login';
                }}
                className="gap-2 bg-[#E87545] hover:bg-[#D66434] text-white font-bold text-xs"
              >
                <RotateCcw className="h-4 w-4" /> Reset Portal Login
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function LoginPage() {
  return (
    <LoginErrorBoundary>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-[#F5F3EF]">
            <Loader2 className="h-8 w-8 animate-spin text-[#F47A3D]" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </LoginErrorBoundary>
  );
}

