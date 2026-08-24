import { api } from './client';
import type {
  Paginated,
  PaginationParams,
  PortalAccessStatus,
  Student,
  StudentDetail,
  StudentDocument,
  FeeSummaryData,
  Payment,
  PaymentReceipt,
} from '@/lib/types';

export interface CreateStudentInput {
  name: string;
  fullName?: string;
  email?: string;
  phone?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  dateOfBirth?: string;
  course?: string;
  year?: number;
  guardianName?: string;
  guardianRelation?: string;
  guardianPhone?: string;
  guardianAddress?: string;
  hostelId: string;
  branchId?: string;
  buildingName?: string;
  floorNumber?: number;
  roomId?: string;
  bedId?: string;
  dateOfAdmission?: string;
  feeTotal?: number;
  monthlyBedRent?: number;
  stayDurationMonths?: number;
  totalHostelFee?: number;
  paymentPlan?: 'ONE_TIME' | 'MONTHLY';
  monthlyDueDay?: number;
  firstPaymentMonth?: string;
  allowAdvancePayment?: boolean;
  admissionFee?: number;
  securityDeposit?: number;
  address?: string;
  emergencyContact?: string;
  parentName?: string;
  parentPhone?: string;
}

export interface UpdateStudentInput extends Partial<CreateStudentInput> {
  status?: Student['status'];
}

export const studentsApi = {
  list: (params?: PaginationParams & { branchId?: string; status?: string; portalAccess?: PortalAccessStatus }) =>
    api.get<Paginated<Student>>('/students', { query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined> }),

  getById: (id: string) => api.get<StudentDetail>(`/students/${id}`),

  create: (input: CreateStudentInput) => api.post<{ student: Student; customerCode: string; portalAccess: PortalAccessStatus }>('/students', input),

  update: (id: string, input: UpdateStudentInput) => api.put<Student>(`/students/${id}`, input),

  remove: (id: string) => api.delete<void>(`/students/${id}`),

  setPortalAccess: (id: string, status: PortalAccessStatus, temporaryPassword?: string) =>
    api.patch<{
      student: Student;
      portalAccess: PortalAccessStatus;
      studentId?: string;
      customerCode?: string;
      temporaryPassword?: string;
      defaultPassword?: string;
    }>(`/students/${id}/portal-access`, { status, temporaryPassword }),

  resetPassword: (id: string, temporaryPassword?: string) =>
    api.post<{
      success: boolean;
      message: string;
      studentId: string;
      customerCode: string;
      temporaryPassword: string;
    }>(`/students/${id}/reset-password`, { temporaryPassword }),

  getMyProfile: () => api.get<StudentDetail>('/student/profile'),

  updateMyProfile: (data: { phone?: string; email?: string; address?: string }) =>
    api.put<StudentDetail>('/student/profile', data),

  getMyRoom: () => api.get<{
    studentId: string;
    customerCode: string;
    studentName: string;
    hostelName: string;
    hostelId?: string;
    buildingName: string;
    floorNumber: number;
    roomId?: string;
    roomNumber: string;
    bedId?: string;
    bedNumber: string;
    bedStatus: string;
    monthlyRent: number;
    stayDurationMonths: number;
    totalHostelFee: number;
    allocatedAt?: string;
  }>('/student/room'),

  getMyFees: () => api.get<FeeSummaryData>('/student/fees'),

  initiatePayment: (data: {
    amount: number;
    installmentId?: string;
    paymentMethod?: string;
    idempotencyKey?: string;
  }) =>
    api.post<{
      paymentId: string;
      paymentNumber: string;
      gatewayOrderId: string;
      amount: number;
      currency: string;
      keyId: string;
      installmentMonth?: string;
      status: string;
    }>('/student/payments/initiate', data),

  verifyPayment: (data: {
    paymentId: string;
    gatewayOrderId: string;
    gatewayPaymentId: string;
    gatewaySignature: string;
  }) =>
    api.post<{
      payment: Payment;
      receipt: PaymentReceipt;
    }>('/student/payments/verify', data),

  cancelPayment: (paymentId: string, reason?: string) =>
    api.post<{ success: boolean }>(`/student/payments/${paymentId}/cancel`, { reason }),

  getReceipt: (paymentIdOrNumber: string) =>
    api.get<PaymentReceipt>(`/student/payments/${paymentIdOrNumber}/receipt`),

  payMyFee: (data: { amount: number; paymentMethod?: string; transactionRef?: string; installmentId?: string }) =>
    api.post<any>('/student/pay-fee', data),

  uploadDocument: (id: string, file: File, type: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', type);
    return api.post<StudentDocument>(`/students/${id}/documents`, fd);
  },

  listDocuments: (id: string) => api.get<StudentDocument[]>(`/students/${id}/documents`),

  removeDocument: (studentId: string, docId: string) =>
    api.delete<void>(`/students/${studentId}/documents/${docId}`),
};
