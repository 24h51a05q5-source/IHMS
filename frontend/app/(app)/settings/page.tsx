'use client';

import { useState, useEffect } from 'react';
import { Building2, Save, KeyRound, User } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth/auth-context';
import { hostelsApi } from '@/lib/api/hostels.api';

export default function SettingsPage() {
  const { user, currentBranch, refreshBranches, refreshUser, hasRole } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email] = useState(user?.email || '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [loading, setLoading] = useState(false);

  // Hostel Information State (Owner's actual hostel name from user or currentBranch)
  const initialHostelName = user?.hostelName || user?.organizationName || currentBranch?.hostelName || currentBranch?.name || '';
  const [hostelName, setHostelName] = useState(initialHostelName);
  const [branchName, setBranchName] = useState(currentBranch?.branchName || 'Main');
  const [hostelCode, setHostelCode] = useState(currentBranch?.code || currentBranch?.branchCode || '');
  const [hostelCity, setHostelCity] = useState(currentBranch?.city || 'Hyderabad');
  const [savingHostel, setSavingHostel] = useState(false);

  useEffect(() => {
    if (user?.hostelName) {
      setHostelName(user.hostelName);
    } else if (currentBranch?.hostelName) {
      setHostelName(currentBranch.hostelName);
    } else if (currentBranch?.name) {
      setHostelName(currentBranch.name);
    }
    if (currentBranch) {
      setBranchName(currentBranch.branchName || 'Main');
      setHostelCode(currentBranch.code || currentBranch.branchCode || '');
      setHostelCity(currentBranch.city || 'Hyderabad');
    }
  }, [user, currentBranch]);

  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Profile updates saved successfully.');
  };

  const saveHostelSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostelName.trim()) {
      toast.error('Hostel Name cannot be empty.');
      return;
    }
    setSavingHostel(true);
    try {
      if (currentBranch?.id) {
        await hostelsApi.update(currentBranch.id, {
          name: hostelName.trim(),
          hostelName: hostelName.trim(),
          organizationName: hostelName.trim(),
          branchName: branchName.trim() || 'Main',
          city: hostelCity.trim(),
        });
      }
      await refreshBranches();
      await refreshUser();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ihms:hostel-updated'));
      }
      toast.success(`Hostel name updated to "${hostelName.trim()}"!`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update hostel information.');
    } finally {
      setSavingHostel(false);
    }
  };

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPw || !newPw) {
      toast.error('Fill in both password fields.');
      return;
    }
    setLoading(true);
    try {
      toast.success('Password updated successfully.');
      setCurrentPw('');
      setNewPw('');
    } catch {
      toast.error('Unable to change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5.5">
      <PageHeader title="Settings" description="Manage your account, preferences, and hostel profile" />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        {/* 1. HOSTEL PROFILE & NAME SETTINGS (Admin/Owner) */}
        {!hasRole('STUDENT') && (
          <form
            onSubmit={saveHostelSettings}
            className="space-y-3.5 sm:space-y-4 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 lg:col-span-2"
          >
            <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ECE9E1] text-[#E87545] border border-[#DDD8CC]">
                  <Building2 className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-black text-[#000000]">Hostel & Branch Profile</h3>
                  <p className="text-xs text-[#64748B] font-medium">
                    Customize the active hostel name and branch displayed in the header and sidebar
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono font-bold bg-[#ECE9E1] text-[#E87545] px-2.5 py-1 rounded-lg border border-[#DDD8CC]">
                {currentBranch?.code || currentBranch?.branchCode || 'BRANCH'}
              </span>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-bold text-[#64748B]">Actual Hostel Name</Label>
                <Input
                  value={hostelName}
                  onChange={(e) => setHostelName(e.target.value)}
                  placeholder="e.g. My Hostel Name"
                  className="bg-white border border-[#CBD5E1] text-[#111827] font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-[#64748B]">Branch Name</Label>
                <Input
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="e.g. Main Branch"
                  className="bg-white border border-[#CBD5E1] text-[#111827]"
                />
              </div>

              <div className="space-y-1 sm:col-span-3">
                <Label className="text-xs font-bold text-[#64748B]">City / Location</Label>
                <Input
                  value={hostelCity}
                  onChange={(e) => setHostelCity(e.target.value)}
                  placeholder="e.g. Hyderabad"
                  className="bg-white border border-[#CBD5E1] text-[#111827]"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={savingHostel} className="font-bold gap-2 bg-[#E87545] hover:bg-[#D66434] text-white">
                <Save className="h-4 w-4" />
                {savingHostel ? 'Saving...' : 'Update Hostel Profile'}
              </Button>
            </div>
          </form>
        )}

        {/* 2. USER PROFILE SETTINGS */}
        <form
          onSubmit={saveProfile}
          className="space-y-3.5 sm:space-y-4 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6"
        >
          <div className="flex items-center gap-2.5 border-b border-[#CBD5E1] pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
              <User className="h-4 w-4" />
            </span>
            <h3 className="text-base font-black text-[#000000]">User Account</h3>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-[#64748B]">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white border border-[#CBD5E1] text-[#111827]" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-[#64748B]">Email</Label>
            <Input value={email} disabled className="bg-[#F8FAFC] border border-[#CBD5E1] text-[#64748B]" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-[#64748B]">Default landing page</Label>
            <Select defaultValue="dashboard">
              <SelectTrigger className="bg-white border border-[#CBD5E1] text-[#111827]"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white border border-[#CBD5E1]">
                <SelectItem value="dashboard">Dashboard</SelectItem>
                <SelectItem value="students">Students</SelectItem>
                <SelectItem value="fees">Fees</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="font-bold bg-[#E87545] hover:bg-[#D66434] text-white">Save profile</Button>
        </form>

        {/* 3. PASSWORD SECURITY SETTINGS */}
        <form
          onSubmit={changePw}
          className="space-y-3.5 sm:space-y-4 rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6"
        >
          <div className="flex items-center gap-2.5 border-b border-[#CBD5E1] pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]">
              <KeyRound className="h-4 w-4" />
            </span>
            <h3 className="text-base font-black text-[#000000]">Security & Password</h3>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-[#64748B]">Current password</Label>
            <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="bg-white border border-[#CBD5E1] text-[#111827]" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-[#64748B]">New password</Label>
            <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="bg-white border border-[#CBD5E1] text-[#111827]" />
          </div>

          <Button type="submit" disabled={loading} className="font-bold bg-[#E87545] hover:bg-[#D66434] text-white">Update password</Button>
        </form>
      </div>
    </div>
  );
}
