import { connectDatabase, disconnectDatabase, query, queryOne } from '../src/config/database';
import { runMigrations } from '../src/config/migrations';
import { authService } from '../src/modules/auth/auth.service';
import { hostelService } from '../src/modules/hostels/hostel.service';
import { roomService } from '../src/modules/rooms/room.service';
import { studentService } from '../src/modules/students/student.service';
import { feeService } from '../src/modules/fees/fee.service';
import { feeReminderService } from '../src/modules/fees/fee-reminder.service';
import { notificationService } from '../src/modules/notifications/notification.service';
import { PaymentMethod, PaymentPlan } from '../src/config/constants';

describe('IHMS Automatic Fee Management Comprehensive Test Suite', () => {
  const ts = Date.now();
  let orgId: string;
  let hostelId: string;
  let ownerUser: any;
  let studentA: any;
  let studentUserA: any;
  let allBeds: any[] = [];

  beforeAll(async () => {
    await connectDatabase();
    await runMigrations();

    // 1. Setup Organization & Owner
    const ownerRes = await authService.registerOwner({
      orgName: `Fee Management Org ${ts}`,
      orgEmail: `fee_owner_${ts}@testdomain.com`,
      ownerName: 'Hostel Director Sharma',
      ownerEmail: `fee_owner_${ts}@testdomain.com`,
      ownerPassword: 'OwnerPassword@123',
    });
    orgId = ownerRes.organization._id.toString();
    ownerUser = {
      id: ownerRes.user.id,
      userId: ownerRes.user.id,
      organizationId: orgId,
      role: 'OWNER',
      name: 'Hostel Director Sharma',
      email: `fee_owner_${ts}@testdomain.com`,
    };

    // 2. Setup Hostel & Rooms with 10 beds
    const hostel = await hostelService.create(orgId, {
      name: `Grand Palace Residency ${ts}`,
      branchCode: `GPR${String(ts).slice(-3)}`,
      type: 'BOYS',
      city: 'Hyderabad',
    });
    hostelId = hostel.id || (hostel as any)._id.toString();

    const { room, beds } = await roomService.createRoom(orgId, hostelId, {
      roomNumber: '101',
      floorNumber: 1,
      totalBeds: 10,
      monthlyRate: 5000,
    });
    allBeds = beds;

    // 3. Setup Student A (3-month stay, total demanded = 15,000)
    const stuARecord = await studentService.admitStudent(orgId, hostelId, {
      fullName: 'Vikram Aditya',
      email: `vikram_fee_${ts}@testdomain.com`,
      phone: '9876543210',
      gender: 'MALE',
      bedId: allBeds[0].id || allBeds[0]._id.toString(),
      stayDurationMonths: 3,
      admissionFee: 0,
      securityDeposit: 0,
    });
    studentA = stuARecord;

    // Create fee account and 3 installments of ₹5,000 each
    await feeService.createFeeAccountAndInstallments(orgId, hostelId, studentA.id, studentA.customerCode || studentA.customer_code, {
      totalFee: 15000,
      monthlyAmount: 5000,
      paymentPlan: PaymentPlan.MONTHLY,
      numberOfMonths: 3,
    });

    // Create user login for Student A
    const userAId = require('crypto').randomUUID();
    await query(
      `INSERT INTO users (id, user_id, organization_id, email, password_hash, role, name, phone, status, student_id)
       VALUES ($1, $1, $2, $3, 'hashed_pw', 'STUDENT', $4, $5, 'ACTIVE', $6)`,
      [userAId, orgId, studentA.email, studentA.fullName || studentA.full_name, studentA.phone, studentA.id]
    );
    await query('UPDATE students SET user_id = $1 WHERE id = $2', [userAId, studentA.id]);
    studentA.user_id = userAId;
    studentUserA = {
      id: userAId,
      userId: userAId,
      studentId: studentA.id,
      customerCode: studentA.customerCode || studentA.customer_code,
      organizationId: orgId,
      role: 'STUDENT',
      name: studentA.fullName || studentA.full_name,
      email: studentA.email,
    };
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  // =========================================================================
  // 1. AUTOMATIC OUTSTANDING FEE CALCULATION
  // =========================================================================
  describe('1. Automatic Outstanding Fee Calculation', () => {
    it('1.1 should correctly calculate initial outstanding fees with NO payments', async () => {
      const feeAcc = await feeService.getStudentFeeAccount(orgId, studentA.id);

      expect(feeAcc).toBeDefined();
      expect(Number(feeAcc.totalFee)).toBe(15000);
      expect(Number(feeAcc.totalPaid)).toBe(0);
      expect(Number(feeAcc.outstandingBalance)).toBe(15000);
      expect(Number(feeAcc.balanceAmount)).toBe(15000);
      expect(feeAcc.installments.length).toBe(3);
      expect(Number(feeAcc.installments[0].amount)).toBe(5000);
      expect(Number(feeAcc.installments[0].paidAmount)).toBe(0);
      expect(Number(feeAcc.installments[0].remainingAmount)).toBe(5000);
      expect(['PENDING', 'OVERDUE']).toContain(feeAcc.feeStatus);
    });

    it('1.2 should correctly calculate fees and ledger after a PARTIAL payment (₹5,000 for 1st installment)', async () => {
      const p1 = await feeService.recordPayment(orgId, {
        studentId: studentA.id,
        amount: 5000,
        paymentMethod: PaymentMethod.UPI,
        notes: 'First month hostel fee',
        receivedBy: 'Online Gateway',
      });

      expect(p1.payment).toBeDefined();
      expect(p1.payment.status).toBe('SUCCESS');
      expect(Number(p1.payment.amount)).toBe(5000);
      expect(p1.receipt).toBeDefined();
      expect(p1.receipt.receiptNumber).toMatch(/^RCP-/);

      const updated = await feeService.getStudentFeeAccount(orgId, studentA.id);
      expect(Number(updated.totalFee)).toBe(15000);
      expect(Number(updated.totalPaid)).toBe(5000);
      expect(Number(updated.outstandingBalance)).toBe(10000);
      expect(updated.feeStatus).toBe('PARTIAL');

      // Installment #1 must now be PAID
      expect(updated.installments[0].status).toBe('PAID');
      expect(Number(updated.installments[0].paidAmount)).toBe(5000);
      expect(Number(updated.installments[0].remainingAmount)).toBe(0);

      // Installment #2 must remain PENDING
      expect(Number(updated.installments[1].remainingAmount)).toBe(5000);
    });

    it('1.3 should handle MULTIPLE payments sequentially debiting balance', async () => {
      // Second payment of ₹5,000 for 2nd installment
      const p2 = await feeService.recordPayment(orgId, {
        studentId: studentA.id,
        amount: 5000,
        paymentMethod: PaymentMethod.CARD,
        notes: 'Second month fee payment',
        receivedBy: 'Card Gateway',
      });
      expect(p2.payment.status).toBe('SUCCESS');

      const updated = await feeService.getStudentFeeAccount(orgId, studentA.id);
      expect(Number(updated.totalPaid)).toBe(10000);
      expect(Number(updated.outstandingBalance)).toBe(5000);
      expect(updated.installments[0].status).toBe('PAID');
      expect(updated.installments[1].status).toBe('PAID');
      expect(Number(updated.installments[2].remainingAmount)).toBe(5000);
    });

    it('1.4 should correctly clear all dues on FULL payment', async () => {
      // Third and final payment of ₹5,000
      const p3 = await feeService.recordPayment(orgId, {
        studentId: studentA.id,
        amount: 5000,
        paymentMethod: PaymentMethod.NET_BANKING,
        notes: 'Final installment payment',
      });
      expect(p3.payment.status).toBe('SUCCESS');

      const updated = await feeService.getStudentFeeAccount(orgId, studentA.id);
      expect(Number(updated.totalPaid)).toBe(15000);
      expect(Number(updated.outstandingBalance)).toBe(0);
      expect(updated.feeStatus).toBe('PAID');
      expect(updated.installments.every((i: any) => i.status === 'PAID')).toBe(true);
      expect(updated.currentDueInstallment).toBeNull();
    });

    it('1.5 should NOT decrement balance on FAILED or PENDING payments', async () => {
      // Create test student C with 1-month stay (5,000 fee)
      const stuCRecord = await studentService.admitStudent(orgId, hostelId, {
        fullName: 'Rohan Verma',
        email: `rohan_fee_${ts}@testdomain.com`,
        phone: '9876543230',
        gender: 'MALE',
        bedId: allBeds[1].id || allBeds[1]._id.toString(),
        stayDurationMonths: 1,
        admissionFee: 0,
        securityDeposit: 0,
      });

      await feeService.createFeeAccountAndInstallments(orgId, hostelId, stuCRecord.id, stuCRecord.customerCode || stuCRecord.customer_code, {
        totalFee: 5000,
        monthlyAmount: 5000,
        paymentPlan: PaymentPlan.ONE_TIME,
        numberOfMonths: 1,
      });

      // Initiate a payment order (status PENDING)
      const order = await feeService.initiatePayment(orgId, stuCRecord.id, {
        amount: 5000,
        paymentMethod: PaymentMethod.ONLINE,
      });
      expect(order.status).toBe('PENDING');

      // Balance must NOT have changed for pending payment
      let feeAcc = await feeService.getStudentFeeAccount(orgId, stuCRecord.id);
      expect(Number(feeAcc.totalPaid)).toBe(0);
      expect(Number(feeAcc.outstandingBalance)).toBe(5000);

      // Now cancel or fail the payment
      await query("UPDATE payments SET status = 'FAILED' WHERE id = $1", [order.paymentId]);

      feeAcc = await feeService.getStudentFeeAccount(orgId, stuCRecord.id);
      expect(Number(feeAcc.totalPaid)).toBe(0);
      expect(Number(feeAcc.outstandingBalance)).toBe(5000);
    });

    it('1.6 should correctly RESTORE balance and installment status when a payment is REFUNDED', async () => {
      // Admit Student D with 1-month stay (5,000 fee)
      const stuDRecord = await studentService.admitStudent(orgId, hostelId, {
        fullName: 'Pooja Hegde',
        email: `pooja_fee_${ts}@testdomain.com`,
        phone: '9876543240',
        gender: 'FEMALE',
        bedId: allBeds[2].id || allBeds[2]._id.toString(),
        stayDurationMonths: 1,
        admissionFee: 0,
        securityDeposit: 0,
      });

      await feeService.createFeeAccountAndInstallments(orgId, hostelId, stuDRecord.id, stuDRecord.customerCode || stuDRecord.customer_code, {
        totalFee: 5000,
        monthlyAmount: 5000,
        paymentPlan: PaymentPlan.ONE_TIME,
        numberOfMonths: 1,
      });

      // Make a successful payment of ₹5,000
      const rec = await feeService.recordPayment(orgId, {
        studentId: stuDRecord.id,
        amount: 5000,
        paymentMethod: PaymentMethod.CASH,
        notes: 'Full payment for semester',
      });
      expect(rec.payment.status).toBe('SUCCESS');

      let feeAcc = await feeService.getStudentFeeAccount(orgId, stuDRecord.id);
      expect(Number(feeAcc.totalPaid)).toBe(5000);
      expect(Number(feeAcc.outstandingBalance)).toBe(0);
      expect(feeAcc.feeStatus).toBe('PAID');

      // Process full refund
      const refundRes = await feeService.refundPayment(orgId, rec.payment.id, {
        amount: 5000,
        reason: 'Student transferred to another branch',
        authorizedBy: 'Hostel Director Sharma',
      });
      expect(refundRes.success).toBe(true);

      // Verify balance is restored
      feeAcc = await feeService.getStudentFeeAccount(orgId, stuDRecord.id);
      expect(Number(feeAcc.totalPaid)).toBe(0);
      expect(Number(feeAcc.outstandingBalance)).toBe(5000);
      expect(['PENDING', 'OVERDUE']).toContain(feeAcc.feeStatus);

      // Verify payment record marked REFUNDED
      const pRow = await queryOne<any>('SELECT status, refunded_amount FROM payments WHERE id = $1', [rec.payment.id]);
      expect(pRow.status).toBe('REFUNDED');
      expect(Number(pRow.refunded_amount)).toBe(5000);

      // Verify immutable refund debit ledger entry was created
      const ledgerEntry = await queryOne<any>(
        "SELECT * FROM fee_ledgers WHERE student_id = $1 AND transaction_type = 'REFUND_DEBIT'",
        [stuDRecord.id]
      );
      expect(ledgerEntry).toBeDefined();
      expect(Number(ledgerEntry.amount)).toBe(5000);
    });
  });

  // =========================================================================
  // 2. DUE-DATE REMINDERS & DEDUPLICATION
  // =========================================================================
  describe('2. Due-Date Reminders & Duplicate Prevention', () => {
    let testInstUpcomingId: string;
    let testInstDueTodayId: string;
    let testInstOverdueId: string;
    let studentRemId: string;
    let studentRemUserId: string;

    beforeAll(async () => {
      // Create student with specific installment due dates for testing reminders
      const adm = await studentService.admitStudent(orgId, hostelId, {
        fullName: 'Karan Mehra',
        email: `karan_rem_${ts}@testdomain.com`,
        phone: '9876543250',
        gender: 'MALE',
        bedId: allBeds[3].id || allBeds[3]._id.toString(),
        stayDurationMonths: 3,
        admissionFee: 0,
        securityDeposit: 0,
      });
      studentRemId = adm.id;
      studentRemUserId = require('crypto').randomUUID();

      await feeService.createFeeAccountAndInstallments(orgId, hostelId, studentRemId, adm.customerCode || adm.customer_code, {
        totalFee: 15000,
        monthlyAmount: 5000,
        paymentPlan: PaymentPlan.MONTHLY,
        numberOfMonths: 3,
      });

      await query(
        `INSERT INTO users (id, user_id, organization_id, email, password_hash, role, name, phone, status, student_id)
         VALUES ($1, $1, $2, $3, 'hashed_pw', 'STUDENT', $4, $5, 'ACTIVE', $6)`,
        [studentRemUserId, orgId, adm.email, adm.fullName || adm.full_name, adm.phone, studentRemId]
      );
      await query('UPDATE students SET user_id = $1 WHERE id = $2', [studentRemUserId, studentRemId]);

      const insts = await query<any>(
        'SELECT id, installment_number FROM fee_installments WHERE student_id = $1 ORDER BY installment_number ASC',
        [studentRemId]
      );

      // Installment 1: OVERDUE (due 5 days ago)
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      testInstOverdueId = insts.rows[0].id;
      await query("UPDATE fee_installments SET due_date = $1, status = 'PENDING' WHERE id = $2", [pastDate, testInstOverdueId]);

      // Installment 2: DUE TODAY
      const todayDate = new Date().toISOString().slice(0, 10);
      testInstDueTodayId = insts.rows[1].id;
      await query("UPDATE fee_installments SET due_date = $1, status = 'PENDING' WHERE id = $2", [todayDate, testInstDueTodayId]);

      // Installment 3: UPCOMING (due in 3 days)
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      testInstUpcomingId = insts.rows[2].id;
      await query("UPDATE fee_installments SET due_date = $1, status = 'PENDING' WHERE id = $2", [futureDate, testInstUpcomingId]);
    });

    it('2.1 should process upcoming, due today, and overdue reminders correctly', async () => {
      const results = await feeReminderService.processInstallmentReminders(orgId, studentRemId);

      expect(results.overdueSent).toBe(1);
      expect(results.dueTodaySent).toBe(1);
      expect(results.upcomingSent).toBe(1);
      expect(results.statusUpdated).toBe(1); // Overdue installment status updated to OVERDUE

      // Verify the overdue installment status in DB
      const overdueInst = await queryOne<any>('SELECT status FROM fee_installments WHERE id = $1', [testInstOverdueId]);
      expect(overdueInst.status).toBe('OVERDUE');

      // Verify student received the in-app notifications
      const studentUser = {
        id: studentRemUserId,
        userId: studentRemUserId,
        studentId: studentRemId,
        organizationId: orgId,
        role: 'STUDENT',
      };
      const notifs = await notificationService.getNotifications(studentUser, {});

      expect(notifs.total).toBeGreaterThanOrEqual(3);
      const titles = notifs.items.map((n: any) => n.title);
      expect(titles).toContain('Fee Payment Overdue');
      expect(titles).toContain('Fee Payment Due Today');
      expect(titles).toContain('Upcoming Fee Payment');

      // Notifications must have actionable payment link
      const overdueNotif = notifs.items.find((n: any) => n.title === 'Fee Payment Overdue');
      expect(overdueNotif.actionUrl).toContain('/student/fees?installment=');
    });

    it('2.2 should PREVENT DUPLICATE reminders when processed multiple times on the same day', async () => {
      const studentUser = {
        id: studentRemUserId,
        userId: studentRemUserId,
        studentId: studentRemId,
        organizationId: orgId,
        role: 'STUDENT',
      };

      const countBefore = await notificationService.getUnreadCount(studentUser);

      // Re-run reminders immediately
      const secondRun = await feeReminderService.processInstallmentReminders(orgId, studentRemId);

      // Deduplication must skip sending duplicates
      expect(secondRun.overdueSent).toBe(0);
      expect(secondRun.dueTodaySent).toBe(0);
      expect(secondRun.upcomingSent).toBe(0);

      const countAfter = await notificationService.getUnreadCount(studentUser);
      expect(countAfter).toBe(countBefore); // Absolutely zero duplicate notifications created
    });
  });

  // =========================================================================
  // 3. PAYMENT HISTORY
  // =========================================================================
  describe('3. Payment History Verification', () => {
    it('3.1 student can retrieve complete payment history with status and receipt details', async () => {
      const feeAcc = await feeService.getStudentFeeAccount(orgId, studentA.id);

      expect(feeAcc.payments).toBeDefined();
      expect(feeAcc.payments.length).toBe(3);

      for (const p of feeAcc.payments) {
        expect(p.paymentNumber).toMatch(/^PAY-/);
        expect(Number(p.amount)).toBe(5000);
        expect(p.status).toBe('SUCCESS');
        expect(p.receiptNumber).toMatch(/^RCP-/);
        expect(p.createdAt).toBeDefined();
      }
    });

    it('3.2 owner can query payments with status filters (SUCCESS, REFUNDED, FAILED)', async () => {
      const successList = await query<any>(
        "SELECT id, status FROM payments WHERE organization_id = $1 AND status = 'SUCCESS'",
        [orgId]
      );
      expect(successList.rows.length).toBeGreaterThanOrEqual(3);

      const refundedList = await query<any>(
        "SELECT id, status FROM payments WHERE organization_id = $1 AND status = 'REFUNDED'",
        [orgId]
      );
      expect(refundedList.rows.length).toBeGreaterThanOrEqual(1);

      const failedList = await query<any>(
        "SELECT id, status FROM payments WHERE organization_id = $1 AND status = 'FAILED'",
        [orgId]
      );
      expect(failedList.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 4. PAYMENT RECEIPTS INTEGRITY
  // =========================================================================
  describe('4. Payment Receipts Integrity', () => {
    it('4.1 receipt is generated and contains complete required details for confirmed payment', async () => {
      const studentAcc = await feeService.getStudentFeeAccount(orgId, studentA.id);
      const paymentId = studentAcc.payments[0].id;

      const receipt = await feeService.getReceiptByPaymentId(orgId, paymentId);

      expect(receipt).toBeDefined();
      expect(receipt.receiptNumber).toMatch(/^RCP-/);
      expect(receipt.studentName).toBe('Vikram Aditya');
      expect(receipt.customerCode).toBe(studentA.customerCode || studentA.customer_code);
      expect(receipt.hostelName).toBeDefined();
      expect(Number(receipt.amount)).toBe(5000);
      expect(receipt.paymentMethod).toBe(PaymentMethod.UPI);
      expect(receipt.issuedAt).toBeDefined();
      expect(receipt.qrPayload).toContain(receipt.receiptNumber);
    });

    it('4.2 receipt request MUST BE REJECTED for unconfirmed (PENDING / FAILED) payments', async () => {
      // Find the failed payment from earlier test
      const failedPayment = await queryOne<any>(
        "SELECT id FROM payments WHERE organization_id = $1 AND status = 'FAILED' LIMIT 1",
        [orgId]
      );
      expect(failedPayment).toBeDefined();

      await expect(
        feeService.getReceiptByPaymentId(orgId, failedPayment.id)
      ).rejects.toThrow('Receipt is only available for confirmed successful payments.');
    });

    it('4.3 receipt PDF can be generated with QR verification code', async () => {
      const studentAcc = await feeService.getStudentFeeAccount(orgId, studentA.id);
      const paymentId = studentAcc.payments[0].id;

      const { pdf, receipt } = await feeService.generateReceiptPdfByPaymentId(orgId, paymentId);

      expect(pdf).toBeDefined();
      expect(Buffer.isBuffer(pdf)).toBe(true);
      expect(pdf.length).toBeGreaterThan(500); // Valid non-empty PDF binary
      expect(receipt.receiptNumber).toBeDefined();
    });
  });
});
