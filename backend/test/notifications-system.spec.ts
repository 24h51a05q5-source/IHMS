import { connectDatabase, disconnectDatabase, query, queryOne } from '../src/config/database';
import { runMigrations } from '../src/config/migrations';
import { authService } from '../src/modules/auth/auth.service';
import { hostelService } from '../src/modules/hostels/hostel.service';
import { roomService } from '../src/modules/rooms/room.service';
import { studentService } from '../src/modules/students/student.service';
import { feeService } from '../src/modules/fees/fee.service';
import { zeroGatewayPaymentService } from '../src/modules/fees/zero-gateway-payment.service';
import { complaintService } from '../src/modules/complaints/complaint.service';
import { attendanceService } from '../src/modules/attendance/attendance.service';
import { notificationService } from '../src/modules/notifications/notification.service';
import { hostelPaymentConfigService } from '../src/modules/hostels/hostel-payment-config.service';
import { LeaveStatus, PaymentMethod } from '../src/config/constants';

describe('IHMS In-App Notification System Comprehensive Test Suite', () => {
  const ts = Date.now();
  let orgId: string;
  let hostelId: string;
  let ownerUser: any;
  let studentA: any;
  let studentB: any;
  let bedIdA: string;
  let bedIdB: string;

  beforeAll(async () => {
    await connectDatabase();
    await runMigrations();

    // 1. Setup Organization & Owner
    const ownerRes = await authService.registerOwner({
      orgName: `Notif Test Org ${ts}`,
      orgEmail: `owner_notif_${ts}@testdomain.com`,
      ownerName: 'Hostel Owner Vikram',
      ownerEmail: `owner_notif_${ts}@testdomain.com`,
      ownerPassword: 'OwnerSecretPassword@123',
    });
    orgId = ownerRes.organization._id.toString();
    ownerUser = {
      id: ownerRes.user.id,
      userId: ownerRes.user.id,
      organizationId: orgId,
      role: 'OWNER',
    };

    // 2. Setup Hostel Branch
    const hostel = await hostelService.create(orgId, {
      name: 'Sunrise Luxury Branch',
      branchCode: 'SLB01',
      type: 'BOYS',
      city: 'Hyderabad',
    });
    hostelId = hostel.id || hostel._id.toString();

    // Configure payment destinations for zero-gateway / UPI
    await hostelPaymentConfigService.upsertConfig(orgId, hostelId, ownerUser.id, {
      method: 'UPI',
      upiConfig: {
        vpaAddress: 'sunriseluxury@okaxis',
        displayName: 'Sunrise Luxury Hostels',
      },
    });
    await hostelPaymentConfigService.confirmAndActivate(orgId, hostelId, ownerUser.id, 'UPI');

    // 3. Create Room & Beds
    const { room, beds } = await roomService.createRoom(orgId, hostelId, {
      roomNumber: 'R-101',
      floorNumber: 1,
      totalBeds: 2,
      monthlyRate: 8000,
    });
    bedIdA = beds[0].id || beds[0]._id.toString();
    bedIdB = beds[1].id || beds[1]._id.toString();

    // 4. Admit Student A
    const stuARecord = await studentService.admitStudent(orgId, hostelId, {
      fullName: 'Alice Walker',
      email: `alice_${ts}@testdomain.com`,
      phone: '+91 9876543211',
      bedId: bedIdA,
      admissionFee: 0,
      securityDeposit: 0,
    });

    studentA = {
      id: stuARecord.id,
      studentId: stuARecord.id,
      customerCode: stuARecord.ihmsId || stuARecord.ihms_id || stuARecord.customerCode,
      organizationId: orgId,
      role: 'STUDENT',
    };

    // 5. Admit Student B
    const stuBRecord = await studentService.admitStudent(orgId, hostelId, {
      fullName: 'Bob Marley',
      email: `bob_${ts}@testdomain.com`,
      phone: '+91 9876543212',
      bedId: bedIdB,
      admissionFee: 0,
      securityDeposit: 0,
    });

    studentB = {
      id: stuBRecord.id,
      studentId: stuBRecord.id,
      customerCode: stuBRecord.ihmsId || stuBRecord.ihms_id || stuBRecord.customerCode,
      organizationId: orgId,
      role: 'STUDENT',
    };
  }, 60000);

  afterAll(async () => {
    await disconnectDatabase();
  });

  describe('1. Schema & Notification Creation', () => {
    it('should create notification with both read and is_read set to false', async () => {
      const notif = await notificationService.createNotification({
        organizationId: orgId,
        branchId: hostelId,
        userId: studentA.id,
        role: 'STUDENT',
        title: 'Welcome Notification',
        message: 'Welcome to your new hostel accommodation.',
        type: 'INFO',
        link: '/student/dashboard',
      });

      expect(notif.id).toBeDefined();
      expect(notif.read).toBe(false);
      expect(notif.isRead).toBe(false);

      const dbRow = await queryOne<any>(
        'SELECT id, read, is_read, title, link FROM notifications WHERE id = $1',
        [notif.id]
      );
      expect(dbRow).toBeDefined();
      expect(Boolean(dbRow.read)).toBe(false);
      expect(Boolean(dbRow.is_read)).toBe(false);
      expect(dbRow.title).toBe('Welcome Notification');
      expect(dbRow.link).toBe('/student/dashboard');
    });
  });

  describe('2. User & Role Isolation (Security)', () => {
    let notifAId: string;

    beforeEach(async () => {
      const notifA = await notificationService.notifyStudent(studentA.id, {
        organizationId: orgId,
        title: 'Secret Alice Notice',
        message: 'Confidential Alice data',
      });
      notifAId = notifA!.id;

      await notificationService.notifyStudent(studentB.id, {
        organizationId: orgId,
        title: 'Secret Bob Notice',
        message: 'Confidential Bob data',
      });
    });

    it('should only return Student A notifications to Student A', async () => {
      const res = await notificationService.getNotifications(studentA, { page: 1, pageSize: 50 });
      const titles = res.items.map((n) => n.title);
      expect(titles).toContain('Secret Alice Notice');
      expect(titles).not.toContain('Secret Bob Notice');
    });

    it('should only return Student B notifications to Student B', async () => {
      const res = await notificationService.getNotifications(studentB, { page: 1, pageSize: 50 });
      const titles = res.items.map((n) => n.title);
      expect(titles).toContain('Secret Bob Notice');
      expect(titles).not.toContain('Secret Alice Notice');
    });

    it('should prevent Student B from marking Student A notification as read (Forbidden 403)', async () => {
      await expect(
        notificationService.markAsRead(studentB, notifAId)
      ).rejects.toThrow(/permission/i);

      // Verify that Alice's notification remains unread
      const row = await queryOne<any>('SELECT read, is_read FROM notifications WHERE id = $1', [notifAId]);
      expect(Boolean(row.read)).toBe(false);
      expect(Boolean(row.is_read)).toBe(false);
    });

    it('should prevent user from another organization from accessing notifications', async () => {
      const otherUser = {
        id: 'OTHER_USER_999',
        organizationId: 'ORG_NON_EXISTENT',
        role: 'STUDENT',
      };
      const res = await notificationService.getNotifications(otherUser, { page: 1, pageSize: 50 });
      expect(res.items.length).toBe(0);
      expect(res.total).toBe(0);
    });
  });

  describe('3. Read / Unread Status Synchronization & Count', () => {
    it('should calculate accurate unread count and decrement on markAsRead', async () => {
      // Mark all read first to set clean baseline
      await notificationService.markAllAsRead(studentA);
      let initialCount = await notificationService.getUnreadCount(studentA);
      expect(initialCount).toBe(0);

      // Create 2 new notifications for student A
      const n1 = await notificationService.notifyStudent(studentA.id, {
        organizationId: orgId,
        title: 'Unread 1',
        message: 'Message 1',
      });
      await notificationService.notifyStudent(studentA.id, {
        organizationId: orgId,
        title: 'Unread 2',
        message: 'Message 2',
      });

      let count = await notificationService.getUnreadCount(studentA);
      expect(count).toBe(2);

      // Mark n1 as read
      const markResult = await notificationService.markAsRead(studentA, n1!.id);
      expect(markResult.read).toBe(true);
      expect(markResult.isRead).toBe(true);

      // Verify DB row has both read and is_read as TRUE
      const row = await queryOne<any>('SELECT read, is_read FROM notifications WHERE id = $1', [n1!.id]);
      expect(Boolean(row.read)).toBe(true);
      expect(Boolean(row.is_read)).toBe(true);

      // Count should now be 1
      count = await notificationService.getUnreadCount(studentA);
      expect(count).toBe(1);

      // Mark all read
      await notificationService.markAllAsRead(studentA);
      count = await notificationService.getUnreadCount(studentA);
      expect(count).toBe(0);
    });
  });

  describe('4. Business Event Triggers', () => {
    it('4.1 should notify Student and Owner when Fee Payment is recorded', async () => {
      // Record a payment
      const paymentRes = await feeService.recordPayment(orgId, {
        studentId: studentA.studentId,
        amount: 1500,
        paymentMethod: PaymentMethod.UPI,
        transactionRef: 'UPI-TEST-NOTIF-01',
        receivedBy: 'Hostel Receptionist',
        notes: 'Test payment for notifications',
      });

      expect(paymentRes.payment).toBeDefined();

      // Verify Student received notification
      const studentNotifs = await notificationService.getNotifications(studentA, { pageSize: 10 });
      const paymentNotif = studentNotifs.items.find((n) => n.title.includes('Payment Received'));
      expect(paymentNotif).toBeDefined();
      expect(paymentNotif!.message).toContain('1500');
      expect(paymentNotif!.type).toBe('SUCCESS');

      // Verify Owner received notification
      const ownerNotifs = await notificationService.getNotifications(ownerUser, { pageSize: 10 });
      const ownerPaymentNotif = ownerNotifs.items.find((n) => n.title.includes('Payment Received') && n.message.includes('1500'));
      expect(ownerPaymentNotif).toBeDefined();
    });

    it('4.2 should notify Owner and Student on Zero-Gateway Payment Submission & Verification', async () => {
      // Student submits payment
      const submitRes = await zeroGatewayPaymentService.submitZeroGatewayPayment(orgId, {
        studentId: studentA.studentId,
        amount: 2500,
        paymentMethod: 'UPI',
        transactionRef: 'UTR998877665544',
      });

      expect(submitRes.payment).toBeDefined();

      // Verify Owner received 'Payment Verification Required'
      const ownerNotifs = await notificationService.getNotifications(ownerUser, { pageSize: 10 });
      const reqNotif = ownerNotifs.items.find((n) => n.title === 'Payment Verification Required');
      expect(reqNotif).toBeDefined();
      expect(reqNotif!.message).toContain('UTR998877665544');

      // Admin verifies payment
      const verifyRes = await zeroGatewayPaymentService.verifyPaymentSubmission(
        orgId,
        submitRes.payment.id,
        'Warden Incharge'
      );
      expect(verifyRes.status).toBe('VERIFIED');

      // Verify Student received 'Payment Verified'
      const studentNotifs = await notificationService.getNotifications(studentA, { pageSize: 10 });
      const verifiedNotif = studentNotifs.items.find((n) => n.title === 'Payment Verified' && n.message.includes('2500'));
      expect(verifiedNotif).toBeDefined();
      expect(verifiedNotif!.type).toBe('SUCCESS');
    });

    it('4.3 should notify Owner and Student on Complaint Creation & Resolution', async () => {
      // Student files complaint
      const complaint = await complaintService.createComplaint(orgId, {
        studentId: studentA.studentId,
        title: 'Geyser Water Cold',
        description: 'Hot water not working on 1st floor bathroom',
        category: 'PLUMBING',
        priority: 'HIGH',
      });

      expect(complaint.id).toBeDefined();

      // Verify Owner received notification
      const ownerNotifs = await notificationService.getNotifications(ownerUser, { pageSize: 10 });
      const ownerCompNotif = ownerNotifs.items.find((n) => n.title.includes('Geyser Water Cold'));
      expect(ownerCompNotif).toBeDefined();
      expect(ownerCompNotif!.type).toBe('WARNING');

      // Verify Student received confirmation
      const studentNotifs = await notificationService.getNotifications(studentA, { pageSize: 10 });
      const stuCompNotif = studentNotifs.items.find((n) => n.title.includes('Complaint Registered'));
      expect(stuCompNotif).toBeDefined();

      // Resolve complaint
      await complaintService.resolveComplaint(orgId, complaint.id, {
        resolutionNotes: 'Geyser heating element replaced.',
      });

      // Verify Student received resolution notification
      const updatedStuNotifs = await notificationService.getNotifications(studentA, { pageSize: 10 });
      const resolvedNotif = updatedStuNotifs.items.find((n) => n.title.includes('Complaint Resolved'));
      expect(resolvedNotif).toBeDefined();
      expect(resolvedNotif!.message).toContain('Geyser heating element replaced');
      expect(resolvedNotif!.type).toBe('SUCCESS');
    });

    it('4.4 should notify Owner and Student on Leave Application & Approval', async () => {
      // Student applies for leave
      const leave = await attendanceService.applyLeave(orgId, {
        studentId: studentA.studentId,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 3 * 86400000).toISOString(),
        reason: 'Attending family wedding ceremony',
        destinationAddress: 'Hyderabad, Telangana',
      });

      expect(leave.id).toBeDefined();

      // Verify Owner received leave notification
      const ownerNotifs = await notificationService.getNotifications(ownerUser, { pageSize: 10 });
      const ownerLeaveNotif = ownerNotifs.items.find((n) => n.title.includes('New Leave Request') && n.message.includes('family wedding'));
      expect(ownerLeaveNotif).toBeDefined();

      // Verify Student received submission notice
      const studentNotifs = await notificationService.getNotifications(studentA, { pageSize: 10 });
      const stuLeaveNotif = studentNotifs.items.find((n) => n.title.includes('Leave Request Submitted'));
      expect(stuLeaveNotif).toBeDefined();

      // Warden approves leave
      await attendanceService.approveLeave(orgId, leave.id, LeaveStatus.APPROVED, 'Chief Warden');

      // Verify Student received approval notification
      const updatedStuNotifs = await notificationService.getNotifications(studentA, { pageSize: 10 });
      const approvedNotif = updatedStuNotifs.items.find((n) => n.title.includes('Leave Request Approved'));
      expect(approvedNotif).toBeDefined();
      expect(approvedNotif!.message).toContain('gate pass');
      expect(approvedNotif!.type).toBe('SUCCESS');
    });
  });
});
