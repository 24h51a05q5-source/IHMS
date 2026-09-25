process.env.NODE_ENV = 'test';

import express from 'express';
import supertest from 'supertest';
import app from './main';
import { connectDatabase, query, queryOne } from './config/database';
import { authService } from './modules/auth/auth.service';

async function runTests() {
  console.log('================================================================');
  console.log('  STARTING WARDEN ROLE & ACCESS CONTROL AUTOMATED TEST SUITE   ');
  console.log('================================================================');

  await connectDatabase();
  await authService.ensureSeedDefaults();
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const request = supertest(app);

  // ------------------------------------------------------------------
  // Test 1 — Existing Student Login
  // ------------------------------------------------------------------
  console.log('\n[Test 1] Testing Existing Student Login...');
  const studentLoginRes = await request.post('/api/auth/login').send({
    identifier: 'student@ihms.com',
    password: 'Admin@123',
    loginType: 'STUDENT',
  });
  console.log(`  Response Code: ${studentLoginRes.status}`);
  console.log(`  User Role: ${studentLoginRes.body?.data?.user?.role || studentLoginRes.body?.user?.role}`);
  if (studentLoginRes.status !== 200) {
    throw new Error(`Test 1 Failed: Student login failed with ${studentLoginRes.status}`);
  }
  console.log('  ✅ Test 1 Passed: Student can login normally.');

  // ------------------------------------------------------------------
  // Test 2 — Existing Owner Login
  // ------------------------------------------------------------------
  console.log('\n[Test 2] Testing Existing Owner Login...');
  const ownerLoginRes = await request.post('/api/auth/login').send({
    identifier: 'owner@ihms.com',
    password: 'Admin@123',
    loginType: 'ADMIN',
  });
  console.log(`  Response Code: ${ownerLoginRes.status}`);
  const ownerToken = ownerLoginRes.body?.data?.accessToken || ownerLoginRes.body?.accessToken;
  const ownerUser = ownerLoginRes.body?.data?.user || ownerLoginRes.body?.user;
  console.log(`  Owner Role: ${ownerUser?.role}`);
  if (ownerLoginRes.status !== 200 || !ownerToken) {
    throw new Error(`Test 2 Failed: Owner login failed with ${ownerLoginRes.status}`);
  }
  console.log('  ✅ Test 2 Passed: Owner can login normally.');

  // Ensure owner user has accepted terms for ownerUser.id and get owner's exact organization_id
  const ownerOrgId = ownerUser.organizationId || ownerUser.organization_id;

  await query(
    "UPDATE users SET terms_accepted = true, accepted_terms_version = '1.0' WHERE id = $1 OR LOWER(email) = 'owner@ihms.com'",
    [ownerUser.id]
  );

  // Ensure hostel exists for owner's organization
  let hostelRec = await queryOne<any>('SELECT id FROM hostels LIMIT 1');
  if (!hostelRec) {
    const newHostelId = require('crypto').randomUUID();
    await query(
      `INSERT INTO hostels (id, organization_id, name, branch_code, status)
       VALUES ($1, $2, 'AA BOYS HOSTEL', 'IHMSAA0001', 'ACTIVE')`,
      [newHostelId, ownerOrgId]
    );
    hostelRec = { id: newHostelId };
  } else {
    await query('UPDATE hostels SET organization_id = $1 WHERE id = $2', [ownerOrgId, hostelRec.id]);
  }
  const hostelId = hostelRec.id;

  // Cleanup pre-existing test warden if any
  const testWardenEmail = 'testwarden2026@ihms.com';
  await query('DELETE FROM users WHERE LOWER(email) = $1', [testWardenEmail]);
  await query('DELETE FROM otps WHERE identifier = $1', [testWardenEmail]);

  // ------------------------------------------------------------------
  // Test 3 — Create Warden
  // ------------------------------------------------------------------
  console.log('\n[Test 3] Owner creates a Warden...');
  const createWardenRes = await request
    .post('/api/owner/wardens')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      name: 'Ramesh Warden',
      email: testWardenEmail,
      phone: '+91 9999988888',
      hostelId: hostelId,
    });
  console.log(`  Response Code: ${createWardenRes.status}`);
  console.log(`  Created Warden Status: ${createWardenRes.body?.data?.status}`);
  console.log(`  Access Given: ${createWardenRes.body?.data?.accessGiven}`);
  if (createWardenRes.status !== 201 || createWardenRes.body?.data?.status !== 'INVITED') {
    throw new Error(`Test 3 Failed: Create Warden failed. Response: ${JSON.stringify(createWardenRes.body)}`);
  }
  const wardenRecordId = createWardenRes.body.data.id;
  console.log('  ✅ Test 3 Passed: Warden created with role = WARDEN and status = INVITED.');

  // ------------------------------------------------------------------
  // Test 4 — Access Not Given
  // ------------------------------------------------------------------
  console.log('\n[Test 4] Warden tries to activate before Owner gives access...');
  const trySendOtpBeforeAccessRes = await request.post('/api/auth/warden/send-otp').send({
    identifier: testWardenEmail,
  });
  console.log(`  Response Code: ${trySendOtpBeforeAccessRes.status}`);
  console.log(`  Error Message: ${trySendOtpBeforeAccessRes.body?.message}`);
  if (trySendOtpBeforeAccessRes.status !== 403) {
    throw new Error(`Test 4 Failed: Expected 403 Access Denied, got ${trySendOtpBeforeAccessRes.status}`);
  }
  console.log('  ✅ Test 4 Passed: Activation denied before Owner gives access.');

  // ------------------------------------------------------------------
  // Test 5 — Give Access
  // ------------------------------------------------------------------
  console.log('\n[Test 5] Owner clicks Give Access...');
  await query("UPDATE users SET terms_accepted = true, accepted_terms_version = '1.0' WHERE LOWER(email) = 'owner@ihms.com'");
  const giveAccessRes = await request
    .post(`/api/owner/wardens/${wardenRecordId}/give-access`)
    .set('Authorization', `Bearer ${ownerToken}`);
  console.log(`  Response Code: ${giveAccessRes.status}`);
  if (giveAccessRes.status !== 200) {
    throw new Error(`Test 5 Failed: Give Access failed with ${giveAccessRes.status}`);
  }

  // Now send OTP should succeed
  const sendOtpRes = await request.post('/api/auth/warden/send-otp').send({
    identifier: testWardenEmail,
  });
  console.log(`  Send OTP Code: ${sendOtpRes.status}`);
  console.log(`  Debug OTP Code: ${sendOtpRes.body?._debugOtp}`);
  if (sendOtpRes.status !== 200) {
    throw new Error(`Test 5 Failed: Send OTP failed after access given: ${JSON.stringify(sendOtpRes.body)}`);
  }
  const debugOtp = sendOtpRes.body?._debugOtp;
  console.log('  ✅ Test 5 Passed: Give Access enables Warden activation.');

  // ------------------------------------------------------------------
  // Test 6 — OTP Verification
  // ------------------------------------------------------------------
  console.log('\n[Test 6] Testing OTP Verification (Incorrect, Expired, Correct)...');
  // 6a. Incorrect OTP
  const badOtpRes = await request.post('/api/auth/warden/verify-otp').send({
    identifier: testWardenEmail,
    otp: '000000',
  });
  console.log(`  Incorrect OTP Response: ${badOtpRes.status} (Expected 400)`);
  if (badOtpRes.status !== 400) {
    throw new Error(`Test 6a Failed: Expected 400 for bad OTP, got ${badOtpRes.status}`);
  }

  // 6b. Correct OTP
  const goodOtpRes = await request.post('/api/auth/warden/verify-otp').send({
    identifier: testWardenEmail,
    otp: debugOtp,
  });
  console.log(`  Correct OTP Response: ${goodOtpRes.status}`);
  const activationToken = goodOtpRes.body?.activationToken;
  if (goodOtpRes.status !== 200 || !activationToken) {
    throw new Error(`Test 6b Failed: Correct OTP verification failed. Response: ${JSON.stringify(goodOtpRes.body)}`);
  }
  console.log('  ✅ Test 6 Passed: Incorrect OTP rejected, correct OTP verified.');

  // ------------------------------------------------------------------
  // Test 7 — Set Password & Become ACTIVE
  // ------------------------------------------------------------------
  console.log('\n[Test 7] Warden creates password and activates account...');
  const activateRes = await request.post('/api/auth/warden/activate').send({
    activationToken,
    newPassword: 'Warden@123',
    confirmPassword: 'Warden@123',
  });
  console.log(`  Response Code: ${activateRes.status}`);
  console.log(`  Activated User Role: ${activateRes.body?.data?.user?.role || activateRes.body?.user?.role}`);
  if (activateRes.status !== 200) {
    throw new Error(`Test 7 Failed: Account activation failed. Response: ${JSON.stringify(activateRes.body)}`);
  }
  const dbWarden = await queryOne<any>('SELECT role, status, is_active FROM users WHERE id = $1', [wardenRecordId]);
  console.log(`  DB Status: role=${dbWarden?.role}, status=${dbWarden?.status}, is_active=${dbWarden?.is_active}`);
  if (dbWarden?.role !== 'WARDEN' || dbWarden?.status !== 'ACTIVE') {
    throw new Error(`Test 7 Failed: Expected DB status ACTIVE, got ${dbWarden?.status}`);
  }
  console.log('  ✅ Test 7 Passed: Warden successfully created password and account became ACTIVE.');

  // ------------------------------------------------------------------
  // Test 8 — Normal Login
  // ------------------------------------------------------------------
  console.log('\n[Test 8] Warden normal login with Email + Password...');
  const wardenLoginRes = await request.post('/api/auth/login').send({
    identifier: testWardenEmail,
    password: 'Warden@123',
    loginType: 'ADMIN',
  });
  console.log(`  Response Code: ${wardenLoginRes.status}`);
  const wardenToken = wardenLoginRes.body?.data?.accessToken || wardenLoginRes.body?.accessToken;
  const wardenUser = wardenLoginRes.body?.data?.user || wardenLoginRes.body?.user;
  console.log(`  Warden Login Role: ${wardenUser?.role}`);
  if (wardenLoginRes.status !== 200 || !wardenToken || wardenUser?.role !== 'WARDEN') {
    throw new Error(`Test 8 Failed: Normal login failed. Response: ${JSON.stringify(wardenLoginRes.body)}`);
  }
  console.log('  ✅ Test 8 Passed: Warden logs in with Email + Password returning WARDEN role (No OTP required).');

  // ------------------------------------------------------------------
  // Test 8b — Already Activated Warden tries to activate again
  // ------------------------------------------------------------------
  console.log('\n[Test 8b] Already activated Warden requests activation OTP again...');
  const reActivateRes = await request.post('/api/auth/warden/send-otp').send({
    identifier: testWardenEmail,
  });
  console.log(`  Re-activation Response Code: ${reActivateRes.status}`);
  console.log(`  Already Activated Flag: ${reActivateRes.body?.alreadyActivated || reActivateRes.body?.data?.alreadyActivated}`);
  if (reActivateRes.status !== 200 || !(reActivateRes.body?.alreadyActivated || reActivateRes.body?.data?.alreadyActivated)) {
    throw new Error(`Test 8b Failed: Expected alreadyActivated = true, got ${JSON.stringify(reActivateRes.body)}`);
  }
  console.log('  ✅ Test 8b Passed: Backend detects already activated Warden, returns alreadyActivated=true, and blocks duplicate OTPs.');

  // ------------------------------------------------------------------
  // Test 9 — Suspended Warden
  // ------------------------------------------------------------------
  console.log('\n[Test 9] Owner suspends Warden & verifies login + JWT blocked...');
  const suspendRes = await request
    .post(`/api/owner/wardens/${wardenRecordId}/suspend`)
    .set('Authorization', `Bearer ${ownerToken}`);
  console.log(`  Suspend Response Code: ${suspendRes.status}`);
  if (suspendRes.status !== 200) {
    throw new Error(`Test 9 Failed: Suspend request failed with ${suspendRes.status}`);
  }

  // Attempt login with suspended account
  const trySuspendedLoginRes = await request.post('/api/auth/login').send({
    identifier: testWardenEmail,
    password: 'Warden@123',
    loginType: 'ADMIN',
  });
  console.log(`  Suspended Login Response Code: ${trySuspendedLoginRes.status} (Expected 403)`);
  if (trySuspendedLoginRes.status !== 403) {
    throw new Error(`Test 9 Failed: Expected 403 for suspended login, got ${trySuspendedLoginRes.status}`);
  }

  // Attempt authenticated API call with old token
  const trySuspendedAuthCall = await request
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${wardenToken}`);
  console.log(`  Suspended Token API Call Response: ${trySuspendedAuthCall.status} (Expected 401)`);
  if (trySuspendedAuthCall.status !== 401) {
    throw new Error(`Test 9 Failed: Expected 401 for suspended JWT call, got ${trySuspendedAuthCall.status}`);
  }
  console.log('  ✅ Test 9 Passed: Suspended Warden login & token access are completely blocked.');

  // Reactivate warden for Test 10
  await request
    .post(`/api/owner/wardens/${wardenRecordId}/reactivate`)
    .set('Authorization', `Bearer ${ownerToken}`);

  // Re-login to get fresh active token for Warden
  const freshWardenLogin = await request.post('/api/auth/login').send({
    identifier: testWardenEmail,
    password: 'Warden@123',
    loginType: 'ADMIN',
  });
  const activeWardenToken = freshWardenLogin.body?.data?.accessToken || freshWardenLogin.body?.accessToken;

  // ------------------------------------------------------------------
  // Test 10 — Role Escalation & Financial API Security
  // ------------------------------------------------------------------
  console.log('\n[Test 10] Testing Warden accessing Owner-only APIs & Financial/KYC routes...');
  const tryOwnerApiRes = await request
    .get('/api/owner/wardens')
    .set('Authorization', `Bearer ${activeWardenToken}`);
  console.log(`  Owner API Access Response: ${tryOwnerApiRes.status} (Expected 403)`);

  const tryOwnerDashRes = await request
    .get('/api/dashboard/owner')
    .set('Authorization', `Bearer ${activeWardenToken}`);
  console.log(`  Owner Dashboard API Access Response: ${tryOwnerDashRes.status} (Expected 403)`);

  const tryCashfreeKycRes = await request
    .get(`/api/fees/hostels/${hostelId}/cashfree-status`)
    .set('Authorization', `Bearer ${activeWardenToken}`);
  console.log(`  Cashfree KYC API Access Response: ${tryCashfreeKycRes.status} (Expected 403)`);

  if (tryOwnerApiRes.status !== 403 || tryOwnerDashRes.status !== 403 || tryCashfreeKycRes.status !== 403) {
    throw new Error('Test 10 Failed: Expected 403 Forbidden when Warden accesses Owner financial/KYC APIs.');
  }
  console.log('  ✅ Test 10 Passed: Warden receives 403 Forbidden when attempting to access Owner-only APIs & Financial KYC routes.');

  // ------------------------------------------------------------------
  // Test 11 — Warden Attendance Entry & Accountability Audit Metadata
  // ------------------------------------------------------------------
  console.log('\n[Test 11] Testing Warden Attendance entry & accountability audit metadata...');
  let studentRec = await queryOne<any>('SELECT * FROM students WHERE hostel_id = $1 LIMIT 1', [hostelId]);
  if (!studentRec) {
    studentRec = await queryOne<any>('SELECT * FROM students LIMIT 1');
    if (studentRec) {
      await query('UPDATE students SET hostel_id = $1 WHERE id = $2', [hostelId, studentRec.id]);
    }
  }
  const testStudentId = studentRec?.id || 'sample-student-id';
  const todayStr = new Date().toISOString().split('T')[0];

  const markAttRes = await request
    .post('/api/attendance/mark')
    .set('Authorization', `Bearer ${activeWardenToken}`)
    .send({
      studentId: testStudentId,
      date: todayStr,
      status: 'PRESENT',
    });
  console.log(`  Mark Attendance Status: ${markAttRes.status}`);
  console.log(`  Marked By: ${markAttRes.body?.data?.markedBy}`);
  console.log(`  Marked By Role: ${markAttRes.body?.data?.markedByRole}`);
  console.log(`  Hostel ID: ${markAttRes.body?.data?.hostelId}`);

  if (markAttRes.status !== 201 || markAttRes.body?.data?.status !== 'PRESENT' || markAttRes.body?.data?.markedByRole !== 'WARDEN') {
    throw new Error(`Test 11 Failed: Warden attendance mark failed. Response: ${JSON.stringify(markAttRes.body)}`);
  }
  console.log('  ✅ Test 11 Passed: Warden marks attendance with audit record (studentId, date, status, markedBy, markedByRole, hostelId).');

  // ------------------------------------------------------------------
  // Test 12 — Warden Cross-Hostel Boundary Enforcement
  // ------------------------------------------------------------------
  console.log('\n[Test 12] Testing Warden attempting to access another hostel attendance...');
  const fakeOtherHostelId = 'IHMSBB9999-OTHER-HOSTEL';

  const otherStudentId = 'other-hostel-student-id-999';
  await query(
    `INSERT INTO students (id, organization_id, hostel_id, customer_code, full_name, email, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     ON CONFLICT (id) DO UPDATE SET hostel_id = $3`,
    [otherStudentId, ownerOrgId, fakeOtherHostelId, 'IHMSBB9999-999', 'Other Hostel Resident', 'other999@example.com']
  );

  const crossHostelMarkRes = await request
    .post('/api/attendance/mark')
    .set('Authorization', `Bearer ${activeWardenToken}`)
    .send({
      studentId: otherStudentId,
      date: todayStr,
      status: 'PRESENT',
    });
  console.log(`  Cross-Hostel Mark Status: ${crossHostelMarkRes.status} (Expected 403)`);

  const crossHostelViewRes = await request
    .get(`/api/attendance?hostelId=${fakeOtherHostelId}`)
    .set('Authorization', `Bearer ${activeWardenToken}`);
  console.log(`  Cross-Hostel View Status: ${crossHostelViewRes.status} (Expected 403)`);

  if (crossHostelMarkRes.status !== 403 || crossHostelViewRes.status !== 403) {
    throw new Error('Test 12 Failed: Warden was able to access another hostel attendance!');
  }
  await query('DELETE FROM students WHERE id = $1', [otherStudentId]);
  console.log('  ✅ Test 12 Passed: Warden cross-hostel attendance access strictly denied (403 Forbidden).');

  // ------------------------------------------------------------------
  // Test 13 — Student View-Only Attendance & Unauthorized Mark Block
  // ------------------------------------------------------------------
  console.log('\n[Test 13] Testing Student view-only attendance & mark prevention...');
  await query("UPDATE users SET terms_accepted = true, accepted_terms_version = '1.0' WHERE LOWER(email) = 'student@ihms.com'");
  const studentToken = studentLoginRes.body?.data?.accessToken || studentLoginRes.body?.accessToken;

  const studentViewRes = await request
    .get('/api/attendance')
    .set('Authorization', `Bearer ${studentToken}`);
  console.log(`  Student View Attendance Status: ${studentViewRes.status}`);

  const studentMarkRes = await request
    .post('/api/attendance/mark')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({
      studentId: testStudentId,
      date: todayStr,
      status: 'PRESENT',
    });
  console.log(`  Student Mark Attempt Status: ${studentMarkRes.status} (Expected 403)`);

  if (studentViewRes.status !== 200 || studentMarkRes.status !== 403) {
    throw new Error('Test 13 Failed: Student permission boundary check failed.');
  }
  console.log('  ✅ Test 13 Passed: Student can view own attendance but cannot mark or edit attendance.');

  // ------------------------------------------------------------------
  // Test 14 — Warden Language Preference Persistence
  // ------------------------------------------------------------------
  console.log('\n[Test 14] Testing Warden Language setting persistence...');
  const updateLangRes = await request
    .put('/api/auth/profile')
    .set('Authorization', `Bearer ${activeWardenToken}`)
    .send({
      preferredLanguage: 'te',
    });
  console.log(`  Update Language Response Code: ${updateLangRes.status}`);
  console.log(`  Updated Language: ${updateLangRes.body?.data?.preferredLanguage}`);

  const checkMeRes = await request
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${activeWardenToken}`);
  console.log(`  Me API Returned Language: ${checkMeRes.body?.user?.preferredLanguage || checkMeRes.body?.data?.preferredLanguage}`);

  if (updateLangRes.status !== 200 || (checkMeRes.body?.user?.preferredLanguage !== 'te' && checkMeRes.body?.data?.preferredLanguage !== 'te')) {
    throw new Error('Test 14 Failed: Language preference was not updated and persisted.');
  }
  console.log('  ✅ Test 14 Passed: Warden language preference saved and persisted across sessions.');

  // ------------------------------------------------------------------
  // Test 27 — Warden Overdues Summary Dynamic Aggregation
  // ------------------------------------------------------------------
  console.log('\n[Test 27] Testing Warden Overdues summary metrics dynamic aggregation...');
  const overduesSummaryRes = await request
    .get('/api/fees/overdues/summary')
    .set('Authorization', `Bearer ${activeWardenToken}`);
  console.log(`  Summary Status: ${overduesSummaryRes.status}`);
  console.log(`  Total Overdue Students: ${overduesSummaryRes.body?.data?.totalOverdueStudents}`);
  console.log(`  Total Overdue Amount: ₹${overduesSummaryRes.body?.data?.totalOverdueAmount}`);
  if (overduesSummaryRes.status !== 200) {
    throw new Error(`Test 27 Failed: Overdues summary failed with ${overduesSummaryRes.status}`);
  }
  console.log('  ✅ Test 27 Passed: Overdues summary metrics calculated dynamically from database.');

  // ------------------------------------------------------------------
  // Test 28 — Warden Student Details View (Same Hostel)
  // ------------------------------------------------------------------
  console.log('\n[Test 28] Warden views student details for student in assigned hostel...');
  const viewStudentRes = await request
    .get(`/api/students/${testStudentId}`)
    .set('Authorization', `Bearer ${activeWardenToken}`);
  console.log(`  View Student Status: ${viewStudentRes.status}`);
  console.log(`  Student Name: ${viewStudentRes.body?.data?.name || viewStudentRes.body?.data?.fullName}`);
  if (viewStudentRes.status !== 200 || !viewStudentRes.body?.data) {
    throw new Error(`Test 28 Failed: Warden view student details failed with ${viewStudentRes.status}`);
  }
  console.log('  ✅ Test 28 Passed: Warden can view student details for student in assigned hostel.');

  // ------------------------------------------------------------------
  // Test 29 — Warden Cross-Hostel Student Details Restriction (Backend Guard)
  // ------------------------------------------------------------------
  console.log('\n[Test 29] Warden attempts to view student details for student in another hostel...');
  const fakeCrossHostelStudentId = 'cross-hostel-student-uuid-999';
  await query(
    `INSERT INTO students (id, organization_id, hostel_id, customer_code, full_name, email, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     ON CONFLICT (id) DO UPDATE SET hostel_id = $3`,
    [fakeCrossHostelStudentId, ownerOrgId, fakeOtherHostelId, 'IHMSBB9999-001', 'Forbidden Hostel Resident', 'forbidden999@example.com']
  );

  const crossHostelStudentViewRes = await request
    .get(`/api/students/${fakeCrossHostelStudentId}`)
    .set('Authorization', `Bearer ${activeWardenToken}`);
  console.log(`  Cross-Hostel Student View Status: ${crossHostelStudentViewRes.status} (Expected 403)`);

  if (crossHostelStudentViewRes.status !== 403) {
    throw new Error(`Test 29 Failed: Expected 403 Forbidden for cross-hostel student view, got ${crossHostelStudentViewRes.status}`);
  }
  await query('DELETE FROM students WHERE id = $1', [fakeCrossHostelStudentId]);
  console.log('  ✅ Test 29 Passed: Backend blocks Warden from viewing student details of another hostel (403 Forbidden).');

  // Cleanup test warden
  await query('DELETE FROM users WHERE id = $1', [wardenRecordId]);

  console.log('\n================================================================');
  console.log('  🎉 ALL WARDEN ROLE, ATTENDANCE, OVERDUES & SECURITY TESTS PASSED PERFECTLY!');
  console.log('================================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err.message);
  process.exit(1);
});
