'use client';

import { Construction } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';

export default function ModulePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-5">
      <PageHeader title={title} description={description} />
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Construction className="h-7 w-7" />
        </div>
        <p className="text-sm font-medium">This module is ready for backend integration</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          The UI layer and API service are scaffolded. The page activates automatically once Antigravity connects the NestJS backend endpoints.
        </p>
        <Button variant="outline" className="mt-4" asChild>
          <a href="/dashboard">Back to dashboard</a>
        </Button>
      </div>
    </div>
  );
}
