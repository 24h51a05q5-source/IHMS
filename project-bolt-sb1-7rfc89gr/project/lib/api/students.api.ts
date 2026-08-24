import { api } from './client';
import type { Paginated, PaginationParams, PortalAccessStatus, Student, StudentDetail, StudentDocument } from '@/lib/types';

export interface CreateStudentInput {
  name: string;
  email?: string;
  phone?: string;
  guardianName?: string;
  guardianPhone?: string;
  hostelId: string;
  roomId?: string;
  bedId?: string;
  course?: string;
  year?: number;
  dateOfAdmission?: string;
  feeTotal?: number;
  address?: string;
  bloodGroup?: string;
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

  setPortalAccess: (id: string, status: PortalAccessStatus) =>
    api.patch<{ student: Student; portalAccess: PortalAccessStatus }>(`/students/${id}/portal-access`, { status }),

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
