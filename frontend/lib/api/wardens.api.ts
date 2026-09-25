import { api } from './client';

export interface WardenRecord {
  id: string;
  wardenId: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  organizationId: string;
  hostelId: string;
  hostelName?: string;
  branchName?: string;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | string;
  accessGiven: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface CreateWardenPayload {
  name: string;
  email: string;
  phone?: string;
  hostelId: string;
}

export const wardensApi = {
  list: () =>
    api.get<{ success: boolean; data: WardenRecord[]; count: number }>('/owner/wardens'),

  create: (payload: CreateWardenPayload) =>
    api.post<{ success: boolean; data: WardenRecord; message: string }>('/owner/wardens', payload),

  giveAccess: (wardenId: string) =>
    api.post<{ success: boolean; message: string }>(`/owner/wardens/${wardenId}/give-access`),

  resendInvite: (wardenId: string) =>
    api.post<{ success: boolean; message: string }>(`/owner/wardens/${wardenId}/resend-invite`),

  suspend: (wardenId: string) =>
    api.post<{ success: boolean; message: string }>(`/owner/wardens/${wardenId}/suspend`),

  reactivate: (wardenId: string) =>
    api.post<{ success: boolean; message: string }>(`/owner/wardens/${wardenId}/reactivate`),

  remove: (wardenId: string) =>
    api.delete<{ success: boolean; message: string }>(`/owner/wardens/${wardenId}`),
};
