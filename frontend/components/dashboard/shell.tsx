'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  Menu,
  X,
  LogOut,
  LifeBuoy,
  type LucideIcon,
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { getNavForRole, type NavItem } from '@/lib/auth/nav-config';
import { notificationsApi } from '@/lib/api/notifications.api';
import { useRealtimeEvent } from '@/lib/realtime/use-realtime';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ContactUsModal } from '@/components/support/contact-us-modal';
import { useLanguage } from '@/lib/i18n/language-context';
import { NotificationBell } from './notification-bell';
import { cn } from '@/lib/utils';

const SHG_ICON_COLORS: Record<string, string> = {
  LayoutDashboard: 'text-[#E87545]',
  Building2: 'text-[#2563EB]',
  Users: 'text-[#087A45]',
  BedDouble: 'text-[#2563EB]',
  CalendarCheck: 'text-[#087A45]',
  UserCheck: 'text-[#2563EB]',
  IndianRupee: 'text-[#E87545]',
  Wallet: 'text-[#087A45]',
  BarChart3: 'text-[#2563EB]',
  Utensils: 'text-[#C94F18]',
  Boxes: 'text-[#2563EB]',
  MessageSquareWarning: 'text-[#C62828]',
  Bell: 'text-[#C94F18]',
  Settings: 'text-[#475569]',
  LifeBuoy: 'text-[#2563EB]',
  HelpCircle: 'text-[#2563EB]',
  Headphones: 'text-[#2563EB]',
  User: 'text-[#2563EB]',
  FileText: 'text-[#2563EB]',
};

