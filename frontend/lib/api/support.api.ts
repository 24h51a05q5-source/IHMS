import { api } from './client';
import type { SupportTicket, SupportTicketStatus, CreateSupportTicketDto, UpdateSupportTicketDto } from '@/lib/types';

export interface CreateSupportTicketResponse {
  success: boolean;
  message: string;
  ticket: SupportTicket;
}

export const supportApi = {
  createTicket: (data: CreateSupportTicketDto) =>
    api.post<CreateSupportTicketResponse>('/support/tickets', data),

  getMyTickets: () =>
    api.get<SupportTicket[]>('/support/tickets/my'),

  getAllTickets: (params?: { status?: string; category?: string; search?: string }) =>
    api.get<SupportTicket[]>('/support/tickets', {
      query: params as Record<string, string | number | boolean | undefined>,
    }),

  getTicketById: (id: string) =>
    api.get<SupportTicket>(`/support/tickets/${id}`),

  updateTicketStatus: (id: string, status: SupportTicketStatus, resolutionNotes?: string) =>
    api.patch<{ success: boolean; message: string; ticket: SupportTicket }>(`/support/tickets/${id}/status`, {
      status,
      resolutionNotes,
    }),
};
