'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, Phone, Mail, MapPin, Users, BedDouble, Search, RefreshCw, CheckCircle2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { hostelsApi } from '@/lib/api/hostels.api';
import { getCachedData } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import type { Hostel, ApiError } from '@/lib/types';

function HostelsPageContent() {
  const { hasRole, refreshBranches } = useAuth();
  const cachedHostels = getCachedData<any[]>('/hostels');
  const [hostels, setHostels] = useState<any[]>(() => cachedHostels || []);
  const [loading, setLoading] = useState(() => !cachedHostels);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    branchName: 'Main',
    branchCode: '',
    type: 'BOYS',
    phone: '',
    email: '',
    address: '',
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '',
  });

  const loadHostels = useCallback(async () => {
    try {
      const res = await hostelsApi.list();
      setHostels(res || []);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to load hostels.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHostels();
  }, [loadHostels]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Hostel name is required.');
      return;
    }
    setSubmitting(true);
    try {
      await hostelsApi.create(form);
      toast.success('Hostel branch created successfully!');
      setModalOpen(false);
      setForm({
        name: '',
        branchName: 'Main',
        branchCode: '',
        type: 'BOYS',
        phone: '',
        email: '',
        address: '',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '',
      });
      await refreshBranches();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ihms:hostel-updated'));
      }
      loadHostels();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to create hostel.');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = hostels.filter((h) => {
    const q = search.toLowerCase().trim();
    const matchesSearch = !q || (
      (h.name || '').toLowerCase().includes(q) ||
      (h.branchName || '').toLowerCase().includes(q) ||
      (h.code || h.branchCode || '').toLowerCase().includes(q) ||
      (h.city || '').toLowerCase().includes(q) ||
      (h.address || '').toLowerCase().includes(q) ||
      (h.state || '').toLowerCase().includes(q) ||
      (h.phone || '').toLowerCase().includes(q)
    );
    const matchesType = typeFilter === 'ALL' || (h.type || 'BOYS') === typeFilter;
    return matchesSearch && matchesType;
  });

  const totalCapacity = hostels.reduce((acc, h) => acc + (h.totalCapacity || h.totalBeds || 0), 0);
  const totalOccupied = hostels.reduce((acc, h) => acc + (h.currentOccupancy || 0), 0);
  const overallOccupancyPct = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'Hostel / Branch',
      cell: (h) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-foreground">{h.name}</p>
            <p className="text-xs text-muted-foreground">Code: <span className="font-mono font-medium text-foreground">{h.code || h.branchCode}</span></p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (h) => (
        <Badge variant={h.type === 'GIRLS' ? 'warning' : h.type === 'CO_ED' ? 'info' : 'default'}>
          {h.type || 'BOYS'}
        </Badge>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      cell: (h) => (
        <div className="text-xs space-y-0.5">
          <p className="font-medium text-foreground">{h.city || 'Hyderabad'}</p>
          <p className="text-muted-foreground truncate max-w-[180px]">{h.address || '—'}</p>
        </div>
      ),
      hideOnMobile: true,
    },
    {
      key: 'capacity',
      header: 'Bed Capacity',
      cell: (h) => {
        const cap = h.totalCapacity || h.totalBeds || 0;
        const occ = h.currentOccupancy || 0;
        const pct = cap > 0 ? Math.round((occ / cap) * 100) : 0;
        return (
          <div className="text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{occ} / {cap} Beds</span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-1.5 w-24 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: 'contact',
      header: 'Contact',
      cell: (h) => (
        <div className="text-xs space-y-0.5">
          <p className="text-muted-foreground">{h.phone || '—'}</p>
          <p className="text-muted-foreground truncate max-w-[140px]">{h.email || '—'}</p>
        </div>
      ),
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (h) => (
        <Badge variant={h.status === 'ACTIVE' ? 'success' : 'default'}>
          {h.status || 'ACTIVE'}
        </Badge>
      ),
    },
  ];

  const renderMobileHostelCard = (h: any) => {
    const cap = h.totalCapacity || h.totalBeds || 0;
    const occ = h.currentOccupancy || 0;
    const pct = cap > 0 ? Math.round((occ / cap) * 100) : 0;

    return (
      <div className="w-full rounded-xl border border-[#CBD5E1] bg-white p-3.5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-[#E4E0D7] pb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB] font-bold border border-[#BFDBFE]">
              <Building2 className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-[#111827] text-sm truncate">{h.name}</p>
              <p className="text-[11px] font-mono text-[#64748B]">Code: <span className="font-bold text-[#111827]">{h.code || h.branchCode}</span></p>
            </div>
          </div>
          <Badge variant={h.type === 'GIRLS' ? 'warning' : h.type === 'CO_ED' ? 'info' : 'default'} className="shrink-0 font-bold text-[11px]">
            {h.type || 'BOYS'}
          </Badge>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Location</span>
            <p className="font-bold text-[#111827] truncate">{h.city || 'Hyderabad'}</p>
            <p className="text-[10px] text-[#64748B] truncate">{h.address || '—'}</p>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Capacity & Occupancy</span>
            <p className="font-bold text-[#111827]">{occ} / {cap} Beds ({pct}%)</p>
            <div className="h-1.5 w-full rounded-full bg-[#E2E8F0] overflow-hidden mt-1">
              <div className="h-full bg-[#E87545] rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
          {h.phone && (
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Contact</span>
              <p className="font-semibold text-[#111827] truncate">{h.phone}</p>
            </div>
          )}
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Status</span>
            <div className="pt-0.5">
              <Badge variant={h.status === 'ACTIVE' ? 'success' : 'default'} className="text-[10px]">
                {h.status || 'ACTIVE'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-[#E4E0D7] pt-2.5">
          <Link
            href={`/rooms?branchId=${h.id || h._id}`}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#E87545] hover:underline"
          >
            View Rooms & Beds →
          </Link>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hostel Branches"
        description="Manage organization hostels, buildings, contact profiles, and real-time capacities"
        action={
          hasRole('ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN') && (
            <Button onClick={() => setModalOpen(true)} className="gap-2 font-bold bg-[#E87545] hover:bg-[#D66434] text-white">
              <Plus className="h-4 w-4" />
              Add Hostel Branch
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <StatCard title="Total Hostels" value={hostels.length} icon={Building2} />
        <StatCard title="Total Capacity" value={`${totalCapacity} Beds`} icon={BedDouble} />
        <StatCard title="Occupied Beds" value={`${totalOccupied} Residents`} icon={Users} />
        <StatCard title="Overall Occupancy" value={`${overallOccupancyPct}%`} icon={ShieldCheck} />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        total={filtered.length}
        page={1}
        pageSize={filtered.length || 10}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by hostel name, code, city..."
        mobileRender={renderMobileHostelCard}
        filters={
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36 h-10 bg-white border-[1.5px] border-[#CBD5E1] text-[#111827]">
              <SelectValue placeholder="Hostel Type" />
            </SelectTrigger>
            <SelectContent className="bg-white border-[1.5px] border-[#CBD5E1]">
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="BOYS">Boys Hostel</SelectItem>
              <SelectItem value="GIRLS">Girls Hostel</SelectItem>
              <SelectItem value="CO_ED">Co-Ed Living</SelectItem>
            </SelectContent>
          </Select>
        }
        toolbarRight={
          <Button variant="outline" size="sm" onClick={loadHostels} className="h-10 px-3.5 bg-white border-[#CBD5E1] text-[#111827] hover:bg-[#F8FAFC]" aria-label="Refresh hostels">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        }
        rowKey={(h: any) => h.id || h._id}
        emptyTitle="No hostel branches found"
        emptyDescription="Click 'Add Hostel Branch' to create your first hostel."
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Add New Hostel Branch
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold">Branch / Hostel Title *</label>
                  <Input
                    placeholder="e.g. Main Campus / Jubilee Hills Branch"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Branch Name (e.g. Main / Jubilee Hills)</label>
                  <Input
                    placeholder="e.g. Main"
                    value={form.branchName}
                    onChange={(e) => setForm({ ...form, branchName: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Hostel Type</label>
                  <Select value={form.type} onValueChange={(val) => setForm({ ...form, type: val })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BOYS">Boys Hostel</SelectItem>
                      <SelectItem value="GIRLS">Girls Hostel</SelectItem>
                      <SelectItem value="CO_ED">Co-Ed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Contact Phone</label>
                  <Input
                    placeholder="e.g. 9848012345"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-semibold">Contact Email</label>
                  <Input
                    type="email"
                    placeholder="e.g. hostel.manager@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-semibold">Street Address</label>
                  <Input
                    placeholder="e.g. Plot 42, Hitech City Main Rd"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">City</label>
                  <Input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">State</label>
                  <Input
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Hostel'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function HostelsPage() {
  return (
    <PageErrorBoundary fallbackTitle="Unable to load Hostel Branches">
      <HostelsPageContent />
    </PageErrorBoundary>
  );
}
