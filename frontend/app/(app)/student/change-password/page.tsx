'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ShieldCheck, KeyRound, Check, X, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/auth-context';
import { authApi } from '@/lib/api/auth.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ApiError } from '@/lib/types';

export default function StudentChangePasswordPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation rules
  const hasMinLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isValid = hasMinLength && hasUpper && hasLower && hasNumber && isMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError('Please enter your current temporary password.');
      return;
    }

    if (!isValid) {
      setError('Please satisfy all password security requirements.');
      return;
    }

    setLoading(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      await refreshUser();
      toast.success('Password updated successfully! Welcome to your dashboard.');
      router.replace('/student/dashboard');
    } catch (err) {
      setError((err as ApiError)?.message || 'Failed to update password. Please check your current temporary password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-3.5 py-6 sm:py-8">
      <div className="w-full max-w-md space-y-4 sm:space-y-5 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-7">
        <div className="space-y-1.5 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-[#E87545] text-white">
            <KeyRound className="h-5 w-5" />
          </div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#111827]">
            Welcome to IHMS Student Portal
          </h1>
          <p className="text-xs text-[#64748B] sm:text-sm">
            For security, please create your own password.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-2.5 sm:p-3 text-xs font-semibold text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Current Temporary Password */}
          <div className="space-y-1">
            <Label htmlFor="currentPassword" className="text-xs font-bold text-[#111827]">
              Current Temporary Password *
            </Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <Input
                id="currentPassword"
                type={showCurrent ? 'text' : 'password'}
                required
                placeholder="Enter temporary password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-10 pl-9 pr-10 border-[#CBD5E1]"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#111827]"
                aria-label={showCurrent ? 'Hide password' : 'Show password'}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-1">
            <Label htmlFor="newPassword" className="text-xs font-bold text-[#111827]">
              New Password *
            </Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <Input
                id="newPassword"
                type={showNew ? 'text' : 'password'}
                required
                placeholder="Enter new password (min 8 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-10 pl-9 pr-10 border-[#CBD5E1]"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#111827]"
                aria-label={showNew ? 'Hide password' : 'Show password'}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div className="space-y-1">
            <Label htmlFor="confirmPassword" className="text-xs font-bold text-[#111827]">
              Confirm New Password *
            </Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <Input
                id="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                required
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-10 pl-9 pr-10 border-[#CBD5E1]"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#111827]"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Password Requirements Checklist */}
          <div className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-3 text-xs space-y-1.5">
            <p className="font-bold text-[#111827] flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-[#E87545]" />
              Password Security Requirements
            </p>
            <div className="grid grid-cols-2 gap-1 text-[#64748B]">
              <RequirementItem met={hasMinLength} label="At least 8 chars" />
              <RequirementItem met={hasUpper} label="1 uppercase (A-Z)" />
              <RequirementItem met={hasLower} label="1 lowercase (a-z)" />
              <RequirementItem met={hasNumber} label="1 number (0-9)" />
            </div>
            <RequirementItem met={isMatch} label="Passwords match" />
          </div>

          <Button
            type="submit"
            disabled={loading || !isValid}
            className="w-full bg-[#E87545] hover:bg-[#D66434] text-white font-bold h-11 rounded-lg"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Update Password
          </Button>
        </form>
      </div>
    </div>
  );
}

function RequirementItem({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {met ? (
        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
      ) : (
        <X className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
      )}
      <span className={met ? 'text-foreground font-medium' : ''}>{label}</span>
    </div>
  );
}
