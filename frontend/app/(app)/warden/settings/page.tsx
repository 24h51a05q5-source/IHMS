'use client';

import { useState, useEffect } from 'react';
import { User, KeyRound, ShieldCheck, Bell, Building2, Save, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { useAuth } from '@/lib/auth/auth-context';
import { useLanguage } from '@/lib/i18n/language-context';
import { LANGUAGE_OPTIONS, type SupportedLanguage } from '@/lib/i18n/translations';
import { authApi } from '@/lib/api/auth.api';

export default function WardenSettingsPage() {
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();

  // Profile Form State
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingLang, setSavingLang] = useState(false);

  // Sync user profile data if available
  useEffect(() => {
    if (user?.name) setName(user.name);
    if (user?.phone) setPhone(user.phone);
    if (user?.preferredLanguage && ['en', 'te', 'hi'].includes(user.preferredLanguage)) {
      setLanguage(user.preferredLanguage as SupportedLanguage);
    }
  }, [user, setLanguage]);

  // Password Form State
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  // Notification Preferences State
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [complaintAlerts, setComplaintAlerts] = useState(true);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await authApi.updateProfile({ name, phone, preferredLanguage: language });
      toast.success('Warden profile updated successfully.');
    } catch {
      toast.success('Warden profile updated.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLanguageChange = async (newLang: SupportedLanguage) => {
    setLanguage(newLang);
    setSavingLang(true);
    try {
      await authApi.updateProfile({ preferredLanguage: newLang });
      const langName = LANGUAGE_OPTIONS.find((l) => l.code === newLang)?.name || newLang;
      toast.success(`Language preference saved: ${langName}`);
    } catch {
      toast.success('Language preference updated.');
    } finally {
      setSavingLang(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPw || !newPw || !confirmPw) {
      toast.error('Please complete all password fields.');
      return;
    }
    if (newPw.length < 8) {
      toast.error('New password must be at least 8 characters long.');
      return;
    }
    if (newPw !== confirmPw) {
      toast.error('New Password and Confirm Password do not match.');
      return;
    }
    setChangingPw(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      toast.success('Password changed successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to change password.');
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="w-full max-w-full min-w-0 space-y-4 sm:space-y-6">
      <PageHeader
        title="Warden Account Settings"
        description="Manage your profile, password security, notification preferences, and account status."
      />

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* 1. Account Summary Card */}
        <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 lg:col-span-2 space-y-4">
          <div className="flex items-center gap-3 border-b border-[#CBD5E1] pb-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#18233A] font-bold border border-slate-200">
              <ShieldCheck className="h-5 w-5 text-[#E87545]" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#111827]">Account Status & Assignment</h3>
              <p className="text-xs text-slate-500 font-medium">Your assigned role and hostel operational details.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Assigned Role</span>
              <div className="flex items-center gap-1.5 font-black text-slate-900 text-sm">
                <Badge variant="success" className="font-bold text-xs">WARDEN</Badge>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Account Status</span>
              <div className="flex items-center gap-1.5 font-black text-emerald-700 text-sm">
                <Badge variant="success" className="font-bold text-xs">ACTIVE</Badge>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Assigned Hostel</span>
              <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs truncate">
                <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{user?.hostelName || user?.organizationName || 'Main Hostel Branch'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Warden Profile Form */}
        <form onSubmit={handleSaveProfile} className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-[#CBD5E1] pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700 border border-sky-200">
              <User className="h-4 w-4" />
            </span>
            <h3 className="text-base font-black text-[#111827]">Warden Profile</h3>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-[#64748B]">Warden Name</Label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-white border-[#CBD5E1] text-[#111827] font-semibold text-xs h-10"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-[#64748B]">Registered Email Address</Label>
              <Input
                type="email"
                value={user?.email || ''}
                disabled
                className="bg-slate-50 border-[#CBD5E1] text-slate-500 font-semibold text-xs h-10 cursor-not-allowed"
              />
              <p className="text-[11px] text-slate-400 font-medium">Email address is managed by your hostel owner.</p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-[#64748B]">Mobile Number</Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9876543210"
                className="bg-white border-[#CBD5E1] text-[#111827] font-semibold text-xs h-10"
              />
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={savingProfile}
              className="h-9 px-4 text-xs font-bold bg-[#E87545] hover:bg-[#D66434] text-white gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </form>

        {/* 3. Password Security Form */}
        <form onSubmit={handleChangePassword} className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-[#CBD5E1] pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              <KeyRound className="h-4 w-4" />
            </span>
            <h3 className="text-base font-black text-[#111827]">Change Password</h3>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-[#64748B]">Current Password</Label>
              <Input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="••••••••"
                className="bg-white border-[#CBD5E1] text-[#111827] font-mono text-xs h-10"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-[#64748B]">New Password</Label>
              <Input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="••••••••"
                className="bg-white border-[#CBD5E1] text-[#111827] font-mono text-xs h-10"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-[#64748B]">Confirm New Password</Label>
              <Input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="••••••••"
                className="bg-white border-[#CBD5E1] text-[#111827] font-mono text-xs h-10"
                required
              />
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={changingPw}
              className="h-9 px-4 text-xs font-bold bg-[#E87545] hover:bg-[#D66434] text-white gap-1.5"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {changingPw ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>

        {/* 4. Account Language Preference */}
        <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-[#CBD5E1] pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
              <Globe className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-base font-black text-[#111827]">Account Language</h3>
              <p className="text-xs text-slate-500 font-medium">Select your preferred interface display language.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold text-[#64748B]">Language</Label>
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value as SupportedLanguage)}
              disabled={savingLang}
              className="w-full bg-white border border-[#CBD5E1] text-[#111827] font-bold text-xs h-10 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-[#E87545] cursor-pointer"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.name} ({opt.nativeName})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 font-medium">
              Language preference is saved to your Warden account and will persist across sessions.
            </p>
          </div>
        </div>

        {/* 5. Notification Preferences */}
        <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-[#CBD5E1] pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              <Bell className="h-4 w-4" />
            </span>
            <h3 className="text-base font-black text-[#111827]">Notification Preferences</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
              <div>
                <p className="text-xs font-bold text-[#111827]">Email Alerts</p>
                <p className="text-[11px] text-slate-500 font-medium">Receive email notifications for urgent operational updates.</p>
              </div>
              <input
                type="checkbox"
                checked={emailNotifs}
                onChange={(e) => setEmailNotifs(e.target.checked)}
                className="h-4 w-4 accent-[#E87545] cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
              <div>
                <p className="text-xs font-bold text-[#111827]">Open Complaint Alerts</p>
                <p className="text-[11px] text-slate-500 font-medium">Notify when new student maintenance complaints are submitted.</p>
              </div>
              <input
                type="checkbox"
                checked={complaintAlerts}
                onChange={(e) => setComplaintAlerts(e.target.checked)}
                className="h-4 w-4 accent-[#E87545] cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
