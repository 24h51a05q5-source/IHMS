'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  LifeBuoy,
  X,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  FileImage,
  ExternalLink,
  ShieldCheck,
  Building2,
  User,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/auth-context';
import { supportApi } from '@/lib/api/support.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { SupportTicket, SupportTicketCategory } from '@/lib/types';

export const SUPPORT_CATEGORIES: SupportTicketCategory[] = [
  'Login Problem',
  'OTP Problem',
  'Password Problem',
  'Payment / Fees Problem',
  'Account Problem',
  'Technical Issue',
  'Other',
];

interface ContactUsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTicketSubmitted?: (ticket: SupportTicket) => void;
}

export function ContactUsModal({ open, onOpenChange, onTicketSubmitted }: ContactUsModalProps) {
  const router = useRouter();
  const { user, currentBranch, branches } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<SupportTicket | null>(null);

  // Auto-filled user information
  const userName = user?.name || '';
  const userRoleFormatted =
    user?.role === 'STUDENT'
      ? 'Student'
      : user?.role === 'ORGANIZATION_OWNER'
      ? 'Hostel Owner'
      : user?.role === 'PLATFORM_SUPER_ADMIN'
      ? 'Super Admin'
      : user?.role ? user.role.replace(/_/g, ' ') : 'User';

  const hostelName =
    currentBranch?.name ||
    user?.hostelName ||
    (branches && branches[0]?.name) ||
    'Sri Chaitanya Boys Hostel';

  const email = user?.email || '';

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setSubject('');
      setCategory('');
      setDescription('');
      setScreenshotUrl(null);
      setFileName(null);
      setError(null);
      setCreatedTicket(null);
    }
  }, [open]);

  // Handle file selection and read as base64
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, JPEG, WEBP)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Screenshot size should be less than 5MB');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = () => {
    setScreenshotUrl(null);
    setFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!subject.trim()) {
      setError('Please enter a subject / problem title.');
      return;
    }

    if (!category) {
      setError('Please select a problem category.');
      return;
    }

    if (!description.trim()) {
      setError('Please provide a detailed description of the problem.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await supportApi.createTicket({
        userName,
        userRole: user?.role || 'STUDENT',
        hostelName,
        email,
        subject: subject.trim(),
        category,
        description: description.trim(),
        screenshotUrl: screenshotUrl || undefined,
      });

      const ticket = res.ticket;
      setCreatedTicket(ticket);
      toast.success('Your issue has been submitted successfully.');
      onTicketSubmitted?.(ticket);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit support request. Please try again.');
      toast.error(err?.message || 'Failed to submit support request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNavigateToTickets = () => {
    onOpenChange(false);
    if (user?.role === 'STUDENT') {
      router.push('/student/support');
    } else {
      router.push('/support');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-slate-950/40 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-xl rounded-xl bg-white border border-[#CBD5E1] overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#ECE9E1] border-b border-[#DDD8CC] shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E87545] text-white">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-[#111827]">
                Contact Us & Support
              </h2>
              <p className="text-xs font-medium text-[#64748B]">
                Report an issue or request help from our technical team
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-[#CBD5E1] text-[#475569] hover:bg-[#FEE2E2] hover:text-[#C62828] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {createdTicket ? (
            /* Success View */
            <div className="py-6 text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]">
                <CheckCircle2 className="h-9 w-9" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-[#111827]">
                  Support Ticket Created
                </h3>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FAFAF7] border border-[#CBD5E1]">
                  <span className="text-xs font-semibold text-[#64748B]">Ticket ID:</span>
                  <span className="text-sm font-black font-mono text-[#E87545]">
                    {createdTicket.ticketNumber || createdTicket.ticketId}
                  </span>
                </div>
              </div>

              <p className="text-sm font-medium text-[#334155] max-w-md mx-auto leading-relaxed bg-[#F8FAFC] p-3.5 rounded-xl border border-[#CBD5E1]">
                “Your issue has been submitted successfully. Our support team will contact you soon.”
              </p>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="w-full sm:w-auto border-[#CBD5E1] text-[#111827] font-bold"
                >
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={handleNavigateToTickets}
                  className="w-full sm:w-auto bg-[#E87545] hover:bg-[#D66434] text-white font-bold"
                >
                  View My Tickets <ExternalLink className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            /* Contact Us Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#FEE2E2] border border-[#FECACA] text-[#C62828] text-xs font-semibold">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Auto-filled User Details Card */}
              <div className="rounded-xl bg-[#FAFAF7] border border-[#E4E0D7] p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2 text-[#475569]">
                  <User className="h-3.5 w-3.5 text-[#E87545] shrink-0" />
                  <span className="font-medium text-[#64748B]">Name:</span>
                  <span className="font-bold text-[#111827] truncate">{userName || '—'}</span>
                </div>

                <div className="flex items-center gap-2 text-[#475569]">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#2563EB] shrink-0" />
                  <span className="font-medium text-[#64748B]">Role:</span>
                  <span className="font-bold text-[#111827]">{userRoleFormatted}</span>
                </div>

                <div className="flex items-center gap-2 text-[#475569]">
                  <Building2 className="h-3.5 w-3.5 text-[#087A45] shrink-0" />
                  <span className="font-medium text-[#64748B]">Hostel:</span>
                  <span className="font-bold text-[#111827] truncate">{hostelName || '—'}</span>
                </div>

                <div className="flex items-center gap-2 text-[#475569]">
                  <Mail className="h-3.5 w-3.5 text-[#C94F18] shrink-0" />
                  <span className="font-medium text-[#64748B]">Email:</span>
                  <span className="font-bold text-[#111827] truncate">{email || '—'}</span>
                </div>
              </div>

              {/* Subject / Problem Title */}
              <div className="space-y-1.5">
                <Label htmlFor="subject" className="text-xs font-bold text-[#111827]">
                  Subject / Problem Title <span className="text-[#C62828]">*</span>
                </Label>
                <Input
                  id="subject"
                  placeholder="e.g. Unable to verify OTP during login"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="bg-white border-[#CBD5E1] text-xs sm:text-sm font-semibold focus:border-[#E87545]"
                  disabled={submitting}
                  required
                />
              </div>

              {/* Problem Category */}
              <div className="space-y-1.5">
                <Label htmlFor="category" className="text-xs font-bold text-[#111827]">
                  Problem Category <span className="text-[#C62828]">*</span>
                </Label>
                <Select value={category} onValueChange={setCategory} disabled={submitting}>
                  <SelectTrigger
                    id="category"
                    className="bg-white border-[#CBD5E1] text-xs sm:text-sm font-semibold"
                  >
                    <SelectValue placeholder="Select the category that best fits your issue" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#E4E0D7]">
                    {SUPPORT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat} className="text-xs sm:text-sm font-semibold py-2">
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Detailed Description */}
              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-bold text-[#111827]">
                  Detailed Description of the Problem <span className="text-[#C62828]">*</span>
                </Label>
                <Textarea
                  id="description"
                  rows={4}
                  placeholder="Please describe what happened, steps to reproduce, or error messages received..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-white border-[#CBD5E1] text-xs sm:text-sm font-medium resize-none focus:border-[#E87545]"
                  disabled={submitting}
                  required
                />
              </div>

              {/* Optional Screenshot Upload */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#111827] flex items-center justify-between">
                  <span>Optional Screenshot Upload</span>
                  <span className="text-[11px] font-medium text-[#64748B]">PNG, JPG up to 5MB</span>
                </Label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  id="screenshot-upload"
                  disabled={submitting}
                />

                {screenshotUrl ? (
                  <div className="flex items-center justify-between p-2.5 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-lg overflow-hidden border border-[#E2E8F0] shrink-0 bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={screenshotUrl}
                          alt="Screenshot preview"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#111827] truncate">
                          {fileName || 'screenshot.png'}
                        </p>
                        <p className="text-[10px] text-[#087A45] font-semibold flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Image attached
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="p-1.5 rounded-lg text-[#64748B] hover:text-[#C62828] hover:bg-[#FEE2E2] transition-colors"
                      title="Remove image"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label
                    htmlFor="screenshot-upload"
                    className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-[#CBD5E1] bg-[#FAFAF7] hover:bg-[#F1EFE8] hover:border-[#E87545] cursor-pointer transition-colors"
                  >
                    <UploadCloud className="h-6 w-6 text-[#E87545] mb-1.5" />
                    <p className="text-xs font-bold text-[#111827]">
                      Click to upload screenshot
                    </p>
                    <p className="text-[11px] text-[#64748B]">
                      Attach an image to help our team diagnose the problem
                    </p>
                  </label>
                )}
              </div>

              {/* Form Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                  className="border-[#CBD5E1] text-[#111827] font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-[#E87545] hover:bg-[#D66434] text-white font-bold"
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Request
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
