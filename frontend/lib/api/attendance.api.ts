import { api } from './client';
import type { AttendanceRecord, Paginated, PaginationParams } from '@/lib/types';

export const attendanceApi = {
  list: (params?: PaginationParams & { studentId?: string; date?: string; status?: AttendanceRecord['status'] }) =>
    api.get<Paginated<AttendanceRecord>>('/attendance', { query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined> }),

  getByStudent: (studentId: string, params?: PaginationParams) =>
    api.get<Paginated<AttendanceRecord>>(`/attendance/student/${studentId}`, { query: params as Record<string, unknown> as Record<string, string | number | boolean | undefined> }),

  mark: (input: { studentId: string; date: string; status: AttendanceRecord['status']; checkInTime?: string; checkOutTime?: string }) =>
    api.post<AttendanceRecord>('/attendance', input),
};
