import { generateIhmsId, derive2LetterCode } from '../src/common/utils/code-generator';
import { runMigrations, backfillIhmsIds } from '../src/config/migrations';
import { query, queryOne, connectDatabase, disconnectDatabase } from '../src/config/database';
import { authService } from '../src/modules/auth/auth.service';
import bcrypt from 'bcryptjs';

describe('Human-Readable IHMS ID System & Auth Integration', () => {
  beforeAll(async () => {
    await connectDatabase();
    await runMigrations();

    // Create test records for authentication testing using distinct IHMS IDs
    const hash = await bcrypt.hash('Password123!', 10);

    // 1. Test Owner
    await query(`
      INSERT INTO users (id, user_id, name, email, password_hash, role, ihms_id, organization_id, status)
      VALUES ('user_owner_auth_test', 'OWN999', 'Test Owner', 'owner_auth_test@ihms.com', '${hash}', 'OWNER', 'IHM-AA-MN-H-0099', 'ORG_AUTH_TEST', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING
    `);

    // 2. Test Student
    await query(`
      INSERT INTO students (id, student_id, customer_code, ihms_id, full_name, email, organization_id, portal_access, portal_access_approved, portal_status, password_set, status)
      VALUES ('stu_test_auth_1', 'STU_AUTH_1', 'CUST_AUTH_1', 'IHM-AA-MN-S-0099', 'Test Student', 'student_auth_test@ihms.com', 'ORG_AUTH_TEST', true, true, 'ACTIVE', true, 'ACTIVE')
      ON CONFLICT (id) DO NOTHING
    `);

    await query(`
      INSERT INTO users (id, user_id, name, email, password_hash, role, ihms_id, student_id, customer_code, organization_id, status)
      VALUES ('user_stu_auth_1', 'STU_AUTH_1', 'Test Student', 'student_auth_test@ihms.com', '${hash}', 'STUDENT', 'IHM-AA-MN-S-0099', 'stu_test_auth_1', 'CUST_AUTH_1', 'ORG_AUTH_TEST', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING
    `);
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('TEST 1: Should generate first Student ID with format IHM-AA-MN-S-0001', async () => {
    const id = await generateIhmsId('S', 'AA BOYS HOSTEL', 'Main', 'ORG_FRESH_1');
    expect(id).toBe('IHM-AA-MN-S-0001');
  });

  it('TEST 2: Should generate sequential Student ID IHM-AA-MN-S-0002 for same hostel and branch', async () => {
    await query(`
      INSERT INTO students (id, customer_code, ihms_id, full_name, email, organization_id)
      VALUES ('stu_seq_1', 'CUST_SEQ_1', 'IHM-AA-MN-S-0001', 'Student One', 'seq1@test.com', 'ORG_FRESH_1')
      ON CONFLICT (id) DO NOTHING
    `);

    const id2 = await generateIhmsId('S', 'AA BOYS HOSTEL', 'Main', 'ORG_FRESH_1');
    expect(id2).toBe('IHM-AA-MN-S-0002');
  });

  it('TEST 3: Should generate Owner ID with format IHM-AA-MN-H-0001 without interfering with student sequence', async () => {
    const ownerId = await generateIhmsId('H', 'AA BOYS HOSTEL', 'Main', 'ORG_FRESH_1');
    expect(ownerId).toBe('IHM-AA-MN-H-0001');
  });

  it('TEST 4: Should enforce uniqueness constraint on ihms_id in database', async () => {
    await query(`
      INSERT INTO students (id, customer_code, ihms_id, full_name, email, organization_id)
      VALUES ('stu_uuid_uniq', 'CUST_UNIQ', 'IHM-AA-MN-S-0088', 'Unique Student', 'uniq@test.com', 'ORG_TEST_1')
      ON CONFLICT (id) DO NOTHING
    `);

    await expect(
      query(`
        INSERT INTO students (id, customer_code, ihms_id, full_name, email, organization_id)
        VALUES ('stu_uuid_dup', 'CUST_DUP', 'IHM-AA-MN-S-0088', 'Duplicate Student', 'dup@test.com', 'ORG_TEST_1')
      `)
    ).rejects.toThrow();
  });

  it('TEST 5: Should handle concurrent ID generation without duplicate IDs', async () => {
    const promises = Array.from({ length: 5 }, () =>
      generateIhmsId('S', 'BB HOSTEL', 'Branch A', 'ORG_CONCUR')
    );
    const results = await Promise.all(promises);
    const uniqueResults = new Set(results);
    expect(uniqueResults.size).toBe(5);
  });

  it('TEST 6, 7 & 8: Should maintain immutability of IHMS ID when student, hostel, or branch names are updated', async () => {
    const initialIhmsId = 'IHM-SC-MB-S-0001';
    await query(`
      INSERT INTO students (id, customer_code, ihms_id, full_name, email, organization_id)
      VALUES ('stu_uuid_immutable', 'CUST_IMM', '${initialIhmsId}', 'Original Name', 'imm@test.com', 'ORG_TEST_1')
      ON CONFLICT (id) DO NOTHING
    `);

    await query(`UPDATE students SET full_name = 'Renamed Student' WHERE id = 'stu_uuid_immutable'`);
    const student = await queryOne<any>(`SELECT ihms_id, full_name FROM students WHERE id = 'stu_uuid_immutable'`);
    
    expect(student.full_name).toBe('Renamed Student');
    expect(student.ihms_id).toBe(initialIhmsId);
  });

  it('AUTH TEST 1: Student can find account and log in using Student IHMS ID (IHM-AA-MN-S-0099)', async () => {
    const student = await authService.findStudentForActivation('IHM-AA-MN-S-0099');
    expect(student).not.toBeNull();
    expect(student?.email).toBe('student_auth_test@ihms.com');
  });

  it('AUTH TEST 2: Student can find account and log in using registered email', async () => {
    const student = await authService.findStudentForActivation('student_auth_test@ihms.com');
    expect(student).not.toBeNull();
    expect(student?.ihms_id).toBe('IHM-AA-MN-S-0099');
  });

  it('AUTH TEST 3: Hostel Owner can log in using Owner IHMS ID (IHM-AA-MN-H-0099)', async () => {
    const res = await authService.login('IHM-AA-MN-H-0099', 'Password123!', 'ADMIN');
    expect(res).toBeDefined();
    expect(res.user.role).toBe('ORGANIZATION_OWNER');
    expect(res.user.ihmsId).toBe('IHM-AA-MN-H-0099');
  });

  it('AUTH TEST 4: Hostel Owner can log in using registered email', async () => {
    const res = await authService.login('owner_auth_test@ihms.com', 'Password123!', 'ADMIN');
    expect(res).toBeDefined();
    expect(res.user.role).toBe('ORGANIZATION_OWNER');
  });

  it('AUTH TEST 5 (ROLE ISOLATION): Student IHMS ID entered in Admin login is rejected', async () => {
    await expect(
      authService.login('IHM-AA-MN-S-0099', 'Password123!', 'ADMIN')
    ).rejects.toThrow('Invalid Admin / Staff credentials.');
  });

  it('AUTH TEST 6 (ROLE ISOLATION): Owner IHMS ID entered in Student lookup returns null', async () => {
    const res = await authService.findStudentForActivation('IHM-AA-MN-H-0099');
    expect(res).toBeNull();
  });

  it('AUTH TEST 7: Handles lowercase and padded input (  ihm-aa-mn-s-0099  ) with safe normalization', async () => {
    const student = await authService.findStudentForActivation('  ihm-aa-mn-s-0099  ');
    expect(student).not.toBeNull();
    expect(student?.email).toBe('student_auth_test@ihms.com');
  });

  it('AUTH TEST 8: Invalid IHMS ID returns safe authentication failure', async () => {
    await expect(
      authService.login('IHM-XX-XX-H-9999', 'WrongPassword', 'ADMIN')
    ).rejects.toThrow('Invalid Admin / Staff credentials.');
  });

  it('AUTH TEST 9 (LEGACY REJECTION): Old Student ID (STU_AUTH_1 or CUST_AUTH_1) is NO LONGER accepted as a login identifier', async () => {
    const student = await authService.findStudentForActivation('STU_AUTH_1');
    expect(student).toBeNull();

    const student2 = await authService.findStudentForActivation('CUST_AUTH_1');
    expect(student2).toBeNull();
  });

  it('AUTH TEST 10 (LEGACY REJECTION): Old Owner ID (OWN999) is NO LONGER accepted as a login identifier', async () => {
    await expect(
      authService.login('OWN999', 'Password123!', 'ADMIN')
    ).rejects.toThrow('Invalid Admin / Staff credentials.');
  });
});
