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

export interface CreateDynamicUpiQrInput {
  studentId?: string;
  amount: number;
  installmentId?: string;
}

export interface DynamicUpiQrResponse {
  orderId: string;
  paymentId: string;
  paymentNumber: string;
  amount: number;
  baseAmount?: number;
  convenienceFee?: number;
  currency: string;
  vendorId: string;
  feeBearer: 'customer';
  upiIntentUrl: string;
  upiId?: string;
  qrDataUrl: string;
  expiresAt: string;
  expiresInSeconds: number;
  hostelName: string;
  platformMicroFee?: number;
  paymentSessionId?: string;
  splits?: Array<{
    vendor_id?: string;
    vendorId?: string;
    amount: number;
    recipient?: string;
    percentage?: number;
  }>;
  upiAppLinks?: {
    generic: string;
    gpay: string;
    phonepe: string;
    paytm: string;
  };
  student?: {
    id: string;
    customerCode: string;
    name: string;
  };
}

export interface OrderStatusResponse {
  orderId: string;
  paymentId: string;
  paymentNumber: string;
  status: 'PAID' | 'SUCCESS' | 'PENDING' | 'EXPIRED' | 'FAILED';
  amount: number;
  currency: string;
  receiptNumber?: string | null;
  utr?: string | null;
  expiresAt?: string;
}

export const paymentsApi = {
  create: (data: CreatePaymentInput) => api.post<PaymentInitResponse>('/payments', data),

  list: (params?: PaginationParams & { studentId?: string; status?: Payment['status'] }) =>
    api.get<Paginated<Payment>>('/payments', { query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined> }),

  getByStudent: (studentId: string) => api.get<Payment[]>(`/payments/student/${studentId}`),

  // Phase 2: Create Dynamic Cashfree UPI QR (Customer Fee Bearer Model)
  createUpiQrOrder: (input: CreateDynamicUpiQrInput) =>
    api.post<DynamicUpiQrResponse>('/orders/create-upi-qr', input),

  // Phase 3: Silent Polling Endpoint for instant payment confirmation
  getOrderStatus: (orderId: string) =>
    api.get<OrderStatusResponse>('/orders/status', { query: { order_id: orderId } }),

  // Phase 1: Cashfree Sub-Merchant Hosted Onboarding Link & Status
  getHostelOnboardingLink: (hostelId: string) =>
    api.post<{ vendorId: string; onboardingUrl: string; status: string }>(`/fees/hostels/${hostelId}/cashfree-onboarding-link`),

  getHostelOnboardingStatus: (hostelId: string) =>
    api.get<{ vendorId: string; status: string; bankStatus: string; kycStatus: string; onboardingUrl?: string }>(`/fees/hostels/${hostelId}/cashfree-status`),

  getReceipt: (paymentId: string) => api.get<PaymentReceipt>(`/payments/${paymentId}/receipt`),

  downloadReceipt: (paymentId: string) =>
    api.get<Blob>(`/payments/${paymentId}/receipt/pdf`, { headers: { Accept: 'application/pdf' } }),

  getReceiptPdfUrl: (paymentId: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:5000/api';
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('ihms_access_token') : null;
    return `${baseUrl}/payments/${paymentId}/receipt/pdf${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },
};
