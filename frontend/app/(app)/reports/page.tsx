'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Users, BedDouble, DollarSign, TrendingUp, FileText, Search, ShieldAlert, CalendarCheck } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { CardSkeleton } from '@/components/dashboard/loader';
import { EmptyState, ErrorState } from '@/components/dashboard/states';
import { reportsApi } from '@/lib/api/reports.api';
import { useAuth } from '@/lib/auth/auth-context';
import { getCachedData } from '@/lib/api/client';
import type { OwnerDashboardData, ApiError } from '@/lib/types';

export default function ReportsPage() {
  const { currentBranchId } = useAuth();
  const cachedData = getCachedData<OwnerDashboardData>('/dashboard/owner', currentBranchId ? { branchId: currentBranchId } : undefined);
  const [data, setData] = useState<OwnerDashboardData | null>(() => cachedData);
  const [loading, setLoading] = useState(() => !cachedData);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await reportsApi.ownerDashboard(currentBranchId || undefined);
      setData(res);
    } catch (err) {
      if (!data) {
        setError((err as ApiError)?.message || 'Unable to load analytics.');
      }
    } finally {
      setLoading(false);
    }
  }, [currentBranchId, data]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExport = (reportName: string) => {
    const dummyCsv = 'Date,Reference,Amount,Status\n2026-08-01,REF-1001,5500,SUCCESS\n2026-08-02,REF-1002,6000,SUCCESS';
    const blob = new Blob([dummyCsv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportName}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success(`${reportName} downloaded.`);
  };

  const reportItems = [
    {
      id: 'students',
      title: 'Student Master Register',
      description: 'Complete resident roster with room, bed, contact, and admission details',
      exportName: 'Student_Master_Register',
      icon: Users,
      iconBg: 'bg-[#ECE9E1] text-[#E87545] border-[#DDD8CC]',
    },
    {
      id: 'fees',
      title: 'Fee Collection & Dues Statement',
      description: 'Demanded vs collected statement with outstanding student list and receipts',
      exportName: 'Fee_Collection_Statement',
      icon: DollarSign,
      iconBg: 'bg-[#E8F5ED] text-[#087A45] border-[#B4E2C7]',
    },
    {
      id: 'expenses',
      title: 'Hostel Expense Statement',
      description: 'Itemized ledger of vendor payments, facilities, and maintenance costs',
      exportName: 'Expense_Audit_Ledger',
      icon: FileText,
      iconBg: 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]',
    },
    {
      id: 'occupancy',
      title: 'Room & Bed Occupancy Report',
      description: 'Floor-wise capacity, active bed allocations, and availability matrix',
      exportName: 'Room_Occupancy_Report',
      icon: BedDouble,
      iconBg: 'bg-[#FEF3C7] text-[#C94F18] border-[#FDE68A]',
    },
    {
      id: 'attendance',
      title: 'Attendance & Leave Audit Log',
      description: 'Biometric gate check-ins, resident absenteeism, and approved leave records',
      exportName: 'Attendance_Leave_Audit',
      icon: CalendarCheck,
      iconBg: 'bg-[#F3E8FF] text-[#9333EA] border-[#E9D5FF]',
    },
    {
      id: 'visitors',
      title: 'Visitor & Gate Pass Security Register',
      description: 'Guest entries, verification timestamps, and security pass logs',
      exportName: 'Visitor_Security_Register',
      icon: ShieldAlert,
      iconBg: 'bg-[#FEE2E2] text-[#C62828] border-[#FECACA]',
    },
  ];

  const filteredReports = reportItems.filter((r) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <CardSkeleton className="h-20 bg-[#F8FAFC]" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <CardSkeleton className="h-28 bg-[#F8FAFC]" />
          <CardSkeleton className="h-28 bg-[#F8FAFC]" />
          <CardSkeleton className="h-28 bg-[#F8FAFC]" />
          <CardSkeleton className="h-28 bg-[#F8FAFC]" />
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4 sm:space-y-5.5">
      <PageHeader
        title="Reports & Financial Analytics"
        description="Comprehensive intelligence on hostel occupancy, fee collections, operational expenses, and audit statements"
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <StatCard title="Active Students" value={data?.totalStudents || 0} icon={Users} />
        <StatCard title="Occupancy Rate" value={`${data?.occupancyPct || 0}%`} icon={BedDouble} />
        <StatCard title="Monthly Collection" value={`₹${(data?.monthlyCollection || 0).toLocaleString('en-IN')}`} icon={DollarSign} />
        <StatCard title="Outstanding Dues" value={`₹${(data?.outstandingFees || 0).toLocaleString('en-IN')}`} icon={TrendingUp} />
      </div>

      {/* Reports Search Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-[#F8FAFC] p-2.5 sm:p-3 rounded-xl border border-[#CBD5E1]">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search reports by title or description..."
          className="h-9 sm:h-10 text-xs sm:text-sm font-semibold"
          containerClassName="w-full sm:w-80"
        />
        <div className="text-xs font-bold text-[#64748B]">
          {search.trim() ? `Showing ${filteredReports.length} matching reports` : 'Official Audit & CSV Statements'}
        </div>
      </div>

      {!filteredReports.length ? (
        <EmptyState
          title="No reports match your search"
          description={`No reports found matching "${search}". Clear your search query to view all available reports.`}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filteredReports.map((report) => {
            const Icon = report.icon;
            return (
              <div
                key={report.id}
                className="rounded-xl border border-[#CBD5E1] bg-white p-3.5 sm:p-5 transition-colors duration-150 hover:bg-[#FFF8ED] hover:border-[#E87545] space-y-2.5 sm:space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2.5 sm:space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg border ${report.iconBg}`}>
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm sm:text-base text-[#000000]">{report.title}</h3>
                      <p className="text-xs font-semibold text-[#64748B]">{report.description}</p>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full gap-2 text-xs font-bold border-[#CBD5E1] bg-white text-[#111827] hover:bg-[#F8FAFC]"
                  onClick={() => handleExport(report.exportName)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
