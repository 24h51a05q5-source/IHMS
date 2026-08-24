import { api } from './client';
import type { Payment, PaymentReceipt, Paginated, PaginationParams } from '@/lib/types';

export interface CreatePaymentInput {
  studentId: string;
  feeId?: string;
  installmentId?: string;
  amount: number;
  method?: Payment['method'];
  paymentMode?: string;
  feeType?: string;
  roomNumber?: string;
  bedNumber?: string;
  paymentDate?: string;
  notes?: string;
  remarks?: string;
  receivedBy?: string;
}

export interface PaymentInitResponse {
  paymentId: string;
  // Gateway-specific payload (Razorpay/Stripe order, etc.) filled by backend
  gateway?: string;
  gatewayOrder?: unknown;
  // If no gateway is required the backend may confirm immediately
  status?: Payment['status'];
  payment?: Payment;
  receipt?: PaymentReceipt;
}

export const paymentsApi = {
  list: (params?: PaginationParams & { studentId?: string; status?: Payment['status'] }) =>
    api.get<Paginated<Payment>>('/payments', { query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined> }),

  getByStudent: (studentId: string) => api.get<Payment[]>(`/payments/student/${studentId}`),

  create: (input: CreatePaymentInput) => api.post<PaymentInitResponse>('/payments/create', input),

  confirm: (paymentId: string, gatewayPayload?: unknown) =>
    api.post<{ payment: Payment; receipt: PaymentReceipt }>(`/payments/${paymentId}/confirm`, { gatewayPayload }),

  getReceipt: (paymentId: string) => api.get<PaymentReceipt>(`/payments/${paymentId}/receipt`),

  downloadReceipt: (paymentId: string) =>
    api.get<Blob>(`/payments/${paymentId}/receipt/pdf`, { headers: { Accept: 'application/pdf' } }),

  getReceiptPdfUrl: (paymentId: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:5000/api';
    return `${baseUrl}/payments/${paymentId}/receipt/pdf`;
  },
};
