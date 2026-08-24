'use client';

import { useCallback, useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { Badge, Money } from '@/components/dashboard/confirm-dialog';
import { studentsApi } from '@/lib/api/students.api';
import { useAuth } from '@/lib/auth/auth-context';
import type { StudentDetail, ApiError } from '@/lib/types';

export default function StudentProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.studentId) return;
    setLoading(true);
    setError(null);
    try {
      const s = await studentsApi.getById(user.studentId);
      setProfile(s);
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load profile.');
    } finally {
      setLoading(false);
    }
  }, [user?.studentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="space-y-4"><CardSkeleton className="h-64" /></div>;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!profile) return null;

  return (
    <div className="space-y-5">
      <PageHeader title="My Profile" description={profile.customerCode} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-2xl font-semibold text-primary">
              {profile.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <p className="mt-3 font-semibold">{profile.name}</p>
            <p className="text-sm text-muted-foreground">{profile.customerCode}</p>
            <div className="mt-2 flex gap-2">
              <Badge variant={profile.portalAccess === 'ENABLED' ? 'success' : 'error'}>Portal: {profile.portalAccess}</Badge>
              {profile.status && <Badge variant="info">{profile.status}</Badge>}
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <h3 className="text-sm font-semibold">Details</h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Hostel" value={profile.hostelName} />
            <Detail label="Room" value={profile.roomNumber} />
            <Detail label="Bed" value={profile.bedNumber} />
            <Detail label="Course" value={profile.course} />
            <Detail label="Year" value={profile.year ? `Year ${profile.year}` : undefined} />
            <Detail label="Email" value={profile.email} />
            <Detail label="Phone" value={profile.phone} />
            <Detail label="Guardian" value={profile.guardianName ? `${profile.guardianName} (${profile.guardianPhone || '—'})` : undefined} />
            <Detail label="Blood Group" value={profile.bloodGroup} />
            <Detail label="Emergency Contact" value={profile.emergencyContact} />
            <Detail label="Admission Date" value={profile.dateOfAdmission ? new Date(profile.dateOfAdmission).toLocaleDateString('en-IN') : undefined} />
          </dl>
          <div className="border-t border-border pt-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <FeeBox label="Total Fee" value={profile.feeTotal} />
              <FeeBox label="Paid" value={profile.feePaid} tone="success" />
              <FeeBox label="Outstanding" value={profile.feeOutstanding} tone={profile.feeOutstanding ? 'error' : 'success'} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value || '—'}</dd>
    </div>
  );
}

function FeeBox({ label, value, tone = 'neutral' }: { label: string; value?: number; tone?: 'neutral' | 'success' | 'error' }) {
  const tones = { neutral: '', success: 'text-emerald-600 dark:text-emerald-400', error: 'text-rose-600 dark:text-rose-400' };
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tones[tone]}`}><Money value={value || 0} /></p>
    </div>
  );
}
