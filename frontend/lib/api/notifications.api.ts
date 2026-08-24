import { api } from './client';
import type { Announcement, Notification, Paginated, PaginationParams } from '@/lib/types';

export const notificationsApi = {
  list: (params?: PaginationParams) =>
    api.get<Paginated<Notification>>('/notifications', { query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined> }),

  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),

  markRead: (id: string) => api.patch<Notification>(`/notifications/${id}/read`),

  markAllRead: () => api.post<void>('/notifications/read-all'),

  announcements: (params?: PaginationParams) =>
    api.get<Paginated<Announcement>>('/announcements', { query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined> }),
};
