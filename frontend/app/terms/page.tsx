'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Building2,
  GraduationCap,
  LogOut,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { authApi } from '@/lib/api/auth.api';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { TermsContent, TermsSection } from '@/lib/types';
import { FullScreenLoader } from '@/components/dashboard/loader';
import { cn } from '@/lib/utils';

export default function TermsAndConditionsPage() {
  const router = useRouter();
  const { user, loading: authLoading, refreshUser, logout } = useAuth();

  const [termsData, setTermsData] = useState<TermsContent | null>(null);
  const [loadingTerms, setLoadingTerms] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Acceptance form state
  const [hasAgreed, setHasAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);

  // Fetch role-specific terms content
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoadingTerms(true);
        setError(null);
        // Automatically fetch role-based terms: Student gets Student terms, Owner gets Owner terms
        const data = await authApi.getTerms(user?.role);
        if (isMounted && data) {
          setTermsData(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Failed to load Terms & Conditions. Please try again.');
        }
      } finally {
        if (isMounted) setLoadingTerms(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [user?.role]);

  const isStudent = user?.role === 'STUDENT';
  const isOwner = user?.role ? user.role !== 'STUDENT' : false;

  // Subtitle based on authenticated role
  const agreementSubtitle = isStudent
    ? 'Student Residency Agreement'
    : isOwner
    ? 'Hostel Owner & Management Agreement'
    : 'IHMS Platform Terms & Conditions';

  const isAlreadyAccepted =
    Boolean(user?.termsAccepted) &&
    user?.acceptedTermsVersion === (termsData?.version || '1.0');

  // If already accepted previously, reflect that agreement in the checkbox state
  useEffect(() => {
    if (isAlreadyAccepted) {
      setHasAgreed(true);
    }
  }, [isAlreadyAccepted]);

  const handleAcceptTerms = async () => {
    if (!hasAgreed) {
      toast.error('Please check the box to agree to the Terms & Conditions before proceeding.');
      return;
    }
    if (submitting) return;
    try {
      setSubmitting(true);
      const version = termsData?.version || '1.0';
      await authApi.acceptTerms(version);
      await refreshUser();
      toast.success('Terms & Conditions accepted successfully.');

      if (user?.role === 'STUDENT') {
        router.replace('/student/dashboard');
      } else {
        router.replace('/dashboard');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to accept Terms & Conditions. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeclineTerms = async () => {
    try {
      setDeclining(true);
      await logout();
      toast.info('Session ended. You declined the Terms & Conditions.');
      router.replace('/signin');
    } catch {
      router.replace('/signin');
    } finally {
      setDeclining(false);
    }
  };

  const handleReturnToDashboard = () => {
    if (user?.role === 'STUDENT') {
      router.replace('/student/dashboard');
    } else {
      router.replace('/dashboard');
    }
  };

  if (authLoading || loadingTerms) {
    return <FullScreenLoader label="Loading Terms & Conditions..." />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-orange-100 selection:text-orange-900">
      {/* Top Brand Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#E87545] text-white flex items-center justify-center font-black shadow-sm text-sm">
              IHMS
            </div>
            <div>
              <span className="font-bold tracking-tight text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                Integrated Hostel Management System
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Enterprise Cloud Hostel Management Platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isStudent ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <GraduationCap className="h-3.5 w-3.5" /> Student
              </span>
            ) : isOwner ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <Building2 className="h-3.5 w-3.5" /> Hostel Management
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Document Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-10 md:p-12 space-y-8">
          {/* Header Area */}
          <div className="border-b border-slate-100 dark:border-slate-800 pb-8 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full font-semibold text-slate-700 dark:text-slate-300">
                Version {termsData?.version || '1.0'}
              </span>
              <span>•</span>
              <span>Effective: {termsData?.effectiveDate || 'September 8, 2026'}</span>
              <span>•</span>
              <span>Last Updated: {termsData?.lastUpdated || 'September 8, 2026'}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Terms & Conditions
            </h1>

            <p className="text-base sm:text-lg font-medium text-[#E87545]">
              {agreementSubtitle}
            </p>

            {/* Introductory Paragraph */}
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed pt-2">
              {termsData?.roleDescription ||
                'These Terms & Conditions govern your access to and use of the Integrated Hostel Management System (IHMS) platform. Please read this agreement carefully before continuing to use the service.'}
            </p>
          </div>

          {/* Error Message if fetch failed */}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
              <div>
                <p className="font-semibold">Unable to load terms</p>
                <p className="mt-0.5 text-xs sm:text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Contractual Terms Sections (Proper Paragraphs & Headings) */}
          <div className="space-y-10">
            {termsData?.sections?.map((section: TermsSection) => (
              <section
                key={section.id}
                className="space-y-3 pb-8 border-b border-slate-100 dark:border-slate-800/80 last:border-0 last:pb-0"
              >
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {section.title}
                </h2>

                {section.summary && (
                  <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                    {section.summary}
                  </p>
                )}

                <div className="prose prose-slate dark:prose-invert max-w-none text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line space-y-3">
                  {section.content}
                </div>
              </section>
            ))}
          </div>

          {/* Acceptance Section */}
          <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-6 sm:p-8 space-y-6 shadow-sm">
              {/* Status Header: Accepted vs Mandatory Review */}
              {isAlreadyAccepted ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/30 p-4 sm:p-5 flex items-start gap-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      Terms & Conditions Accepted
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                        Version {termsData?.version || '1.0'}
                      </span>
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      You have previously reviewed and accepted these Terms & Conditions
                      {user?.termsAcceptedAt
                        ? ` on ${new Date(user.termsAcceptedAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}`
                        : ''}
                      . Your residency account is verified and in good standing.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E87545] text-white">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                      Mandatory Review & Acceptance
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      Please review the Terms & Conditions above before continuing. You must check the agreement box to proceed.
                    </p>
                  </div>
                </div>
              )}

              {/* Acceptance Checkbox */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-5 transition-colors hover:border-slate-300 dark:hover:border-slate-600">
                <label
                  htmlFor="terms-agree-checkbox"
                  className="flex items-start gap-3.5 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    id="terms-agree-checkbox"
                    name="termsAccepted"
                    aria-label="I have read and agree to the Terms & Conditions"
                    checked={hasAgreed}
                    onChange={(e) => setHasAgreed(e.target.checked)}
                    className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-[#E87545] focus:ring-[#E87545] cursor-pointer accent-[#E87545]"
                  />
                  <div className="flex-1 text-sm sm:text-base text-slate-800 dark:text-slate-200">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      I have read and agree to the Terms & Conditions
                    </span>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {isAlreadyAccepted && hasAgreed
                        ? `Accepted for Version ${termsData?.version || '1.0'}${
                            user?.termsAcceptedAt
                              ? ` on ${new Date(user.termsAcceptedAt).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}`
                              : ''
                          }. You can review your residency agreement anytime.`
                        : 'By checking this box, you confirm that you accept all rights, obligations, and policies set forth in this agreement.'}
                    </p>
                  </div>
                </label>
              </div>

              {/* Action Buttons (Stacked on Mobile, Side-by-Side on Desktop) */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDeclineTerms}
                  disabled={declining || submitting}
                  className="w-full sm:w-auto min-h-[44px] h-11 px-5 border-slate-300 dark:border-slate-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-700 font-semibold text-sm rounded-xl gap-2 transition-colors"
                >
                  <LogOut className="h-4 w-4" /> Decline & Exit
                </Button>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  {isAlreadyAccepted && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReturnToDashboard}
                      className="w-full sm:w-auto min-h-[44px] h-11 px-6 rounded-xl border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-sm shadow-sm gap-2"
                    >
                      Return to Dashboard <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}

                  <Button
                    type="button"
                    onClick={handleAcceptTerms}
                    disabled={submitting}
                    className={cn(
                      'w-full sm:w-auto min-h-[44px] h-11 px-8 rounded-xl font-semibold text-sm shadow-sm transition-all gap-2',
                      hasAgreed
                        ? 'bg-[#E87545] hover:bg-[#D66434] text-white cursor-pointer'
                        : 'bg-slate-200 text-slate-500 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 cursor-pointer'
                    )}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Recording Acceptance...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        {isAlreadyAccepted ? 'Re-confirm & Save' : 'Accept & Continue'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <footer className="pt-4 text-center text-xs text-slate-400 dark:text-slate-500">
            Integrated Hostel Management System (IHMS) • Version {termsData?.version || '1.0'} • All rights reserved
          </footer>
        </div>
      </main>
    </div>
  );
}
