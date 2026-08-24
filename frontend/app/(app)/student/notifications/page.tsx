'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState, EmptyState } from '@/components/dashboard/states';
import { notificationsApi } from '@/lib/api/notifications.api';
import type { Notification, Paginated, ApiError } from '@/lib/types';

export default function StudentNotificationsPage() {
  const [data, setData] = useState<Paginated<Notification>>({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-3.5 sm:space-y-5">
      <PageHeader title="Notifications" description="Your notices and alerts" actions={<Button variant="outline" size="sm" onClick={markAll} disabled={!data.items.some((n) => !n.read)} className="font-bold"><CheckCheck className="mr-1.5 h-4 w-4" /> Mark all read</Button>} />
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} className="h-16" />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data.items.length ? (
        <EmptyState icon={<Bell className="h-6 w-6 text-[#E87545]" />} title="No notifications" description="You're all caught up!" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#CBD5E1] bg-white">
          <ul className="divide-y divide-[#CBD5E1]">
            {data.items.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm hover:bg-[#F8FAFC] transition-colors ${!n.read ? 'bg-[#FFF3EB]' : ''}`}>
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FFF3EB] text-[#E87545] border border-[#FDE6D6]"><Bell className="h-4 w-4 text-[#E87545]" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[#111827]">{n.title}</p>
                  <p className="mt-0.5 text-xs sm:text-sm text-[#475569]">{n.message}</p>
                  <p className="mt-1 text-[11px] font-semibold text-[#64748B]">{new Date(n.createdAt).toLocaleString('en-IN')}</p>
                </div>
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#E87545]" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
