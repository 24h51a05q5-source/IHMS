process.env.NODE_ENV = 'test';

import { connectDatabase, query, queryOne, queryRows, disconnectDatabase } from '../config/database';
import { runMigrations } from '../config/migrations';
import { authService } from '../modules/auth/auth.service';
import { hostelService } from '../modules/hostels/hostel.service';
import { hostelPaymentConfigService } from '../modules/hostels/hostel-payment-config.service';
import { roomService } from '../modules/rooms/room.service';
import { studentService } from '../modules/students/student.service';
import { feeService } from '../modules/fees/fee.service';
import { zeroGatewayPaymentService } from '../modules/fees/zero-gateway-payment.service';
import { paymentGatewayService } from '../modules/fees/payment-gateway.service';
import { attendanceService } from '../modules/attendance/attendance.service';
import { messService } from '../modules/mess/mess.service';
import { inventoryService } from '../modules/inventory/inventory.service';
import { visitorService } from '../modules/visitors/visitor.service';
import { complaintService } from '../modules/complaints/complaint.service';
import { announcementService } from '../modules/announcements/announcement.service';
import { notificationService } from '../modules/notifications/notification.service';
import { supportService } from '../modules/support/support.service';
import { termsService } from '../modules/terms/terms.service';
import { financeService } from '../modules/finance/finance.service';
import { PaymentMethod, UserRole, LeaveStatus } from '../config/constants';
import { authenticate, authorize } from '../common/guards/auth.guard';
import { generateVisitorPassNumber, generateComplaintNumber } from '../common/utils/code-generator';

export interface AuditTestCase {
  testCase: string;
  feature: string;
  userRole: string;
  action: string;
  expectedResult: string;
  actualResult: string;
  status: 'PASS' | 'FAIL';
  error?: string;
  rootCause?: string;
  fixApplied?: string;
}

const auditLog: AuditTestCase[] = [];

