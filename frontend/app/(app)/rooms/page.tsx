'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BedDouble,
  Plus,
  DoorOpen,
  Users,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Pencil,
  Trash2,
  SlidersHorizontal,
  Building,
  DollarSign,
  UserCheck,
  Eye,
  Info,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import { roomsApi, type CreateRoomInput } from '@/lib/api/rooms.api';
import { bedsApi } from '@/lib/api/beds.api';
import { hostelsApi } from '@/lib/api/hostels.api';
import { getCachedData } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import type { ApiError, Room, Bed } from '@/lib/types';

function RoomsPageContent() {
  const { hasRole, currentBranchId } = useAuth();
  const canManage = hasRole('ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'WARDEN');

  const cachedBranches = getCachedData<any[]>('/hostels');
  const cachedRooms = getCachedData<{ items: Room[] }>('/rooms', { hostelId: currentBranchId || undefined, pageSize: 100 });

  const [rooms, setRooms] = useState<Room[]>(() => cachedRooms?.items || []);
  const [branches, setBranches] = useState<any[]>(() => cachedBranches || []);
  const [selectedBranch, setSelectedBranch] = useState<string>(currentBranchId || '');
  const [loading, setLoading] = useState(() => !cachedRooms?.items?.length);
  const [search, setSearch] = useState('');

  // 1. Add Room Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [addForm, setAddForm] = useState<CreateRoomInput>({
    hostelId: '',
    buildingName: 'Main Building',
    blockName: '1',
    roomNumber: '101',
    floorNumber: 1,
    roomType: 'DOUBLE',
    capacity: 2,
    monthlyRentPerBed: 8000,
    status: 'ACTIVE',
  });

  // 2. Edit Room Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    roomNumber: '',
    buildingName: '',
    blockName: '1',
    floorNumber: 1,
    roomType: 'DOUBLE',
    capacity: 2,
    monthlyRentPerBed: 8000,
    status: 'ACTIVE' as 'ACTIVE' | 'MAINTENANCE',
  });

  // 3. Manage Beds Modal State
  const [bedsModalOpen, setBedsModalOpen] = useState(false);
  const [activeRoomForBeds, setActiveRoomForBeds] = useState<Room | null>(null);
  const [roomBeds, setRoomBeds] = useState<Bed[]>([]);
  const [loadingBeds, setLoadingBeds] = useState(false);
  const [addingBed, setAddingBed] = useState(false);
  const [actionBedId, setActionBedId] = useState<string | null>(null);

  // 4. Delete Room Dialog State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState<Room | null>(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // 5. Room Details Sheet State
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);
  const [detailedRoom, setDetailedRoom] = useState<Room | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [hList, rRes] = await Promise.all([
        hostelsApi.list(),
        roomsApi.list({ hostelId: selectedBranch || undefined, pageSize: 100 }),
      ]);
      setBranches(hList || []);
      if (!selectedBranch && hList?.length > 0) {
        setSelectedBranch(hList[0].id);
      }
      setRooms(rRes?.items || []);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to load rooms.');
    } finally {
      setLoading(false);
    }
  }, [selectedBranch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Add Room Submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const branchId = addForm.hostelId || selectedBranch || branches[0]?.id;
    if (!branchId) {
      toast.error('Please select a hostel branch.');
      return;
    }
    setSubmittingAdd(true);
    try {
      await roomsApi.create({
        hostelId: branchId,
        roomNumber: addForm.roomNumber,
        number: addForm.roomNumber,
        floorNumber: Number(addForm.floorNumber),
        floor: Number(addForm.floorNumber),
        buildingName: addForm.buildingName || 'Main Building',
        blockName: addForm.blockName || '1',
        capacity: Number(addForm.capacity),
        totalBeds: Number(addForm.capacity),
        roomType: addForm.roomType,
        type: addForm.roomType,
        monthlyRentPerBed: Number(addForm.monthlyRentPerBed),
        monthlyRate: Number(addForm.monthlyRentPerBed),
        status: addForm.status || 'ACTIVE',
      });
      toast.success(`Room ${addForm.roomNumber} with ${addForm.capacity} beds generated successfully!`);
      setAddModalOpen(false);
      loadData();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to create room.');
    } finally {
      setSubmittingAdd(false);
    }
  };

  // Open Edit Room Modal
  const openEditModal = (room: Room) => {
    setEditingRoom(room);
    setEditForm({
      roomNumber: room.roomNumber || room.number || '',
      buildingName: room.buildingName || 'Main Building',
      blockName: room.blockName || '1',
      floorNumber: room.floorNumber || room.floor || 1,
      roomType: room.roomType || room.type || 'DOUBLE',
      capacity: room.capacity || room.totalBeds || 2,
      monthlyRentPerBed: room.monthlyRentPerBed || room.monthlyRate || 8000,
      status: room.status || 'ACTIVE',
    });
    setEditModalOpen(true);
  };

  // Handle Edit Room Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;

    if (editForm.capacity < (editingRoom.occupied || 0)) {
      toast.error(`Cannot reduce capacity to ${editForm.capacity}. Room has ${editingRoom.occupied} occupied bed(s).`);
      return;
    }

    setSubmittingEdit(true);
    try {
      await roomsApi.update(editingRoom.id, {
        roomNumber: editForm.roomNumber,
        number: editForm.roomNumber,
        buildingName: editForm.buildingName,
        blockName: editForm.blockName,
        floorNumber: Number(editForm.floorNumber),
        floor: Number(editForm.floorNumber),
        roomType: editForm.roomType,
        type: editForm.roomType,
        capacity: Number(editForm.capacity),
        totalBeds: Number(editForm.capacity),
        monthlyRentPerBed: Number(editForm.monthlyRentPerBed),
        monthlyRate: Number(editForm.monthlyRentPerBed),
        status: editForm.status,
      });

      toast.success(`Room ${editForm.roomNumber} updated successfully!`);
      setEditModalOpen(false);
      loadData();
      if (detailsSheetOpen && detailedRoom?.id === editingRoom.id) {
        openRoomDetails(editingRoom.id);
      }
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to update room.');
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Open Manage Beds Modal
  const openManageBeds = async (room: Room) => {
    setActiveRoomForBeds(room);
    setBedsModalOpen(true);
    setLoadingBeds(true);
    try {
      const beds = await roomsApi.getBeds(room.id);
      setRoomBeds(beds || []);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to load beds for this room.');
    } finally {
      setLoadingBeds(false);
    }
  };

  // Refresh active beds list
  const refreshActiveRoomBeds = async (roomId: string) => {
    try {
      const beds = await roomsApi.getBeds(roomId);
      setRoomBeds(beds || []);
      loadData();
    } catch (err) {
      console.error('Failed to refresh beds', err);
    }
  };

  // Add new bed to room
  const handleAddBedToActiveRoom = async () => {
    if (!activeRoomForBeds) return;
    setAddingBed(true);
    try {
      const res = await roomsApi.addBed(activeRoomForBeds.id, {
        monthlyRate: activeRoomForBeds.monthlyRentPerBed || activeRoomForBeds.monthlyRate || 8000,
        status: 'AVAILABLE',
      });
      toast.success(`Bed ${res.bed.bedCode || res.bed.number} added successfully!`);
      await refreshActiveRoomBeds(activeRoomForBeds.id);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to add bed.');
    } finally {
      setAddingBed(false);
    }
  };

  // Update Bed Status
  const handleUpdateBedStatus = async (bed: Bed, newStatus: Bed['status']) => {
    setActionBedId(bed.id);
    try {
      await bedsApi.update(bed.id, { status: newStatus });
      toast.success(`Bed ${bed.bedCode || bed.number} status updated to ${newStatus}`);
      if (activeRoomForBeds) {
        await refreshActiveRoomBeds(activeRoomForBeds.id);
      }
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to update bed status.');
    } finally {
      setActionBedId(null);
    }
  };

  // Delete Bed
  const handleDeleteBed = async (bed: Bed) => {
    if (bed.status === 'OCCUPIED' || bed.studentId) {
      toast.error(`Cannot delete Bed ${bed.bedCode || bed.number}: It is currently assigned to a student.`);
      return;
    }
    setActionBedId(bed.id);
    try {
      await bedsApi.remove(bed.id);
      toast.success(`Bed ${bed.bedCode || bed.number} removed successfully.`);
      if (activeRoomForBeds) {
        await refreshActiveRoomBeds(activeRoomForBeds.id);
      }
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to delete bed.');
    } finally {
      setActionBedId(null);
    }
  };

  // Open Delete Room Confirmation Dialog
  const openDeleteModal = (room: Room) => {
    setDeletingRoom(room);
    setDeleteModalOpen(true);
  };

  // Handle Delete Room Submit
  const handleDeleteRoomSubmit = async () => {
    if (!deletingRoom) return;
    if ((deletingRoom.occupied || 0) > 0) {
      toast.error(`Cannot delete Room ${deletingRoom.roomNumber || deletingRoom.number}. It contains ${deletingRoom.occupied} occupied bed(s).`);
      return;
    }

    setSubmittingDelete(true);
    try {
      const res = await roomsApi.remove(deletingRoom.id);
      toast.success(res?.message || `Room ${deletingRoom.roomNumber || deletingRoom.number} deleted successfully.`);
      setDeleteModalOpen(false);
      setDeletingRoom(null);
      if (detailsSheetOpen && detailedRoom?.id === deletingRoom.id) {
        setDetailsSheetOpen(false);
      }
      loadData();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to delete room.');
    } finally {
      setSubmittingDelete(false);
    }
  };

  // Open Room Details View
  const openRoomDetails = async (roomId: string) => {
    setDetailsSheetOpen(true);
    setLoadingDetails(true);
    try {
      const room = await roomsApi.getById(roomId);
      setDetailedRoom(room);
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to load room details.');
      setDetailsSheetOpen(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const filtered = rooms.filter((r) => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    const matchesRoom =
      String(r.roomNumber || r.number || '').toLowerCase().includes(term) ||
      String(r.blockName || '').toLowerCase().includes(term) ||
      String(r.type || r.roomType || '').toLowerCase().includes(term) ||
      String(r.buildingName || '').toLowerCase().includes(term) ||
      String(r.hostelName || '').toLowerCase().includes(term) ||
      (r.floorNumber !== undefined && String(r.floorNumber).includes(term));

    const matchesBeds = Array.isArray(r.beds) && r.beds.some((b: any) =>
      String(b.bedNumber || '').toLowerCase().includes(term) ||
      String(b.bedCode || '').toLowerCase().includes(term) ||
      String(b.studentName || '').toLowerCase().includes(term) ||
      String(b.customerCode || b.studentId || '').toLowerCase().includes(term)
    );

    return matchesRoom || matchesBeds;
  });

  const totalBeds = rooms.reduce((acc, r) => acc + (r.capacity || r.totalBeds || 0), 0);
  const occupiedBeds = rooms.reduce((acc, r) => acc + (r.occupied || r.occupiedBeds || 0), 0);
  const availableBeds = Math.max(totalBeds - occupiedBeds, 0);

  const columns: Column<Room>[] = [
    {
      key: 'roomNumber',
      header: 'Room',
      cell: (r) => (
        <button
          onClick={() => openRoomDetails(r.id)}
          className="flex items-center gap-3 text-left group focus:outline-none"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold transition-colors group-hover:bg-primary group-hover:text-primary-foreground border border-primary/20">
            {r.roomNumber || r.number}
          </div>
          <div>
            <p className="font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
              Room {r.roomNumber || r.number}
              <Eye className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
            </p>
            <p className="text-xs text-muted-foreground">
              Floor {r.floor || r.floorNumber} • {r.buildingName || 'Main Building'}
            </p>
          </div>
        </button>
      ),
    },
    {
      key: 'type',
      header: 'Sharing Type',
      cell: (r) => (
        <Badge variant="info" className="font-semibold">
          {r.roomType || r.type || 'DOUBLE'}
        </Badge>
      ),
    },
    {
      key: 'beds',
      header: 'Beds Status',
      cell: (r) => (
        <div className="flex items-center gap-1.5 flex-wrap max-w-[200px]">
          {r.beds && r.beds.length > 0 ? (
            r.beds.map((b: any, idx: number) => {
              const isOccupied = b.status === 'OCCUPIED' || Boolean(b.studentId);
              const isMaint = b.status === 'MAINTENANCE';
              return (
                <TooltipProvider key={idx}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={`inline-flex h-6 px-2 items-center justify-center rounded text-[11px] font-mono font-bold cursor-default transition-all shadow-xs ${
                          isOccupied
                            ? 'bg-primary text-primary-foreground'
                            : isMaint
                            ? 'bg-destructive/15 text-destructive border border-destructive/30'
                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        B{String(b.bedNumber || idx + 1).padStart(2, '0')}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p className="font-semibold">{b.bedCode || `Bed ${b.bedNumber || idx + 1}`}</p>
                      <p className="text-muted-foreground">Status: <span className="font-medium text-foreground">{b.status}</span></p>
                      {b.studentName && <p className="text-emerald-500">Student: {b.studentName} ({b.customerCode})</p>}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })
          ) : (
            <span className="text-xs text-muted-foreground">
              {r.occupied || 0} / {r.capacity || 1} Occupied
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'occupancy',
      header: 'Capacity',
      cell: (r) => {
        const occ = r.occupied || r.occupiedBeds || 0;
        const cap = r.capacity || r.totalBeds || 1;
        const pct = Math.min(Math.round((occ / cap) * 100), 100);
        return (
          <div className="text-xs space-y-1.5">
            <div className="flex items-center justify-between gap-2 font-medium">
              <span>{occ} / {cap} Occupied</span>
              <span className="text-muted-foreground font-mono text-[10px]">{pct}%</span>
            </div>
            <div className="h-1.5 w-24 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  pct === 100 ? 'bg-destructive' : pct > 0 ? 'bg-primary' : 'bg-emerald-500'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'rate',
      header: 'Monthly Rent / Bed',
      cell: (r) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          ₹{(r.monthlyRentPerBed || r.monthlyRate || 8000).toLocaleString('en-IN')}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Availability',
      cell: (r) => {
        const occ = r.occupied || r.occupiedBeds || 0;
        const cap = r.capacity || r.totalBeds || 1;
        const isFull = occ >= cap;
        const isPartial = occ > 0 && occ < cap;
        return (
          <Badge variant={isFull ? 'error' : isPartial ? 'warning' : 'success'} className="font-semibold">
            {isFull ? 'FULL' : isPartial ? 'PARTIAL' : 'AVAILABLE'}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (r) => (
        <TooltipProvider>
          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            {/* 1. Edit Room */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditModal(r)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Edit Room</TooltipContent>
            </Tooltip>

            {/* 2. Manage Beds */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openManageBeds(r)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Manage Beds</TooltipContent>
            </Tooltip>

            {/* 3. Delete Room */}
            {canManage && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openDeleteModal(r)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Delete Room</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      ),
    },
  ];

  const renderMobileRoomCard = (r: Room) => {
    const occ = r.occupied || r.occupiedBeds || 0;
    const cap = r.capacity || r.totalBeds || 1;
    const isFull = occ >= cap;
    const isPartial = occ > 0 && occ < cap;

    return (
      <div className="w-full rounded-xl border border-[#CBD5E1] bg-white p-3.5 space-y-3">
        {/* Room Header */}
        <div className="flex items-start justify-between gap-2 border-b border-[#E4E0D7] pb-2">
          <button
            onClick={() => openRoomDetails(r.id)}
            className="flex items-center gap-2.5 text-left group focus:outline-none"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FFF3EB] text-[#E87545] font-bold border border-[#FDE6D6]">
              {r.roomNumber || r.number}
            </div>
            <div>
              <p className="font-bold text-[#111827] text-sm group-hover:text-[#E87545] transition-colors flex items-center gap-1">
                Room {r.roomNumber || r.number}
                <Eye className="h-3.5 w-3.5 text-[#E87545]" />
              </p>
              <p className="text-[11px] font-medium text-[#64748B]">
                Floor {r.floor || r.floorNumber} • {r.buildingName || 'Main Building'}
              </p>
            </div>
          </button>
          <Badge variant={isFull ? 'error' : isPartial ? 'warning' : 'success'} className="font-bold text-[11px]">
            {isFull ? 'FULL' : isPartial ? 'PARTIAL' : 'AVAILABLE'}
          </Badge>
        </div>

        {/* Room Details Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Sharing Type</span>
            <p className="font-bold text-[#111827]">{r.roomType || r.type || 'DOUBLE'}</p>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Monthly Rent</span>
            <p className="font-bold text-[#111827] font-mono">₹{(r.monthlyRentPerBed || r.monthlyRate || 8000).toLocaleString('en-IN')}</p>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Occupancy</span>
            <p className="font-bold text-[#111827]">{occ} / {cap} Beds ({Math.min(Math.round((occ / cap) * 100), 100)}%)</p>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Hostel</span>
            <p className="font-bold text-[#111827] truncate">{r.hostelName || 'Main Hostel'}</p>
          </div>
        </div>

        {/* Beds Status Badges */}
        {r.beds && r.beds.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t border-[#F1F5F9]">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Beds:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {r.beds.map((b: any, idx: number) => {
                const isOccupied = b.status === 'OCCUPIED' || Boolean(b.studentId);
                const isMaint = b.status === 'MAINTENANCE';
                return (
                  <span
                    key={idx}
                    className={`inline-flex h-6 px-2 items-center justify-center rounded text-[11px] font-mono font-bold ${
                      isOccupied
                        ? 'bg-[#E87545] text-white'
                        : isMaint
                        ? 'bg-rose-100 text-rose-700 border border-rose-200'
                        : 'bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]'
                    }`}
                  >
                    B{String(b.bedNumber || idx + 1).padStart(2, '0')}
                    {isOccupied && b.studentName ? ` (${b.studentName.split(' ')[0]})` : ''}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions Button Bar */}
        <div className="flex items-center justify-end gap-2 border-t border-[#E4E0D7] pt-2.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => openEditModal(r)}
            className="h-8 text-xs font-bold gap-1 border-[#CBD5E1]"
          >
            <Pencil className="h-3.5 w-3.5 text-[#E87545]" /> Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openManageBeds(r)}
            className="h-8 text-xs font-bold gap-1 border-[#CBD5E1]"
          >
            <BedDouble className="h-3.5 w-3.5 text-[#2563EB]" /> Beds
          </Button>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => openDeleteModal(r)}
              className="h-8 text-xs font-bold gap-1 border-[#CBD5E1] text-rose-600 hover:bg-rose-50 hover:border-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5.5">
      <PageHeader
        title="Rooms & Beds"
        description="Configure hostel rooms, bed assignments, floor layouts, and occupancy tracking"
        action={
          canManage && (
            <Button onClick={() => setAddModalOpen(true)} className="gap-2 font-bold bg-[#E87545] hover:bg-[#D66434] text-white">
              <Plus className="h-4 w-4" />
              Add Room
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <StatCard title="Total Rooms" value={rooms.length} icon={DoorOpen} />
        <StatCard title="Total Beds" value={totalBeds} icon={BedDouble} />
        <StatCard title="Occupied Beds" value={occupiedBeds} icon={Users} />
        <StatCard title="Available Beds" value={availableBeds} icon={CheckCircle2} />
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
        searchPlaceholder="Search by room number, block..."
        mobileRender={renderMobileRoomCard}
        filters={
          branches.length > 1 ? (
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-48 h-10 bg-white border-[1.5px] border-[#CBD5E1] text-[#111827]">
                <SelectValue placeholder="Select Branch" />
              </SelectTrigger>
              <SelectContent className="bg-white border-[1.5px] border-[#CBD5E1]">
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
        toolbarRight={
          <Button variant="outline" size="sm" onClick={loadData} className="h-10 px-3.5 bg-white border-[#CBD5E1] text-[#111827] hover:bg-[#F8FAFC]" aria-label="Refresh rooms">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        }
        rowKey={(r: any) => r.id}
        emptyTitle="No rooms found"
        emptyDescription="Click 'Add Room' to generate your first room & beds."
      />

      {/* ========================================================================= */}
      {/* 1. ADD ROOM MODAL (Auto-Generates Bed IDs e.g. 101-B01, 101-B02...)      */}
      {/* ========================================================================= */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleAddSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <DoorOpen className="h-5 w-5 text-primary" />
                Add Room & Auto-Generate Beds
              </DialogTitle>
              <DialogDescription>
                Beds will be automatically generated with standard sequence codes (e.g. 101-B01, 101-B02).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3.5 py-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Hostel Branch *</label>
                <Select
                  value={addForm.hostelId || selectedBranch}
                  onValueChange={(val) => setAddForm({ ...addForm, hostelId: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select hostel branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} ({b.code || b.branchCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Room Number *</label>
                  <Input
                    placeholder="e.g. 101"
                    value={addForm.roomNumber}
                    onChange={(e) => setAddForm({ ...addForm, roomNumber: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Floor Number *</label>
                  <Input
                    type="number"
                    min={0}
                    value={addForm.floorNumber}
                    onChange={(e) => setAddForm({ ...addForm, floorNumber: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Building Name</label>
                  <Input
                    placeholder="Main Building"
                    value={addForm.buildingName}
                    onChange={(e) => setAddForm({ ...addForm, buildingName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Block Name</label>
                  <Input
                    placeholder="1 or A"
                    value={addForm.blockName}
                    onChange={(e) => setAddForm({ ...addForm, blockName: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Sharing Type</label>
                  <Select
                    value={addForm.roomType}
                    onValueChange={(val) => {
                      const caps: Record<string, number> = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, FOUR_SHARING: 4 };
                      setAddForm({ ...addForm, roomType: val, capacity: caps[val] || 2 });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SINGLE">Single Room (1 Bed)</SelectItem>
                      <SelectItem value="DOUBLE">Double Sharing (2 Beds)</SelectItem>
                      <SelectItem value="TRIPLE">Triple Sharing (3 Beds)</SelectItem>
                      <SelectItem value="FOUR_SHARING">Four Sharing (4 Beds)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Total Bed Capacity *</label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={addForm.capacity}
                    onChange={(e) => setAddForm({ ...addForm, capacity: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Monthly Rent Per Bed (₹) *</label>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={addForm.monthlyRentPerBed}
                  onChange={(e) => setAddForm({ ...addForm, monthlyRentPerBed: Number(e.target.value) })}
                  required
                />
              </div>

              <div className="rounded-lg bg-secondary/50 p-3 border border-border/60 text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Auto-Generated Beds Preview:
                </div>
                <div className="flex flex-wrap gap-1 pt-1 font-mono">
                  {Array.from({ length: Number(addForm.capacity) || 1 }).map((_, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-card border border-border text-[11px]">
                      {addForm.roomNumber || '101'}-B{String(i + 1).padStart(2, '0')} (₹{Number(addForm.monthlyRentPerBed || 8000).toLocaleString('en-IN')}/mo)
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingAdd} className="gap-2">
                {submittingAdd ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Generate Room & Beds
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 2. EDIT ROOM MODAL                                                        */}
      {/* ========================================================================= */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Pencil className="h-5 w-5 text-primary" />
                Edit Room {editingRoom?.roomNumber || editingRoom?.number}
              </DialogTitle>
              <DialogDescription>
                Update room specifications, floor location, capacity, and monthly rental rate.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3.5 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Room Number *</label>
                  <Input
                    placeholder="e.g. 101"
                    value={editForm.roomNumber}
                    onChange={(e) => setEditForm({ ...editForm, roomNumber: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Floor Number *</label>
                  <Input
                    type="number"
                    min={0}
                    value={editForm.floorNumber}
                    onChange={(e) => setEditForm({ ...editForm, floorNumber: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Building Name</label>
                  <Input
                    placeholder="Main Building"
                    value={editForm.buildingName}
                    onChange={(e) => setEditForm({ ...editForm, buildingName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Block Name</label>
                  <Input
                    placeholder="1 or A"
                    value={editForm.blockName}
                    onChange={(e) => setEditForm({ ...editForm, blockName: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Sharing Type</label>
                  <Select
                    value={editForm.roomType}
                    onValueChange={(val) => {
                      const caps: Record<string, number> = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, FOUR_SHARING: 4 };
                      setEditForm({ ...editForm, roomType: val, capacity: Math.max(caps[val] || 2, editingRoom?.occupied || 0) });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SINGLE">Single Room (1 Bed)</SelectItem>
                      <SelectItem value="DOUBLE">Double Sharing (2 Beds)</SelectItem>
                      <SelectItem value="TRIPLE">Triple Sharing (3 Beds)</SelectItem>
                      <SelectItem value="FOUR_SHARING">Four Sharing (4 Beds)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Total Bed Capacity *
                    {editingRoom && editingRoom.occupied > 0 && (
                      <span className="text-[10px] text-muted-foreground ml-1">(Min: {editingRoom.occupied})</span>
                    )}
                  </label>
                  <Input
                    type="number"
                    min={editingRoom?.occupied || 1}
                    max={12}
                    value={editForm.capacity}
                    onChange={(e) => setEditForm({ ...editForm, capacity: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Monthly Rent Per Bed (₹) *</label>
                  <Input
                    type="number"
                    min={0}
                    step={100}
                    value={editForm.monthlyRentPerBed}
                    onChange={(e) => setEditForm({ ...editForm, monthlyRentPerBed: Number(e.target.value) })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Room Status</label>
                  <Select
                    value={editForm.status}
                    onValueChange={(val: any) => setEditForm({ ...editForm, status: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active / Operational</SelectItem>
                      <SelectItem value="MAINTENANCE">Under Maintenance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {editingRoom && editingRoom.occupied > 0 && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    This room currently has <strong>{editingRoom.occupied} occupied bed(s)</strong>. Capacity cannot be reduced below the number of occupied beds.
                  </span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingEdit} className="gap-2">
                {submittingEdit ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 3. MANAGE BEDS MODAL                                                      */}
      {/* ========================================================================= */}
      <Dialog open={bedsModalOpen} onOpenChange={setBedsModalOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <SlidersHorizontal className="h-5 w-5 text-primary" />
                Manage Beds — Room {activeRoomForBeds?.roomNumber || activeRoomForBeds?.number}
              </DialogTitle>
              <Button
                size="sm"
                onClick={handleAddBedToActiveRoom}
                disabled={addingBed}
                className="gap-1.5 h-8 text-xs font-semibold"
              >
                {addingBed ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add Bed
              </Button>
            </div>
            <DialogDescription>
              View, edit statuses, configure pricing, and remove unused beds for this room.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1">
            {loadingBeds ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-2 text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                <p className="text-xs">Loading beds...</p>
              </div>
            ) : roomBeds.length === 0 ? (
              <div className="text-center py-10 border border-dashed rounded-xl p-6 space-y-3">
                <BedDouble className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium">No beds found in this room.</p>
                <Button size="sm" onClick={handleAddBedToActiveRoom} disabled={addingBed} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add First Bed
                </Button>
              </div>
            ) : (
              roomBeds.map((bed, idx) => {
                const isOccupied = bed.status === 'OCCUPIED' || Boolean(bed.studentId);
                const isUpdating = actionBedId === bed.id;

                return (
                  <div
                    key={bed.id || idx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-[#CBD5E1] bg-white hover:bg-[#FFF8ED] hover:border-[#E87545] transition-colors duration-150 gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-mono font-bold text-sm ${
                          isOccupied
                            ? 'bg-primary text-primary-foreground'
                            : bed.status === 'MAINTENANCE'
                            ? 'bg-destructive/15 text-destructive border border-destructive/30'
                            : bed.status === 'RESERVED'
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        B{String(bed.bedNumber || idx + 1).padStart(2, '0')}
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-foreground font-mono">
                            {bed.bedCode || `Bed ${bed.bedNumber || idx + 1}`}
                          </p>
                          <Badge
                            variant={
                              isOccupied ? 'default' : bed.status === 'MAINTENANCE' ? 'error' : bed.status === 'RESERVED' ? 'warning' : 'success'
                            }
                            className="text-[10px] py-0 px-2 uppercase font-bold"
                          >
                            {bed.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                          <span>₹{(bed.monthlyRate || bed.monthlyFee || activeRoomForBeds?.monthlyRate || 8000).toLocaleString('en-IN')}/month</span>
                        </p>
                        {isOccupied && (
                          <div className="flex items-center gap-1.5 text-xs text-primary font-medium pt-1">
                            <UserCheck className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              Assigned: {bed.studentName || 'Student'} {bed.customerCode ? `(${bed.customerCode})` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Select
                        value={bed.status}
                        onValueChange={(val: any) => handleUpdateBedStatus(bed, val)}
                        disabled={isUpdating || isOccupied}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AVAILABLE">Available</SelectItem>
                          <SelectItem value="RESERVED">Reserved</SelectItem>
                          <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                          {isOccupied && <SelectItem value="OCCUPIED">Occupied</SelectItem>}
                        </SelectContent>
                      </Select>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteBed(bed)}
                                disabled={isOccupied || isUpdating}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
                              >
                                {isUpdating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {isOccupied ? 'Cannot delete bed with assigned student' : 'Remove bed'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="border-t border-border pt-3">
            <Button variant="outline" onClick={() => setBedsModalOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 4. DELETE ROOM CONFIRMATION DIALOG                                        */}
      {/* ========================================================================= */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive text-lg font-bold">
              <Trash2 className="h-5 w-5" />
              Delete Room?
            </DialogTitle>
            <DialogDescription className="text-foreground/90 pt-1">
              Are you sure you want to delete <strong>Room {deletingRoom?.roomNumber || deletingRoom?.number}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deletingRoom && (deletingRoom.occupied || 0) > 0 ? (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3.5 text-xs text-destructive space-y-1.5 my-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertCircle className="h-4 w-4" /> Deletion Blocked
              </div>
              <p>
                This room contains <strong>{deletingRoom.occupied} occupied bed(s)</strong>. You cannot delete a room that has active students assigned.
              </p>
              <p className="text-muted-foreground pt-1">
                Please reassign or vacate the students before attempting to delete this room.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-secondary/50 border border-border p-3 text-xs text-muted-foreground space-y-1 my-2">
              <p>All {deletingRoom?.capacity || deletingRoom?.totalBeds || 0} unassigned beds in this room will also be deleted from the database.</p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteModalOpen(false)}
              disabled={submittingDelete}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteRoomSubmit}
              disabled={submittingDelete || (deletingRoom ? (deletingRoom.occupied || 0) > 0 : false)}
              className="gap-2"
            >
              {submittingDelete && <RefreshCw className="h-4 w-4 animate-spin" />}
              Delete Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 5. ROOM DETAILS VIEW (Clickable Room Row / Name)                           */}
      {/* ========================================================================= */}
      <Sheet open={detailsSheetOpen} onOpenChange={setDetailsSheetOpen}>
        <SheetContent className="sm:max-w-[500px] overflow-y-auto flex flex-col p-6">
          <SheetHeader className="text-left space-y-1 border-b border-border pb-4">
            <div className="flex items-center justify-between pr-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg">
                  {detailedRoom?.roomNumber || detailedRoom?.number}
                </div>
                <div>
                  <SheetTitle className="text-xl">Room {detailedRoom?.roomNumber || detailedRoom?.number}</SheetTitle>
                  <SheetDescription>
                    {detailedRoom?.hostelName || 'Hostel'} • Floor {detailedRoom?.floorNumber || detailedRoom?.floor} • {detailedRoom?.buildingName || 'Main Building'}
                  </SheetDescription>
                </div>
              </div>
            </div>
          </SheetHeader>

          {loadingDetails ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-3 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Loading room details...</p>
            </div>
          ) : detailedRoom ? (
            <div className="flex-1 py-4 space-y-5">
              {/* Quick Specs Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border border-border bg-card">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Sharing Type</span>
                  <p className="font-semibold text-sm text-foreground pt-0.5">{detailedRoom.roomType || detailedRoom.type || 'DOUBLE'}</p>
                </div>
                <div className="p-3 rounded-xl border border-border bg-card">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Monthly Rent / Bed</span>
                  <p className="font-semibold text-sm text-foreground pt-0.5">
                    ₹{(detailedRoom.monthlyRentPerBed || detailedRoom.monthlyRate || 8000).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-border bg-card">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Bed Capacity</span>
                  <p className="font-semibold text-sm text-foreground pt-0.5">
                    {detailedRoom.capacity || detailedRoom.totalBeds || 0} Beds
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-border bg-card">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Current Occupancy</span>
                  <p className="font-semibold text-sm text-foreground pt-0.5">
                    {detailedRoom.occupied || detailedRoom.occupiedBeds || 0} Occupied ({detailedRoom.available || detailedRoom.availableBeds || 0} Available)
                  </p>
                </div>
              </div>

              {/* Bed-wise Status & Student Details */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bed-wise Status</h4>
                  <span className="text-xs font-semibold text-primary">{detailedRoom.beds?.length || 0} Total Beds</span>
                </div>

                <div className="space-y-2">
                  {detailedRoom.beds && detailedRoom.beds.length > 0 ? (
                    detailedRoom.beds.map((bed: any, idx: number) => {
                      const isOcc = bed.status === 'OCCUPIED' || Boolean(bed.studentId);
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl border border-border bg-card/60 flex items-start justify-between gap-3 shadow-xs"
                        >
                          <div className="flex items-start gap-2.5">
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono font-bold text-xs ${
                                isOcc
                                  ? 'bg-primary text-primary-foreground'
                                  : bed.status === 'MAINTENANCE'
                                  ? 'bg-destructive/15 text-destructive'
                                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              B{String(bed.bedNumber || idx + 1).padStart(2, '0')}
                            </div>
                            <div>
                              <p className="font-mono font-semibold text-xs text-foreground">
                                {bed.bedCode || `Bed ${bed.bedNumber || idx + 1}`}
                              </p>
                              {isOcc && (
                                <p className="text-xs text-primary font-medium pt-0.5">
                                  {bed.studentName || 'Student'} {bed.customerCode ? `• ${bed.customerCode}` : ''}
                                </p>
                              )}
                              {!isOcc && (
                                <p className="text-[11px] text-muted-foreground pt-0.5">
                                  ₹{(bed.monthlyRate || bed.monthlyFee || detailedRoom.monthlyRate || 8000).toLocaleString('en-IN')}/mo
                                </p>
                              )}
                            </div>
                          </div>

                          <Badge
                            variant={isOcc ? 'default' : bed.status === 'MAINTENANCE' ? 'error' : 'success'}
                            className="text-[10px] uppercase font-bold"
                          >
                            {bed.status}
                          </Badge>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-muted-foreground">No bed details available.</p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button
                  onClick={() => {
                    setDetailsSheetOpen(false);
                    openEditModal(detailedRoom);
                  }}
                  variant="outline"
                  className="flex-1 gap-2"
                >
                  <Pencil className="h-4 w-4" /> Edit Room
                </Button>
                <Button
                  onClick={() => {
                    setDetailsSheetOpen(false);
                    openManageBeds(detailedRoom);
                  }}
                  className="flex-1 gap-2"
                >
                  <SlidersHorizontal className="h-4 w-4" /> Manage Beds
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function RoomsPage() {
  return (
    <PageErrorBoundary fallbackTitle="Unable to load Room Management">
      <RoomsPageContent />
    </PageErrorBoundary>
  );
}


