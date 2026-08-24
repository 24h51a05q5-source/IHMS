import { api } from './client';
import type { MessMenu } from '@/lib/types';

export interface SaveMessMenuInput {
  branchId: string;
  status: 'DRAFT' | 'PUBLISHED';
  week: MessMenu['week'];
}

export const messApi = {
  getMenu: (branchId: string) => api.get<MessMenu>(`/mess/menu/${branchId}`),

  saveDraft: (input: SaveMessMenuInput) =>
    api.post<MessMenu>('/mess/menu', { ...input, status: 'DRAFT' }),

  publish: (input: SaveMessMenuInput) =>
    api.post<MessMenu>('/mess/menu', { ...input, status: 'PUBLISHED' }),

  update: (id: string, input: Partial<SaveMessMenuInput>) =>
    api.put<MessMenu>(`/mess/menu/${id}`, input),

  remove: (id: string) => api.delete<void>(`/mess/menu/${id}`),
};
