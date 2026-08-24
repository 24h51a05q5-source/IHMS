'use client';

import { ProtectedRoute } from '@/lib/auth/protected-route';
import { DashboardShell } from '@/components/dashboard/shell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <DashboardShell>{children}</DashboardShell>
    </ProtectedRoute>
  );
}
