import type { Role } from '@/lib/types';

export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide icon name
  roles: Role[] | 'ALL';
  section?: string;
  badge?: 'complaints' | 'approvals' | 'notifications';
}

export const OWNER_NAV: NavItem[] = [
  { section: 'MAIN', label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'REGIONAL_MANAGER', 'BRANCH_MANAGER'] },
  
  { section: 'HOSTEL MANAGEMENT', label: 'Hostels', href: '/hostels', icon: 'Building2', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'REGIONAL_MANAGER'] },
  { section: 'HOSTEL MANAGEMENT', label: 'Students', href: '/students', icon: 'Users', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'REGIONAL_MANAGER', 'BRANCH_MANAGER', 'WARDEN', 'RECEPTIONIST'] },
  { section: 'HOSTEL MANAGEMENT', label: 'Rooms & Beds', href: '/rooms', icon: 'BedDouble', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'BRANCH_MANAGER', 'WARDEN'] },
  { section: 'HOSTEL MANAGEMENT', label: 'Attendance', href: '/attendance', icon: 'CalendarCheck', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'BRANCH_MANAGER', 'WARDEN'] },
  { section: 'HOSTEL MANAGEMENT', label: 'Visitors', href: '/visitors', icon: 'UserCheck', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'BRANCH_MANAGER', 'RECEPTIONIST', 'SECURITY_GUARD'] },

  { section: 'FINANCE', label: 'Fees', href: '/fees', icon: 'IndianRupee', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'] },
  { section: 'FINANCE', label: 'Finance', href: '/finance', icon: 'Wallet', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'ACCOUNTANT'] },
  { section: 'FINANCE', label: 'Reports', href: '/reports', icon: 'BarChart3', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'ACCOUNTANT'] },

  { section: 'OPERATIONS', label: 'Mess', href: '/mess', icon: 'Utensils', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'MESS_MANAGER'] },
  { section: 'OPERATIONS', label: 'Inventory', href: '/inventory', icon: 'Boxes', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'INVENTORY_MANAGER'] },
  { section: 'OPERATIONS', label: 'Complaints', href: '/complaints', icon: 'MessageSquareWarning', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'BRANCH_MANAGER', 'WARDEN', 'MAINTENANCE_STAFF'], badge: 'complaints' },
  { section: 'OPERATIONS', label: 'Announcements', href: '/announcements', icon: 'Megaphone', roles: ['ORGANIZATION_OWNER', 'PLATFORM_SUPER_ADMIN', 'REGIONAL_MANAGER', 'BRANCH_MANAGER', 'WARDEN'] },

  { section: 'SYSTEM', label: 'Notifications', href: '/notifications', icon: 'Bell', roles: 'ALL', badge: 'notifications' },
  { section: 'SYSTEM', label: 'Help & Support', href: '/support', icon: 'LifeBuoy', roles: 'ALL' },
  { section: 'SYSTEM', label: 'Terms & Conditions', href: '/terms', icon: 'FileText', roles: 'ALL' },
  { section: 'SYSTEM', label: 'Settings', href: '/settings', icon: 'Settings', roles: 'ALL' },
];

export const STUDENT_NAV: NavItem[] = [
  { section: 'MAIN', label: 'Dashboard', href: '/student', icon: 'LayoutDashboard', roles: ['STUDENT'] },
  { section: 'ACCOMMODATION', label: 'My Profile', href: '/student/profile', icon: 'User', roles: ['STUDENT'] },
  { section: 'ACCOMMODATION', label: 'My Room & Bed', href: '/student/room', icon: 'BedDouble', roles: ['STUDENT'] },
  { section: 'ACCOMMODATION', label: 'My Fees', href: '/student/fees', icon: 'IndianRupee', roles: ['STUDENT'] },
  { section: 'SERVICES', label: 'Attendance', href: '/student/attendance', icon: 'CalendarCheck', roles: ['STUDENT'] },
  { section: 'SERVICES', label: 'Mess Menu', href: '/student/mess', icon: 'Utensils', roles: ['STUDENT'] },
  { section: 'SERVICES', label: 'Complaints', href: '/student/complaints', icon: 'MessageSquareWarning', roles: ['STUDENT'] },
  { section: 'SERVICES', label: 'Announcements', href: '/student/announcements', icon: 'Megaphone', roles: ['STUDENT'] },
  { section: 'SERVICES', label: 'Help & Support', href: '/student/support', icon: 'LifeBuoy', roles: ['STUDENT'] },
  { section: 'SERVICES', label: 'Notifications', href: '/student/notifications', icon: 'Bell', roles: ['STUDENT'], badge: 'notifications' },
  { section: 'SERVICES', label: 'Terms & Conditions', href: '/terms', icon: 'FileText', roles: ['STUDENT'] },
];

export const PARENT_NAV: NavItem[] = [
  { section: 'MAIN', label: 'Dashboard', href: '/parent', icon: 'LayoutDashboard', roles: ['PARENT'] },
  { section: 'STUDENT OVERVIEW', label: 'Ward Profile', href: '/parent/profile', icon: 'User', roles: ['PARENT'] },
  { section: 'STUDENT OVERVIEW', label: 'Fees', href: '/parent/fees', icon: 'IndianRupee', roles: ['PARENT'] },
  { section: 'STUDENT OVERVIEW', label: 'Attendance', href: '/parent/attendance', icon: 'CalendarCheck', roles: ['PARENT'] },
  { section: 'STUDENT OVERVIEW', label: 'Mess Menu', href: '/parent/mess', icon: 'Utensils', roles: ['PARENT'] },
  { section: 'STUDENT OVERVIEW', label: 'Help & Support', href: '/student/support', icon: 'LifeBuoy', roles: ['PARENT'] },
  { section: 'STUDENT OVERVIEW', label: 'Notifications', href: '/parent/notifications', icon: 'Bell', roles: ['PARENT'], badge: 'notifications' },
];

export function getNavForRole(role: Role): NavItem[] {
  if (role === 'STUDENT') return STUDENT_NAV;
  if (role === 'PARENT') return PARENT_NAV;
  return OWNER_NAV.filter((n) => n.roles === 'ALL' || (n.roles as Role[]).includes(role));
}
