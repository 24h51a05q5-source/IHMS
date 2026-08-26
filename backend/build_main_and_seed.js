const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

write('src/main.ts', `
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { connectDatabase } from './config/database';
import { initSocketIO } from './events/events.gateway';
import { errorHandler } from './common/filters/http-exception.filter';

import { authRouter } from './modules/auth/auth.controller';
import { organizationRouter } from './modules/organizations/organization.controller';
import { hostelRouter } from './modules/hostels/hostel.controller';
import { roomRouter } from './modules/rooms/room.controller';
import { studentRouter } from './modules/students/student.controller';
import { feeRouter } from './modules/fees/fee.controller';
import { financeRouter } from './modules/finance/finance.controller';
import { dashboardRouter } from './modules/dashboard/dashboard.controller';
import { messRouter } from './modules/mess/mess.controller';
import { inventoryRouter } from './modules/inventory/inventory.controller';
import { attendanceRouter } from './modules/attendance/attendance.controller';
import { visitorRouter } from './modules/visitors/visitor.controller';
import { complaintRouter } from './modules/complaints/complaint.controller';
import { userRouter } from './modules/users/user.controller';

dotenv.config();

export async function bootstrap() {
  const app = express();
  const server = http.createServer(app);

  // Security & Middlewares
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: '*', credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(morgan('dev'));

  // Initialize Real-time Socket.IO Server
  initSocketIO(server);

  // Health check
  const healthHandler = (req, res) => {
    res.json({
      status: 'healthy',
      system: 'Integrated Hostel Management System (IHMS) ERP',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  };
  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // REST API Routes
  app.use('/auth', authRouter);
  app.use('/api/auth', authRouter);

  app.use('/organizations', organizationRouter);
  app.use('/api/organizations', organizationRouter);

  app.use('/hostels', hostelRouter);
  app.use('/api/hostels', hostelRouter);

  app.use('/rooms', roomRouter);
  app.use('/api/rooms', roomRouter);

  app.use('/students', studentRouter);
  app.use('/api/students', studentRouter);

  app.use('/fees', feeRouter);
  app.use('/api/fees', feeRouter);

  app.use('/finance', financeRouter);
  app.use('/api/finance', financeRouter);

  app.use('/dashboard', dashboardRouter);
  app.use('/api/dashboard', dashboardRouter);

  app.use('/mess', messRouter);
  app.use('/api/mess', messRouter);

  app.use('/inventory', inventoryRouter);
  app.use('/api/inventory', inventoryRouter);

  app.use('/attendance', attendanceRouter);
  app.use('/api/attendance', attendanceRouter);

  app.use('/visitors', visitorRouter);
  app.use('/api/visitors', visitorRouter);

  app.use('/complaints', complaintRouter);
  app.use('/api/complaints', complaintRouter);

  app.use('/users', userRouter);
  app.use('/api/users', userRouter);

  // Global Centralized Error Handler
  app.use(errorHandler);

  // Connect MongoDB
  await connectDatabase();

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(\`=======================================================\`);
    console.log(\`  🚀 IHMS ERP BACKEND RUNNING ON http://localhost:\${PORT}\`);
    console.log(\`  📡 Real-time WebSocket Gateway enabled on /socket.io\`);
    console.log(\`  📊 MongoDB Multi-tenant Isolation: ACTIVE\`);
    console.log(\`=======================================================\`);
  });

  return { app, server };
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
`);

