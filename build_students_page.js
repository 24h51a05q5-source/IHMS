const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

write('frontend/src/app/students/page.tsx', `
'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { apiRequest } from '../../lib/api';
import { Users, Plus, Search, ArrowRightLeft, CreditCard, Bed, Phone, Mail, FileText, CheckCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function StudentsPage() {
  const { activeBranchId } = useAuth();
  const { socket } = useSocket();
  const [students, setStudents] = useState<any[]>([]);
  const [availableBeds, setAvailableBeds] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showIdCardModal, setShowIdCardModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  const [admitForm, setAdmitForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    gender: 'MALE',
    collegeOrCompany: '',
    guardianName: '',
    guardianPhone: '',
    guardianRelation: 'Father',
    bedId: '',
    admissionFee: 1000,
    securityDeposit: 5000,
  });

  const [transferForm, setTransferForm] = useState({
    targetBranchId: '',
    targetBedId: '',
    reason: '',
  });

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const url = \`/students?\${activeBranchId ? \`branchId=\${activeBranchId}&\` : ''}\${search ? \`search=\${search}\` : ''}\`;
      const res = await apiRequest(url);
      if (res.success && res.data) setStudents(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableBeds = async (branchId?: string) => {
    try {
      const targetB = branchId || activeBranchId;
      const url = \`/rooms/beds?status=AVAILABLE\${targetB ? \`&branchId=\${targetB}\` : ''}\`;
      const res = await apiRequest(url);
      if (res.success && res.data) setAvailableBeds(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchStudents();
    fetchAvailableBeds();
    apiRequest('/hostels').then((res) => {
      if (res.success && res.data) setBranches(res.data);
    });
  }, [activeBranchId, search]);

  useEffect(() => {
    if (!socket) return;
    socket.on('student.admitted', fetchStudents);
    socket.on('student.transferred', fetchStudents);
    return () => {
      socket.off('student.admitted', fetchStudents);
      socket.off('student.transferred', fetchStudents);
    };
  }, [socket]);

  const handleAdmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/students/admit', {
        method: 'POST',
        body: JSON.stringify({ ...admitForm, branchId: activeBranchId }),
      });
      if (res.success) {
        setShowAdmitModal(false);
        fetchStudents();
        fetchAvailableBeds();
      }
    } catch (err: any) {
      alert(err.message || 'Admission failed');
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    try {
      const res = await apiRequest(\`/students/\${selectedStudent._id}/transfer\`, {
        method: 'POST',
        body: JSON.stringify(transferForm),
      });
      if (res.success) {
        setShowTransferModal(false);
        setSelectedStudent(null);
        fetchStudents();
      }
    } catch (err: any) {
      alert(err.message || 'Transfer failed');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-black text-white">Students & Admissions Directory</h2>
          <p className="text-xs text-slate-400 mt-1">Permanent Customer Codes (HYD001-ST000001) & Historical Assignments</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by Name, Code, Phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <button
            onClick={() => {
              fetchAvailableBeds();
              setShowAdmitModal(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition"
          >
            <Plus className="h-4 w-4" />
            <span>Admit New Student</span>
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Customer Code</th>
                <th className="py-3 px-4">Student Details</th>
                <th className="py-3 px-4">Room & Bed</th>
                <th className="py-3 px-4">Guardian Contact</th>
                <th className="py-3 px-4">Financial Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
              {students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    No student records found. Click "Admit New Student" to register.
                  </td>
                </tr>
              ) : (
                students.map((st) => (
                  <tr key={st._id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded-md border border-emerald-800/60">
                        {st.customerCode}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-sm">{st.fullName}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{st.phone}</span>
                        <span>•</span>
                        <span>{st.email}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {st.currentAssignment ? (
                        <div>
                          <div className="font-mono font-bold text-slate-200">{st.currentAssignment.bedCode}</div>
                          <div className="text-[11px] text-slate-400">Room {st.currentAssignment.roomCode?.split('-').pop()} • ₹{st.currentAssignment.monthlyRent}/mo</div>
                        </div>
                      ) : (
                        <span className="text-slate-500">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-300 font-semibold">{st.guardian?.name} ({st.guardian?.relation})</div>
                      <div className="text-[11px] text-slate-400">{st.guardian?.phone}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-mono">
                        {st.financialSummary?.outstandingBalance === 0 ? (
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5" /> Paid Up
                          </span>
                        ) : (
                          <span className="text-amber-400 font-bold">
                            Due: ₹{st.financialSummary?.outstandingBalance?.toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400">Demanded: ₹{st.financialSummary?.totalDemanded?.toLocaleString('en-IN')}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedStudent(st);
                            setShowIdCardModal(true);
                          }}
                          className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-700 transition"
                        >
                          ID Card
                        </button>
                        <button
                          onClick={() => {
                            setSelectedStudent(st);
                            setShowTransferModal(true);
                          }}
                          className="rounded-lg bg-indigo-950 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-300 border border-indigo-800/60 hover:bg-indigo-900 transition flex items-center gap-1"
                        >
                          <ArrowRightLeft className="h-3 w-3" />
                          <span>Transfer</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admission Modal */}
      {showAdmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Student Admission & Bed Assignment</h3>
            <form onSubmit={handleAdmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Student Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Full Legal Name"
                    value={admitForm.fullName}
                    onChange={(e) => setAdmitForm({ ...admitForm, fullName: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Gender</label>
                  <select
                    value={admitForm.gender}
                    onChange={(e) => setAdmitForm({ ...admitForm, gender: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="student@example.com"
                    value={admitForm.email}
                    onChange={(e) => setAdmitForm({ ...admitForm, email: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Mobile Phone</label>
                  <input
                    type="tel"
                    required
                    placeholder="+91 9876543210"
                    value={admitForm.phone}
                    onChange={(e) => setAdmitForm({ ...admitForm, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Assign Available Bed</label>
                <select
                  required
                  value={admitForm.bedId}
                  onChange={(e) => setAdmitForm({ ...admitForm, bedId: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none font-mono"
                >
                  <option value="">-- Select Available Bed --</option>
                  {availableBeds.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.bedCode} ({b.roomCode}) — ₹{b.monthlyRate}/mo
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3 border-t border-slate-800 pt-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Guardian Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Guardian Name"
                    value={admitForm.guardianName}
                    onChange={(e) => setAdmitForm({ ...admitForm, guardianName: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Relationship</label>
                  <input
                    type="text"
                    value={admitForm.guardianRelation}
                    onChange={(e) => setAdmitForm({ ...admitForm, guardianRelation: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Guardian Phone</label>
                  <input
                    type="tel"
                    required
                    placeholder="+91 9844400000"
                    value={admitForm.guardianPhone}
                    onChange={(e) => setAdmitForm({ ...admitForm, guardianPhone: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAdmitModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  Complete Admission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Transfer Student: {selectedStudent.fullName}
            </h3>
            <p className="text-xs text-slate-400">
              Customer Code <span className="font-mono text-emerald-400 font-bold">{selectedStudent.customerCode}</span> will be permanently preserved.
            </p>

            <form onSubmit={handleTransfer} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Target Hostel Branch</label>
                <select
                  required
                  value={transferForm.targetBranchId}
                  onChange={(e) => {
                    setTransferForm({ ...transferForm, targetBranchId: e.target.value, targetBedId: '' });
                    fetchAvailableBeds(e.target.value);
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="">-- Select Destination Branch --</option>
                  {branches.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.branchCode} - {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Destination Available Bed</label>
                <select
                  required
                  value={transferForm.targetBedId}
                  onChange={(e) => setTransferForm({ ...transferForm, targetBedId: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none font-mono"
                >
                  <option value="">-- Select Target Bed --</option>
                  {availableBeds.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.bedCode} ({b.roomCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Reason for Transfer</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Relocating closer to workplace"
                  value={transferForm.reason}
                  onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-500"
                >
                  Execute Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ID Card Modal */}
      {showIdCardModal && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-center space-y-4 printable-area">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-bold text-emerald-400 font-mono">IHMS STUDENT IDENTITY</span>
              <button
                onClick={() => setShowIdCardModal(false)}
                className="text-slate-400 hover:text-white text-xs print:hidden"
              >
                ✕
              </button>
            </div>

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-800 text-white font-extrabold text-2xl">
              {selectedStudent.fullName[0]}
            </div>

            <div>
              <h3 className="text-base font-black text-white">{selectedStudent.fullName}</h3>
              <div className="font-mono font-bold text-emerald-400 text-xs mt-0.5">
                {selectedStudent.customerCode}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {selectedStudent.currentAssignment?.bedCode} • {selectedStudent.currentAssignment?.hostelCode}
              </p>
            </div>

            <div className="flex justify-center py-2">
              <div className="bg-white p-3 rounded-2xl shadow-md">
                <QRCodeSVG
                  value={JSON.stringify({
                    customerCode: selectedStudent.customerCode,
                    name: selectedStudent.fullName,
                    bed: selectedStudent.currentAssignment?.bedCode,
                  })}
                  size={120}
                />
              </div>
            </div>

            <div className="text-[11px] text-slate-400 border-t border-slate-800 pt-2">
              Emergency: {selectedStudent.guardian?.phone} ({selectedStudent.guardian?.name})
            </div>

            <button
              onClick={() => window.print()}
              className="w-full rounded-xl bg-slate-800 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 print:hidden"
            >
              Print ID Badge
            </button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
`);