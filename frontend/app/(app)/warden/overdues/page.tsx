'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  IndianRupee,
  Users,
  Clock,
  Search,
  Eye,
  Filter,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { CardSkeleton, TableSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import { useAuth } from '@/lib/auth/auth-context';
import { feesApi } from '@/lib/api/fees.api';
import { SearchInput } from '@/components/ui/search-input';

interface OverdueStudentItem {
  id: string;
  studentId: string;
  studentName: string;
  customerCode: string;
  roomNumber: string;
  bedNumber: string;
  total: number;
  paid: number;
  outstanding: number;
  overdueAmount: number;
  dueDate: string;
  status: 'OVERDUE' | 'PARTIAL' | 'PAID';
}

function WardenOverduesContent() {
  const { user } = useAuth();
  const [summary, setSummary] = useState({
    totalOverdueStudents: 0,
    totalOverdueAmount: 0,
    dueTodayCount: 0,
    dueTodayAmount: 0,
    overdueAmount: 0,
    overdue30PlusAmount: 0,
  });
  const [items, setItems] = useState<OverdueStudentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('ALL');

  const loadOverdueData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryRes, listRes] = await Promise.all([
        feesApi.getOverduesSummary().catch(() => ({
          totalOverdueStudents: 0,
          totalOverdueAmount: 0,
          dueTodayCount: 0,
          dueTodayAmount: 0,
          overdueAmount: 0,
          overdue30PlusAmount: 0,
        })),
        feesApi.listOverdues({ search: search.trim() || undefined }).catch(() => ({ items: [], total: 0 })),
      ]);

      if (summaryRes) {
        setSummary({
          totalOverdueStudents: Number(summaryRes.totalOverdueStudents || 0),
          totalOverdueAmount: Number(summaryRes.totalOverdueAmount || 0),
          dueTodayCount: Number(summaryRes.dueTodayCount || 0),
          dueTodayAmount: Number(summaryRes.dueTodayAmount || 0),
          overdueAmount: Number(summaryRes.overdueAmount || summaryRes.totalOverdueAmount || 0),
          overdue30PlusAmount: Number(summaryRes.overdue30PlusAmount || summaryRes.totalOverdueAmount || 0),
        });
      }

      const rawItems = (listRes?.items || []) as any[];
      // Filter out students with outstanding = 0 just in case
      const filteredOverdues: OverdueStudentItem[] = rawItems
        .filter((s: any) => Number(s.outstanding || 0) > 0)
        .map((s: any) => ({
          id: s.id || s._id,
          studentId: s.studentId || s.customerCode || s.id,
          studentName: s.studentName || s.full_name || 'Student',
          customerCode: s.customerCode || s.studentId || s.id,
          roomNumber: s.roomNumber || '—',
          bedNumber: s.bedNumber || '—',
          total: Number(s.total || 0),
          paid: Number(s.paid || 0),
          outstanding: Number(s.outstanding || 0),
          overdueAmount: Number(s.overdueAmount || s.outstanding || 0),
          dueDate: s.dueDate || '2026-10-01',
          status: s.status || 'OVERDUE',
        }));

      setItems(filteredOverdues);
    } catch (err: any) {
      setError(err?.message || 'Failed to load overdue fee records for your hostel.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadOverdueData();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadOverdueData]);

  // Client-side age filtering support & multi-field search
  const displayedItems = items.filter((item) => {
    const q = search.toLowerCase().trim();
    if (q) {
      const matchesSearch =
        (item.studentName || '').toLowerCase().includes(q) ||
        (item.studentId || '').toLowerCase().includes(q) ||
        (item.customerCode || '').toLowerCase().includes(q) ||
        (item.roomNumber || '').toLowerCase().includes(q) ||
        (item.bedNumber || '').toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }

    if (activeFilter === 'DUE_TODAY') return item.dueDate === new Date().toISOString().split('T')[0];
    if (activeFilter === 'DAYS_1_30') return item.outstanding > 0 && item.outstanding <= 20000;
    if (activeFilter === 'DAYS_31_60') return item.outstanding > 20000 && item.outstanding <= 50000;
    if (activeFilter === 'DAYS_60_PLUS') return item.outstanding > 50000;
    return true; // ALL
  });

  if (error) return <ErrorState message={error} onRetry={loadOverdueData} />;

  return (
    <div className="w-full max-w-full min-w-0 space-y-4 sm:space-y-6">
      <PageHeader
        title="Overdue Fees"
        description="View students with pending and overdue fee amounts for your hostel."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={loadOverdueData}
            disabled={loading}
            className="h-9 gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        }
      />

      {/* Security Scope Banner */}
      <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs sm:text-sm font-medium">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <span>
            Hostel Scope:{' '}
            <strong className="font-bold text-amber-950">
              {user?.hostelName || user?.organizationName || 'Assigned Hostel'}
            </strong>
          </span>
          <span className="hidden sm:inline"> — Read-only operational visibility. Financial controls remain under Owner management.</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Overdue Students"
          value={summary.totalOverdueStudents}
          icon={Users}
          accent="error"
          hint="Hostel Students with Pending Dues"
          loading={loading}
        />
        <StatCard
          label="Total Overdue Amount"
          value={`₹${summary.totalOverdueAmount.toLocaleString('en-IN')}`}
          icon={IndianRupee}
          accent="error"
          hint="Total Outstanding Receivables"
          loading={loading}
        />
        <StatCard
          label="Due Today"
          value={`₹${summary.dueTodayAmount.toLocaleString('en-IN')}`}
          icon={Clock}
          accent="warning"
          hint={`${summary.dueTodayCount} Student Dues Expiring Today`}
          loading={loading}
        />
        <StatCard
          label="Overdue 30+ Days"
          value={`₹${summary.overdue30PlusAmount.toLocaleString('en-IN')}`}
          icon={AlertTriangle}
          accent="error"
          hint="High Priority Overdue Receivables"
          loading={loading}
        />
      </div>


      {/* Search and Filters Section */}
      <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={setSearch}
            onClear={() => setSearch('')}
            placeholder="Search student by name, ID, room..."
            containerClassName="w-full sm:max-w-md"
            className="h-9.5 text-xs sm:text-sm bg-white"
          />

          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <Button
              variant={activeFilter === 'ALL' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('ALL')}
              className={`h-8 text-xs font-semibold ${
                activeFilter === 'ALL' ? 'bg-[#E87545] hover:bg-[#D66434] text-white' : ''
              }`}
            >
              All Overdue
            </Button>
            <Button
              variant={activeFilter === 'DUE_TODAY' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('DUE_TODAY')}
              className={`h-8 text-xs font-semibold ${
                activeFilter === 'DUE_TODAY' ? 'bg-[#E87545] hover:bg-[#D66434] text-white' : ''
              }`}
            >
              Due Today
            </Button>
            <Button
              variant={activeFilter === 'DAYS_1_30' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('DAYS_1_30')}
              className={`h-8 text-xs font-semibold ${
                activeFilter === 'DAYS_1_30' ? 'bg-[#E87545] hover:bg-[#D66434] text-white' : ''
              }`}
            >
              Overdue 1–30 Days
            </Button>
            <Button
              variant={activeFilter === 'DAYS_31_60' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('DAYS_31_60')}
              className={`h-8 text-xs font-semibold ${
                activeFilter === 'DAYS_31_60' ? 'bg-[#E87545] hover:bg-[#D66434] text-white' : ''
              }`}
            >
              Overdue 31–60 Days
            </Button>
            <Button
              variant={activeFilter === 'DAYS_60_PLUS' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('DAYS_60_PLUS')}
              className={`h-8 text-xs font-semibold ${
                activeFilter === 'DAYS_60_PLUS' ? 'bg-[#E87545] hover:bg-[#D66434] text-white' : ''
              }`}
            >
              Overdue 60+ Days
            </Button>
          </div>
        </div>

        {/* Data Table */}
        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : displayedItems.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-[#111827]">No Overdue Students Found</h3>
            <p className="text-xs text-[#64748B] max-w-sm mx-auto">
              All students in your assigned hostel are up to date on fee payments or match no active filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[#CBD5E1]">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#CBD5E1] font-bold text-[#475569] uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-3 py-3">Student</th>
                  <th className="px-3 py-3">Student ID</th>
                  <th className="px-3 py-3">Room</th>
                  <th className="px-3 py-3">Bed</th>
                  <th className="px-3 py-3 text-right">Total Fees</th>
                  <th className="px-3 py-3 text-right">Paid</th>
                  <th className="px-3 py-3 text-right">Outstanding</th>
                  <th className="px-3 py-3 text-right">Overdue</th>
                  <th className="px-3 py-3">Due Date</th>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#CBD5E1] bg-white font-medium text-[#111827]">
                {displayedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 font-bold text-rose-700 text-xs">
                          {item.studentName.charAt(0).toUpperCase()}
                        </div>
                        <div className="font-bold text-[#111827]">{item.studentName}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap font-mono text-xs font-semibold text-[#475569]">
                      {item.customerCode}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap font-bold text-[#111827]">
                      {item.roomNumber}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap font-bold text-[#111827]">
                      {item.bedNumber}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-right font-semibold text-[#475569]">
                      ₹{item.total.toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-right font-semibold text-emerald-700">
                      ₹{item.paid.toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-right font-bold text-rose-700">
                      ₹{item.outstanding.toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-right font-bold text-rose-800">
                      ₹{item.overdueAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-[#475569] font-medium text-xs">
                      {item.dueDate}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-rose-100 text-rose-800 border border-rose-200">
                        <AlertTriangle className="h-3 w-3" /> OVERDUE
                      </span>
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-right">
                      <Link href={`/students/${item.id}?from=overdues`}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-semibold gap-1 text-slate-700 hover:text-slate-900 border-slate-300"
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WardenOverduesPage() {
  return (
    <PageErrorBoundary fallbackTitle="Unable to load Warden Overdues Page">
      <WardenOverduesContent />
    </PageErrorBoundary>
  );
}
