'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  ExternalLink,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { notificationsApi } from '@/lib/api/notifications.api';
import { getCachedData } from '@/lib/api/client';
import { useRealtimeEvent } from '@/lib/realtime/use-realtime';
import type { Notification, Paginated, ApiError } from '@/lib/types';
import { SearchInput } from '@/components/ui/search-input';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const router = useRouter();
  const cachedData = getCachedData<Paginated<Notification>>('/notifications', { pageSize: 50 });
  const [data, setData] = useState<Paginated<Notification>>(
    () => cachedData || { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 }
  );
  const [loading, setLoading] = useState(() => !cachedData);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNREAD'>('ALL');

  const load = useCallback(async () => {
    try {
      const res = await notificationsApi.list({ pageSize: 50 });
      setData(res);
    } catch (err) {
      if (!data.items.length) {
        setError((err as ApiError)?.message || 'Unable to load notifications.');
      }
    } finally {
      setLoading(false);
    }
  }, [data.items.length]);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time listener
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

  const variantMap: Record<string, 'info' | 'success' | 'warning' | 'error'> = {
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error',
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

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Notifications & Alerts"
        description="Stay updated with real-time fee payments, admissions, complaints, and leave requests"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={markAll}
            disabled={unreadCount === 0}
            className="font-bold border-[#DDD8CC] hover:bg-[#F8FAFC]"
          >
            <CheckCheck className="mr-1.5 h-4 w-4" /> Mark all as read
          </Button>
        }
      />

      {/* Tabs & Search Toolbar */}
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

        {/* Search Input */}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search alerts and notifications..."
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
            {search ? 'No matching notifications found' : activeTab === 'UNREAD' ? 'No unread notifications' : 'All Caught Up!'}
          </h3>
          <p className="text-xs text-[#64748B] mt-1">
            {search ? `No alerts match "${search}". Try searching for another keyword.` : 'You have no pending unread notifications or alerts.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredNotifications.map((n) => {
            const isUnread = !n.read && !n.isRead;
            const isError = n.type === 'ERROR';
            const isWarning = n.type === 'WARNING';
            const isSuccess = n.type === 'SUCCESS';

            const borderAccent = isError
              ? 'border-l-4 border-l-rose-500'
              : isWarning
              ? 'border-l-4 border-l-amber-500'
              : isSuccess
              ? 'border-l-4 border-l-emerald-500'
              : 'border-l-4 border-l-sky-500';

            const iconContainer = isError
              ? 'bg-rose-50 text-rose-600 border-rose-200'
              : isWarning
              ? 'bg-amber-50 text-amber-600 border-amber-200'
              : isSuccess
              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
              : 'bg-sky-50 text-sky-600 border-sky-200';

            return (
              <div
                key={n.id}
                onClick={() => handleRowClick(n)}
                className={cn(
                  'group relative flex items-start gap-3.5 p-4 rounded-xl border transition-all cursor-pointer',
                  borderAccent,
                  isUnread
                    ? 'bg-[#FEF7F4] border-[#FDBA74] shadow-xs'
                    : 'bg-white border-[#CBD5E1] hover:border-[#94A3B8] opacity-90'
                )}
              >
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border', iconContainer)}>
                  {isError ? (
                    <AlertCircle className="h-5 w-5" />
                  ) : isWarning ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : isSuccess ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Info className="h-5 w-5" />
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className={cn('text-sm truncate', isUnread ? 'font-bold text-[#111827]' : 'font-semibold text-[#475569]')}>
                        {n.title}
                      </p>
                      {n.type && <Badge variant={variantMap[n.type] || 'info'}>{n.type}</Badge>}
                      {isUnread && <span className="flex h-2 w-2 rounded-full bg-[#E87545]" />}
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

                  <p className="text-xs text-[#64748B] font-medium leading-relaxed">{n.message}</p>

                  {n.actionUrl && (
                    <div className="pt-1 flex items-center gap-1 text-[11px] font-bold text-[#E87545] hover:underline">
                      <span>View details</span>
                      <ExternalLink className="h-3 w-3" />
                    </div>
                  )}
                </div>

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
