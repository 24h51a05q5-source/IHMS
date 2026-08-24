import { api } from './client';
import type {
  Announcement,
  CreateAnnouncementPayload,
  UpdateAnnouncementPayload,
  Paginated,
  PaginationParams,
} from '@/lib/types';

export const announcementsApi = {
  list: (params?: PaginationParams & { branchId?: string; status?: string }) =>
    api.get<Paginated<Announcement>>('/announcements', {
      query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined>,
    }),

  getById: (id: string) => api.get<Announcement>(`/announcements/${id}`),

  create: (payload: CreateAnnouncementPayload) =>
    api.post<Announcement>('/announcements', payload),

  update: (id: string, payload: UpdateAnnouncementPayload) =>
    api.patch<Announcement>(`/announcements/${id}`, payload),

  toggleStatus: (id: string) =>
    api.patch<{ id: string; status: 'ACTIVE' | 'INACTIVE' }>(`/announcements/${id}/toggle`, {}),

  remove: (id: string) => api.delete<{ success: boolean }>(`/announcements/${id}`),

  // Student endpoints
  studentList: () => api.get<Announcement[]>('/announcements/student'),

  studentUnreadCount: () =>
    api.get<{ count: number }>('/announcements/student/unread-count'),

  uploadImage: (image: string, fileName?: string) =>
    api.post<{ url: string; imageUrl: string; attachmentUrl: string }>('/announcements/upload', {
      image,
      fileName,
    }),

  markRead: (id: string) =>
    api.post<{ success: boolean }>(`/announcements/${id}/read`, {}),
};
