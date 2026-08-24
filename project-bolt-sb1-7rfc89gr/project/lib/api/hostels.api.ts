import { api } from './client';
import type { Hostel } from '@/lib/types';

export const hostelsApi = {
  list: () => api.get<Hostel[]>('/hostels'),

  getById: (id: string) => api.get<Hostel>(`/hostels/${id}`),

  create: (input: Partial<Hostel>) => api.post<Hostel>('/hostels', input),

  update: (id: string, input: Partial<Hostel>) => api.put<Hostel>(`/hostels/${id}`, input),

  remove: (id: string) => api.delete<void>(`/hostels/${id}`),
};
