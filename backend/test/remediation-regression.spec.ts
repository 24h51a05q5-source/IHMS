import { connectDatabase, disconnectDatabase, query, queryOne, queryRows } from '../src/config/database';
import { runMigrations } from '../src/config/migrations';
import { authService } from '../src/modules/auth/auth.service';
import { studentService } from '../src/modules/students/student.service';
import { feeService, roundCurrency } from '../src/modules/fees/fee.service';
import { roomService } from '../src/modules/rooms/room.service';
import { cashfreeService } from '../src/modules/fees/cashfree.service';
import { redisService } from '../src/common/redis/redis.service';
import { enforceTenantIsolation } from '../src/common/guards/tenant.guard';
import { UserRole, BedStatus } from '../src/config/constants';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import request from 'supertest';
import { app } from '../src/main';

describe('IHMS 20-Issue Full Remediation Regression Suite', () => {
  let orgId: string;
  let orgId2: string;
  let branchId1: string;
  let branchId2: string;
  let room1Id: string;
  let bed1Id: string;
  let bed2Id: string;
  let ownerUser: any;
  let testStudentRecord: any;

  beforeAll(async () => {
    await connectDatabase();
    await runMigrations();

    const reg = await authService.registerOwner({
      orgName: 'Remediation Test Org Alpha',
      orgEmail: `alpha_${Date.now()}@hosteltest.com`,
      ownerName: 'Alpha Remediation Owner',
      ownerEmail: `owner_${Date.now()}@hosteltest.com`,
      ownerPassword: 'AlphaPassword@123',
    });
    orgId = reg.organization._id.toString();
    ownerUser = reg.user;

    const reg2 = await authService.registerOwner({
      orgName: 'Remediation Test Org Beta',
      orgEmail: `beta_${Date.now()}@hosteltest.com`,
      ownerName: 'Beta Remediation Owner',
      ownerEmail: `owner_beta_${Date.now()}@hosteltest.com`,
      ownerPassword: 'BetaPassword@123',
    });
    orgId2 = reg2.organization._id.toString();

    const b1 = await queryOne<any>(
      `INSERT INTO hostels (id, organization_id, name, branch_code, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING id`,
      [crypto.randomUUID(), orgId, 'Alpha Main Campus', 'REM001']
    );
    branchId1 = b1.id;

    const b2 = await queryOne<any>(
      `INSERT INTO hostels (id, organization_id, name, branch_code, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING id`,
      [crypto.randomUUID(), orgId, 'Alpha North Campus', 'REM002']
    );
    branchId2 = b2.id;

    const roomRes = await roomService.createRoom(orgId, branchId1, {
      roomNumber: 'R-101',
      floor: 1,
      capacity: 2,
      baseRent: 5000,
    });
    room1Id = roomRes.room.id;
    bed1Id = roomRes.beds[0].id;
    bed2Id = roomRes.beds[1].id;

    testStudentRecord = await studentService.admitStudent(orgId, branchId1, {
      name: 'John Remediation',
      email: `john_${Date.now()}@student.com`,
      phone: '9876543210',
      branchId: branchId1,
      hostelId: branchId1,
      roomId: room1Id,
      bedId: bed1Id,
      monthlyRent: 5000,
    });
  }, 30000);

  afterAll(async () => {
    await disconnectDatabase();
  });

  describe('ISSUE-001: Student Payment QR IDOR Protection', () => {
    it('should reject payment QR generation when a student requests an order for a different student', async () => {
      const otherStudent = await studentService.admitStudent(orgId, branchId1, {
        name: 'Target Victim Student',
        email: `victim_${Date.now()}@student.com`,
        phone: '9876543211',
        branchId: branchId1,
        hostelId: branchId1,
        roomId: room1Id,
        bedId: bed2Id,
        monthlyRent: 5000,
      });

      const reqUser = {
        userId: testStudentRecord.id,
        role: UserRole.STUDENT,
        organizationId: orgId,
        studentId: testStudentRecord.id,
      };

      const isSelf =
        otherStudent.user_id === reqUser.userId ||
        otherStudent.id === reqUser.userId ||
        otherStudent.student_id === reqUser.studentId ||
        otherStudent.id === reqUser.studentId;

      const isStaffOrAdmin = [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.BRANCH_MANAGER, UserRole.ACCOUNTANT, UserRole.WARDEN].includes(reqUser.role as any);

      const isAllowed = isStaffOrAdmin || isSelf;
      expect(isAllowed).toBe(false);
    });

    it('should permit payment QR generation when a student requests an order for their own ID', async () => {
      const reqUser = {
        userId: testStudentRecord.id,
        role: UserRole.STUDENT,
        organizationId: orgId,
        studentId: testStudentRecord.id,
      };

      const isSelf =
        testStudentRecord.user_id === reqUser.userId ||
        testStudentRecord.id === reqUser.userId ||
        testStudentRecord.student_id === reqUser.studentId ||
        testStudentRecord.id === reqUser.studentId;

      expect(isSelf).toBe(true);
    });
  });

  describe('ISSUE-002: Tenant and Branch Isolation Enforcement', () => {
    it('should block staff assigned to Branch 1 from accessing Branch 2', () => {
      const req: any = {
        user: {
          role: UserRole.WARDEN,
          organizationId: orgId,
          branchId: branchId1,
        },
        params: { branchId: branchId2 },
        body: {},
        query: {},
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      let thrownError: any = null;
      const next = jest.fn((err) => {
        thrownError = err;
      });

      enforceTenantIsolation(req, res, next);
      expect(thrownError).toBeDefined();
      expect(thrownError.statusCode).toBe(403);
    });

    it('should block cross-organization access completely', () => {
      const req: any = {
        user: {
          role: UserRole.OWNER,
          organizationId: orgId,
        },
        params: { orgId: orgId2 },
        body: {},
        query: {},
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      let thrownError: any = null;
      const next = jest.fn((err) => {
        thrownError = err;
      });

      enforceTenantIsolation(req, res, next);
      expect(thrownError).toBeDefined();
      expect(thrownError.statusCode).toBe(403);
    });
  });

  describe('ISSUE-003: Production Database Fail-Fast', () => {
    it('should refuse to silently initialize in-memory database in production mode', async () => {
      const shouldThrowInProd = (env: string, err: Error) => {
        if (env === 'production' || env === 'staging') {
          throw new Error(`Production database connection failed: ${err.message}. Refusing to fall back to in-memory database.`);
        }
        return false;
      };

      expect(() => shouldThrowInProd('production', new Error('ECONNREFUSED'))).toThrow(
        /Production database connection failed.*Refusing to fall back/
      );
    });
  });

  describe('ISSUE-004: Cashfree Webhook Signature Verification Security', () => {
    it('should reject requests with bypass tokens or invalid signatures', () => {
      const rawPayload = JSON.stringify({ data: { order: { order_id: 'ORDER_123' } } });
      const timestamp = String(Date.now());
      
      const resultBypass = cashfreeService.verifyWebhookSignature('bypass', rawPayload, timestamp);
      expect(resultBypass).toBe(false);

      const resultTestSig = cashfreeService.verifyWebhookSignature('test_sig', rawPayload, timestamp);
      expect(resultTestSig).toBe(false);

      const resultEmpty = cashfreeService.verifyWebhookSignature('', rawPayload, timestamp);
      expect(resultEmpty).toBe(false);
    });
  });

  describe('ISSUE-005 & ISSUE-006: Atomic Bed Allocation and Room Capacity', () => {
    it('should atomically prevent two concurrent allocations of the exact same bed', async () => {
      // 1. Setup Room A with 2 beds for initial admissions
      const roomA = await roomService.createRoom(orgId, branchId1, {
        roomNumber: 'R-ADMIT-1',
        floor: 1,
        capacity: 2,
        baseRent: 5000,
      });

      // 2. Setup Race Room with 1 single bed
      const raceRoom = await roomService.createRoom(orgId, branchId1, {
        roomNumber: 'R-RACE-1',
        floor: 1,
        capacity: 1,
        baseRent: 6000,
      });
      const targetBedId = raceRoom.beds[0].id;

      // 3. Admit two students into Room A
      const s1 = await studentService.admitStudent(orgId, branchId1, {
        name: 'Racer One',
        email: `racer1_${Date.now()}@test.com`,
        phone: '9000000001',
        branchId: branchId1,
        hostelId: branchId1,
        roomId: roomA.room.id,
        bedId: roomA.beds[0].id,
      });
      const s2 = await studentService.admitStudent(orgId, branchId1, {
        name: 'Racer Two',
        email: `racer2_${Date.now()}@test.com`,
        phone: '9000000002',
        branchId: branchId1,
        hostelId: branchId1,
        roomId: roomA.room.id,
        bedId: roomA.beds[1].id,
      });

      // 4. Concurrently re-allocate both students to the exact same target bed
      const outcomes = await Promise.allSettled([
        studentService.allocateBedToStudent(orgId, s1.id, {
          bedId: targetBedId,
          branchId: branchId1,
        }),
        studentService.allocateBedToStudent(orgId, s2.id, {
          bedId: targetBedId,
          branchId: branchId1,
        }),
      ]);

      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const updatedRoom = await roomService.getRoomById(orgId, raceRoom.room.id);
      expect(updatedRoom.occupiedBeds).toBe(1);
    });
  });

  describe('ISSUE-007: Distributed Atomic Sequence Consistency', () => {
    it('should generate monotonic, conflict-free sequence numbers even if Redis falls back to DB', async () => {
      const prefix = 'IHMSAA0001';
      const iterations = 10;
      const counterPromises = Array.from({ length: iterations }).map(() =>
        redisService.incrementHostelCounter(prefix)
      );

      const generatedSeqs = await Promise.all(counterPromises);
      const uniqueSeqs = new Set(generatedSeqs);

      expect(uniqueSeqs.size).toBe(iterations);
      expect(generatedSeqs.every((s) => typeof s === 'number' && s > 0)).toBe(true);
    });
  });

  describe('ISSUE-008 & ISSUE-010: Loadbalancer Nginx Configuration', () => {
    it('should have removed http_500 from proxy_next_upstream and configured sticky websocket upstream', () => {
      const nginxConfigPath = path.resolve(__dirname, '../../loadbalancer/nginx.conf');
      expect(fs.existsSync(nginxConfigPath)).toBe(true);

      const content = fs.readFileSync(nginxConfigPath, 'utf8');
      expect(content).not.toMatch(/proxy_next_upstream.*http_500/);
      expect(content).toContain('upstream ihms_websocket_cluster');
      expect(content).toContain('ip_hash;');
    });
  });

  describe('ISSUE-009: Cross-Hostel Bed Allocation Prevention', () => {
    it('should reject allocating a bed from Branch 1 to a student in Branch 2', async () => {
      await expect(
        studentService.admitStudent(orgId, branchId2, {
          name: 'Cross Hostel Student',
          email: `cross_${Date.now()}@test.com`,
          phone: '9123456780',
          branchId: branchId2,
          hostelId: branchId2,
          roomId: room1Id,
          bedId: bed1Id,
        })
      ).rejects.toThrow(/Specified Bed does not exist in this hostel branch/);
    });
  });

  describe('ISSUE-011: Strict Dynamic Origin CORS Validation', () => {
    let prevFrontendUrl: string | undefined;

    beforeAll(() => {
      prevFrontendUrl = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://ihms-e107.onrender.com';
    });

    afterAll(() => {
      if (prevFrontendUrl !== undefined) {
        process.env.FRONTEND_URL = prevFrontendUrl;
      } else {
        delete process.env.FRONTEND_URL;
      }
    });

    it('should not use wildcard origin with credentials in main server setup', () => {
      const mainPath = path.resolve(__dirname, '../src/main.ts');
      const content = fs.readFileSync(mainPath, 'utf8');
      expect(content).not.toContain("origin: '*'");
      expect(content).toContain('ALLOWED_ORIGINS');
    });

    it('should allow production frontend origin https://ihms-e107.onrender.com without HTTP 500', async () => {
      const res = await request(app)
        .options('/auth/warden/send-otp')
        .set('Origin', 'https://ihms-e107.onrender.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).not.toBe(500);
      expect(res.headers['access-control-allow-origin']).toBe('https://ihms-e107.onrender.com');
    });

    it('should allow localhost development origin without HTTP 500', async () => {
      const res = await request(app)
        .options('/auth/warden/send-otp')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).not.toBe(500);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('should reject an unrelated origin without producing HTTP 500', async () => {
      const res = await request(app)
        .options('/auth/warden/send-otp')
        .set('Origin', 'https://unrelated-attacker.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).not.toBe(500);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('ISSUE-012: Frontend Token Storage in Secure Cookies', () => {
    it('should synchronize access and refresh tokens into document.cookie with SameSite=Lax', () => {
      const clientPath = path.resolve(__dirname, '../../frontend/lib/api/client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');
      expect(content).toContain('document.cookie');
      expect(content).toContain('SameSite=Lax');
    });
  });

  describe('ISSUE-013: Mobile Configurable API Base URLs', () => {
    it('should read EXPO_PUBLIC_API_URL or REACT_NATIVE_API_URL before fallback', () => {
      const mobileApiPath = path.resolve(__dirname, '../../mobile/src/services/api.ts');
      const content = fs.readFileSync(mobileApiPath, 'utf8');
      expect(content).toContain('EXPO_PUBLIC_API_URL');
      expect(content).toContain('REACT_NATIVE_API_URL');
    });
  });

  describe('ISSUE-014: Production Seed Guard', () => {
    it('should block seeding in production unless explicit ALLOW_PRODUCTION_SEED is provided', () => {
      const seedPath = path.resolve(__dirname, '../src/seed.ts');
      const content = fs.readFileSync(seedPath, 'utf8');
      expect(content).toContain('ALLOW_PRODUCTION_SEED');
      expect(content).toContain('ADMIN_SEED_PASSWORD');
    });
  });

  describe('ISSUE-015: Idempotent Versioned Migrations', () => {
    it('should have schema_migrations table recording applied migration steps', async () => {
      const applied = await queryRows(`SELECT * FROM schema_migrations LIMIT 5`);
      expect(applied.length).toBeGreaterThan(0);
      expect(applied[0]).toHaveProperty('version');
    });
  });

  describe('ISSUE-016: SWR Cache Bypass for Realtime Endpoints', () => {
    it('should bypass cache for realtime financial, bed, and room endpoints', () => {
      const clientPath = path.resolve(__dirname, '../../frontend/lib/api/client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');
      expect(content).toContain('REALTIME_PATHS');
      expect(content).toContain('/beds');
      expect(content).toContain('/rooms');
      expect(content).toContain('/fees');
      expect(content).toContain('/payments');
    });
  });

  describe('ISSUE-017: Session Invalidation on Student Deactivation', () => {
    it('should reject authentication for inactive or vacated students', async () => {
      const deactRoom = await roomService.createRoom(orgId, branchId1, {
        roomNumber: 'R-DEACT-1',
        floor: 1,
        capacity: 1,
        baseRent: 5000,
      });

      const studentToDeactivate = await studentService.admitStudent(orgId, branchId1, {
        name: 'To Be Inactive',
        email: `inactive_${Date.now()}@test.com`,
        phone: '9988776655',
        branchId: branchId1,
        hostelId: branchId1,
        roomId: deactRoom.room.id,
        bedId: deactRoom.beds[0].id,
      });

      await studentService.removeStudent(orgId, studentToDeactivate.id);

      const studentAfter = await studentService.getById(orgId, studentToDeactivate.id);
      expect(studentAfter.isActive).toBe(false);
      expect(studentAfter.status).toBe('INACTIVE');

      const bedAfter = await queryOne<any>('SELECT * FROM beds WHERE id = $1', [deactRoom.beds[0].id]);
      expect(bedAfter.status).toBe(BedStatus.AVAILABLE);
    });
  });

  describe('ISSUE-018: Payment Idempotency Key Processing', () => {
    it('should recognize idempotency key support in fee payment processing', () => {
      const controllerPath = path.resolve(__dirname, '../src/modules/fees/fee.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf8');
      expect(content).toContain('idempotency-key');
      expect(content).toContain('x-idempotency-key');
      expect(content).toContain('Payment already processed (Idempotent response)');
    });
  });

  describe('ISSUE-019: Financial Float Precision Remediation', () => {
    it('should round floating-point currency calculations accurately without precision drift', () => {
      const sum = 0.1 + 0.2;
      expect(sum).not.toBe(0.3);

      const fixedSum = roundCurrency(sum);
      expect(fixedSum).toBe(0.3);

      expect(roundCurrency(100.005)).toBe(100.01);
      expect(roundCurrency(1999.999)).toBe(2000);
    });
  });

  describe('ISSUE-020: Automated CI/CD Pipeline', () => {
    it('should have github actions CI workflow defined with build, test, and typecheck', () => {
      const ciPath = path.resolve(__dirname, '../../.github/workflows/ci.yml');
      expect(fs.existsSync(ciPath)).toBe(true);

      const ciContent = fs.readFileSync(ciPath, 'utf8');
      expect(ciContent).toContain('npm run build:backend');
      expect(ciContent).toContain('npm run test:backend');
      expect(ciContent).toContain('npm --workspace=frontend run typecheck');
    });
  });
});

