const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

// 1. Inventory Page
write('frontend/src/app/inventory/page.tsx', `
'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { Package, Plus, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function InventoryPage() {
  const { activeBranchId } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedQr, setSelectedQr] = useState<any>(null);

  const [assetForm, setAssetForm] = useState({
    name: '',
    category: 'FURNITURE',
    roomLocation: '',
    cost: 5000,
    amcVendor: '',
  });

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const url = \`/inventory/assets?\${activeBranchId ? \`branchId=\${activeBranchId}\` : ''}\`;
      const res = await apiRequest(url);
      if (res.success && res.data) setAssets(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, [activeBranchId]);

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/inventory/assets', {
        method: 'POST',
        body: JSON.stringify({ ...assetForm, branchId: activeBranchId }),
      });
      if (res.success) {
        setShowAddModal(false);
        setAssetForm({ name: '', category: 'FURNITURE', roomLocation: '', cost: 5000, amcVendor: '' });
        fetchAssets();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to add asset');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-black text-white">Asset Registry & Inventory Management</h2>
          <p className="text-xs text-slate-400 mt-1">Permanent Asset Identification Codes (HYD001-AST-000245) with QR tracking</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition"
        >
          <Plus className="h-4 w-4" />
          <span>Register New Asset</span>
        </button>
      </div>

      {/* Assets Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Asset Code</th>
                <th className="py-3 px-4">Asset Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">Purchase Cost</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">QR Badge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                    No physical assets registered. Click "Register New Asset" to add equipment.
                  </td>
                </tr>
              ) : (
                assets.map((ast) => (
                  <tr key={ast._id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">{ast.assetCode}</td>
                    <td className="py-3.5 px-4 font-bold text-white">{ast.name}</td>
                    <td className="py-3.5 px-4 text-slate-300">{ast.category}</td>
                    <td className="py-3.5 px-4 text-slate-400">{ast.roomLocation || 'General'}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-200">₹{ast.cost?.toLocaleString('en-IN')}</td>
                    <td className="py-3.5 px-4">
                      <span className="rounded-md bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-800">
                        {ast.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedQr(ast)}
                        className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-700"
                      >
                        Print Tag
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Register Equipment / Asset</h3>
            <form onSubmit={handleCreateAsset} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Asset Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Samsung 250L Refrigerator / Lloyd 1.5T AC"
                  value={assetForm.name}
                  onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                  <select
                    value={assetForm.category}
                    onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="APPLIANCE">Appliance</option>
                    <option value="FURNITURE">Furniture</option>
                    <option value="ELECTRONICS">Electronics / Wi-Fi</option>
                    <option value="SECURITY">CCTV & Security</option>
                    <option value="PLUMBING">Plumbing & Water</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Cost (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={assetForm.cost}
                    onChange={(e) => setAssetForm({ ...assetForm, cost: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Assigned Room / Location</label>
                <input
                  type="text"
                  placeholder="e.g. HYD001-B1-F1-R101 or Kitchen"
                  value={assetForm.roomLocation}
                  onChange={(e) => setAssetForm({ ...assetForm, roomLocation: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  Save Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Asset QR Tag Modal */}
      {selectedQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-center space-y-4 printable-area">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-bold text-emerald-400 font-mono">ASSET INVENTORY TAG</span>
              <button onClick={() => setSelectedQr(null)} className="text-slate-400 hover:text-white text-xs print:hidden">✕</button>
            </div>

            <div>
              <h3 className="text-base font-black text-white">{selectedQr.name}</h3>
              <div className="font-mono font-bold text-emerald-400 text-xs mt-0.5">{selectedQr.assetCode}</div>
              <p className="text-[11px] text-slate-400 mt-1">Location: {selectedQr.roomLocation || 'Common Area'}</p>
            </div>

            <div className="flex justify-center py-2">
              <div className="bg-white p-3 rounded-2xl shadow-md">
                <QRCodeSVG value={selectedQr.assetCode} size={130} />
              </div>
            </div>

            <button onClick={() => window.print()} className="w-full rounded-xl bg-slate-800 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 print:hidden">Print Asset Barcode / Tag</button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
`);

// 2. Reports Page
write('frontend/src/app/reports/page.tsx', `
'use client';

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

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
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

      {/* Fee Defaulters Table */}
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
`);

// 3. Settings Page
write('frontend/src/app/settings/page.tsx', `
'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { Settings, Building2, Shield, Save } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    apiRequest('/organizations/current')
      .then((res) => {
        if (res.success && res.data) setOrg(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/organizations/current', {
        method: 'PUT',
        body: JSON.stringify(org),
      });
      if (res.success) {
        setSavedMessage('Settings updated successfully!');
        setTimeout(() => setSavedMessage(''), 4000);
      }
    } catch (err: any) {
      alert(err.message || 'Save failed');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-black text-white">Organization & System Settings</h2>
          <p className="text-xs text-slate-400 mt-1">Multi-tenant group profile, taxation GSTIN & system preferences</p>
        </div>
      </div>

      {org && (
        <div className="max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-xl space-y-6">
          {savedMessage && (
            <div className="rounded-xl bg-emerald-950/60 p-3 text-xs font-bold text-emerald-300 border border-emerald-800">
              {savedMessage}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Organization Code</label>
                <input
                  type="text"
                  disabled
                  value={org.orgCode}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Currency Code</label>
                <input
                  type="text"
                  value={org.currency || 'INR'}
                  onChange={(e) => setOrg({ ...org, currency: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Company / Group Legal Name</label>
              <input
                type="text"
                required
                value={org.name}
                onChange={(e) => setOrg({ ...org, name: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">GSTIN / Tax ID</label>
                <input
                  type="text"
                  placeholder="36AAAAA0000A1Z5"
                  value={org.taxGstin || ''}
                  onChange={(e) => setOrg({ ...org, taxGstin: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Subscription Tier</label>
                <input
                  type="text"
                  disabled
                  value={org.subscriptionTier || 'ENTERPRISE'}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-emerald-400 font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Registered Address</label>
              <textarea
                rows={3}
                value={org.address || ''}
                onChange={(e) => setOrg({ ...org, address: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:outline-none"
              ></textarea>
            </div>

            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 transition"
            >
              <Save className="h-4 w-4" />
              <span>Save Configuration</span>
            </button>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
`);