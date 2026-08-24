'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Megaphone, ShieldAlert, AlertCircle, Bell, CheckCircle2, Clock,
  Search, Eye, Filter, Sparkles, Building2, Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { CardSkeleton } from '@/components/dashboard/loader';
import { EmptyState, ErrorState } from '@/components/dashboard/states';
import { SearchInput } from '@/components/ui/search-input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { announcementsApi } from '@/lib/api/announcements.api';
import { useRealtimeEvent } from '@/lib/realtime/use-realtime';
import type { Announcement, AnnouncementPriority, ApiError } from '@/lib/types';

export default function StudentAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [readFilter, setReadFilter] = useState<string>('ALL');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await announcementsApi.studentList();
      setAnnouncements(res || []);
    } catch (err) {
      setError((err as ApiError)?.message || 'Failed to load announcements.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time updates
  useRealtimeEvent('announcement.created', load);
  useRealtimeEvent('announcement.updated', load);
  useRealtimeEvent('announcement.deleted', load);

  const handleMarkRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await announcementsApi.markRead(id);
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isRead: true } : a))
      );
      if (selectedAnnouncement?.id === id) {
        setSelectedAnnouncement((prev) => (prev ? { ...prev, isRead: true } : null));
      }
      toast.success('Marked as read.');
    } catch {
      /* ignore */
    }
  };

  const handleOpenDetail = (item: Announcement) => {
    setSelectedAnnouncement(item);
    if (!item.isRead) {
      handleMarkRead(item.id);
    }
  };

  const filtered = announcements.filter((item) => {
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (item.title || '').toLowerCase().includes(q) ||
      (item.message || '').toLowerCase().includes(q) ||
      (item.createdByName || '').toLowerCase().includes(q);

    const matchesPriority = priorityFilter === 'ALL' || item.priority === priorityFilter;
    const matchesRead =
      readFilter === 'ALL' ||
      (readFilter === 'UNREAD' && !item.isRead) ||
      (readFilter === 'READ' && item.isRead);

    return matchesSearch && matchesPriority && matchesRead;
  });

  const unreadCount = announcements.filter((a) => !a.isRead).length;

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

  return (
    <div className="space-y-3.5 sm:space-y-5 pb-6">
      <PageHeader
        title="Hostel Announcements"
        description="Official broadcasts, fee reminders, maintenance alerts, and hostel notices"
      />

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-[#F8FAFC] p-2.5 sm:p-3 rounded-xl border border-[#CBD5E1]">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search announcements..."
          className="h-9 sm:h-10 text-xs sm:text-sm font-semibold"
          containerClassName="w-full sm:w-80"
        />

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-9 sm:h-10 w-28 sm:w-32 font-bold text-xs bg-white border border-[#CBD5E1] text-[#111827]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent className="bg-white border border-[#CBD5E1]">
              <SelectItem value="ALL">All Priorities</SelectItem>
              <SelectItem value="URGENT">Urgent</SelectItem>
              <SelectItem value="IMPORTANT">Important</SelectItem>
              <SelectItem value="NORMAL">Normal</SelectItem>
            </SelectContent>
          </Select>

          <Select value={readFilter} onValueChange={setReadFilter}>
            <SelectTrigger className="h-9 sm:h-10 w-28 sm:w-32 font-bold text-xs bg-white border border-[#CBD5E1] text-[#111827]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-white border border-[#CBD5E1]">
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="UNREAD">Unread only</SelectItem>
              <SelectItem value="READ">Read only</SelectItem>
            </SelectContent>
          </Select>

          {unreadCount > 0 && (
            <span className="text-xs font-bold text-[#E87545] bg-[#FFF3EB] border border-[#FDE6D6] px-2.5 py-1.5 rounded-lg">
              {unreadCount} unread
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} className="h-24 sm:h-28 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !filtered.length ? (
        <EmptyState
          icon={<Megaphone className="h-6 w-6 text-[#E87545]" />}
          title="No announcements match"
          description="Try changing your search term or filters."
        />
      ) : (
        <div className="space-y-2.5 sm:space-y-3">
          {filtered.map((item) => {
            const isUrgent = item.priority === 'URGENT';
            const isImportant = item.priority === 'IMPORTANT';

            const cardBorder = isUrgent
              ? 'border-l-4 border-l-[#DC2626] border-[#CBD5E1] bg-white'
              : isImportant
              ? 'border-l-4 border-l-[#E87545] border-[#CBD5E1] bg-white'
              : 'border border-[#CBD5E1] bg-white';

            return (
              <div
                key={item.id}
                onClick={() => handleOpenDetail(item)}
                className={`cursor-pointer rounded-xl p-3.5 sm:p-5 transition-colors duration-150 hover:border-[#E87545] ${cardBorder}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-extrabold text-[#000000]">{item.title}</h3>
                      {priorityBadge(item.priority)}
                      {(item.imageUrl || item.attachmentUrl || item.announcementImage) && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full border border-[#BFDBFE]">
                          <ImageIcon className="h-3 w-3" /> Photo
                        </span>
                      )}
                      {!item.isRead && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#E87545] bg-[#FFF3EB] px-2 py-0.5 rounded-full border border-[#FDE6D6]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#E87545]" /> NEW
                        </span>
                      )}
                    </div>
                    {item.message && item.message !== '[Photo Announcement]' && (
                      <p className="text-sm font-medium text-[#475569] line-clamp-2 leading-relaxed">
                        {item.message}
                      </p>
                    )}
                    <div className="flex items-center gap-3 pt-1 text-xs font-bold text-[#64748B]">
                      <span>By {item.createdByName || 'Hostel Administration'}</span>
                      <span>•</span>
                      <span>
                        {new Date(item.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {!item.isRead && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleMarkRead(item.id, e)}
                        className="text-xs font-bold border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-[#111827]"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-[#087A45]" /> Mark Read
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="text-xs font-bold bg-[#E87545] hover:bg-[#D66434] text-white"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" /> Read
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAIL DIALOG */}
      <Dialog open={!!selectedAnnouncement} onOpenChange={() => setSelectedAnnouncement(null)}>
        {selectedAnnouncement && (
          <DialogContent className="max-w-lg bg-white border border-[#CBD5E1] rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <DialogHeader className="border-b border-[#CBD5E1] pb-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {priorityBadge(selectedAnnouncement.priority)}
                  <span className="text-xs font-bold text-[#64748B]">
                    {new Date(selectedAnnouncement.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <DialogTitle className="text-xl font-black text-[#000000] leading-snug">
                  {selectedAnnouncement.title}
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-3">
              {/* Attached Photo Display */}
              {(selectedAnnouncement.imageUrl || selectedAnnouncement.attachmentUrl || selectedAnnouncement.announcementImage) && (
                <div className="space-y-1">
                  <div
                    onClick={() => setLightboxImage(selectedAnnouncement.imageUrl || selectedAnnouncement.attachmentUrl || selectedAnnouncement.announcementImage || null)}
                    className="relative rounded-xl overflow-hidden border border-[#CBD5E1] bg-slate-900/5 max-h-72 flex items-center justify-center cursor-zoom-in group"
                  >
                    <img
                      src={selectedAnnouncement.imageUrl || selectedAnnouncement.attachmentUrl || selectedAnnouncement.announcementImage || ''}
                      alt={selectedAnnouncement.title}
                      className="max-h-72 w-full object-contain rounded-xl"
                    />
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Click to enlarge
                    </div>
                  </div>
                </div>
              )}

              {selectedAnnouncement.message && selectedAnnouncement.message !== '[Photo Announcement]' && (
                <div className="p-4 rounded-xl bg-white border-[1.5px] border-[#CBD5E1] text-sm font-medium text-[#111827] whitespace-pre-wrap leading-relaxed">
                  {selectedAnnouncement.message}
                </div>
              )}

              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs space-y-1">
                <p className="font-bold text-[#64748B]">
                  Published By:{' '}
                  <strong className="text-[#111827]">
                    {selectedAnnouncement.createdByName || 'Hostel Administration'}
                  </strong>
                </p>
                {selectedAnnouncement.targetLabel && (
                  <p className="font-bold text-[#64748B]">
                    Audience: <strong className="text-[#111827]">{selectedAnnouncement.targetLabel}</strong>
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                onClick={() => setSelectedAnnouncement(null)}
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
    </div>
  );
}
