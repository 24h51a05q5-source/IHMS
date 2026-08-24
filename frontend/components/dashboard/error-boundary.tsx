'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PageErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[PageErrorBoundary] Uncaught rendering error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center p-4 sm:p-6 text-center">
          <div className="w-full max-w-md rounded-xl border border-[#CBD5E1] bg-white p-6 sm:p-8 space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FEE2E2] text-[#C62828] border border-[#FECACA]">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-black text-[#111827]">
              {this.props.fallbackTitle || 'Unable to display this page'}
            </h2>
            <p className="text-xs font-semibold text-[#64748B] leading-relaxed">
              {this.state.error?.message || this.props.fallbackMessage || 'An unexpected rendering error occurred. Please refresh or try again.'}
            </p>
            <div className="flex items-center justify-center gap-2.5 pt-2">
              <Button
                onClick={this.handleReset}
                className="gap-1.5 bg-[#E87545] hover:bg-[#D66434] text-white font-bold text-xs"
              >
                <RefreshCw className="h-4 w-4" /> Try Again
              </Button>
              <Button
                variant="outline"
                onClick={() => { window.location.href = '/dashboard'; }}
                className="gap-1.5 border-[#CBD5E1] text-[#111827] font-bold text-xs bg-white hover:bg-[#F8FAFC]"
              >
                <Home className="h-4 w-4" /> Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
