'use client';

import { forwardRef } from 'react';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/40" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-xl border border-[#CBD5E1] bg-white p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-base font-extrabold text-[#000000] tracking-tight">{title}</h2>
          <button onClick={onCancel} className="text-[#64748B] hover:text-[#000000] p-1" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2.5 text-xs font-semibold text-[#64748B] leading-relaxed">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading} className="border-[#CBD5E1] text-[#111827] font-bold bg-white hover:bg-[#F8FAFC]">
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
            className="font-bold"
          >
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Money = forwardRef<HTMLSpanElement, { value: number; className?: string }>(({ value, className }, ref) => (
  <span ref={ref} className={cn('tabular-nums font-mono font-black text-[#000000]', className)}>
    ₹{value.toLocaleString('en-IN')}
  </span>
));
Money.displayName = 'Money';

export function Badge({
  children,
  variant = 'default',
  className,
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent' | 'outline';
  className?: string;
}) {
  const variants: Record<string, string> = {
    default: 'bg-[#ECE9E1] text-[#E87545] border border-[#DDD8CC]',
    success: 'bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]',
    warning: 'bg-[#FEF3C7] text-[#C94F18] border border-[#FDE68A]',
    error: 'bg-[#FEE2E2] text-[#C62828] border border-[#FECACA]',
    info: 'bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]',
    accent: 'bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]',
    outline: 'bg-white text-[#111827] border border-[#E4E0D7]',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-black uppercase tracking-wider',
        variants[variant] || variants.default,
        className
      )}
    >
      {children}
    </span>
  );
}
