'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { studentsApi, type CreateStudentInput } from '@/lib/api/students.api';
import { useAuth } from '@/lib/auth/auth-context';
import type { ApiError } from '@/lib/types';

export default function NewStudentPage() {
  const router = useRouter();
  const { currentBranchId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CreateStudentInput>({
    name: '',
    email: '',
    phone: '',
    guardianName: '',
    guardianPhone: '',
    hostelId: currentBranchId || '',
    course: '',
    year: 1,
    feeTotal: 0,
  });

  const set = <K extends keyof CreateStudentInput>(k: K, v: CreateStudentInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Student name is required.');
      return;
    }
    setLoading(true);
    try {
      const res = await studentsApi.create(form);
      toast.success(`${res.customerCode} created. Portal access is ${res.portalAccess}.`);
      router.push('/students');
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to admit student.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => router.push('/students')} className="-ml-2">
        <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to students
      </Button>

      <PageHeader title="Admit New Student" description="Create a student record. Portal access stays disabled until you enable it." />

      <form onSubmit={submit} className="max-w-2xl space-y-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold">Personal details</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Rahul Kumar" required />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="rahul@example.com" />
            </Field>
            <Field label="Course">
              <Input value={form.course} onChange={(e) => set('course', e.target.value)} placeholder="B.Tech" />
            </Field>
            <Field label="Year">
              <Select value={String(form.year)} onValueChange={(v) => set('year', Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((y) => <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Total hostel fee (₹)">
              <Input type="number" min={0} value={form.feeTotal} onChange={(e) => set('feeTotal', Number(e.target.value))} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold">Guardian details</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Guardian name">
              <Input value={form.guardianName} onChange={(e) => set('guardianName', e.target.value)} placeholder="Parent / Guardian" />
            </Field>
            <Field label="Guardian phone">
              <Input value={form.guardianPhone} onChange={(e) => set('guardianPhone', e.target.value)} placeholder="+91 98765 43210" />
            </Field>
          </div>
        </fieldset>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => router.push('/students')}>Cancel</Button>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Admit Student
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-rose-500"> *</span>}</Label>
      {children}
    </div>
  );
}
