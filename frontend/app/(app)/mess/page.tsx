'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, Trash2, ArrowLeft, ArrowRight, Save, Send, Coffee, Sun, Cookie, Moon,
  Star, Loader2, Check, X, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { messApi } from '@/lib/api/mess.api';
import { useAuth } from '@/lib/auth/auth-context';
import type {
  DayMenuInput, MenuItem, SaveMessMenuInput, WeeklyMessMenu, ApiError,
} from '@/lib/types';

type MealKey = 'breakfast' | 'lunch' | 'snacks' | 'dinner';

const MEALS: { key: MealKey; label: string; icon: React.ElementType; timeRange: string }[] = [
  { key: 'breakfast', label: 'Breakfast', icon: Coffee, timeRange: '7:30 AM – 9:30 AM' },
  { key: 'lunch', label: 'Lunch', icon: Sun, timeRange: '12:30 PM – 2:30 PM' },
  { key: 'snacks', label: 'Evening Snacks', icon: Cookie, timeRange: '5:00 PM – 6:30 PM' },
  { key: 'dinner', label: 'Dinner', icon: Moon, timeRange: '7:30 PM – 9:30 PM' },
];

const DEFAULT_DAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

const DEFAULT_ITEMS: Record<string, Record<MealKey, string[]>> = {
  Monday: {
    breakfast: ['Idli & Sambar', 'Coconut Chutney', 'Tea / Coffee'],
    lunch: ['Steamed Rice', 'Dal Tadka', 'Aloo Gobi', 'Curd'],
    snacks: ['Samosa (2 pcs)', 'Masala Tea'],
    dinner: ['Roti (3 pcs)', 'Paneer Butter Masala', 'Jeera Rice', 'Gulab Jamun'],
  },
  Tuesday: {
    breakfast: ['Puri & Bhaji', 'Banana', 'Tea / Coffee'],
    lunch: ['Rice', 'Sambar', 'Bhindi Fry', 'Rasam', 'Papad'],
    snacks: ['Biscuits', 'Lemon Tea'],
    dinner: ['Chapati', 'Mix Veg Curry', 'Dal Fry', 'Kheer'],
  },
  Wednesday: {
    breakfast: ['Upma & Chutney', 'Boiled Egg / Banana', 'Tea / Coffee'],
    lunch: ['Veg Pulao', 'Rajma Masala', 'Boondi Raita', 'Salad'],
    snacks: ['Pakoda (Veg)', 'Filter Coffee'],
    dinner: ['Roti', 'Egg Curry / Paneer Curry', 'Steamed Rice', 'Ice Cream'],
  },
  Thursday: {
    breakfast: ['Poha & Sev', 'Sprouts', 'Tea / Coffee'],
    lunch: ['Rice', 'Kadhi Pakoda', 'Aloo Methi', 'Curd'],
    snacks: ['Puffed Rice Chivda', 'Tea'],
    dinner: ['Chapati', 'Chana Masala', 'Jeera Rice', 'Fruit Custard'],
  },
  Friday: {
    breakfast: ['Uttapam & Chutney', 'Sambar', 'Tea / Coffee'],
    lunch: ['Steamed Rice', 'Tomato Dal', 'Cabbage Poriyal', 'Rasam'],
    snacks: ['Veg Puff', 'Tea'],
    dinner: ['Roti', 'Veg Biryani', 'Mirchi Ka Salan', 'Raita', 'Sweet'],
  },
  Saturday: {
    breakfast: ['Aloo Paratha & Curd', 'Pickle', 'Tea / Coffee'],
    lunch: ['Rice', 'Dal Makhani', 'Baingan Bharta', 'Curd'],
    snacks: ['Bread Jam / Toast', 'Coffee'],
    dinner: ['Poori', 'Chole Masala', 'Jeera Rice', 'Halwa'],
  },
  Sunday: {
    breakfast: ['Masala Dosa & Chutney', 'Sambar', 'Tea / Coffee'],
    lunch: ['Special Hyderabadi Dum Biryani (Veg/Chicken)', 'Raita', 'Salad', 'Double Ka Meetha'],
    snacks: ['Sweet Corn', 'Cold Drink / Tea'],
    dinner: ['Light Khichdi / Roti', 'Moong Dal', 'Aloo Jeera', 'Curd'],
  },
};

