import { apiRequest } from './api';

export interface StudentFeeSummary {
  totalFee: number;
  totalPaid: number;
  balanceAmount: number;
  monthlyAmount: number;
  feeStatus: string;
  demands: Array<{
    id: string;
    demandNumber: string;
    termName: string;
    totalAmount: number;
    paidAmount: number;
    balanceAmount: number;
    status: string;
    dueDate: string;
  }>;
  payments: Array<{
    id: string;
    paymentNumber: string;
    amount: number;
    paymentMethod: string;
    status: string;
    receiptNumber: string;
    createdAt: string;
  }>;
}

export interface StudentComplaint {
  id: string;
  title: string;
  category: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  resolutionNotes?: string;
  createdAt: string;
}

export interface MessMenuDay {
  dayOfWeek: string;
  breakfast: string;
  lunch: string;
  snacks: string;
  dinner: string;
  specialMenu?: string;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  message: string;
  priority: string;
  createdAt: string;
  authorName?: string;
}

export const studentService = {
  async getProfile() {
    const res = await apiRequest('/student/profile');
    return res.data;
  },

  async getRoomDetails() {
    const res = await apiRequest('/student/room');
    return res.data;
  },

  async getFeeSummary(): Promise<StudentFeeSummary> {
    const res = await apiRequest('/student/fees');
    return res.data;
  },

  async initiatePayment(data: { amount: number; paymentMethod?: string; idempotencyKey?: string }) {
    const res = await apiRequest('/student/payments/initiate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async verifyPayment(data: {
    paymentId: string;
    gatewayOrderId: string;
    gatewayPaymentId: string;
    gatewaySignature: string;
  }) {
    const res = await apiRequest('/student/payments/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async getReceipt(paymentId: string) {
    const res = await apiRequest(`/student/payments/${paymentId}/receipt`);
    return res.data;
  },

  async listComplaints(): Promise<StudentComplaint[]> {
    const res = await apiRequest('/student/complaints');
    return Array.isArray(res.data) ? res.data : [];
  },

  async createComplaint(data: { category: string; title: string; description: string; priority?: string }) {
    const res = await apiRequest('/student/complaints', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async getMessMenu(): Promise<{ weekStartDate?: string; days: MessMenuDay[] }> {
    const res = await apiRequest('/student/mess');
    return res.data;
  },

  async listAnnouncements(): Promise<AnnouncementItem[]> {
    const res = await apiRequest('/student/announcements');
    return Array.isArray(res.data) ? res.data : [];
  },

  async listNotifications() {
    const res = await apiRequest('/notifications');
    return res.data;
  },
};