write('src/seed.ts', `
import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from './config/database';
import { OrganizationModel } from './modules/organizations/organization.schema';
import { UserModel } from './modules/users/user.schema';
import { HostelBranchModel } from './modules/hostels/hostel.schema';
import { RoomModel } from './modules/rooms/room.schema';
import { BedModel } from './modules/rooms/bed.schema';
import { StudentModel } from './modules/students/student.schema';
import { FeeDemandModel } from './modules/fees/fee-demand.schema';
import { PaymentModel } from './modules/fees/payment.schema';
import { ReceiptModel } from './modules/fees/receipt.schema';
import { ExpenseModel } from './modules/finance/expense.schema';
import { VoucherModel } from './modules/finance/voucher.schema';
import { ComplaintModel } from './modules/complaints/complaint.schema';
import { VisitorModel } from './modules/visitors/visitor.schema';
import { AssetModel } from './modules/inventory/asset.schema';
import { MessMenuModel } from './modules/mess/mess.schema';
import { BedStatus, ComplaintPriority, ComplaintStatus, ExpenseCategory, PaymentMethod, PaymentStatus, StudentStatus, UserRole, VisitorStatus, VoucherType } from './config/constants';
import { generateReceiptNumber } from './common/utils/code-generator';
import { generateQrDataUrl } from './common/utils/qr-generator';

export async function runSeed() {
  console.log('[Seed] Connecting to database...');
  await connectDatabase();

  console.log('[Seed] Clearing existing collections...');
  await Promise.all([
    OrganizationModel.deleteMany({}),
    UserModel.deleteMany({}),
    HostelBranchModel.deleteMany({}),
    RoomModel.deleteMany({}),
    BedModel.deleteMany({}),
    StudentModel.deleteMany({}),
    FeeDemandModel.deleteMany({}),
    PaymentModel.deleteMany({}),
    ReceiptModel.deleteMany({}),
    ExpenseModel.deleteMany({}),
    VoucherModel.deleteMany({}),
    ComplaintModel.deleteMany({}),
    VisitorModel.deleteMany({}),
    AssetModel.deleteMany({}),
    MessMenuModel.deleteMany({}),
  ]);

  console.log('[Seed] Creating Organization & Owner...');
  const org = await OrganizationModel.create({
    orgCode: 'ORG-1001',
    name: 'Sri Sai Ram Grand Living Hostels Pvt Ltd',
    taxGstin: '36AAAAA0000A1Z5',
    currency: 'INR',
    address: 'Madhapur, Hitech City, Hyderabad, Telangana - 500081',
    phone: '+91 9876543210',
    email: 'contact@saisairamhostels.com',
    subscriptionTier: 'ENTERPRISE',
    status: 'ACTIVE',
  });
  const orgId = org._id.toString();

  const defaultPasswordHash = await bcrypt.hash('Admin@123', 10);

  // 1. Owner
  const owner = await UserModel.create({
    organizationId: orgId,
    name: 'Rajesh Varma (Owner)',
    email: 'owner@ihms.com',
    passwordHash: defaultPasswordHash,
    role: UserRole.OWNER,
    phone: '+91 9876543210',
    status: 'ACTIVE',
  });

  // 2. Super Admin
  await UserModel.create({
    organizationId: orgId,
    name: 'Global Super Admin',
    email: 'superadmin@ihms.com',
    passwordHash: defaultPasswordHash,
    role: UserRole.SUPER_ADMIN,
    phone: '+91 9999999999',
    status: 'ACTIVE',
  });

  console.log('[Seed] Creating 2 Hostel Branches...');
  // Branch 1: Hyderabad Hitech City (Boys)
  const branch1 = await HostelBranchModel.create({
    organizationId: orgId,
    branchCode: 'HYD001',
    name: 'Sri Sai Ram Luxury Boys Hostel (Hitech City)',
    type: 'BOYS',
    address: 'Plot 42, Silicon Valley, Madhapur',
    city: 'Hyderabad',
    state: 'Telangana',
    contactPhone: '+91 9876500001',
    contactEmail: 'hyd001@saisairamhostels.com',
    totalCapacity: 20,
    status: 'ACTIVE',
  });
  const branch1Id = branch1._id.toString();

  // Branch 2: Hyderabad Gachibowli (Girls)
  const branch2 = await HostelBranchModel.create({
    organizationId: orgId,
    branchCode: 'HYD002',
    name: 'Sri Sai Ram Elite Girls Hostel (Gachibowli)',
    type: 'GIRLS',
    address: 'Road No 2, Financial District, Gachibowli',
    city: 'Hyderabad',
    state: 'Telangana',
    contactPhone: '+91 9876500002',
    contactEmail: 'hyd002@saisairamhostels.com',
    totalCapacity: 20,
    status: 'ACTIVE',
  });
  const branch2Id = branch2._id.toString();

  console.log('[Seed] Creating Staff Users...');
  // Accountant
  await UserModel.create({
    organizationId: orgId,
    branchId: branch1Id,
    name: 'Suresh Kumar (Accountant)',
    email: 'accountant@ihms.com',
    passwordHash: defaultPasswordHash,
    role: UserRole.ACCOUNTANT,
    phone: '+91 9876511111',
    staffCode: 'HYD001-EMP001',
    status: 'ACTIVE',
  });

  // Warden
  await UserModel.create({
    organizationId: orgId,
    branchId: branch1Id,
    name: 'Anand Rao (Warden)',
    email: 'warden@ihms.com',
    passwordHash: defaultPasswordHash,
    role: UserRole.WARDEN,
    phone: '+91 9876522222',
    staffCode: 'HYD001-EMP002',
    status: 'ACTIVE',
  });

  // Security Guard
  await UserModel.create({
    organizationId: orgId,
    branchId: branch1Id,
    name: 'Ramesh Bahadur (Security)',
    email: 'security@ihms.com',
    passwordHash: defaultPasswordHash,
    role: UserRole.SECURITY_GUARD,
    phone: '+91 9876533333',
    staffCode: 'HYD001-EMP003',
    status: 'ACTIVE',
  });

  // Maintenance Staff
  await UserModel.create({
    organizationId: orgId,
    branchId: branch1Id,
    name: 'Govind Electrician',
    email: 'maintenance@ihms.com',
    passwordHash: defaultPasswordHash,
    role: UserRole.MAINTENANCE_STAFF,
    phone: '+91 9876544444',
    staffCode: 'HYD001-EMP004',
    status: 'ACTIVE',
  });

  // Mess Manager
  await UserModel.create({
    organizationId: orgId,
    branchId: branch1Id,
    name: 'Koteswara Rao (Mess)',
    email: 'mess@ihms.com',
    passwordHash: defaultPasswordHash,
    role: UserRole.MESS_MANAGER,
    phone: '+91 9876555555',
    staffCode: 'HYD001-EMP005',
    status: 'ACTIVE',
  });

  console.log('[Seed] Creating Rooms and Beds for Branch 1 & 2...');
  // Create 4 rooms in Branch 1 (2 sharing each = 8 beds)
  const roomData = [
    { roomNumber: '101', floorNumber: 1, totalBeds: 2, rate: 8000 },
    { roomNumber: '102', floorNumber: 1, totalBeds: 2, rate: 8000 },
    { roomNumber: '201', floorNumber: 2, totalBeds: 2, rate: 7500 },
    { roomNumber: '202', floorNumber: 2, totalBeds: 2, rate: 7500 },
  ];

  const branch1Beds: any[] = [];
  for (const rd of roomData) {
    const roomCode = \`HYD001-B1-F\${rd.floorNumber}-R\${rd.roomNumber}\`;
    const room = await RoomModel.create({
      organizationId: orgId,
      branchId: branch1Id,
      buildingName: 'Block A',
      blockName: '1',
      floorNumber: rd.floorNumber,
      roomNumber: rd.roomNumber,
      roomCode,
      roomType: 'DOUBLE',
      totalBeds: rd.totalBeds,
      monthlyRate: rd.rate,
      amenities: ['AC', 'Attached Bath', 'Study Table', 'High Speed Wi-Fi', 'Wardrobe'],
      status: 'ACTIVE',
    });

    for (let i = 1; i <= rd.totalBeds; i++) {
      const bedCode = \`HYD001-R\${rd.roomNumber}-B\${String(i).padStart(2, '0')}\`;
      const bed = await BedModel.create({
        organizationId: orgId,
        branchId: branch1Id,
        roomId: room._id.toString(),
        roomCode,
        bedNumber: i,
        bedCode,
        status: BedStatus.AVAILABLE,
        monthlyRate: rd.rate,
      });
      branch1Beds.push(bed);
    }
  }

  // Also create 2 rooms in Branch 2 for transfers
  for (const rd of roomData.slice(0, 2)) {
    const roomCode = \`HYD002-B1-F\${rd.floorNumber}-R\${rd.roomNumber}\`;
    const room = await RoomModel.create({
      organizationId: orgId,
      branchId: branch2Id,
      buildingName: 'Wing 1',
      blockName: '1',
      floorNumber: rd.floorNumber,
      roomNumber: rd.roomNumber,
      roomCode,
      roomType: 'DOUBLE',
      totalBeds: rd.totalBeds,
      monthlyRate: rd.rate,
      amenities: ['AC', 'Attached Bath', 'Study Table', 'Wi-Fi'],
      status: 'ACTIVE',
    });

    for (let i = 1; i <= rd.totalBeds; i++) {
      const bedCode = \`HYD002-R\${rd.roomNumber}-B\${String(i).padStart(2, '0')}\`;
      await BedModel.create({
        organizationId: orgId,
        branchId: branch2Id,
        roomId: room._id.toString(),
        roomCode,
        bedNumber: i,
        bedCode,
        status: BedStatus.AVAILABLE,
        monthlyRate: rd.rate,
      });
    }
  }

  console.log('[Seed] Admitting Sample Students...');
  // Student 1: Rahul Sharma (Assigned to Bed 1 in Room 101)
  const studentUser1 = await UserModel.create({
    organizationId: orgId,
    branchId: branch1Id,
    name: 'Rahul Sharma',
    email: 'student@ihms.com',
    passwordHash: defaultPasswordHash,
    role: UserRole.STUDENT,
    phone: '+91 9123456780',
    customerCode: 'HYD001-ST000001',
    status: 'ACTIVE',
  });

  const bed1 = branch1Beds[0];
  const student1 = await StudentModel.create({
    organizationId: orgId,
    branchId: branch1Id,
    customerCode: 'HYD001-ST000001',
    userId: studentUser1._id.toString(),
    fullName: 'Rahul Sharma',
    email: 'student@ihms.com',
    phone: '+91 9123456780',
    gender: 'MALE',
    dateOfBirth: new Date(2002, 4, 15),
    bloodGroup: 'O+',
    aadharNumber: '9876-5432-1098',
    collegeOrCompany: 'TCS Cyber City',
    courseOrDesignation: 'Systems Engineer',
    guardian: {
      name: 'Manoj Sharma',
      relation: 'Father',
      phone: '+91 9811223344',
      email: 'manoj.sharma@example.com',
      address: 'Jaipur, Rajasthan',
    },
    currentAssignment: {
      branchId: branch1Id,
      hostelCode: 'HYD001',
      buildingName: 'Block A',
      roomId: bed1.roomId,
      roomCode: bed1.roomCode,
      bedId: bed1._id.toString(),
      bedCode: bed1.bedCode,
      monthlyRent: 8000,
      allocatedAt: new Date(),
    },
    financialSummary: {
      totalDemanded: 14000,
      totalPaid: 14000,
      outstandingBalance: 0,
    },
    status: StudentStatus.ACTIVE,
    admissionDate: new Date(),
  });

  // Mark Bed 1 as OCCUPIED
  bed1.status = BedStatus.OCCUPIED;
  bed1.currentStudentId = student1._id.toString();
  bed1.currentCustomerCode = student1.customerCode;
  bed1.currentStudentName = student1.fullName;
  bed1.allocatedAt = new Date();
  await bed1.save();

  // Student 2: Vikram Reddy (Assigned to Bed 2 in Room 101, has dues)
  const studentUser2 = await UserModel.create({
    organizationId: orgId,
    branchId: branch1Id,
    name: 'Vikram Reddy',
    email: 'vikram.reddy@example.com',
    passwordHash: defaultPasswordHash,
    role: UserRole.STUDENT,
    phone: '+91 9123456781',
    customerCode: 'HYD001-ST000002',
    status: 'ACTIVE',
  });

  const bed2 = branch1Beds[1];
  const student2 = await StudentModel.create({
    organizationId: orgId,
    branchId: branch1Id,
    customerCode: 'HYD001-ST000002',
    userId: studentUser2._id.toString(),
    fullName: 'Vikram Reddy',
    email: 'vikram.reddy@example.com',
    phone: '+91 9123456781',
    gender: 'MALE',
    dateOfBirth: new Date(2001, 8, 20),
    bloodGroup: 'B+',
    collegeOrCompany: 'Infosys SEZ',
    guardian: {
      name: 'Narayana Reddy',
      relation: 'Father',
      phone: '+91 9844556677',
      email: 'narayana.reddy@example.com',
    },
    currentAssignment: {
      branchId: branch1Id,
      hostelCode: 'HYD001',
      buildingName: 'Block A',
      roomId: bed2.roomId,
      roomCode: bed2.roomCode,
      bedId: bed2._id.toString(),
      bedCode: bed2.bedCode,
      monthlyRent: 8000,
      allocatedAt: new Date(),
    },
    financialSummary: {
      totalDemanded: 14000,
      totalPaid: 8000,
      outstandingBalance: 6000,
    },
    status: StudentStatus.ACTIVE,
    admissionDate: new Date(),
  });

  bed2.status = BedStatus.OCCUPIED;
  bed2.currentStudentId = student2._id.toString();
  bed2.currentCustomerCode = student2.customerCode;
  bed2.currentStudentName = student2.fullName;
  bed2.allocatedAt = new Date();
  await bed2.save();

  console.log('[Seed] Creating Fee Demands, Payments, Receipts, and Ledgers...');
  // Fee Demands for Student 1
  const dem1 = await FeeDemandModel.create({
    demandNumber: 'DEM-10001',
    organizationId: orgId,
    branchId: branch1Id,
    studentId: student1._id.toString(),
    customerCode: student1.customerCode,
    academicPeriod: '2026',
    termName: 'August 2026 Rent & Deposit',
    breakdown: {
      hostelRent: 8000,
      messFee: 0,
      admissionFee: 1000,
      securityDeposit: 5000,
      laundryFee: 0,
      otherCharges: 0,
    },
    totalAmount: 14000,
    paidAmount: 14000,
    balanceAmount: 0,
    dueDate: new Date(2026, 7, 25),
    status: 'PAID',
  });

  // Payment for Student 1
  const pay1 = await PaymentModel.create({
    paymentNumber: 'PAY-10001',
    organizationId: orgId,
    branchId: branch1Id,
    studentId: student1._id.toString(),
    customerCode: student1.customerCode,
    demandId: dem1._id.toString(),
    amount: 14000,
    paymentMethod: PaymentMethod.UPI,
    transactionRef: 'UPI-RAHUL-98765432',
    status: PaymentStatus.SUCCESS,
    notes: 'Online Admission Fee Payment',
    receivedBy: 'Suresh Kumar (Accountant)',
    timestamp: new Date(),
  });

  const receiptNum1 = 'HYD001-REC-000001';
  const qr1 = await generateQrDataUrl({
    receiptNumber: receiptNum1,
    customerCode: student1.customerCode,
    studentName: student1.fullName,
    amount: 14000,
    date: pay1.timestamp,
  });

  await ReceiptModel.create({
    receiptNumber: receiptNum1,
    paymentId: pay1._id.toString(),
    organizationId: orgId,
    branchId: branch1Id,
    studentId: student1._id.toString(),
    customerCode: student1.customerCode,
    studentName: student1.fullName,
    amount: 14000,
    paymentMethod: PaymentMethod.UPI,
    transactionRef: pay1.transactionRef,
    issuedBy: 'Suresh Kumar',
    qrPayload: qr1,
    issuedAt: new Date(),
  });

  await VoucherModel.create({
    voucherNumber: 'VCH-10001',
    voucherType: VoucherType.RECEIPT,
    organizationId: orgId,
    branchId: branch1Id,
    account: 'HOSTEL_FEE_COLLECTION',
    debit: 0,
    credit: 14000,
    date: new Date(),
    narration: \`Admission and Rent collection for \${student1.fullName} (\${student1.customerCode})\`,
    referenceId: receiptNum1,
  });

  // Expenses
  const exp1 = await ExpenseModel.create({
    expenseNumber: 'EXP-10001',
    organizationId: orgId,
    branchId: branch1Id,
    category: ExpenseCategory.ELECTRICITY,
    amount: 8500,
    paymentMethod: PaymentMethod.BANK_TRANSFER,
    paidTo: 'TSSPDCL Hyderabad',
    date: new Date(),
    description: 'Electricity bill for August 2026 - Main Meter',
    invoiceOrBillNumber: 'EB-HYD-98124',
    approvedBy: 'Rajesh Varma (Owner)',
  });

  await VoucherModel.create({
    voucherNumber: 'VCH-10002',
    voucherType: VoucherType.PAYMENT,
    organizationId: orgId,
    branchId: branch1Id,
    account: 'EXPENSE_ELECTRICITY',
    debit: 8500,
    credit: 0,
    date: exp1.date,
    narration: 'TSSPDCL electricity bill payment',
    referenceId: exp1.expenseNumber,
  });

  const exp2 = await ExpenseModel.create({
    expenseNumber: 'EXP-10002',
    organizationId: orgId,
    branchId: branch1Id,
    category: ExpenseCategory.FOOD_PROVISIONS,
    amount: 12000,
    paymentMethod: PaymentMethod.CASH,
    paidTo: 'Balaji Wholesale Groceries',
    date: new Date(),
    description: 'Rice, Atta, Dal, Oil provisions for Kitchen',
    invoiceOrBillNumber: 'GROC-4421',
    approvedBy: 'Koteswara Rao (Mess Manager)',
  });

  await VoucherModel.create({
    voucherNumber: 'VCH-10003',
    voucherType: VoucherType.PAYMENT,
    organizationId: orgId,
    branchId: branch1Id,
    account: 'EXPENSE_FOOD_PROVISIONS',
    debit: 12000,
    credit: 0,
    date: exp2.date,
    narration: 'Kitchen groceries purchase',
    referenceId: exp2.expenseNumber,
  });

  console.log('[Seed] Creating Complaints, Assets, and Visitors...');
  // Sample Complaint
  await ComplaintModel.create({
    complaintNumber: 'HYD001-CMP-000001',
    organizationId: orgId,
    branchId: branch1Id,
    studentId: student1._id.toString(),
    customerCode: student1.customerCode,
    studentName: student1.fullName,
    roomCode: 'HYD001-B1-F1-R101',
    category: 'PLUMBING',
    title: 'Bathroom tap leaking continuously',
    description: 'The cold water washbasin tap is leaking slowly and needs washer replacement.',
    priority: ComplaintPriority.MEDIUM,
    status: ComplaintStatus.OPEN,
  });

  // Sample Asset
  const assetQr = await generateQrDataUrl({
    assetCode: 'HYD001-AST-000001',
    name: 'Voltas 1.5 Ton Split AC',
    room: 'HYD001-B1-F1-R101',
  });

  await AssetModel.create({
    organizationId: orgId,
    branchId: branch1Id,
    assetCode: 'HYD001-AST-000001',
    name: 'Voltas 1.5 Ton Inverter Split AC',
    category: 'APPLIANCE',
    roomLocation: 'HYD001-B1-F1-R101',
    purchaseDate: new Date(2025, 6, 10),
    cost: 34000,
    status: 'WORKING',
    amcVendor: 'Voltas Service Hyderabad',
    amcExpiryDate: new Date(2027, 6, 10),
    qrPayload: assetQr,
  });

  // Sample Visitor
  const visQr = await generateQrDataUrl({
    visitorPassNumber: 'HYD001-VIS-000001',
    visitorName: 'Manoj Sharma',
    studentName: 'Rahul Sharma',
    time: new Date(),
  });

  await VisitorModel.create({
    visitorPassNumber: 'HYD001-VIS-000001',
    organizationId: orgId,
    branchId: branch1Id,
    visitorName: 'Manoj Sharma',
    phone: '+91 9811223344',
    studentId: student1._id.toString(),
    customerCode: student1.customerCode,
    studentName: student1.fullName,
    purpose: 'Visiting son for weekend',
    idProofNumber: 'Aadhaar 1234-5678-9012',
    status: VisitorStatus.INSIDE,
    checkInTime: new Date(),
    qrPayload: visQr,
    securityGuardName: 'Ramesh Bahadur',
  });

  // Mess Menu for 7 days
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const messData = days.map((dayName, idx) => ({
    organizationId: orgId,
    branchId: branch1Id,
    dayOfWeek: idx,
    dayName,
    breakfast: idx === 0 ? 'Masala Dosa / Chutney, Tea' : 'Idli / Wada / Sambar, Coffee',
    lunch: idx === 0 ? 'Special Biryani, Mirchi ka Salan, Raita, Gulab Jamun' : 'Rice, Sambar, Mix Veg Curry, Curd, Papad',
    snacks: 'Tea / Biscuits / Pakoda',
    dinner: 'Roti, Dal Fry, Jeera Rice, Paneer Curry',
    isSpecial: idx === 0,
  }));
  await MessMenuModel.insertMany(messData);

  console.log('===========================================================');
  console.log('  ✅ DATABASE SEEDED SUCCESSFULLY WITH PRODUCTION DEMO DATA');
  console.log('===========================================================');
  console.log('  Test Login Accounts (Password for all: Admin@123):');
  console.log('  - Owner:         owner@ihms.com');
  console.log('  - Super Admin:   superadmin@ihms.com');
  console.log('  - Accountant:    accountant@ihms.com');
  console.log('  - Warden:        warden@ihms.com');
  console.log('  - Security:      security@ihms.com');
  console.log('  - Maintenance:   maintenance@ihms.com');
  console.log('  - Mess Manager:  mess@ihms.com');
  console.log('  - Student:       student@ihms.com (Customer Code: HYD001-ST000001)');
  console.log('===========================================================');

  await disconnectDatabase();
}

if (require.main === module) {
  runSeed().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
`);