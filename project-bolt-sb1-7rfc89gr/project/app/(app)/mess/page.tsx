'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Save, Send, Loader2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { messApi, type SaveMessMenuInput } from '@/lib/api/mess.api';
import { useAuth } from '@/lib/auth/auth-context';
import { useRealtimeEvent } from '@/lib/realtime/use-realtime';
import type { MessDayMenu, MessItem, MessMenu, ApiError } from '@/lib/types';

const DAYS: MessDayMenu['day'][] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MEALS: { key: keyof Omit<MessDayMenu, 'day'>; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snacks', label: 'Snacks' },
  { key: 'dinner', label: 'Dinner' },
];

function emptyWeek(): MessDayMenu[] {
  return DAYS.map((day) => ({ day, breakfast: [], lunch: [], snacks: [], dinner: [] }));
}

export default function MessPage() {
  const { currentBranchId } = useAuth();
  const [menu, setMenu] = useState<MessMenu | null>(null);
  const [week, setWeek] = useState<MessDayMenu[]>(emptyWeek());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!currentBranchId) return;
    setLoading(true);
    setError(null);
    try {
      const m = await messApi.getMenu(currentBranchId);
      setMenu(m);
      setWeek(m.week?.length ? m.week : emptyWeek());
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr?.statusCode === 404) {
        setMenu(null);
        setWeek(emptyWeek());
      } else {
        setError(apiErr?.message || 'Unable to load mess menu.');
      }
    } finally {
      setLoading(false);
    }
  }, [currentBranchId]);

  useEffect(() => { load(); }, [load]);
  useRealtimeEvent('messMenu.updated', load);

  const addItem = (dayIdx: number, meal: keyof Omit<MessDayMenu, 'day'>, name: string) => {
    if (!name.trim()) return;
    const item: MessItem = { id: `tmp-${Date.now()}`, name: name.trim() };
    setWeek((w) => w.map((d, i) => (i === dayIdx ? { ...d, [meal]: [...d[meal], item] } : d)));
  };

  const removeItem = (dayIdx: number, meal: keyof Omit<MessDayMenu, 'day'>, itemId: string) => {
    setWeek((w) => w.map((d, i) => (i === dayIdx ? { ...d, [meal]: d[meal].filter((x) => x.id !== itemId) } : d)));
  };

  const toggleSpecial = (dayIdx: number, meal: keyof Omit<MessDayMenu, 'day'>, itemId: string) => {
    setWeek((w) => w.map((d, i) => (i === dayIdx ? { ...d, [meal]: d[meal].map((x) => (x.id === itemId ? { ...x, special: !x.special } : x)) } : d)));
  };

  const save = async (publish: boolean) => {
    if (!currentBranchId) return;
    setSaving(true);
    try {
      const input: SaveMessMenuInput = { branchId: currentBranchId, status: publish ? 'PUBLISHED' : 'DRAFT', week };
      const saved = menu?.id ? await messApi.update(menu.id, input) : await (publish ? messApi.publish(input) : messApi.saveDraft(input));
      setMenu(saved);
      toast.success(publish ? 'Menu published. Students can now see it.' : 'Draft saved.');
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to save menu.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} className="h-32" />)}</div>;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mess Management"
        description="Plan the weekly menu. Students only see published menus."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => save(false)} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Draft
            </Button>
            <Button onClick={() => save(true)} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Publish
            </Button>
          </div>
        }
      />

      {menu && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Current status:</span>
          <Badge variant={menu.status === 'PUBLISHED' ? 'success' : 'warning'}>{menu.status}</Badge>
        </div>
      )}

      <div className="space-y-4">
        {week.map((day, dayIdx) => (
          <div key={day.day} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold capitalize">{day.day}</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MEALS.map((meal) => (
                <div key={meal.key} className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{meal.label}</p>
                  <ul className="mb-2 space-y-1">
                    {day[meal.key].map((item) => (
                      <li key={item.id} className="group flex items-center justify-between gap-1 rounded px-1.5 py-1 text-sm hover:bg-muted/40">
                        <span className="min-w-0 truncate">{item.name}</span>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            onClick={() => toggleSpecial(dayIdx, meal.key, item.id)}
                            className={`rounded p-0.5 ${item.special ? 'text-amber-500' : 'text-muted-foreground/40 hover:text-amber-500'}`}
                            aria-label="Mark special"
                          >
                            <Star className="h-3.5 w-3.5" fill={item.special ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            onClick={() => removeItem(dayIdx, meal.key, item.id)}
                            className="rounded p-0.5 text-muted-foreground/40 hover:text-rose-600"
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <MealInput onAdd={(name) => addItem(dayIdx, meal.key, name)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MealInput({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onAdd(value); setValue(''); }}
      className="flex items-center gap-1"
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add item"
        className="h-8 text-sm"
      />
      <Button type="submit" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Add">
        <Plus className="h-4 w-4" />
      </Button>
    </form>
  );
}
