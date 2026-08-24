'use client';

import { useCallback, useEffect, useState } from 'react';
import { Coffee, Sun, Cookie, Moon, Sparkles, Utensils, Star, Search } from 'lucide-react';
import { messApi } from '@/lib/api/mess.api';
import { getCachedData } from '@/lib/api/client';
import { CardSkeleton } from '@/components/dashboard/loader';
import { EmptyState, ErrorState } from '@/components/dashboard/states';
import { useRealtimeEvent } from '@/lib/realtime/use-realtime';
import { SearchInput } from '@/components/ui/search-input';
import type { WeeklyMessMenu, MenuItem, ApiError } from '@/lib/types';

const MEALS = [
  { key: 'breakfast', label: 'Breakfast', icon: Coffee, timeRange: '7:30 AM – 9:30 AM' },
  { key: 'lunch', label: 'Lunch', icon: Sun, timeRange: '12:30 PM – 2:30 PM' },
  { key: 'snacks', label: 'Evening Snacks', icon: Cookie, timeRange: '5:00 PM – 6:30 PM' },
  { key: 'dinner', label: 'Dinner', icon: Moon, timeRange: '7:30 PM – 9:30 PM' },
] as const;

export default function StudentMessMenuPage() {
  const cachedMenu = getCachedData<WeeklyMessMenu>('/student-menu');
  const [menu, setMenu] = useState<WeeklyMessMenu | null>(() => cachedMenu);
  const [loading, setLoading] = useState(() => !cachedMenu);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadMenu = useCallback(async () => {
    try {
      const res = await messApi.studentMenu();
      setMenu(res);
      setError(null);
    } catch (err) {
      if (!menu) {
        setError((err as ApiError)?.message || 'Failed to load dining menu.');
      }
    } finally {
      setLoading(false);
    }
  }, [menu]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  useRealtimeEvent('messMenu.updated', loadMenu);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <CardSkeleton className="h-8 w-48 bg-[#F8FAFC]" />
          <CardSkeleton className="h-4 w-72 bg-[#F8FAFC]" />
        </div>
        <div className="space-y-4">
          <CardSkeleton className="h-64 rounded-2xl bg-[#F8FAFC]" />
          <CardSkeleton className="h-64 rounded-2xl bg-[#F8FAFC]" />
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadMenu} />;
  }

  const daysOrder = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

  const publishedWeek = daysOrder
    .map((dayName) => {
      const daysList = menu?.weekDays || menu?.week || [];
      const dayData = daysList.find((d: any) => d.day.toUpperCase() === dayName);
      if (!dayData) return null;
      return {
        day: dayName.charAt(0) + dayName.slice(1).toLowerCase(),
        breakfast: dayData.breakfast || [],
        lunch: dayData.lunch || [],
        snacks: dayData.snacks || [],
        dinner: dayData.dinner || [],
      };
    })
    .filter(Boolean) as Array<{
      day: string;
      breakfast: MenuItem[];
      lunch: MenuItem[];
      snacks: MenuItem[];
      dinner: MenuItem[];
    }>;

  return (
    <div className="space-y-3.5 sm:space-y-5 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 sm:pb-3 border-b border-[#CBD5E1]">
        <div>
          <div className="flex items-center gap-2.5 sm:gap-3">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#000000]">
              🍽️ Mess Menu
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]">
              <span className="h-2 w-2 rounded-full bg-[#087A45]" />
              Published Schedule
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] font-semibold mt-0.5">
            {menu?.updatedAt
              ? `Weekly meal plan · Updated ${new Date(menu.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
              : 'Official weekly dining schedule for hostel residents.'}
          </p>
        </div>
      </div>

      {/* Student Mess Search Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-[#F8FAFC] p-2.5 sm:p-3 rounded-xl border border-[#CBD5E1]">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search dishes, days, or meal types..."
          className="h-9 sm:h-10 text-xs sm:text-sm font-semibold"
          containerClassName="w-full sm:w-80"
        />
        <div className="text-xs font-bold text-[#64748B]">
          {search.trim() ? `Showing dishes matching "${search}"` : 'Weekly Dining Menu'}
        </div>
      </div>

      {!publishedWeek.length ? (
        <EmptyState
          icon={<Utensils className="h-6 w-6" />}
          title="Menu not published yet"
          description="Your hostel administration hasn't published this week's dining menu yet. Please check back soon."
        />
      ) : (
        <div className="space-y-3.5 sm:space-y-4">
          {publishedWeek.map((day) => {
            const q = search.toLowerCase().trim();
            const hasSpecial =
              day.breakfast.some((i) => i.special) ||
              day.lunch.some((i) => i.special) ||
              day.snacks.some((i) => i.special) ||
              day.dinner.some((i) => i.special);

            return (
              <div
                key={day.day}
                className="rounded-xl border border-[#CBD5E1] bg-white overflow-hidden transition-colors duration-150 hover:border-[#E87545]"
              >
                {/* Day Header */}
                <div className="flex items-center justify-between px-3.5 sm:px-6 py-2.5 sm:py-3.5 bg-white border-b border-[#CBD5E1]">
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <span className="h-4 sm:h-5 w-1.5 rounded-full bg-[#E87545]" />
                    <h2 className="text-sm sm:text-base font-black text-[#000000] tracking-wider uppercase">
                      {day.day}
                    </h2>
                  </div>

                  {hasSpecial && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-black bg-[#FEF3C7] text-[#C94F18] border border-[#FDE68A]">
                      <Star className="h-3.5 w-3.5 fill-[#C94F18] text-[#C94F18]" />
                      Special Today
                    </span>
                  )}
                </div>

                {/* 4 Meal Columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 p-3.5 sm:p-5 bg-white">
                  {MEALS.map((meal) => {
                    const rawItems = day[meal.key];
                    const items = q ? rawItems.filter((i: MenuItem) => i.name.toLowerCase().includes(q)) : rawItems;
                    const Icon = meal.icon;

                    return (
                      <div
                        key={meal.key}
                        className="flex flex-col justify-between rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-3 sm:p-4 min-h-[140px] sm:min-h-[170px] transition-colors duration-150 hover:bg-[#FFF8ED] hover:border-[#E87545]"
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

                          <div className="space-y-2">
                            {items.length === 0 ? (
                              <p className="text-xs text-[#64748B] font-bold py-4 text-center">
                                No dishes listed
                              </p>
                            ) : (
                              items.map((item, idx) => (
                                <div
                                  key={idx}
                                  className={`p-2 rounded-lg border text-xs font-bold transition-colors duration-150 ${
                                    item.special
                                      ? 'bg-[#FEF3C7] border-[#FDE68A] text-[#C94F18]'
                                      : 'bg-white border-[#CBD5E1] text-[#111827] hover:border-[#E87545] hover:bg-[#FFF8ED]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="truncate">{item.name}</span>
                                    {item.special && (
                                      <Sparkles className="h-3 w-3 shrink-0 text-[#C94F18]" />
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
