import { connectDatabase, disconnectDatabase, query, queryOne, queryRows } from '../src/config/database';
import { runMigrations } from '../src/config/migrations';
import { authService } from '../src/modules/auth/auth.service';
import { hostelService } from '../src/modules/hostels/hostel.service';
import { roomService } from '../src/modules/rooms/room.service';
import { studentService } from '../src/modules/students/student.service';
import { feeService } from '../src/modules/fees/fee.service';
import { financeService } from '../src/modules/finance/finance.service';
import { complaintService } from '../src/modules/complaints/complaint.service';
import { attendanceService } from '../src/modules/attendance/attendance.service';
import bcrypt from 'bcryptjs';
import { messService } from '../src/modules/mess/mess.service';
import { paymentGatewayService } from '../src/modules/fees/payment-gateway.service';
import { feeReminderService } from '../src/modules/fees/fee-reminder.service';
import {
  BedStatus,
  ComplaintPriority,
  ComplaintStatus,
  LeaveStatus,
  PaymentMethod,
  PaymentPlan,
  InstallmentStatus,
  PaymentStatus,
  UserRole,
} from '../src/config/constants';

describe('IHMS ERP Production Test Suite (PostgreSQL Relational DB)', () => {
  let orgId1: string;
  let orgId2: string;
  let branch1Id: string;
  let branch2Id: string;
  let bed1Id: string;
  let bed2Id: string;
  let studentId: string;
  let customerCode: string;

  beforeAll(async () => {
    await connectDatabase();
    await runMigrations();
  }, 60000);

  afterAll(async () => {
    await disconnectDatabase();
  });

  // PHASE 1: Auth & Multi-Tenancy
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
      expect(result.user.role).toMatch(/OWNER/);
      expect(result.organization.orgCode).toMatch(/^(ORG-|IHMS-HST-)/);
      orgId1 = result.organization._id.toString();
    });

    it('should reject duplicate Owner registration and return existing hostel account metadata', async () => {
      try {
        await authService.registerOwner({
          orgName: 'Another Green Valley',
          ownerName: 'Vikram Sharma Duplicate',
          ownerEmail: 'vikram@greenvalley.com',
          ownerPassword: 'SecretPassword@123',
        });
        throw new Error('Should have failed');
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.message).toMatch(/already/i);
        expect(err.details).toBeDefined();
        expect(err.details.accountAlreadyExists).toBe(true);
        expect(err.details.organizationName).toBe('Green Valley Hostels Pvt Ltd');
        expect(err.details.maskedEmail).toBe('vi****@greenvalley.com');
      }
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

    it('should login with valid Admin email credentials and reject invalid passwords', async () => {
      const loginRes = await authService.login('vikram@greenvalley.com', 'SecretPassword@123', 'ADMIN');
      expect(loginRes.token).toBeDefined();
      expect(loginRes.user.email).toBe('vikram@greenvalley.com');

      // Wrong password
      await expect(authService.login('vikram@greenvalley.com', 'WrongPassword', 'ADMIN')).rejects.toThrow(/invalid admin \/ staff credentials/i);

      // Unknown user
      await expect(authService.login('unknown@example.com', 'SecretPassword@123', 'ADMIN')).rejects.toThrow(/invalid admin \/ staff credentials/i);
    });

    it('should allow Admin to login using Owner ID / Staff ID', async () => {
      const ownerUser = await queryOne<any>('SELECT * FROM users WHERE email = $1 AND role = $2', ['vikram@greenvalley.com', UserRole.OWNER]);
      expect(ownerUser?.user_id).toBeDefined();

      const loginRes = await authService.login(ownerUser!.ihms_id || ownerUser!.user_id!, 'SecretPassword@123', 'ADMIN');
      expect(loginRes.token).toBeDefined();
      expect(loginRes.user.email).toBe('vikram@greenvalley.com');
    });

    it('should REJECT Admin credentials when Student tab is selected', async () => {
      await expect(
        authService.login('vikram@greenvalley.com', 'SecretPassword@123', 'STUDENT')
      ).rejects.toThrow(/invalid student credentials/i);
    });

    it('should report database setup status accurately from PostgreSQL', async () => {
      const setup = await authService.getSystemSetupStatus();
      expect(setup.isSetupCompleted).toBe(true);
      expect(setup.hasOrganizations).toBe(true);
      expect(setup.organizationCount).toBeGreaterThanOrEqual(2);
      expect(setup.userCount).toBeGreaterThanOrEqual(2);
    });

    it('should retrieve authenticated user profile via getMe with organization and hostel metadata', async () => {
      const ownerUser = await queryOne<any>('SELECT * FROM users WHERE email = $1', ['vikram@greenvalley.com']);
      const profile = await authService.getMe(ownerUser.id);
      expect(profile.id).toBe(ownerUser.id);
      expect(profile.email).toBe('vikram@greenvalley.com');
      expect(profile.role).toBe('ORGANIZATION_OWNER');
      expect(profile.organizationId).toBe(orgId1);
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
      branch1Id = branch1.id || branch1._id.toString();
      expect(branch1.branchCode).toBe('HYD001');

      const branch2 = await hostelService.create(orgId1, {
        name: 'Green Valley Gachibowli Branch',
        branchCode: 'HYD002',
        type: 'BOYS',
        city: 'Hyderabad',
      });
      branch2Id = branch2.id || branch2._id.toString();
      expect(branch2.branchCode).toBe('HYD002');
    });

    it('should create Room and auto-generate Beds with permanent codes', async () => {
      const { room, beds } = await roomService.createRoom(orgId1, branch1Id, {
        roomNumber: '101',
        floorNumber: 1,
        totalBeds: 2,
        monthlyRate: 8000,
      });

      expect(room.roomCode).toMatch(/^IHM-.*-R-\d{4}$|^HYD001-B1-F1-R101$/);
      expect(beds).toHaveLength(2);
      expect(beds[0].bedCode).toMatch(/^IHM-.*-B-\d{4}$|^HYD001-R101-B01$/);
      expect(beds[1].bedCode).toMatch(/^IHM-.*-B-\d{4}$|^HYD001-R101-B02$/);
      expect(beds[0].status).toBe(BedStatus.AVAILABLE);

      bed1Id = beds[0].id || beds[0]._id.toString();
      bed2Id = beds[1].id || beds[1]._id.toString();

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

  // PHASE 3: Student Admission with Portal Access = DISABLED
  describe('Phase 3: Student Admission (Portal Access Disabled by Default)', () => {
    it('should admit a student, generate Customer Code, occupy bed, with portalAccess = false', async () => {
      const student = await studentService.admitStudent(orgId1, branch1Id, {
        fullName: 'Aditya Varma',
        email: 'aditya.varma@example.com',
        phone: '+91 9876543210',
        bedId: bed1Id,
        admissionFee: 1000,
        securityDeposit: 5000,
      });

      expect(student.customerCode).toMatch(/^IHM-[A-Z0-9]{2}-[A-Z0-9]{2}-S-\d{4}$/);
      expect(student.portalAccess).toBe('DISABLED'); // CORE BUSINESS RULE
      expect(student.financialSummary.totalDemanded).toBe(14000);
      expect(student.financialSummary.outstandingBalance).toBe(14000);
      studentId = student.id || student._id.toString();
      customerCode = student.customerCode;

      // Check bed status is OCCUPIED
      const bed = await queryOne<any>('SELECT * FROM beds WHERE id = $1', [bed1Id]);
      expect(bed?.status).toBe(BedStatus.OCCUPIED);
    });

    it('should prevent admitting another student to an already occupied bed', async () => {
      await expect(
        studentService.admitStudent(orgId1, branch1Id, {
          fullName: 'Second Student',
          email: 'second@example.com',
          phone: '+91 9876500000',
          bedId: bed1Id,
        })
      ).rejects.toThrow(/already OCCUPIED/i);
    });

    it('should BLOCK Student Login when portalAccess is false', async () => {
      await expect(
        authService.login(customerCode, 'AnyPassword', 'STUDENT')
      ).rejects.toThrow(/portal access is disabled/i);

      await expect(
        authService.login('aditya.varma@example.com', 'AnyPassword', 'STUDENT')
      ).rejects.toThrow(/portal access is disabled/i);
    });
  });

  // PHASE 4: Owner Grants Portal Access & Student 4-Digit Activation
  describe('Phase 4: Owner Grants Portal Access & Student Activation', () => {
    const studentPrivatePassword = 'MySecretPassword123!';

    it('should allow Owner to grant portal access and generate 4-digit activation OTP', async () => {
      const grantRes = await studentService.setPortalAccess(orgId1, studentId, 'GRANT');
      expect(grantRes.success).toBe(true);
      expect(grantRes.portalAccess).toBe(true);
      expect((grantRes as any).defaultPassword).toBeUndefined();

      // Student record must now reflect portalAccess = true and ACCESS_GRANTED
      const updatedStudent = await studentService.getById(orgId1, studentId);
      expect(updatedStudent.portalAccess).toBe('ENABLED');

      // Verify OTP generation and activate student account
      const testOtp = '4920';
      const otpHash = await bcrypt.hash(testOtp, 10);
      await query(
        "UPDATE otps SET otp_hash = $1 WHERE user_id = $2 AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION' AND used_at IS NULL",
        [otpHash, studentId]
      );

      const verifyRes = await authService.verifyStudentActivationOtp('aditya.varma@example.com', testOtp);
      expect(verifyRes.activationToken).toBeDefined();

      const actRes = await authService.activateStudentAccount(verifyRes.activationToken, studentPrivatePassword, studentPrivatePassword);
      expect(actRes.success).toBe(true);
    });

    it('should allow Student to login using Customer Code + Private Password', async () => {
      const loginRes = await authService.login(customerCode, studentPrivatePassword, 'STUDENT');
      expect(loginRes.token).toBeDefined();
      expect(loginRes.user.customerCode).toBe(customerCode);
    });

    it('should allow Student to login using Student Email + Private Password', async () => {
      const loginRes = await authService.login('aditya.varma@example.com', studentPrivatePassword, 'STUDENT');
      expect(loginRes.token).toBeDefined();
      expect(loginRes.user.email).toBe('aditya.varma@example.com');
    });

    it('should REJECT Student login when Admin tab is selected on login screen', async () => {
      await expect(
        authService.login(customerCode, studentPrivatePassword, 'ADMIN')
      ).rejects.toThrow(/invalid admin \/ staff credentials/i);
    });

    it('should allow Owner to REVOKE portal access and immediately block student login', async () => {
      const revokeRes = await studentService.setPortalAccess(orgId1, studentId, 'REVOKE');
      expect(revokeRes.success).toBe(true);
      expect(revokeRes.portalAccess).toBe(false);

      await expect(
        authService.login(customerCode, studentPrivatePassword, 'STUDENT')
      ).rejects.toThrow(/portal access is disabled/i);
    });

    it('should allow Owner to grant student portal access and perform 4-digit activation idempotently', async () => {
      // 1. Admit student with specific email
      const student = await studentService.admitStudent(orgId1, branch1Id, {
        fullName: 'Srinivas Bandari',
        email: 'srinivasbandari2803@gmail.com',
        phone: '+91 9848099999',
        bedId: bed2Id,
        admissionFee: 1000,
        securityDeposit: 5000,
      });

      expect(student.email).toBe('srinivasbandari2803@gmail.com');
      const sId = student.id;

      // 2. First Enable Access -> Generates 4-digit activation OTP
      const firstEnable = await studentService.setPortalAccess(orgId1, sId, 'GRANT');
      expect(firstEnable.success).toBe(true);
      expect(firstEnable.portalAccess).toBe(true);

      const testOtp = '8849';
      const otpHash = await bcrypt.hash(testOtp, 10);
      await query(
        "UPDATE otps SET otp_hash = $1 WHERE user_id = $2 AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION' AND used_at IS NULL",
        [otpHash, sId]
      );

      const verifyRes = await authService.verifyStudentActivationOtp('srinivasbandari2803@gmail.com', testOtp);
      await authService.activateStudentAccount(verifyRes.activationToken, 'Srinivas@123', 'Srinivas@123');

      // Verify login works with first password
      const firstLogin = await authService.login('srinivasbandari2803@gmail.com', 'Srinivas@123', 'STUDENT');
      expect(firstLogin.token).toBeDefined();
      expect(firstLogin.user.email).toBe('srinivasbandari2803@gmail.com');

      // 3. Second Enable Access (Idempotency - must NOT throw duplicate email error)
      const secondEnable = await studentService.setPortalAccess(orgId1, sId, 'GRANT');
      expect(secondEnable.success).toBe(true);
      expect(secondEnable.portalAccess).toBe(true);
    });
  });

  // PHASE 5: Fee Management, Payment Collection, Receipts & Ledger Recalculation
  describe('Phase 5: Fee Ledger, Payment Collections & Receipt Generation', () => {
    it('should fetch Student Fee Account with Installments and Demands', async () => {
      const feeAccount = await feeService.getStudentFeeAccount(orgId1, studentId);
      expect(feeAccount).toBeDefined();
      expect(feeAccount.totalFee).toBe(14000);
      expect(feeAccount.totalPaid).toBe(0);
      expect(feeAccount.balanceAmount).toBe(14000);
      expect(feeAccount.feeStatus).toBe('OVERDUE');
      expect(feeAccount.installments).toBeDefined();
    });

    it('should record a Payment, generate sequential Receipt Number, and update Student Ledger', async () => {
      const payResult = await feeService.recordPayment(orgId1, {
        studentId,
        amount: 6000,
        paymentMethod: PaymentMethod.UPI,
        transactionRef: 'UPI-TEST-1234',
        receivedBy: 'Vikram Sharma (Owner)',
        notes: 'Partial payment',
      });

      expect(payResult.payment).toBeDefined();
      expect(payResult.payment.status).toBe(PaymentStatus.SUCCESS);
      expect(payResult.receipt).toBeDefined();
      expect(payResult.receipt.receiptNumber).toMatch(/^RCP-\d{4}-\d{6}$/);
      expect(payResult.receipt.amount).toBe(6000);

      // Verify updated ledger
      const feeAccount = await feeService.getStudentFeeAccount(orgId1, studentId);
      expect(feeAccount.totalPaid).toBe(6000);
      expect(feeAccount.balanceAmount).toBe(8000);
      expect(feeAccount.feeStatus).toBe('PARTIAL');

      // Student summary updated
      const student = await studentService.getById(orgId1, studentId);
      expect(student.financialSummary.totalPaid).toBe(6000);
      expect(student.financialSummary.outstandingBalance).toBe(8000);
    });

    it('should generate official PDF buffer for the issued Receipt', async () => {
      const receipts = await feeService.listReceipts(orgId1, branch1Id, studentId);
      expect(receipts.length).toBeGreaterThan(0);

      const receiptNumber = receipts[0].receiptNumber || receipts[0].receipt_number;
      const { pdf, receipt } = await feeService.generateReceiptPdfByNumber(orgId1, receiptNumber);
      expect(pdf).toBeDefined();
      expect(Buffer.isBuffer(pdf)).toBe(true);
      expect(pdf.length).toBeGreaterThan(100);
      expect(receipt.receiptNumber).toBe(receiptNumber);
    });

    it('should apply an approved discount adjustment and reduce student outstanding balance', async () => {
      const adjRes = await feeService.recordApprovedAdjustment(orgId1, studentId, {
        amount: 1000,
        reason: 'Special early bird concession',
        approvedBy: 'Vikram Sharma (Owner)',
      });

      expect(adjRes.success).toBe(true);
      expect(adjRes.ledger.outstandingBalance).toBe(7000);
    });

    it('should complete full payment of remaining balance and mark Fee Status as PAID', async () => {
      const payResult = await feeService.recordPayment(orgId1, {
        studentId,
        amount: 7000,
        paymentMethod: PaymentMethod.CASH,
        receivedBy: 'Vikram Sharma',
      });

      expect(payResult.payment.status).toBe(PaymentStatus.SUCCESS);

      const feeAccount = await feeService.getStudentFeeAccount(orgId1, studentId);
      expect(feeAccount.balanceAmount).toBe(0);
      expect(feeAccount.feeStatus).toBe('PAID');
    });
  });

  // PHASE 6: Online Payment Gateway Flow & HMAC Signatures
  describe('Phase 6: Online Payment Gateway & Signature Verification', () => {
    let gatewayOrderId: string;
    let pendingPaymentId: string;

    beforeAll(async () => {
      await query("UPDATE fee_accounts SET allow_advance_payment = true WHERE student_id = $1", [studentId]);
      await query(
        `INSERT INTO payment_gateway_configs (id, organization_id, provider, environment, key_id, key_secret, webhook_secret, onboarding_status)
         VALUES ($1, $2, 'RAZORPAY', 'TEST', 'rzp_test_ihms_key123', 'sec_test_ihms_sec456', 'whsec_test_ihms_123', 'CONNECTED')
         ON CONFLICT (organization_id) DO UPDATE SET key_id = EXCLUDED.key_id, key_secret = EXCLUDED.key_secret, onboarding_status = 'CONNECTED'`,
        [`gw_ihms_${Date.now()}`, orgId1]
      );
    });

    it('should initiate an online payment and return a gateway order with client key', async () => {
      const orderRes = await feeService.initiatePayment(orgId1, studentId, {
        amount: 8000,
        paymentMethod: PaymentMethod.ONLINE,
      });

      expect(orderRes.paymentId).toBeDefined();
      expect(orderRes.gatewayOrderId).toMatch(/^order_/);
      expect(orderRes.amount).toBe(800000); // in paise
      expect(orderRes.keyId).toBeDefined();
      expect(orderRes.status).toBe('PENDING');

      gatewayOrderId = orderRes.gatewayOrderId;
      pendingPaymentId = orderRes.paymentId;
    });

    it('should reject payment verification with invalid signature', async () => {
      await expect(
        feeService.verifyAndConfirmPayment(orgId1, {
          paymentId: pendingPaymentId,
          gatewayOrderId,
          gatewayPaymentId: 'pay_test_9999',
          gatewaySignature: 'invalid_fraudulent_signature',
        })
      ).rejects.toThrow(/invalid cryptographic signature/i);
    });

    it('should successfully verify payment with valid HMAC signature and confirm transaction', async () => {
      const gatewayPaymentId = 'pay_test_valid_1234';
      const validSignature = paymentGatewayService.generateSignature(gatewayOrderId, gatewayPaymentId);

      const result = await feeService.verifyAndConfirmPayment(orgId1, {
        paymentId: pendingPaymentId,
        gatewayOrderId,
        gatewayPaymentId,
        gatewaySignature: validSignature,
      });

      expect(result.payment.status).toBe(PaymentStatus.SUCCESS);
      expect(result.receipt).toBeDefined();
    });
  });

  // PHASE 7: Student Room Transfer
  describe('Phase 7: Student Room Transfer with Bed Occupancy Transitions', () => {
    it('should transfer student from Branch 1 to Branch 2, freeing old bed and occupying new bed', async () => {
      const b2Rooms = await roomService.listRooms(orgId1, branch2Id);
      expect(b2Rooms.length).toBeGreaterThan(0);
      const targetBed = b2Rooms[0].beds[0];

      const transferred = await studentService.transferStudent(orgId1, studentId, {
        targetBranchId: branch2Id,
        targetBedId: targetBed.id || targetBed._id.toString(),
        reason: 'Relocated closer to office',
        approvedBy: 'Vikram Sharma (Owner)',
      });

      expect(transferred.branchId).toBe(branch2Id);
      expect(transferred.currentAssignment?.bedCode).toBe(targetBed.bedCode);

      // Verify Old Bed in Branch 1 is now AVAILABLE
      const oldBed = await queryOne<any>('SELECT * FROM beds WHERE id = $1', [bed1Id]);
      expect(oldBed?.status).toBe(BedStatus.AVAILABLE);

      // Verify New Bed in Branch 2 is OCCUPIED
      const newBed = await queryOne<any>('SELECT * FROM beds WHERE id = $1', [targetBed.id || targetBed._id]);
      expect(newBed?.status).toBe(BedStatus.OCCUPIED);
    });
  });

  // PHASE 8: Complaints, Attendance & Gate Pass
  describe('Phase 8: Operations - Complaints, Attendance & Gate Pass QR', () => {
    let complaintId: string;
    let gatePassCode: string;

    it('should create a complaint for a student', async () => {
      const complaint = await complaintService.createComplaint(orgId1, {
        studentId,
        category: 'PLUMBING',
        title: 'Bathroom tap leaking',
        description: 'Continuous dripping water.',
        priority: ComplaintPriority.MEDIUM,
      });

      expect(complaint.complaintNumber).toBeDefined();
      expect(complaint.status).toBe(ComplaintStatus.OPEN);
      complaintId = complaint.id || complaint._id.toString();
    });

    it('should assign staff and resolve complaint', async () => {
      const assigned = await complaintService.assignStaff(orgId1, complaintId, 'EMP001', 'Plumber Ravi');
      expect(assigned.status).toBe(ComplaintStatus.IN_PROGRESS);

      const resolved = await complaintService.resolveComplaint(orgId1, complaintId, {
        resolutionNotes: 'Replaced washer in tap.',
        maintenanceCost: 150,
      });
      expect(resolved.status).toBe(ComplaintStatus.RESOLVED);
    });

    it('should apply for leave and approve with Gate Pass QR', async () => {
      const leave = await attendanceService.applyLeave(orgId1, {
        studentId,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        reason: 'Visiting hometown for festival',
      });

      expect(leave.leaveNumber).toBeDefined();
      expect(leave.status).toBe('PENDING');

      const approved = await attendanceService.approveLeave(orgId1, leave.id || leave._id, LeaveStatus.APPROVED, 'Warden Ramesh');
      expect(approved.status).toBe(LeaveStatus.APPROVED);
      expect(approved.gatePassCode).toMatch(/^GP-/);
      expect(approved.gatePassQr).toMatch(/^data:image\/png;base64,/);
      gatePassCode = approved.gatePassCode;
    });

    it('should verify Gate Pass upon student EXIT and ENTRY', async () => {
      const exitRes = await attendanceService.verifyGatePass(orgId1, gatePassCode, 'EXIT');
      expect(exitRes.success).toBe(true);
      expect(exitRes.leave.actual_out_time || exitRes.leave.actualOutTime).toBeDefined();

      const entryRes = await attendanceService.verifyGatePass(orgId1, gatePassCode, 'ENTRY');
      expect(entryRes.success).toBe(true);
      expect(entryRes.leave.actual_in_time || entryRes.leave.actualInTime).toBeDefined();
    });
  });

  // PHASE 9: Weekly Mess Menus & Student Self-Service
  describe('Phase 9: Weekly Mess Menus (Draft/Publish & Student View)', () => {
    let menuId: string;

    it('should create a draft weekly mess menu', async () => {
      const menu = await messService.createMenu(orgId1, branch1Id, {
        weekStartDate: '2026-08-24',
        weekEndDate: '2026-08-30',
        status: 'DRAFT',
        days: [
          {
            day: 'Monday',
            breakfast: ['Idli', 'Sambar', 'Chutney', 'Tea'],
            lunch: ['Rice', 'Dal', 'Paneer Curry', 'Curd'],
            snacks: ['Samosa', 'Coffee'],
            dinner: ['Roti', 'Mixed Veg', 'Rice', 'Gulab Jamun'],
            isSpecial: true,
          },
        ],
      });

      expect(menu.status).toBe('DRAFT');
      menuId = menu.id || menu._id.toString();
    });

    it('should publish the mess menu and make it visible to students of that branch', async () => {
      const published = await messService.setPublishStatus(orgId1, menuId, 'PUBLISHED');
      expect(published.status).toBe('PUBLISHED');

      // Transfer student back to branch 1 to test branch-specific published menu
      await query('UPDATE students SET hostel_id = $1 WHERE id = $2', [branch1Id, studentId]);

      const studentMenu = await messService.getStudentPublishedMenu(orgId1, studentId);
      expect(studentMenu).toBeDefined();
      expect(studentMenu?.status).toBe('PUBLISHED');
      expect(studentMenu?.days[1].day).toBe('Monday');
    });
  });

  // PHASE 10: Multi-Tenant Data Isolation
  describe('Phase 10: Strict Multi-Tenant Data Isolation', () => {
    it('Organization 2 cannot view or access Organization 1 students, rooms, fees, or receipts', async () => {
      // Org 2 student list should be empty
      const org2Students = await studentService.list(orgId2);
      expect(org2Students).toHaveLength(0);

      // Org 2 cannot fetch Org 1 student by ID
      await expect(studentService.getById(orgId2, studentId)).rejects.toThrow(/not found/i);

      // Org 2 cannot fetch Org 1 fee accounts
      await expect(feeService.getStudentFeeAccount(orgId2, studentId)).rejects.toThrow(/not found/i);

      // Org 2 rooms list should be empty
      const org2Rooms = await roomService.listRooms(orgId2);
      expect(org2Rooms).toHaveLength(0);

      // Org 2 payments list should be empty
      const org2Payments = await feeService.listPayments(orgId2, {});
      expect(org2Payments).toHaveLength(0);
    });
  });

  // PHASE 11: Student Update and Permanent Removal Flow
  describe('Phase 11: Student Update & Permanent Removal Flow', () => {
    it('should update student personal and guardian details', async () => {
      const updated = await studentService.updateStudent(orgId1, studentId, {
        fullName: 'Aditya Varma Updated',
        phone: '+91 9999988888',
        guardianName: 'Suresh Varma',
        guardianPhone: '+91 8888877777',
      });

      expect(updated.name).toBe('Aditya Varma Updated');
      expect(updated.phone).toBe('+91 9999988888');
      expect(updated.guardian.name).toBe('Suresh Varma');
    });

    it('should reject deleting student from a different organization', async () => {
      await expect(studentService.removeStudent(orgId2, studentId)).rejects.toThrow(/not found/i);
    });

    it('should reject deleting with a non-existent student ID', async () => {
      await expect(studentService.removeStudent(orgId1, 'non-existent-uuid')).rejects.toThrow(/not found/i);
    });

    it('should permanently remove student, free up bed, and delete dependent records', async () => {
      // Find which bed student currently occupies
      const studentBefore = await studentService.getById(orgId1, studentId);
      const studentBedId = studentBefore.bedId;

      const deleteRes = await studentService.removeStudent(orgId1, studentId);
      expect(deleteRes.success).toBe(true);
      expect(deleteRes.studentId).toBe(studentId);

      // Student must no longer exist in organization
      await expect(studentService.getById(orgId1, studentId)).rejects.toThrow(/not found/i);

      // Bed must be freed and marked AVAILABLE
      if (studentBedId) {
        const bedAfter = await queryOne<any>('SELECT * FROM beds WHERE id = $1', [studentBedId]);
        expect(bedAfter?.status).toBe(BedStatus.AVAILABLE);
        expect(bedAfter?.current_student_id).toBeNull();
      }

      // User account must be deleted
      const userAfter = await queryOne<any>('SELECT * FROM users WHERE student_id = $1', [studentId]);
      expect(userAfter).toBeFalsy();

      // Fee accounts & demands must be cleaned up
      const feeAccounts = await queryRows<any>('SELECT * FROM fee_accounts WHERE student_id = $1', [studentId]);
      expect(feeAccounts).toHaveLength(0);
    });
  });
});
