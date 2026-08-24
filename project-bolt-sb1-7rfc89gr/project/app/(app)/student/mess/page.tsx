'use client';

import { useCallback, useEffect, useState } from 'react';
import { Utensils, Star } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState, EmptyState } from '@/components/dashboard/states';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { messApi } from '@/lib/api/mess.api';
import { useAuth } from '@/lib/auth/auth-context';
import { useRealtimeEvent } from '@/lib/realtime/use-realtime';
import type { MessMenu, ApiError } from '@/lib/types';

const MEAL_LABELS: { key: 'breakfast' | 'lunch' | 'snacks' | 'dinner'; label: string; icon: string }[] = [
  { key: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { key: 'lunch', label: 'Lunch', icon: '☀️' },
  { key: 'snacks', label: 'Snacks', icon: '🍵' },
  { key: 'dinner', label: 'Dinner', icon: '🌙' },
];

export default function StudentMessPage() {
  const { currentBranchId } = useAuth();
  const [menu, setMenu] = useState<MessMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentBranchId) return;
    setLoading(true);
    setError(null);
    try {
      const m = await messApi.getMenu(currentBranchId);
      setMenu(m);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr?.statusCode === 404) setMenu(null);
      else setError(apiErr?.message || 'Unable to load mess menu.');
    } finally {
      setLoading(false);
    }
  }, [currentBranchId]);

  useEffect(() => { load(); }, [load]);
  useRealtimeEvent('messMenu.updated', load);

  if (loading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} className="h-32" />)}</div>;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const publishedWeek = menu?.status === 'PUBLISHED' ? menu.week : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mess Menu"
        description={menu?.updatedAt ? `Updated ${new Date(menu.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}` : 'This week\'s meals'}
      />

      {!publishedWeek.length ? (
        <EmptyState
          icon={<Utensils className="h-6 w-6" />}
          title="Menu not published yet"
          description="Your hostel administration hasn't published this week's menu. Please check back later."
        />
      ) : (
        <div className="space-y-4">
          {publishedWeek.map((day) => (
            <div key={day.day} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold capitalize">{day.day}</h3>
                {day.breakfast.some((i) => i.special) || day.lunch.some((i) => i.special) || day.dinner.some((i) => i.special) ? (
                  <Badge variant="warning"><Star className="mr-1 h-3 w-3" fill="currentColor" /> Special menu</Badge>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {MEAL_LABELS.map((m) => (
                  <div key={m.key} className="rounded-lg border border-border p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{m.label}</p>
                    {day[m.key].length ? (
                      <ul className="space-y-1 text-sm">
                        {day[m.key].map((item) => (
                          <li key={item.id} className="flex items-center gap-1.5">
                            <span>{item.name}</span>
                            {item.special && <Star className="h-3 w-3 text-amber-500" fill="currentColor" />}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">—</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
