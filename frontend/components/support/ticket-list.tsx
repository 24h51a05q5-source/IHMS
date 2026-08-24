'use client';

import { useState } from 'react';
import {
  LifeBuoy,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Building2,
  User,
  Mail,
  Calendar,
  Image as ImageIcon,
  ChevronRight,
  Send,
  Loader2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supportApi } from '@/lib/api/support.api';
import { Badge } from '@/components/dashboard/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { SupportTicket, SupportTicketStatus } from '@/lib/types';
import { SUPPORT_CATEGORIES } from './contact-us-modal';

interface TicketListProps {
  tickets: SupportTicket[];
  loading: boolean;
  isAdminView?: boolean;
  onRefresh: () => void;
  onTicketUpdated?: (ticket: SupportTicket) => void;
}

export function TicketList({
  tickets,
  loading,
  isAdminView = false,
  onRefresh,
  onTicketUpdated,
}: TicketListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  // Status update state for admin modal
  const [newStatus, setNewStatus] = useState<SupportTicketStatus>('OPEN');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [fullImagePreview, setFullImagePreview] = useState<string | null>(null);

  const openTicketDetail = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setNewStatus(ticket.status);
    setResolutionNotes(ticket.resolutionNotes || '');
  };

  const handleUpdateStatus = async () => {
    if (!selectedTicket) return;
    setUpdating(true);
    try {
      const res = await supportApi.updateTicketStatus(
        selectedTicket.ticketNumber || selectedTicket.id,
        newStatus,
        resolutionNotes.trim() || undefined
      );

      const updated = res.ticket;
      toast.success(`Ticket status updated to ${newStatus}`);
      setSelectedTicket(updated);
      onTicketUpdated?.(updated);
      onRefresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update ticket status');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadgeVariant = (status: SupportTicketStatus): 'info' | 'warning' | 'success' | 'default' => {
    switch (status) {
      case 'OPEN':
        return 'info';
      case 'IN_PROGRESS':
        return 'warning';
      case 'RESOLVED':
        return 'success';
      case 'CLOSED':
        return 'default';
      default:
        return 'default';
    }
  };

  const filteredTickets = tickets.filter((t) => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const matchNumber = (t.ticketNumber || t.ticketId || '').toLowerCase().includes(q);
      const matchSubject = (t.subject || '').toLowerCase().includes(q);
      const matchUser = (t.userName || '').toLowerCase().includes(q);
      const matchEmail = (t.email || '').toLowerCase().includes(q);
      const matchDesc = (t.description || '').toLowerCase().includes(q);
      const matchCategory = (t.category || '').toLowerCase().includes(q);
      if (!matchNumber && !matchSubject && !matchUser && !matchEmail && !matchDesc && !matchCategory) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-white p-3.5 rounded-xl border border-[#CBD5E1]">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
          <Input
            placeholder="Search by ticket ID, subject, user or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-[#FAFAF7] border-[#CBD5E1] text-xs sm:text-sm font-semibold"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] bg-[#FAFAF7] border-[#CBD5E1] text-xs font-semibold">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-white border border-[#CBD5E1]">
              <SelectItem value="ALL" className="text-xs font-bold">All Statuses</SelectItem>
              <SelectItem value="OPEN" className="text-xs font-bold text-[#2563EB]">Open</SelectItem>
              <SelectItem value="IN_PROGRESS" className="text-xs font-bold text-[#C94F18]">In Progress</SelectItem>
              <SelectItem value="RESOLVED" className="text-xs font-bold text-[#087A45]">Resolved</SelectItem>
              <SelectItem value="CLOSED" className="text-xs font-bold text-[#64748B]">Closed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[170px] bg-[#FAFAF7] border-[#CBD5E1] text-xs font-semibold">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="bg-white border border-[#CBD5E1]">
              <SelectItem value="ALL" className="text-xs font-bold">All Categories</SelectItem>
              {SUPPORT_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat} className="text-xs font-semibold">
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="border-[#CBD5E1] text-xs font-bold bg-white"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Ticket Cards / List */}
      {loading && tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-[#CBD5E1]">
          <Loader2 className="h-8 w-8 animate-spin text-[#E87545] mb-2" />
          <p className="text-xs font-bold text-[#64748B]">Loading support tickets...</p>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-[#CBD5E1] text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FAFAF7] border border-[#E4E0D7] text-[#64748B]">
            <LifeBuoy className="h-6 w-6" />
          </div>
          <p className="text-sm font-bold text-[#111827]">No Support Tickets Found</p>
          <p className="text-xs text-[#64748B] max-w-sm">
            {search || statusFilter !== 'ALL' || categoryFilter !== 'ALL'
              ? 'No tickets matched your current search or filter criteria.'
              : 'There are no support tickets submitted yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredTickets.map((ticket) => {
            const variant = getStatusBadgeVariant(ticket.status);
            const dateStr = ticket.createdAt
              ? new Date(ticket.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—';

            return (
              <div
                key={ticket.id || ticket.ticketNumber}
                onClick={() => openTicketDetail(ticket)}
                className="group relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-[#CBD5E1] hover:border-[#E87545] cursor-pointer transition-colors duration-150"
              >
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FAFAF7] border border-[#CBD5E1] text-[#E87545] group-hover:bg-[#E87545] group-hover:text-white transition-colors">
                    <LifeBuoy className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-black text-[#E87545] bg-[#FFF7ED] px-2 py-0.5 rounded-md border border-[#FFEDD5]">
                        {ticket.ticketNumber || ticket.ticketId}
                      </span>
                      <span className="text-xs font-bold text-[#475569] bg-[#FAFAF7] px-2 py-0.5 rounded-md border border-[#E4E0D7]">
                        {ticket.category}
                      </span>
                      <Badge variant={variant}>{ticket.status.replace('_', ' ')}</Badge>
                    </div>

                    <h4 className="text-sm font-bold text-[#111827] truncate group-hover:text-[#E87545] transition-colors">
                      {ticket.subject}
                    </h4>

                    <p className="text-xs text-[#64748B] line-clamp-1">
                      {ticket.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-[#64748B] pt-0.5">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3 text-[#94A3B8]" />
                        <strong className="text-[#334155]">{ticket.userName}</strong> ({ticket.userRole})
                      </span>
                      {ticket.hostelName && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-[#94A3B8]" />
                          {ticket.hostelName}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-[#94A3B8]" />
                        {dateStr}
                      </span>
                      {ticket.screenshotUrl && (
                        <span className="flex items-center gap-1 text-[#2563EB] font-bold">
                          <ImageIcon className="h-3 w-3" /> Screenshot
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <span className="text-xs font-bold text-[#E87545] flex items-center gap-0.5 group-hover:translate-x-1 transition-transform">
                    View Details <ChevronRight className="h-4 w-4" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ticket Details & Resolution Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/40 animate-in fade-in duration-200">
          <div
            className="relative w-full max-w-2xl rounded-xl bg-white border border-[#CBD5E1] overflow-hidden my-auto max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-[#ECE9E1] border-b border-[#DDD8CC] shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E87545] text-white">
                  <LifeBuoy className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black text-[#E87545]">
                      {selectedTicket.ticketNumber || selectedTicket.ticketId}
                    </span>
                    <Badge variant={getStatusBadgeVariant(selectedTicket.status)}>
                      {selectedTicket.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <h3 className="text-sm font-bold text-[#111827] truncate max-w-md">
                    {selectedTicket.subject}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-[#CBD5E1] text-[#475569] hover:bg-[#FEE2E2] hover:text-[#C62828] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs sm:text-sm">
              {/* User Metadata Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-[#FAFAF7] border border-[#CBD5E1] text-xs">
                <div>
                  <span className="text-[11px] font-semibold text-[#64748B] uppercase">Submitted By</span>
                  <p className="font-bold text-[#111827] truncate">{selectedTicket.userName}</p>
                  <p className="text-[10px] text-[#64748B]">{selectedTicket.userRole}</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-[#64748B] uppercase">Email / Contact</span>
                  <p className="font-bold text-[#111827] truncate">{selectedTicket.email || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-[#64748B] uppercase">Hostel / Org</span>
                  <p className="font-bold text-[#111827] truncate">{selectedTicket.hostelName || 'Hostel'}</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-[#64748B] uppercase">Submitted On</span>
                  <p className="font-bold text-[#111827] truncate">
                    {selectedTicket.createdAt
                      ? new Date(selectedTicket.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Description Box */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                  Problem Description
                </h4>
                <div className="p-3.5 rounded-xl bg-[#FAFAF7] border border-[#CBD5E1] text-[#334155] whitespace-pre-wrap leading-relaxed">
                  {selectedTicket.description}
                </div>
              </div>

              {/* Attached Screenshot */}
              {selectedTicket.screenshotUrl && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5 text-[#2563EB]" /> Attached Screenshot
                  </h4>
                  <div className="relative rounded-xl border border-[#CBD5E1] overflow-hidden bg-black/5 p-2 flex justify-center">
                    <img
                      src={selectedTicket.screenshotUrl}
                      alt="Support Issue Screenshot"
                      className="max-h-60 rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => window.open(selectedTicket.screenshotUrl, '_blank')}
                    />
                  </div>
                </div>
              )}

              {/* Admin Resolution Section */}
              {isAdminView && (
                <div className="pt-3 border-t border-[#CBD5E1] space-y-3.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#111827]">
                    Admin Ticket Resolution
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-[#334155]">Change Status</Label>
                      <Select value={newStatus} onValueChange={(v) => setNewStatus(v as SupportTicketStatus)}>
                        <SelectTrigger className="bg-white border-[#CBD5E1] text-xs font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-[#CBD5E1]">
                          <SelectItem value="OPEN" className="text-xs font-bold text-[#2563EB]">Open</SelectItem>
                          <SelectItem value="IN_PROGRESS" className="text-xs font-bold text-[#C94F18]">In Progress</SelectItem>
                          <SelectItem value="RESOLVED" className="text-xs font-bold text-[#087A45]">Resolved</SelectItem>
                          <SelectItem value="CLOSED" className="text-xs font-bold text-[#475569]">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-[#334155]">
                      Resolution Notes / Response to User
                    </Label>
                    <Textarea
                      rows={3}
                      placeholder="Add comments or instructions on how this issue was resolved..."
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      className="bg-white border-[#CBD5E1] text-xs font-medium resize-none"
                      disabled={updating}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={handleUpdateStatus}
                      disabled={updating}
                      className="bg-[#E87545] hover:bg-[#D66434] text-white font-bold"
                    >
                      {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Status Update
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-[#FAFAF7] border-t border-[#DDD8CC] flex justify-end shrink-0">
              <Button
                variant="outline"
                onClick={() => setSelectedTicket(null)}
                className="border-[#CBD5E1] text-[#111827] font-bold text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Full Image Preview Modal */}
      {fullImagePreview && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/90 animate-in fade-in"
          onClick={() => setFullImagePreview(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setFullImagePreview(null)}
              className="absolute -top-10 right-0 text-white font-bold hover:text-[#E87545]"
            >
              <X className="h-6 w-6" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fullImagePreview}
              alt="Screenshot full view"
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
