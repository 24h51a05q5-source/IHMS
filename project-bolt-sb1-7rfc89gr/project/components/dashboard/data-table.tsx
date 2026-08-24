'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from './states';
import { cn } from '@/lib/utils';

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
  searchPlaceholder = 'Search...',
  onSearchChange,
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
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const [localSearch, setLocalSearch] = useState('');

  const effectiveSearch = search ?? localSearch;
  const handleSearch = (v: string) => {
    if (onSearchChange) onSearchChange(v);
    else setLocalSearch(v);
  };

  const alignClass = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

  const content = useMemo(() => {
    if (loading) return <TableLoading cols={columns.length} />;
    if (error) return <ErrorState message={error} onRetry={onRetry} />;
    if (!data.length)
      return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} className="m-4" />;
    return null;
  }, [loading, error, data.length, columns.length, onRetry, emptyTitle, emptyDescription, emptyAction]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {onSearchChange || search === undefined ? (
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={effectiveSearch}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 pl-10"
              aria-label="Search table"
            />
          </div>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">{filters}{toolbarRight}</div>
      </div>

      {/* Desktop / tablet table */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-premium md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'whitespace-nowrap px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground',
                      alignClass(col.align),
                      col.sortable && 'cursor-pointer select-none hover:text-foreground',
                    )}
                    onClick={() => col.sortable && onSort?.(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable && (
                        <span className="text-muted-foreground/60">
                          {sortBy === col.key ? (
                            sortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                          )}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
                {rowActions && <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>}
              </tr>
            </thead>
            {content && !data.length ? (
              <tbody>
                <tr>
                  <td colSpan={columns.length + (rowActions ? 1 : 0)} className="p-0">
                    {content}
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-border">
                {data.map((row) => (
                  <tr key={rowKey(row)} className="transition-colors hover:bg-muted/30">
                    {columns.map((col) => (
                      <td key={col.key} className={cn('px-4 py-3 align-middle', alignClass(col.align), col.className)}>
                        {col.cell(row)}
                      </td>
                    ))}
                    {rowActions && <td className="px-4 py-3 text-right">{rowActions(row)}</td>}
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {content && !data.length ? (
          content
        ) : (
          data.map((row) => (
            <div key={rowKey(row)} className="rounded-xl border border-border bg-card p-4 shadow-premium">
              <div className="space-y-2">
                {columns
                  .filter((c) => !c.hideOnMobile)
                  .map((col) => (
                    <div key={col.key} className="flex items-start justify-between gap-3 text-sm">
                      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{col.header}</span>
                      <span className="min-w-0 text-right font-medium">
                        {col.mobileCell ? col.mobileCell(row) : col.cell(row)}
                      </span>
                    </div>
                  ))}
              </div>
              {rowActions && <div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">{rowActions(row)}</div>}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{start}</span>–
            <span className="font-semibold text-foreground">{end}</span> of{' '}
            <span className="font-semibold text-foreground">{total}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)} aria-label="Previous page" className="h-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm font-medium tabular-nums">
              {page} / {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange?.(page + 1)} aria-label="Next page" className="h-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TableLoading({ cols }: { cols: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-10 flex-1" style={{ animationDelay: `${r * 50}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
