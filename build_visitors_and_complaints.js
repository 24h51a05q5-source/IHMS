const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

// 1. Visitors Page
write('frontend/src/app/visitors/page.tsx', `
'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { apiRequest } from '../../lib/api';
import { UserCheck, Plus, LogOut, CheckCircle, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function VisitorsPage() {
  const { user, activeBranchId } = useAuth();
  const { socket } = useSocket();
  const [visitors, setVisitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [selectedPass, setSelectedPass] = useState<any>(null);

  const [visitorForm, setVisitorForm] = useState({
    visitorName: '',
    phone: '',
    customerCode: '',
    purpose: 'Meeting Student',
    idProofNumber: '',
  });

  const fetchVisitors = async () => {
    setLoading(true);
    try {
      const url = \`/visitors?\${activeBranchId ? \`branchId=\${activeBranchId}\` : ''}\`;
      const res = await apiRequest(url);
      if (res.success && res.data) setVisitors(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVisitors();
  }, [activeBranchId]);

  useEffect(() => {
    if (!socket) return;
    socket.on('visitor.checked_in', fetchVisitors);
    socket.on('visitor.checked_out', fetchVisitors);
    return () => {
      socket.off('visitor.checked_in', fetchVisitors);
      socket.off('visitor.checked_out', fetchVisitors);
    };
  }, [socket]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/visitors', {
        method: 'POST',
        body: JSON.stringify({ ...visitorForm, branchId: activeBranchId }),
      });
      if (res.success && res.data) {
        setShowRegisterModal(false);
        setSelectedPass(res.data);
        setVisitorForm({ visitorName: '', phone: '', customerCode: '', purpose: 'Meeting Student', idProofNumber: '' });
        fetchVisitors();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to register visitor');
    }
  };

  const handleCheckout = async (id: string) => {
    try {
      const res = await apiRequest(\`/visitors/\${id}/checkout\`, {
        method: 'PATCH',
      });
      if (res.success) fetchVisitors();
    } catch (err: any) {
      alert(err.message || 'Checkout failed');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-black text-white">Visitor Pass & Entry Management</h2>
          <p className="text-xs text-slate-400 mt-1">Real-time visitor logs, check-in timestamps & QR visitor badges</p>
        </div>

        <button
          onClick={() => setShowRegisterModal(true)}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition"
        >
          <Plus className="h-4 w-4" />
          <span>Register New Visitor</span>
        </button>
      </div>

      {/* Visitors Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Pass Number</th>
                <th className="py-3 px-4">Visitor Name & Phone</th>
                <th className="py-3 px-4">Student Being Visited</th>
                <th className="py-3 px-4">Purpose</th>
                <th className="py-3 px-4">Check-In Time</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
              {visitors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                    No visitor logs recorded.
                  </td>
                </tr>
              ) : (
                visitors.map((v) => (
                  <tr key={v._id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">{v.visitorPassNumber}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white">{v.visitorName}</div>
                      <div className="text-[11px] text-slate-400">{v.phone}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-200">{v.studentName}</div>
                      <div className="font-mono text-[10px] text-slate-400">{v.customerCode}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">{v.purpose}</td>
                    <td className="py-3.5 px-4 text-slate-300">{new Date(v.checkInTime).toLocaleTimeString()}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={\`rounded-md px-2 py-0.5 text-[10px] font-bold border \${
                          v.status === 'INSIDE'
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }\`}
                      >
                        {v.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedPass(v)}
                          className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-700"
                        >
                          Pass QR
                        </button>
                        {v.status === 'INSIDE' && (
                          <button
                            onClick={() => handleCheckout(v._id)}
                            className="rounded-lg bg-rose-950 px-2.5 py-1 text-[11px] font-bold text-rose-400 border border-rose-800/60 hover:bg-rose-900"
                          >
                            Check Out
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Register Visitor & Issue Pass</h3>
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Visitor Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="Visitor Full Name"
                  value={visitorForm.visitorName}
                  onChange={(e) => setVisitorForm({ ...visitorForm, visitorName: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Visitor Phone</label>
                <input
                  type="tel"
                  required
                  placeholder="+91 9876543210"
                  value={visitorForm.phone}
                  onChange={(e) => setVisitorForm({ ...visitorForm, phone: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Student Customer Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HYD001-ST000001"
                  value={visitorForm.customerCode}
                  onChange={(e) => setVisitorForm({ ...visitorForm, customerCode: e.target.value.toUpperCase() })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Purpose of Visit</label>
                <input
                  type="text"
                  placeholder="Meeting student / luggage delivery"
                  value={visitorForm.purpose}
                  onChange={(e) => setVisitorForm({ ...visitorForm, purpose: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  Issue Visitor Pass
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Visitor Badge Modal */}
      {selectedPass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-center space-y-4 printable-area">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-bold text-emerald-400 font-mono">VISITOR BADGE</span>
              <button onClick={() => setSelectedPass(null)} className="text-slate-400 hover:text-white text-xs print:hidden">✕</button>
            </div>

            <div>
              <h3 className="text-base font-black text-white">{selectedPass.visitorName}</h3>
              <div className="font-mono font-bold text-emerald-400 text-xs">{selectedPass.visitorPassNumber}</div>
              <p className="text-[11px] text-slate-400 mt-1">
                Visiting: <strong className="text-slate-200">{selectedPass.studentName}</strong> ({selectedPass.customerCode})
              </p>
            </div>

            <div className="flex justify-center py-2">
              <div className="bg-white p-3 rounded-2xl shadow-md">
                <QRCodeSVG value={selectedPass.visitorPassNumber} size={130} />
              </div>
            </div>

            <p className="text-[11px] text-slate-400">Entry: {new Date(selectedPass.checkInTime).toLocaleString()}</p>
            <button onClick={() => window.print()} className="w-full rounded-xl bg-slate-800 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 print:hidden">Print Visitor Pass</button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
`);

