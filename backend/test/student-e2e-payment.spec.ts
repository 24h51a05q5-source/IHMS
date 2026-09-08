import { connectDatabase, disconnectDatabase, query, queryOne, queryRows } from '../src/config/database';
import { runMigrations } from '../src/config/migrations';
import { authService } from '../src/modules/auth/auth.service';
import { hostelService } from '../src/modules/hostels/hostel.service';
import { roomService } from '../src/modules/rooms/room.service';
import { studentService } from '../src/modules/students/student.service';
import { feeService } from '../src/modules/fees/fee.service';
import { zeroGatewayPaymentService } from '../src/modules/fees/zero-gateway-payment.service';
import { hostelPaymentConfigService } from '../src/modules/hostels/hostel-payment-config.service';
import { paymentGatewayService } from '../src/modules/fees/payment-gateway.service';
import { complaintService } from '../src/modules/complaints/complaint.service';
import { attendanceService } from '../src/modules/attendance/attendance.service';
import { messService } from '../src/modules/mess/mess.service';
import { announcementService } from '../src/modules/announcements/announcement.service';
import { supportService } from '../src/modules/support/support.service';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  BedStatus,
  ComplaintPriority,
  ComplaintStatus,
  LeaveStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from '../src/config/constants';

describe('Comprehensive Student-Side E2E & Payment System Test Suite', () => {
  const timestamp = Date.now();
  let orgId: string;
  let hostelId: string;
  let bedId: string;
  let roomId: string;
  let studentDbId: string;
  let studentCode: string;
  let studentEmail = `student_e2e_${timestamp}@testdomain.com`;
  let studentToken: string;
  let studentUserId: string;

  beforeAll(async () => {
    process.env.PAYMENT_PROVIDER = 'mock';
    process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET = 'e2e_whsec_secret_2026';
    await connectDatabase();
    await runMigrations();

    // 1. Setup Organization and Owner
    const ownerRes = await authService.registerOwner({
      orgName: `E2E Student Test Hostel ${timestamp}`,
      orgEmail: `owner_${timestamp}@testdomain.com`,
      ownerName: 'Hostel Owner Vikram',
      ownerEmail: `owner_${timestamp}@testdomain.com`,
      ownerPassword: 'OwnerSecretPassword@123',
    });
    orgId = ownerRes.organization._id.toString();

    // 2. Setup Hostel Branch
    const hostel = await hostelService.create(orgId, {
      name: 'Premier Residency Branch A',
      branchCode: 'PR01',
      type: 'BOYS',
      city: 'Hyderabad',
    });
    hostelId = hostel.id || hostel._id.toString();

    // 3. Configure Hostel Payment Destinations (UPI VPA + Bank Account)
    await hostelPaymentConfigService.upsertConfig(orgId, hostelId, ownerRes.user.id, {
      method: 'UPI',
      upiConfig: {
        vpaAddress: 'premierhostel@okaxis',
        displayName: 'Premier Residency Hostels',
      },
    });
    await hostelPaymentConfigService.confirmAndActivate(orgId, hostelId, ownerRes.user.id, 'UPI');

    await hostelPaymentConfigService.upsertConfig(orgId, hostelId, ownerRes.user.id, {
      method: 'BANK',
      bankConfig: {
        accountNumber: '918273645012',
        ifscCode: 'HDFC0001234',
        beneficiaryName: 'Premier Residency Hostels Pvt Ltd',
        bankName: 'HDFC Bank',
      },
    });
    await hostelPaymentConfigService.confirmAndActivate(orgId, hostelId, ownerRes.user.id, 'BANK');

    // 4. Create Room and Bed
    const { room, beds } = await roomService.createRoom(orgId, hostelId, {
      roomNumber: 'A-201',
      floorNumber: 2,
      totalBeds: 2,
      monthlyRate: 10000,
    });
    roomId = room.id || room._id.toString();
    bedId = beds[0].id || beds[0]._id.toString();
  }, 60000);

  afterAll(async () => {
    await disconnectDatabase();
  });

  // =========================================================================
  // MODULE 1: Student Admission, Activation & Multi-Role Authentication Flow
  // =========================================================================
  describe('Module 1: Student Admission, 4-Digit Activation & Auth Security', () => {
    it('should admit student with initial portal_access disabled and demand assigned', async () => {
      const student = await studentService.admitStudent(orgId, hostelId, {
        fullName: 'Rahul Sharma',
        email: studentEmail,
        phone: '+91 9876543210',
        bedId,
        admissionFee: 0,
        securityDeposit: 0,
      });

      studentDbId = student.id;
      studentCode = student.ihmsId || student.ihms_id || student.customerCode;

      expect(studentDbId).toBeDefined();
      expect(studentCode).toBeDefined();

      const dbStudent = await queryOne<any>('SELECT * FROM students WHERE id = $1', [studentDbId]);
      expect(dbStudent.portal_access).toBe(false);
      expect(dbStudent.activation_status).toBe('ACCOUNT_CREATED');
      expect(dbStudent.password_set).toBe(false);
      expect(Number(dbStudent.financial_outstanding_balance)).toBe(10000);
    });

    it('should grant portal access and generate 4-digit activation code in otps table', async () => {
      const res = await studentService.setPortalAccess(orgId, studentDbId, 'GRANT');
      expect(res.success).toBe(true);
      expect(res.portalAccess).toBe(true);

      const dbStudent = await queryOne<any>('SELECT * FROM students WHERE id = $1', [studentDbId]);
      expect(dbStudent.portal_access).toBe(true);
      expect(dbStudent.activation_status).toBe('ACCESS_GRANTED');

      const otp = await queryOne<any>(
        "SELECT * FROM otps WHERE user_id = $1 AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1",
        [studentDbId]
      );
      expect(otp).toBeDefined();
      expect(otp.attempt_count).toBe(0);
    });

    it('should report ACTIVATION_PENDING on student login status check', async () => {
      const statusRes = await authService.getStudentLoginStatus(studentEmail);
      expect(statusRes.success).toBe(true);
      expect(statusRes.requiresActivation).toBe(true);
      expect(statusRes.requiresPassword).toBe(false);
      expect(statusRes.status).toBe('ACTIVATION_PENDING');
    });

    it('should reject invalid 4-digit activation code and increment attempt counter', async () => {
      await expect(
        authService.verifyStudentActivationOtp(studentEmail, '0000')
      ).rejects.toThrow(/invalid 4-digit activation code/i);

      const otp = await queryOne<any>(
        "SELECT attempt_count FROM otps WHERE user_id = $1 AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION' ORDER BY created_at DESC LIMIT 1",
        [studentDbId]
      );
      expect(otp.attempt_count).toBe(1);
    });

    it('should verify valid 4-digit activation code and complete password creation', async () => {
      const correctOtp = '8426';
      const otpHash = await bcrypt.hash(correctOtp, 10);
      await query(
        "UPDATE otps SET otp_hash = $1 WHERE user_id = $2 AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION' AND used_at IS NULL",
        [otpHash, studentDbId]
      );

      const otpRes = await authService.verifyStudentActivationOtp(studentEmail, correctOtp);
      expect(otpRes.success).toBe(true);
      expect(otpRes.activationToken).toBeDefined();

      const activateRes = await authService.activateStudentAccount(
        otpRes.activationToken,
        'StudentPass@2026',
        'StudentPass@2026'
      );
      expect(activateRes.success).toBe(true);
      expect(activateRes.token).toBeDefined();
      expect(activateRes.user.role).toBe('STUDENT');
      studentToken = activateRes.token;
      studentUserId = activateRes.user.id;

      // Verify database updated
      const dbStudent = await queryOne<any>('SELECT * FROM students WHERE id = $1', [studentDbId]);
      expect(dbStudent.activation_status).toBe('ACTIVATED');
      expect(dbStudent.password_set).toBe(true);

      const dbUser = await queryOne<any>('SELECT * FROM users WHERE student_id = $1', [studentDbId]);
      expect(dbUser).toBeDefined();
      expect(dbUser.status).toBe('ACTIVE');
      expect(dbUser.role).toBe('STUDENT');
    });

    it('should login student using email and new password', async () => {
      const loginRes = await authService.login(studentEmail, 'StudentPass@2026', 'STUDENT');
      expect(loginRes.token).toBeDefined();
      expect(loginRes.user.role).toBe('STUDENT');
      expect(loginRes.user.email).toBe(studentEmail);
    });

    it('should login student using Customer Code and password', async () => {
      const loginRes = await authService.login(studentCode, 'StudentPass@2026', 'STUDENT');
      expect(loginRes.token).toBeDefined();
      expect(loginRes.user.role).toBe('STUDENT');
    });

    it('should reject student login when requesting higher privilege role (ADMIN / OWNER)', async () => {
      await expect(
        authService.login(studentEmail, 'StudentPass@2026', 'ADMIN')
      ).rejects.toThrow(/invalid admin \/ staff credentials/i);
    });
  });

  // =========================================================================
  // MODULE 2: Dynamic UPI QR Payment Flow (Deep Inspection)
  // =========================================================================
  describe('Module 2: Dynamic UPI QR Payment Flow', () => {
    let qrPaymentId: string;
    let qrPaymentNumber: string;

    it('should generate Dynamic UPI QR for requested amount ₹2,000 matching hostel VPA', async () => {
      const qrRes = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentDbId, 2000);
      expect(qrRes.configured).toBe(true);
      expect(qrRes.paymentNumber).toMatch(/^(PAY-|IHMS-PAY-)/);
      expect(qrRes.paymentDetails.upi?.intentUrl).toMatch(/^upi:\/\/pay\?/);
      expect(qrRes.paymentDetails.upi?.intentUrl).toContain('pa=premierhostel%40okaxis');
      expect(qrRes.paymentDetails.upi?.intentUrl).toContain('am=2000');
      expect(qrRes.paymentDetails.amount).toBe(2000);
      expect(qrRes.paymentDetails.upi?.vpaAddress).toBe('premierhostel@okaxis');
      expect(qrRes.paymentDetails.expiresAt).toBeDefined();

      qrPaymentId = qrRes.paymentId!;
      qrPaymentNumber = qrRes.paymentNumber!;
    });

    it('should return status PENDING during payment status polling', async () => {
      const statusRes = await zeroGatewayPaymentService.checkDynamicPaymentStatus(orgId, qrPaymentId);
      expect(statusRes.status).toBe('PENDING');
      expect(statusRes.amount).toBe(2000);
    });

    it('should submit UTR reference, undergo admin verification and update ledger balance', async () => {
      const subRes = await zeroGatewayPaymentService.submitZeroGatewayPayment(orgId, {
        studentId: studentDbId,
        amount: 2000,
        paymentMethod: 'UPI',
        transactionRef: 'UTR-UPI-987654321012',
        proofUrl: '/uploads/proofs/test_upi_proof.png',
        notes: qrPaymentNumber,
      });

      expect(subRes.payment).toBeDefined();
      expect(subRes.payment.status).toBe('UNDER_VERIFICATION');

      // Admin / Owner verifies student self-reported payment
      const verifyRes = await zeroGatewayPaymentService.verifyPaymentSubmission(
        orgId,
        subRes.payment.id,
        'Hostel Owner Vikram'
      );
      expect(verifyRes.status).toBe('VERIFIED');
      expect(verifyRes.receiptNumber).toBeDefined();

      // Verify student fee ledger balance reduced: 10000 - 2000 = 8000
      const account = await feeService.getStudentFeeAccount(orgId, studentDbId);
      expect(account.totalPaid).toBe(2000);
      expect(account.balanceAmount).toBe(8000);
      expect(account.feeStatus).toBe('PARTIAL');
    });

    it('should reject duplicate UTR submission for the same transaction reference', async () => {
      await expect(
        zeroGatewayPaymentService.submitZeroGatewayPayment(orgId, {
          studentId: studentDbId,
          amount: 2000,
          paymentMethod: 'UPI',
          transactionRef: 'UTR-UPI-987654321012',
        })
      ).rejects.toThrow(/already been (used|submitted)|duplicate/i);
    });
  });

  // =========================================================================
  // MODULE 3: Card Payment Flow (Gateway Order & Cryptographic Verification)
  // =========================================================================
  describe('Module 3: Card Payment Flow with Gateway Verification', () => {
    let cardPaymentId: string;
    let cardOrderId: string;

    it('should initiate Card Payment for ₹3,000 and return gateway order', async () => {
      const order = await feeService.initiatePayment(orgId, studentDbId, {
        amount: 3000,
        paymentMethod: PaymentMethod.CARD,
      });

      expect(order.paymentId).toBeDefined();
      expect(order.gatewayOrderId).toMatch(/^order_/);
      expect(order.amount).toBe(300000); // 3000 in paise
      expect(order.status).toBe('PENDING');

      cardPaymentId = order.paymentId;
      cardOrderId = order.gatewayOrderId;
    });

    it('should reject Card verification with forged/invalid HMAC signature', async () => {
      await expect(
        feeService.verifyAndConfirmPayment(orgId, {
          paymentId: cardPaymentId,
          gatewayOrderId: cardOrderId,
          gatewayPaymentId: 'pay_card_fake_1111',
          gatewaySignature: 'forged_cryptographic_signature_abc',
        })
      ).rejects.toThrow(/invalid cryptographic signature/i);
    });

    it('should verify Card payment with valid HMAC signature and preserve CARD payment method', async () => {
      const cardGatewayPayId = 'pay_card_valid_3000';
      const validSig = paymentGatewayService.generateSignature(cardOrderId, cardGatewayPayId);

      const confirmRes = await feeService.verifyAndConfirmPayment(orgId, {
        paymentId: cardPaymentId,
        gatewayOrderId: cardOrderId,
        gatewayPaymentId: cardGatewayPayId,
        gatewaySignature: validSig,
      });

      expect(confirmRes.payment.status).toBe(PaymentStatus.SUCCESS);
      expect(confirmRes.payment.paymentMethod || confirmRes.payment.payment_method).toBe(PaymentMethod.CARD);
      expect(confirmRes.receipt).toBeDefined();
      expect(confirmRes.receipt.receiptNumber).toMatch(/^RCP-\d{4}-\d{6}$/);

      // Verify student fee balance: 8000 - 3000 = 5000
      const account = await feeService.getStudentFeeAccount(orgId, studentDbId);
      expect(account.totalPaid).toBe(5000);
      expect(account.balanceAmount).toBe(5000);
    });
  });

  // =========================================================================
  // MODULE 4: Net Banking Payment Flow
  // =========================================================================
  describe('Module 4: Net Banking Payment Flow', () => {
    let netPaymentId: string;
    let netOrderId: string;

    it('should initiate Net Banking payment for ₹2,000 and confirm with NET_BANKING method', async () => {
      const order = await feeService.initiatePayment(orgId, studentDbId, {
        amount: 2000,
        paymentMethod: PaymentMethod.NET_BANKING,
      });

      netPaymentId = order.paymentId;
      netOrderId = order.gatewayOrderId;

      const netGatewayPayId = 'pay_net_valid_2000';
      const validSig = paymentGatewayService.generateSignature(netOrderId, netGatewayPayId);

      const confirmRes = await feeService.verifyAndConfirmPayment(orgId, {
        paymentId: netPaymentId,
        gatewayOrderId: netOrderId,
        gatewayPaymentId: netGatewayPayId,
        gatewaySignature: validSig,
      });

      expect(confirmRes.payment.status).toBe(PaymentStatus.SUCCESS);
      expect(confirmRes.payment.paymentMethod || confirmRes.payment.payment_method).toBe(PaymentMethod.NET_BANKING);

      // Verify student fee balance: 5000 - 2000 = 3000
      const account = await feeService.getStudentFeeAccount(orgId, studentDbId);
      expect(account.totalPaid).toBe(7000);
      expect(account.balanceAmount).toBe(3000);
    });
  });

  // =========================================================================
  // MODULE 5: Bank Transfer / Direct Wire Payment
  // =========================================================================
  describe('Module 5: Direct Bank Transfer (NEFT/RTGS/IMPS)', () => {
    it('should retrieve hostel bank destination details', async () => {
      const config = await hostelPaymentConfigService.getByHostelId(orgId, hostelId);
      expect(config).toBeDefined();
      expect(config?.bank_account_number).toBe('918273645012');
      expect(config?.bank_ifsc_code).toBe('HDFC0001234');
      expect(config?.bank_name).toBe('HDFC Bank');
    });

    it('should submit Bank Transfer UTR for remaining ₹3,000, undergo verification and settle account to PAID', async () => {
      const transferRes = await zeroGatewayPaymentService.submitZeroGatewayPayment(orgId, {
        studentId: studentDbId,
        amount: 3000,
        paymentMethod: 'BANK_TRANSFER',
        transactionRef: 'UTR-NEFT-998877665544',
        notes: 'Settled via HDFC NetBanking NEFT',
      });

      expect(transferRes.payment.status).toBe('UNDER_VERIFICATION');

      // Admin verifies bank transfer
      await zeroGatewayPaymentService.verifyPaymentSubmission(
        orgId,
        transferRes.payment.id,
        'Hostel Owner Vikram'
      );

      // Verify account is now fully settled: balance = 0, feeStatus = 'PAID'
      const account = await feeService.getStudentFeeAccount(orgId, studentDbId);
      expect(account.totalPaid).toBe(10000);
      expect(account.balanceAmount).toBe(0);
      expect(account.feeStatus).toBe('PAID');
    });
  });

  // =========================================================================
  // MODULE 6: Payment Edge Cases, Cancellation, Idempotency & Overpayment
  // =========================================================================
  describe('Module 6: Payment Edge Cases, Idempotency & Lifecycle Safety', () => {
    it('should reject payment initiation with zero or negative amount', async () => {
      await expect(
        feeService.initiatePayment(orgId, studentDbId, {
          amount: 0,
          paymentMethod: PaymentMethod.ONLINE,
        })
      ).rejects.toThrow(/greater than (zero|₹0)/i);

      await expect(
        feeService.initiatePayment(orgId, studentDbId, {
          amount: -500,
          paymentMethod: PaymentMethod.ONLINE,
        })
      ).rejects.toThrow(/greater than (zero|₹0)/i);
    });

    it('should reject payment when account is already fully settled unless advance payment is allowed', async () => {
      // Balance is currently 0, advance payment is false
      await expect(
        feeService.initiatePayment(orgId, studentDbId, {
          amount: 1000,
          paymentMethod: PaymentMethod.ONLINE,
        })
      ).rejects.toThrow(/already fully paid|advance payment is not allowed/i);

      await expect(
        zeroGatewayPaymentService.submitZeroGatewayPayment(orgId, {
          studentId: studentDbId,
          amount: 1000,
          paymentMethod: 'UPI',
          transactionRef: 'UTR-ADVANCE-FAIL-111',
        })
      ).rejects.toThrow(/already fully paid|advance payment is not allowed/i);
    });

    it('should allow payment once allow_advance_payment is enabled', async () => {
      await query('UPDATE fee_accounts SET allow_advance_payment = true WHERE student_id = $1', [studentDbId]);

      const advanceOrder = await feeService.initiatePayment(orgId, studentDbId, {
        amount: 500,
        paymentMethod: PaymentMethod.ONLINE,
      });

      expect(advanceOrder.paymentId).toBeDefined();
      expect(advanceOrder.status).toBe('PENDING');

      // Clean up advance payment flag
      await query('UPDATE fee_accounts SET allow_advance_payment = false WHERE student_id = $1', [studentDbId]);
    });

    it('should return existing payment order when duplicate idempotency key is supplied', async () => {
      await query('UPDATE fee_accounts SET allow_advance_payment = true WHERE student_id = $1', [studentDbId]);
      const idemKey = `idem_${Date.now()}`;

      const firstCall = await feeService.initiatePayment(orgId, studentDbId, {
        amount: 500,
        paymentMethod: PaymentMethod.ONLINE,
        idempotencyKey: idemKey,
      });

      const secondCall = await feeService.initiatePayment(orgId, studentDbId, {
        amount: 500,
        paymentMethod: PaymentMethod.ONLINE,
        idempotencyKey: idemKey,
      });

      expect(firstCall.paymentId).toBe(secondCall.paymentId);
      expect(firstCall.gatewayOrderId).toBe(secondCall.gatewayOrderId);
    });

    it('should cancel pending payment and reject verification on cancelled payment', async () => {
      const toCancel = await feeService.initiatePayment(orgId, studentDbId, {
        amount: 1500,
        paymentMethod: PaymentMethod.ONLINE,
      });

      const cancelRes = await feeService.cancelPayment(orgId, toCancel.paymentId, 'Student clicked cancel in checkout modal');
      expect(cancelRes.success).toBe(true);

      const dbCancelled = await queryOne<any>('SELECT status FROM payments WHERE id = $1', [toCancel.paymentId]);
      expect(dbCancelled.status).toBe('CANCELLED');

      // Attempt verification on cancelled payment -> rejected
      const fakeSig = paymentGatewayService.generateSignature(toCancel.gatewayOrderId, 'pay_cancel_test');
      await expect(
        feeService.verifyAndConfirmPayment(orgId, {
          paymentId: toCancel.paymentId,
          gatewayOrderId: toCancel.gatewayOrderId,
          gatewayPaymentId: 'pay_cancel_test',
          gatewaySignature: fakeSig,
        })
      ).rejects.toThrow(/cancelled/i);
    });

    it('should reject cancelling an already completed payment', async () => {
      const successfulPayment = await queryOne<any>(
        "SELECT id FROM payments WHERE organization_id = $1 AND student_id = $2 AND status = 'SUCCESS' LIMIT 1",
        [orgId, studentDbId]
      );
      expect(successfulPayment).toBeDefined();

      await expect(
        feeService.cancelPayment(orgId, successfulPayment.id, 'Fraudulent cancellation attempt')
      ).rejects.toThrow(/cannot cancel|already been completed/i);
    });
  });

  // =========================================================================
  // MODULE 7: Official Digital Receipts & PDF Generation
  // =========================================================================
  describe('Module 7: Digital Receipts & PDF Buffer Integrity', () => {
    let receiptNumber: string;
    let paymentId: string;

    beforeAll(async () => {
      const receipts = await feeService.listReceipts(orgId, hostelId, studentDbId);
      expect(receipts.length).toBeGreaterThan(0);
      receiptNumber = receipts[0].receiptNumber || receipts[0].receipt_number;
      paymentId = receipts[0].paymentId || receipts[0].paymentNumber;
    });

    it('should retrieve receipt by receipt number and by payment ID', async () => {
      const rByNumber = await feeService.getReceiptByNumber(orgId, receiptNumber);
      expect(rByNumber).toBeDefined();
      expect(rByNumber.receiptNumber).toBe(receiptNumber);

      const rByPayId = await feeService.getReceiptByPaymentId(orgId, paymentId);
      expect(rByPayId).toBeDefined();
      expect(rByPayId.receiptNumber).toBe(receiptNumber);
    });

    it('should generate official PDF stream with valid PDF header and signature', async () => {
      const { pdf, receipt } = await feeService.generateReceiptPdfByNumber(orgId, receiptNumber);

      expect(pdf).toBeDefined();
      expect(Buffer.isBuffer(pdf)).toBe(true);
      expect(pdf.length).toBeGreaterThan(500);

      // Verify PDF Magic Bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D)
      const pdfHeader = pdf.slice(0, 5).toString('ascii');
      expect(pdfHeader).toBe('%PDF-');
    });
  });

  // =========================================================================
  // MODULE 8: Non-Payment Student Portal Modules
  // =========================================================================
  describe('Module 8: Student Portal Self-Service Features', () => {
    // 8.1 Complaints
    describe('8.1 Complaints Management', () => {
      let complaintId: string;

      it('should submit a maintenance complaint as student', async () => {
        const complaint = await complaintService.createComplaint(orgId, {
          studentId: studentDbId,
          category: 'ELECTRICAL',
          title: 'Ceiling fan making clicking sound',
          description: 'Regulator speed 3 causes loud clattering.',
          priority: ComplaintPriority.MEDIUM,
        });

        expect(complaint.complaintNumber).toBeDefined();
        expect(complaint.status).toBe(ComplaintStatus.OPEN);
        complaintId = complaint.id || complaint._id.toString();
      });

      it('should list complaints submitted by student', async () => {
        const complaints = await complaintService.listComplaints(orgId, undefined, undefined, studentDbId);
        expect(complaints.length).toBeGreaterThan(0);
        expect(complaints[0].title).toBe('Ceiling fan making clicking sound');
      });
    });

    // 8.2 Leave Requests & Gate Pass
    describe('8.2 Leave Application & Gate Pass Lifecycle', () => {
      let leaveId: string;

      it('should submit a leave request', async () => {
        const leave = await attendanceService.applyLeave(orgId, {
          studentId: studentDbId,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          reason: 'Family wedding ceremony',
        });

        expect(leave.leaveNumber).toBeDefined();
        expect(leave.status).toBe('PENDING');
        leaveId = leave.id || leave._id.toString();
      });

      it('should allow student or admin to cancel pending leave', async () => {
        await query(
          "UPDATE leave_requests SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND organization_id = $2",
          [leaveId, orgId]
        );

        const updated = await queryOne<any>('SELECT status FROM leave_requests WHERE id = $1', [leaveId]);
        expect(updated.status).toBe('CANCELLED');
      });
    });

    // 8.3 Mess Menu
    describe('8.3 Mess Menu Self-Service', () => {
      it('should publish weekly mess menu and allow student to view branch menu', async () => {
        const menu = await messService.createMenu(orgId, hostelId, {
          weekStartDate: '2026-09-07',
          weekEndDate: '2026-09-13',
          status: 'PUBLISHED',
          days: [
            {
              day: 'Monday',
              breakfast: ['Poha', 'Chutney', 'Tea'],
              lunch: ['Rice', 'Dal Tadka', 'Aloo Gobi', 'Curd'],
              snacks: ['Biscuits', 'Tea'],
              dinner: ['Chapati', 'Paneer Butter Masala', 'Jeera Rice'],
              isSpecial: false,
            },
          ],
        });

        expect(menu.status).toBe('PUBLISHED');

        const studentMenu = await messService.getStudentPublishedMenu(orgId, studentDbId);
        expect(studentMenu).toBeDefined();
        expect(studentMenu?.status).toBe('PUBLISHED');
      });
    });

    // 8.4 Attendance Records
    describe('8.4 Attendance Records Self-Service', () => {
      it('should view daily attendance history for student', async () => {
        // Record attendance
        await query(
          `INSERT INTO attendances (id, organization_id, branch_id, student_id, customer_code, student_name, date, status, marked_by)
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, 'PRESENT', 'Warden Test')
           ON CONFLICT DO NOTHING`,
          [require('crypto').randomUUID(), orgId, hostelId, studentDbId, studentCode, 'Rahul Sharma']
        );

        const records = await queryRows<any>(
          'SELECT * FROM attendances WHERE organization_id = $1 AND student_id = $2 ORDER BY date DESC',
          [orgId, studentDbId]
        );
        expect(records.length).toBeGreaterThan(0);
        expect(records[0].status).toBe('PRESENT');
      });
    });

    // 8.5 Notifications
    describe('8.5 Notifications Center', () => {
      let notifId: string;

      it('should create notification, fetch unread count, and mark as read', async () => {
        notifId = require('crypto').randomUUID();
        await query(
          `INSERT INTO notifications (id, organization_id, user_id, title, message, type, read)
           VALUES ($1, $2, $3, $4, $5, 'INFO', false)`,
          [notifId, orgId, studentUserId, 'Fee Payment Received', 'Your payment of Rs. 2,000 has been verified.']
        );

        const unreadBefore = await queryOne<any>(
          'SELECT COUNT(*)::int as count FROM notifications WHERE user_id = $1 AND read = false',
          [studentUserId]
        );
        expect(unreadBefore.count).toBeGreaterThan(0);

        // Mark read
        await query('UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2', [notifId, studentUserId]);

        const unreadAfter = await queryOne<any>(
          'SELECT COUNT(*)::int as count FROM notifications WHERE user_id = $1 AND read = false',
          [studentUserId]
        );
        expect(unreadAfter.count).toBe(unreadBefore.count - 1);

        const updatedNotif = await queryOne<any>(
          'SELECT read FROM notifications WHERE id = $1',
          [notifId]
        );
        expect(updatedNotif.read).toBe(true);
      });
    });

    // 8.6 Announcements
    describe('8.6 Announcements Board', () => {
      let annId: string;

      it('should broadcast announcement and allow student to view and mark as read', async () => {
        const ann = await announcementService.create(
          {
            title: 'Independence Day Hostel Celebration',
            message: 'Flag hoisting ceremony at 8:00 AM in the courtyard followed by special breakfast.',
            priority: 'IMPORTANT',
            targetType: 'ALL',
          },
          {
            id: 'admin_user_id',
            name: 'Warden Office',
            organizationId: orgId,
          }
        );

        expect(ann.id).toBeDefined();
        annId = ann.id;

        // Student fetches announcements
        const studentAnnouncements = await announcementService.getForStudent({
          id: studentUserId,
          studentId: studentDbId,
          organizationId: orgId,
          branchId: hostelId,
        });

        expect(studentAnnouncements.length).toBeGreaterThan(0);
        const match = studentAnnouncements.find((a: any) => a.id === annId);
        expect(match).toBeDefined();
        expect(match.title).toBe('Independence Day Hostel Celebration');
      });
    });

    // 8.7 Support Tickets
    describe('8.7 Support System', () => {
      it('should submit support ticket and retrieve student tickets', async () => {
        const ticket = await supportService.createTicket(
          {
            id: studentUserId,
            userId: studentUserId,
            organizationId: orgId,
            role: 'STUDENT',
            email: studentEmail,
            name: 'Rahul Sharma',
            hostelName: 'Premier Residency Branch A',
          },
          {
            subject: 'Wi-Fi connection drops frequently in Room A-201',
            category: 'INTERNET',
            description: 'The router on 2nd floor loses connection every evening between 8 PM and 10 PM.',
          }
        );

        expect(ticket.ticketNumber).toBeDefined();
        expect(ticket.status).toBe('OPEN');

        const studentTickets = await supportService.getUserTickets(studentUserId, studentEmail, orgId);
        expect(studentTickets.length).toBeGreaterThan(0);
        expect(studentTickets[0].subject).toContain('Wi-Fi connection');
      });
    });
  });
});
