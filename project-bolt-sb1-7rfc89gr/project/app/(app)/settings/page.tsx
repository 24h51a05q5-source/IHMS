'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth/auth-context';

export default function SettingsPage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email] = useState(user?.email || '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [loading, setLoading] = useState(false);

  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    toast.info('Profile updates are sent to the backend via PUT /auth/me. Connect the NestJS backend to enable this.');
  };

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPw || !newPw) { toast.error('Fill in both password fields.'); return; }
    setLoading(true);
    try {
      // Uses authApi.changePassword — wired once backend is connected
      toast.info('Password change requires the backend. Connect Antigravity to enable.');
      setCurrentPw(''); setNewPw('');
    } catch {
      toast.error('Unable to change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Manage your account and preferences" />
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={saveProfile} className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Profile</h3>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={email} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Default landing page</Label>
            <Select defaultValue="dashboard">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dashboard">Dashboard</SelectItem>
                <SelectItem value="students">Students</SelectItem>
                <SelectItem value="fees">Fees</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit">Save changes</Button>
        </form>

        <form onSubmit={changePw} className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Change password</h3>
          <div className="space-y-1.5">
            <Label>Current password</Label>
            <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </div>
          <Button type="submit" disabled={loading}>Update password</Button>
        </form>
      </div>
    </div>
  );
}
