import { cn } from '@/lib/utils';

export function FullScreenLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-2 border-muted" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
      {label && <p className="text-sm font-medium text-muted-foreground">{label}</p>}
    </div>
  );
}

export function InlineLoader({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground', className)}>
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-9 flex-1 rounded-lg bg-muted" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-11 flex-1 animate-pulse rounded-lg bg-muted/50" style={{ animationDelay: `${r * 60}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return <div className={cn('h-28 animate-pulse rounded-xl border border-border bg-muted/40', className)} />;
}
