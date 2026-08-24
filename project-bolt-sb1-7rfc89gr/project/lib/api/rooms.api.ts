import { api } from './client';
import type { Paginated, PaginationParams, Room } from '@/lib/types';

export interface CreateRoomInput {
  number: string;
  floor: number;
  capacity: number;
  hostelId: string;
  type?: string;
}

export const roomsApi = {
  list: (params?: PaginationParams & { hostelId?: string }) =>
    api.get<Paginated<Room>>('/rooms', { query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined> }),

  getById: (id: string) => api.get<Room>(`/rooms/${id}`),

  create: (input: CreateRoomInput) => api.post<Room>('/rooms', input),

  update: (id: string, input: Partial<CreateRoomInput>) => api.put<Room>(`/rooms/${id}`, input),

  remove: (id: string) => api.delete<void>(`/rooms/${id}`),
};
