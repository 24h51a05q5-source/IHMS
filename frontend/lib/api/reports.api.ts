import { api } from './client';
import type { OwnerDashboardData, StudentDashboardData } from '@/lib/types';
import type { BranchInfo } from '@/lib/auth/auth-context';

export const reportsApi = {
  ownerDashboard: (branchId?: string) =>
    api.get<OwnerDashboardData>('/dashboard/owner', { query: { branchId } }),

  studentDashboard: (studentId?: string) =>
    api.get<StudentDashboardData>('/dashboard/student', { query: { studentId } }),

  branchList: () => api.get<BranchInfo[]>('/branches'),

  occupancyReport: (branchId?: string, from?: string, to?: string) =>
    api.get<{ date: string; occupancy: number }[]>('/reports/occupancy', { query: { branchId, from, to } }),

  collectionReport: (branchId?: string, from?: string, to?: string) =>
    api.get<{ month: string; collection: number; expenses: number }[]>('/reports/collection', { query: { branchId, from, to } }),
};
