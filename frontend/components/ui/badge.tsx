import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-[#E87545] focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[#E87545] text-white',
        secondary:
          'border-transparent bg-[#ECE9E1] text-[#111827]',
        destructive:
          'border-[#FECACA] bg-[#FEE2E2] text-[#C62828]',
        success:
          'border-[#B4E2C7] bg-[#E8F5ED] text-[#087A45]',
        warning:
          'border-[#FDE68A] bg-[#FEF3C7] text-[#C94F18]',
        info:
          'border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]',
        outline: 'border-[#CBD5E1] text-[#111827]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
