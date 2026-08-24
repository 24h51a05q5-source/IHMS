'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  debounceMs?: number;
  placeholder?: string;
  className?: string;
  containerClassName?: string;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onChange,
      onClear,
      debounceMs = 250,
      placeholder = 'Search records...',
      className,
      containerClassName,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [localValue, setLocalValue] = useState(value || '');
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
      setLocalValue(value || '');
    }, [value]);

    const handleTextChange = (nextText: string) => {
      setLocalValue(nextText);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        onChange(nextText);
      }, debounceMs);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        onChange(localValue);
      }
    };

    const handleClear = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      setLocalValue('');
      onChange('');
      if (onClear) onClear();
      if (inputRef.current) {
        inputRef.current.focus();
      }
    };

    return (
      <div className={cn('relative w-full sm:max-w-xs', containerClassName)}>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]"
          aria-hidden="true"
        />
        <input
          ref={(node) => {
            inputRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
          }}
          type="text"
          value={localValue}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'flex h-9 sm:h-10 w-full rounded-xl border border-[#CBD5E1] bg-white pl-9 pr-8 text-xs sm:text-sm font-semibold text-[#111827] placeholder:text-[#64748B] transition-colors duration-150',
            'focus:border-[#E87545] focus:outline-none focus:ring-1 focus:ring-[#E87545]',
            'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400',
            className
          )}
          aria-label={placeholder}
          {...props}
        />
        {localValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 hover:text-slate-900 transition-colors focus:outline-none"
            aria-label="Clear search input"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        )}
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';