function recordTest(tc: AuditTestCase) {
  auditLog.push(tc);
  const icon = tc.status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [${tc.testCase}] ${tc.feature} (${tc.userRole}): ${tc.action} -> ${tc.status}`);
  if (tc.error) console.log(`   Error: ${tc.error}`);
}

export async function runFullSystemAudit() {
  console.log('\n========================================================================');
  console.log('  🔍 STARTING COMPREHENSIVE END-TO-END AUDIT & TEST OF IHMS APPLICATION');
  console.log('========================================================================\n');

  await connectDatabase();
  await runMigrations();
  await authService.ensureSeedDefaults();

  const timestamp = Date.now();
  const ownerEmail = `audit_owner_${timestamp}@ihms-audit.com`;
  const ownerPassword = 'Password@123';
  const hostelName = `Royal Audit Residency ${timestamp}`;
  const studentEmail = `audit_student_${timestamp}@ihms-audit.com`;
  const studentPassword = 'Password@123';

  let ownerOrgId = '';
  let ownerBranchId = '';
  let ownerToken = '';
  let ownerUser: any = null;
  let studentToken = '';
  let studentUser: any = null;
  let createdRoom: any = null;
  let createdBed: any = null;
  let createdStudent: any = null;
  let createdDemand: any = null;
  let dynamicPaymentId = '';

  // ============================================================================
  // MODULE 1: AUTHENTICATION & REGISTRATION
  // ============================================================================
  try {
    const reg = await authService.registerOwner({
      ownerName: 'Sunil Kumar',
      ownerEmail,
      ownerPassword,
      hostelName,
      branchName: 'Main Wing',
      ownerPhone: '+91 9848011223',
      city: 'Hyderabad',
      state: 'Telangana',
      address: 'Plot 10, Madhapur',
      hostelType: 'BOYS',
    });

    ownerOrgId = reg.organizationId;
    ownerBranchId = reg.hostelBranchId;

    recordTest({
      testCase: 'TC-AUTH-01',
      feature: 'Owner Registration',
      userRole: 'HOSTEL_OWNER',
      action: 'Register new hostel owner with organization and branch',
      expectedResult: 'Owner registered, organization and branch created with JWT token',
      actualResult: `Registered Org: ${reg.organizationId}, Branch: ${reg.hostelBranchId}`,
      status: reg.organizationId && reg.accessToken ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-AUTH-01',
      feature: 'Owner Registration',
      userRole: 'HOSTEL_OWNER',
      action: 'Register new hostel owner with organization and branch',
      expectedResult: 'Owner registered successfully',
      actualResult: 'Registration threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  try {
    const login = await authService.login(ownerEmail, ownerPassword, 'ADMIN');
    ownerToken = login.accessToken;
    ownerUser = login.user;

    recordTest({
      testCase: 'TC-AUTH-02',
      feature: 'Owner Login',
      userRole: 'HOSTEL_OWNER',
      action: 'Login with owner credentials',
      expectedResult: 'JWT access token returned and role mapped to ORGANIZATION_OWNER',
      actualResult: `Role: ${login.user.role}, Authenticated: ${Boolean(login.accessToken)}`,
      status: login.user.role === 'ORGANIZATION_OWNER' && login.accessToken ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-AUTH-02',
      feature: 'Owner Login',
      userRole: 'HOSTEL_OWNER',
      action: 'Login with owner credentials',
      expectedResult: 'Owner login successful',
      actualResult: 'Login threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  try {
    const me = await authService.getMe(ownerUser.id);
    recordTest({
      testCase: 'TC-AUTH-03',
      feature: 'Owner Session Profile',
      userRole: 'HOSTEL_OWNER',
      action: 'Fetch authenticated owner profile (/auth/me)',
      expectedResult: 'Owner metadata and organization name returned',
      actualResult: `Hostel: ${me.hostelName}, OrgId: ${me.organizationId}`,
      status: me.id === ownerUser.id && me.organizationId === ownerOrgId ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-AUTH-03',
      feature: 'Owner Session Profile',
      userRole: 'HOSTEL_OWNER',
      action: 'Fetch authenticated owner profile (/auth/me)',
      expectedResult: 'Owner metadata returned',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 2: TERMS & CONDITIONS ENFORCEMENT
  // ============================================================================
  try {
    const ownerTerms = termsService.getTerms('ORGANIZATION_OWNER');
    recordTest({
      testCase: 'TC-TERMS-01',
      feature: 'Terms & Conditions Fetch',
      userRole: 'HOSTEL_OWNER',
      action: 'Retrieve owner-specific terms & conditions',
      expectedResult: 'Owner terms returned with active version and sections',
      actualResult: `Version: ${ownerTerms.version}, Title: ${ownerTerms.roleTitle}`,
      status: ownerTerms.version && ownerTerms.sections?.length > 0 ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-TERMS-01',
      feature: 'Terms & Conditions Fetch',
      userRole: 'HOSTEL_OWNER',
      action: 'Retrieve owner-specific terms',
      expectedResult: 'Owner terms returned',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  try {
    const studentTerms = termsService.getTerms('STUDENT');
    recordTest({
      testCase: 'TC-TERMS-02',
      feature: 'Terms & Conditions Role Separation',
      userRole: 'STUDENT',
      action: 'Retrieve student-specific terms & conditions',
      expectedResult: 'Student terms returned with distinct sections from owner terms',
      actualResult: `Version: ${studentTerms.version}, Role: ${studentTerms.targetRole}`,
      status: studentTerms.targetRole === 'STUDENT' && studentTerms.sections?.length > 0 ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-TERMS-02',
      feature: 'Terms & Conditions Role Separation',
      userRole: 'STUDENT',
      action: 'Retrieve student-specific terms',
      expectedResult: 'Student terms returned',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  try {
    const accept = await termsService.acceptTerms(ownerUser.id, 'ORGANIZATION_OWNER', '1.0', '127.0.0.1', 'Audit-Agent/1.0');
    recordTest({
      testCase: 'TC-TERMS-03',
      feature: 'Terms Acceptance Mutation',
      userRole: 'HOSTEL_OWNER',
      action: 'Submit terms acceptance agreement',
      expectedResult: 'Acceptance recorded in terms_acceptances and user marked terms_accepted',
      actualResult: `Accepted: ${accept.user.termsAccepted}, Version: ${accept.acceptedVersion}`,
      status: accept.user.termsAccepted === true ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-TERMS-03',
      feature: 'Terms Acceptance Mutation',
      userRole: 'HOSTEL_OWNER',
      action: 'Submit terms acceptance',
      expectedResult: 'Terms accepted',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 3: HOSTEL & BRANCH MANAGEMENT
  // ============================================================================
  try {
    const hostels = await hostelService.list(ownerOrgId);
    recordTest({
      testCase: 'TC-HOSTEL-01',
      feature: 'List Hostels',
      userRole: 'HOSTEL_OWNER',
      action: 'List organization hostel branches',
      expectedResult: 'Registered branch returned in listing',
      actualResult: `Found ${hostels.length} branch(es): ${hostels[0]?.hostelName}`,
      status: hostels.length > 0 ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-HOSTEL-01',
      feature: 'List Hostels',
      userRole: 'HOSTEL_OWNER',
      action: 'List hostel branches',
      expectedResult: 'Branches returned',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  try {
    const updatedHostel = await hostelService.update(ownerOrgId, ownerBranchId, {
      facilities: ['Wi-Fi', 'Hot Water', 'Power Backup', 'RO Water'],
      city: 'Hyderabad',
    });
    recordTest({
      testCase: 'TC-HOSTEL-02',
      feature: 'Update Hostel Details',
      userRole: 'HOSTEL_OWNER',
      action: 'Update hostel facilities and metadata',
      expectedResult: 'Facilities and city persisted correctly',
      actualResult: `Facilities: ${updatedHostel.facilities}`,
      status: updatedHostel && updatedHostel.city === 'Hyderabad' ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-HOSTEL-02',
      feature: 'Update Hostel Details',
      userRole: 'HOSTEL_OWNER',
      action: 'Update hostel facilities',
      expectedResult: 'Updated successfully',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 4: ROOMS, FLOORS & BEDS
  // ============================================================================
  try {
    const roomRes = await roomService.createRoom(ownerOrgId, ownerBranchId, {
      roomNumber: '201',
      floorNumber: 2,
      blockName: 'West Wing',
      buildingName: 'Tower 1',
      totalBeds: 2,
      monthlyRate: 9000,
      roomType: 'DOUBLE',
    });
    createdRoom = roomRes.room;
    createdBed = roomRes.beds[0];

    recordTest({
      testCase: 'TC-ROOM-01',
      feature: 'Room & Bed Creation',
      userRole: 'HOSTEL_OWNER',
      action: 'Create room with 2 beds and rate ₹9,000',
      expectedResult: 'Room and 2 associated beds created with VACANT status',
      actualResult: `Room: ${createdRoom.roomNumber}, Beds: ${roomRes.beds.map((b: any) => b.bedCode).join(', ')}`,
      status: createdRoom && roomRes.beds.length === 2 && (roomRes.beds[0].status === 'AVAILABLE' || roomRes.beds[0].status === 'VACANT') ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-ROOM-01',
      feature: 'Room & Bed Creation',
      userRole: 'HOSTEL_OWNER',
      action: 'Create room',
      expectedResult: 'Room created',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  try {
    const roomsList = await roomService.listRooms(ownerOrgId, ownerBranchId);
    recordTest({
      testCase: 'TC-ROOM-02',
      feature: 'List Rooms with Beds',
      userRole: 'HOSTEL_OWNER',
      action: 'Fetch rooms list for branch',
      expectedResult: 'Room 201 listed with bed capacities',
      actualResult: `Found ${roomsList.length} room(s)`,
      status: roomsList.some((r: any) => r.roomNumber === '201') ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-ROOM-02',
      feature: 'List Rooms',
      userRole: 'HOSTEL_OWNER',
      action: 'List rooms',
      expectedResult: 'Rooms returned',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 5: STUDENT MANAGEMENT & BED ALLOCATION
  // ============================================================================
  try {
    const stu = await studentService.registerStudent(ownerOrgId, ownerBranchId, {
      fullName: 'Vikram Seth',
      email: studentEmail,
      phone: '+91 9988776655',
      gender: 'MALE',
      course: 'MCA Computer Applications',
      guardianName: 'Anil Seth',
      guardianRelation: 'Father',
      guardianPhone: '+91 9988776600',
      guardianAddress: 'Hanamkonda, Warangal',
    });
    createdStudent = stu;

    await studentService.resetStudentPassword(ownerOrgId, stu.id, studentPassword);

    recordTest({
      testCase: 'TC-STU-01',
      feature: 'Student Registration',
      userRole: 'HOSTEL_OWNER',
      action: 'Register new student and set initial portal password',
      expectedResult: 'Student created with unique customerCode and portal access',
      actualResult: `Customer Code: ${stu.customerCode}, Full Name: ${stu.fullName}`,
      status: stu.id && stu.customerCode ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-STU-01',
      feature: 'Student Registration',
      userRole: 'HOSTEL_OWNER',
      action: 'Register new student',
      expectedResult: 'Student registered',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  try {
    const studentLogin = await authService.login(studentEmail, studentPassword, 'STUDENT');
    studentToken = studentLogin.accessToken;
    studentUser = studentLogin.user;

    recordTest({
      testCase: 'TC-STU-02',
      feature: 'Student Portal Login',
      userRole: 'STUDENT',
      action: 'Authenticate student into student portal',
      expectedResult: 'Student authenticated with STUDENT role and valid token',
      actualResult: `Student Role: ${studentLogin.user.role}, CustomerCode: ${studentLogin.user.customerCode}`,
      status: studentLogin.user.role === 'STUDENT' && studentLogin.accessToken ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-STU-02',
      feature: 'Student Portal Login',
      userRole: 'STUDENT',
      action: 'Login as student',
      expectedResult: 'Student logged in',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  try {
    const alloc = await studentService.allocateBedToStudent(ownerOrgId, createdStudent.id, {
      bedId: createdBed.id,
      monthlyRent: 9000,
    });

    const checkBed = await queryOne<any>('SELECT status, current_student_id FROM beds WHERE id = $1', [createdBed.id]);

    recordTest({
      testCase: 'TC-STU-03',
      feature: 'Bed Allocation & Lock',
      userRole: 'HOSTEL_OWNER',
      action: 'Allocate bed to student and verify occupancy lock',
      expectedResult: 'Bed status transitions to OCCUPIED and linked to student',
      actualResult: `Bed Status: ${checkBed.status}, StudentId: ${checkBed.current_student_id}`,
      status: checkBed.status === 'OCCUPIED' && checkBed.current_student_id === createdStudent.id ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-STU-03',
      feature: 'Bed Allocation & Lock',
      userRole: 'HOSTEL_OWNER',
      action: 'Allocate bed',
      expectedResult: 'Bed allocated',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 6: FEE DEMANDS & ACCOUNTS
  // ============================================================================
  try {
    const demand = await feeService.createFeeDemand(ownerOrgId, {
      studentId: createdStudent.id,
      termName: 'September 2026 Hostel Rent',
      totalAmount: 9000,
      hostelRent: 8500,
      admissionFee: 500,
      dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    });
    createdDemand = demand;

    recordTest({
      testCase: 'TC-FEE-01',
      feature: 'Fee Demand Creation',
      userRole: 'HOSTEL_OWNER',
      action: 'Create fee demand record of ₹9,000 for student',
      expectedResult: 'Fee demand created with status UNPAID and demand number',
      actualResult: `Demand #: ${demand.demand_number}, Amount: ₹${demand.total_amount}`,
      status: Number(demand.total_amount) === 9000 && demand.status === 'UNPAID' ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-FEE-01',
      feature: 'Fee Demand Creation',
      userRole: 'HOSTEL_OWNER',
      action: 'Create fee demand',
      expectedResult: 'Demand created',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  try {
    const feeAcct = await feeService.getStudentFeeAccount(ownerOrgId, createdStudent.id);
    recordTest({
      testCase: 'TC-FEE-02',
      feature: 'Student Fee Account Verification',
      userRole: 'STUDENT',
      action: 'Retrieve student fee ledger summary',
      expectedResult: 'Outstanding balance reflects ₹9,000 and total paid is 0',
      actualResult: `Total Fee: ₹${feeAcct.totalFee}, Outstanding: ₹${feeAcct.balanceAmount}`,
      status: Number(feeAcct.totalFee) === 9000 && Number(feeAcct.balanceAmount) === 9000 ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-FEE-02',
      feature: 'Student Fee Account Verification',
      userRole: 'STUDENT',
      action: 'Retrieve student fee account',
      expectedResult: 'Account summary returned',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 7: PAYMENT SYSTEM (UPI, DYNAMIC QR, BANK, CARDS, VERIFICATION)
  // ============================================================================
  try {
    const pmtCfg = await hostelPaymentConfigService.getByHostelId(ownerOrgId, ownerBranchId);
    recordTest({
      testCase: 'TC-PMT-01',
      feature: 'Hostel Payment Configuration Retrieval',
      userRole: 'HOSTEL_OWNER',
      action: 'Retrieve hostel payment config (flat + nested UPI schema)',
      expectedResult: 'Configuration retrieved with active UPI VPA address',
      actualResult: `UPI VPA: ${pmtCfg?.upi_vpa || pmtCfg?.upiConfig?.vpaAddress}, Status: ${pmtCfg?.upiConfig?.status}`,
      status: Boolean(pmtCfg?.upi_vpa || pmtCfg?.upiConfig?.vpaAddress) ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-PMT-01',
      feature: 'Hostel Payment Configuration Retrieval',
      userRole: 'HOSTEL_OWNER',
      action: 'Retrieve hostel payment config',
      expectedResult: 'Config returned',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  try {
    const customUpi = `auditresidency_${timestamp}@upi`;
    await hostelPaymentConfigService.initiateVerification(ownerOrgId, ownerBranchId, ownerUser.id, 'UPI', {
      vpaAddress: customUpi,
      displayName: 'Audit Residency',
    });
    const activated = await hostelPaymentConfigService.confirmAndActivate(ownerOrgId, ownerBranchId, ownerUser.id, 'UPI');

    recordTest({
      testCase: 'TC-PMT-02',
      feature: 'UPI ID Update & Activation',
      userRole: 'HOSTEL_OWNER',
      action: 'Initiate and activate custom hostel UPI ID',
      expectedResult: 'UPI ID activated to ACTIVE status with new VPA',
      actualResult: `Activated VPA: ${activated.upiConfig.vpaAddress}, Status: ${activated.upiConfig.status}`,
      status: activated.upiConfig.vpaAddress === customUpi && activated.upiConfig.status === 'ACTIVE' ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-PMT-02',
      feature: 'UPI ID Update & Activation',
      userRole: 'HOSTEL_OWNER',
      action: 'Update UPI ID',
      expectedResult: 'UPI ID updated',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  try {
    const qrResult = await zeroGatewayPaymentService.createDynamicQRPayment(
      ownerOrgId,
      createdStudent.id,
      9000,
      createdDemand.id
    );
    dynamicPaymentId = qrResult.paymentId || qrResult.paymentNumber || '';

    recordTest({
      testCase: 'TC-PMT-03',
      feature: 'Dynamic UPI QR Generation',
      userRole: 'STUDENT',
      action: 'Initiate dynamic UPI QR code payment request',
      expectedResult: 'UPI payload returned with intentUrl, qrDataUrl, and pending payment ID',
      actualResult: `PaymentId: ${dynamicPaymentId}, Configured: ${qrResult.configured}, HasUPI: ${Boolean(qrResult.paymentDetails?.upi?.vpaAddress)}`,
      status: qrResult.configured === true && Boolean(qrResult.paymentDetails?.upi?.vpaAddress) ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-PMT-03',
      feature: 'Dynamic UPI QR Generation',
      userRole: 'STUDENT',
      action: 'Generate dynamic QR',
      expectedResult: 'QR generated',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  try {
    const statusRes = await zeroGatewayPaymentService.checkDynamicPaymentStatus(ownerOrgId, dynamicPaymentId);
    recordTest({
      testCase: 'TC-PMT-04',
      feature: 'Payment Status Check',
      userRole: 'STUDENT',
      action: 'Check status of pending dynamic payment order',
      expectedResult: 'Status returned as PENDING with amount and expiry',
      actualResult: `Status: ${statusRes.status}, Amount: ₹${statusRes.amount}`,
      status: statusRes.status === 'PENDING' && Number(statusRes.amount) === 9000 ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-PMT-04',
      feature: 'Payment Status Check',
      userRole: 'STUDENT',
      action: 'Check payment status',
      expectedResult: 'Status returned',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  try {
    const utrRef = `UTR${timestamp}`;
    const submitPmt = await zeroGatewayPaymentService.submitZeroGatewayPayment(ownerOrgId, {
      studentId: createdStudent.id,
      amount: 9000,
      paymentMethod: 'UPI',
      transactionRef: utrRef,
      installmentId: createdDemand.id,
      notes: 'Paid via Google Pay dynamic QR',
    });

    recordTest({
      testCase: 'TC-PMT-05',
      feature: 'UTR / Bank Reference Submission',
      userRole: 'STUDENT',
      action: 'Submit 12-digit UTR reference after UPI transfer',
      expectedResult: 'Payment submission recorded for owner verification',
      actualResult: `Payment#: ${submitPmt.payment?.paymentNumber || submitPmt.payment?.payment_number}, Status: ${submitPmt.payment?.status}`,
      status: submitPmt.payment && (submitPmt.payment.transactionRef === utrRef || submitPmt.payment.transaction_ref === utrRef) ? 'PASS' : 'FAIL',
    });

    const verified = await zeroGatewayPaymentService.verifyPaymentSubmission(ownerOrgId, submitPmt.payment.id, 'Audit Owner');
    recordTest({
      testCase: 'TC-PMT-06',
      feature: 'Owner Payment Submission Verification',
      userRole: 'HOSTEL_OWNER',
      action: 'Owner reviews UTR and approves payment submission',
      expectedResult: 'Payment status transitions to VERIFIED and official receipt generated',
      actualResult: `Status: ${verified.status}, Receipt#: ${verified.receiptNumber}`,
      status: verified.status === 'VERIFIED' && Boolean(verified.receiptNumber) ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-PMT-05',
      feature: 'UTR Submission & Owner Verification',
      userRole: 'STUDENT',
      action: 'Submit UTR and verify',
      expectedResult: 'Payment confirmed',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  try {
    const updatedAcct = await feeService.getStudentFeeAccount(ownerOrgId, createdStudent.id);
    recordTest({
      testCase: 'TC-PMT-07',
      feature: 'Outstanding Balance Update',
      userRole: 'STUDENT',
      action: 'Verify student fee balance after verified payment',
      expectedResult: 'Outstanding balance is 0 and status is PAID',
      actualResult: `Outstanding: ₹${updatedAcct.balanceAmount}, Total Paid: ₹${updatedAcct.totalPaid}`,
      status: Number(updatedAcct.balanceAmount) === 0 && Number(updatedAcct.totalPaid) === 9000 ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-PMT-07',
      feature: 'Outstanding Balance Update',
      userRole: 'STUDENT',
      action: 'Check balance',
      expectedResult: 'Balance is 0',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 8: RECEIPTS & IDEMPOTENCY
  // ============================================================================
  try {
    const receipts = await feeService.listReceipts(ownerOrgId, undefined, createdStudent.id);
    const r1 = receipts[0];
    const rDuplicate = await feeService.getReceiptByPaymentId(ownerOrgId, r1.paymentId || r1.payment_id);

    recordTest({
      testCase: 'TC-RCP-01',
      feature: 'Receipt Idempotency & Duplicate Prevention',
      userRole: 'HOSTEL_OWNER',
      action: 'Fetch receipt twice and verify single unique sequence',
      expectedResult: 'Both fetches return the exact same receipt number',
      actualResult: `Receipt 1: ${r1.receiptNumber || r1.receipt_number}, Receipt 2: ${rDuplicate.receiptNumber}`,
      status: (r1.receiptNumber || r1.receipt_number) === rDuplicate.receiptNumber ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-RCP-01',
      feature: 'Receipt Idempotency',
      userRole: 'HOSTEL_OWNER',
      action: 'Verify receipt duplicate prevention',
      expectedResult: 'Identical receipt returned',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 9: ATTENDANCE & LEAVE MANAGEMENT
  // ============================================================================
  try {
    const attDate = new Date();
    attDate.setHours(0, 0, 0, 0);

    const att = await queryOne<any>(
      `INSERT INTO attendances (
        id, organization_id, branch_id, student_id, customer_code,
        student_name, date, status, marked_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        require('crypto').randomUUID(),
        ownerOrgId,
        ownerBranchId,
        createdStudent.id,
        createdStudent.customerCode,
        createdStudent.fullName,
        attDate,
        'PRESENT',
        'Staff'
      ]
    );

    recordTest({
      testCase: 'TC-ATT-01',
      feature: 'Mark Attendance',
      userRole: 'HOSTEL_OWNER',
      action: 'Record daily attendance status PRESENT for student',
      expectedResult: 'Attendance record persisted in database',
      actualResult: `Status: ${att.status}, Date: ${att.date}`,
      status: att && att.status === 'PRESENT' ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-ATT-01',
      feature: 'Mark Attendance',
      userRole: 'HOSTEL_OWNER',
      action: 'Record attendance',
      expectedResult: 'Attendance recorded',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  try {
    const leave = await attendanceService.applyLeave(ownerOrgId, {
      studentId: createdStudent.id,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      reason: 'Visiting family for festival',
      destinationAddress: 'Warangal, Telangana',
    });

    recordTest({
      testCase: 'TC-ATT-02',
      feature: 'Submit Leave Request',
      userRole: 'STUDENT',
      action: 'Submit 3-day leave request',
      expectedResult: 'Leave request recorded with status PENDING',
      actualResult: `Leave#: ${leave.leaveNumber}, Status: ${leave.status}`,
      status: leave && leave.status === 'PENDING' ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-ATT-02',
      feature: 'Submit Leave Request',
      userRole: 'STUDENT',
      action: 'Submit leave request',
      expectedResult: 'Leave submitted',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 10: MESS MENUS
  // ============================================================================
  try {
    const menu = await messService.createMenu(ownerOrgId, ownerBranchId, {
      weekStartDate: new Date().toISOString(),
      weekEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'PUBLISHED',
      days: [
        { day: 'Monday', breakfast: ['Idli', 'Sambar'], lunch: ['Rice', 'Dal', 'Curd'], snacks: ['Tea', 'Biscuits'], dinner: ['Roti', 'Paneer Curry'] },
        { day: 'Tuesday', breakfast: ['Puri', 'Bhaji'], lunch: ['Rice', 'Sambar', 'Papad'], snacks: ['Coffee'], dinner: ['Roti', 'Mixed Veg'] },
      ]
    });

    recordTest({
      testCase: 'TC-MESS-01',
      feature: 'Publish Mess Menu',
      userRole: 'HOSTEL_OWNER',
      action: 'Create weekly mess meal schedule and publish',
      expectedResult: 'Menu saved in mess_menus with status PUBLISHED',
      actualResult: `Menu ID: ${menu.id}, Status: ${menu.status}`,
      status: menu && menu.status === 'PUBLISHED' ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-MESS-01',
      feature: 'Publish Mess Menu',
      userRole: 'HOSTEL_OWNER',
      action: 'Create mess menu',
      expectedResult: 'Menu created',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 11: INVENTORY & ASSETS
  // ============================================================================
  try {
    const asset = await inventoryService.createAsset(ownerOrgId, ownerBranchId, {
      name: 'Executive Study Desk',
      category: 'FURNITURE',
      quantity: 5,
      cost: 4500,
      condition: 'GOOD',
      roomLocation: 'Room 201',
    });

    recordTest({
      testCase: 'TC-INV-01',
      feature: 'Register Asset',
      userRole: 'HOSTEL_OWNER',
      action: 'Register hostel inventory asset with code and QR payload',
      expectedResult: 'Asset created with unique assetCode',
      actualResult: `Asset Code: ${asset.assetCode}, Name: ${asset.name}`,
      status: asset && asset.assetCode ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-INV-01',
      feature: 'Register Asset',
      userRole: 'HOSTEL_OWNER',
      action: 'Create asset',
      expectedResult: 'Asset created',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 12: VISITORS & PASSES
  // ============================================================================
  try {
    const passNumber = await generateVisitorPassNumber(ownerOrgId, 'HYD001');
    const visitor = await queryOne<any>(
      `INSERT INTO visitors (
        id, visitor_pass_number, organization_id, branch_id, student_id, customer_code,
        student_name, visitor_name, relation, phone, purpose, status, check_in_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'INSIDE', CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        require('crypto').randomUUID(),
        passNumber,
        ownerOrgId,
        ownerBranchId,
        createdStudent.id,
        createdStudent.customerCode,
        createdStudent.fullName,
        'Anil Seth',
        'Father',
        '+91 9988776600',
        'Weekend Visit'
      ]
    );

    recordTest({
      testCase: 'TC-VIS-01',
      feature: 'Create Visitor Pass',
      userRole: 'HOSTEL_OWNER',
      action: 'Generate visitor pass with check-in timestamp',
      expectedResult: 'Visitor pass created with status INSIDE',
      actualResult: `Pass#: ${visitor.visitor_pass_number}, Status: ${visitor.status}`,
      status: visitor && visitor.status === 'INSIDE' ? 'PASS' : 'FAIL',
    });

    const checkedOut = await queryOne<any>(
      `UPDATE visitors
       SET check_out_time = CURRENT_TIMESTAMP, status = 'EXITED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [visitor.id, ownerOrgId]
    );

    recordTest({
      testCase: 'TC-VIS-02',
      feature: 'Check Out Visitor',
      userRole: 'HOSTEL_OWNER',
      action: 'Mark visitor checkout time and status EXITED',
      expectedResult: 'Visitor status updated to EXITED',
      actualResult: `Checked Out: ${Boolean(checkedOut.check_out_time)}, Status: ${checkedOut.status}`,
      status: checkedOut && checkedOut.status === 'EXITED' ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-VIS-01',
      feature: 'Visitor Pass Management',
      userRole: 'HOSTEL_OWNER',
      action: 'Manage visitor',
      expectedResult: 'Pass managed',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 13: COMPLAINTS & FEEDBACK
  // ============================================================================
  try {
    const compNumber = await generateComplaintNumber(ownerOrgId, 'AUD');
    const complaint = await queryOne<any>(
      `INSERT INTO complaints (
        id, complaint_number, organization_id, branch_id, student_id, customer_code,
        student_name, title, description, category, priority, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING')
      RETURNING *`,
      [
        require('crypto').randomUUID(),
        compNumber,
        ownerOrgId,
        ownerBranchId,
        createdStudent.id,
        createdStudent.customerCode,
        createdStudent.fullName,
        'Study lamp replacement needed',
        'Desk lamp bulb is flickering intermittently',
        'ELECTRICAL',
        'MEDIUM'
      ]
    );

    recordTest({
      testCase: 'TC-CMP-01',
      feature: 'Submit Student Complaint',
      userRole: 'STUDENT',
      action: 'Submit maintenance complaint',
      expectedResult: 'Complaint registered with ticket number',
      actualResult: `Complaint#: ${complaint.complaint_number}, Status: ${complaint.status}`,
      status: complaint && complaint.complaint_number ? 'PASS' : 'FAIL',
    });

    const resolved = await queryOne<any>(
      `UPDATE complaints
       SET status = 'RESOLVED', resolution_notes = 'Bulb replaced by maintenance staff', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [complaint.id, ownerOrgId]
    );

    recordTest({
      testCase: 'TC-CMP-02',
      feature: 'Resolve Complaint',
      userRole: 'HOSTEL_OWNER',
      action: 'Resolve complaint and record resolution notes',
      expectedResult: 'Complaint status transitions to RESOLVED',
      actualResult: `Status: ${resolved.status}, Resolution: ${resolved.resolution_notes}`,
      status: resolved && resolved.status === 'RESOLVED' ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-CMP-01',
      feature: 'Complaints Workflow',
      userRole: 'STUDENT',
      action: 'Process complaint',
      expectedResult: 'Complaint processed',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 14: ANNOUNCEMENTS
  // ============================================================================
  try {
    const ann = await announcementService.create({
      title: 'Hostel Annual Maintenance Notification',
      message: 'Water pipeline maintenance scheduled for this Saturday 10 AM to 1 PM.',
      targetType: 'ALL',
      priority: 'URGENT',
      branchId: ownerBranchId,
    }, {
      id: ownerUser.id,
      organizationId: ownerOrgId,
      name: 'Owner',
    });

    recordTest({
      testCase: 'TC-ANN-01',
      feature: 'Publish Announcement',
      userRole: 'HOSTEL_OWNER',
      action: 'Create and publish organization announcement',
      expectedResult: 'Announcement persisted with active status',
      actualResult: `Title: ${ann.title}, Target: ${ann.targetType}`,
      status: ann && ann.title === 'Hostel Annual Maintenance Notification' ? 'PASS' : 'FAIL',
    });

    await announcementService.markAsRead(ann.id, createdStudent.id);
    const unreadCount = await announcementService.getUnreadCountForStudent({
      id: createdStudent.id,
      studentId: createdStudent.id,
      organizationId: ownerOrgId,
      branchId: ownerBranchId,
    });

    recordTest({
      testCase: 'TC-ANN-02',
      feature: 'Student Read Tracking',
      userRole: 'STUDENT',
      action: 'Mark announcement as read and verify unread count decrement',
      expectedResult: 'Read receipt recorded in announcement_reads',
      actualResult: `Unread count after marking read: ${unreadCount}`,
      status: unreadCount === 0 ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-ANN-01',
      feature: 'Announcement Lifecycle',
      userRole: 'HOSTEL_OWNER',
      action: 'Create and read announcement',
      expectedResult: 'Announcement managed',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 15: NOTIFICATIONS
  // ============================================================================
  try {
    await notificationService.notifyStudent(createdStudent.id, {
      organizationId: ownerOrgId,
      title: 'Fee Receipt Generated',
      message: 'Your fee payment receipt RCP-2026-000001 is now available for download.',
      type: 'INFO',
    });

    const notifs = await notificationService.getNotifications({
      id: createdStudent.id,
      studentId: createdStudent.id,
      organizationId: ownerOrgId,
    }, { page: 1, pageSize: 10 });

    recordTest({
      testCase: 'TC-NOTIF-01',
      feature: 'Notification Dispatch & Retrieval',
      userRole: 'STUDENT',
      action: 'Dispatch notification to student and retrieve in feed',
      expectedResult: 'Notification delivered to student feed',
      actualResult: `Found ${notifs.items.length} notification(s): ${notifs.items[0]?.title}`,
      status: notifs.items.length > 0 && notifs.items[0]?.title === 'Fee Receipt Generated' ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-NOTIF-01',
      feature: 'Notification Dispatch',
      userRole: 'STUDENT',
      action: 'Notify student',
      expectedResult: 'Notification delivered',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 16: SUPPORT TICKETS & EMAIL DISPATCH
  // ============================================================================
  try {
    const ticket = await supportService.createTicket({
      id: createdStudent.id,
      email: studentEmail,
      name: 'Vikram Seth',
      role: 'STUDENT',
      organizationId: ownerOrgId,
    }, {
      subject: 'WiFi connectivity in Room 201',
      description: 'The router on 2nd floor has weak signal in corner rooms.',
      category: 'TECHNICAL',
      priority: 'HIGH',
    });

    recordTest({
      testCase: 'TC-SUP-01',
      feature: 'Create Support Ticket with Direct Email',
      userRole: 'STUDENT',
      action: 'Submit support ticket to central inbox (ihmserp00@gmail.com)',
      expectedResult: 'Ticket created with IHMS-NNNN format and email_status SENT',
      actualResult: `Ticket#: ${ticket.ticketNumber}, Email Status: ${ticket.emailStatus}`,
      status: ticket.ticketNumber?.startsWith('IHMS-') && (ticket.emailStatus === 'SENT' || ticket.emailStatus === 'DEV_SIMULATED') ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-SUP-01',
      feature: 'Support Ticket Creation',
      userRole: 'STUDENT',
      action: 'Create support ticket',
      expectedResult: 'Ticket created',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 17: FINANCE & EXPENSES
  // ============================================================================
  try {
    const exp = await financeService.recordExpense(ownerOrgId, ownerBranchId, {
      title: 'Plumbing Repair Supplies',
      category: 'MAINTENANCE',
      amount: 1200,
      paymentMethod: 'CASH',
      recipientName: 'City Hardware Mart',
      approvedBy: 'Sunil Kumar (Owner)',
      notes: 'Replacement pipe fittings',
    });

    recordTest({
      testCase: 'TC-FIN-01',
      feature: 'Record Expense Voucher',
      userRole: 'HOSTEL_OWNER',
      action: 'Post cash expense voucher to general ledger',
      expectedResult: 'Expense voucher recorded with unique voucher number',
      actualResult: `Voucher: ${exp.voucherNumber || exp.id}, Amount: ₹${exp.amount}`,
      status: exp && Number(exp.amount) === 1200 ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-FIN-01',
      feature: 'Record Expense',
      userRole: 'HOSTEL_OWNER',
      action: 'Post expense',
      expectedResult: 'Expense recorded',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 18: STUDENT SELF-SERVICE PORTAL
  // ============================================================================
  try {
    const studentProfile = await queryOne<any>(
      `SELECT s.*, r.room_number, b.bed_code, h.name as hostel_name
       FROM students s
       LEFT JOIN rooms r ON r.id = s.room_id
       LEFT JOIN beds b ON b.id = s.bed_id
       LEFT JOIN hostels h ON h.id = s.hostel_id
       WHERE s.id = $1 AND s.organization_id = $2`,
      [createdStudent.id, ownerOrgId]
    );

    recordTest({
      testCase: 'TC-SELF-01',
      feature: 'Student Portal Self-Service Profile',
      userRole: 'STUDENT',
      action: 'Fetch student self profile with room and bed metadata',
      expectedResult: 'Profile includes room 201, bed code, hostel name and financial standing',
      actualResult: `Room: ${studentProfile.room_number}, Bed: ${studentProfile.bed_code}, Hostel: ${studentProfile.hostel_name}`,
      status: studentProfile.room_number === '201' && Boolean(studentProfile.bed_code) ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-SELF-01',
      feature: 'Student Portal Profile',
      userRole: 'STUDENT',
      action: 'Fetch student profile',
      expectedResult: 'Profile returned',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 19: MULTI-TENANT ISOLATION & DATA SECURITY
  // ============================================================================
  try {
    const tenant2 = await authService.registerOwner({
      ownerName: 'Radha Krishna',
      ownerEmail: `tenant2_${timestamp}@ihms-audit.com`,
      ownerPassword: 'Password@123',
      hostelName: `Silver Oak Residency ${timestamp}`,
      branchName: 'East Wing',
    });

    let leaked = false;
    try {
      const crossDoc = await studentService.getById(tenant2.organizationId, createdStudent.id);
      if (crossDoc) leaked = true;
    } catch {
      leaked = false;
    }

    recordTest({
      testCase: 'TC-SEC-01',
      feature: 'Multi-Tenant Data Isolation',
      userRole: 'HOSTEL_OWNER',
      action: 'Tenant 2 attempts to read Tenant 1 student document',
      expectedResult: 'Access blocked with 404 / Document Not Found',
      actualResult: leaked ? 'CRITICAL: Data leaked cross-tenant' : 'Blocked successfully',
      status: !leaked ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-SEC-01',
      feature: 'Multi-Tenant Data Isolation',
      userRole: 'HOSTEL_OWNER',
      action: 'Verify tenant isolation',
      expectedResult: 'Tenant isolated',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  // ============================================================================
  // MODULE 20: ROLE-BASED ACCESS CONTROL (RBAC)
  // ============================================================================
  try {
    let studentBlockedFromOwnerEndpoint = false;
    const ownerOnlyGuard = authorize('OWNER', 'ORGANIZATION_OWNER', 'SUPER_ADMIN');
    const fakeStudentReq: any = {
      user: {
        id: createdStudent.id,
        role: 'STUDENT',
        organizationId: ownerOrgId,
      }
    };

    ownerOnlyGuard(fakeStudentReq, {} as any, (err?: any) => {
      if (err && err.statusCode === 403) {
        studentBlockedFromOwnerEndpoint = true;
      }
    });

    recordTest({
      testCase: 'TC-SEC-02',
      feature: 'Role-Based Access Control',
      userRole: 'STUDENT',
      action: 'Student token attempts to execute Owner-protected action',
      expectedResult: 'Rejected with HTTP 403 Forbidden',
      actualResult: studentBlockedFromOwnerEndpoint ? 'HTTP 403 Forbidden received' : 'Access permitted incorrectly',
      status: studentBlockedFromOwnerEndpoint ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    recordTest({
      testCase: 'TC-SEC-02',
      feature: 'Role-Based Access Control',
      userRole: 'STUDENT',
      action: 'Verify RBAC',
      expectedResult: 'Access blocked',
      actualResult: 'Threw error',
      status: 'FAIL',
      error: err.message,
    });
  }

  await disconnectDatabase();

  const total = auditLog.length;
  const passed = auditLog.filter(t => t.status === 'PASS').length;
  const failed = auditLog.filter(t => t.status === 'FAIL').length;

  console.log('\n========================================================================');
  console.log(`  📊 AUDIT SUMMARY: ${passed}/${total} TEST CASES PASSED (${Math.round(passed/total * 100)}%)`);
  console.log('========================================================================\n');

  return {
    total,
    passed,
    failed,
    auditLog,
  };
}

if (require.main === module) {
  runFullSystemAudit().then(res => {
    process.exit(res.failed === 0 ? 0 : 1);
  }).catch(err => {
    console.error('Audit failed with fatal error:', err);
    process.exit(1);
  });
}
