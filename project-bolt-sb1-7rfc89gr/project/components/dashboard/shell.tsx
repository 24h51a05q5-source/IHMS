'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Building2, ChevronDown, LogOut, Menu, Bell, X, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { getNavForRole, type NavItem } from '@/lib/auth/nav-config';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { realtime } from '@/lib/realtime/socket';
import { useRealtimeEvent } from '@/lib/realtime/use-realtime';

interface ShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: ShellProps) {
  const pathname = usePathname();
  const { user, logout, branches, currentBranchId, setBranch } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    realtime.configure(process.env.NEXT_PUBLIC_WS_URL || '');
    realtime.connect();
    return () => realtime.disconnect();
  }, []);

  useRealtimeEvent('notification.created', () => setNotifCount((c) => c + 1));

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (!user) return null;
  const nav = getNavForRole(user.role);

  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="sidebar-scroll fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-gradient-sidebar text-sidebar-foreground shadow-sidebar lg:flex xl:w-72">
        <SidebarBrand />
        <nav className="flex-1 overflow-y-auto px-4 py-4">
          <SidebarNav nav={nav} pathname={pathname} />
        </nav>
        <SidebarFooter user={user} initials={initials} onLogout={logout} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="sidebar-scroll absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-gradient-sidebar text-sidebar-foreground animate-slide-in-right shadow-sidebar">
            <div className="flex items-center justify-between p-4">
              <SidebarBrand compact />
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="text-sidebar-foreground/70 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-4 py-2">
              <SidebarNav nav={nav} pathname={pathname} />
            </nav>
            <SidebarFooter user={user} initials={initials} onLogout={logout} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64 xl:pl-72">
        <Header
          onMenuClick={() => setMobileOpen(true)}
          user={user}
          initials={initials}
          onLogout={logout}
          branches={branches}
          currentBranchId={currentBranchId}
          onBranchChange={setBranch}
          notifCount={notifCount}
        />
        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className="mx-auto w-full max-w-7xl animate-fade-in-up">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SidebarBrand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-3 px-5 py-5">
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
        <Building2 className="h-5 w-5 text-white" />
        <div className="absolute inset-0 rounded-xl bg-white/10" />
      </div>
      {!compact && (
        <div className="min-w-0">
          <p className="truncate text-base font-bold tracking-tight text-white">IHMS ERP</p>
          <p className="truncate text-[11px] font-medium text-sidebar-muted">Hostel Management</p>
        </div>
      )}
    </Link>
  );
}

function SidebarNav({ nav, pathname }: { nav: NavItem[]; pathname: string }) {
  return (
    <ul className="space-y-1">
      {nav.map((item) => {
        const Icon = (Icons as unknown as Record<string, LucideIcon>)[item.icon] ?? Icons.Circle;
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                active
                  ? 'bg-gradient-primary text-white shadow-lg shadow-primary/20'
                  : 'text-sidebar-muted hover:bg-white/5 hover:text-white',
              )}
            >
              {active && <span className="absolute -left-4 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-accent" />}
              <Icon className={cn('h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110', active ? 'text-white' : 'text-sidebar-muted/70 group-hover:text-white')} />
              <span className="truncate">{item.label}</span>
              {item.badge === 'notifications' && (
                <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50 lg:block" />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarFooter({ user, initials, onLogout }: { user: { name: string; email: string; role: string }; initials: string; onLogout: () => void }) {
  return (
    <div className="border-t border-white/10 p-4">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/5">
        <Avatar className="h-9 w-9 border border-white/15 ring-2 ring-white/5">
          <AvatarFallback className="bg-gradient-primary text-xs font-semibold text-white">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-white">{user.name}</p>
          <p className="truncate text-[10px] capitalize text-sidebar-muted">{user.role.replace(/_/g, ' ').toLowerCase()}</p>
        </div>
        <button onClick={onLogout} aria-label="Sign out" className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-white/10 hover:text-white">
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

interface HeaderProps {
  onMenuClick: () => void;
  user: { name: string; email: string; role: string };
  initials: string;
  onLogout: () => void;
  branches: { id: string; code: string; name: string }[];
  currentBranchId: string | null;
  onBranchChange: (id: string) => void;
  notifCount: number;
}

function Header({ onMenuClick, user, initials, onLogout, branches, currentBranchId, onBranchChange, notifCount }: HeaderProps) {
  const current = branches.find((b) => b.id === currentBranchId);

  return (
    <header className="glass sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border/60 px-4 sm:gap-3 sm:px-6 lg:h-[68px]">
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Branch selector */}
      {branches.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium shadow-premium transition-all hover:shadow-premium-hover sm:text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                <Building2 className="h-3.5 w-3.5 text-primary" />
              </span>
              <span className="hidden truncate sm:inline">{current ? `${current.code} · ${current.name}` : 'Select branch'}</span>
              <span className="truncate sm:hidden">{current?.code || 'Select'}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 shadow-premium-lg">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Your branches</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {branches.map((b) => (
              <DropdownMenuItem
                key={b.id}
                onClick={() => onBranchChange(b.id)}
                className={cn(b.id === currentBranchId && 'bg-primary/5')}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{b.code} · {b.name}</span>
                </div>
                {b.id === currentBranchId && <ShieldCheck className="ml-auto h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Link
          href={user.role === 'STUDENT' ? '/student/notifications' : '/notifications'}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
          {notifCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full border-2 border-card bg-destructive px-1 text-[10px] font-bold text-white shadow-sm">
              {notifCount > 9 ? '9+' : notifCount}
            </span>
          )}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-muted">
              <Avatar className="h-8 w-8 ring-2 ring-border/50">
                <AvatarFallback className="bg-gradient-primary text-xs font-semibold text-white">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:block">{user.name.split(' ')[0]}</span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 shadow-premium-lg">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{user.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
              <span className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-gradient-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                <Sparkles className="h-2.5 w-2.5" />
                {user.role.replace(/_/g, ' ')}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
