import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-bold ring-offset-background transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E87545] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[#E87545] text-white hover:bg-[#D66434] active:bg-[#C94F18]',
        destructive:
          'bg-[#C62828] text-white hover:bg-[#B91C1C] active:bg-[#991B1B]',
        outline:
          'bg-white text-[#111827] border border-[#CBD5E1] hover:bg-[#F8FAFC] hover:border-[#E87545] active:bg-[#F1F5F9]',
        secondary:
          'bg-[#F1F5F9] text-[#111827] border border-[#E2E8F0] hover:bg-[#E2E8F0] active:bg-[#CBD5E1]',
        ghost: 'hover:bg-[#ECE9E1] hover:text-[#E87545] text-[#111827] font-bold',
        link: 'text-[#E87545] underline-offset-4 hover:underline hover:text-[#D66434]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3 text-xs',
        lg: 'h-11 rounded-xl px-7 text-base',
        icon: 'h-9 w-9 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
