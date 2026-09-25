'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck, PlusCircle, Send, RotateCcw, UserX, UserCheck, Trash2,
  Building2, Mail, Phone, User, AlertCircle, CheckCircle2, Clock, Search, Filter, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import { wardensApi, type WardenRecord } from '@/lib/api/wardens.api';
import { hostelsApi } from '@/lib/api/hostels.api';
import type { Hostel } from '@/lib/types';
import { toast } from 'sonner';
import { SearchInput } from '@/components/ui/search-input';

function WardenManagementContent() {
  const [wardens, setWardens] = useState<WardenRecord[]>([]);
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'INVITED' | 'ACTIVE' | 'SUSPENDED'>('ALL');

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    hostelId: '',
  });

  // Action Loading State
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [wRes, hRes] = await Promise.all([
        wardensApi.list(),
        hostelsApi.list(),
      ]);
      const wardensList = Array.isArray(wRes) ? wRes : (wRes as any)?.data || [];
      const hostelsList = Array.isArray(hRes) ? hRes : (hRes as any)?.data || [];
      setWardens(wardensList);
      setHostels(hostelsList);
      if (hostelsList.length > 0 && !formData.hostelId) {
        setFormData((prev) => ({ ...prev, hostelId: hostelsList[0].id }));
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load Warden accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateWarden = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.hostelId) {
      toast.error('Please fill in all required fields.');
      return;
    }

    try {
      setAddLoading(true);
      const res = await wardensApi.create(formData);
      toast.success(res.message || 'Warden account created successfully.');
      setIsAddModalOpen(false);
      setFormData({ name: '', email: '', phone: '', hostelId: hostels[0]?.id || '' });
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create Warden account.');
    } finally {
      setAddLoading(false);
    }
  };

  const handleGiveAccess = async (wardenId: string, name: string) => {
    try {
      setActionLoadingId(wardenId);
      const res = await wardensApi.giveAccess(wardenId);
      toast.success(res.message || `Access granted for Warden ${name}.`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to give access.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResendInvite = async (wardenId: string, name: string) => {
    try {
      setActionLoadingId(wardenId);
      const res = await wardensApi.resendInvite(wardenId);
      toast.success(res.message || `Activation invitation resent to ${name}.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to resend invite.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSuspend = async (wardenId: string, name: string) => {
    if (!confirm(`Are you sure you want to suspend Warden ${name}? Their login will be blocked immediately.`)) {
      return;
    }
    try {
      setActionLoadingId(wardenId);
      const res = await wardensApi.suspend(wardenId);
      toast.success(res.message || `Warden ${name} suspended.`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to suspend Warden.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReactivate = async (wardenId: string, name: string) => {
    try {
      setActionLoadingId(wardenId);
      const res = await wardensApi.reactivate(wardenId);
      toast.success(res.message || `Warden ${name} reactivated.`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reactivate Warden.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRemove = async (wardenId: string, name: string) => {
    if (!confirm(`Are you sure you want to PERMANENTLY REMOVE Warden ${name}? This action cannot be undone.`)) {
      return;
    }
    try {
      setActionLoadingId(wardenId);
      const res = await wardensApi.remove(wardenId);
      toast.success(res.message || `Warden ${name} account removed.`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove Warden.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredWardens = wardens.filter((w) => {
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (w.name || '').toLowerCase().includes(q) ||
      (w.email || '').toLowerCase().includes(q) ||
      (w.phone || '').toLowerCase().includes(q) ||
      (w.hostelName || '').toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === 'ALL' || w.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalWardens = wardens.length;
  const activeCount = wardens.filter((w) => w.status === 'ACTIVE').length;
  const invitedCount = wardens.filter((w) => w.status === 'INVITED').length;
  const suspendedCount = wardens.filter((w) => w.status === 'SUSPENDED').length;

  if (error) return <ErrorState message={error} onRetry={loadData} />;

  return (
    <div className="w-full max-w-full min-w-0 space-y-4 sm:space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-xl bg-[#18233A] p-4 sm:p-6 text-white border border-[#283754]">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300 border border-white/10 mb-1">
              <ShieldCheck className="h-3.5 w-3.5 text-[#38BDF8]" /> Role-Based Access Control
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Warden Management
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-medium">
              Create, grant activation access, monitor status, and manage Warden role permissions.
            </p>
          </div>
          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="h-10 px-4 gap-2 bg-[#E87545] hover:bg-[#D66434] text-white font-bold text-xs sm:text-sm shrink-0"
          >
            <PlusCircle className="h-4 w-4" /> Add Warden
          </Button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-[#CBD5E1] bg-white p-3.5 sm:p-4 space-y-1">
          <p className="text-xs font-bold text-[#64748B] uppercase tracking-wider">Total Wardens</p>
          <p className="text-xl sm:text-2xl font-black text-[#111827]">{loading ? '—' : totalWardens}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 sm:p-4 space-y-1">
          <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Active Wardens</p>
          <p className="text-xl sm:text-2xl font-black text-emerald-950">{loading ? '—' : activeCount}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 sm:p-4 space-y-1">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Pending / Invited</p>
          <p className="text-xl sm:text-2xl font-black text-amber-950">{loading ? '—' : invitedCount}</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 sm:p-4 space-y-1">
          <p className="text-xs font-bold text-rose-800 uppercase tracking-wider">Suspended</p>
          <p className="text-xl sm:text-2xl font-black text-rose-950">{loading ? '—' : suspendedCount}</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="rounded-xl border border-[#CBD5E1] bg-white p-3.5 sm:p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          onClear={() => setSearch('')}
          placeholder="Search warden by name, email, hostel..."
          containerClassName="w-full sm:w-80"
          className="h-9 text-xs font-medium border-[#CBD5E1]"
        />

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          {(['ALL', 'ACTIVE', 'INVITED', 'SUSPENDED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                statusFilter === st
                  ? 'bg-[#18233A] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st === 'ALL' ? 'All Status' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Warden Table */}
      <div className="rounded-xl border border-[#CBD5E1] bg-white overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <CardSkeleton key={i} className="h-14 bg-white" />
            ))}
          </div>
        ) : filteredWardens.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-[#CBD5E1] text-[#64748B] font-extrabold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Warden Details</th>
                  <th className="py-3 px-4">Assigned Hostel</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Access Granted</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredWardens.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#18233A] font-bold border border-slate-200">
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-bold text-[#111827] text-sm">{w.name}</p>
                          <p className="text-[11px] text-slate-500 flex items-center gap-2">
                            <span>{w.email}</span>
                            {w.phone && <span>· {w.phone}</span>}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-700">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        {w.hostelName || w.branchName || 'Main Hostel'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {w.status === 'ACTIVE' && (
                        <Badge variant="success" className="font-bold text-[11px]">ACTIVE</Badge>
                      )}
                      {w.status === 'INVITED' && (
                        <Badge variant="warning" className="font-bold text-[11px]">INVITED / PENDING</Badge>
                      )}
                      {w.status === 'SUSPENDED' && (
                        <Badge variant="error" className="font-bold text-[11px]">SUSPENDED</Badge>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {w.accessGiven ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Access Granted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-bold text-[11px]">
                          <Clock className="h-3.5 w-3.5" /> Awaiting Access
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {/* Give Access Button */}
                        {!w.accessGiven && w.status === 'INVITED' && (
                          <Button
                            size="sm"
                            disabled={actionLoadingId === w.id}
                            onClick={() => handleGiveAccess(w.id, w.name)}
                            className="h-8 text-xs font-bold bg-[#E87545] hover:bg-[#D66434] text-white gap-1"
                          >
                            {actionLoadingId === w.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            Give Access
                          </Button>
                        )}

                        {/* Resend Invite */}
                        {w.accessGiven && w.status === 'INVITED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionLoadingId === w.id}
                            onClick={() => handleResendInvite(w.id, w.name)}
                            className="h-8 text-xs font-bold border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 gap-1"
                          >
                            {actionLoadingId === w.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Resend Invite
                          </Button>
                        )}

                        {/* Suspend / Reactivate */}
                        {w.status === 'SUSPENDED' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionLoadingId === w.id}
                            onClick={() => handleReactivate(w.id, w.name)}
                            className="h-8 text-xs font-bold border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 gap-1"
                          >
                            {actionLoadingId === w.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UserCheck className="h-3.5 w-3.5" />
                            )}
                            Reactivate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionLoadingId === w.id}
                            onClick={() => handleSuspend(w.id, w.name)}
                            className="h-8 text-xs font-bold border-rose-200 text-rose-700 bg-white hover:bg-rose-50 gap-1"
                          >
                            {actionLoadingId === w.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UserX className="h-3.5 w-3.5" />
                            )}
                            Suspend
                          </Button>
                        )}

                        {/* Remove */}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={actionLoadingId === w.id}
                          onClick={() => handleRemove(w.id, w.name)}
                          className="h-8 text-xs font-bold text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center space-y-2">
            <ShieldCheck className="mx-auto h-8 w-8 text-slate-400" />
            <p className="text-sm font-bold text-[#111827]">No Warden accounts found</p>
            <p className="text-xs text-slate-500">
              Click &quot;Add Warden&quot; above to create a new Warden account for your hostel branch.
            </p>
          </div>
        )}
      </div>

      {/* Add Warden Modal Dialog */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 space-y-5 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-black text-[#111827]">Add New Warden</h3>
                <p className="text-xs text-slate-500 font-medium">Create a Warden account in INVITED status.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateWarden} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="wardenName" className="text-xs font-bold text-[#111827]">
                  Warden Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="wardenName"
                  type="text"
                  required
                  placeholder="e.g. Ramesh Sharma"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="h-10 text-xs font-semibold"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="wardenEmail" className="text-xs font-bold text-[#111827]">
                  Registered Email Address <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="wardenEmail"
                  type="email"
                  required
                  placeholder="e.g. warden@greenvalley.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="h-10 text-xs font-semibold"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="wardenPhone" className="text-xs font-bold text-[#111827]">
                  Mobile Number
                </Label>
                <Input
                  id="wardenPhone"
                  type="tel"
                  placeholder="+91 9876543210"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="h-10 text-xs font-semibold"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="assignedHostel" className="text-xs font-bold text-[#111827]">
                  Assigned Hostel Branch <span className="text-rose-500">*</span>
                </Label>
                <select
                  id="assignedHostel"
                  required
                  value={formData.hostelId}
                  onChange={(e) => setFormData({ ...formData, hostelId: e.target.value })}
                  className="h-10 w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-xs font-bold text-[#111827] focus:border-[#E87545] focus:outline-none"
                >
                  {hostels.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name || h.hostelName || 'Main Branch'} ({h.city || 'Hyderabad'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddModalOpen(false)}
                  className="h-9 text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={addLoading}
                  className="h-9 text-xs font-bold bg-[#E87545] hover:bg-[#D66434] text-white gap-1.5"
                >
                  {addLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create Warden Record
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WardenManagementPage() {
  return (
    <PageErrorBoundary fallbackTitle="Unable to load Warden Management">
      <WardenManagementContent />
    </PageErrorBoundary>
  );
}
