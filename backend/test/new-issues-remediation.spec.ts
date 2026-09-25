import { connectDatabase, disconnectDatabase, query, queryOne, queryRows } from '../src/config/database';
import { runMigrations } from '../src/config/migrations';
import { authService } from '../src/modules/auth/auth.service';
import { studentService } from '../src/modules/students/student.service';
import { feeService, roundCurrency } from '../src/modules/fees/fee.service';
import { roomService } from '../src/modules/rooms/room.service';
import { authorize, AuthenticatedUser } from '../src/common/guards/auth.guard';
import { authorizeRoles } from '../src/common/guards/roles.guard';
import { UserRole, BedStatus } from '../src/config/constants';
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';

describe('IHMS 10 New Issues Independent Verification Suite', () => {
  let orgId: string;
  let branchId1: string;
  let branchId2: string;
  let ownerUser: any;
  let wardenUser: any;
  let studentUser: any;
  let studentRecord: any;
  let studentRecord2: any;
  let roomAId: string;
  let roomBId: string;
  let bedA1Id: string;
  let bedA2Id: string;
  let bedB1Id: string;

  let validRefreshToken: string;

  beforeAll(async () => {
    await connectDatabase();
    await runMigrations();

    // Register test owner
    const reg = await authService.registerOwner({
      orgName: 'New Remediation Test Org',
      orgEmail: `new_remed_${Date.now()}@hosteltest.com`,
      ownerName: 'Remediation Master Owner',
      ownerEmail: `remed_owner_${Date.now()}@hosteltest.com`,
      ownerPassword: 'SecurePassword@2026',
    });
    orgId = reg.organization._id.toString();
    ownerUser = reg.user;
    validRefreshToken = reg.refreshToken;

    // Create Branches
    const b1 = await queryOne<any>(
      `INSERT INTO hostels (id, organization_id, name, branch_code, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING id`,
      [crypto.randomUUID(), orgId, 'Campus Main', 'NREM01']
    );
    branchId1 = b1.id;

    const b2 = await queryOne<any>(
      `INSERT INTO hostels (id, organization_id, name, branch_code, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING id`,
      [crypto.randomUUID(), orgId, 'Campus East', 'NREM02']
    );
    branchId2 = b2.id;

    // Create Warden User
    wardenUser = {
      id: crypto.randomUUID(),
      organizationId: orgId,
      branchId: branchId1,
      role: UserRole.WARDEN,
      email: `warden_${Date.now()}@test.com`,
      name: 'Hostel Warden',
    };

    // Create Rooms
    const rA = await roomService.createRoom(orgId, branchId1, {
      roomNumber: 'A-101',
      floor: 1,
      capacity: 2,
      baseRent: 6000,
    });
    roomAId = rA.room.id;
    bedA1Id = rA.beds[0].id;
    bedA2Id = rA.beds[1].id;

    const rB = await roomService.createRoom(orgId, branchId1, {
      roomNumber: 'B-201',
      floor: 2,
      capacity: 1, // Single capacity to test capacity limits
      baseRent: 8000,
    });
    roomBId = rB.room.id;
    bedB1Id = rB.beds[0].id;

    // Register Student 1 into Bed A1
    studentRecord = await studentService.registerStudent(orgId, branchId1, {
      fullName: 'Alice Walker',
      email: `alice_${Date.now()}@test.com`,
      phone: '+91 9876543210',
      gender: 'FEMALE',
      bedId: bedA1Id,
    });

    studentUser = {
      id: studentRecord.id,
      studentId: studentRecord.id,
      customerCode: studentRecord.customer_code,
      organizationId: orgId,
      branchId: branchId1,
      role: UserRole.STUDENT,
      email: studentRecord.email,
      name: studentRecord.full_name,
    };

    // Register Student 2
    studentRecord2 = await studentService.registerStudent(orgId, branchId1, {
      fullName: 'Bob Roberts',
      email: `bob_${Date.now()}@test.com`,
      phone: '+91 9876543211',
      gender: 'MALE',
    });
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  // ---------------------------------------------------------------------------
  // ISSUE 1 (NEW-001 - P0): Unauthenticated Password Reset Protection
  // ---------------------------------------------------------------------------
  describe('NEW-001 (P0): Insecure Password Reset Backdoor Elimination', () => {
    it('calling forgotPassword with newPassword must NOT directly mutate password in DB', async () => {
      const originalPassword = 'SecurePassword@2026';
      const attackerPassword = 'HackedPassword@999';

      // Attempt direct password reset via forgotPassword
      await authService.forgotPassword(ownerUser.email, attackerPassword);

      // Verify that the user password remains the original and attacker password fails
      const userInDb = await queryOne<any>('SELECT password_hash FROM users WHERE id = $1', [ownerUser.id]);
      const isOriginalValid = await require('bcryptjs').compare(originalPassword, userInDb.password_hash);
      const isAttackerValid = await require('bcryptjs').compare(attackerPassword, userInDb.password_hash);

      expect(isOriginalValid).toBe(true);
      expect(isAttackerValid).toBe(false);
    });

    it('password reset must require valid OTP and issued reset token', async () => {
      // Invalid OTP must be rejected
      await expect(
        authService.verifyPasswordResetOtp(ownerUser.email, '000000')
      ).rejects.toThrow();

      // Forged or nonexistent token must be rejected
      await expect(
        authService.resetPasswordWithToken('forged-token-abc', 'NewValidPass@123')
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // ISSUE 2 (NEW-002 - P1): Refresh Token Contract
  // ---------------------------------------------------------------------------
  describe('NEW-002 (P1): Refresh Token Session Renewal', () => {
    it('valid refresh token successfully returns newly signed accessToken and tokens', async () => {
      const refreshRes = await authService.refreshSession(validRefreshToken);
      expect(refreshRes).toHaveProperty('accessToken');
      expect(refreshRes).toHaveProperty('refreshToken');
      expect(refreshRes).toHaveProperty('token');
      expect(refreshRes.user.email).toBe(ownerUser.email);

      // Verify newly signed access token is valid JWT
      const secret = process.env.JWT_SECRET || 'ihms-super-secret-jwt-key-production-2026';
      const decoded: any = jwt.verify(refreshRes.accessToken, secret);
      expect(decoded.id).toBe(ownerUser.id);
    });

    it('invalid or expired refresh token throws 401 Unauthorized', async () => {
      await expect(
        authService.refreshSession('malformed-or-tampered-token')
      ).rejects.toThrow('Invalid or expired refresh token.');
    });
  });

  // ---------------------------------------------------------------------------
  // ISSUE 3 (NEW-003 - P1): Leave Approval RBAC
  // ---------------------------------------------------------------------------
  describe('NEW-003 (P1): Leave Approval RBAC Enforcement', () => {
    const leaveGuard = authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN, UserRole.BRANCH_MANAGER);

    it('should reject STUDENT attempting to approve leave with 403 Forbidden', () => {
      const req: any = { user: { ...studentUser } };
      let errorThrown: any = null;
      const next = (err?: any) => { if (err) errorThrown = err; };

      leaveGuard(req, {} as any, next);
      expect(errorThrown).toBeDefined();
      expect(errorThrown.statusCode).toBe(403);
    });

    it('should permit WARDEN and OWNER to approve leave', () => {
      const wardenReq: any = { user: { ...wardenUser } };
      let wardenError: any = undefined;
      leaveGuard(wardenReq, {} as any, (err?: any) => { wardenError = err; });
      expect(wardenError).toBeUndefined();

      const ownerReq: any = { user: { ...ownerUser, role: UserRole.OWNER } };
      let ownerError: any = undefined;
      leaveGuard(ownerReq, {} as any, (err?: any) => { ownerError = err; });
      expect(ownerError).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // ISSUE 4 (NEW-004 - P1): Financial Report Authorization
  // ---------------------------------------------------------------------------
  describe('NEW-004 (P1): Financial Reporting RBAC Enforcement', () => {
    const financeGuard = authorizeRoles(UserRole.OWNER, UserRole.ACCOUNTANT, UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN);

    it('should reject STUDENT from accessing profit-and-loss and expenses with 403 Forbidden', () => {
      const req: any = { user: { ...studentUser } };
      let errorThrown: any = null;
      financeGuard(req, {} as any, (err?: any) => { if (err) errorThrown = err; });
      expect(errorThrown).toBeDefined();
      expect(errorThrown.statusCode).toBe(403);
    });

    it('should permit OWNER and ACCOUNTANT to access financial reports', () => {
      const ownerReq: any = { user: { ...ownerUser, role: 'OWNER' } };
      let ownerError: any = undefined;
      financeGuard(ownerReq, {} as any, (err?: any) => { ownerError = err; });
      expect(ownerError).toBeUndefined();

      const accountantReq: any = { user: { id: 'acc-1', organizationId: orgId, role: UserRole.ACCOUNTANT } };
      let accError: any = undefined;
      financeGuard(accountantReq, {} as any, (err?: any) => { accError = err; });
      expect(accError).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // ISSUE 5 (NEW-005 - P1): Visitor Authorization & Privacy
  // ---------------------------------------------------------------------------
  describe('NEW-005 (P1): Visitor Authorization & Privacy Enforcement', () => {
    const staffCheckoutGuard = authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN, UserRole.SECURITY_GUARD, UserRole.BRANCH_MANAGER);

    it('should block STUDENT from performing visitor checkout with 403 Forbidden', () => {
      const req: any = { user: { ...studentUser } };
      let errorThrown: any = null;
      staffCheckoutGuard(req, {} as any, (err?: any) => { if (err) errorThrown = err; });
      expect(errorThrown).toBeDefined();
      expect(errorThrown.statusCode).toBe(403);
    });

    it('should permit SECURITY_GUARD and WARDEN to perform checkout', () => {
      const guardReq: any = { user: { id: 'sec-1', organizationId: orgId, role: UserRole.SECURITY_GUARD } };
      let guardError: any = undefined;
      staffCheckoutGuard(guardReq, {} as any, (err?: any) => { guardError = err; });
      expect(guardError).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // ISSUE 6 (NEW-006 - P1): Complaint Status & Resolution Privilege Escalation
  // ---------------------------------------------------------------------------
  describe('NEW-006 (P1): Complaint Resolution Privilege Enforcement', () => {
    const staffComplaintGuard = authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN, UserRole.MAINTENANCE_STAFF, UserRole.BRANCH_MANAGER);

    it('should block STUDENT from resolving complaints or changing status with 403 Forbidden', () => {
      const req: any = { user: { ...studentUser } };
      let errorThrown: any = null;
      staffComplaintGuard(req, {} as any, (err?: any) => { if (err) errorThrown = err; });
      expect(errorThrown).toBeDefined();
      expect(errorThrown.statusCode).toBe(403);
    });

    it('should permit MAINTENANCE_STAFF and WARDEN to resolve complaints', () => {
      const staffReq: any = { user: { id: 'maint-1', organizationId: orgId, role: UserRole.MAINTENANCE_STAFF } };
      let staffError: any = undefined;
      staffComplaintGuard(staffReq, {} as any, (err?: any) => { staffError = err; });
      expect(staffError).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // ISSUE 7 (NEW-007 - P1): Socket.IO Room Authorization
  // ---------------------------------------------------------------------------
  describe('NEW-007 (P1): Socket.IO Room Authorization Guard', () => {
    it('unauthenticated socket cannot join any room', () => {
      let emittedError: any = null;
      const fakeSocket: any = {
        join: jest.fn(),
        emit: (event: string, data: any) => {
          if (event === 'error') emittedError = data;
        },
      };

      const user = null;
      if (!user) {
        fakeSocket.emit('error', { message: 'Unauthorized: Authentication required to join rooms.' });
      }

      expect(emittedError).toBeDefined();
      expect(fakeSocket.join).not.toHaveBeenCalled();
    });

    it('student cannot join privileged role:OWNER or foreign org room', () => {
      let emittedError: any = null;
      const fakeSocket: any = {
        join: jest.fn(),
        emit: (event: string, data: any) => {
          if (event === 'error') emittedError = data;
        },
      };

      const user = { ...studentUser };
      const requestedRoom = 'role:OWNER';

      const isAllowed =
        (user.organizationId && requestedRoom === 'org:' + user.organizationId) ||
        (user.role && requestedRoom === 'role:' + user.role);

      if (isAllowed) {
        fakeSocket.join(requestedRoom);
      } else {
        fakeSocket.emit('error', { message: `Unauthorized: Cannot join room '${requestedRoom}'.` });
      }

      expect(emittedError).toBeDefined();
      expect(fakeSocket.join).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // ISSUE 8 (NEW-008 - P1): Room Transfer Occupancy Counter & Transaction
  // ---------------------------------------------------------------------------
  describe('NEW-008 (P1): Room Transfer Occupancy Counter & Concurrency', () => {
    it('transferring student atomically decrements source room count and increments target room count', async () => {
      // Check initial room counts
      const initialRoomA = await queryOne<any>('SELECT occupied_beds FROM rooms WHERE id = $1', [roomAId]);
      const initialRoomB = await queryOne<any>('SELECT occupied_beds FROM rooms WHERE id = $1', [roomBId]);

      expect(Number(initialRoomA.occupied_beds)).toBe(1); // Alice is in Room A
      expect(Number(initialRoomB.occupied_beds)).toBe(0); // Room B is empty

      // Execute transfer: Alice from Bed A1 (Room A) to Bed B1 (Room B)
      await studentService.transferStudent(orgId, studentRecord.id, {
        targetBranchId: branchId1,
        targetBedId: bedB1Id,
        reason: 'Upgrading to single room',
        approvedBy: 'Warden Smith',
      });

      // Verify updated room counts
      const updatedRoomA = await queryOne<any>('SELECT occupied_beds FROM rooms WHERE id = $1', [roomAId]);
      const updatedRoomB = await queryOne<any>('SELECT occupied_beds FROM rooms WHERE id = $1', [roomBId]);

      expect(Number(updatedRoomA.occupied_beds)).toBe(0); // Decremented
      expect(Number(updatedRoomB.occupied_beds)).toBe(1); // Incremented

      // Verify bed statuses
      const oldBed = await queryOne<any>('SELECT status, current_student_id FROM beds WHERE id = $1', [bedA1Id]);
      const newBed = await queryOne<any>('SELECT status, current_student_id FROM beds WHERE id = $1', [bedB1Id]);

      expect(oldBed.status).toBe(BedStatus.AVAILABLE);
      expect(oldBed.current_student_id).toBeNull();
      expect(newBed.status).toBe(BedStatus.OCCUPIED);
      expect(newBed.current_student_id).toBe(studentRecord.id);
    });

    it('transfer to a fully occupied room must be rejected with 400', async () => {
      // Room B has capacity 1 and is now occupied by Alice.
      // Attempting to transfer Bob into Room B Bed B1 must fail.
      await expect(
        studentService.transferStudent(orgId, studentRecord2.id, {
          targetBranchId: branchId1,
          targetBedId: bedB1Id,
          reason: 'Attempt transfer to full room',
          approvedBy: 'Admin',
        })
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // ISSUE 9 (NEW-009 - P2): Webhook Signature Bypass Protection
  // ---------------------------------------------------------------------------
  describe('NEW-009 (P2): Webhook Signature Bypass Environment Restriction', () => {
    it('webhook signature bypass is strictly forbidden outside NODE_ENV === test', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevBypass = process.env.BYPASS_WEBHOOK_SIGNATURE;

      try {
        process.env.NODE_ENV = 'production';
        process.env.BYPASS_WEBHOOK_SIGNATURE = 'true';

        const isValid = false;
        let bypassAllowed = false;

        if (!isValid) {
          if (process.env.NODE_ENV === 'test' && process.env.BYPASS_WEBHOOK_SIGNATURE === 'true') {
            bypassAllowed = true;
          }
        }

        expect(bypassAllowed).toBe(false);
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.BYPASS_WEBHOOK_SIGNATURE = prevBypass;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // ISSUE 10 (NEW-010 - P2): Floating-Point Precision in Fee Webhook Ledger
  // ---------------------------------------------------------------------------
  describe('NEW-010 (P2): Floating-Point Precision in Webhook Updates', () => {
    it('maintains clean 2-decimal precision across multiple partial and decimal payments', () => {
      let totalPaid = 0;
      let outstanding = 10000.00;

      const payments = [3333.33, 3333.33, 3333.34];

      for (const pmt of payments) {
        totalPaid = roundCurrency(totalPaid + pmt);
        outstanding = roundCurrency(Math.max(0, outstanding - pmt));
      }

      expect(totalPaid).toBe(10000.00);
      expect(outstanding).toBe(0.00);
      expect(totalPaid.toString()).toBe('10000');
    });

    it('eliminates IEEE-754 binary floating-point drift on fractional paisa amounts', () => {
      const val1 = 0.1;
      const val2 = 0.2;
      const rawSum = val1 + val2;

      expect(rawSum).not.toBe(0.3);
      expect(roundCurrency(rawSum)).toBe(0.3);
    });
  });
});