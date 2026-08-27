import { api } from './client';
import type { Fee, Paginated, PaginationParams } from '@/lib/types';

export interface CreateFeeInput {
  studentId: string;
  total: number;
  dueDate?: string;
}

export const feesApi = {
  list: (params?: PaginationParams & { studentId?: string; status?: Fee['status'] }) =>
    api.get<Paginated<Fee>>('/fees', { query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined> }),

  getByStudent: (studentId: string) => api.get<any>(`/fees/student/${studentId}`),

  recordAdjustment: (studentId: string, data: { amount: number; reason: string }) =>
    api.post<any>(`/fees/student/${studentId}/adjustment`, data),

  updateSettings: (studentId: string, data: { monthlyDueDay?: number; allowAdvancePayment?: boolean; reminderTimingDays?: number[] }) =>
    api.patch<any>(`/fees/student/${studentId}/settings`, data),

  updatePlan: (studentId: string, data: any) =>
    api.post<any>(`/fees/student/${studentId}/plan`, data),

  processReminders: () =>
    api.post<{ upcomingSent: number; dueTodaySent: number; overdueSent: number; statusUpdated: number }>('/fees/reminders/process'),

  create: (input: CreateFeeInput) => api.post<Fee>('/fees', input),

  update: (id: string, input: Partial<CreateFeeInput>) => api.put<Fee>(`/fees/${id}`, input),

  remove: (id: string) => api.delete<void>(`/fees/${id}`),

  getPaymentSettings: () => api.get<any>('/fees/payment-settings'),

  updatePaymentSettings: (data: any) => api.put<any>('/fees/payment-settings', data),

  getLedger: (studentId?: string) => api.get<any[]>('/fees/ledger', { query: { studentId } }),

  refundPayment: (paymentId: string, data: { amount?: number; reason?: string }) =>
    api.post<any>(`/fees/payments/${paymentId}/refund`, data),

  getHostelPaymentConfig: (hostelId: string) =>
    api.get<any>(`/hostels/${hostelId}/payment-config`),

  updateHostelPaymentConfig: (hostelId: string, data: any) =>
    api.put<any>(`/hostels/${hostelId}/payment-config`, data),

  initiateHostelPaymentVerification: (hostelId: string, method: 'UPI' | 'BANK', data: any) =>
    api.post<any>(`/hostels/${hostelId}/payment-config/verify`, { method, ...data }),

  confirmAndActivateHostelPaymentConfig: (hostelId: string, method: 'UPI' | 'BANK') =>
    api.post<any>(`/hostels/${hostelId}/payment-config/confirm-activate`, { method }),

  cancelPendingHostelPaymentConfig: (hostelId: string, method: 'UPI' | 'BANK') =>
    api.post<any>(`/hostels/${hostelId}/payment-config/cancel-pending`, { method }),

  getPendingVerifications: (params?: { hostelId?: string; page?: number; pageSize?: number; search?: string }) =>
    api.get<any>('/fees/payments/pending-verifications', { query: params as Record<string, string | number | boolean | undefined> }),

  verifyPaymentSubmission: (paymentId: string) =>
    api.post<any>(`/fees/payments/${paymentId}/verify-submission`),

  rejectPaymentSubmission: (paymentId: string, reason: string) =>
    api.post<any>(`/fees/payments/${paymentId}/reject-submission`, { reason }),
};
