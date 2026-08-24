import { api } from './client';
import type { Complaint, ComplaintPriority, ComplaintStatus, Paginated, PaginationParams } from '@/lib/types';

export interface CreateComplaintInput {
  studentId?: string;
  title: string;
  description: string;
  category?: string;
  priority?: ComplaintPriority;
}

export const complaintsApi = {
  list: (params?: PaginationParams & { studentId?: string; status?: ComplaintStatus; priority?: ComplaintPriority }) =>
    api.get<Paginated<Complaint>>('/complaints', { query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined> }),

  getByStudent: (studentId: string) => api.get<Complaint[]>(`/complaints/student/${studentId}`),

  create: (input: CreateComplaintInput) => api.post<Complaint>('/complaints', input),

  updateStatus: (id: string, status: ComplaintStatus, remarks?: string) =>
    api.patch<Complaint>(`/complaints/${id}/status`, { status, remarks }),

  remove: (id: string) => api.delete<void>(`/complaints/${id}`),
};