export default function MessPage() {
  const { currentBranchId } = useAuth();
  const [menu, setMenu] = useState<WeeklyMessMenu | null>(null);
  const [week, setWeek] = useState<DayMenuInput[]>(() =>
    DEFAULT_DAYS.map((d) => ({
      day: d,
      breakfast: (DEFAULT_ITEMS[d]?.breakfast || []).map((name, i) => ({ id: `d-b-${i}`, name, special: false })),
      lunch: (DEFAULT_ITEMS[d]?.lunch || []).map((name, i) => ({ id: `d-l-${i}`, name, special: name.includes('Biryani') })),
      snacks: (DEFAULT_ITEMS[d]?.snacks || []).map((name, i) => ({ id: `d-s-${i}`, name, special: false })),
      dinner: (DEFAULT_ITEMS[d]?.dinner || []).map((name, i) => ({ id: `d-d-${i}`, name, special: name.includes('Biryani') })),
    }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!currentBranchId) {
      // Auth context still hydrating — keep loading spinner, do not bail silently
      // The useEffect will re-run once currentBranchId becomes available
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await messApi.getCurrentWeek(currentBranchId);
      const daysList = res?.weekDays || res?.week || [];
      if (res && daysList.length) {
        setMenu(res);
        setWeek(
          daysList.map((d: any) => ({
            day: d.day,
            breakfast: d.breakfast || [],
            lunch: d.lunch || [],
            snacks: d.snacks || [],
            dinner: d.dinner || [],
          }))
        );
      }
    } catch (err) {
      // Backend now auto-initializes — any error here is a real server error
      setError((err as ApiError)?.message || 'Unable to load mess menu. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [currentBranchId]);

  useEffect(() => {
    load();
  }, [load]);

  const addItem = (dayIdx: number, meal: MealKey, name: string) => {
    if (!name.trim()) return;
    const newItem: MenuItem = { id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, name: name.trim(), special: false };
    setWeek((w) =>
      w.map((d, i) =>
        i === dayIdx
          ? {
              ...d,
              [meal]: [...d[meal], newItem],
            }
          : d
      )
    );
  };

  const removeItem = (dayIdx: number, meal: MealKey, itemId: string) => {
    setWeek((w) =>
      w.map((d, i) =>
        i === dayIdx
          ? {
              ...d,
              [meal]: d[meal].filter((x: MenuItem) => x.id !== itemId),
            }
          : d
      )
    );
  };

  const toggleSpecial = (dayIdx: number, meal: MealKey, itemId: string) => {
    setWeek((w) =>
      w.map((d, i) =>
        i === dayIdx
          ? {
              ...d,
              [meal]: d[meal].map((x: MenuItem) => (x.id === itemId ? { ...x, special: !x.special } : x)),
            }
          : d
      )
    );
  };

  const moveItem = (dayIdx: number, fromMeal: MealKey, toMeal: MealKey, itemId: string) => {
    setWeek((w) =>
      w.map((d, i) => {
        if (i !== dayIdx) return d;
        const itemToMove = d[fromMeal].find((x: MenuItem) => x.id === itemId);
        if (!itemToMove) return d;
        return {
          ...d,
          [fromMeal]: d[fromMeal].filter((x: MenuItem) => x.id !== itemId),
          [toMeal]: [...d[toMeal], itemToMove],
        };
      })
    );
    toast.info(`Moved to ${toMeal.charAt(0).toUpperCase() + toMeal.slice(1)}`);
  };

  const save = async (publish: boolean) => {
    if (!currentBranchId) return;
    setSaving(true);
    try {
      const input: SaveMessMenuInput = { branchId: currentBranchId, status: publish ? 'PUBLISHED' : 'DRAFT', week };
      const saved = menu?.id ? await messApi.update(menu.id, input) : await (publish ? messApi.publish(input) : messApi.saveDraft(input));
      setMenu(saved);
      toast.success(publish ? 'Menu published successfully. Visible to students.' : 'Draft menu saved successfully.');
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to save menu.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <CardSkeleton className="h-16 rounded-xl bg-[#F8FAFC]" />
        <CardSkeleton className="h-64 rounded-xl bg-[#F8FAFC]" />
        <CardSkeleton className="h-64 rounded-xl bg-[#F8FAFC]" />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  const isPublished = menu?.status === 'PUBLISHED';

  return (
    <div className="space-y-4 sm:space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 sm:pb-3 border-b border-[#CBD5E1]">
        <div>
          <div className="flex items-center gap-2.5 sm:gap-3">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#000000]">
              🍽️ Mess Management
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                isPublished
                  ? 'bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]'
                  : 'bg-[#FEF3C7] text-[#C94F18] border border-[#FDE68A]'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${isPublished ? 'bg-[#087A45]' : 'bg-[#C94F18]'}`} />
              {isPublished ? 'Published' : 'Draft'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] font-semibold mt-0.5">
            Plan, organize, and publish the weekly dining schedule.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => save(false)}
            disabled={saving}
            className="h-9 px-3.5 font-bold text-[#111827] border-[#CBD5E1] bg-white hover:bg-[#F8FAFC]"
          >
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5 text-[#64748B]" />}
            Save Draft
          </Button>

          <Button
            size="sm"
            onClick={() => save(true)}
            disabled={saving}
            className="h-9 px-4 font-bold bg-[#E87545] hover:bg-[#D66434] text-white"
          >
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Publish Menu
          </Button>
        </div>
      </div>

      {/* Menu Search Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-[#F8FAFC] p-2.5 sm:p-3 rounded-xl border border-[#CBD5E1]">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search dishes, days, or meal types..."
          className="h-9 sm:h-10 text-xs sm:text-sm font-semibold"
          containerClassName="w-full sm:w-80"
        />
        <div className="text-xs font-bold text-[#64748B]">
          {search.trim() ? `Filtering dishes for "${search}"` : 'Weekly Dining Schedule'}
        </div>
      </div>

      <div className="space-y-3.5 sm:space-y-4">
        {week.map((day, dayIdx) => {
          const q = search.toLowerCase().trim();
          const dayItemCount =
            day.breakfast.length + day.lunch.length + day.snacks.length + day.dinner.length;
          const configuredMeals =
            (day.breakfast.length > 0 ? 1 : 0) +
            (day.lunch.length > 0 ? 1 : 0) +
            (day.snacks.length > 0 ? 1 : 0) +
            (day.dinner.length > 0 ? 1 : 0);

          return (
            <div
              key={day.day}
              className="rounded-xl border border-[#CBD5E1] bg-white overflow-hidden transition-colors duration-150 hover:border-[#E87545]"
            >
              <div className="flex items-center justify-between px-3.5 sm:px-6 py-2.5 sm:py-3.5 bg-white border-b border-[#CBD5E1]">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <span className="h-4 sm:h-5 w-1.5 rounded-full bg-[#E87545]" />
                  <h2 className="text-sm sm:text-base font-black text-[#000000] tracking-wider uppercase">
                    {day.day}
                  </h2>
                  <span className="text-xs text-[#64748B] font-bold">
                    · {configuredMeals}/4 meal slots planned
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#111827] bg-[#F8FAFC] px-3 py-1 rounded-lg border border-[#CBD5E1]">
                    {dayItemCount} {dayItemCount === 1 ? 'dish' : 'dishes'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-5 bg-white">
                {MEALS.map((meal, mealIdx) => {
                  const rawItems = day[meal.key];
                  const items = q ? rawItems.filter((x: MenuItem) => x.name.toLowerCase().includes(q)) : rawItems;
                  const Icon = meal.icon;

                  return (
                    <div
                      key={meal.key}
                      className="flex flex-col justify-between rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-4 min-h-[200px] transition-colors duration-150 hover:bg-[#FFF8ED] hover:border-[#E87545]"
                    >
                      <div>
                        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#CBD5E1]">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-[#111827]" />
                            <span className="text-xs font-black text-[#000000] uppercase tracking-wider">
                              {meal.label}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#64748B] font-bold">
                            {meal.timeRange}
                          </span>
                        </div>

                        {items.length === 0 ? (
                          <div className="py-6 text-center space-y-1">
                            <p className="text-xs font-bold text-[#64748B]">No dishes added</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {items.map((item: MenuItem) => (
                              <div
                                key={item.id}
                                className="group flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white border border-[#CBD5E1] shadow-2xs hover:border-[#E87545] transition-all text-xs"
                              >
                                <span className="font-bold text-[#111827] truncate flex-1 capitalize text-[13px]">
                                  {item.name}
                                </span>

                                <div className="flex items-center gap-1 shrink-0">
                                  {mealIdx > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        moveItem(dayIdx, meal.key, MEALS[mealIdx - 1].key, item.id)
                                      }
                                      title={`Move to ${MEALS[mealIdx - 1].label}`}
                                      className="p-1 rounded text-[#64748B] hover:text-[#000000] hover:bg-[#F8FAFC] transition-colors"
                                      aria-label="Move Left"
                                    >
                                      <ArrowLeft className="h-3.5 w-3.5" />
                                    </button>
                                  )}

                                  {mealIdx < MEALS.length - 1 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        moveItem(dayIdx, meal.key, MEALS[mealIdx + 1].key, item.id)
                                      }
                                      title={`Move to ${MEALS[mealIdx + 1].label}`}
                                      className="p-1 rounded text-[#64748B] hover:text-[#000000] hover:bg-[#F8FAFC] transition-colors"
                                      aria-label="Move Right"
                                    >
                                      <ArrowRight className="h-3.5 w-3.5" />
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => toggleSpecial(dayIdx, meal.key, item.id)}
                                    className={`p-1 rounded transition-colors ${
                                      item.special
                                        ? 'text-[#C94F18] hover:text-[#C94F18] bg-[#FEF3C7]'
                                        : 'text-[#64748B] hover:text-[#C94F18] hover:bg-[#F8FAFC]'
                                    }`}
                                    title={item.special ? 'Chef Special Dish' : 'Mark as Special'}
                                    aria-label="Toggle Special"
                                  >
                                    <Star
                                      className="h-3.5 w-3.5"
                                      fill={item.special ? 'currentColor' : 'none'}
                                    />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => removeItem(dayIdx, meal.key, item.id)}
                                    className="p-1 rounded text-[#94A3B8] hover:text-[#C62828] hover:bg-[#FEE2E2] transition-colors"
                                    title="Remove dish"
                                    aria-label="Remove"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-3 mt-3 border-t border-[#E4E0D7]">
                        <AddDishAction
                          onAdd={(name) => addItem(dayIdx, meal.key, name)}
                          placeholder={`Add ${meal.label.toLowerCase()} dish...`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddDishAction({ onAdd, placeholder }: { onAdd: (name: string) => void; placeholder: string }) {
  const [active, setActive] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active && inputRef.current) {
      inputRef.current.focus();
    }
  }, [active]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      setActive(false);
      return;
    }
    onAdd(value);
    setValue('');
    setActive(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setValue('');
      setActive(false);
    }
  };

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold text-[#111827] bg-white hover:bg-[#F8FAFC] hover:text-[#E87545] hover:border-[#E87545] border border-[#CBD5E1] rounded-lg shadow-2xs transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        <span>+ Add dish</span>
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-8 text-xs px-2.5 bg-white border-[#CBD5E1] text-[#111827] font-semibold rounded-lg focus-visible:ring-1 focus-visible:ring-[#E87545] focus-visible:border-[#E87545]"
      />
      <Button
        type="submit"
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-[#087A45] bg-[#E8F5ED] hover:bg-[#E8F5ED] border border-[#B4E2C7] shrink-0 rounded-lg"
        title="Confirm (Enter)"
        aria-label="Confirm"
      >
        <Check className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => {
          setValue('');
          setActive(false);
        }}
        className="h-8 w-8 text-[#64748B] bg-white hover:text-[#C62828] hover:bg-[#FEE2E2] border border-[#CBD5E1] shrink-0 rounded-lg"
        title="Cancel (Esc)"
        aria-label="Cancel"
      >
        <X className="h-4 w-4" />
      </Button>
    </form>
  );
}
