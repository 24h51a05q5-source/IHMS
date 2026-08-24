import { apiRequest } from './api';

export const ownerService = {
  async getDashboardStats() {
    const res = await apiRequest('/dashboard/stats');
    return res.data;
  },

  async listStudents(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await apiRequest(`/students${query}`);
    return Array.isArray(res.data) ? res.data : (res.data?.students || []);
  },

  async recordCashPayment(data: {
    studentId: string;
    amount: number;
    notes?: string;
    receivedBy?: string;
  }) {
    const res = await apiRequest('/fees/payments/create', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        paymentMode: 'CASH',
      }),
    });
    return res.data;
  },

  async listComplaints(status?: string) {
    const query = status ? `?status=${status}` : '';
    const res = await apiRequest(`/complaints${query}`);
    return Array.isArray(res.data) ? res.data : [];
  },

  async resolveComplaint(complaintId: string, status: string, notes?: string) {
    const res = await apiRequest(`/complaints/${complaintId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, resolutionNotes: notes }),
    });
    return res.data;
  },

  async createAnnouncement(data: { title: string; message: string; priority?: string; targetAudience?: string }) {
    const res = await apiRequest('/announcements', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        targetAudience: data.targetAudience || 'ALL_STUDENTS',
      }),
    });
    return res.data;
  },

  async getFinanceSummary() {
    const res = await apiRequest('/finance/profit-and-loss');
    return res.data;
  },
};
