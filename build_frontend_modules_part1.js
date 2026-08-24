const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

// 1. Hostels Page
write('frontend/src/app/hostels/page.tsx', `
'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { apiRequest } from '../../lib/api';
import { Building, Plus, MapPin, Phone, Mail, Bed, Users } from 'lucide-react';

export default function HostelsPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'BOYS',
    branchCode: '',
    address: '',
    city: 'Hyderabad',
    state: 'Telangana',
    contactPhone: '',
    contactEmail: '',
  });

  const fetchBranches = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/hostels');
      if (res.success && res.data) setBranches(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/hostels', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      if (res.success) {
        setShowModal(false);
        setFormData({ name: '', type: 'BOYS', branchCode: '', address: '', city: 'Hyderabad', state: 'Telangana', contactPhone: '', contactEmail: '' });
        fetchBranches();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create branch');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-black text-white">Hostel Branches Management</h2>
          <p className="text-xs text-slate-400 mt-1">Multi-branch enterprise hierarchy and physical premises</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition"
        >
          <Plus className="h-4 w-4" />
          <span>Add New Hostel Branch</span>
        </button>
      </div>

      {/* Branch Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {branches.map((b) => (
          <div key={b._id} className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="rounded-md bg-emerald-950 px-2 py-0.5 text-[11px] font-mono font-bold text-emerald-400 border border-emerald-800">
                  {b.branchCode}
                </span>
                <h3 className="text-base font-bold text-white mt-2">{b.name}</h3>
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                  Type: {b.type} Hostel
                </span>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-emerald-400 border border-slate-700">
                <Building className="h-5 w-5" />
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-800/80 pt-3 text-xs text-slate-300">
              <div className="flex items-center gap-2 text-slate-400">
                <MapPin className="h-3.5 w-3.5 text-slate-500" />
                <span>{b.address}, {b.city}, {b.state}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <Phone className="h-3.5 w-3.5 text-slate-500" />
                <span>{b.contactPhone || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <Mail className="h-3.5 w-3.5 text-slate-500" />
                <span>{b.contactEmail || 'N/A'}</span>
              </div>
            </div>

            <div className="rounded-xl bg-slate-800/60 p-3 flex items-center justify-between border border-slate-700/50">
              <div className="flex items-center gap-2">
                <Bed className="h-4 w-4 text-indigo-400" />
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Occupancy</div>
                  <div className="text-xs font-bold text-white">{b.occupiedBeds || 0} / {b.totalBeds || 0} Beds</div>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400">{b.occupancyRate || 0}% Occupied</span>
            </div>
          </div>
        ))}
      </div>

      {/* Create Branch Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Create New Hostel Branch</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Hostel Branch Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sri Sai Ram Deluxe Girls Hostel"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Branch Code (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. HYD003"
                    value={formData.branchCode}
                    onChange={(e) => setFormData({ ...formData, branchCode: e.target.value.toUpperCase() })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Hostel Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="BOYS">Boys Hostel</option>
                    <option value="GIRLS">Girls Hostel</option>
                    <option value="CO_ED">Co-Ed Hostel</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Address</label>
                <input
                  type="text"
                  required
                  placeholder="Plot No, Street, Landmark"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    required
                    placeholder="+91 9876500000"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  Save Branch
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

// 2. Rooms & Visual Bed Matrix Page
write('frontend/src/app/rooms/page.tsx', `
'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { apiRequest } from '../../lib/api';
import { Bed, Plus, CheckCircle, XCircle, AlertTriangle, ShieldAlert } from 'lucide-react';

export default function RoomsPage() {
  const { activeBranchId } = useAuth();
  const { socket } = useSocket();
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [formData, setFormData] = useState({
    roomNumber: '',
    floorNumber: 1,
    buildingName: 'Main Block',
    blockName: '1',
    roomType: 'DOUBLE',
    totalBeds: 2,
    monthlyRate: 7500,
  });

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const url = activeBranchId ? \`/rooms?branchId=\${activeBranchId}\` : '/rooms';
      const res = await apiRequest(url);
      if (res.success && res.data) setRooms(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, [activeBranchId]);

  useEffect(() => {
    if (!socket) return;
    const handleBedUpdate = () => fetchRooms();
    socket.on('bed.status_changed', handleBedUpdate);
    return () => { socket.off('bed.status_changed', handleBedUpdate); };
  }, [socket]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/rooms', {
        method: 'POST',
        body: JSON.stringify({ ...formData, branchId: activeBranchId }),
      });
      if (res.success) {
        setShowAddRoom(false);
        setFormData({ roomNumber: '', floorNumber: 1, buildingName: 'Main Block', blockName: '1', roomType: 'DOUBLE', totalBeds: 2, monthlyRate: 7500 });
        fetchRooms();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create room');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-black text-white">Rooms & Bed Occupancy Matrix</h2>
          <p className="text-xs text-slate-400 mt-1">Live visual floor plan and bed availability map</p>
        </div>
        <button
          onClick={() => setShowAddRoom(true)}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition"
        >
          <Plus className="h-4 w-4" />
          <span>Add Room & Beds</span>
        </button>
      </div>

      {/* Status Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs">
        <span className="font-semibold text-slate-400">Bed Status Legend:</span>
        <div className="flex items-center gap-1.5 font-medium text-emerald-400">
          <span className="h-3 w-3 rounded-md bg-emerald-500 inline-block"></span>
          <span>AVAILABLE (Ready for Admission)</span>
        </div>
        <div className="flex items-center gap-1.5 font-medium text-indigo-400">
          <span className="h-3 w-3 rounded-md bg-indigo-600 inline-block"></span>
          <span>OCCUPIED (Student Assigned)</span>
        </div>
        <div className="flex items-center gap-1.5 font-medium text-amber-400">
          <span className="h-3 w-3 rounded-md bg-amber-500 inline-block"></span>
          <span>RESERVED</span>
        </div>
        <div className="flex items-center gap-1.5 font-medium text-rose-400">
          <span className="h-3 w-3 rounded-md bg-rose-600 inline-block"></span>
          <span>MAINTENANCE</span>
        </div>
      </div>

      {/* Visual Room Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rooms.map((r) => (
          <div key={r._id} className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono text-emerald-400 font-bold">{r.roomCode}</span>
                <h3 className="text-base font-black text-white">Room {r.roomNumber}</h3>
                <span className="text-[11px] text-slate-400">Floor {r.floorNumber} • {r.roomType} Sharing</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono font-bold text-white">₹{r.monthlyRate.toLocaleString('en-IN')}<span className="text-[10px] text-slate-400 font-normal">/mo</span></div>
                <span className="text-[10px] font-semibold text-slate-400">{r.occupiedBeds}/{r.totalBeds} Occupied</span>
              </div>
            </div>

            {/* Beds in Room */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
              {r.beds?.map((b: any) => {
                const isOccupied = b.status === 'OCCUPIED';
                return (
                  <div
                    key={b._id}
                    className={\`rounded-xl p-3 border transition flex flex-col justify-between \${
                      isOccupied
                        ? 'bg-indigo-950/40 border-indigo-800/60 text-indigo-200'
                        : 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200 hover:border-emerald-500'
                    }\`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-black">{b.bedCode.split('-').pop()}</span>
                      <span className={\`h-2 w-2 rounded-full \${isOccupied ? 'bg-indigo-400' : 'bg-emerald-400 animate-pulse'}\`}></span>
                    </div>

                    <div className="mt-2">
                      <div className="text-[10px] font-mono uppercase tracking-wider opacity-70">
                        {b.status}
                      </div>
                      {isOccupied ? (
                        <div className="text-xs font-bold text-white truncate" title={b.currentStudentName}>
                          {b.currentStudentName}
                        </div>
                      ) : (
                        <div className="text-xs text-emerald-400 font-medium">Ready</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Add Room Modal */}
      {showAddRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Add New Room & Auto-Generate Beds</h3>
            <form onSubmit={handleCreateRoom} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Room Number</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 301"
                    value={formData.roomNumber}
                    onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Floor Number</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formData.floorNumber}
                    onChange={(e) => setFormData({ ...formData, floorNumber: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Total Beds</label>
                  <select
                    value={formData.totalBeds}
                    onChange={(e) => setFormData({ ...formData, totalBeds: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value={1}>1 Bed (Single)</option>
                    <option value={2}>2 Beds (Double)</option>
                    <option value={3}>3 Beds (Triple)</option>
                    <option value={4}>4 Beds (Four Sharing)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Monthly Rent (₹)</label>
                  <input
                    type="number"
                    required
                    step={100}
                    value={formData.monthlyRate}
                    onChange={(e) => setFormData({ ...formData, monthlyRate: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddRoom(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  Generate Room & Beds
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