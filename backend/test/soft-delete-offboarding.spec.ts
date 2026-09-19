import { connectDatabase, disconnectDatabase, query, queryOne, queryRows } from '../src/config/database';
import { studentService } from '../src/modules/students/student.service';
import { roomService } from '../src/modules/rooms/room.service';
import { hostelService } from '../src/modules/hostels/hostel.service';
import { feeService } from '../src/modules/fees/fee.service';
import { cashfreeService } from '../src/modules/fees/cashfree.service';
import { BedStatus } from '../src/config/constants';
import { redisService } from '../src/common/redis/redis.service';

describe('Data Preservation, Soft Deletions & Tenant Offboarding', () => {
  const orgId = 'org-soft-delete-test';
  const hostelId = 'H102';
  let createdRoom: any;
  let bed1: any;
  let bed2: any;
  let student1: any;

  beforeAll(async () => {
    await connectDatabase();
    redisService.resetInMemory();

    // 1. Create Organization
    await query(
      `INSERT INTO organizations (id, org_code, name)
       VALUES ($1, 'SDO001', 'Soft Delete & Offboarding Test Org')
       ON CONFLICT (id) DO NOTHING`,
      [orgId]
    );

    // 2. Create Active Hostel
    await query(
      `INSERT INTO hostels (id, hostel_id, organization_id, name, branch_name, branch_code, status, cashfree_vendor_id, cashfree_onboarding_status)
       VALUES ($1, $1, $2, 'Galaxy Tower Hostel', 'North Wing', 'GT01', 'ACTIVE', 'vnd_H102', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [hostelId, orgId]
    );

    // 3. Create Room with 2 beds
    const roomRes = await roomService.createRoom(orgId, hostelId, {
      roomNumber: '101',
      floorNumber: 1,
      blockName: 'A',
      buildingName: 'Main',
      capacity: 2,
      totalBeds: 2,
      roomType: 'DOUBLE',
      monthlyRentPerBed: 7500,
    });
    createdRoom = roomRes.room;
    [bed1, bed2] = roomRes.beds;
  });

  afterAll(async () => {
    await redisService.disconnect();
    await disconnectDatabase();
  });

  // ============================================================================
  // Phase 1: Student Soft Deletion & Bed Freeing
  // ============================================================================
  it('1. Should admit a student, allocate Bed 1, and create financial ledger records', async () => {
    student1 = await studentService.admitStudent(orgId, hostelId, {
      fullName: 'Rahul Sharma',
      email: 'rahul.sharma@test.ihms',
      phone: '9876543210',
      bedId: bed1.id,
      monthlyRent: 7500,
      admissionDate: new Date().toISOString(),
    });

    expect(student1).toBeDefined();
    expect(student1.bedId).toBe(bed1.id);
    expect(student1.customId).toMatch(/^(H102-\d{4}|IHMS[A-Z0-9]+-[a-z0-9]+)$/);

    // Bed 1 must be OCCUPIED
    const bedCheck = await queryOne<any>('SELECT * FROM beds WHERE id = $1', [bed1.id]);
    expect(bedCheck.status).toBe(BedStatus.OCCUPIED);
    expect(bedCheck.current_student_id).toBe(student1.id);

    // Room counters
    const roomCheck = await queryOne<any>('SELECT occupied_beds, available_beds FROM rooms WHERE id = $1', [createdRoom.id]);
    expect(roomCheck.occupied_beds).toBe(1);
    expect(roomCheck.available_beds).toBe(1);

    // Insert payment and receipt to simulate financial transactions
    const paymentId = 'pay-test-101';
    await query(
      `INSERT INTO payments (
        id, payment_number, organization_id, hostel_id, student_id, customer_code,
        amount, base_amount, status, payment_method, gateway_name, created_at
      ) VALUES ($1, 'PAY-101', $2, $3, $4, $5, 7500, 7500, 'SUCCESS', 'UPI', 'CASHFREE', CURRENT_TIMESTAMP)`,
      [paymentId, orgId, hostelId, student1.id, student1.customerCode]
    );

    await query(
      `INSERT INTO receipts (
        id, receipt_number, payment_id, payment_number, organization_id, hostel_id,
        student_id, customer_code, student_name, amount, payment_method, fee_type, created_at
      ) VALUES ('rec-test-101', 'REC-101', $1, 'PAY-101', $2, $3, $4, $5, 'Rahul Sharma', 7500, 'UPI', 'RENT', CURRENT_TIMESTAMP)`,
      [paymentId, orgId, hostelId, student1.id, student1.customerCode]
    );
  });

  it('2. Soft-deleting a student must NEVER use SQL DELETE, vacating their bed while preserving student & custom ID', async () => {
    // Execute soft-delete via studentService.removeStudent
    const removeResult = await studentService.removeStudent(orgId, student1.id);
    expect(removeResult.success).toBe(true);

    // Verify bed is freed and status returned to AVAILABLE (Green on Digital Bed Map)
    const bedCheck = await queryOne<any>('SELECT * FROM beds WHERE id = $1', [bed1.id]);
    expect(bedCheck.status).toBe(BedStatus.AVAILABLE);
    expect(bedCheck.current_student_id).toBeNull();
    expect(bedCheck.current_customer_code).toBeNull();
    expect(bedCheck.current_student_name).toBeNull();

    // Verify room occupancy decremented
    const roomCheck = await queryOne<any>('SELECT occupied_beds, available_beds FROM rooms WHERE id = $1', [createdRoom.id]);
    expect(roomCheck.occupied_beds).toBe(0);
    expect(roomCheck.available_beds).toBe(2);

    // Verify student record STILL EXISTS in DB with is_active = false
    const studentInDb = await queryOne<any>('SELECT * FROM students WHERE id = $1', [student1.id]);
    expect(studentInDb).toBeDefined();
    expect(studentInDb.is_active).toBe(false);
    expect(studentInDb.status).toBe('INACTIVE');
    expect(studentInDb.bed_id).toBeNull();
    expect(studentInDb.room_id).toBeNull();

    // Custom ID and customer code must be fully preserved forever
    expect(studentInDb.custom_id).toBe(student1.customId);
    expect(studentInDb.customer_code).toBe(student1.customerCode);

    // Linked user account must be soft-deactivated, not deleted
    if (studentInDb.user_id) {
      const userInDb = await queryOne<any>('SELECT * FROM users WHERE id = $1', [studentInDb.user_id]);
      expect(userInDb).toBeDefined();
      expect(userInDb.is_active).toBe(false);
      expect(userInDb.status).toBe('INACTIVE');
    }
  });

  it('3. Historical financial ledgers and receipts must remain 100% accessible after soft-deletion', async () => {
    // Payment record must remain intact
    const payment = await queryOne<any>('SELECT * FROM payments WHERE student_id = $1', [student1.id]);
    expect(payment).toBeDefined();
    expect(payment.payment_number).toBe('PAY-101');
    expect(Number(payment.amount)).toBe(7500);

    // Receipt record must remain intact
    const receipt = await feeService.getReceiptByNumber(orgId, 'REC-101');
    expect(receipt).toBeDefined();
    expect(receipt.studentId).toBe(student1.id);
    expect(receipt.customerCode).toBe(student1.customerCode);
    expect(Number(receipt.amount)).toBe(7500);

    // Audit logs must confirm SOFT_DELETE_STUDENT action
    const auditLogs = await queryRows<any>(
      "SELECT * FROM audit_logs WHERE organization_id = $1 AND action = 'SOFT_DELETE_STUDENT' AND resource_id = $2",
      [orgId, student1.id]
    );
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    expect(auditLogs[0].details).toContain('soft-deleted');
  });

  it('4. Another student can immediately occupy the freed bed without conflict', async () => {
    const newStudent = await studentService.admitStudent(orgId, hostelId, {
      fullName: 'Vikram Patel',
      email: 'vikram.patel@test.ihms',
      phone: '9123456780',
      bedId: bed1.id,
      monthlyRent: 7500,
      admissionDate: new Date().toISOString(),
    });

    expect(newStudent.bedId).toBe(bed1.id);
    const bedCheck = await queryOne<any>('SELECT * FROM beds WHERE id = $1', [bed1.id]);
    expect(bedCheck.status).toBe(BedStatus.OCCUPIED);
    expect(bedCheck.current_student_id).toBe(newStudent.id);
    expect(bedCheck.current_customer_code).toBe(newStudent.customerCode);
  });

  // ============================================================================
  // Phase 2 & 3: Tenant Offboarding, Cashfree Vendor Sync & 403 QR Failsafe
  // ============================================================================
  it('5. Deactivating a hostel must set status to DEACTIVATED and sync BLOCKED to Cashfree vendor', async () => {
    // Deactivate hostel H102
    const deactRes = await hostelService.deactivateHostel(orgId, hostelId);
    expect(deactRes.status).toBe('DEACTIVATED');

    // Verify database record
    const hostelDb = await queryOne<any>('SELECT status, cashfree_onboarding_status FROM hostels WHERE id = $1', [hostelId]);
    expect(hostelDb.status).toBe('DEACTIVATED');
    expect(hostelDb.cashfree_onboarding_status).toBe('BLOCKED');

    // Audit log must confirm DEACTIVATE_HOSTEL
    const auditLogs = await queryRows<any>(
      "SELECT * FROM audit_logs WHERE organization_id = $1 AND action = 'DEACTIVATE_HOSTEL' AND resource_id = $2",
      [orgId, hostelId]
    );
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
  });

  it('6. Payment QR creation must be strictly rejected with 403 Forbidden for a deactivated hostel', async () => {
    await expect(
      cashfreeService.createDynamicUPIOrder({
        orderId: `TEST_ORD_${Date.now()}`,
        amount: 5000,
        studentId: student1.id,
        studentCustomerCode: student1.customerCode,
        studentName: 'Rahul Sharma',
        studentPhone: '9876543210',
        studentEmail: 'rahul@test.ihms',
        vendorId: 'vnd_H102',
        hostelId: hostelId,
        organizationId: orgId,
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringMatching(/(deactivated|no longer active)/i),
    });
  });

  it('7. Adding a new student must be strictly rejected with 403 Forbidden for a deactivated hostel', async () => {
    await expect(
      studentService.admitStudent(orgId, hostelId, {
        fullName: 'Blocked Student',
        email: 'blocked@test.ihms',
        phone: '9876543219',
        bedId: bed2.id,
        monthlyRent: 7500,
        admissionDate: new Date().toISOString(),
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Hostel account is deactivated. Adding new students is prohibited.',
    });
  });

  it('8. Reactivating a hostel restores status to ACTIVE and unblocks Cashfree vendor', async () => {
    const reactRes = await hostelService.reactivateHostel(orgId, hostelId);
    expect(reactRes.status).toBe('ACTIVE');

    const hostelDb = await queryOne<any>('SELECT status, cashfree_onboarding_status FROM hostels WHERE id = $1', [hostelId]);
    expect(hostelDb.status).toBe('ACTIVE');
    expect(hostelDb.cashfree_onboarding_status).toBe('ACTIVE');

    // Now QR creation must succeed without 403
    const orderRes = await cashfreeService.createDynamicUPIOrder({
      orderId: `TEST_REACT_${Date.now()}`,
      amount: 5000,
      studentId: student1.id,
      studentCustomerCode: student1.customerCode,
      studentName: 'Rahul Sharma',
      studentPhone: '9876543210',
      studentEmail: 'rahul@test.ihms',
      vendorId: 'vnd_H102',
      hostelId: hostelId,
      organizationId: orgId,
    });
    expect(orderRes).toBeDefined();
    expect(orderRes.amount).toBeGreaterThanOrEqual(5000);
    expect(orderRes.qrDataUrl).toBeDefined();
  });
});
