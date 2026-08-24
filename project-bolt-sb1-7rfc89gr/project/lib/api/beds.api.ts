import { api } from './client';
import type { Bed, Paginated, PaginationParams } from '@/lib/types';

export interface CreateBedInput {
  number: string;
  roomId: string;
}

export const bedsApi = {
  list: (params?: PaginationParams & { roomId?: string; status?: Bed['status'] }) =>
    api.get<Paginated<Bed>>('/beds', { query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined> }),

  getById: (id: string) => api.get<Bed>(`/beds/${id}`),

  create: (input: CreateBedInput) => api.post<Bed>('/beds', input),

  update: (id: string, input: Partial<CreateBedInput> & { status?: Bed['status'] }) =>
    api.put<Bed>(`/beds/${id}`, input),

  remove: (id: string) => api.delete<void>(`/beds/${id}`),

  assignStudent: (id: string, studentId: string) =>
    api.patch<Bed>(`/beds/${id}/assign`, { studentId }),

  vacate: (id: string) => api.patch<Bed>(`/beds/${id}/vacate`),
};
