import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> { }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 sm:h-10 w-full rounded-lg border border-[rgba(70,80,90,0.14)] bg-[#E8E8E5] px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-medium text-[#334155] shadow-2xs ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-semibold placeholder:text-[#6B7785] transition-all focus-visible:bg-[#EEEEEB] focus-visible:border-[#B32018] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#B32018]/12 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#DCDCD8]',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
