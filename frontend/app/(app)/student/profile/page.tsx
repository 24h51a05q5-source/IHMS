'use client';

import { useCallback, useEffect, useState } from 'react';
import { User, Phone, Mail, MapPin, Edit3, Loader2, ShieldCheck, CheckCircle2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { Badge, Money } from '@/components/dashboard/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { studentsApi } from '@/lib/api/students.api';
import { getCachedData } from '@/lib/api/client';
import type { StudentDetail, ApiError } from '@/lib/types';

export default function StudentProfilePage() {
  const cachedProfile = getCachedData<StudentDetail>('/student/profile');
  const [profile, setProfile] = useState<StudentDetail | null>(() => cachedProfile);
  const [loading, setLoading] = useState(() => !cachedProfile);
  const [error, setError] = useState<string | null>(null);

  // Edit Modal State
  const [editOpen, setEditOpen] = useState(false);
  const [editPhone, setEditPhone] = useState(() => cachedProfile?.phone || '');
  const [editEmail, setEditEmail] = useState(() => cachedProfile?.email || '');
  const [editAddress, setEditAddress] = useState(() => cachedProfile?.address || cachedProfile?.guardianPhone || '');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await studentsApi.getMyProfile();
      setProfile(s);
      setEditPhone(s.phone || '');
      setEditEmail(s.email || '');
      setEditAddress(s.address || s.guardianPhone || '');
      setError(null);
    } catch (err) {
      if (!profile) {
        setError((err as ApiError)?.message || 'Unable to load your profile.');
      }
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await studentsApi.updateMyProfile({
        phone: editPhone,
        email: editEmail,
        address: editAddress,
      });
      toast.success('Profile updated successfully!');
      setEditOpen(false);
      load();
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <CardSkeleton className="h-64" />
        <CardSkeleton className="h-64" />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!profile) return null;

  return (
    <div className="space-y-3.5 sm:space-y-5">
      <PageHeader
        title="My Profile"
        description={`Student ID: ${profile.studentId || profile.customerCode}`}
        actions={
          <Button
            onClick={() => {
              setEditPhone(profile.phone || '');
              setEditEmail(profile.email || '');
              setEditAddress(profile.address || '');
              setEditOpen(true);
            }}
            className="gap-2 font-bold"
          >
            <Edit3 className="h-4 w-4" /> Edit Profile
          </Button>
        }
      />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        {/* Left card: Avatar & ID */}
        <div className="space-y-3.5 sm:space-y-4">
          <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-5 text-center">
            <div className="mx-auto flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-2xl bg-[#E87545] text-2xl sm:text-3xl font-bold text-white">
              {profile.name
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            <h2 className="mt-3 text-base sm:text-lg font-bold text-[#111827]">{profile.name}</h2>
            <p className="font-mono text-xs font-medium text-[#E87545] mt-0.5">{profile.studentId || profile.customerCode}</p>
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
              <Badge variant={profile.portalAccess === 'ENABLED' ? 'success' : 'error'}>
                Portal {profile.portalAccess}
              </Badge>
              <Badge variant="info">{profile.status || 'ACTIVE'}</Badge>
            </div>
          </div>

          {/* Accommodation Snapshot */}
          <div className="rounded-xl border border-[#CBD5E1] bg-white p-3.5 sm:p-4.5 space-y-2.5 sm:space-y-3">
            <h3 className="text-xs sm:text-sm font-bold flex items-center gap-2 text-[#111827]">
              <Building2 className="h-4 w-4 text-[#E87545]" /> Assigned Accommodation
            </h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between py-1 border-b border-[#CBD5E1]">
                <span className="text-[#64748B] font-semibold">Hostel</span>
                <span className="font-bold text-[#111827]">{profile.hostelName || 'Main Hostel'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#CBD5E1]">
                <span className="text-[#64748B] font-semibold">Room</span>
                <span className="font-bold text-[#E87545]">Room {profile.roomNumber}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#64748B] font-semibold">Bed</span>
                <span className="font-bold text-[#E87545]">Bed {profile.bedNumber}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right card: Profile Details */}
        <div className="space-y-4 sm:space-y-5 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 lg:col-span-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Personal Information</h3>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2">
              <Detail label="Full Name" value={profile.name} />
              <Detail label="Student ID / Code" value={profile.studentId || profile.customerCode} mono />
              <Detail label="Email Address" value={profile.email} />
              <Detail label="Contact Phone" value={profile.phone} />
              <Detail label="Course / Program" value={profile.course || 'Undergraduate'} />
              <Detail label="Admission Date" value={profile.dateOfAdmission ? new Date(profile.dateOfAdmission).toLocaleDateString('en-IN') : undefined} />
            </dl>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Guardian & Emergency Details</h3>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2">
              <Detail label="Guardian Name" value={profile.guardianName} />
              <Detail label="Relationship" value="Parent / Guardian" />
              <Detail label="Guardian Phone" value={profile.guardianPhone} />
              <Detail label="Permanent Address" value={profile.address} fullWidth />
            </dl>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Financial Status</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <FeeBox label="Total Hostel Fee" value={profile.feeTotal} />
              <FeeBox label="Paid Amount" value={profile.feePaid} tone="success" />
              <FeeBox label="Outstanding Balance" value={profile.feeOutstanding} tone={profile.feeOutstanding ? 'error' : 'success'} />
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Contact Information</DialogTitle>
            <DialogDescription>
              You can update your personal contact phone, email, and address. Academic and room details cannot be modified.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="editPhone">Contact Phone *</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="editPhone"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="editEmail">Email Address *</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="editEmail"
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="editAddress">Permanent Address</Label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="editAddress"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Street, City, State, Pincode"
                  className="pl-9"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value, mono, fullWidth }: { label: string; value?: string; mono?: boolean; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold ${mono ? 'font-mono' : ''}`}>{value || '—'}</dd>
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
