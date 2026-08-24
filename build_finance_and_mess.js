const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

// 1. Finance Page
write('frontend/src/app/finance/page.tsx', `
'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { apiRequest } from '../../lib/api';
import { PieChart, Plus, TrendingUp, TrendingDown, DollarSign, FileText } from 'lucide-react';

export default function FinancePage() {
  const { activeBranchId } = useAuth();
  const { socket } = useSocket();
  const [pnl, setPnl] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddExpense, setShowAddExpense] = useState(false);

  const [expenseForm, setExpenseForm] = useState({
    category: 'ELECTRICITY',
    amount: '',
    paidTo: '',
    description: '',
    paymentMethod: 'CASH',
    invoiceOrBillNumber: '',
  });

  const fetchFinanceData = async () => {
    setLoading(true);
    try {
      const pnlRes = await apiRequest(\`/finance/profit-and-loss?\${activeBranchId ? \`branchId=\${activeBranchId}\` : ''}\`);
      if (pnlRes.success && pnlRes.data) setPnl(pnlRes.data);

      const expRes = await apiRequest(\`/finance/expenses?\${activeBranchId ? \`branchId=\${activeBranchId}\` : ''}\`);
      if (expRes.success && expRes.data) setExpenses(expRes.data);

      const vchRes = await apiRequest(\`/finance/vouchers?\${activeBranchId ? \`branchId=\${activeBranchId}\` : ''}\`);
      if (vchRes.success && vchRes.data) setVouchers(vchRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinanceData();
  }, [activeBranchId]);

  useEffect(() => {
    if (!socket) return;
    socket.on('expense.created', fetchFinanceData);
    socket.on('payment.completed', fetchFinanceData);
    return () => {
      socket.off('expense.created', fetchFinanceData);
      socket.off('payment.completed', fetchFinanceData);
    };
  }, [socket]);

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          ...expenseForm,
          branchId: activeBranchId,
          amount: Number(expenseForm.amount),
        }),
      });
      if (res.success) {
        setShowAddExpense(false);
        setExpenseForm({ category: 'ELECTRICITY', amount: '', paidTo: '', description: '', paymentMethod: 'CASH', invoiceOrBillNumber: '' });
        fetchFinanceData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to record expense');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-black text-white">Finance & General Ledger (P&L)</h2>
          <p className="text-xs text-slate-400 mt-1">Real Profit & Loss statement calculation & double-entry journal vouchers</p>
        </div>
        <button
          onClick={() => setShowAddExpense(true)}
          className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-rose-600/20 hover:bg-rose-500 transition"
        >
          <Plus className="h-4 w-4" />
          <span>Record Expense Voucher</span>
        </button>
      </div>

      {/* P&L Statement Banner */}
      {pnl && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Real-Time Profit & Loss Statement (MongoDB Aggregation Pipeline)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl bg-emerald-950/40 p-4 border border-emerald-800/50">
              <span className="text-xs font-semibold text-emerald-400">Total Verified Collections (Income)</span>
              <div className="text-2xl font-black text-white font-mono mt-1">
                ₹{pnl.summary?.totalIncome?.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="rounded-xl bg-rose-950/40 p-4 border border-rose-800/50">
              <span className="text-xs font-semibold text-rose-400">Total Operating Expenses</span>
              <div className="text-2xl font-black text-white font-mono mt-1">
                ₹{pnl.summary?.totalExpenses?.toLocaleString('en-IN')}
              </div>
            </div>
            <div className={\`rounded-xl p-4 border \${pnl.summary?.isProfitable ? 'bg-emerald-950/60 border-emerald-700' : 'bg-rose-950/60 border-rose-700'}\`}>
              <span className="text-xs font-semibold text-slate-200">Net Profit / Loss</span>
              <div className={\`text-2xl font-black font-mono mt-1 \${pnl.summary?.isProfitable ? 'text-emerald-400' : 'text-rose-400'}\`}>
                ₹{pnl.summary?.netProfitOrLoss?.toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                {pnl.summary?.isProfitable ? 'OPERATING IN PROFIT' : 'NET OPERATING LOSS'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Expenses Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">Expense Records</h3>
          <span className="text-xs font-mono text-slate-400">{expenses.length} Expenses Logged</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Expense No</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Paid To</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Approved By</th>
                <th className="py-3 px-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
              {expenses.map((exp) => (
                <tr key={exp._id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-200">{exp.expenseNumber}</td>
                  <td className="py-3.5 px-4">
                    <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300 border border-slate-700">
                      {exp.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-white">{exp.paidTo}</td>
                  <td className="py-3.5 px-4 text-slate-400">{exp.description || 'N/A'}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-rose-400">₹{exp.amount?.toLocaleString('en-IN')}</td>
                  <td className="py-3.5 px-4 text-slate-400">{exp.approvedBy}</td>
                  <td className="py-3.5 px-4 text-slate-400">{new Date(exp.date).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Expense Modal */}
      {showAddExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Record Operating Expense</h3>
            <form onSubmit={handleRecordExpense} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Expense Category</label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="ELECTRICITY">Electricity Bill</option>
                    <option value="FOOD_PROVISIONS">Food / Groceries</option>
                    <option value="SALARY">Staff Salaries</option>
                    <option value="WATER">Water Supply</option>
                    <option value="INTERNET">High-Speed Wi-Fi</option>
                    <option value="SECURITY">Security Charges</option>
                    <option value="HOUSEKEEPING">Housekeeping</option>
                    <option value="REPAIRS">Plumbing & Repairs</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="OTHER">Other Expense</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="e.g. 4500"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Paid To (Vendor / Person)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Balaji Groceries / TSSPDCL"
                  value={expenseForm.paidTo}
                  onChange={(e) => setExpenseForm({ ...expenseForm, paidTo: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description / Bill Narration</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly groceries invoice"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddExpense(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-500"
                >
                  Post Expense to Ledger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
`);