// 2. Complaints Page
write('frontend/src/app/complaints/page.tsx', `
'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { apiRequest } from '../../lib/api';
import { AlertCircle, Plus, CheckCircle, Clock, Wrench } from 'lucide-react';

export default function ComplaintsPage() {
  const { user, activeBranchId } = useAuth();
  const { socket } = useSocket();
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);

  const [complaintForm, setComplaintForm] = useState({
    title: '',
    category: 'PLUMBING',
    description: '',
    priority: 'MEDIUM',
  });

  const [resolveForm, setResolveForm] = useState({
    resolutionNotes: '',
    maintenanceCost: 0,
  });

  const isStudent = user?.role === 'STUDENT';

  const fetchComplaints = async () => {
    setLoading(true);
    try {
      const url = \`/complaints?\${activeBranchId ? \`branchId=\${activeBranchId}\` : ''}\`;
      const res = await apiRequest(url);
      if (res.success && res.data) setComplaints(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, [activeBranchId, user]);

  useEffect(() => {
    if (!socket) return;
    socket.on('complaint.created', fetchComplaints);
    socket.on('complaint.updated', fetchComplaints);
    socket.on('complaint.resolved', fetchComplaints);
    return () => {
      socket.off('complaint.created', fetchComplaints);
      socket.off('complaint.updated', fetchComplaints);
      socket.off('complaint.resolved', fetchComplaints);
    };
  }, [socket]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/complaints', {
        method: 'POST',
        body: JSON.stringify(complaintForm),
      });
      if (res.success) {
        setShowSubmitModal(false);
        setComplaintForm({ title: '', category: 'PLUMBING', description: '', priority: 'MEDIUM' });
        fetchComplaints();
      }
    } catch (err: any) {
      alert(err.message || 'Submission failed');
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    try {
      const res = await apiRequest(\`/complaints/\${selectedTicket._id}/resolve\`, {
        method: 'PATCH',
        body: JSON.stringify(resolveForm),
      });
      if (res.success) {
        setShowResolveModal(false);
        setSelectedTicket(null);
        fetchComplaints();
      }
    } catch (err: any) {
      alert(err.message || 'Resolution failed');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-black text-white">Maintenance & Complaints Ticketing</h2>
          <p className="text-xs text-slate-400 mt-1">Live work orders, staff assignments & maintenance cost tracking</p>
        </div>

        <button
          onClick={() => setShowSubmitModal(true)}
          className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-rose-600/20 hover:bg-rose-500 transition"
        >
          <Plus className="h-4 w-4" />
          <span>Submit Complaint Ticket</span>
        </button>
      </div>

      {/* Complaints Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {complaints.map((c) => (
          <div key={c._id} className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-emerald-400 text-xs">{c.complaintNumber}</span>
              <span
                className={\`rounded-md px-2 py-0.5 text-[10px] font-bold border \${
                  c.status === 'RESOLVED'
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    : c.status === 'IN_PROGRESS'
                    ? 'bg-indigo-950 text-indigo-400 border-indigo-800'
                    : 'bg-rose-950 text-rose-400 border-rose-800'
                }\`}
              >
                {c.status}
              </span>
            </div>

            <div>
              <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                {c.category} • Priority: {c.priority}
              </span>
              <h3 className="text-sm font-bold text-white mt-1.5">{c.title}</h3>
              <p className="text-xs text-slate-400 mt-1">{c.description}</p>
            </div>

            <div className="border-t border-slate-800/80 pt-3 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Room: <strong className="text-slate-300">{c.roomCode}</strong></span>
              <span>By: <strong className="text-slate-300">{c.studentName}</strong></span>
            </div>

            {c.status === 'RESOLVED' ? (
              <div className="rounded-xl bg-emerald-950/40 p-2.5 border border-emerald-800/50 text-[11px]">
                <p className="text-emerald-400 font-semibold">Resolved Notes:</p>
                <p className="text-slate-300">{c.resolutionNotes || 'Fixed promptly'}</p>
                {c.maintenanceCost > 0 && (
                  <p className="text-slate-400 mt-1 font-mono">Cost: ₹{c.maintenanceCost}</p>
                )}
              </div>
            ) : !isStudent ? (
              <button
                onClick={() => {
                  setSelectedTicket(c);
                  setShowResolveModal(true);
                }}
                className="w-full rounded-xl bg-emerald-600/20 py-2 text-xs font-bold text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white transition flex items-center justify-center gap-1"
              >
                <Wrench className="h-3.5 w-3.5" />
                <span>Resolve Work Order</span>
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {/* Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Log Maintenance Complaint</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Issue Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Washroom tap leakage / Fan not spinning"
                  value={complaintForm.title}
                  onChange={(e) => setComplaintForm({ ...complaintForm, title: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                  <select
                    value={complaintForm.category}
                    onChange={(e) => setComplaintForm({ ...complaintForm, category: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="PLUMBING">Plumbing</option>
                    <option value="ELECTRICAL">Electrical</option>
                    <option value="CARPENTRY">Carpentry</option>
                    <option value="CLEANING">Cleaning & Housekeeping</option>
                    <option value="INTERNET">Wi-Fi & Internet</option>
                    <option value="MESS">Mess & Food</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Priority</label>
                  <select
                    value={complaintForm.priority}
                    onChange={(e) => setComplaintForm({ ...complaintForm, priority: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Detailed Description</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain the issue..."
                  value={complaintForm.description}
                  onChange={(e) => setComplaintForm({ ...complaintForm, description: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                ></textarea>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-500"
                >
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {showResolveModal && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Resolve Ticket: {selectedTicket.complaintNumber}
            </h3>
            <form onSubmit={handleResolve} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Resolution Summary</label>
                <textarea
                  required
                  rows={3}
                  placeholder="What action or repairs were completed?"
                  value={resolveForm.resolutionNotes}
                  onChange={(e) => setResolveForm({ ...resolveForm, resolutionNotes: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                ></textarea>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Maintenance Cost Incurred (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={resolveForm.maintenanceCost}
                  onChange={(e) => setResolveForm({ ...resolveForm, maintenanceCost: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  Mark as Resolved
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