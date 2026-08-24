'use client';

import { useCallback, useEffect, useState } from 'react';
import { Package, Plus, Search, RefreshCw, CheckCircle2, Wrench, Trash2, Box, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { inventoryApi } from '@/lib/api/inventory.api';
import { getCachedData } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import type { Asset, ApiError } from '@/lib/types';

export default function InventoryPage() {
  const { hasRole, currentBranchId } = useAuth();
  const cachedAssets = getCachedData<Asset[]>('/inventory', { branchId: currentBranchId || undefined });
  const [assets, setAssets] = useState<Asset[]>(() => cachedAssets || []);
  const [loading, setLoading] = useState(() => !cachedAssets?.length);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    category: 'FURNITURE',
    quantity: 1,
    cost: '',
    condition: 'GOOD',
    roomLocation: 'Room 101',
  });

  const loadData = useCallback(async () => {
    try {
      const res = await inventoryApi.list({ branchId: currentBranchId || undefined });
      setAssets(res || []);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }, [currentBranchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Asset name is required.');
      return;
    }
    setSubmitting(true);
    try {
      await inventoryApi.create({
        ...form,
        quantity: Number(form.quantity),
        cost: Number(form.cost || 0),
        branchId: currentBranchId || undefined,
      });
      toast.success('Asset registered successfully!');
      setModalOpen(false);
      setForm({ name: '', category: 'FURNITURE', quantity: 1, cost: '', condition: 'GOOD', roomLocation: 'Room 101' });
      loadData();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to create asset.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await inventoryApi.updateStatus(id, status);
      toast.success('Status updated!');
      loadData();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to update status.');
    }
  };

  const filtered = assets.filter((a) => {
    const q = search.toLowerCase().trim();
    const matchesSearch = !q || (
      (a.name || '').toLowerCase().includes(q) ||
      (a.assetCode || '').toLowerCase().includes(q) ||
      (a.roomLocation || '').toLowerCase().includes(q) ||
      (a.category || '').toLowerCase().includes(q) ||
      (a.condition || '').toLowerCase().includes(q) ||
      (a.status || '').toLowerCase().includes(q)
    );
    const matchesCat = categoryFilter === 'ALL' || a.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const totalAssetsCount = assets.reduce((acc, a) => acc + (a.quantity || 1), 0);
  const inUseCount = assets.filter((a) => a.status === 'IN_USE').length;
  const underMaintenanceCount = assets.filter((a) => a.status === 'MAINTENANCE').length;

  const columns: Column<any>[] = [
    {
      key: 'asset',
      header: 'Asset / Item',
      cell: (a) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold">
            <Package className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{a.name}</p>
            <p className="text-xs font-mono text-muted-foreground">{a.assetCode}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      cell: (a) => <Badge variant="info">{a.category}</Badge>,
    },
    {
      key: 'location',
      header: 'Location / Room',
      cell: (a) => <span className="text-xs font-medium">{a.roomLocation || 'General'}</span>,
    },
    {
      key: 'condition',
      header: 'Condition',
      cell: (a) => (
        <Badge variant={a.condition === 'NEW' || a.condition === 'GOOD' ? 'success' : 'warning'}>
          {a.condition || 'GOOD'}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (a) => (
        <Badge variant={a.status === 'IN_USE' ? 'default' : a.status === 'MAINTENANCE' ? 'error' : 'info'}>
          {a.status?.replace('_', ' ') || 'IN USE'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (a) =>
        hasRole('ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'INVENTORY_MANAGER') && (
          <div className="flex items-center gap-1.5">
            {a.status !== 'MAINTENANCE' ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-amber-600 border-amber-500/30"
                onClick={() => handleUpdateStatus(a.id, 'MAINTENANCE')}
              >
                Flag Repair
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-emerald-600 border-emerald-500/30"
                onClick={() => handleUpdateStatus(a.id, 'IN_USE')}
              >
                Mark Fixed
              </Button>
            )}
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5.5">
      <PageHeader
        title="Assets & Stock Inventory"
        description="Manage hostel room furnishings, electrical appliances, facility stock, and maintenance lifecycles"
        action={
          hasRole('ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'INVENTORY_MANAGER') && (
            <Button onClick={() => setModalOpen(true)} className="gap-2 font-bold bg-[#E87545] hover:bg-[#D66434] text-white">
              <Plus className="h-4 w-4" />
              Register Asset
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
        <StatCard title="Total Registered Items" value={totalAssetsCount} icon={Package} />
        <StatCard title="In Active Service" value={inUseCount} icon={CheckCircle2} />
        <StatCard title="Under Maintenance" value={underMaintenanceCount} icon={Wrench} />
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
        searchPlaceholder="Search items..."
        filters={
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40 h-10 bg-white border-[1.5px] border-[#CBD5E1] text-[#111827]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="bg-white border-[1.5px] border-[#CBD5E1]">
              <SelectItem value="ALL">All Categories</SelectItem>
              <SelectItem value="FURNITURE">Furniture</SelectItem>
              <SelectItem value="ELECTRICAL">Electrical</SelectItem>
              <SelectItem value="APPLIANCE">Appliances</SelectItem>
              <SelectItem value="PLUMBING">Plumbing</SelectItem>
              <SelectItem value="IT_EQUIPMENT">IT / CCTV</SelectItem>
              <SelectItem value="KITCHEN">Kitchen</SelectItem>
            </SelectContent>
          </Select>
        }
        toolbarRight={
          <Button variant="outline" size="sm" onClick={loadData} className="h-10 px-3.5 bg-white border-[#CBD5E1] text-[#111827] hover:bg-[#F8FAFC]" aria-label="Refresh inventory">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        }
        rowKey={(a: any) => a.id || a.assetCode || Math.random().toString()}
        emptyTitle="No inventory assets found"
        emptyDescription="Click 'Register Asset' to add stock."
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Box className="h-5 w-5 text-primary" />
                Register New Asset
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Item Name *</label>
                <Input
                  placeholder="e.g. Study Table & Chair Set"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Category</label>
                  <Select
                    value={form.category}
                    onValueChange={(val) => setForm({ ...form, category: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FURNITURE">Furniture</SelectItem>
                      <SelectItem value="ELECTRICAL">Electrical & Lights</SelectItem>
                      <SelectItem value="APPLIANCE">AC / Geyser / TV</SelectItem>
                      <SelectItem value="PLUMBING">Plumbing</SelectItem>
                      <SelectItem value="IT_EQUIPMENT">IT / Router / CCTV</SelectItem>
                      <SelectItem value="KITCHEN">Kitchen Equipment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Quantity</label>
                  <Input
                    type="number"
                    min={1}
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Room / Location</label>
                  <Input
                    placeholder="e.g. Room 101"
                    value={form.roomLocation}
                    onChange={(e) => setForm({ ...form, roomLocation: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Condition</label>
                  <Select
                    value={form.condition}
                    onValueChange={(val) => setForm({ ...form, condition: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NEW">Brand New</SelectItem>
                      <SelectItem value="GOOD">Good Condition</SelectItem>
                      <SelectItem value="DAMAGED">Minor Damage</SelectItem>
                      <SelectItem value="SCRAPPED">Scrapped</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Registering...' : 'Register Asset'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
