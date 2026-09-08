import request from 'supertest';
import express, { Application } from 'express';
import { connectDatabase, disconnectDatabase, query, queryOne } from '../src/config/database';
import { runMigrations } from '../src/config/migrations';
import { runSeed } from '../src/seed';
import { authRouter } from '../src/modules/auth/auth.controller';
import { studentPortalRouter } from '../src/modules/students/student-portal.controller';
import { dashboardRouter } from '../src/modules/dashboard/dashboard.controller';
import { termsRouter } from '../src/modules/terms/terms.controller';
import { CURRENT_TERMS_VERSION } from '../src/modules/terms/terms.constants';
import { errorHandler } from '../src/common/filters/http-exception.filter';

let app: Application;

beforeAll(async () => {
  await connectDatabase();
  await runMigrations();
  await runSeed();

  app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use('/api/auth', authRouter);
  app.use('/student', studentPortalRouter);
  app.use('/api/student', studentPortalRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/terms', termsRouter);
  app.use('/api/terms', termsRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await disconnectDatabase();
});

describe('Terms & Conditions System — Strict Mandatory Enforcement & Audit Trail', () => {
  let studentToken: string;
  let unacceptedStudentUserId: string;
  let unacceptedStudentToken: string;

  let ownerToken: string;
  let unacceptedOwnerUserId: string;
  let unacceptedOwnerToken: string;

  it('1. GET /api/terms should return complete legal agreement with active version and sections', async () => {
    const res = await request(app).get('/api/terms');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.version).toBe(CURRENT_TERMS_VERSION);
    expect(res.body.effectiveDate).toBeDefined();
    expect(Array.isArray(res.body.sections)).toBe(true);
    expect(res.body.sections.length).toBeGreaterThanOrEqual(10);

    // Verify key legal sections exist
    const titles = res.body.sections.map((s: any) => s.title);
    expect(titles.some((t: string) => t.includes('Platform & Service Description'))).toBe(true);
    expect(titles.some((t: string) => t.includes('Student Residency Terms'))).toBe(true);
    expect(titles.some((t: string) => t.includes('Hostel Owner & Management'))).toBe(true);
    expect(titles.some((t: string) => t.includes('Fees, Billing, Payments'))).toBe(true);
    expect(titles.some((t: string) => t.includes('Account Credentials & Security'))).toBe(true);
    expect(titles.some((t: string) => t.includes('Prohibited Activities'))).toBe(true);
    expect(titles.some((t: string) => t.includes('Limitation of Liability'))).toBe(true);
    expect(titles.some((t: string) => t.includes('Suspension, Termination'))).toBe(true);
    expect(titles.some((t: string) => t.includes('Governing Law'))).toBe(true);
    expect(titles.some((t: string) => t.includes('Legal Contact & Grievance'))).toBe(true);
  });

  it('2. GET /api/terms?role=STUDENT should return student-applicable terms', async () => {
    const res = await request(app).get('/api/terms?role=STUDENT');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Student should not receive OWNER-only sections
    const hasOwnerSpecific = res.body.sections.some((s: any) => s.applicableTo === 'OWNER');
    expect(hasOwnerSpecific).toBe(false);
  });

  it('3. GET /api/terms?role=OWNER should return owner-applicable terms', async () => {
    const res = await request(app).get('/api/terms?role=OWNER');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Owner should not receive STUDENT-only sections
    const hasStudentSpecific = res.body.sections.some((s: any) => s.applicableTo === 'STUDENT');
    expect(hasStudentSpecific).toBe(false);
  });

  it('4. Seeded active users (student & owner) should already have terms_accepted = true and can access APIs', async () => {
    // Login as seeded student
    const studentLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'student@ihms.com', password: 'Admin@123', loginType: 'STUDENT' });
    expect(studentLogin.status).toBe(200);
    expect(studentLogin.body.user.termsAccepted).toBe(true);
    expect(studentLogin.body.user.acceptedTermsVersion).toBe(CURRENT_TERMS_VERSION);
    studentToken = studentLogin.body.accessToken;

    // Seeded student can access protected APIs
    const dashRes = await request(app)
      .get('/api/student/profile')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(dashRes.status).toBe(200);

    // Login as seeded owner
    const ownerLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'owner@ihms.com', password: 'Admin@123', loginType: 'ADMIN' });
    expect(ownerLogin.status).toBe(200);
    expect(ownerLogin.body.user.termsAccepted).toBe(true);
    ownerToken = ownerLogin.body.accessToken;

    const statsRes = await request(app)
      .get('/api/dashboard/owner')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(statsRes.status).toBe(200);
  });

  it('5. Unaccepted Student: MUST be blocked from all protected student APIs with 403 TERMS_ACCEPTANCE_REQUIRED', async () => {
    // Create an unaccepted student user in database
    const org = await queryOne<any>('SELECT id FROM organizations LIMIT 1');
    const hostel = await queryOne<any>('SELECT id FROM hostels LIMIT 1');
    const studentRecord = await queryOne<any>('SELECT id, customer_code FROM students LIMIT 1');

    unacceptedStudentUserId = require('crypto').randomUUID();
    const studentDbId = require('crypto').randomUUID();
    const studentIhmsId = 'IHM-GV-MN-S-0099';
    const bcrypt = require('bcryptjs');
    const pwHash = await bcrypt.hash('Student@123', 10);

    await query(
      `INSERT INTO users (
        id, user_id, ihms_id, organization_id, branch_id, student_id, name,
        email, password_hash, role, customer_code, terms_accepted, accepted_terms_version, status
      ) VALUES ($1, $2, $2, $3, $4, $5, 'Unaccepted Student',
        'unaccepted.student@ihms.com', $6, 'STUDENT', $2, FALSE, NULL, 'ACTIVE')`,
      [unacceptedStudentUserId, studentIhmsId, org.id, hostel.id, studentDbId, pwHash]
    );

    await query(
      `INSERT INTO students (
        id, student_id, customer_code, ihms_id, organization_id, hostel_id, user_id, full_name, email,
        admission_date, portal_access, portal_access_approved, portal_status, activation_status, password_set, status
      ) VALUES ($1, $2, $2, $2, $3, $4, $5, 'Unaccepted Student', 'unaccepted.student@ihms.com',
        CURRENT_TIMESTAMP, true, true, 'ACTIVE', 'ACTIVATED', true, 'ACTIVE')`,
      [studentDbId, studentIhmsId, org.id, hostel.id, unacceptedStudentUserId]
    );

    // Login as unaccepted student
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'unaccepted.student@ihms.com', password: 'Student@123', loginType: 'STUDENT' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.termsAccepted).toBe(false);
    expect(loginRes.body.user.acceptedTermsVersion).toBeNull();
    unacceptedStudentToken = loginRes.body.accessToken;

    // Calling /api/auth/me is EXEMPT so student can read their profile
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${unacceptedStudentToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.termsAccepted).toBe(false);

    // Calling /api/student/dashboard MUST be blocked
    const dashRes = await request(app)
      .get('/api/student/profile')
      .set('Authorization', `Bearer ${unacceptedStudentToken}`);

    expect(dashRes.status).toBe(403);
    expect(dashRes.body.success).toBe(false);
    expect(dashRes.body.code).toBe('TERMS_ACCEPTANCE_REQUIRED');
    expect(dashRes.body.message).toContain('Terms & Conditions');
  });

  it('6. Accepting terms with invalid or outdated version must be REJECTED', async () => {
    const badAccept = await request(app)
      .post('/api/auth/terms/accept')
      .set('Authorization', `Bearer ${unacceptedStudentToken}`)
      .send({ version: '0.5' });

    expect(badAccept.status).toBe(400);
    expect(badAccept.body.success).toBe(false);
    expect(badAccept.body.message).toContain('Invalid Terms & Conditions version');
  });

  it('7. Unaccepted Student accepts terms version 1.0: should record immutable audit log and unlock portal', async () => {
    const acceptRes = await request(app)
      .post('/api/auth/terms/accept')
      .set('Authorization', `Bearer ${unacceptedStudentToken}`)
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestBrowser')
      .send({ version: CURRENT_TERMS_VERSION });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.success).toBe(true);
    expect(acceptRes.body.acceptedVersion).toBe(CURRENT_TERMS_VERSION);
    expect(acceptRes.body.user.termsAccepted).toBe(true);

    // Verify database record in terms_acceptances
    const auditRow = await queryOne<any>(
      'SELECT * FROM terms_acceptances WHERE user_id = $1 ORDER BY accepted_at DESC LIMIT 1',
      [unacceptedStudentUserId]
    );
    expect(auditRow).toBeDefined();
    expect(auditRow.terms_version).toBe(CURRENT_TERMS_VERSION);
    expect(auditRow.status).toBe('ACCEPTED');
    expect(auditRow.user_agent).toContain('TestBrowser');

    // Verify users table updated
    const userInDb = await queryOne<any>('SELECT terms_accepted, accepted_terms_version, terms_accepted_at FROM users WHERE id = $1', [unacceptedStudentUserId]);
    expect(userInDb.terms_accepted).toBe(true);
    expect(userInDb.accepted_terms_version).toBe(CURRENT_TERMS_VERSION);
    expect(userInDb.terms_accepted_at).toBeDefined();

    // Student can now access protected APIs
    const unlockedDashRes = await request(app)
      .get('/api/student/profile')
      .set('Authorization', `Bearer ${unacceptedStudentToken}`);
    expect(unlockedDashRes.status).toBe(200);
  });

  it('8. Unaccepted Owner: registering a new owner requires terms acceptance before accessing dashboard', async () => {
    const newOwnerEmail = `owner_terms_test_${Date.now()}@example.com`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        ownerName: 'Prakash Rao',
        ownerEmail: newOwnerEmail,
        ownerPhone: '+91 9900011222',
        ownerPassword: 'Password@123',
        hostelName: 'Royal Comfort Residency',
        city: 'Hyderabad',
        hostelType: 'BOYS',
      });

    expect(regRes.status).toBe(201);
    unacceptedOwnerUserId = regRes.body.user.id;

    // Login as newly registered owner
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: newOwnerEmail, password: 'Password@123', loginType: 'ADMIN' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.termsAccepted).toBe(false);
    unacceptedOwnerToken = loginRes.body.accessToken;

    // Accessing dashboard MUST return 403 TERMS_ACCEPTANCE_REQUIRED
    const blockedDash = await request(app)
      .get('/api/dashboard/owner')
      .set('Authorization', `Bearer ${unacceptedOwnerToken}`);

    expect(blockedDash.status).toBe(403);
    expect(blockedDash.body.code).toBe('TERMS_ACCEPTANCE_REQUIRED');

    // Accept terms via /terms/accept endpoint
    const acceptRes = await request(app)
      .post('/api/terms/accept')
      .set('Authorization', `Bearer ${unacceptedOwnerToken}`)
      .send({ version: CURRENT_TERMS_VERSION });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.success).toBe(true);

    // Now owner dashboard access MUST succeed
    const unlockedDash = await request(app)
      .get('/api/dashboard/owner')
      .set('Authorization', `Bearer ${unacceptedOwnerToken}`);
    expect(unlockedDash.status).toBe(200);
  });

  it('9. Version Invalidation: if user has accepted an older terms version, access MUST be revoked until re-accepted', async () => {
    // Simulate user with outdated accepted version '0.9'
    await query(
      "UPDATE users SET terms_accepted = true, accepted_terms_version = '0.9' WHERE id = $1",
      [unacceptedOwnerUserId]
    );

    // Request protected API -> MUST return 403 TERMS_ACCEPTANCE_REQUIRED
    const outDatedRes = await request(app)
      .get('/api/dashboard/owner')
      .set('Authorization', `Bearer ${unacceptedOwnerToken}`);

    expect(outDatedRes.status).toBe(403);
    expect(outDatedRes.body.code).toBe('TERMS_ACCEPTANCE_REQUIRED');

    // Re-accept active version 1.0
    const reAcceptRes = await request(app)
      .post('/api/terms/accept')
      .set('Authorization', `Bearer ${unacceptedOwnerToken}`)
      .send({ version: CURRENT_TERMS_VERSION });

    expect(reAcceptRes.status).toBe(200);

    // Access restored
    const restoredRes = await request(app)
      .get('/api/dashboard/owner')
      .set('Authorization', `Bearer ${unacceptedOwnerToken}`);
    expect(restoredRes.status).toBe(200);
  });

  it('10. Decline / Exit: user can call /auth/logout and session is terminated', async () => {
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${unacceptedStudentToken}`);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);
    expect(logoutRes.body.message).toContain('Logged out');
  });
});
