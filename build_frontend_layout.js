const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

// 1. Root Layout
write('frontend/src/app/layout.tsx', `
import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { SocketProvider } from '../context/SocketContext';

export const metadata: Metadata = {
  title: 'IHMS — Integrated Hostel Management System ERP',
  description: 'Enterprise Multi-Tenant Hostel ERP Platform with Real-Time Data Sync',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen">
        <AuthProvider>
          <SocketProvider>
            {children}
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
`);

// 2. Landing / Root Page
write('frontend/src/app/page.tsx', `
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.push('/dashboard');
      } else {
        router.push('/auth/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
        <p className="text-sm font-medium text-slate-400">Loading IHMS ERP Enterprise System...</p>
      </div>
    </div>
  );
}
`);

// 3. Navbar
write('frontend/src/components/layout/Navbar.tsx', `
'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { apiRequest } from '../../lib/api';
import {
  Building2,
  Bell,
  LogOut,
  User as UserIcon,
  Wifi,
  WifiOff,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';

export function Navbar() {
  const { user, logout, activeBranchId, setActiveBranchId } = useAuth();
  const { isConnected, notifications, clearNotification } = useSocket();
  const [branches, setBranches] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    if (user?.organizationId) {
      apiRequest('/hostels')
        .then((res) => {
          if (res.success && res.data) {
            setBranches(res.data);
            if (!activeBranchId && res.data.length > 0) {
              setActiveBranchId(res.data[0]._id);
            }
          }
        })
        .catch(() => {});
    }
  }, [user, activeBranchId, setActiveBranchId]);

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-800 bg-slate-900/90 px-6 backdrop-blur">
      {/* Left: Organization & Active Branch Selector */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white shadow-lg shadow-emerald-600/30">
            IH
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">IHMS ERP</h1>
            <p className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block"></span>
              Multi-Tenant Enterprise
            </p>
          </div>
        </div>

        {branches.length > 0 && user?.role !== 'STUDENT' && (
          <div className="hidden md:flex items-center gap-2 pl-4 border-l border-slate-800">
            <Building2 className="h-4 w-4 text-emerald-400" />
            <select
              value={activeBranchId}
              onChange={(e) => setActiveBranchId(e.target.value)}
              className="bg-slate-800 text-xs font-semibold text-slate-200 rounded-lg px-3 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">All Branches (Consolidated)</option>
              {branches.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.branchCode} - {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Live Sync Badge, Notifications, User Profile */}
      <div className="flex items-center gap-3">
        {/* Real-time Status */}
        <div
          title={isConnected ? 'Connected to Socket.IO Real-time Stream' : 'Connecting to Real-time Stream...'}
          className={\`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium \${
            isConnected ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50' : 'bg-amber-950/60 text-amber-400 border border-amber-800/50'
          }\`}
        >
          {isConnected ? <Wifi className="h-3.5 w-3.5 animate-pulse" /> : <WifiOff className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{isConnected ? 'LIVE SYNC' : 'OFFLINE'}</span>
        </div>

        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
          >
            <Bell className="h-5 w-5" />
            {notifications.length > 0 && (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow-sm">
                {notifications.length}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-2xl z-50">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Activity Feed</h3>
                <span className="text-[11px] text-emerald-400">{notifications.length} events</span>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {notifications.length === 0 ? (
                  <p className="text-center py-4 text-xs text-slate-500">No new notifications</p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => clearNotification(n.id)}
                      className="cursor-pointer rounded-lg bg-slate-800/60 p-2.5 border border-slate-700/50 hover:bg-slate-800 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">{n.title}</span>
                        <span className="text-[10px] text-slate-400">{n.time}</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 rounded-lg bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 border border-slate-700 transition"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-700 text-white font-bold text-[11px]">
              {user?.name ? user.name[0].toUpperCase() : 'U'}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-slate-200 font-medium leading-none">{user?.name}</div>
              <div className="text-[10px] text-emerald-400 font-mono mt-0.5">{user?.role}</div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-800 bg-slate-900 p-2 shadow-2xl z-50">
              <div className="px-3 py-2 border-b border-slate-800 mb-1">
                <p className="text-xs font-semibold text-white">{user?.name}</p>
                <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                {user?.customerCode && (
                  <p className="text-[11px] font-mono text-emerald-400 mt-1">Code: {user.customerCode}</p>
                )}
              </div>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
`);

// 4. Sidebar
write('frontend/src/components/layout/Sidebar.tsx', `
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Building,
  Bed,
  Users,
  CreditCard,
  PieChart,
  Utensils,
  Package,
  CalendarCheck,
  UserCheck,
  AlertCircle,
  FileBarChart,
  Settings,
} from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role;

  const isStudent = role === 'STUDENT';
  const isAccountant = role === 'ACCOUNTANT';
  const isSecurity = role === 'SECURITY_GUARD';
  const isWarden = role === 'WARDEN' || role === 'BRANCH_MANAGER';

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { href: '/hostels', label: 'Hostel Branches', icon: Building, show: !isStudent && !isSecurity },
    { href: '/rooms', label: 'Rooms & Bed Grid', icon: Bed, show: !isStudent && !isSecurity },
    { href: '/students', label: 'Students & Admissions', icon: Users, show: !isStudent && !isSecurity },
    { href: '/fees', label: isStudent ? 'My Fees & Payments' : 'Fees & Billing Engine', icon: CreditCard, show: !isSecurity },
    { href: '/finance', label: 'Finance & Ledger (P&L)', icon: PieChart, show: !isStudent && !isSecurity && !isWarden },
    { href: '/mess', label: 'Mess & Menu Plan', icon: Utensils, show: true },
    { href: '/attendance', label: isStudent ? 'My Attendance & Leave' : 'Attendance & Leaves', icon: CalendarCheck, show: true },
    { href: '/visitors', label: 'Visitor Passes & QR', icon: UserCheck, show: true },
    { href: '/complaints', label: 'Maintenance & Tickets', icon: AlertCircle, show: true },
    { href: '/inventory', label: 'Assets & Stock', icon: Package, show: !isStudent && !isSecurity },
    { href: '/reports', label: 'Reports & Analytics', icon: FileBarChart, show: !isStudent && !isSecurity },
    { href: '/settings', label: 'Organization Settings', icon: Settings, show: role === 'OWNER' || role === 'SUPER_ADMIN' },
  ];

  return (
    <aside className="w-64 flex-shrink-0 border-r border-slate-800 bg-slate-900/60 p-4 flex flex-col justify-between hidden md:flex min-h-[calc(100vh-4rem)]">
      <div className="space-y-1">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Main Navigation
        </div>
        {navItems
          .filter((item) => item.show)
          .map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={\`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition \${
                  isActive
                    ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-500/10'
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                }\`}
              >
                <Icon className={\`h-4 w-4 \${isActive ? 'text-emerald-400' : 'text-slate-400'}\`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
      </div>

      {/* Tenant Branding Card */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-800/40 p-3 text-xs">
        <p className="text-[11px] font-medium text-slate-400">Connected System</p>
        <p className="font-bold text-slate-200 truncate mt-0.5">MongoDB Atlas NoSQL</p>
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span>Tenant Isolated</span>
          <span className="text-emerald-400 font-bold">ACTIVE</span>
        </div>
      </div>
    </aside>
  );
}
`);

// 5. Dashboard Layout Shell
write('frontend/src/components/layout/DashboardLayout.tsx', `
'use client';

import React from 'react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
          <p className="text-xs text-slate-400 font-mono">Authenticating session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (typeof window !== 'undefined') {
      router.push('/auth/login');
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-950">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
`);