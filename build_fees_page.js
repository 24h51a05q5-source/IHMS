const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

write('frontend/src/app/fees/page.tsx', `
'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { apiRequest } from '../../lib/api';
import { CreditCard, Plus, CheckCircle, Receipt, ArrowUpRight, Clock, FileText, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function FeesPage() {
  const { user, activeBranchId } = useAuth();
  const { socket } = useSocket();
  const [payments, setPayments] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [myStatement, setMyStatement] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<any>(null);

  const [collectForm, setCollectForm] = useState({
    studentId: '',
    amount: '',
    paymentMethod: 'UPI',
    transactionRef: '',
    notes: '',
  });

  const isStudent = user?.role === 'STUDENT';

  const fetchFeeData = async () => {
    setLoading(true);
    try {
      if (isStudent) {
        const stmtRes = await apiRequest('/fees/my-statement');
        if (stmtRes.success && stmtRes.data) {
          setMyStatement(stmtRes.data);
          setPayments(stmtRes.data.payments || []);
          setReceipts(stmtRes.data.receipts || []);
        }
      } else {
        const payRes = await apiRequest(\`/fees/payments?\${activeBranchId ? \`branchId=\${activeBranchId}\` : ''}\`);
        if (payRes.success && payRes.data) setPayments(payRes.data);

        const recRes = await apiRequest(\`/fees/receipts?\${activeBranchId ? \`branchId=\${activeBranchId}\` : ''}\`);
        if (recRes.success && recRes.data) setReceipts(recRes.data);

        const stdRes = await apiRequest(\`/students?\${activeBranchId ? \`branchId=\${activeBranchId}\` : ''}\`);
        if (stdRes.success && stdRes.data) setStudents(stdRes.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeeData();
  }, [activeBranchId, user]);

  useEffect(() => {
    if (!socket) return;
    const handlePayUpdate = () => fetchFeeData();
    socket.on('payment.completed', handlePayUpdate);
    return () => { socket.off('payment.completed', handlePayUpdate); };
  }, [socket]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/fees/payments', {
        method: 'POST',
        body: JSON.stringify({
          ...collectForm,
          amount: Number(collectForm.amount),
        }),
      });

      if (res.success && res.data) {
        setShowCollectModal(false);
        setActiveReceipt(res.data.receipt);
        setShowReceiptModal(true);
        setCollectForm({ studentId: '', amount: '', paymentMethod: 'UPI', transactionRef: '', notes: '' });
        fetchFeeData();
      }
    } catch (err: any) {
      alert(err.message || 'Payment recording failed');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-black text-white">
            {isStudent ? 'My Fee Statement & Receipts' : 'Fee Collection & Billing Engine'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real immutable payment ledger, automated receipt numbering & balance sync
          </p>
        </div>

        <button
          onClick={() => setShowCollectModal(true)}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition"
        >
          <CreditCard className="h-4 w-4" />
          <span>{isStudent ? 'Pay Fee Online' : 'Record Fee Payment'}</span>
        </button>
      </div>

      {isStudent && myStatement && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Demanded</span>
            <div className="text-2xl font-black text-white mt-1">
              ₹{myStatement.summary?.totalDemanded?.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Total hostel dues billed</p>
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Paid</span>
            <div className="text-2xl font-black text-emerald-400 mt-1">
              ₹{myStatement.summary?.totalPaid?.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Verified collections</p>
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Outstanding Balance</span>
            <div className="text-2xl font-black text-amber-300 mt-1">
              ₹{myStatement.summary?.outstandingBalance?.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Due immediately</p>
          </div>
        </div>
      )}

      {/* Receipts Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Receipt className="h-4 w-4 text-emerald-400" />
            <span>Generated Receipts (Audit Logged)</span>
          </h3>
          <span className="text-xs font-mono text-slate-400">{receipts.length} Receipts</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Receipt Number</th>
                <th className="py-3 px-4">Student & Customer Code</th>
                <th className="py-3 px-4">Amount Paid</th>
                <th className="py-3 px-4">Method & Ref</th>
                <th className="py-3 px-4">Issued Date</th>
                <th className="py-3 px-4 text-right">Receipt Voucher</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    No receipts issued yet.
                  </td>
                </tr>
              ) : (
                receipts.map((rec) => (
                  <tr key={rec._id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">
                      {rec.receiptNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white">{rec.studentName}</div>
                      <div className="font-mono text-[11px] text-slate-400">{rec.customerCode}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-white">
                      ₹{rec.amount?.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-200">{rec.paymentMethod}</div>
                      <div className="font-mono text-[10px] text-slate-400">{rec.transactionRef}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(rec.issuedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => {
                          setActiveReceipt(rec);
                          setShowReceiptModal(true);
                        }}
                        className="rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 transition"
                      >
                        View / Print
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collect Modal */}
      {showCollectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              {isStudent ? 'Online Fee Payment' : 'Record Student Fee Payment'}
            </h3>

            <form onSubmit={handleRecordPayment} className="space-y-3">
              {!isStudent && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Select Student</label>
                  <select
                    required
                    value={collectForm.studentId}
                    onChange={(e) => setCollectForm({ ...collectForm, studentId: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="">-- Choose Student --</option>
                    {students.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.fullName} ({s.customerCode}) — Due: ₹{s.financialSummary?.outstandingBalance}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Amount to Pay (₹)</label>
                <input
                  type="number"
                  required
                  min={1}
                  step={100}
                  placeholder="e.g. 8000"
                  value={collectForm.amount}
                  onChange={(e) => setCollectForm({ ...collectForm, amount: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Payment Method</label>
                  <select
                    value={collectForm.paymentMethod}
                    onChange={(e) => setCollectForm({ ...collectForm, paymentMethod: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="UPI">UPI / QR Code</option>
                    <option value="CASH">Cash at Desk</option>
                    <option value="CARD">Debit / Credit Card</option>
                    <option value="BANK_TRANSFER">Bank NEFT / IMPS</option>
                    <option value="ONLINE">Online Payment Gateway</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Transaction Ref / UTR</label>
                  <input
                    type="text"
                    placeholder="Optional UTR / Ref"
                    value={collectForm.transactionRef}
                    onChange={(e) => setCollectForm({ ...collectForm, transactionRef: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Remarks</label>
                <input
                  type="text"
                  placeholder="Monthly rent / deposit remarks"
                  value={collectForm.notes}
                  onChange={(e) => setCollectForm({ ...collectForm, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCollectModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  Confirm & Generate Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      {showReceiptModal && activeReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-2xl space-y-6 printable-area">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-black text-white">OFFICIAL FEE RECEIPT</h3>
                <p className="text-xs text-slate-400">Integrated Hostel Management System (IHMS)</p>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-emerald-400 text-sm">{activeReceipt.receiptNumber}</div>
                <div className="text-[11px] text-slate-400">{new Date(activeReceipt.issuedAt).toLocaleString()}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <p className="text-slate-400">Received From:</p>
                <p className="font-bold text-white text-sm">{activeReceipt.studentName}</p>
                <p className="font-mono text-emerald-400 font-bold">{activeReceipt.customerCode}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-slate-400">Payment Mode:</p>
                <p className="font-bold text-white">{activeReceipt.paymentMethod}</p>
                <p className="font-mono text-slate-400 text-[10px]">Ref: {activeReceipt.transactionRef}</p>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-800/80 p-4 border border-slate-700 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-200">Total Amount Received:</span>
              <span className="text-2xl font-black text-emerald-400 font-mono">
                ₹{activeReceipt.amount?.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <div className="text-left text-[11px] text-slate-400">
                <p>Issued By: {activeReceipt.issuedBy || 'System'}</p>
                <p>Status: <strong className="text-emerald-400">VERIFIED & POSTED</strong></p>
              </div>

              {activeReceipt.qrPayload && (
                <div className="bg-white p-2 rounded-xl">
                  <img src={activeReceipt.qrPayload} alt="Receipt QR" className="h-16 w-16" />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 print:hidden pt-2">
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
              >
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
`);