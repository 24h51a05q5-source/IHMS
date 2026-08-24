'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from './states';
import { cn } from '@/lib/utils';
import { SearchInput } from '@/components/ui/search-input';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
  cell: (row: T) => ReactNode;
  mobileCell?: (row: T) => ReactNode;
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  error?: string | null;
  search?: string;
  searchPlaceholder?: string;
  onSearchChange?: (v: string) => void;
  hideToolbar?: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  onPageChange?: (page: number) => void;
  onRetry?: () => void;
  rowKey: (row: T) => string;
  rowActions?: (row: T) => ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; onClick: () => void };
  toolbarRight?: ReactNode;
  filters?: ReactNode;
  mobileRender?: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  total,
  page,
  pageSize,
  loading,
  error,
  search,
  searchPlaceholder = 'Search records...',
  onSearchChange,
  hideToolbar = false,
  sortBy,
  sortDir,
  onSort,
  onPageChange,
  onRetry,
  rowKey,
  rowActions,
  emptyTitle,
  emptyDescription,
  emptyAction,
  toolbarRight,
  filters,
  mobileRender,
}: DataTableProps<T>) {
  const [localSearch, setLocalSearch] = useState('');
  const currentSearchTerm = (search !== undefined ? search : localSearch).trim();

  const handleSearch = (v: string) => {
    if (onSearchChange) onSearchChange(v);
    else setLocalSearch(v);
  };

  const displayData = useMemo(() => {
    const rawData = Array.isArray(data) ? data : [];
    if (onSearchChange || !currentSearchTerm) return rawData;
    const q = currentSearchTerm.toLowerCase();
    return rawData.filter((item: any) => {
      if (!item) return false;
      return Object.values(item).some((val) => {
        if (val === null || val === undefined) return false;
        if (typeof val === 'object') {
          try {
            return JSON.stringify(val).toLowerCase().includes(q);
          } catch {
            return false;
          }
        }
        return String(val).toLowerCase().includes(q);
      });
    });
  }, [data, currentSearchTerm, onSearchChange]);

  const validPageSize = Math.max(1, Number(pageSize) || 10);
  const validTotal = Math.max(0, typeof total === 'number' && !isNaN(total) ? total : displayData.length);
  const effectiveTotal = Math.max(displayData.length, validTotal > 0 && !currentSearchTerm ? validTotal : displayData.length);
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / validPageSize));
  const start = effectiveTotal === 0 ? 0 : (Math.max(1, page) - 1) * validPageSize + 1;
  const end = Math.min(Math.max(1, page) * validPageSize, effectiveTotal);

  const alignClass = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

  const content = useMemo(() => {
    if (loading) return <TableLoading cols={columns.length} />;
    if (error) return <ErrorState message={error} onRetry={onRetry} />;
    if (!displayData.length) {
      if (currentSearchTerm) {
        return (
          <EmptyState
            title="No matching records found"
            description={`No records match "${currentSearchTerm}". Try adjusting your search query or clear the filter.`}
            className="m-4 border-none shadow-none"
          />
        );
      }
      return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} className="m-4 border-none shadow-none" />;
    }
    return null;
  }, [loading, error, displayData.length, columns.length, onRetry, emptyTitle, emptyDescription, emptyAction, currentSearchTerm]);

  const showSearch = onSearchChange !== undefined || search !== undefined || !hideToolbar;
  const hasToolbarContent = !hideToolbar && (showSearch || filters || toolbarRight);

  return (
    <div className="w-full min-w-0 space-y-3 sm:space-y-4">
      {/* Search & Filter Toolbar */}
      {hasToolbarContent && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-2.5 sm:p-3 w-full min-w-0">
          {showSearch ? (
            <div className="w-full sm:w-72 md:w-80 min-w-0">
              <SearchInput
                value={search !== undefined ? search : localSearch}
                onChange={handleSearch}
                onClear={() => handleSearch('')}
                placeholder={searchPlaceholder}
                className="h-9 sm:h-10 text-xs sm:text-sm font-semibold w-full"
              />
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-start sm:justify-end">{filters}{toolbarRight}</div>
        </div>
      )}

      {/* Desktop / Tablet Table */}
      <div className="hidden overflow-hidden rounded-xl border border-[#CBD5E1] bg-white md:block w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-[#F8FAFC] border-b border-[#CBD5E1]">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'table-header-cell whitespace-nowrap px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-[#000000]',
                      alignClass(col.align),
                      col.sortable && 'cursor-pointer select-none hover:text-[#E87545]',
                    )}
                    onClick={() => col.sortable && onSort?.(col.key)}
                  >
                    <span className="inline-flex items-center gap-1 text-[#000000]">
                      {col.header}
                      {col.sortable && (
                        <span className="text-[#64748B]">
                          {sortBy === col.key ? (
                            sortDir === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5 text-[#E87545]" />
                            ) : (
                              <ArrowDown className="h-3.5 w-3.5 text-[#E87545]" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                          )}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
                {rowActions && (
                  <th className="table-header-cell px-4 py-3 text-right text-xs font-extrabold uppercase tracking-wider text-[#000000]">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {content ? (
                <tr>
                  <td colSpan={columns.length + (rowActions ? 1 : 0)}>{content}</td>
                </tr>
              ) : (
                displayData.map((row, i) => (
                  <tr
                    key={rowKey(row) || i}
                    className={cn(
                      'border-b border-[#E2E8F0] transition-colors duration-150 bg-white hover:bg-[#F8FAFC] cursor-pointer group',
                    )}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={cn('px-4 py-3.5 text-xs sm:text-sm font-semibold text-[#111827]', alignClass(col.align))}>
                        {col.cell ? col.cell(row) : (row as Record<string, unknown>)[col.key] as ReactNode}
                      </td>
                    ))}
                    {rowActions && <td className="px-4 py-3.5 text-right">{rowActions(row)}</td>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Structured Card List View */}
      <div className="space-y-2.5 md:hidden w-full min-w-0">
        {content ? (
          content
        ) : (
          displayData.map((row, i) => {
            if (mobileRender) {
              return (
                <div key={rowKey(row) || i} className="w-full min-w-0">
                  {mobileRender(row)}
                </div>
              );
            }

            const visibleCols = columns.filter((c) => !c.hideOnMobile);
            const firstCol = visibleCols[0];
            const otherCols = visibleCols.slice(1);

            return (
              <div
                key={rowKey(row) || i}
                className="w-full min-w-0 rounded-xl border border-[#CBD5E1] bg-white p-3.5 space-y-2.5 transition-colors hover:bg-[#F8FAFC]"
              >
                {/* Entity Header / First Column */}
                {firstCol && (
                  <div className="border-b border-[#E4E0D7] pb-2 min-w-0">
                    <div className="text-sm font-bold text-[#111827]">
                      {firstCol.mobileCell ? firstCol.mobileCell(row) : firstCol.cell(row)}
                    </div>
                  </div>
                )}

                {/* Structured Metadata Grid */}
                {otherCols.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {otherCols.map((col) => (
                      <div key={col.key} className="space-y-0.5 min-w-0">
                        <span className="block text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">
                          {col.header}
                        </span>
                        <div className="font-semibold text-[#111827] truncate">
                          {col.mobileCell ? col.mobileCell(row) : col.cell(row)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions Footer */}
                {rowActions && (
                  <div className="flex items-center justify-end gap-2 border-t border-[#E4E0D7] pt-2">
                    {rowActions(row)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {effectiveTotal > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 px-0.5 w-full min-w-0">
          <p className="text-xs text-[#64748B] font-medium text-center sm:text-left">
            Showing <span className="font-bold text-[#111827]">{start}</span>–
            <span className="font-bold text-[#111827]">{end}</span> of{' '}
            <span className="font-bold text-[#111827]">{effectiveTotal}</span> records
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange?.(page - 1)}
              aria-label="Previous page"
              className="h-8 px-2.5 text-xs font-bold border-[#CBD5E1] bg-white text-[#111827] hover:bg-[#F3F1EC] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4 mr-0.5" /> Prev
            </Button>
            <span className="px-2 text-xs font-bold tabular-nums text-[#111827]">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange?.(page + 1)}
              aria-label="Next page"
              className="h-8 px-2.5 text-xs font-bold border-[#CBD5E1] bg-white text-[#111827] hover:bg-[#F3F1EC] disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4 ml-0.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TableLoading({ cols }: { cols: number }) {
  return (
    <div className="space-y-2.5 p-5">
      {Array.from({ length: 5 }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-8 flex-1 rounded-md bg-[#DCDCD8]" style={{ animationDelay: `${r * 50}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
