import { api } from './client';
import type { Fee, Paginated, PaginationParams } from '@/lib/types';

export interface CreateFeeInput {
  studentId: string;
  total: number;
  dueDate?: string;
}

export const feesApi = {
  list: (params?: PaginationParams & { studentId?: string; status?: Fee['status'] }) =>
    api.get<Paginated<Fee>>('/fees', { query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined> }),

  getByStudent: (studentId: string) => api.get<Fee>(`/fees/student/${studentId}`),

  create: (input: CreateFeeInput) => api.post<Fee>('/fees', input),

  update: (id: string, input: Partial<CreateFeeInput>) => api.put<Fee>(`/fees/${id}`, input),

  remove: (id: string) => api.delete<void>(`/fees/${id}`),
};
