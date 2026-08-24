'use client';

import { useState, useEffect, useCallback } from 'react';
import { LifeBuoy, Plus } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { ContactUsModal } from '@/components/support/contact-us-modal';
import { TicketList } from '@/components/support/ticket-list';
import { supportApi } from '@/lib/api/support.api';
import type { SupportTicket } from '@/lib/types';

export default function StudentSupportPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await supportApi.getMyTickets();
      setTickets(res || []);
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleTicketSubmitted = (ticket: SupportTicket) => {
    setTickets((prev) => [ticket, ...prev]);
  };

  return (
    <div className="space-y-3.5 sm:space-y-5">
      {/* Page Header */}
      <PageHeader
        title="Contact Us & Support"
        description="Have a problem with login, OTP, fees, or your account? Report an issue below and track the status of your tickets."
        actions={
          <Button
            onClick={() => setModalOpen(true)}
            className="bg-[#E87545] hover:bg-[#D66434] text-white font-bold"
          >
            <Plus className="mr-2 h-4 w-4" /> Contact Us / New Request
          </Button>
        }
      />

      {/* Ticket List */}
      <TicketList
        tickets={tickets}
        loading={loading}
        isAdminView={false}
        onRefresh={loadTickets}
      />

      {/* Contact Us Modal */}
      <ContactUsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onTicketSubmitted={handleTicketSubmitted}
      />
    </div>
  );
}