// 2. Mess Page
write('frontend/src/app/mess/page.tsx', `
'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { Utensils, Edit, CheckSquare, Users } from 'lucide-react';

export default function MessPage() {
  const { user, activeBranchId } = useAuth();
  const [menu, setMenu] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ BREAKFAST: 0, LUNCH: 0, SNACKS: 0, DINNER: 0 });
  const [customerCode, setCustomerCode] = useState('');
  const [mealType, setMealType] = useState('LUNCH');
  const [loading, setLoading] = useState(true);

  const fetchMessData = async () => {
    setLoading(true);
    try {
      const menuRes = await apiRequest(\`/mess/menu?\${activeBranchId ? \`branchId=\${activeBranchId}\` : ''}\`);
      if (menuRes.success && menuRes.data) setMenu(menuRes.data);

      const statsRes = await apiRequest(\`/mess/attendance/stats?\${activeBranchId ? \`branchId=\${activeBranchId}\` : ''}\`);
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessData();
  }, [activeBranchId]);

  const handleMarkAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/mess/attendance', {
        method: 'POST',
        body: JSON.stringify({ customerCode, mealType, branchId: activeBranchId }),
      });
      if (res.success) {
        alert(\`Meal marked for \${res.data.studentName}\`);
        setCustomerCode('');
        fetchMessData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to mark meal');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-black text-white">Mess & Kitchen Management</h2>
          <p className="text-xs text-slate-400 mt-1">7-Day rotating nutritious meal schedule & live dining attendance</p>
        </div>
      </div>

      {/* Daily Meal Attendance Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(stats).map(([meal, count]) => (
          <div key={meal} className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{meal} Served Today</span>
            <div className="text-2xl font-black text-emerald-400 font-mono mt-1">{count as number} Students</div>
          </div>
        ))}
      </div>

      {/* Staff Meal Check-In Tool */}
      {user?.role !== 'STUDENT' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white mb-3">
            Quick Dining Hall Student Check-In
          </h3>
          <form onSubmit={handleMarkAttendance} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              required
              placeholder="Enter Student Customer Code (e.g. HYD001-ST000001)"
              value={customerCode}
              onChange={(e) => setCustomerCode(e.target.value.toUpperCase())}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none font-mono"
            />
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
            >
              <option value="BREAKFAST">Breakfast</option>
              <option value="LUNCH">Lunch</option>
              <option value="SNACKS">Evening Snacks</option>
              <option value="DINNER">Dinner</option>
            </select>
            <button
              type="submit"
              className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition"
            >
              Mark Meal
            </button>
          </form>
        </div>
      )}

      {/* 7-Day Rotating Menu */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white">7-Day Weekly Mess Menu</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {menu.map((m) => (
            <div
              key={m._id || m.dayOfWeek}
              className={\`rounded-2xl border p-5 shadow-xl space-y-3 \${
                m.isSpecial ? 'border-amber-700/60 bg-amber-950/20' : 'border-slate-800 bg-slate-900/90'
              }\`}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-sm font-black text-white">{m.dayName}</span>
                {m.isSpecial && (
                  <span className="rounded-md bg-amber-950 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-800">
                    SPECIAL
                  </span>
                )}
              </div>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Breakfast</span>
                  <p className="text-slate-300 mt-0.5">{m.breakfast}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Lunch</span>
                  <p className="text-slate-300 mt-0.5">{m.lunch}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Snacks</span>
                  <p className="text-slate-300 mt-0.5">{m.snacks}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Dinner</span>
                  <p className="text-slate-300 mt-0.5">{m.dinner}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
`);