import { api } from './client';
import type { LeaveRequest, LeaveStatus, Paginated, PaginationParams } from '@/lib/types';

export interface CreateLeaveInput {
  studentId: string;
  fromDate: string;
  toDate: string;
  reason: string;
}

export const leaveApi = {
  list: (params?: PaginationParams & { studentId?: string; status?: LeaveStatus }) =>
    api.get<Paginated<LeaveRequest>>('/leave', { query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined> }),

  getByStudent: (studentId: string) => api.get<LeaveRequest[]>(`/leave/student/${studentId}`),

  create: (input: CreateLeaveInput) => api.post<LeaveRequest>('/leave', input),

  updateStatus: (id: string, status: LeaveStatus, remarks?: string) =>
    api.patch<LeaveRequest>(`/leave/${id}/status`, { status, remarks }),

  cancel: (id: string) => api.patch<LeaveRequest>(`/leave/${id}/cancel`),
};
