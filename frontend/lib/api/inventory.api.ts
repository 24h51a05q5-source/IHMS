import { api } from './client';
import type { Asset } from '@/lib/types';

export interface CreateAssetInput {
  branchId?: string;
  name: string;
  category: string;
  quantity?: number;
  cost?: number;
  condition?: string;
  roomLocation?: string;
  purchaseDate?: string;
}

export const inventoryApi = {
  list: (params?: { branchId?: string; category?: string }) =>
    api.get<Asset[]>('/inventory', { query: params as Record<string, string | undefined> }),

  create: (data: CreateAssetInput) =>
    api.post<Asset>('/inventory', data),

  updateStatus: (id: string, status: string) =>
    api.patch<Asset>(`/inventory/${id}/status`, { status }),

  remove: (id: string) =>
    api.delete<void>(`/inventory/${id}`),
};
