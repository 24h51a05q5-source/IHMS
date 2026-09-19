import { connectDatabase, disconnectDatabase, query, queryOne } from '../src/config/database';
import { redisService } from '../src/common/redis/redis.service';
import { migrateStudentCustomIds } from '../src/config/migrations';
import { authService } from '../src/modules/auth/auth.service';
import { studentService } from '../src/modules/students/student.service';
import { formatHostelCode } from '../src/common/utils/code-generator';
import bcrypt from 'bcryptjs';

describe('Enterprise Student ID Generation (10M+ Scale) & Legacy Migration', () => {
  const orgId = 'org-ent-test-01';
  const hostelA = 'H101';
  const hostelB = 'H102';

  beforeAll(async () => {
    await connectDatabase();
    redisService.resetInMemory();

    // Create test organization & hostels
    await query(
      `INSERT INTO organizations (id, org_code, name)
       VALUES ($1, 'ENT001', 'Enterprise Academy')
       ON CONFLICT (id) DO NOTHING`,
      [orgId]
    );

    await query(
      `INSERT INTO hostels (id, hostel_id, organization_id, name, branch_name)
       VALUES ($1, $1, $2, 'Hostel 101 Branch', 'Branch A'),
              ($3, $3, $2, 'Hostel 102 Branch', 'Branch B')
       ON CONFLICT (id) DO NOTHING`,
      [hostelA, orgId, hostelB]
    );
  });

  afterAll(async () => {
    await redisService.disconnect();
    await disconnectDatabase();
  });

  // ============================================================================
  // Phase 1: Redis Atomic Generation (The Engine)
  // ============================================================================
  describe('Phase 1: Redis Atomic Generation (The Engine)', () => {
    it('should format systematic 10-char Hostel ID with vehicle-registration rollover IHMS[AA..ZZ][0001..9999]', () => {
      expect(formatHostelCode(1)).toBe('IHMSAA0001');
      expect(formatHostelCode(42)).toBe('IHMSAA0042');
      expect(formatHostelCode(9999)).toBe('IHMSAA9999');
      expect(formatHostelCode(10000)).toBe('IHMSAB0001');
      expect(formatHostelCode(26 * 9999)).toBe('IHMSAZ9999');
      expect(formatHostelCode(26 * 9999 + 1)).toBe('IHMSBA0001');
    });

    it('should format systematic Student ID with parent hostel code and letter-rollover [HostelCode]-[a001..a999]->[b001..]', () => {
      expect(redisService.formatStudentId('IHMSAA0001', 1)).toBe('IHMSAA0001-a001');
      expect(redisService.formatStudentId('IHMSAA0001', 45)).toBe('IHMSAA0001-a045');
      expect(redisService.formatStudentId('IHMSAA0001', 999)).toBe('IHMSAA0001-a999');
      expect(redisService.formatStudentId('IHMSAA0001', 1000)).toBe('IHMSAA0001-b001');
      expect(redisService.formatStudentId('IHMSAA0001', 1999)).toBe('IHMSAA0001-c001');
    });

    it('should format student ID with 4-digit zero padding for legacy test fixtures [HostelID]-[SequentialNumber]', () => {
      expect(redisService.formatStudentId('H102', 1)).toBe('H102-0001');
      expect(redisService.formatStudentId('H102', 45)).toBe('H102-0045');
      expect(redisService.formatStudentId('H102', 999)).toBe('H102-0999');
      expect(redisService.formatStudentId('H102', 1000)).toBe('H102-1000');
      expect(redisService.formatStudentId('H102', 12345)).toBe('H102-12345');
    });

    it('should generate strictly sequential, non-blocking atomic IDs under concurrent load (50 concurrent requests)', async () => {
      redisService.resetInMemory();
      const concurrentRequests = 50;

      // Simulate 50 concurrent student admissions executing simultaneously
      const ids = await Promise.all(
        Array.from({ length: concurrentRequests }, () => redisService.generateStudentCustomId(hostelB))
      );

      // Verify count
      expect(ids.length).toBe(concurrentRequests);

      // Verify uniqueness (ZERO duplicate IDs)
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(concurrentRequests);

      // Verify all follow H102-XXXX pattern
      for (const id of ids) {
        expect(id).toMatch(/^H102-\d{4,}$/);
      }

      // Verify boundary values: lowest is H102-0001, highest is H102-0050
      const sorted = [...ids].sort();
      expect(sorted[0]).toBe('H102-0001');
      expect(sorted[sorted.length - 1]).toBe('H102-0050');
    });

    it('should maintain independent atomic sequence counters across different hostels (Multi-Tenant Isolation)', async () => {
      redisService.resetInMemory();

      const a1 = await redisService.generateStudentCustomId(hostelA);
      const a2 = await redisService.generateStudentCustomId(hostelA);
      const b1 = await redisService.generateStudentCustomId(hostelB);
      const a3 = await redisService.generateStudentCustomId(hostelA);
      const b2 = await redisService.generateStudentCustomId(hostelB);

      expect(a1).toBe('H101-0001');
      expect(a2).toBe('H101-0002');
      expect(a3).toBe('H101-0003');

      expect(b1).toBe('H102-0001');
      expect(b2).toBe('H102-0002');
    });
  });

  // ============================================================================
  // Phase 2: PostgreSQL Storage (The Vault)
  // ============================================================================
  describe('Phase 2: PostgreSQL Storage (The Vault)', () => {
    it('should store custom_id in students table and enforce unique constraint against collisions', async () => {
      const customId = `TEST_VAULT_${Date.now()}`;
      const sId1 = `stu_v1_${Date.now()}`;
      const sId2 = `stu_v2_${Date.now()}`;

      // Insert first student with custom_id
      await query(
        `INSERT INTO students (
          id, customer_code, organization_id, hostel_id, full_name, email, custom_id
        ) VALUES ($1, $1, $2, $3, 'Student Vault One', $4, $5)`,
        [sId1, orgId, hostelA, `v1_${Date.now()}@test.com`, customId]
      );

      const saved = await queryOne<any>(`SELECT custom_id FROM students WHERE id = $1`, [sId1]);
      expect(saved.custom_id).toBe(customId);

      // Attempt inserting duplicate custom_id must fail unique constraint
      let duplicateError: any = null;
      try {
        await query(
          `INSERT INTO students (
            id, customer_code, organization_id, hostel_id, full_name, email, custom_id
          ) VALUES ($1, $1, $2, $3, 'Student Vault Duplicate', $4, $5)`,
          [sId2, orgId, hostelA, `v2_${Date.now()}@test.com`, customId]
        );
      } catch (err: any) {
        duplicateError = err;
      }

      expect(duplicateError).not.toBeNull();
      expect(duplicateError.message).toMatch(/duplicate|unique|already exists/i);
    });

    it('should automatically assign custom_id during student admission via studentService', async () => {
      const roomRes = await query(
        `INSERT INTO rooms (id, room_number, hostel_id, organization_id, capacity, total_beds, occupied_beds, available_beds)
         VALUES ($1, '901', $2, $3, 2, 2, 0, 2)
         RETURNING id`,
        [`room_adm_${Date.now()}`, hostelB, orgId]
      );
      const roomId = roomRes.rows[0].id;

      const bedRes = await query(
        `INSERT INTO beds (id, bed_number, bed_code, room_id, hostel_id, organization_id, status)
         VALUES ($1, 1, $2, $3, $4, $5, 'AVAILABLE')
         RETURNING id`,
        [`bed_adm_${Date.now()}`, `CODE_${Date.now()}`, roomId, hostelB, orgId]
      );
      const bedId = bedRes.rows[0].id;

      const admitted = await studentService.admitStudent(orgId, hostelB, {
        fullName: 'Arjun Verma',
        email: `arjun_${Date.now()}@test.com`,
        phone: '+91 9988776655',
        bedId,
      });

      expect(admitted).toBeDefined();
      expect(admitted.custom_id || admitted.customId).toBeDefined();
      expect(admitted.custom_id || admitted.customId).toMatch(new RegExp(`^${hostelB}-\\d{4,}$`));
    });
  });

  // ============================================================================
  // Phase 3: Legacy ID Migration & Cleanup
  // ============================================================================
  describe('Phase 3: Legacy ID Migration & Redis Hand-off Synchronization', () => {
    const migHostel = `H_MIG_${Date.now()}`;

    beforeAll(async () => {
      await query(
        `INSERT INTO hostels (id, hostel_id, organization_id, name)
         VALUES ($1, $1, $2, 'Migration Test Hostel')
         ON CONFLICT (id) DO NOTHING`,
        [migHostel, orgId]
      );

      // Insert 3 unmigrated legacy students with staggered created_at
      await query(
        `INSERT INTO students (id, customer_code, organization_id, hostel_id, full_name, email, created_at, custom_id)
         VALUES 
          ($1, $1, $4, $5, 'Legacy Stu 1', 'leg1@test.com', '2026-01-01 10:00:00', NULL),
          ($2, $2, $4, $5, 'Legacy Stu 2', 'leg2@test.com', '2026-01-02 10:00:00', NULL),
          ($3, $3, $4, $5, 'Legacy Stu 3', 'leg3@test.com', '2026-01-03 10:00:00', NULL)`,
        [`leg_s1_${Date.now()}`, `leg_s2_${Date.now()}`, `leg_s3_${Date.now()}`, orgId, migHostel]
      );
    });

    it('should assign sequential custom_ids ordered by created_at per hostel during migration', async () => {
      await migrateStudentCustomIds();

      const students = await query(
        `SELECT full_name, custom_id, created_at
         FROM students
         WHERE hostel_id = $1
         ORDER BY created_at ASC`,
        [migHostel]
      );

      expect(students.rows.length).toBe(3);
      expect(students.rows[0].custom_id).toBe(`${migHostel}-0001`);
      expect(students.rows[1].custom_id).toBe(`${migHostel}-0002`);
      expect(students.rows[2].custom_id).toBe(`${migHostel}-0003`);
    });

    it('should hand off to Redis so future registrations pick up at MAX + 1 without gaps or collisions', async () => {
      // The migration had 3 students (highest: -0003). Next registration must be -0004!
      const nextId = await redisService.generateStudentCustomId(migHostel);
      expect(nextId).toBe(`${migHostel}-0004`);

      const fifthId = await redisService.generateStudentCustomId(migHostel);
      expect(fifthId).toBe(`${migHostel}-0005`);
    });
  });

  // ============================================================================
  // Phase 4: Unified Student Login
  // ============================================================================
  describe('Phase 4: Unified Student Login Authentication', () => {
    const loginCustomId = `H102-7777`;
    const studentDbId = `stu_login_${Date.now()}`;
    const userDbId = `usr_login_${Date.now()}`;
    const studentEmail = `unified_student_${Date.now()}@example.com`;
    const studentPassword = 'SecurePassword@123';

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash(studentPassword, 10);

      await query(
        `INSERT INTO users (
          id, user_id, organization_id, name, email, password_hash, role, status
        ) VALUES ($1, $2, $3, 'Unified Login Student', $4, $5, 'STUDENT', 'ACTIVE')`,
        [userDbId, loginCustomId, orgId, studentEmail, passwordHash]
      );

      await query(
        `INSERT INTO students (
          id, user_id, customer_code, ihms_id, custom_id, organization_id, hostel_id,
          full_name, email, portal_access, portal_access_approved, portal_status,
          activation_status, password_set, status
        ) VALUES ($1, $2, $3, $3, $3, $4, $5, 'Unified Login Student', $6, true, true, 'ACTIVE', 'ACTIVATED', true, 'ACTIVE')`,
        [studentDbId, userDbId, loginCustomId, orgId, hostelB, studentEmail]
      );
    });

    it('should find student profile using custom_id in findStudentForActivation', async () => {
      const foundByCustomId = await authService.findStudentForActivation(loginCustomId);
      expect(foundByCustomId).not.toBeNull();
      expect(foundByCustomId.id).toBe(studentDbId);
      expect(foundByCustomId.email).toBe(studentEmail);

      // Also verify unhyphenated input (e.g. H1027777) matches normalized
      const foundNormalized = await authService.findStudentForActivation('H1027777');
      expect(foundNormalized).not.toBeNull();
      expect(foundNormalized.id).toBe(studentDbId);
    });

    it('should authenticate student login successfully using custom_id and password', async () => {
      const loginResult = await authService.login(loginCustomId, studentPassword, 'STUDENT');

      expect(loginResult).toBeDefined();
      expect(loginResult.accessToken).toBeDefined();
      expect(loginResult.user).toBeDefined();
      expect(loginResult.user.role).toBe('STUDENT');
    });

    it('should authenticate student login successfully using registered email', async () => {
      const loginResult = await authService.login(studentEmail, studentPassword, 'STUDENT');

      expect(loginResult).toBeDefined();
      expect(loginResult.accessToken).toBeDefined();
      expect(loginResult.user).toBeDefined();
      expect(loginResult.user.role).toBe('STUDENT');
    });
  });
});
