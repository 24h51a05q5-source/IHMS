// ============================================================
// Mock auth — UI PREVIEW ONLY
// This module is isolated so Antigravity can delete src/mocks
// entirely and wire the real NestJS JWT auth with zero changes
// to components that consume useAuth().
// ============================================================

import type { AuthResponse, AuthUser, Role } from '@/lib/types';

const MOCK_USERS: (AuthUser & { password: string })[] = [
  {
    id: 'u-owner-1',
    name: 'Arjun Mehta',
    email: 'owner@ihms.dev',
    role: 'ORGANIZATION_OWNER',
    organizationId: 'org-1',
    hostelBranchId: 'br-hyd001',
    password: 'owner123',
  },
  {
    id: 'u-student-1',
    name: 'Rahul Kumar',
    email: 'student@ihms.dev',
    role: 'STUDENT',
    organizationId: 'org-1',
    hostelBranchId: 'br-hyd001',
    studentId: 'stu-000001',
    password: 'student123',
  },
  {
    id: 'u-admin-1',
    name: 'System Admin',
    email: 'admin@ihms.dev',
    role: 'PLATFORM_SUPER_ADMIN',
    password: 'admin123',
  },
  {
    id: 'u-mess-1',
    name: 'Mess Incharge',
    email: 'mess@ihms.dev',
    role: 'MESS_MANAGER',
    organizationId: 'org-1',
    hostelBranchId: 'br-hyd001',
    password: 'mess123',
  },
];

const MOCK_BRANCHES = [
  { id: 'br-hyd001', code: 'HYD001', name: 'Sunrise Hostel' },
  { id: 'br-hyd002', code: 'HYD002', name: 'Green Valley Elite Girls Hostel' },
  { id: 'br-hyd003', code: 'HYD003', name: 'City Hostel' },
];

export function isMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_AUTH === 'true';
}

export async function mockLogin(email: string, password: string): Promise<AuthResponse> {
  await delay(600);
  const user = MOCK_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  if (!user) throw { statusCode: 401, message: 'Invalid email or password.' };
  const { password: _pw, ...safe } = user;
  return { user: safe, accessToken: `mock-${safe.id}-${Date.now()}`, refreshToken: `mock-refresh-${safe.id}` };
}

export async function mockMe(token: string): Promise<AuthUser> {
  await delay(200);
  const id = token.replace('mock-', '').split('-')[0];
  const found = MOCK_USERS.find((u) => u.id === id);
  if (!found) throw { statusCode: 401, message: 'Session expired.' };
  const { password: _pw, ...safe } = found;
  return safe;
}

export const mockBranches = MOCK_BRANCHES;

export const mockRoles: Role[] = [
  'PLATFORM_SUPER_ADMIN',
  'ORGANIZATION_OWNER',
  'REGIONAL_MANAGER',
  'BRANCH_MANAGER',
  'WARDEN',
  'RECEPTIONIST',
  'ACCOUNTANT',
  'MESS_MANAGER',
  'INVENTORY_MANAGER',
  'SECURITY_GUARD',
  'MAINTENANCE_STAFF',
  'STUDENT',
  'PARENT',
];

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
