const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

write('test/ihms.spec.ts', `
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { authService } from '../src/modules/auth/auth.service';
import { hostelService } from '../src/modules/hostels/hostel.service';
import { roomService } from '../src/modules/rooms/room.service';
import { studentService } from '../src/modules/students/student.service';
import { feeService } from '../src/modules/fees/fee.service';
import { financeService } from '../src/modules/finance/finance.service';
import { complaintService } from '../src/modules/complaints/complaint.service';
import { attendanceService } from '../src/modules/attendance/attendance.service';
import { BedModel } from '../src/modules/rooms/bed.schema';
import { StudentModel } from '../src/modules/students/student.schema';
import { BedStatus, ComplaintStatus, LeaveStatus, PaymentMethod } from '../src/config/constants';

describe('IHMS ERP Production Test Suite (MongoDB & Multi-Tenancy)', () => {
  let mongod: MongoMemoryServer;
  let orgId1: string;
  let orgId2: string;
  let branch1Id: string;
  let branch2Id: string;
  let bed1Id: string;
  let bed2Id: string;
  let studentId: string;
  let customerCode: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  // PHASE 1: Auth, Multi-Tenancy & RBAC
  describe('Phase 1: Multi-Tenant Registration & Authentication', () => {
    it('should register Organization 1 and Owner account with hashed password', async () => {
      const result = await authService.registerOwner({
        orgName: 'Green Valley Hostels Pvt Ltd',
        orgEmail: 'admin@greenvalley.com',
        ownerName: 'Vikram Sharma',
        ownerEmail: 'vikram@greenvalley.com',
        ownerPassword: 'SecretPassword@123',
      });

      expect(result.token).toBeDefined();
      expect(result.user.role).toBe('OWNER');
      expect(result.organization.orgCode).toMatch(/^ORG-/);
      orgId1 = result.organization._id.toString();
    });

    it('should register an independent Organization 2 for tenant isolation tests', async () => {
      const result = await authService.registerOwner({
        orgName: 'Blue Sky Living Hostels',
        orgEmail: 'admin@bluesky.com',
        ownerName: 'Ramesh Patel',
        ownerEmail: 'ramesh@bluesky.com',
        ownerPassword: 'SecretPassword@123',
      });

      expect(result.organization._id.toString()).not.toBe(orgId1);
      orgId2 = result.organization._id.toString();
    });

    it('should login with valid credentials and reject invalid passwords', async () => {
      const loginRes = await authService.login('vikram@greenvalley.com', 'SecretPassword@123');
      expect(loginRes.token).toBeDefined();
      expect(loginRes.user.email).toBe('vikram@greenvalley.com');

      await expect(authService.login('vikram@greenvalley.com', 'WrongPassword')).rejects.toThrow();
    });
  });

  // PHASE 2: Hostels, Rooms, Beds & Concurrency
  describe('Phase 2: Hostel, Room & Bed Hierarchy', () => {
    it('should create Hostel Branches for Org 1', async () => {
      const branch1 = await hostelService.create(orgId1, {
        name: 'Green Valley Hitech Branch',
        branchCode: 'HYD001',
        type: 'BOYS',
        city: 'Hyderabad',
      });
      branch1Id = branch1._id.toString();
      expect(branch1.branchCode).toBe('HYD001');

      const branch2 = await hostelService.create(orgId1, {
        name: 'Green Valley Gachibowli Branch',
        branchCode: 'HYD002',
        type: 'BOYS',
        city: 'Hyderabad',
      });
      branch2Id = branch2._id.toString();
      expect(branch2.branchCode).toBe('HYD002');
    });

    it('should create Room and auto-generate Beds with permanent codes', async () => {
      const { room, beds } = await roomService.createRoom(orgId1, branch1Id, {
        roomNumber: '101',
        floorNumber: 1,
        totalBeds: 2,
        monthlyRate: 8000,
      });

      expect(room.roomCode).toBe('HYD001-B1-F1-R101');
      expect(beds).toHaveLength(2);
      expect(beds[0].bedCode).toBe('HYD001-R101-B01');
      expect(beds[1].bedCode).toBe('HYD001-R101-B02');
      expect(beds[0].status).toBe(BedStatus.AVAILABLE);

      bed1Id = beds[0]._id.toString();
      bed2Id = beds[1]._id.toString();

      // Create a bed in branch 2 for transfer testing
      const { beds: b2Beds } = await roomService.createRoom(orgId1, branch2Id, {
        roomNumber: '201',
        floorNumber: 2,
        totalBeds: 1,
        monthlyRate: 9000,
      });
      expect(b2Beds).toHaveLength(1);
    });
  });

  // PHASE 3: Student Admission & Customer Code
  describe('Phase 3: Student Admission & Bed Occupancy Lock', () => {
    it('should admit a student, generate permanent Customer Code, and occupy the bed', async () => {
      const student = await studentService.admitStudent(orgId1, branch1Id, {
        fullName: 'Aditya Varma',
        email: 'aditya.varma@example.com',
        phone: '+91 9876543210',
        bedId: bed1Id,
        admissionFee: 1000,
        securityDeposit: 5000,
      });

      expect(student.customerCode).toMatch(/^HYD001-ST/);
      expect(student.financialSummary.totalDemanded).toBe(14000); // 8000 rent + 1000 adm + 5000 dep
      expect(student.financialSummary.outstandingBalance).toBe(14000);
      studentId = student._id.toString();
      customerCode = student.customerCode;

      // Verify Bed 1 in DB is OCCUPIED
      const updatedBed = await BedModel.findById(bed1Id);
      expect(updatedBed?.status).toBe(BedStatus.OCCUPIED);
      expect(updatedBed?.currentCustomerCode).toBe(customerCode);
    });

    it('should PREVENT another student from occupying the same occupied bed', async () => {
      await expect(
        studentService.admitStudent(orgId1, branch1Id, {
          fullName: 'Second Student',
          email: 'second@example.com',
          phone: '+91 9876500000',
          bedId: bed1Id, // Already OCCUPIED
        })
      ).rejects.toThrow(/already OCCUPIED/);
    });
  });

  // PHASE 4: Fee Billing, Payments & Receipts
  describe('Phase 4: Fee Collection & Receipt Generation', () => {
    it('should record payment, reduce outstanding balance, generate receipt and ledger entry', async () => {
      const { payment, receipt } = await feeService.recordPayment(orgId1, {
        studentId,
        amount: 14000,
        paymentMethod: PaymentMethod.UPI,
        transactionRef: 'UPI-TEST-12345',
        receivedBy: 'Accountant',
      });

      expect(payment.status).toBe('SUCCESS');
      expect(receipt.receiptNumber).toMatch(/^HYD001-REC/);
      expect(receipt.qrPayload).toBeDefined();

      // Verify Student balance in MongoDB is now 0
      const student = await StudentModel.findById(studentId);
      expect(student?.financialSummary.outstandingBalance).toBe(0);
      expect(student?.financialSummary.totalPaid).toBe(14000);
    });
  });

  // PHASE 5: Finance & Real P&L Aggregation
  describe('Phase 5: Expenses & Profit/Loss Calculation', () => {
    it('should record expenses and compute accurate P&L through aggregation pipeline', async () => {
      await financeService.recordExpense(orgId1, branch1Id, {
        category: 'ELECTRICITY',
        amount: 4000,
        paidTo: 'Electricity Board',
      });

      await financeService.recordExpense(orgId1, branch1Id, {
        category: 'FOOD_PROVISIONS',
        amount: 6000,
        paidTo: 'Kitchen Provisions Ltd',
      });

      const pnl = await financeService.generateProfitAndLoss(orgId1);
      expect(pnl.income.totalIncome).toBe(14000);
      expect(pnl.expenses.totalExpenses).toBe(10000);
      expect(pnl.summary.netProfitOrLoss).toBe(4000);
      expect(pnl.summary.isProfitable).toBe(true);
    });
  });

  // PHASE 6: Student Transfer with Code Preservation
  describe('Phase 6: Inter-Branch Student Transfer', () => {
    it('should transfer student to Branch 2, retain permanent Customer Code, and update beds', async () => {
      const b2Beds = await BedModel.find({ organizationId: orgId1, branchId: branch2Id, status: BedStatus.AVAILABLE });
      expect(b2Beds.length).toBeGreaterThan(0);
      const targetBedId = b2Beds[0]._id.toString();

      const transferred = await studentService.transferStudent(orgId1, studentId, {
        targetBranchId: branch2Id,
        targetBedId,
        reason: 'Office relocation',
        approvedBy: 'Admin',
      });

      // Customer code MUST NOT change
      expect(transferred.customerCode).toBe(customerCode);
      expect(transferred.branchId).toBe(branch2Id);

      // Old bed MUST be AVAILABLE again
      const oldBed = await BedModel.findById(bed1Id);
      expect(oldBed?.status).toBe(BedStatus.AVAILABLE);

      // New bed MUST be OCCUPIED
      const newBed = await BedModel.findById(targetBedId);
      expect(newBed?.status).toBe(BedStatus.OCCUPIED);
      expect(newBed?.currentCustomerCode).toBe(customerCode);
    });
  });

  // PHASE 7: Complaints & Maintenance Lifecycle
  describe('Phase 7: Complaints Lifecycle', () => {
    it('should create complaint, assign staff, and resolve with maintenance cost', async () => {
      const complaint = await complaintService.createComplaint(orgId1, {
        studentId,
        category: 'PLUMBING',
        title: 'Geyser not heating water',
        description: 'Bathroom geyser power light is on but water is cold',
      });

      expect(complaint.complaintNumber).toMatch(/^HYD001-CMP/);
      expect(complaint.status).toBe(ComplaintStatus.OPEN);

      const inProgress = await complaintService.assignStaff(orgId1, complaint._id.toString(), 'EMP004', 'Govind Electrician');
      expect(inProgress.status).toBe(ComplaintStatus.IN_PROGRESS);

      const resolved = await complaintService.resolveComplaint(orgId1, complaint._id.toString(), {
        resolutionNotes: 'Replaced geyser heating element',
        maintenanceCost: 650,
      });

      expect(resolved.status).toBe(ComplaintStatus.RESOLVED);
      expect(resolved.maintenanceCost).toBe(650);
    });
  });

  // PHASE 8: Leave & Gate Pass Verification
  describe('Phase 8: Leave Application & Gate Pass', () => {
    it('should apply for leave, approve with QR gate pass, and verify at gate', async () => {
      const leave = await attendanceService.applyLeave(orgId1, {
        studentId,
        startDate: new Date(),
        endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        reason: 'Weekend Home Visit',
      });

      expect(leave.leaveNumber).toMatch(/^LVR-/);
      expect(leave.status).toBe(LeaveStatus.PENDING);

      const approved = await attendanceService.approveLeave(orgId1, leave._id.toString(), LeaveStatus.APPROVED, 'Warden');
      expect(approved.status).toBe(LeaveStatus.APPROVED);
      expect(approved.gatePassCode).toBe(\`GP-\${leave.leaveNumber}\`);
      expect(approved.gatePassQr).toBeDefined();

      const verifyOut = await attendanceService.verifyGatePass(orgId1, approved.gatePassCode!, 'EXIT');
      expect(verifyOut.success).toBe(true);
      expect(verifyOut.action).toBe('EXIT');
    });
  });

  // PHASE 9: Strict Multi-Tenant Isolation Verification
  describe('Phase 9: Strict Multi-Tenant Query Isolation', () => {
    it('should ensure Organization 2 cannot access Organization 1 students or financial data', async () => {
      // Querying Org 1 student using Org 2 context must return null
      const crossOrgStudent = await StudentModel.findOne({ _id: studentId, organizationId: orgId2 });
      expect(crossOrgStudent).toBeNull();

      // Org 2 list students must be empty
      const org2Students = await studentService.list(orgId2);
      expect(org2Students).toHaveLength(0);

      // Org 2 P&L must be 0
      const org2Pnl = await financeService.generateProfitAndLoss(orgId2);
      expect(org2Pnl.summary.totalIncome).toBe(0);
      expect(org2Pnl.summary.totalExpenses).toBe(0);
    });
  });
});
`);