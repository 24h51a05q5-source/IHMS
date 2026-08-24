import { api } from './client';
import type { Paginated, PaginationParams, Visitor } from '@/lib/types';

export interface CreateVisitorInput {
  studentId?: string;
  visitorName: string;
  relation?: string;
  phone?: string;
  purpose: string;
}

export const visitorsApi = {
  list: (params?: PaginationParams & { studentId?: string; status?: Visitor['status'] }) =>
    api.get<Paginated<Visitor>>('/visitors', { query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined> }),

  checkIn: (input: CreateVisitorInput) => api.post<Visitor>('/visitors/check-in', input),

  checkOut: (id: string) => api.patch<Visitor>(`/visitors/${id}/check-out`),
};
