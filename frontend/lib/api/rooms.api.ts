import { api } from './client';
import type { Bed, Paginated, PaginationParams, Room } from '@/lib/types';

export interface CreateRoomInput {
  number?: string;
  roomNumber?: string;
  floor?: number;
  floorNumber?: number;
  buildingName?: string;
  blockName?: string;
  capacity?: number;
  totalBeds?: number;
  hostelId?: string;
  branchId?: string;
  type?: string;
  roomType?: string;
  monthlyRentPerBed?: number;
  monthlyRate?: number;
  status?: 'ACTIVE' | 'MAINTENANCE';
  amenities?: string[];
}

export const roomsApi = {
  list: (params?: PaginationParams & { hostelId?: string; branchId?: string }) =>
    api.get<Paginated<Room>>('/rooms', { query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined> }),

  getById: (id: string) => api.get<Room>(`/rooms/${id}`),

  create: (input: CreateRoomInput) => api.post<Room>('/rooms', input),

  update: (id: string, input: Partial<CreateRoomInput>) => api.put<Room>(`/rooms/${id}`, input),

  remove: (id: string) => api.delete<{ success: boolean; message: string }>(`/rooms/${id}`),

  getBeds: (roomId: string, status?: string) =>
    api.get<Bed[]>(`/rooms/${roomId}/beds`, { query: { status } }),

  addBed: (roomId: string, input?: { monthlyRate?: number; status?: string }) =>
    api.post<{ bed: Bed; room: Room }>(`/rooms/${roomId}/beds`, input || {}),
};

