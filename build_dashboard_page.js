const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

write('frontend/src/app/dashboard/page.tsx', `
'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { apiRequest } from '../../lib/api';
import {
  Bed,
  Users,
  CreditCard,
  TrendingUp,
  AlertCircle,
  Clock,
  UserCheck,
  Building,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  PlusCircle,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { user, activeBranchId } = useAuth();
  const { socket } = useSocket();
  const [stats, setStats] = useState<any>(null);
  const [branchComparisons, setBranchComparisons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const url = activeBranchId ? \`/dashboard/stats?branchId=\${activeBranchId}\` : '/dashboard/stats';
      const statsRes = await apiRequest(url);
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }

      if (user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN') {
        const compRes = await apiRequest('/dashboard/branch-comparison');
        if (compRes.success && compRes.data) {
          setBranchComparisons(compRes.data);
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [activeBranchId, user]);

  // Real-time Dashboard KPI auto-refresh
  useEffect(() => {
    if (!socket) return;
    const handleKpiUpdate = () => {
      fetchDashboardData();
    };
    socket.on('dashboard.kpi_updated', handleKpiUpdate);
    socket.on('payment.completed', handleKpiUpdate);
    socket.on('bed.status_changed', handleKpiUpdate);
    socket.on('complaint.created', handleKpiUpdate);
    socket.on('complaint.resolved', handleKpiUpdate);

    return () => {
      socket.off('dashboard.kpi_updated', handleKpiUpdate);
      socket.off('payment.completed', handleKpiUpdate);
      socket.off('bed.status_changed', handleKpiUpdate);
      socket.off('complaint.created', handleKpiUpdate);
      socket.off('complaint.resolved', handleKpiUpdate);
    };
  }, [socket, activeBranchId]);

  const kpi = stats?.kpi || {
    totalBranches: 0,
    totalBeds: 0,
    occupiedBeds: 0,
    availableBeds: 0,
    occupancyRate: 0,
    totalStudents: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    netProfitOrLoss: 0,
    totalDemanded: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    collectionPercentage: 0,
    pendingComplaints: 0,
    pendingLeaves: 0,
    activeVisitors: 0,
  };

  return (
    <DashboardLayout>
      {/* Top Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <span>Enterprise ERP Dashboard</span>
            <span className="rounded-md bg-emerald-950 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 border border-emerald-800">
              MongoDB NoSQL
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Welcome, <span className="font-semibold text-slate-200">{user?.name}</span> ({user?.role}) • Real-time Data Synchronization Active
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboardData}
            className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
          >
            <RefreshCw className={\`h-3.5 w-3.5 \${loading ? 'animate-spin text-emerald-400' : ''}\`} />
            <span>Refresh Live Data</span>
          </button>

          {user?.role !== 'STUDENT' && (
            <Link
              href="/students"
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Admit Student</span>
            </Link>
          )}
        </div>
      </div>

      {/* KPI Metric Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Occupancy */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/90 p-5 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Bed Occupancy</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-950 text-indigo-400 border border-indigo-800/50">
              <Bed className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-black text-white">
              {kpi.occupiedBeds} <span className="text-sm font-semibold text-slate-400">/ {kpi.totalBeds} Beds</span>
            </div>
            <div className="text-xs font-bold text-indigo-400 font-mono">
              {kpi.occupancyRate}%
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500"
              style={{ width: \`\${Math.min(100, kpi.occupancyRate)}%\` }}
            ></div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>Available: <strong className="text-emerald-400">{kpi.availableBeds}</strong></span>
            <span>Total Capacity: <strong className="text-slate-300">{kpi.totalBeds}</strong></span>
          </div>
        </div>

        {/* Monthly Revenue (Verified In-DB Payments) */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/90 p-5 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Monthly Revenue</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800/50">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-black text-white">
              ₹{kpi.monthlyIncome.toLocaleString('en-IN')}
            </div>
            <div className="flex items-center text-xs font-bold text-emerald-400">
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>Verified</span>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Actual payments recorded in MongoDB this month
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[11px]">
            <span className="text-slate-400">Collection Rate:</span>
            <span className="font-mono font-bold text-emerald-400">{kpi.collectionPercentage}%</span>
          </div>
        </div>

        {/* Monthly Expenses & P&L */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/90 p-5 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Monthly Expenses</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-950 text-rose-400 border border-rose-800/50">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-black text-white">
              ₹{kpi.monthlyExpenses.toLocaleString('en-IN')}
            </div>
            <div className={\`flex items-center text-xs font-bold font-mono \${kpi.netProfitOrLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}\`}>
              Net: ₹{kpi.netProfitOrLoss.toLocaleString('en-IN')}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Provisions, Utilities, Salaries & Repairs
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[11px]">
            <span className="text-slate-400">P&L Status:</span>
            <span className={\`font-bold \${kpi.netProfitOrLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}\`}>
              {kpi.netProfitOrLoss >= 0 ? 'PROFITABLE' : 'NET LOSS'}
            </span>
          </div>
        </div>

        {/* Outstanding Student Dues */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/90 p-5 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Outstanding Dues</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-950 text-amber-400 border border-amber-800/50">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-black text-amber-300">
              ₹{kpi.totalOutstanding.toLocaleString('en-IN')}
            </div>
            <div className="text-xs font-bold text-slate-400">
              {kpi.totalStudents} Active Students
            </div>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Total pending fees across current academic period
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[11px]">
            <span className="text-slate-400">Total Demanded:</span>
            <span className="font-mono font-bold text-slate-200">₹{kpi.totalDemanded.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* Operational Highlights Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/complaints" className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-4 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-950/80 text-rose-400 border border-rose-800/40">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Pending Complaints</h4>
                <p className="text-[11px] text-slate-400">Maintenance & Tickets</p>
              </div>
            </div>
            <div className="text-2xl font-black text-rose-400 font-mono">
              {kpi.pendingComplaints}
            </div>
          </div>
        </Link>

        <Link href="/attendance" className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-4 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-950/80 text-amber-400 border border-amber-800/40">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Pending Leave Requests</h4>
                <p className="text-[11px] text-slate-400">Requires Warden Approval</p>
              </div>
            </div>
            <div className="text-2xl font-black text-amber-400 font-mono">
              {kpi.pendingLeaves}
            </div>
          </div>
        </Link>

        <Link href="/visitors" className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-4 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-950/80 text-indigo-400 border border-indigo-800/40">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Active Visitors Inside</h4>
                <p className="text-[11px] text-slate-400">Checked In with QR Pass</p>
              </div>
            </div>
            <div className="text-2xl font-black text-indigo-400 font-mono">
              {kpi.activeVisitors}
            </div>
          </div>
        </Link>
      </div>

      {/* Multi-Branch Consolidated Comparison Table (For Owner / Super Admin) */}
      {(user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN') && branchComparisons.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Consolidated Branch Performance (Multi-Tenant Aggregation)
              </h3>
              <p className="text-xs text-slate-400">
                Comparative metrics computed in real-time across your hostel branches
              </p>
            </div>
            <Link href="/reports" className="text-xs font-semibold text-emerald-400 hover:underline">
              View Detailed Analytics →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Branch Code & Name</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Capacity</th>
                  <th className="py-3 px-4">Occupancy</th>
                  <th className="py-3 px-4">Total Revenue</th>
                  <th className="py-3 px-4">Total Expenses</th>
                  <th className="py-3 px-4">Net Profit</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
                {branchComparisons.map((b) => (
                  <tr key={b.branchId} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-bold text-white">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-emerald-400">[{b.branchCode}]</span>
                        <span>{b.branchName}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">{b.city}</td>
                    <td className="py-3.5 px-4 font-mono">{b.totalBeds} Beds</td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: \`\${b.occupancyRate}%\` }}
                          ></div>
                        </div>
                        <span className="font-mono text-slate-200">{b.occupiedBeds} ({b.occupancyRate}%)</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">
                      ₹{b.totalRevenue.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-rose-400">
                      ₹{b.totalExpenses.toLocaleString('en-IN')}
                    </td>
                    <td className={\`py-3.5 px-4 font-mono font-bold \${b.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}\`}>
                      ₹{b.netProfit.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-800">
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
`);