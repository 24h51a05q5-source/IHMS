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
  hostelName?: string;
  organizationName?: string;
  hostelBranchId?: string;
  studentId?: string;
  customerCode?: string;
  ihmsId?: string;
  mustChangePassword?: boolean;
  avatarUrl?: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken?: string;
  detectedAccountType?: 'STUDENT' | 'ADMIN';
}

export interface Branch {
  id: string;
  code: string;
  branchCode?: string;
  name: string;
  hostelName?: string;
  branchName?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  capacity?: number;
}

export interface Hostel {
  id: string;
  name: string;
  hostelName?: string;
  organizationName?: string;
  code: string;
  branchId: string;
  branchCode?: string;
  branchName?: string;
  type?: 'BOYS' | 'GIRLS' | 'CO_ED' | string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  totalRooms?: number;
  totalBeds?: number;
  totalCapacity?: number;
  currentOccupancy?: number;
  status?: string;
}

export interface Room {
  id: string;
  _id?: string;
  number: string;
  roomNumber?: string;
  floor: number;
  floorNumber?: number;
  buildingName?: string;
  blockName?: string;
  capacity: number;
  totalBeds?: number;
  occupied: number;
  occupiedBeds?: number;
  available?: number;
  availableBeds?: number;
  hostelId: string;
  branchId?: string;
  hostelName?: string;
  branchCode?: string;
  type?: string;
  roomType?: string;
  monthlyRentPerBed?: number;
  monthlyRate?: number;
  status?: 'ACTIVE' | 'MAINTENANCE';
  amenities?: string[];
  beds?: Bed[];
}

export interface Bed {
  id: string;
  _id?: string;
  number: string;
  bedNumber?: string;
  bedCode?: string;
  roomId: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE';
  monthlyFee?: number;
  monthlyRate?: number;
  studentId?: string;
  studentName?: string;
  customerCode?: string;
  allocatedAt?: string;
  student?: any;
}

export type PortalAccessStatus = 'ENABLED' | 'DISABLED' | 'PENDING';

