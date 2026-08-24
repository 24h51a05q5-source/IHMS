const fs = require('fs');
const path = require('path');

const content = `'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { FileBarChart, Download, Printer, Users, CreditCard, Building } from 'lucide-react';

export default function ReportsPage() {
  const { activeBranchId } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiRequest(\`/dashboard/stats?\${activeBranchId ? \`branchId=\${activeBranchId}\` : ''}\`),
      apiRequest(\`/students?\${activeBranchId ? \`branchId=\${activeBranchId}\` : ''}\`),
    ])
      .then(([statsRes, stdRes]) => {
        if (statsRes.success) setStats(statsRes.data);
        if (stdRes.success) setStudents(stdRes.data);
      })
      .finally(() => setLoading(false));
  }, [activeBranchId]);

  const defaulters = students.filter((s) => s.financialSummary?.outstandingBalance > 0);

  const handleExportCSV = () => {
    const headers = ['Customer Code', 'Full Name', 'Phone', 'Room/Bed', 'Total Demanded (INR)', 'Total Paid (INR)', 'Outstanding Dues (INR)'];
    const rows = defaulters.map((d) => [
      d.customerCode,
      \`"\${d.fullName}"\`,
      d.phone,
      d.currentAssignment?.bedCode || 'N/A',
      d.financialSummary?.totalDemanded || 0,
      d.financialSummary?.totalPaid || 0,
      d.financialSummary?.outstandingBalance || 0,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', \`IHMS_Defaulters_Report_\${new Date().toISOString().slice(0, 10)}.csv\`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-black text-white">Reports & Financial Analytics</h2>
          <p className="text-xs text-slate-400 mt-1">Audit-ready defaulter lists, collection logs & PDF/CSV export</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition"
          >
            <Printer className="h-4 w-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden printable-area">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Student Fee Defaulters List</h3>
            <p className="text-xs text-slate-400">Students with pending balance dues</p>
          </div>
          <span className="rounded-md bg-amber-950 px-2 py-0.5 text-xs font-mono font-bold text-amber-400 border border-amber-800">
            {defaulters.length} Defaulters Found
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Customer Code</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4">Assigned Bed</th>
                <th className="py-3 px-4">Guardian Contact</th>
                <th className="py-3 px-4">Total Billed</th>
                <th className="py-3 px-4">Total Paid</th>
                <th className="py-3 px-4">Outstanding Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
              {defaulters.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-emerald-400">
                    🎉 Excellent! Zero fee defaulters found across current selection.
                  </td>
                </tr>
              ) : (
                defaulters.map((d) => (
                  <tr key={d._id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">{d.customerCode}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white">{d.fullName}</div>
                      <div className="text-[11px] text-slate-400">{d.phone}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono">{d.currentAssignment?.bedCode || 'N/A'}</td>
                    <td className="py-3.5 px-4 text-slate-400">{d.guardian?.name} ({d.guardian?.phone})</td>
                    <td className="py-3.5 px-4 font-mono">₹{d.financialSummary?.totalDemanded?.toLocaleString('en-IN')}</td>
                    <td className="py-3.5 px-4 font-mono text-emerald-400">₹{d.financialSummary?.totalPaid?.toLocaleString('en-IN')}</td>
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                      ₹{d.financialSummary?.outstandingBalance?.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
`;

fs.writeFileSync(path.join(__dirname, 'frontend/src/app/reports/page.tsx'), content.trim() + '\n', 'utf8');
console.log('Fixed reports/page.tsx');