import type { Role } from '@/lib/types';

export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide icon name
  roles: Role[] | 'ALL';
  badge?: 'complaints' | 'approvals' | 'notifications';
}

export const OWNER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'REGIONAL_MANAGER', 'BRANCH_MANAGER'] },
  { label: 'Hostels', href: '/hostels', icon: 'Building2', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'REGIONAL_MANAGER'] },
  { label: 'Students', href: '/students', icon: 'Users', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'REGIONAL_MANAGER', 'BRANCH_MANAGER', 'WARDEN', 'RECEPTIONIST'] },
  { label: 'Rooms & Beds', href: '/rooms', icon: 'BedDouble', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'BRANCH_MANAGER', 'WARDEN'] },
  { label: 'Fees', href: '/fees', icon: 'IndianRupee', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'] },
  { label: 'Finance', href: '/finance', icon: 'Wallet', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'ACCOUNTANT'] },
  { label: 'Mess', href: '/mess', icon: 'Utensils', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'MESS_MANAGER'] },
  { label: 'Inventory', href: '/inventory', icon: 'Boxes', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'INVENTORY_MANAGER'] },
  { label: 'Attendance', href: '/attendance', icon: 'CalendarCheck', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'BRANCH_MANAGER', 'WARDEN'] },
  { label: 'Visitors', href: '/visitors', icon: 'UserCheck', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'BRANCH_MANAGER', 'RECEPTIONIST', 'SECURITY_GUARD'] },
  { label: 'Complaints', href: '/complaints', icon: 'MessageSquareWarning', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'BRANCH_MANAGER', 'WARDEN', 'MAINTENANCE_STAFF'], badge: 'complaints' },
  { label: 'Reports', href: '/reports', icon: 'BarChart3', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'ACCOUNTANT'] },
  { label: 'Notifications', href: '/notifications', icon: 'Bell', roles: 'ALL', badge: 'notifications' },
  { label: 'Settings', href: '/settings', icon: 'Settings', roles: 'ALL' },
];

export const STUDENT_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/student', icon: 'LayoutDashboard', roles: ['STUDENT'] },
  { label: 'My Profile', href: '/student/profile', icon: 'User', roles: ['STUDENT'] },
  { label: 'My Fees', href: '/student/fees', icon: 'IndianRupee', roles: ['STUDENT'] },
  { label: 'Payments', href: '/student/payments', icon: 'CreditCard', roles: ['STUDENT'] },
  { label: 'Attendance', href: '/student/attendance', icon: 'CalendarCheck', roles: ['STUDENT'] },
  { label: 'Leave', href: '/student/leave', icon: 'CalendarOff', roles: ['STUDENT'] },
  { label: 'Mess Menu', href: '/student/mess', icon: 'Utensils', roles: ['STUDENT'] },
  { label: 'Complaints', href: '/student/complaints', icon: 'MessageSquareWarning', roles: ['STUDENT'] },
  { label: 'Notifications', href: '/student/notifications', icon: 'Bell', roles: ['STUDENT'] },
];

export const PARENT_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/parent', icon: 'LayoutDashboard', roles: ['PARENT'] },
  { label: 'Ward Profile', href: '/parent/profile', icon: 'User', roles: ['PARENT'] },
  { label: 'Fees', href: '/parent/fees', icon: 'IndianRupee', roles: ['PARENT'] },
  { label: 'Attendance', href: '/parent/attendance', icon: 'CalendarCheck', roles: ['PARENT'] },
  { label: 'Mess Menu', href: '/parent/mess', icon: 'Utensils', roles: ['PARENT'] },
  { label: 'Notifications', href: '/parent/notifications', icon: 'Bell', roles: ['PARENT'] },
];

export function getNavForRole(role: Role): NavItem[] {
  if (role === 'STUDENT') return STUDENT_NAV;
  if (role === 'PARENT') return PARENT_NAV;
  return OWNER_NAV.filter((n) => n.roles === 'ALL' || (n.roles as Role[]).includes(role));
}
