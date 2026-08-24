'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, Lock, Mail, Loader2, Eye, EyeOff, ShieldCheck, TrendingUp, Users, BedDouble, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isMockEnabled } from '@/lib/mocks/auth';
import type { ApiError } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const { user, login, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(user.role === 'STUDENT' ? '/student' : user.role === 'PARENT' ? '/parent' : '/dashboard');
    }
  }, [user, authLoading, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr?.message || 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const demoAccounts = isMockEnabled()
    ? [
        { label: 'Owner', email: 'owner@ihms.dev', pw: 'owner123', role: 'Manage hostels & students' },
        { label: 'Student', email: 'student@ihms.dev', pw: 'student123', role: 'View fees & attendance' },
        { label: 'Admin', email: 'admin@ihms.dev', pw: 'admin123', role: 'Platform oversight' },
        { label: 'Mess Mgr', email: 'mess@ihms.dev', pw: 'mess123', role: 'Plan weekly menus' },
      ]
    : [];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-sidebar p-10 text-white xl:flex xl:p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-accent/10" />
        <div className="absolute -right-20 top-1/4 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -left-10 bottom-1/4 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight">IHMS ERP</p>
            <p className="text-xs text-sidebar-muted">Integrated Hostel Management System</p>
          </div>
        </div>

        <div className="relative space-y-6">
          <h1 className="max-w-md text-3xl font-bold leading-tight tracking-tight xl:text-[40px] xl:leading-[1.15]">
            Run your hostel network<br />with enterprise precision.
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-sidebar-muted">
            Manage students, rooms, beds, fees, mess, attendance and complaints across every branch — all from one professional dashboard.
          </p>
          <div className="grid max-w-md grid-cols-2 gap-3 pt-2">
            <FeatureChip icon={Users} label="Student Management" />
            <FeatureChip icon={BedDouble} label="Room & Bed Tracking" />
            <FeatureChip icon={TrendingUp} label="Financial Analytics" />
            <FeatureChip icon={ShieldCheck} label="Role-based Access" />
          </div>
        </div>

        <div className="relative flex flex-wrap gap-2">
          {['Multi-branch', 'Real-time updates', 'QR-enabled', 'Mess management'].map((f) => (
            <span key={f} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-sidebar-muted backdrop-blur-sm">
              <ShieldCheck className="h-3.5 w-3.5 text-sidebar-accent" /> {f}
            </span>
          ))}
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-background to-muted/30 px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2 text-center lg:hidden">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
              <Building2 className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">IHMS ERP</h1>
            <p className="text-sm text-muted-foreground">Sign in to your account</p>
          </div>

          <div className="hidden space-y-1.5 lg:block">
            <h2 className="text-[26px] font-bold tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Enter your credentials to access the dashboard.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email address</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@hostel.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="animate-fade-in rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-medium text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="h-11 w-full bg-gradient-primary text-base font-semibold hover:shadow-glow" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Sign in
            </Button>
          </form>

          {demoAccounts.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">Quick demo access</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {demoAccounts.map((a) => (
                  <button
                    key={a.email}
                    onClick={() => { setEmail(a.email); setPassword(a.pw); }}
                    className="group flex flex-col items-start gap-0.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-all hover:border-primary/40 hover:shadow-premium"
                  >
                    <span className="text-xs font-semibold">{a.label}</span>
                    <span className="text-[10px] text-muted-foreground">{a.role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Student portal access is granted by your hostel administration.
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureChip({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent/20">
        <Icon className="h-4 w-4 text-sidebar-accent" />
      </div>
      <span className="text-xs font-medium text-sidebar-foreground">{label}</span>
    </div>
  );
}
