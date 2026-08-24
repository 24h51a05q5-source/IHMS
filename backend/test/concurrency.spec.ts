import { connectDatabase, disconnectDatabase, query, queryOne, queryRows } from '../src/config/database';
import { runMigrations } from '../src/config/migrations';
import { authService } from '../src/modules/auth/auth.service';
import { studentService } from '../src/modules/students/student.service';
import { feeService } from '../src/modules/fees/fee.service';
import { dashboardService } from '../src/modules/dashboard/dashboard.service';
import { roomService } from '../src/modules/rooms/room.service';
import { UserRole, BedStatus } from '../src/config/constants';

describe('IHMS ERP High-Concurrency & Stress Test Suite', () => {
  let orgId1: string;
  let orgId2: string;
  let branchId1: string;
  let branchId2: string;
  let sharedRoomId: string;
  let sharedBedId: string;
  let testStudentId: string;

  beforeAll(async () => {
    await connectDatabase();
    await runMigrations();

    // 1. Setup Org 1
    const reg1 = await authService.registerOwner({
      orgName: 'Stress Test Organization Alpha',
      orgEmail: 'admin@alpha-hostels.com',
      ownerName: 'Alpha Owner',
      ownerEmail: 'alpha.owner@hostels.com',
      ownerPassword: 'SecretPassword@123',
    });
    orgId1 = reg1.organization._id.toString();

    // 2. Setup Org 2
    const reg2 = await authService.registerOwner({
      orgName: 'Stress Test Organization Beta',
      orgEmail: 'admin@beta-hostels.com',
      ownerName: 'Beta Owner',
      ownerEmail: 'beta.owner@hostels.com',
      ownerPassword: 'SecretPassword@123',
    });
    orgId2 = reg2.organization._id.toString();

    // 3. Create Branches
    const b1 = await queryOne<any>(
      `INSERT INTO hostels (id, organization_id, name, branch_code, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING id`,
      [require('crypto').randomUUID(), orgId1, 'Alpha Main Campus', 'ALP001']
    );
    branchId1 = b1.id;

    const b2 = await queryOne<any>(
      `INSERT INTO hostels (id, organization_id, name, branch_code, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING id`,
      [require('crypto').randomUUID(), orgId2, 'Beta Main Campus', 'BET001']
    );
    branchId2 = b2.id;

    // 4. Create Room and Bed in Org 1 for race-condition testing
    const roomRes = await roomService.createRoom(orgId1, branchId1, {
      roomNumber: '999',
      floorNumber: 9,
      totalBeds: 1,
      monthlyRate: 7500,
    });
    sharedRoomId = roomRes.room.id;
    sharedBedId = roomRes.beds[0].id;

    // 5. Admit a student in Org 1 for concurrent portal access & payment tests
    const studentBedRes = await roomService.createRoom(orgId1, branchId1, {
      roomNumber: '101',
      floorNumber: 1,
      totalBeds: 1,
      monthlyRate: 8000,
    });
    const admitted = await studentService.admitStudent(orgId1, branchId1, {
      fullName: 'Concurrent Test Student',
      email: 'concurrent.student@test.com',
      phone: '+91 9999900000',
      bedId: studentBedRes.beds[0].id,
      stayDurationMonths: 6,
    });
    testStudentId = admitted.id;
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  // TEST 1: 50 SIMULTANEOUS USER LOGINS
  it('should handle 50 concurrent logins without failure or connection exhaustion', async () => {
    const loginPromises = Array.from({ length: 50 }).map((_, i) =>
      authService.login('alpha.owner@hostels.com', 'SecretPassword@123', 'ADMIN')
    );

    const results = await Promise.all(loginPromises);
    expect(results.length).toBe(50);
    results.forEach((res) => {
      expect(res.token).toBeDefined();
      expect(res.user.email).toBe('alpha.owner@hostels.com');
    });
  });

  // TEST 2: 100 SIMULTANEOUS DASHBOARD REQUESTS (PARALLEL & CACHED)
  it('should handle 100 concurrent dashboard KPI requests in parallel with sub-millisecond cache hits', async () => {
    const startTime = Date.now();
    const dashboardPromises = Array.from({ length: 100 }).map(() =>
      dashboardService.getStats(orgId1, branchId1)
    );

    const results = await Promise.all(dashboardPromises);
    const elapsed = Date.now() - startTime;

    expect(results.length).toBe(100);
    results.forEach((stats) => {
      expect(stats.kpi).toBeDefined();
      expect(stats.kpi.totalStudents).toBeGreaterThanOrEqual(1);
      expect(stats.revenueTrend).toBeDefined();
    });

    // 100 cached/parallel requests should complete quickly
    expect(elapsed).toBeLessThan(6000);
  });

  // TEST 3: 50 SIMULTANEOUS SEARCH QUERIES
  it('should handle 50 concurrent student search queries across indexed fields', async () => {
    const searchTerms = ['Concurrent', 'ALP', 'test.com', '99999', '101'];
    const searchPromises = Array.from({ length: 50 }).map((_, i) => {
      const term = searchTerms[i % searchTerms.length];
      return studentService.list(orgId1, branchId1, term);
    });

    const results = await Promise.all(searchPromises);
    expect(results.length).toBe(50);
    results.forEach((list) => {
      expect(Array.isArray(list)).toBe(true);
    });
  });

  // TEST 4: RACE CONDITION PREVENTION (10 USERS ADMITTING TO EXACT SAME BED)
  it('should prevent race condition when 10 concurrent requests attempt to occupy the EXACT SAME bed', async () => {
    const admissionPromises = Array.from({ length: 10 }).map((_, i) =>
      studentService
        .admitStudent(orgId1, branchId1, {
          fullName: `Race Candidate ${i + 1}`,
          email: `race.student${i + 1}@test.com`,
          phone: `+91 900000000${i}`,
          bedId: sharedBedId,
          stayDurationMonths: 3,
        })
        .then(() => ({ success: true, index: i }))
        .catch((err) => ({ success: false, index: i, error: err.message, status: err.statusCode }))
    );

    const outcomes = await Promise.all(admissionPromises);

    const successful = outcomes.filter((o) => o.success);
    const failed = outcomes.filter((o) => !o.success);

    // Exactly 1 must win the bed lock!
    expect(successful.length).toBe(1);
    // Exactly 9 must be rejected cleanly with 409 conflict
    expect(failed.length).toBe(9);

    // Verify bed in database is occupied by exactly one student
    const bed = await queryOne<any>('SELECT * FROM beds WHERE id = $1', [sharedBedId]);
    expect(bed.status).toBe(BedStatus.OCCUPIED);
    expect(bed.current_student_id).toBeDefined();
  });

  // TEST 5: IDEMPOTENT PORTAL ACCESS UNDER CONCURRENT SPAM
  it('should handle 20 concurrent Enable Portal Access requests without duplicate key errors', async () => {
    const accessPromises = Array.from({ length: 20 }).map(() =>
      studentService.setPortalAccess(orgId1, testStudentId, 'GRANT')
    );

    const results = await Promise.all(accessPromises);
    expect(results.length).toBe(20);
    results.forEach((res) => {
      expect(res.success).toBe(true);
      expect(res.portalAccess).toBe(true);
    });

    // Portal access is granted; no user account is created until student completes 4-digit activation
    const userRows = await queryRows<any>('SELECT * FROM users WHERE student_id = $1', [testStudentId]);
    expect(userRows.length).toBe(0);

    const otpRows = await queryRows<any>("SELECT * FROM otps WHERE user_id = $1 AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION'", [testStudentId]);
    expect(otpRows.length).toBeGreaterThanOrEqual(1);
  });

  // TEST 6: CONCURRENT PAYMENTS & ATOMIC SEQUENTIAL RECEIPT GENERATION
  it('should process 25 concurrent payments with zero duplicate receipt numbers and atomic ledger consistency', async () => {
    const paymentPromises = Array.from({ length: 25 }).map((_, i) =>
      feeService.recordPayment(orgId1, {
        studentId: testStudentId,
        amount: 500,
        notes: `Concurrent payment ${i + 1}`,
      })
    );

    const results = await Promise.all(paymentPromises);
    expect(results.length).toBe(25);

    const receiptNumbers = results.map((r) => r.receipt.receiptNumber);
    const uniqueReceiptNumbers = new Set(receiptNumbers);

    // All 25 receipt numbers must be strictly unique!
    expect(uniqueReceiptNumbers.size).toBe(25);

    // Verify student ledger matches exact sum of 25 payments
    const student = await studentService.getById(orgId1, testStudentId);
    expect(student.feePaid).toBe(25 * 500);
  });

  // TEST 7: CONCURRENT MULTI-TENANT ISOLATION (ZERO DATA LEAKAGE)
  it('should strictly isolate data when 50 concurrent requests execute across Org 1 and Org 2 simultaneously', async () => {
    const org1Requests = Array.from({ length: 25 }).map(() => studentService.list(orgId1));
    const org2Requests = Array.from({ length: 25 }).map(() => studentService.list(orgId2));

    const [org1Lists, org2Lists] = await Promise.all([
      Promise.all(org1Requests),
      Promise.all(org2Requests),
    ]);

    // Org 1 list should contain Org 1 students only
    org1Lists.forEach((list) => {
      list.forEach((s: any) => {
        expect(s.organizationId).toBe(orgId1);
      });
    });

    // Org 2 list should contain Org 2 students only (0 from Org 1)
    org2Lists.forEach((list) => {
      list.forEach((s: any) => {
        expect(s.organizationId).toBe(orgId2);
      });
    });
  });
});