export interface Student {
  id: string;
  customerCode: string;
  studentId?: string;
  ihmsId?: string;
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

export type PaymentPlan = 'ONE_TIME' | 'MONTHLY';
export type InstallmentStatus = 'UPCOMING' | 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';

export interface FeeInstallment {
  id: string;
  installmentNumber: number;
  month: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string;
  status: InstallmentStatus;
}

export interface FeeSummaryData {
  studentId: string;
  customerCode: string;
  studentName: string;
  hostelName?: string;
  paymentPlan: PaymentPlan;
  totalFee: number;
  totalPaid: number;
  approvedAdjustments: number;
  outstandingBalance: number;
  allowAdvancePayment: boolean;
  monthlyDueDay: number;
  currentDueInstallment?: FeeInstallment | null;
  installments: FeeInstallment[];
  payments: Payment[];
  adjustments?: Array<{ id: string; amount: number; reason: string; approvedBy: string; date: string }>;
}

export interface Fee {
  id: string;
  studentId: string;
  studentName?: string;
  customerCode?: string;
  paymentPlan?: PaymentPlan;
  total: number;
  paid: number;
  outstanding: number;
  dueDate?: string;
  status: 'PAID' | 'PARTIAL' | 'OVERDUE' | 'NO_DUE';
}

export interface Payment {
  id: string;
  paymentNumber?: string;
  studentId: string;
  studentName?: string;
  customerCode?: string;
  roomNumber?: string;
  bedNumber?: string;
  feeType?: string;
  installmentId?: string;
  installmentMonth?: string;
  amount: number;
  currency?: string;
  method?: 'CASH' | 'CARD' | 'UPI' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'NET_BANKING' | 'BANK_TRANSFER' | 'CHEQUE' | 'ONLINE';
  status: 'CREATED' | 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'REFUNDED' | 'REVERSED' | 'SUBMITTED' | 'UNDER_VERIFICATION' | 'VERIFIED' | 'REJECTED' | string;
  transactionRef?: string;
  gatewayOrderId?: string;
  gatewayTransactionId?: string;
  receiptNo?: string;
  receiptNumber?: string;
  receivedBy?: string;
  notes?: string;
  date: string;
  paidAt?: string;
  feeId?: string;
}

export interface PaymentReceipt {
  id: string;
  receiptNumber?: string;
  receiptNo?: string;
  paymentId: string;
  paymentNumber?: string;
  hostelName?: string;
  studentId: string;
  customerCode?: string;
  studentName: string;
  roomNumber?: string;
  bedNumber?: string;
  feeType?: string;
  installmentMonth?: string;
  amount: number;
  remainingBalance?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  transactionRef?: string;
  gatewayTransactionId?: string;
  issuedBy?: string;
  notes?: string;
  date?: string;
  issuedAt?: string;
  qrPayload?: string;
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
  day: 'SUNDAY' | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | string;
  breakfast: MessItem[];
  lunch: MessItem[];
  snacks: MessItem[];
  dinner: MessItem[];
}

export interface MessMenu {
  id: string;
  branchId: string;
  status: 'DRAFT' | 'PUBLISHED';
  week?: MessDayMenu[];
  weekDays?: MessDayMenu[];
  updatedAt?: string;
  updatedBy?: string;
}

export type MenuItem = MessItem;
export type DayMenuInput = MessDayMenu;
export type WeeklyMessMenu = MessMenu;
export interface SaveMessMenuInput {
  branchId: string;
  status: 'DRAFT' | 'PUBLISHED';
  week: MessDayMenu[];
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

export type AnnouncementPriority = 'NORMAL' | 'IMPORTANT' | 'URGENT';
export type AnnouncementTargetType = 'ALL' | 'BRANCH' | 'ROOM' | 'STUDENT';
export type AnnouncementStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED';

export interface Announcement {
  id: string;
  organizationId?: string;
  branchId?: string;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  targetType: AnnouncementTargetType;
  targetId?: string;
  targetLabel?: string;
  imageUrl?: string | null;
  attachmentUrl?: string | null;
  announcementImage?: string | null;
  createdBy?: string;
  createdByName?: string;
  expiresAt?: string;
  status: AnnouncementStatus;
  isRead?: boolean;
  readCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateAnnouncementPayload {
  title: string;
  message?: string;
  priority?: AnnouncementPriority;
  targetType: AnnouncementTargetType;
  targetId?: string;
  targetLabel?: string;
  branchId?: string;
  expiresAt?: string;
  imageUrl?: string | null;
  attachmentUrl?: string | null;
  announcementImage?: string | null;
  image?: string | null;
}

export interface UpdateAnnouncementPayload {
  title?: string;
  message?: string;
  priority?: AnnouncementPriority;
  targetType?: AnnouncementTargetType;
  targetId?: string;
  targetLabel?: string;
  branchId?: string;
  expiresAt?: string;
  status?: AnnouncementStatus;
  imageUrl?: string | null;
  attachmentUrl?: string | null;
  announcementImage?: string | null;
  image?: string | null;
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

export interface Expense {
  id: string;
  expenseNumber: string;
  category: string;
  amount: number;
  paymentMethod: string;
  paidTo: string;
  date: string;
  description?: string;
  invoiceOrBillNumber?: string;
  approvedBy?: string;
}

export interface Voucher {
  id: string;
  voucherNumber: string;
  voucherType: string;
  account: string;
  debit: number;
  credit: number;
  date: string;
  narration: string;
}

export interface ProfitAndLoss {
  income: { totalIncome: number; breakdown: { hostelRent: number; messFee: number; admissionFee: number; securityDeposit: number; otherCharges: number } };
  expenses: { totalExpenses: number; byCategory: { category: string; amount: number }[] };
  summary: { totalIncome: number; totalExpenses: number; netProfitOrLoss: number; isProfitable: boolean };
}

export interface Asset {
  id: string;
  assetCode: string;
  name: string;
  category: string;
  quantity?: number;
  cost?: number;
  condition?: 'NEW' | 'GOOD' | 'DAMAGED' | 'SCRAPPED';
  status: 'IN_USE' | 'MAINTENANCE' | 'DISPOSED' | 'AVAILABLE';
  roomLocation?: string;
  purchaseDate?: string;
  qrPayload?: string;
}

export type SupportTicketCategory =
  | 'Login Problem'
  | 'OTP Problem'
  | 'Password Problem'
  | 'Payment / Fees Problem'
  | 'Account Problem'
  | 'Technical Issue'
  | 'Other';

export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface SupportTicket {
  id: string;
  _id?: string;
  ticketNumber: string;
  ticketId?: string;
  organizationId?: string;
  userId?: string;
  userName: string;
  userRole: string;
  hostelName?: string;
  email: string;
  subject: string;
  category: string;
  description: string;
  screenshotUrl?: string;
  status: SupportTicketStatus;
  resolutionNotes?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateSupportTicketDto {
  userName?: string;
  userRole?: string;
  hostelName?: string;
  email?: string;
  subject: string;
  category: SupportTicketCategory | string;
  description: string;
  screenshotUrl?: string;
}

export interface UpdateSupportTicketDto {
  status: SupportTicketStatus;
  resolutionNotes?: string;
}

