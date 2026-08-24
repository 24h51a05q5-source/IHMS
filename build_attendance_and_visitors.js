const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

// 1. Attendance & Leave Page
write('frontend/src/app/attendance/page.tsx', `
'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { apiRequest } from '../../lib/api';
import { CalendarCheck, Plus, CheckCircle, XCircle, Clock, ShieldCheck, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function AttendancePage() {
  const { user, activeBranchId } = useAuth();
  const { socket } = useSocket();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showGatePassModal, setShowGatePassModal] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<any>(null);

  const [leaveForm, setLeaveForm] = useState({
    startDate: '',
    endDate: '',
    reason: '',
    destinationAddress: '',
  });

  const [gatePassCode, setGatePassCode] = useState('');

  const isStudent = user?.role === 'STUDENT';
  const isSecurity = user?.role === 'SECURITY_GUARD';

  const fetchLeaves = async () => {
    setLoading(true);
    try {
      const url = \`/attendance/leave?\${activeBranchId ? \`branchId=\${activeBranchId}\` : ''}\`;
      const res = await apiRequest(url);
      if (res.success && res.data) setLeaves(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, [activeBranchId, user]);

  useEffect(() => {
    if (!socket) return;
    socket.on('leave.created', fetchLeaves);
    socket.on('leave.status_changed', fetchLeaves);
    return () => {
      socket.off('leave.created', fetchLeaves);
      socket.off('leave.status_changed', fetchLeaves);
    };
  }, [socket]);

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/attendance/leave', {
        method: 'POST',
        body: JSON.stringify(leaveForm),
      });
      if (res.success) {
        setShowApplyModal(false);
        setLeaveForm({ startDate: '', endDate: '', reason: '', destinationAddress: '' });
        fetchLeaves();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to apply leave');
    }
  };

  const handleApprove = async (id: string, status: string) => {
    try {
      const res = await apiRequest(\`/attendance/leave/\${id}/approve\`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (res.success) fetchLeaves();
    } catch (err: any) {
      alert(err.message || 'Approval failed');
    }
  };

  const handleVerifyGatePass = async (action: 'EXIT' | 'ENTRY') => {
    try {
      const res = await apiRequest('/attendance/gatepass/verify', {
        method: 'POST',
        body: JSON.stringify({ gatePassCode, action }),
      });
      if (res.success) {
        alert(\`Gate pass verified for \${res.data.leave.studentName} (\${action})\`);
        setGatePassCode('');
      }
    } catch (err: any) {
      alert(err.message || 'Invalid or expired Gate Pass Code');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-black text-white">Attendance, Leave & Gate Pass System</h2>
          <p className="text-xs text-slate-400 mt-1">Multi-level approval workflow with server-verified QR gate passes</p>
        </div>

        <button
          onClick={() => setShowApplyModal(true)}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition"
        >
          <Plus className="h-4 w-4" />
          <span>Apply for Leave</span>
        </button>
      </div>

      {/* Security Guard Gate Pass Scanner Card */}
      {(isSecurity || user?.role === 'WARDEN' || user?.role === 'OWNER') && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>Gate Pass Security Scanner</span>
          </h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Enter Gate Pass Code (e.g. GP-LVR-2026-000001)"
              value={gatePassCode}
              onChange={(e) => setGatePassCode(e.target.value.toUpperCase())}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none font-mono"
            />
            <button
              type="button"
              onClick={() => handleVerifyGatePass('EXIT')}
              className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-500"
            >
              Verify Out-Pass (Exit)
            </button>
            <button
              type="button"
              onClick={() => handleVerifyGatePass('ENTRY')}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
            >
              Verify In-Pass (Return)
            </button>
          </div>
        </div>
      )}

      {/* Leave Requests Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">Leave Applications & Approval Queue</h3>
          <span className="text-xs font-mono text-slate-400">{leaves.length} Requests</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Leave No</th>
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Dates</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Approval Status</th>
                <th className="py-3 px-4 text-right">Gate Pass / Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
              {leaves.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    No leave requests found.
                  </td>
                </tr>
              ) : (
                leaves.map((lv) => (
                  <tr key={lv._id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">{lv.leaveNumber}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white">{lv.studentName}</div>
                      <div className="font-mono text-[11px] text-slate-400">{lv.customerCode}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {new Date(lv.startDate).toLocaleDateString()} → {new Date(lv.endDate).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">{lv.reason}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={\`rounded-md px-2 py-0.5 text-[10px] font-bold border \${
                          lv.status === 'APPROVED'
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                            : lv.status === 'REJECTED'
                            ? 'bg-rose-950 text-rose-400 border-rose-800'
                            : 'bg-amber-950 text-amber-400 border-amber-800'
                        }\`}
                      >
                        {lv.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {lv.status === 'APPROVED' ? (
                        <button
                          onClick={() => {
                            setSelectedLeave(lv);
                            setShowGatePassModal(true);
                          }}
                          className="rounded-lg bg-indigo-950 px-2.5 py-1 text-[11px] font-semibold text-indigo-300 border border-indigo-800/60 hover:bg-indigo-900 transition"
                        >
                          View Gate Pass QR
                        </button>
                      ) : !isStudent && lv.status === 'PENDING' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApprove(lv._id, 'APPROVED')}
                            className="rounded-lg bg-emerald-900/60 px-2.5 py-1 text-[11px] font-bold text-emerald-300 border border-emerald-700 hover:bg-emerald-800"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleApprove(lv._id, 'REJECTED')}
                            className="rounded-lg bg-rose-900/60 px-2.5 py-1 text-[11px] font-bold text-rose-300 border border-rose-700 hover:bg-rose-800"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-mono">In Review</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Apply Leave Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Apply For Hostel Leave</h3>
            <form onSubmit={handleApplyLeave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Departure Date</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.startDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Expected Return Date</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.endDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Reason for Leave</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Festival vacation / family function"
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Destination Address / Home</label>
                <input
                  type="text"
                  placeholder="Address where staying"
                  value={leaveForm.destinationAddress}
                  onChange={(e) => setLeaveForm({ ...leaveForm, destinationAddress: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowApplyModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Gate Pass QR Modal */}
      {showGatePassModal && selectedLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-center space-y-4 printable-area">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-bold text-emerald-400 font-mono">OFFICIAL GATE PASS</span>
              <button onClick={() => setShowGatePassModal(false)} className="text-slate-400 hover:text-white text-xs print:hidden">✕</button>
            </div>

            <div>
              <h3 className="text-base font-black text-white">{selectedLeave.studentName}</h3>
              <div className="font-mono font-bold text-emerald-400 text-xs">{selectedLeave.gatePassCode}</div>
              <p className="text-[11px] text-slate-400 mt-1">
                Valid: {new Date(selectedLeave.startDate).toLocaleDateString()} to {new Date(selectedLeave.endDate).toLocaleDateString()}
              </p>
            </div>

            <div className="flex justify-center py-2">
              <div className="bg-white p-3 rounded-2xl shadow-md">
                <QRCodeSVG value={selectedLeave.gatePassCode || selectedLeave.leaveNumber} size={130} />
              </div>
            </div>

            <p className="text-[11px] text-slate-400">Present this QR code to the Security Guard at the hostel entrance.</p>
            <button onClick={() => window.print()} className="w-full rounded-xl bg-slate-800 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 print:hidden">Print Gate Pass</button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
`);