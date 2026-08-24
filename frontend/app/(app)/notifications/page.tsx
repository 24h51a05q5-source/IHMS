'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, AlertTriangle, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState, EmptyState } from '@/components/dashboard/states';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { notificationsApi } from '@/lib/api/notifications.api';
import { getCachedData } from '@/lib/api/client';
import type { Notification, Paginated, ApiError } from '@/lib/types';

import { SearchInput } from '@/components/ui/search-input';

export default function NotificationsPage() {
  const cachedData = getCachedData<Paginated<Notification>>('/notifications', { pageSize: 50 });
  const [data, setData] = useState<Paginated<Notification>>(() => cachedData || { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
  const [loading, setLoading] = useState(() => !cachedData);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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

  useEffect(() => { load(); }, [load]);

  const markAll = async () => {
    try {
      await notificationsApi.markAllRead();
      setData((d) => ({ ...d, items: d.items.map((n) => ({ ...n, read: true })) }));
      toast.success('All notifications marked as read.');
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to update.');
    }
  };

  const markOne = async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      setData((d) => ({ ...d, items: d.items.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
    } catch {
      /* ignore */
    }
  };

  const variantMap: Record<string, 'info' | 'success' | 'warning' | 'error'> = {
    INFO: 'info', SUCCESS: 'success', WARNING: 'warning', ERROR: 'error',
  };

  const filteredNotifications = (data.items || []).filter((n) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (n.title || '').toLowerCase().includes(q) ||
      (n.message || '').toLowerCase().includes(q) ||
      (n.type || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-3.5 sm:space-y-5">
      <PageHeader
        title="Notifications & Alerts"
        description="Stay updated with real-time payment alerts, dues, and announcements"
        actions={
          <Button variant="outline" size="sm" onClick={markAll} disabled={!data.items.some((n) => !n.read)} className="font-bold">
            <CheckCheck className="mr-1.5 h-4 w-4" /> Mark all as read
          </Button>
        }
      />

      {/* Search Toolbar */}
      {data.items.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-[#F8FAFC] p-2.5 sm:p-3 rounded-xl border border-[#CBD5E1]">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search alerts and notifications..."
            className="h-9 sm:h-10 text-xs sm:text-sm font-semibold"
            containerClassName="w-full sm:w-80"
          />
          <div className="text-xs font-bold text-[#64748B]">
            {search.trim() ? `Showing ${filteredNotifications.length} matching alerts` : `${data.items.length} total notifications`}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <CardSkeleton key={i} className="h-18 sm:h-20 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !filteredNotifications.length ? (
        <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-white p-8 sm:p-12 text-center">
          <div className="mx-auto flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <Bell className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <h3 className="mt-3 text-sm sm:text-base font-bold text-slate-900">
            {search ? 'No matching notifications found' : 'All Caught Up!'}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {search ? `No alerts match "${search}". Try searching for another keyword.` : 'You have no unread notifications or alerts.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 sm:space-y-3">
          {filteredNotifications.map((n) => {
            const isError = n.type === 'ERROR';
            const isWarning = n.type === 'WARNING';
            const isSuccess = n.type === 'SUCCESS';

            const borderAccent = isError
              ? 'border-l-4 border-l-rose-500'
              : isWarning
              ? 'border-l-4 border-l-orange-500'
              : isSuccess
              ? 'border-l-4 border-l-emerald-500'
              : 'border-l-4 border-l-sky-500';

            const iconContainer = isError
              ? 'bg-rose-50 text-rose-600 border-rose-100'
              : isWarning
              ? 'bg-orange-50 text-orange-600 border-orange-100'
              : isSuccess
              ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
              : 'bg-sky-50 text-sky-600 border-sky-100';

            return (
              <div
                key={n.id}
                onClick={() => !n.read && markOne(n.id)}
                className={`flex items-start gap-3 sm:gap-4 rounded-xl border border-[#CBD5E1] bg-white p-3.5 sm:p-4.5 transition-colors duration-150 hover:border-[#E87545] cursor-pointer ${borderAccent} ${
                  !n.read ? 'bg-[#FFF7ED]/30' : ''
                }`}
              >
                <div className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg border ${iconContainer}`}>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-extrabold text-sm text-[#0F172A]">{n.title}</p>
                    {n.type && <Badge variant={variantMap[n.type] || 'info'}>{n.type}</Badge>}
                  </div>
                  <p className="text-xs text-[#475569] font-semibold leading-relaxed">{n.message}</p>
                  <p className="text-[11px] font-bold text-[#475569] pt-0.5">
                    {new Date(n.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                {!n.read && (
                  <span className="mt-1 flex h-2.5 w-2.5 shrink-0 rounded-full bg-[#E87545] shadow-2xs" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
