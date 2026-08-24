import { api } from './client';
import type { MessMenu, SaveMessMenuInput } from '@/lib/types';

export type { SaveMessMenuInput };

export const messApi = {
  getMenu: (branchId: string) => api.get<MessMenu>(`/mess/menu/${branchId}`),
  getCurrentWeek: (branchId: string) => api.get<MessMenu>(`/mess/menu/${branchId}`),
  studentMenu: () => api.get<MessMenu>('/mess/menu/student'),

  saveDraft: (input: SaveMessMenuInput) =>
    api.post<MessMenu>('/mess/menu', { ...input, status: 'DRAFT' }),

  publish: (input: SaveMessMenuInput) =>
    api.post<MessMenu>('/mess/menu', { ...input, status: 'PUBLISHED' }),

  update: (id: string, input: Partial<SaveMessMenuInput>) =>
    api.put<MessMenu>(`/mess/menu/${id}`, input),

  remove: (id: string) => api.delete<void>(`/mess/menu/${id}`),
};
