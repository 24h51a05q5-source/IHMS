// ============================================================
// IHMS ERP — Shared Domain Types
// These mirror the API contract documented in API_CONTRACT.md.
// Antigravity / NestJS backend MUST return these exact shapes.
// ============================================================

export type Role =
  | 'PLATFORM_SUPER_ADMIN'
  | 'ORGANIZATION_OWNER'
  | 'REGIONAL_MANAGER'
  | 'BRANCH_MANAGER'
  | 'WARDEN'
  | 'RECEPTIONIST'
  | 'ACCOUNTANT'
  | 'MESS_MANAGER'
  | 'INVENTORY_MANAGER'
  | 'SECURITY_GUARD'
  | 'MAINTENANCE_STAFF'
  | 'STUDENT'
  | 'PARENT';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId?: string;
  hostelBranchId?: string;
  studentId?: string;
  avatarUrl?: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken?: string;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  capacity?: number;
}

export interface Hostel {
  id: string;
  name: string;
  code: string;
  branchId: string;
  address?: string;
  totalRooms?: number;
  totalBeds?: number;
}

export interface Room {
  id: string;
  number: string;
  floor: number;
  capacity: number;
  occupied: number;
  hostelId: string;
  type?: string;
}

export interface Bed {
  id: string;
  number: string;
  roomId: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';
  studentId?: string;
}

export type PortalAccessStatus = 'ENABLED' | 'DISABLED' | 'PENDING';

export interface Student {
  id: string;
  customerCode: string;
  name: string;
  email?: string;
  phone?: string;
  guardianName?: string;
  guardianPhone?: string;
  hostelId: string;
  hostelName?: string;
  roomId?: string;
  roomNumber?: string;
  bedId?: string;
  bedNumber?: string;
  course?: string;
  year?: number;
  dateOfAdmission?: string;
  feeTotal?: number;
  feePaid?: number;
  feeOutstanding?: number;
  feeStatus?: 'PAID' | 'PARTIAL' | 'OVERDUE' | 'NO_DUE';
  portalAccess: PortalAccessStatus;
  status?: 'ACTIVE' | 'INACTIVE' | 'GRADUATED' | 'SUSPENDED';
  avatarUrl?: string;
}

export interface StudentDetail extends Student {
  address?: string;
  bloodGroup?: string;
  emergencyContact?: string;
  parentName?: string;
  parentPhone?: string;
  documents?: StudentDocument[];
  createdAt?: string;
}

export interface StudentDocument {
  id: string;
  studentId: string;
  name: string;
  type: string;
  url: string;
  uploadedAt: string;
}

export interface Fee {
  id: string;
  studentId: string;
  studentName?: string;
  customerCode?: string;
  total: number;
  paid: number;
  outstanding: number;
  dueDate?: string;
  status: 'PAID' | 'PARTIAL' | 'OVERDUE' | 'NO_DUE';
}

export interface Payment {
  id: string;
  studentId: string;
  studentName?: string;
  customerCode?: string;
  amount: number;
  method?: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  receiptNo?: string;
  date: string;
  feeId?: string;
}

export interface PaymentReceipt {
  id: string;
  receiptNo: string;
  paymentId: string;
  studentId: string;
  studentName: string;
  amount: number;
  date: string;
  qrCodeUrl?: string;
}

export type MealType = 'BREAKFAST' | 'LUNCH' | 'SNACKS' | 'DINNER';

export interface MessItem {
  id: string;
  name: string;
  special?: boolean;
  vegetarian?: boolean;
}

export interface MessDayMenu {
  day: 'SUNDAY' | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY';
  breakfast: MessItem[];
  lunch: MessItem[];
  snacks: MessItem[];
  dinner: MessItem[];
}

export interface MessMenu {
  id: string;
  branchId: string;
  status: 'DRAFT' | 'PUBLISHED';
  week: MessDayMenu[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName?: string;
  customerCode?: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'HOLIDAY';
  checkInTime?: string;
  checkOutTime?: string;
}

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveRequest {
  id: string;
  studentId: string;
  studentName?: string;
  customerCode?: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: LeaveStatus;
  appliedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  remarks?: string;
}

export type ComplaintStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type ComplaintPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Complaint {
  id: string;
  studentId?: string;
  studentName?: string;
  title: string;
  description: string;
  category?: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  createdAt: string;
  resolvedAt?: string;
  remarks?: string;
}

export interface Visitor {
  id: string;
  studentId?: string;
  studentName?: string;
  visitorName: string;
  relation?: string;
  phone?: string;
  purpose: string;
  checkInTime: string;
  checkOutTime?: string;
  status: 'CHECKED_IN' | 'CHECKED_OUT';
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  read: boolean;
  createdAt: string;
  link?: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  audience?: Role[] | 'ALL';
  createdAt: string;
  createdBy?: string;
}

export interface OwnerDashboardData {
  totalHostels: number;
  totalStudents: number;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  occupancyPct: number;
  monthlyCollection: number;
  outstandingFees: number;
  monthlyExpenses: number;
  netProfitLoss: number;
  pendingComplaints: number;
  pendingApprovals: number;
  collectionTrend?: { month: string; collection: number; expenses: number }[];
  occupancyTrend?: { month: string; occupancy: number }[];
  recentActivity?: { id: string; description: string; timestamp: string; type?: string }[];
}

export interface StudentDashboardData {
  profile: {
    customerCode: string;
    name: string;
    hostelName?: string;
    roomNumber?: string;
    bedNumber?: string;
    avatarUrl?: string;
  };
  fee: {
    total: number;
    paid: number;
    outstanding: number;
    nextDueDate?: string;
  };
  attendancePct?: number;
  pendingComplaints?: number;
  activeLeaveRequests?: number;
  announcements?: Announcement[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface ApiError {
  statusCode: number;
  message: string;
  code?: string;
  details?: unknown;
}