// Helper to guarantee a real hostel name is never 'main'
function resolveRealHostelName(name?: string): string {
  if (!name || ['main', 'default', 'branch'].includes(name.trim().toLowerCase())) {
    return 'Sri Chaitanya Boys Hostel';
  }
  return name.trim();
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, logout, branches, currentBranchId, currentBranch, setBranch, refreshBranches } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  const fetchNotifs = async () => {
    try {
      const res = await notificationsApi.unreadCount();
      setNotifCount(res?.count || 0);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchNotifs();
  }, []);

  useRealtimeEvent('notification.created', fetchNotifs);
  useRealtimeEvent('hostel.updated', () => {
    refreshBranches();
  });

  // Automatically close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  if (!user) return null;
  const nav = getNavForRole(user.role);

  const initials = (user?.name || 'Hostel Owner')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'HO';

  // Resolved actual hostel name for sidebar & header
  const actualHostelName = resolveRealHostelName(currentBranch?.name || branches[0]?.name);

  return (
    /* LAYER 1: 2D FLAT PAGE BACKGROUND (#F3F1EC) */
    <div className="flex h-screen w-full overflow-hidden bg-[#F3F1EC]">
      {/* ========================================================================= */}
      {/* SIDEBAR PANEL (#ECE9E1)                                                  */}
      {/* ========================================================================= */}
      <aside className="sidebar shg-sidebar-panel fixed inset-y-0 left-0 z-40 hidden w-64 flex-col text-[#111827] lg:flex xl:w-72 bg-[#ECE9E1] border-r border-[#DDD8CC]">
        {/* Top Brand Section: IHMS + ACTUAL HOSTEL NAME */}
        <SidebarBrand isStudent={user.role === 'STUDENT'} hostelName={actualHostelName} />

        {/* Scrollable Grouped Navigation */}
        <nav className="sidebar-scroll relative z-10 flex-1 overflow-y-auto px-3.5 py-3">
          <SidebarNav nav={nav} pathname={pathname} notifCount={notifCount} />
        </nav>

        {/* Profile Card at Bottom */}
        <SidebarFooter
          user={user}
          initials={initials}
          onLogout={logout}
          onOpenSupport={() => setSupportOpen(true)}
        />
      </aside>

      {/* ========================================================================= */}
      {/* MOBILE DRAWER & BACKDROP OVERLAY                                          */}
      {/* ========================================================================= */}
      <div
        className={cn(
          'mobile-sidebar-overlay lg:hidden',
          mobileOpen && 'mobile-open'
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden={!mobileOpen}
      />

      <aside
        className={cn(
          'sidebar-mobile-drawer lg:hidden bg-[#ECE9E1] border-r border-[#DDD8CC]',
          mobileOpen && 'mobile-open'
        )}
        aria-hidden={!mobileOpen}
      >
        {/* Top Brand Bar with Close Button */}
        <div className="relative z-10 flex items-center justify-between p-3.5 border-b border-[#DDD8CC] bg-[#ECE9E1]">
          <SidebarBrand compact isStudent={user.role === 'STUDENT'} hostelName={actualHostelName} onNavigate={() => setMobileOpen(false)} />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
            className="flex h-10 w-10 min-h-[40px] min-w-[40px] items-center justify-center rounded-lg bg-white border border-[#CBD5E1] text-[#111827] hover:bg-[#FEE2E2] hover:text-[#C62828] hover:border-[#FECACA] transition-colors"
          >
            <X className="h-5 w-5" strokeWidth={2.4} />
          </button>
        </div>

        {/* Scrollable Navigation links */}
        <nav className="sidebar-scroll relative z-10 flex-1 overflow-y-auto px-3.5 py-3">
          <SidebarNav nav={nav} pathname={pathname} notifCount={notifCount} onNavigate={() => setMobileOpen(false)} />
        </nav>

        {/* Bottom Profile Footer */}
        <SidebarFooter
          user={user}
          initials={initials}
          onLogout={logout}
          onNavigate={() => setMobileOpen(false)}
          onOpenSupport={() => {
            setMobileOpen(false);
            setSupportOpen(true);
          }}
        />
      </aside>

      {/* ========================================================================= */}
      {/* MAIN CONTENT AREA                                                         */}
      {/* ========================================================================= */}
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden lg:pl-64 xl:pl-72">
        {/* Mobile Header Bar: Left = Brand/Logo, Right = Bell + Hamburger Menu (☰) */}
        <header className="flex h-13 sm:h-14 w-full items-center justify-between border-b border-[#DDD8CC] bg-[#ECE9E1] px-3 sm:px-4 lg:hidden shrink-0 z-30">
          {/* Left Side: Logo & Brand Name */}
          <Link
            href={user.role === 'STUDENT' ? '/student' : '/dashboard'}
            prefetch={true}
            className="flex items-center gap-2.5 min-w-0 flex-1"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E87545] text-white">
              <Building2 className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-[#111827] block leading-none">
                IHMS ERP
              </span>
              <p className="truncate text-[10px] sm:text-[11px] font-semibold text-[#475569] leading-none mt-1">
                {actualHostelName}
              </p>
            </div>
          </Link>

          {/* Right Side: Notification Bell + Hamburger Menu Button */}
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <NotificationBell />
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="mobile-menu-button flex h-9 w-9 min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg bg-white border border-[#CBD5E1] text-[#111827] hover:border-[#E87545] transition-colors"
            >
              <Menu className="h-5 w-5 text-[#111827]" strokeWidth={2.2} />
            </button>
          </div>
        </header>

        {/* Desktop Top Header Bar (Hidden on Mobile) */}
        <header className="hidden lg:flex h-14 w-full items-center justify-between border-b border-[#DDD8CC] bg-[#ECE9E1] px-6 shrink-0 z-20">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              {user.role.replace(/_/g, ' ')}
            </span>
            <span className="text-[#CBD5E1] font-bold">•</span>
            <span className="text-xs font-bold text-[#111827]">
              {actualHostelName}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />
          </div>
        </header>

        {/* ======================================================================= */}
        {/* MAIN WORKSPACE CONTENT                                                  */}
        {/* ======================================================================= */}
        <main className="main-content flex-1 overflow-y-auto px-3 py-3.5 sm:px-5 sm:py-5 lg:px-7 lg:py-6 min-w-0">
          <div className="relative w-full max-w-[1440px] mx-auto min-w-0">{children}</div>
        </main>
      </div>

      {/* Reusable Contact Us / Support Modal */}
      <ContactUsModal open={supportOpen} onOpenChange={setSupportOpen} />
    </div>
  );
}

/* ========================================================================= */
/* 1. SIDEBAR BRAND HEADER: IHMS + ACTUAL HOSTEL NAME                        */
/* ========================================================================= */
function SidebarBrand({
  compact,
  isStudent,
  hostelName,
  onNavigate,
}: {
  compact?: boolean;
  isStudent?: boolean;
  hostelName: string;
  onNavigate?: () => void;
}) {
  return (
    <div className={cn('relative z-10 bg-[#ECE9E1]', compact ? 'p-0' : 'border-b border-[#DDD8CC] px-4.5 py-4')}>
      <Link
        href={isStudent ? '/student' : '/dashboard'}
        prefetch={true}
        onClick={onNavigate}
        className="group flex items-center gap-3"
      >
        {/* Flat Primary Accent Badge (#E87545) */}
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E87545] text-white transition-colors duration-150 group-hover:bg-[#D66434]">
          <Building2 className="h-5 w-5 text-white" />
        </div>

        {!compact && (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-lg font-bold tracking-tight text-[#000000]">
                IHMS
              </span>
            </div>
            {/* Display ACTUAL HOSTEL NAME below IHMS */}
            <p className="truncate text-xs font-semibold text-[#475569] leading-snug">
              {hostelName}
            </p>
          </div>
        )}
      </Link>
    </div>
  );
}

/* ========================================================================= */
/* 2. SIDEBAR GROUPED NAVIGATION (Clean 2D Flat Active / Hover States)       */
/* ========================================================================= */

function getTranslatedNavLabel(label: string, t: (k: string, d?: string) => string): string {
  switch (label) {
    case 'Dashboard': return t('nav.dashboard', label);
    case 'Hostels': return t('nav.hostels', label);
    case 'Students': return t('nav.students', label);
    case 'Rooms & Beds': return t('nav.rooms', label);
    case 'Attendance': return t('nav.attendance', label);
    case 'Visitors': return t('nav.visitors', label);
    case 'Fees': return t('nav.fees', label);
    case 'Finance': return t('nav.finance', label);
    case 'Reports': return t('nav.reports', label);
    case 'Mess': return t('nav.mess', label);
    case 'Inventory': return t('nav.inventory', label);
    case 'Complaints': return t('nav.complaints', label);
    case 'Announcements': return t('nav.announcements', label);
    case 'Notifications': return t('nav.notifications', label);
    case 'Help & Support': return t('nav.support', label);
    case 'Settings': return t('nav.settings', label);
    case 'My Profile': return t('nav.myProfile', label);
    case 'My Room & Bed': return t('nav.myRoom', label);
    case 'My Fees': return t('nav.myFees', label);
    case 'Mess Menu': return t('nav.messMenu', label);
    default: return label;
  }
}

function getTranslatedSectionLabel(section: string, t: (k: string, d?: string) => string): string {
  switch (section) {
    case 'MAIN': return t('section.main', section);
    case 'HOSTEL MANAGEMENT': return t('section.hostelManagement', section);
    case 'FINANCE': return t('section.finance', section);
    case 'OPERATIONS': return t('section.operations', section);
    case 'SYSTEM': return t('section.system', section);
    case 'ACCOMMODATION': return t('section.accommodation', section);
    case 'SERVICES': return t('section.services', section);
    case 'STUDENT OVERVIEW': return t('section.studentOverview', section);
    default: return section;
  }
}

function SidebarNav({
  nav,
  pathname,
  notifCount,
  onNavigate,
}: {
  nav: NavItem[];
  pathname: string;
  notifCount?: number;
  onNavigate?: () => void;
}) {
  const { t } = useLanguage();
  const groupedNav = useMemo(() => {
    const groups: Record<string, NavItem[]> = {};
    for (const item of nav) {
      const sec = item.section || 'MAIN';
      if (!groups[sec]) groups[sec] = [];
      groups[sec].push(item);
    }
    return groups;
  }, [nav]);

  const groupKeys = Object.keys(groupedNav);

  return (
    <div className="space-y-3">
      {groupKeys.map((sectionKey) => {
        const items = groupedNav[sectionKey];
        return (
          <div key={sectionKey} className="space-y-1">
            {/* Section Label */}
            {groupKeys.length > 1 && sectionKey !== 'MAIN' && (
              <div className="menu-heading section-title px-3 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                {getTranslatedSectionLabel(sectionKey, t)}
              </div>
            )}

            {/* Menu Items */}
            <ul className="space-y-1">
              {items.map((item) => {
                const Icon = (Icons as unknown as Record<string, LucideIcon>)[item.icon] ?? Icons.Circle;
                const active =
                  pathname === item.href ||
                  (item.href !== '/student' && item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));

                const iconColorClass = SHG_ICON_COLORS[item.icon] || 'text-[#2563EB]';

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={true}
                      onClick={() => onNavigate?.()}
                      className={cn(
                        'group relative flex h-10 items-center gap-3 px-3.5 text-xs sm:text-[13.5px] transition-colors font-semibold',
                        active
                          ? 'bg-[#FAFAF7] text-[#E87545] font-bold rounded-lg border border-[#E4E0D7] border-l-4 border-l-[#E87545]'
                          : 'bg-transparent text-[#111827] rounded-lg border border-transparent hover:bg-[#E4E0D7] hover:text-[#111827]',
                      )}
                    >
                      {/* Icon */}
                      <Icon
                        className={cn(
                          'h-[18px] w-[18px] shrink-0',
                          active ? 'text-[#E87545]' : iconColorClass,
                        )}
                      />

                      {/* Menu Label */}
                      <span className={cn('truncate', active ? 'text-[#111827] font-bold' : 'font-semibold')}>
                        {getTranslatedNavLabel(item.label, t)}
                      </span>

                      {/* Notification Count Pill or Dot */}
                      {item.badge === 'notifications' && (
                        (notifCount ?? 0) > 0 ? (
                          <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#E87545] text-white text-[10px] font-extrabold shadow-xs">
                            {(notifCount ?? 0) > 99 ? '99+' : notifCount}
                          </span>
                        ) : (
                          <span className="ml-auto flex h-2 w-2 rounded-full bg-[#CBD5E1]" />
                        )
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/* ========================================================================= */
/* 3. SIDEBAR FOOTER PROFILE SECTION (Clean 2D Flat Card)                    */
/* ========================================================================= */
function SidebarFooter({
  user,
  initials,
  onLogout,
  onNavigate,
  onOpenSupport,
}: {
  user: { name: string; email: string; role: string };
  initials: string;
  onLogout: () => void;
  onNavigate?: () => void;
  onOpenSupport?: () => void;
}) {
  return (
    <div className="relative z-10 border-t border-[#DDD8CC] bg-[#ECE9E1] p-3">
      {/* 2D Flat Profile Card */}
      <div className="flex items-center gap-2.5 rounded-lg bg-white border border-[#CBD5E1] p-2.5">
        {/* Avatar */}
        <Avatar className="h-9 w-9 border border-[#CBD5E1] shrink-0">
          <AvatarFallback className="bg-[#E87545] text-xs font-bold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>

        {/* User Info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-[#111827] leading-snug">
            {user.name}
          </p>
          <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-[#E87545]">
            {user.role.replace(/_/g, ' ')}
          </p>
        </div>

        {/* Help & Support Trigger Button */}
        {onOpenSupport && (
          <button
            onClick={() => {
              onNavigate?.();
              onOpenSupport();
            }}
            title="Contact Us / Support"
            aria-label="Contact Support"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#2563EB] transition-colors duration-150 hover:bg-[#EFF6FF] hover:text-[#1D4ED8] hover:border-[#BFDBFE]"
          >
            <LifeBuoy className="h-4 w-4" />
          </button>
        )}

        {/* Logout Action Button */}
        <button
          onClick={() => {
            onNavigate?.();
            onLogout();
          }}
          title="Sign out"
          aria-label="Sign out"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#475569] transition-colors duration-150 hover:bg-[#FEE2E2] hover:text-[#C62828] hover:border-[#FECACA]"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}


