'use client';

import { forwardRef } from 'react';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive, loading, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-premium-lg animate-scale-in">
        <div className="flex items-start justify-between">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            className={cn(
              'inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-white transition-all disabled:opacity-60',
              destructive ? 'bg-destructive hover:bg-destructive/90' : 'bg-gradient-primary hover:shadow-glow',
            )}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export const Money = forwardRef<HTMLSpanElement, { value: number; className?: string }>(({ value, className }, ref) => (
  <span ref={ref} className={cn('tabular-nums', className)}>
    ₹{value.toLocaleString('en-IN')}
  </span>
));
Money.displayName = 'Money';

export function Badge({ children, variant = 'default', className }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent' | 'outline'; className?: string }) {
  const variants: Record<string, string> = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success border border-success/20',
    warning: 'bg-warning/10 text-warning border border-warning/20',
    error: 'bg-destructive/10 text-destructive border border-destructive/20',
    info: 'bg-chart-1/10 text-chart-1 border border-chart-1/20',
    accent: 'bg-accent/10 text-accent border border-accent/20',
    outline: 'border border-border text-muted-foreground',
  };
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', variants[variant], className)}>{children}</span>;
}
