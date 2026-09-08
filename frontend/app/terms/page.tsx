'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  FileText,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  Building2,
  CreditCard,
  Lock,
  Ban,
  Scale,
  LogOut,
  ArrowRight,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Search,
  BookOpen,
  Info,
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

  // Active filter tab: 'ALL' | 'STUDENT' | 'OWNER' | 'PAYMENTS'
  const [activeTab, setActiveTab] = useState<'ALL' | 'STUDENT' | 'OWNER' | 'PAYMENTS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Acceptance state
  const [hasAgreed, setHasAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);

  // Table of Contents active highlight
  const [activeSectionId, setActiveSectionId] = useState<string>('');
  const contentContainerRef = useRef<HTMLDivElement>(null);

  // Auto-set tab based on role
  useEffect(() => {
    if (user?.role === 'STUDENT') {
      setActiveTab('STUDENT');
    } else if (user?.role) {
      setActiveTab('OWNER');
    }
  }, [user?.role]);

  // Fetch terms content from backend
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoadingTerms(true);
        setError(null);
        const data = await authApi.getTerms();
        if (isMounted && data) {
          setTermsData(data);
          // Expand all sections by default
          const defaultExpanded: Record<string, boolean> = {};
          data.sections?.forEach((s: TermsSection) => {
            defaultExpanded[s.id] = true;
          });
          setExpandedSections(defaultExpanded);
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
  }, []);

  // Filter sections based on active tab & search query
  const filteredSections = useMemo(() => {
    if (!termsData?.sections) return [];
    let list = termsData.sections;

    if (activeTab === 'STUDENT') {
      list = list.filter((s) => s.applicableTo === 'ALL' || s.applicableTo === 'STUDENT');
    } else if (activeTab === 'OWNER') {
      list = list.filter((s) => s.applicableTo === 'ALL' || s.applicableTo === 'OWNER');
    } else if (activeTab === 'PAYMENTS') {
      list = list.filter(
        (s) =>
          s.id.includes('payment') ||
          s.id.includes('liability') ||
          s.id.includes('security')
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          s.content.toLowerCase().includes(q)
      );
    }

    return list;
  }, [termsData, activeTab, searchQuery]);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    if (!termsData?.sections) return;
    const next: Record<string, boolean> = {};
    termsData.sections.forEach((s) => {
      next[s.id] = true;
    });
    setExpandedSections(next);
  };

  const collapseAll = () => {
    setExpandedSections({});
  };

  const scrollToSection = (id: string) => {
    setActiveSectionId(id);
    const element = document.getElementById(`section-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Submit acceptance
  const handleAcceptTerms = async () => {
    if (!hasAgreed) {
      toast.error('Please mark the agreement checkbox before continuing.');
      return;
    }
    if (!termsData?.version) {
      toast.error('Terms version could not be loaded. Please refresh the page.');
      return;
    }

    setSubmitting(true);
    try {
      await authApi.acceptTerms(termsData.version);
      await refreshUser();
      toast.success('Terms & Conditions accepted successfully. Welcome to IHMS!');

      // Smooth redirection to appropriate portal
      setTimeout(() => {
        if (user?.role === 'STUDENT') {
          router.replace('/student/dashboard');
        } else {
          router.replace('/dashboard');
        }
      }, 500);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record acceptance. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Decline and Exit
  const handleDeclineTerms = async () => {
    if (
      !window.confirm(
        'Are you sure you want to decline the Terms & Conditions? You will be signed out and will not be able to access the application.'
      )
    ) {
      return;
    }

    setDeclining(true);
    try {
      await logout();
      toast.info('You have declined the Terms & Conditions. You have been safely logged out.');
      router.replace('/signin');
    } catch {
      router.replace('/signin');
    } finally {
      setDeclining(false);
    }
  };

  if (authLoading || loadingTerms) {
    return <FullScreenLoader label="Loading Terms & Conditions..." />;
  }

  const isAlreadyAccepted = Boolean(user?.termsAccepted);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B]">
      {/* ── TOP HEADER / BRAND BAR ────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E87545] text-white shadow-sm">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-black tracking-wider text-[#E87545]">IHMS</span>
                <span className="text-xs font-semibold text-[#64748B]">Enterprise ERP</span>
              </div>
              <h1 className="text-sm sm:text-base font-bold text-[#0F172A]">Terms & Conditions</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-[#CBD5E1] bg-[#F1F5F9] px-3 py-1 text-xs font-medium text-[#475569]">
              <span>Version: <strong className="font-mono text-[#0F172A]">{termsData?.version || '1.0'}</strong></span>
              <span>•</span>
              <span>Effective: <strong>{termsData?.effectiveDate || 'Sept 8, 2026'}</strong></span>
            </div>

            {isAlreadyAccepted ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.replace(user?.role === 'STUDENT' ? '/student/dashboard' : '/dashboard')}
                className="gap-1.5 border-[#CBD5E1] text-xs font-bold text-[#0F172A] hover:bg-[#F1F5F9]"
              >
                Go to Dashboard <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeclineTerms}
                disabled={declining}
                className="gap-1.5 text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2]"
              >
                {declining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                Decline & Exit
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ── BANNER: MANDATORY ACCEPTANCE NOTICE ─────────────────────────── */}
      <div className="border-b border-[#FDBA74]/50 bg-gradient-to-r from-[#FFF7ED] to-[#FFEDD5] px-4 py-3 text-[#9A3412]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 shrink-0 text-[#EA580C]" />
            <span>
              <strong>Mandatory Acceptance:</strong> You must review and agree to the IHMS Terms & Conditions to access your account dashboard and platform features.
            </span>
          </div>
          {user && (
            <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-[#C2410C]">
              <span>Logged in as: <strong>{user.name}</strong> ({user.role})</span>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT AREA ────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          
          {/* ── LEFT SIDEBAR: Table of Contents & Navigation (Desktop) ── */}
          <aside className="hidden lg:col-span-4 lg:block space-y-4">
            <div className="sticky top-20 rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-[#64748B]">Table of Contents</h3>
                <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-bold text-[#475569]">
                  {termsData?.sections.length || 10} Sections
                </span>
              </div>

              {/* Role Indicator Card */}
              {user && (
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs">
                  <div className="flex items-center gap-2 font-bold text-[#0F172A]">
                    {user.role === 'STUDENT' ? (
                      <GraduationCap className="h-4 w-4 text-[#E87545]" />
                    ) : (
                      <Building2 className="h-4 w-4 text-[#2563EB]" />
                    )}
                    <span>{user.role === 'STUDENT' ? 'Student Account' : 'Hostel Owner / Management'}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#64748B]">
                    Showing sections tailored to your role. You can switch tabs above to inspect full platform terms.
                  </p>
                </div>
              )}

              {/* Navigation List */}
              <nav className="max-h-[calc(100vh-320px)] space-y-1 overflow-y-auto pr-1">
                {termsData?.sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
                      activeSectionId === section.id
                        ? 'bg-[#E87545]/10 font-bold text-[#E87545]'
                        : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                    )}
                  >
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-[#94A3B8]">
                      {section.order}.
                    </span>
                    <span className="line-clamp-1">{section.title.replace(/^\d+\.\s*/, '')}</span>
                  </button>
                ))}
              </nav>

              {/* Legal Support Box */}
              <div className="border-t border-[#E2E8F0] pt-3 text-[11px] text-[#64748B] space-y-1">
                <p className="font-semibold text-[#0F172A]">Have legal questions?</p>
                <p>Email our compliance officer at <a href="mailto:legal@ihms.com" className="font-bold text-[#E87545] hover:underline">legal@ihms.com</a></p>
              </div>
            </div>
          </aside>

          {/* ── RIGHT MAIN PANEL: Agreement Sections & Tabs ───────────── */}
          <main className="lg:col-span-8 space-y-6">
            
            {/* Filter Tabs & Search Bar */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                
                {/* Tabs */}
                <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[#F1F5F9] p-1">
                  <button
                    onClick={() => setActiveTab('ALL')}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                      activeTab === 'ALL'
                        ? 'bg-white text-[#0F172A] shadow-sm'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    )}
                  >
                    All Terms
                  </button>
                  <button
                    onClick={() => setActiveTab('STUDENT')}
                    className={cn(
                      'flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                      activeTab === 'STUDENT'
                        ? 'bg-white text-[#E87545] shadow-sm'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    )}
                  >
                    <GraduationCap className="h-3.5 w-3.5" />
                    Student Terms
                  </button>
                  <button
                    onClick={() => setActiveTab('OWNER')}
                    className={cn(
                      'flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                      activeTab === 'OWNER'
                        ? 'bg-white text-[#2563EB] shadow-sm'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    )}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    Owner Terms
                  </button>
                  <button
                    onClick={() => setActiveTab('PAYMENTS')}
                    className={cn(
                      'flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                      activeTab === 'PAYMENTS'
                        ? 'bg-white text-[#059669] shadow-sm'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    )}
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Fees & Rules
                  </button>
                </div>

                {/* Expand / Collapse Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={expandAll}
                    className="text-[11px] font-semibold text-[#64748B] hover:text-[#0F172A] hover:underline"
                  >
                    Expand All
                  </button>
                  <span className="text-[#CBD5E1]">•</span>
                  <button
                    onClick={collapseAll}
                    className="text-[11px] font-semibold text-[#64748B] hover:text-[#0F172A] hover:underline"
                  >
                    Collapse All
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search clauses, keywords (e.g. fees, curfew, refund, damage, liability)..."
                  className="w-full rounded-xl border border-[#CBD5E1] bg-white pl-9 pr-4 py-2 text-xs text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#E87545] focus:outline-none focus:ring-1 focus:ring-[#E87545]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#94A3B8] hover:text-[#0F172A]"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="flex items-center gap-3 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-xs text-[#991B1B]">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <div className="flex-1">
                  <p className="font-bold">Error Loading Terms</p>
                  <p className="mt-0.5">{error}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </div>
            )}

            {/* Section Cards */}
            <div ref={contentContainerRef} className="space-y-4">
              {filteredSections.length === 0 && !loadingTerms && (
                <div className="rounded-2xl border border-dashed border-[#CBD5E1] p-8 text-center">
                  <BookOpen className="mx-auto h-8 w-8 text-[#94A3B8]" />
                  <p className="mt-2 text-sm font-bold text-[#475569]">No matching clauses found</p>
                  <p className="mt-1 text-xs text-[#64748B]">Try adjusting your search query or switching tabs.</p>
                </div>
              )}

              {filteredSections.map((section) => {
                const isExpanded = expandedSections[section.id] ?? true;
                const isStudent = section.applicableTo === 'STUDENT';
                const isOwner = section.applicableTo === 'OWNER';

                return (
                  <article
                    key={section.id}
                    id={`section-${section.id}`}
                    className={cn(
                      'overflow-hidden rounded-2xl border bg-white shadow-sm transition-all',
                      isStudent
                        ? 'border-orange-200/80 hover:border-orange-300'
                        : isOwner
                        ? 'border-blue-200/80 hover:border-blue-300'
                        : 'border-[#E2E8F0] hover:border-[#CBD5E1]'
                    )}
                  >
                    {/* Header */}
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="flex w-full items-center justify-between p-4 sm:p-5 text-left transition-colors hover:bg-[#F8FAFC]"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black',
                            isStudent
                              ? 'bg-orange-100 text-[#E87545]'
                              : isOwner
                              ? 'bg-blue-100 text-[#2563EB]'
                              : 'bg-slate-100 text-[#475569]'
                          )}
                        >
                          {section.order}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-sm sm:text-base font-bold text-[#0F172A]">{section.title}</h2>
                            {isStudent && (
                              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#EA580C]">
                                Student Specific
                              </span>
                            )}
                            {isOwner && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#2563EB]">
                                Owner Specific
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-[#64748B] line-clamp-1">{section.summary}</p>
                        </div>
                      </div>

                      <div className="ml-3 shrink-0 text-[#94A3B8]">
                        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </div>
                    </button>

                    {/* Collapsible Content */}
                    {isExpanded && (
                      <div className="border-t border-[#F1F5F9] bg-[#FAFCFF] p-4 sm:p-6">
                        <div className="prose prose-sm max-w-none text-xs sm:text-sm text-[#334155] leading-relaxed whitespace-pre-line">
                          {section.content}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {/* ── ACCEPTANCE & DECLINE ACTION CARD ──────────────────────── */}
            <div className="rounded-2xl border-2 border-[#E87545] bg-white p-5 sm:p-6 shadow-md space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E87545] text-white">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-[#0F172A]">
                    Acknowledge & Accept Terms & Conditions
                  </h3>
                  <p className="mt-1 text-xs text-[#64748B]">
                    By accepting, you confirm that you have read, understood, and agree to be bound by the IHMS platform agreement version <strong>{termsData?.version || '1.0'}</strong>.
                  </p>
                </div>
              </div>

              {/* Checkbox */}
              <div className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-4 transition-colors hover:bg-[#F1F5F9]">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasAgreed}
                    onChange={(e) => setHasAgreed(e.target.checked)}
                    className="mt-0.5 h-5 w-5 rounded border-[#CBD5E1] text-[#E87545] focus:ring-[#E87545] cursor-pointer"
                  />
                  <div className="text-xs sm:text-sm text-[#1E293B]">
                    <span className="font-bold">
                      I have read, understood, and agree to the IHMS Terms & Conditions.
                    </span>
                    <p className="mt-0.5 text-xs text-[#64748B]">
                      I understand that this forms a legally binding agreement between myself and the Integrated Hostel Management System platform.
                    </p>
                  </div>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDeclineTerms}
                  disabled={declining || submitting}
                  className="w-full sm:w-auto gap-2 border-[#CBD5E1] text-xs font-bold text-[#DC2626] hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                >
                  <LogOut className="h-4 w-4" /> Decline & Exit
                </Button>

                <Button
                  type="button"
                  onClick={handleAcceptTerms}
                  disabled={!hasAgreed || submitting}
                  className="w-full sm:w-auto gap-2 rounded-xl bg-[#E87545] hover:bg-[#D66434] px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow transition-all disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Recording Acceptance...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Accept & Continue
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Footer Notice */}
            <p className="text-center text-[11px] text-[#94A3B8] pb-8">
              Integrated Hostel Management System (IHMS) ERP • Version {termsData?.version || '1.0'} • Secure Cloud Infrastructure
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}
