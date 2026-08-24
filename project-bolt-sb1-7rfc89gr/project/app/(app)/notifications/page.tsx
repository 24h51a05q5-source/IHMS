'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState, EmptyState } from '@/components/dashboard/states';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { notificationsApi } from '@/lib/api/notifications.api';
import type { Notification, Paginated, ApiError } from '@/lib/types';

export default function NotificationsPage() {
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="Your alerts and updates"
        actions={<Button variant="outline" onClick={markAll} disabled={!data.items.some((n) => !n.read)}><CheckCheck className="mr-2 h-4 w-4" /> Mark all read</Button>}
      />

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} className="h-16" />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data.items.length ? (
        <EmptyState icon={<Bell className="h-6 w-6" />} title="No notifications" description="You're all caught up!" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <ul className="divide-y divide-border">
            {data.items.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/30 ${!n.read ? 'bg-primary/5' : ''}`} onClick={() => !n.read && markOne(n.id)}>
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bell className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{n.title}</p>
                    {n.type && <Badge variant={variantMap[n.type]}>{n.type}</Badge>}
                  </div>
                  <p className="mt-0.5 text-muted-foreground">{n.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString('en-IN')}</p>
                </div>
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
