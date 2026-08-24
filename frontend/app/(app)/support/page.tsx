'use client';

import { useState, useEffect, useCallback } from 'react';
import { LifeBuoy, Plus, ShieldCheck, UserCheck, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { ContactUsModal } from '@/components/support/contact-us-modal';
import { TicketList } from '@/components/support/ticket-list';
import { supportApi } from '@/lib/api/support.api';
import { useAuth } from '@/lib/auth/auth-context';
import type { SupportTicket } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function SupportPage() {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'admin' | 'my'>('admin');
  
  const [allTickets, setAllTickets] = useState<SupportTicket[]>([]);
  const [myTickets, setMyTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdminOrStaff =
    user?.role &&
    ['PLATFORM_SUPER_ADMIN', 'ORGANIZATION_OWNER', 'REGIONAL_MANAGER', 'BRANCH_MANAGER', 'WARDEN', 'ACCOUNTANT', 'RECEPTIONIST'].includes(user.role);

  // Set default tab
  useEffect(() => {
    if (!isAdminOrStaff) {
      setActiveTab('my');
    }
  }, [isAdminOrStaff]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      if (isAdminOrStaff) {
        const [allRes, myRes] = await Promise.allSettled([
          supportApi.getAllTickets(),
          supportApi.getMyTickets(),
        ]);
        if (allRes.status === 'fulfilled') setAllTickets(allRes.value || []);
        if (myRes.status === 'fulfilled') setMyTickets(myRes.value || []);
      } else {
        const myRes = await supportApi.getMyTickets();
        setMyTickets(myRes || []);
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, [isAdminOrStaff]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleTicketSubmitted = (ticket: SupportTicket) => {
    setMyTickets((prev) => [ticket, ...prev]);
    setAllTickets((prev) => [ticket, ...prev]);
  };

  return (
    <div className="space-y-3.5 sm:space-y-5">
      {/* Page Header */}
      <PageHeader
        title="Help & Support Center"
        description="Contact IHMS ERP support team and manage submitted support requests."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              onClick={() => setModalOpen(true)}
              className="bg-[#E87545] hover:bg-[#D66434] text-white font-bold"
            >
              <Plus className="mr-2 h-4 w-4" /> Contact Us / Report Problem
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      {isAdminOrStaff && (
        <div className="flex border-b border-[#DDD8CC] gap-2">
          <button
            onClick={() => setActiveTab('admin')}
            className={cn(
              'flex items-center gap-2 pb-3 px-3 text-xs sm:text-sm font-bold transition-all relative',
              activeTab === 'admin'
                ? 'text-[#E87545] border-b-2 border-[#E87545]'
                : 'text-[#64748B] hover:text-[#111827]'
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            All Organization Tickets ({allTickets.length})
          </button>

          <button
            onClick={() => setActiveTab('my')}
            className={cn(
              'flex items-center gap-2 pb-3 px-3 text-xs sm:text-sm font-bold transition-all relative',
              activeTab === 'my'
                ? 'text-[#E87545] border-b-2 border-[#E87545]'
                : 'text-[#64748B] hover:text-[#111827]'
            )}
          >
            <UserCheck className="h-4 w-4" />
            My Submitted Tickets ({myTickets.length})
          </button>
        </div>
      )}

      {/* Content */}
      {activeTab === 'admin' && isAdminOrStaff ? (
        <TicketList
          tickets={allTickets}
          loading={loading}
          isAdminView={true}
          onRefresh={loadTickets}
          onTicketUpdated={(updated) => {
            setAllTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setMyTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          }}
        />
      ) : (
        <TicketList
          tickets={myTickets}
          loading={loading}
          isAdminView={false}
          onRefresh={loadTickets}
        />
      )}

      {/* Contact Us Modal */}
      <ContactUsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onTicketSubmitted={handleTicketSubmitted}
      />
    </div>
  );
}
