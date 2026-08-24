'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Megaphone, Plus, Search, Calendar, Users, Eye, Edit3, Trash2,
  Power, AlertCircle, ShieldAlert, CheckCircle2, Clock, Building2,
  BedDouble, UserCheck, Bell, Sparkles, Filter, X, Image as ImageIcon, UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/dashboard/confirm-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { announcementsApi } from '@/lib/api/announcements.api';
import { hostelsApi } from '@/lib/api/hostels.api';
import { roomsApi } from '@/lib/api/rooms.api';
import { studentsApi } from '@/lib/api/students.api';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import { useAuth } from '@/lib/auth/auth-context';
import { useRealtimeEvent } from '@/lib/realtime/use-realtime';
import type {
  Announcement,
  AnnouncementPriority,
  AnnouncementTargetType,
  AnnouncementStatus,
  CreateAnnouncementPayload,
  ApiError,
} from '@/lib/types';

function AnnouncementsPageContent() {
  const { currentBranchId, branches } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [targetFilter, setTargetFilter] = useState<string>('ALL');

  // Targeting options
  const [rooms, setRooms] = useState<Array<{ id: string; roomNumber: string; hostelName?: string }>>([]);
  const [students, setStudents] = useState<Array<{ id: string; name: string; customerCode?: string; roomNumber?: string }>>([]);

  // Create / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState<CreateAnnouncementPayload>({
    title: '',
    message: '',
    priority: 'NORMAL',
    targetType: 'ALL',
    targetId: '',
    targetLabel: 'All Students',
    branchId: currentBranchId || undefined,
    expiresAt: '',
    imageUrl: null,
  });

  // Image Attachment State
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageChanged, setImageChanged] = useState<boolean>(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // View Detail Modal state
  const [viewItem, setViewItem] = useState<Announcement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load announcements
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await announcementsApi.list({
        branchId: currentBranchId || undefined,
        pageSize: 100,
      });
      setAnnouncements(res.items || []);
    } catch (err) {
      setError((err as ApiError)?.message || 'Failed to load announcements.');
    } finally {
      setLoading(false);
    }
  }, [currentBranchId]);

  // Load rooms and students for targeting options
  const loadTargetOptions = useCallback(async () => {
    try {
      const [roomsRes, studentsRes] = await Promise.allSettled([
        roomsApi.list({ pageSize: 100 }),
        studentsApi.list({ pageSize: 200 }),
      ]);
      if (roomsRes.status === 'fulfilled') {
        const rList = (roomsRes.value as any)?.items || roomsRes.value || [];
        setRooms(rList.map((r: any) => ({
          id: r.id || r._id,
          roomNumber: r.roomNumber || r.number || 'Unnamed Room',
          hostelName: r.hostelName || r.buildingName,
        })));
      }
      if (studentsRes.status === 'fulfilled') {
        const sList = (studentsRes.value as any)?.items || [];
        setStudents(sList.map((s: any) => ({
          id: s.id || s._id,
          name: s.name || s.fullName || 'Student',
          customerCode: s.customerCode || s.studentId,
          roomNumber: s.roomNumber,
        })));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    loadTargetOptions();
  }, [load, loadTargetOptions]);

  // Real-time updates
  useRealtimeEvent('announcement.created', load);
  useRealtimeEvent('announcement.updated', load);
  useRealtimeEvent('announcement.deleted', load);

  const resetForm = () => {
    setForm({
      title: '',
      message: '',
      priority: 'NORMAL',
      targetType: 'ALL',
      targetId: '',
      targetLabel: 'All Students',
      branchId: currentBranchId || undefined,
      expiresAt: '',
      imageUrl: null,
    });
    setImagePreview(null);
    setImageChanged(false);
    setIsEditing(false);
    setEditingId(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: Announcement) => {
    setEditingId(item.id);
    setIsEditing(true);
    setForm({
      title: item.title,
      message: item.message,
      priority: item.priority,
      targetType: item.targetType,
      targetId: item.targetId || '',
      targetLabel: item.targetLabel || 'All Students',
      branchId: item.branchId || currentBranchId || undefined,
      expiresAt: item.expiresAt ? new Date(item.expiresAt).toISOString().split('T')[0] : '',
      imageUrl: item.imageUrl || item.attachmentUrl || item.announcementImage || null,
    });
    setImagePreview(item.imageUrl || item.attachmentUrl || item.announcementImage || null);
    setImageChanged(false);
    setIsModalOpen(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const validExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validTypes.includes(file.type.toLowerCase()) && !validExts.includes(ext)) {
      toast.error('Only JPG, JPEG, PNG, and WEBP image formats are supported.');
      e.target.value = '';
      return;
    }

    // Check file size (5MB max)
    const MAX_SIZE_MB = 5;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Image size exceeds ${MAX_SIZE_MB}MB limit. Please upload a smaller image.`);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
      setImageChanged(true);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setImageChanged(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('Please enter an announcement title.');
      return;
    }
    if (!form.message?.trim() && !imagePreview) {
      toast.error('Please enter announcement message or attach an image.');
      return;
    }

    // Determine target label
    let finalLabel = 'All Students';
    if (form.targetType === 'BRANCH') {
      const b = branches.find((x) => x.id === form.targetId);
      finalLabel = b ? `${b.branchCode || b.name} · ${b.city}` : 'Specific Branch';
    } else if (form.targetType === 'ROOM') {
      const r = rooms.find((x) => x.id === form.targetId || x.roomNumber === form.targetId);
      finalLabel = r ? `Room ${r.roomNumber}` : `Room ${form.targetId}`;
    } else if (form.targetType === 'STUDENT') {
      const s = students.find((x) => x.id === form.targetId);
      finalLabel = s ? `${s.name} (${s.customerCode || 'Resident'})` : 'Specific Student';
    }

    setSubmitting(true);
    try {
      const payloadData: any = {
        ...form,
        targetLabel: finalLabel,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      };

      if (imageChanged) {
        payloadData.imageUrl = imagePreview;
        payloadData.attachmentUrl = imagePreview;
        payloadData.announcementImage = imagePreview;
      }

      if (isEditing && editingId) {
        await announcementsApi.update(editingId, payloadData);
        toast.success('Announcement updated successfully.');
      } else {
        await announcementsApi.create(payloadData);
        toast.success('Announcement broadcasted to residents.');
      }
      setIsModalOpen(false);
      resetForm();
      load();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to publish announcement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (item: Announcement) => {
    try {
      const res = await announcementsApi.toggleStatus(item.id);
      toast.success(`Announcement ${res.status.toLowerCase()}.`);
      load();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to toggle status.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await announcementsApi.remove(deleteTarget.id);
      toast.success('Announcement removed.');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to delete announcement.');
    } finally {
      setDeleting(false);
    }
  };

  // Filter announcements
  const filtered = announcements.filter((item) => {
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (item.title || '').toLowerCase().includes(q) ||
      (item.message || '').toLowerCase().includes(q) ||
      (item.targetLabel || '').toLowerCase().includes(q) ||
      (item.createdByName || '').toLowerCase().includes(q);

    const matchesPriority = priorityFilter === 'ALL' || item.priority === priorityFilter;
    const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
    const matchesTarget = targetFilter === 'ALL' || item.targetType === targetFilter;

    return matchesSearch && matchesPriority && matchesStatus && matchesTarget;
  });

  const activeCount = announcements.filter((a) => a.status === 'ACTIVE').length;
  const urgentCount = announcements.filter((a) => a.priority === 'URGENT' && a.status === 'ACTIVE').length;
  const importantCount = announcements.filter((a) => a.priority === 'IMPORTANT' && a.status === 'ACTIVE').length;
  const totalReadCount = announcements.reduce((acc, a) => acc + (a.readCount || 0), 0);

  const priorityBadge = (p: AnnouncementPriority) => {
    if (p === 'URGENT') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-[#FEE2E2] text-[#DC2626] border border-[#FCA5A5]">
          <ShieldAlert className="h-3 w-3" /> URGENT
        </span>
      );
    }
    if (p === 'IMPORTANT') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]">
          <AlertCircle className="h-3 w-3" /> IMPORTANT
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1]">
        <Bell className="h-3 w-3" /> NORMAL
      </span>
    );
  };

  const statusBadge = (s: AnnouncementStatus) => {
    if (s === 'ACTIVE') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#087A45]" /> ACTIVE
        </span>
      );
    }
    if (s === 'EXPIRED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1]">
          <Clock className="h-3 w-3" /> EXPIRED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F8FAFC] text-[#94A3B8] border border-[#E2E8F0]">
        INACTIVE
      </span>
    );
  };

  const columns: Column<Announcement>[] = [
    {
      key: 'title',
      header: 'Announcement',
      cell: (item) => (
        <div className="space-y-1 max-w-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-extrabold text-[#000000] line-clamp-1">{item.title}</span>
            {priorityBadge(item.priority)}
            {(item.imageUrl || item.attachmentUrl || item.announcementImage) && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#2563EB] bg-[#EFF6FF] px-1.5 py-0.5 rounded-md border border-[#BFDBFE]">
                <ImageIcon className="h-3 w-3" /> Photo
              </span>
            )}
          </div>
          <p className="text-xs text-[#64748B] font-semibold line-clamp-2">{item.message}</p>
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Target Audience',
      cell: (item) => (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#111827]">
            {item.targetType === 'ALL' && <Users className="h-3.5 w-3.5 text-[#2563EB]" />}
            {item.targetType === 'BRANCH' && <Building2 className="h-3.5 w-3.5 text-[#E87545]" />}
            {item.targetType === 'ROOM' && <BedDouble className="h-3.5 w-3.5 text-[#087A45]" />}
            {item.targetType === 'STUDENT' && <UserCheck className="h-3.5 w-3.5 text-[#9333EA]" />}
            <span>{item.targetLabel || 'All Students'}</span>
          </div>
          <span className="text-[11px] font-bold text-[#64748B] uppercase">
            Type: {item.targetType}
          </span>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Published / Expiry',
      cell: (item) => (
        <div className="text-xs space-y-0.5">
          <p className="font-bold text-[#111827]">
            {new Date(item.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
          <p className="text-[11px] font-semibold text-[#64748B]">
            {item.expiresAt
              ? `Expires: ${new Date(item.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
              : 'No expiry date'}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (item) => (
        <div className="space-y-1">
          {statusBadge(item.status)}
          {item.readCount !== undefined && (
            <p className="text-[11px] font-bold text-[#64748B]">
              {item.readCount} read{item.readCount === 1 ? '' : 's'}
            </p>
          )}
        </div>
      ),
    },
  ];

  const renderActions = (item: Announcement) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-[#111827] hover:bg-[#F8FAFC]">
          <span className="sr-only">Open menu</span>
          •••
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-white border-[1.5px] border-[#CBD5E1]">
        <DropdownMenuItem
          onClick={() => setViewItem(item)}
          className="cursor-pointer font-bold text-xs text-[#111827] hover:bg-[#F8FAFC]"
        >
          <Eye className="mr-2 h-4 w-4 text-[#2563EB]" /> View Announcement
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleOpenEdit(item)}
          className="cursor-pointer font-bold text-xs text-[#111827] hover:bg-[#F8FAFC]"
        >
          <Edit3 className="mr-2 h-4 w-4 text-[#E87545]" /> Edit Announcement
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleToggle(item)}
          className="cursor-pointer font-bold text-xs text-[#111827] hover:bg-[#F8FAFC]"
        >
          <Power className="mr-2 h-4 w-4 text-[#087A45]" />
          {item.status === 'ACTIVE' ? 'Deactivate Announcement' : 'Activate Announcement'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setDeleteTarget(item)}
          className="cursor-pointer font-bold text-xs text-[#DC2626] hover:bg-[#FEE2E2]"
        >
          <Trash2 className="mr-2 h-4 w-4 text-[#DC2626]" /> Delete Announcement
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderMobileAnnouncementCard = (item: Announcement) => (
    <div className="w-full rounded-xl border border-[#CBD5E1] bg-white p-3.5 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-[#E4E0D7] pb-2">
        <div className="min-w-0">
          <p className="font-bold text-[#111827] text-sm truncate">{item.title}</p>
          <p className="text-[11px] text-[#64748B]">
            {new Date(item.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>
        {priorityBadge(item.priority)}
      </div>

      {/* Message snippet */}
      <p className="text-xs text-[#475569] line-clamp-2">{item.message}</p>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-2 text-xs border-t border-[#F1F5F9] pt-2">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Audience</span>
          <div className="flex items-center gap-1 text-xs font-bold text-[#111827] pt-0.5">
            {item.targetType === 'ALL' && <Users className="h-3.5 w-3.5 text-[#2563EB]" />}
            {item.targetType === 'BRANCH' && <Building2 className="h-3.5 w-3.5 text-[#E87545]" />}
            {item.targetType === 'ROOM' && <BedDouble className="h-3.5 w-3.5 text-[#087A45]" />}
            {item.targetType === 'STUDENT' && <UserCheck className="h-3.5 w-3.5 text-[#9333EA]" />}
            <span>{item.targetLabel || 'All Students'}</span>
          </div>
        </div>
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">Status</span>
          <div className="pt-0.5">{statusBadge(item.status)}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-[#E4E0D7] pt-2.5">
        <button
          onClick={() => setViewItem(item)}
          className="inline-flex items-center gap-1 text-xs font-bold text-[#E87545] hover:underline"
        >
          <Eye className="h-3.5 w-3.5" /> Read Notice
        </button>
        <div>{renderActions(item)}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-5.5">
      <PageHeader
        title="Announcements & Broadcasts"
        description="Broadcast notices, fee deadlines, maintenance alerts, and hostel news to residents"
        actions={
          <Button onClick={handleOpenCreate} className="gap-1.5 font-bold bg-[#E87545] hover:bg-[#D66434] text-white">
            <Plus className="h-4 w-4" /> Create Announcement
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Active Broadcasts"
          value={activeCount}
          icon={Megaphone}
          accent="primary"
          loading={loading}
        />
        <StatCard
          label="Urgent Notices"
          value={urgentCount}
          icon={ShieldAlert}
          accent="error"
          loading={loading}
        />
        <StatCard
          label="Important Updates"
          value={importantCount}
          icon={AlertCircle}
          accent="info"
          loading={loading}
        />
        <StatCard
          label="Student Reads"
          value={totalReadCount}
          icon={UserCheck}
          accent="success"
          loading={loading}
        />
      </div>

      {/* Announcements Table */}
      <DataTable
        columns={columns}
        data={filtered}
        total={filtered.length}
        page={1}
        pageSize={50}
        loading={loading}
        error={error}
        search={search}
        searchPlaceholder="Search announcements by title, message, target..."
        onSearchChange={setSearch}
        onRetry={load}
        mobileRender={renderMobileAnnouncementCard}
        rowKey={(item) => item.id}
        rowActions={renderActions}
        emptyTitle="No Announcements Published"
        emptyDescription="Create your first announcement to broadcast updates to hostel residents."
        emptyAction={{ label: 'Create Announcement', onClick: handleOpenCreate }}
        filters={
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-10 w-32 font-bold text-xs bg-white border-[1.5px] border-[#CBD5E1] text-[#111827]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent className="bg-white border-[1.5px] border-[#CBD5E1]">
                <SelectItem value="ALL">All Priorities</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
                <SelectItem value="IMPORTANT">Important</SelectItem>
                <SelectItem value="NORMAL">Normal</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 w-32 font-bold text-xs bg-white border-[1.5px] border-[#CBD5E1] text-[#111827]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-white border-[1.5px] border-[#CBD5E1]">
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
              </SelectContent>
            </Select>

            <Select value={targetFilter} onValueChange={setTargetFilter}>
              <SelectTrigger className="h-10 w-36 font-bold text-xs bg-white border-[1.5px] border-[#CBD5E1] text-[#111827]">
                <SelectValue placeholder="Target" />
              </SelectTrigger>
              <SelectContent className="bg-white border-[1.5px] border-[#CBD5E1]">
                <SelectItem value="ALL">All Audiences</SelectItem>
                <SelectItem value="ALL">All Students</SelectItem>
                <SelectItem value="BRANCH">Specific Branch</SelectItem>
                <SelectItem value="ROOM">Specific Room</SelectItem>
                <SelectItem value="STUDENT">Specific Student</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg bg-white border border-[#CBD5E1] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold text-[#000000] flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-[#E87545]" />
              {isEditing ? 'Edit Announcement' : 'Create New Announcement'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 pt-2">
            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">
                Announcement Title <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g. Fee Payment Deadline Reminder, Maintenance Notice..."
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                className="h-10 font-bold bg-white border-[1.5px] border-[#CBD5E1] text-[#111827] focus-visible:border-[#E87545]"
              />
            </div>

            {/* Target Audience & Priority Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">
                  Target Audience
                </label>
                <Select
                  value={form.targetType}
                  onValueChange={(v: AnnouncementTargetType) =>
                    setForm({ ...form, targetType: v, targetId: '' })
                  }
                >
                  <SelectTrigger className="h-10 font-bold text-xs bg-white border-[1.5px] border-[#CBD5E1] text-[#111827]">
                    <SelectValue placeholder="Select Audience" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[1.5px] border-[#CBD5E1]">
                    <SelectItem value="ALL">👥 All Students</SelectItem>
                    <SelectItem value="BRANCH">🏢 Specific Branch</SelectItem>
                    <SelectItem value="ROOM">🛏️ Specific Room</SelectItem>
                    <SelectItem value="STUDENT">👤 Specific Student</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">
                  Priority Level
                </label>
                <Select
                  value={form.priority}
                  onValueChange={(v: AnnouncementPriority) => setForm({ ...form, priority: v })}
                >
                  <SelectTrigger className="h-10 font-bold text-xs bg-white border-[1.5px] border-[#CBD5E1] text-[#111827]">
                    <SelectValue placeholder="Select Priority" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[1.5px] border-[#CBD5E1]">
                    <SelectItem value="NORMAL">🔵 Normal</SelectItem>
                    <SelectItem value="IMPORTANT">🟡 Important</SelectItem>
                    <SelectItem value="URGENT">🔴 Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dynamic Specific Target Selector */}
            {form.targetType === 'BRANCH' && (
              <div className="space-y-1.5 bg-[#F8FAFC] p-3 rounded-xl border border-[#CBD5E1]">
                <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">
                  Select Branch
                </label>
                <Select
                  value={form.targetId}
                  onValueChange={(v) => setForm({ ...form, targetId: v })}
                >
                  <SelectTrigger className="h-10 font-bold text-xs bg-white border-[1.5px] border-[#CBD5E1] text-[#111827]">
                    <SelectValue placeholder="Choose a branch" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[1.5px] border-[#CBD5E1]">
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.branchCode || b.name} · {b.city} ({b.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.targetType === 'ROOM' && (
              <div className="space-y-1.5 bg-[#F8FAFC] p-3 rounded-xl border border-[#CBD5E1]">
                <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">
                  Select Room
                </label>
                <Select
                  value={form.targetId}
                  onValueChange={(v) => setForm({ ...form, targetId: v })}
                >
                  <SelectTrigger className="h-10 font-bold text-xs bg-white border-[1.5px] border-[#CBD5E1] text-[#111827]">
                    <SelectValue placeholder="Choose a room" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[1.5px] border-[#CBD5E1] max-h-56">
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.roomNumber}>
                        Room {r.roomNumber} {r.hostelName ? `(${r.hostelName})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.targetType === 'STUDENT' && (
              <div className="space-y-1.5 bg-[#F8FAFC] p-3 rounded-xl border border-[#CBD5E1]">
                <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">
                  Select Student
                </label>
                <Select
                  value={form.targetId}
                  onValueChange={(v) => setForm({ ...form, targetId: v })}
                >
                  <SelectTrigger className="h-10 font-bold text-xs bg-white border-[1.5px] border-[#CBD5E1] text-[#111827]">
                    <SelectValue placeholder="Choose a student" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[1.5px] border-[#CBD5E1] max-h-56">
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.customerCode || 'Resident'}) {s.roomNumber ? `· Room ${s.roomNumber}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Message Body */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">
                Announcement Message
              </label>
              <Textarea
                placeholder="Write announcement details, instructions, dates, or contact info..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={3}
                className="font-semibold bg-white border-[1.5px] border-[#CBD5E1] text-[#111827] focus-visible:border-[#E87545]"
              />
            </div>

            {/* Optional Photo Attachment Section */}
            <div className="space-y-2 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-3.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#111827] uppercase tracking-wider flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-[#E87545]" />
                  <span>Photo / Image Attachment</span>
                  <span className="text-[10px] text-[#64748B] font-normal lowercase">(optional)</span>
                </label>
                {imagePreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveImage}
                    className="h-6 px-2 text-[11px] font-bold text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Remove Photo
                  </Button>
                )}
              </div>

              {imagePreview ? (
                <div className="relative rounded-xl overflow-hidden border border-[#CBD5E1] bg-white p-2.5 flex flex-col sm:flex-row items-center gap-3">
                  <div
                    onClick={() => setLightboxImage(imagePreview)}
                    className="relative h-24 w-28 shrink-0 rounded-lg overflow-hidden border border-[#E2E8F0] bg-slate-100 cursor-zoom-in group"
                  >
                    <img
                      src={imagePreview}
                      alt="Attachment Preview"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Eye className="h-4 w-4 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 space-y-1 text-xs text-left w-full">
                    <p className="font-extrabold text-[#111827] flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#087A45]" /> Photo Attached
                    </p>
                    <p className="text-[11px] text-[#64748B]">Supported: JPG, JPEG, PNG, WEBP (Max 5MB)</p>
                    <label className="inline-block cursor-pointer text-[11px] font-bold text-[#E87545] hover:underline pt-1">
                      Click to replace photo
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/jpg"
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#CBD5E1] bg-white p-4 hover:bg-[#F1F5F9] cursor-pointer transition-colors text-center">
                  <UploadCloud className="h-6 w-6 text-[#E87545] mb-1.5" />
                  <span className="text-xs font-extrabold text-[#111827]">
                    Click or drag & drop to attach a photo
                  </span>
                  <span className="text-[11px] text-[#64748B] font-medium mt-0.5">
                    JPG, JPEG, PNG, or WEBP up to 5MB
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/jpg"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* Expiry Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#111827] uppercase tracking-wider flex items-center justify-between">
                <span>Optional Expiry Date</span>
                <span className="text-[11px] text-[#64748B] font-normal">Auto-hides after this date</span>
              </label>
              <Input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="h-10 font-bold bg-white border-[1.5px] border-[#CBD5E1] text-[#111827]"
              />
            </div>

            <DialogFooter className="pt-3 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="border-[#CBD5E1] font-bold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-[#E87545] hover:bg-[#D66434] text-white font-bold gap-2"
              >
                {submitting ? 'Publishing...' : isEditing ? 'Save Changes' : 'Publish Announcement'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* VIEW DETAIL MODAL */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        {viewItem && (
          <DialogContent className="max-w-lg bg-white border border-[#CBD5E1] rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-[#CBD5E1] pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-extrabold text-[#000000]">{viewItem.title}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {priorityBadge(viewItem.priority)}
                  {statusBadge(viewItem.status)}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#64748B] font-bold">Target Audience:</span>
                  <span className="font-extrabold text-[#111827]">{viewItem.targetLabel || 'All Students'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#64748B] font-bold">Published Date:</span>
                  <span className="font-bold text-[#111827]">
                    {new Date(viewItem.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                {viewItem.expiresAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748B] font-bold">Expiry Date:</span>
                    <span className="font-bold text-[#DC2626]">
                      {new Date(viewItem.expiresAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[#64748B] font-bold">Student Reads:</span>
                  <span className="font-bold text-[#087A45]">{viewItem.readCount || 0} residents</span>
                </div>
              </div>

              {/* Attached Photo */}
              {(viewItem.imageUrl || viewItem.attachmentUrl || viewItem.announcementImage) && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#64748B] uppercase">Attached Image</label>
                  <div
                    onClick={() => setLightboxImage(viewItem.imageUrl || viewItem.attachmentUrl || viewItem.announcementImage || null)}
                    className="relative rounded-xl overflow-hidden border border-[#CBD5E1] bg-slate-900/5 max-h-72 flex items-center justify-center cursor-zoom-in group"
                  >
                    <img
                      src={viewItem.imageUrl || viewItem.attachmentUrl || viewItem.announcementImage || ''}
                      alt={viewItem.title}
                      className="max-h-72 w-full object-contain rounded-xl"
                    />
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Click to enlarge
                    </div>
                  </div>
                </div>
              )}

              {viewItem.message && viewItem.message !== '[Photo Announcement]' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#64748B] uppercase">Message Content</label>
                  <div className="p-4 rounded-xl bg-white border border-[#CBD5E1] text-sm text-[#111827] font-semibold whitespace-pre-wrap leading-relaxed">
                    {viewItem.message}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                onClick={() => setViewItem(null)}
                className="w-full font-bold border-[#CBD5E1]"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* FULLSCREEN IMAGE LIGHTBOX MODAL */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent className="max-w-3xl bg-black/95 border border-white/10 p-3 text-white rounded-xl overflow-hidden flex flex-col items-center justify-center">
          <div className="relative w-full max-h-[80vh] flex items-center justify-center p-2">
            {lightboxImage && (
              <img
                src={lightboxImage}
                alt="Enlarged announcement"
                className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg"
              />
            )}
          </div>
          <div className="p-2 flex justify-between w-full items-center text-xs text-slate-300 border-t border-white/10">
            <span>Attachment Preview</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLightboxImage(null)}
              className="bg-white/10 text-white border-white/20 hover:bg-white/20 h-8 font-bold"
            >
              Close Preview
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        {deleteTarget && (
          <DialogContent className="max-w-sm bg-white border border-[#CBD5E1] rounded-xl p-6 space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-extrabold text-[#DC2626] flex items-center gap-2">
                <Trash2 className="h-5 w-5" /> Delete Announcement
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs font-semibold text-[#475569]">
              Are you sure you want to permanently remove announcement{' '}
              <strong className="text-[#111827]">"{deleteTarget.title}"</strong>? Students will no longer see this notice.
            </p>
            <DialogFooter className="gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                className="border-[#CBD5E1] font-bold text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleting}
                onClick={handleDelete}
                className="bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-xs"
              >
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

export default function AnnouncementsPage() {
  return (
    <PageErrorBoundary fallbackTitle="Unable to load Announcements">
      <AnnouncementsPageContent />
    </PageErrorBoundary>
  );
}
