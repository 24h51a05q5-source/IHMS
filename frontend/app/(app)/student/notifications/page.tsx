'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  ExternalLink,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { SearchInput } from '@/components/ui/search-input';
import { notificationsApi } from '@/lib/api/notifications.api';
import { useRealtimeEvent } from '@/lib/realtime/use-realtime';
import type { Notification, Paginated, ApiError } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function StudentNotificationsPage() {
  const router = useRouter();
  const [data, setData] = useState<Paginated<Notification>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNREAD'>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await notificationsApi.list({ pageSize: 50 });
      setData(res);
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time listener for incoming notifications
  useRealtimeEvent('notification.created', () => {
    load();
  });

  const markAll = async () => {
    try {
      await notificationsApi.markAllRead();
      setData((d) => ({
        ...d,
        items: d.items.map((n) => ({ ...n, read: true, isRead: true })),
      }));
      toast.success('All notifications marked as read.');
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to update.');
    }
  };

  const markOne = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await notificationsApi.markRead(id);
      setData((d) => ({
        ...d,
        items: d.items.map((n) => (n.id === id ? { ...n, read: true, isRead: true } : n)),
      }));
    } catch {
      /* ignore */
    }
  };

  const handleRowClick = async (notif: Notification) => {
    const isUnread = !notif.read && !notif.isRead;
    if (isUnread) {
      await markOne(notif.id);
    }
    if (notif.actionUrl) {
      router.push(notif.actionUrl);
    }
  };

  const unreadCount = data.items.filter((n) => !n.read && !n.isRead).length;

  const filteredNotifications = data.items.filter((n) => {
    const isUnread = !n.read && !n.isRead;
    if (activeTab === 'UNREAD' && !isUnread) return false;

    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (n.title || '').toLowerCase().includes(q) ||
      (n.message || '').toLowerCase().includes(q) ||
      (n.type || '').toLowerCase().includes(q)
    );
  });

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'SUCCESS':
        return <CheckCircle2 className="h-5 w-5 text-[#16A34A]" />;
      case 'WARNING':
        return <AlertTriangle className="h-5 w-5 text-[#D97706]" />;
      case 'ERROR':
        return <AlertCircle className="h-5 w-5 text-[#DC2626]" />;
      default:
        return <Info className="h-5 w-5 text-[#2563EB]" />;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Notifications & Alerts"
        description="Stay updated with your fee receipts, room allocation, gate passes, and notices"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={markAll}
            disabled={unreadCount === 0}
            className="font-bold border-[#DDD8CC] hover:bg-[#F8FAFC]"
          >
            <CheckCheck className="mr-1.5 h-4 w-4" /> Mark all read
          </Button>
        }
      />

      {/* Tabs & Search Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#CBD5E1]">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[#F1F5F9] rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-bold transition-all',
              activeTab === 'ALL'
                ? 'bg-white text-[#111827] shadow-xs'
                : 'text-[#64748B] hover:text-[#111827]'
            )}
          >
            All ({data.items.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('UNREAD')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5',
              activeTab === 'UNREAD'
                ? 'bg-[#E87545] text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#111827]'
            )}
          >
            Unread
            {unreadCount > 0 && (
              <span
                className={cn(
                  'px-1.5 py-0.2 rounded-full text-[10px] font-extrabold',
                  activeTab === 'UNREAD' ? 'bg-white/20 text-white' : 'bg-[#E87545] text-white'
                )}
              >
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Search Bar */}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search notifications..."
          className="h-9 text-xs sm:text-sm font-semibold"
          containerClassName="w-full sm:w-72"
        />
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <CardSkeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filteredNotifications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#F8FAFC] text-[#CBD5E1]">
            <Bell className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-sm font-bold text-[#111827]">
            {search ? 'No matching notifications' : activeTab === 'UNREAD' ? 'No unread notifications' : 'No notifications yet'}
          </h3>
          <p className="text-xs text-[#64748B] mt-1">
            {search
              ? `No notifications found matching "${search}".`
              : "You're all caught up with your notices and alerts!"}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredNotifications.map((n) => {
            const isUnread = !n.read && !n.isRead;
            return (
              <div
                key={n.id}
                onClick={() => handleRowClick(n)}
                className={cn(
                  'group relative flex items-start gap-3.5 p-4 rounded-xl border transition-all cursor-pointer',
                  isUnread
                    ? 'bg-[#FEF7F4] border-[#FDBA74] shadow-xs border-l-4 border-l-[#E87545]'
                    : 'bg-white border-[#CBD5E1] hover:border-[#94A3B8] opacity-90'
                )}
              >
                {/* Icon */}
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border',
                    isUnread
                      ? 'bg-white border-[#FDBA74]'
                      : 'bg-[#F8FAFC] border-[#E2E8F0]'
                  )}
                >
                  {getTypeIcon(n.type)}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          'text-sm truncate',
                          isUnread ? 'font-bold text-[#111827]' : 'font-semibold text-[#475569]'
                        )}
                      >
                        {n.title}
                      </p>
                      {isUnread && (
                        <span className="flex h-2 w-2 rounded-full bg-[#E87545]" />
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-[#94A3B8]">
                      {new Date(n.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <p className="text-xs text-[#64748B] font-medium leading-relaxed">
                    {n.message}
                  </p>

                  {n.actionUrl && (
                    <div className="pt-1 flex items-center gap-1 text-[11px] font-bold text-[#E87545] hover:underline">
                      <span>View details</span>
                      <ExternalLink className="h-3 w-3" />
                    </div>
                  )}
                </div>

                {/* Quick Action: Mark as Read */}
                {isUnread && (
                  <button
                    type="button"
                    onClick={(e) => markOne(n.id, e)}
                    title="Mark as read"
                    className="p-1.5 rounded-lg border border-[#FDBA74] bg-white text-[#E87545] hover:bg-[#E87545] hover:text-white transition-colors shrink-0"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
