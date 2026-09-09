import request from 'supertest';
import { connectDatabase, disconnectDatabase, query, queryOne } from '../src/config/database';
import { hostelService } from '../src/modules/hostels/hostel.service';
import { hostelPaymentConfigService } from '../src/modules/hostels/hostel-payment-config.service';
import { zeroGatewayPaymentService } from '../src/modules/fees/zero-gateway-payment.service';
import { feeService } from '../src/modules/fees/fee.service';
import { PaymentMethod } from '../src/config/constants';
import app from '../src/main';

describe('Real-World Payment System Complete Audit & Lifecycle (TC01 - TC40)', () => {
  const orgId = 'org_tc_payment_audit';
  const ownerAUserId = 'user_owner_a_audit';
  const ownerBUserId = 'user_owner_b_audit';
  const otherOrgId = 'org_other_rogue';

  let hostelAId: string;
  let hostelBId: string;
  let studentAId: string;
  let studentBId: string;
  let unassignedStudentId: string;
  let studentCId: string;

  let submittedPaymentId: string;
  let verifiedPaymentId: string;
  let rejectedPaymentId: string;
  let createdReceiptNumber: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase();

    // 1. Setup test organizations
    await query(
      `INSERT INTO organizations (id, org_code, name, email) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [orgId, 'ORG_TC_AUDIT', 'TC Payment Audit Org', 'owner@tcaudit.com']
    );
    await query(
      `INSERT INTO organizations (id, org_code, name, email) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [otherOrgId, 'ORG_ROGUE', 'Rogue External Org', 'rogue@external.com']
    );

    // 2. Setup Owners
    await query(
      `INSERT INTO users (id, user_id, organization_id, email, password_hash, role, name, status)
       VALUES ($1, $1, $2, 'ownera@tcaudit.com', 'hash', 'ORGANIZATION_OWNER', 'Owner Alpha', 'ACTIVE') ON CONFLICT DO NOTHING`,
      [ownerAUserId, orgId]
    );
    await query(
      `INSERT INTO users (id, user_id, organization_id, email, password_hash, role, name, status)
       VALUES ($1, $1, $2, 'ownerb@tcaudit.com', 'hash', 'ORGANIZATION_OWNER', 'Owner Beta', 'ACTIVE') ON CONFLICT DO NOTHING`,
      [ownerBUserId, orgId]
    );

    // 3. Create Hostel A and Hostel B
    const hA = await hostelService.create(orgId, {
      name: 'Hostel Alpha',
      hostelName: 'Hostel Alpha',
      branchName: 'Alpha Branch',
      city: 'Hyderabad',
      address: 'Madhapur',
      contactPhone: '+91 9848011111',
    });
    hostelAId = hA.id;

    const hB = await hostelService.create(orgId, {
      name: 'Hostel Beta',
      hostelName: 'Hostel Beta',
      branchName: 'Beta Branch',
      city: 'Hyderabad',
      address: 'Gachibowli',
      contactPhone: '+91 9848022222',
    });
    hostelBId = hB.id;

    // 4. Setup Students
    studentAId = 'stu_alpha_001';
    await query(
      `INSERT INTO students (
        id, student_id, customer_code, organization_id, hostel_id, full_name, email,
        phone, gender, admission_date, financial_total_demanded, financial_total_paid,
        financial_outstanding_balance, portal_access, status
      ) VALUES ($1, 'STU-A-01', 'CUST-A-01', $2, $3, 'Student Alpha', 'studenta@test.com',
                '+91 9999900001', 'MALE', CURRENT_TIMESTAMP, 10000, 0, 10000, true, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [studentAId, orgId, hostelAId]
    );
    await query(
      `INSERT INTO fee_accounts (id, organization_id, student_id, customer_code, total_fee, total_paid, balance_amount, outstanding_balance, allow_advance_payment)
       VALUES ($1, $2, $3, 'CUST-A-01', 10000, 0, 10000, 10000, false)
       ON CONFLICT (organization_id, student_id) DO NOTHING`,
      [`fa_${studentAId}`, orgId, studentAId]
    );

    studentBId = 'stu_beta_002';
    await query(
      `INSERT INTO students (
        id, student_id, customer_code, organization_id, hostel_id, full_name, email,
        phone, gender, admission_date, financial_total_demanded, financial_total_paid,
        financial_outstanding_balance, portal_access, status
      ) VALUES ($1, 'STU-B-02', 'CUST-B-02', $2, $3, 'Student Beta', 'studentb@test.com',
                '+91 9999900002', 'MALE', CURRENT_TIMESTAMP, 12000, 0, 12000, true, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [studentBId, orgId, hostelBId]
    );
    await query(
      `INSERT INTO fee_accounts (id, organization_id, student_id, customer_code, total_fee, total_paid, balance_amount, outstanding_balance, allow_advance_payment)
       VALUES ($1, $2, $3, 'CUST-B-02', 12000, 0, 12000, 12000, false)
       ON CONFLICT (organization_id, student_id) DO NOTHING`,
      [`fa_${studentBId}`, orgId, studentBId]
    );

    unassignedStudentId = 'stu_unassigned_003';
    await query(
      `INSERT INTO students (
        id, student_id, customer_code, organization_id, hostel_id, full_name, email,
        phone, gender, admission_date, financial_total_demanded, financial_total_paid,
        financial_outstanding_balance, portal_access, status
      ) VALUES ($1, 'STU-U-03', 'CUST-U-03', $2, NULL, 'Unassigned Student', 'unassigned@test.com',
                '+91 9999900003', 'MALE', CURRENT_TIMESTAMP, 5000, 0, 5000, true, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [unassignedStudentId, orgId]
    );

    studentCId = 'stu_gamma_004';
    await query(
      `INSERT INTO students (
        id, student_id, customer_code, organization_id, hostel_id, full_name, email,
        phone, gender, admission_date, financial_total_demanded, financial_total_paid,
        financial_outstanding_balance, portal_access, status
      ) VALUES ($1, 'STU-C-04', 'CUST-C-04', $2, $3, 'Student Gamma', 'studentc@test.com',
                '+91 9999900004', 'MALE', CURRENT_TIMESTAMP, 8000, 0, 8000, true, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [studentCId, orgId, hostelAId]
    );
    await query(
      `INSERT INTO fee_accounts (id, organization_id, student_id, customer_code, total_fee, total_paid, balance_amount, outstanding_balance, allow_advance_payment)
       VALUES ($1, $2, $3, 'CUST-C-04', 8000, 0, 8000, 8000, false)
       ON CONFLICT (organization_id, student_id) DO NOTHING`,
      [`fa_${studentCId}`, orgId, studentCId]
    );
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  // ===========================================================================
  // SECTION 1: OWNER PAYMENT CONFIGURATION (TC01 - TC06)
  // ===========================================================================

  it('TC01 – Owner saves valid UPI ID: saves and activates for that hostel branch', async () => {
    const validUpi = 'alpha.hostel@ybl';
    await hostelPaymentConfigService.upsertConfig(orgId, hostelAId, ownerAUserId, {
      vpaAddress: validUpi,
      displayName: 'Hostel Alpha Official',
    });

    const cfg = await hostelPaymentConfigService.getByHostelId(orgId, hostelAId);
    expect(cfg).not.toBeNull();
    expect(cfg?.upiConfig.vpaAddress).toBe(validUpi);
    expect(cfg?.upiConfig.status).toBe('ACTIVE');
  });

  it('TC02 – Owner saves invalid UPI ID: rejects with meaningful validation error', async () => {
    await expect(
      hostelPaymentConfigService.upsertConfig(orgId, hostelAId, ownerAUserId, {
        vpaAddress: 'invalid-vpa-without-at',
        displayName: 'Hostel Alpha Official',
      })
    ).rejects.toThrow('Invalid UPI ID format');

    await expect(
      hostelPaymentConfigService.upsertConfig(orgId, hostelAId, ownerAUserId, {
        vpaAddress: '@ybl',
        displayName: 'Hostel Alpha Official',
      })
    ).rejects.toThrow('Invalid UPI ID format');
  });

  it('TC03 – Owner changes UPI ID: successfully updates to new PSP handle without lockout', async () => {
    const updatedUpi = 'alpha.hostel@okaxis';
    await hostelPaymentConfigService.upsertConfig(orgId, hostelAId, ownerAUserId, {
      vpaAddress: updatedUpi,
      displayName: 'Hostel Alpha Updated',
    });

    const cfg = await hostelPaymentConfigService.getByHostelId(orgId, hostelAId);
    expect(cfg?.upiConfig.vpaAddress).toBe(updatedUpi);
  });

  it('TC04 – No UPI ID configured: unconfigured hostel returns empty/null', async () => {
    const cfg = await hostelPaymentConfigService.getByHostelId(orgId, hostelBId);
    expect(cfg).toBeNull();
  });

  it('TC05 – Owner saves bank details: direct bank transfer details activate cleanly', async () => {
    await hostelPaymentConfigService.upsertConfig(orgId, hostelAId, ownerAUserId, {
      beneficiaryName: 'Hostel Alpha Management',
      accountNumber: '918283746554',
      ifscCode: 'SBIN0001234',
      bankName: 'State Bank of India',
    });

    const cfg = await hostelPaymentConfigService.getByHostelId(orgId, hostelAId);
    expect(cfg?.bankConfig.accountNumber).toBe('918283746554');
    expect(cfg?.bankConfig.ifscCode).toBe('SBIN0001234');
    expect(cfg?.bankConfig.status).toBe('ACTIVE');
  });

  it('TC06 – Missing bank details: saving UPI without bank keeps bank status NOT_CONFIGURED', async () => {
    await hostelPaymentConfigService.upsertConfig(orgId, hostelBId, ownerBUserId, {
      vpaAddress: 'beta.hostel@paytm',
      displayName: 'Hostel Beta Payments',
    });

    const cfg = await hostelPaymentConfigService.getByHostelId(orgId, hostelBId);
    expect(cfg?.upiConfig.status).toBe('ACTIVE');
    expect(cfg?.bankConfig.status).toBe('NOT_CONFIGURED');
    expect(cfg?.bankConfig.accountNumber || '').toBe('');
  });

  // ===========================================================================
  // SECTION 2: DYNAMIC QR & MULTI-HOSTEL ISOLATION (TC07 - TC11)
  // ===========================================================================

  it('TC07 – Student from Hostel A receives Hostel A QR', async () => {
    const res = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentAId, 5000);
    expect(res.configured).toBe(true);
    expect(res.paymentDetails.upi?.vpaAddress).toBe('alpha.hostel@okaxis');
    expect(res.paymentDetails.upi?.intentUrl).toContain('pa=alpha.hostel%40okaxis');
  });

  it('TC08 – Student from Hostel B receives Hostel B QR', async () => {
    const res = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentBId, 6000);
    expect(res.configured).toBe(true);
    expect(res.paymentDetails.upi?.vpaAddress).toBe('beta.hostel@paytm');
    expect(res.paymentDetails.upi?.intentUrl).toContain('pa=beta.hostel%40paytm');
  });

  it('TC09 – Student cannot pay to another hostel: unassigned student is blocked', async () => {
    await expect(
      zeroGatewayPaymentService.createDynamicQRPayment(orgId, unassignedStudentId, 3000)
    ).rejects.toThrow('Student is not assigned to any hostel branch');
  });

  it('TC10 – Correct amount appears in QR/payment request', async () => {
    const requested = 4500;
    const res = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentAId, requested);
    expect(res.paymentDetails.amount).toBe(requested);
    expect(res.paymentDetails.expectedAmount).toBe(requested);
    expect(res.paymentDetails.upi?.intentUrl).toContain('am=4500');
  });

  it('TC11 – Amount cannot be manipulated: negative or zero amount rejected', async () => {
    await expect(
      zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentAId, -100)
    ).rejects.toThrow('Payment amount must be greater than ₹0');

    await expect(
      zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentAId, 0)
    ).rejects.toThrow();
  });

  // ===========================================================================
  // SECTION 3: ZERO-GATEWAY PAYMENT SUBMISSION & QUEUE (TC12 - TC15)
  // ===========================================================================

  it('TC12 – UPI payment submission: student submits self-reported UTR', async () => {
    const utr = 'UTR998877665544';
    const subRes = await zeroGatewayPaymentService.submitZeroGatewayPayment(orgId, {
      studentId: studentAId,
      amount: 5000,
      paymentMethod: 'UPI',
      transactionRef: utr,
      notes: 'Test Student Payment for Month 1',
    });

    expect(subRes.payment).toBeDefined();
    expect(subRes.payment.transactionRef).toBe(utr);
    submittedPaymentId = subRes.payment.id;
  });

  it('TC13 – UTR submission: payment record is saved in database with UTR', async () => {
    const row = await queryOne<any>(
      `SELECT * FROM payments WHERE id = $1 AND organization_id = $2`,
      [submittedPaymentId, orgId]
    );
    expect(row).not.toBeNull();
    expect(row.transaction_ref).toBe('UTR998877665544');
  });

  it('TC14 – UTR enters Pending Verification: status is UNDER_VERIFICATION and NO receipt is created', async () => {
    const row = await queryOne<any>(
      `SELECT status, receipt_number FROM payments WHERE id = $1`,
      [submittedPaymentId]
    );
    expect(row.status).toBe('UNDER_VERIFICATION');
    expect(row.receipt_number).toBeNull();

    // Check receipts table: no receipt should exist for this payment
    const receipt = await queryOne<any>(
      `SELECT * FROM receipts WHERE payment_id = $1`,
      [submittedPaymentId]
    );
    expect(receipt).toBeNull();
  });

  it('TC15 – Owner sees pending payment: item appears in getPendingVerifications queue', async () => {
    const queue = await zeroGatewayPaymentService.getPendingVerifications(orgId, hostelAId);
    expect(queue.items.length).toBeGreaterThanOrEqual(1);

    const match = queue.items.find((i: any) => i.id === submittedPaymentId);
    expect(match).toBeDefined();
    expect(match.studentName).toBe('Student Alpha');
    expect(Number(match.amount)).toBe(5000);
  });

  // ===========================================================================
  // SECTION 4: OWNER VERIFICATION & RECEIPTS (TC16 - TC21)
  // ===========================================================================

  it('TC16 – Owner verifies payment: status updates to VERIFIED and audit recorded', async () => {
    const verResult = await zeroGatewayPaymentService.verifyPaymentSubmission(
      orgId,
      submittedPaymentId,
      'Owner Alpha'
    );

    expect(verResult.success).toBe(true);
    expect(verResult.status).toBe('VERIFIED');
    expect(verResult.receiptNumber).toBeDefined();
    createdReceiptNumber = verResult.receiptNumber;
    verifiedPaymentId = submittedPaymentId;

    const row = await queryOne<any>(
      `SELECT status, verified_by, verified_at, receipt_number FROM payments WHERE id = $1`,
      [submittedPaymentId]
    );
    expect(row.status).toBe('VERIFIED');
    expect(row.verified_by).toBe('Owner Alpha');
    expect(row.verified_at).not.toBeNull();
    expect(row.receipt_number).toBe(createdReceiptNumber);
  });

  it('TC17 – Receipt created only after verification: official receipt exists in receipts table', async () => {
    const receipt = await queryOne<any>(
      `SELECT * FROM receipts WHERE payment_id = $1`,
      [verifiedPaymentId]
    );
    expect(receipt).not.toBeNull();
    expect(receipt.receipt_number).toBe(createdReceiptNumber);
    expect(Number(receipt.amount)).toBe(5000);
    expect(receipt.student_name).toBe('Student Alpha');
  });

  it('TC18 – Student sees verified receipt: receipt query by paymentId returns valid data', async () => {
    const receipt = await feeService.getReceiptByPaymentId(orgId, verifiedPaymentId);
    expect(receipt).not.toBeNull();
    expect(receipt.receiptNumber).toBe(createdReceiptNumber);
    expect(Number(receipt.amount)).toBe(5000);
  });

  it('TC19 – Owner rejects payment: payment status updates to REJECTED with rejection reason', async () => {
    // Submit a new payment to reject
    const subRes = await zeroGatewayPaymentService.submitZeroGatewayPayment(orgId, {
      studentId: studentCId,
      amount: 2000,
      paymentMethod: 'UPI',
      transactionRef: 'UTR_TO_REJECT_001',
      notes: 'Fake payment',
    });
    rejectedPaymentId = subRes.payment.id;

    const rejRes = await zeroGatewayPaymentService.rejectPaymentSubmission(
      orgId,
      rejectedPaymentId,
      'Bank statement shows no credit received for this UTR',
      'Owner Alpha'
    );

    expect(rejRes.success).toBe(true);
    expect(rejRes.status).toBe('REJECTED');
  });

  it('TC20 – Student sees rejected payment: payment record has REJECTED status and rejection reason', async () => {
    const row = await queryOne<any>(
      `SELECT status, rejection_reason, verified_by FROM payments WHERE id = $1`,
      [rejectedPaymentId]
    );
    expect(row.status).toBe('REJECTED');
    expect(row.rejection_reason).toBe('Bank statement shows no credit received for this UTR');
    expect(row.verified_by).toBe('Owner Alpha');
  });

  it('TC21 – Rejected payment does not create receipt and debt remains outstanding', async () => {
    const receipt = await queryOne<any>(
      `SELECT * FROM receipts WHERE payment_id = $1`,
      [rejectedPaymentId]
    );
    expect(receipt).toBeNull();

    // Student balance should not have been deducted
    const student = await queryOne<any>(`SELECT financial_outstanding_balance FROM students WHERE id = $1`, [studentCId]);
    expect(Number(student.financial_outstanding_balance)).toBe(8000);
  });

  // ===========================================================================
  // SECTION 5: SECURITY & DUPLICATE PROTECTION (TC22 - TC23, TC31 - TC32)
  // ===========================================================================

  it('TC22 – Duplicate UTR rejected: re-submitting same UTR throws 409 Conflict', async () => {
    await expect(
      zeroGatewayPaymentService.submitZeroGatewayPayment(orgId, {
        studentId: studentAId,
        amount: 3000,
        paymentMethod: 'UPI',
        transactionRef: 'UTR998877665544', // already used in TC12
      })
    ).rejects.toThrow('This transaction reference has already been submitted');
  });

  it('TC23 – Duplicate payment submission prevented: cannot verify an already verified payment', async () => {
    await expect(
      zeroGatewayPaymentService.verifyPaymentSubmission(orgId, verifiedPaymentId, 'Owner Alpha')
    ).rejects.toThrow('This payment has already been verified');
  });

  it('TC31 – Unauthorized owner cannot verify another hostel payment', async () => {
    // Create a payment for Hostel B
    const subB = await zeroGatewayPaymentService.submitZeroGatewayPayment(orgId, {
      studentId: studentBId,
      amount: 4000,
      paymentMethod: 'UPI',
      transactionRef: 'UTR_HOSTEL_B_001',
    });

    // Attempt to verify specifying Hostel A
    await expect(
      zeroGatewayPaymentService.verifyPaymentSubmission(
        orgId,
        subB.payment.id,
        'Owner Alpha',
        hostelAId // Wrong hostel
      )
    ).rejects.toThrow('This payment belongs to a different hostel branch and cannot be verified here');
  });

  it('TC32 – Student cannot access another student payment or receipt from other org', async () => {
    // Querying receipt with different orgId must return null/throw
    await expect(
      feeService.getReceiptByPaymentId(otherOrgId, verifiedPaymentId)
    ).rejects.toThrow();
  });

  // ===========================================================================
  // SECTION 6: GATEWAY PAYMENTS (CARDS & NET BANKING) (TC24 - TC30)
  // ===========================================================================

  it('TC26 – Debit card flow: rejected with 400 when gateway is unconfigured', async () => {
    // OtherOrg has no gateway configured
    await expect(
      feeService.initiatePayment(otherOrgId, studentAId, {
        amount: 2000,
        paymentMethod: 'DEBIT_CARD' as any,
      })
    ).rejects.toThrow();
  });

  it('TC27 – Credit card flow: rejected with 400 when gateway is unconfigured', async () => {
    await expect(
      feeService.initiatePayment(otherOrgId, studentAId, {
        amount: 2000,
        paymentMethod: 'CREDIT_CARD' as any,
      })
    ).rejects.toThrow();
  });

  it('TC28 – Net banking flow: rejected with 400 when gateway is unconfigured', async () => {
    await expect(
      feeService.initiatePayment(otherOrgId, studentAId, {
        amount: 2000,
        paymentMethod: 'NET_BANKING' as any,
      })
    ).rejects.toThrow();
  });

  it('TC24 – Gateway card success: verified with valid HMAC signature', async () => {
    // Setup gateway credentials for orgId
    await query(
      `INSERT INTO payment_gateway_configs (id, organization_id, provider, environment, key_id, key_secret, webhook_secret, onboarding_status)
       VALUES ($1, $2, 'RAZORPAY', 'TEST', 'rzp_test_tc24_key', 'sec_tc24_secret_key', 'whsec_tc24', 'CONNECTED')
       ON CONFLICT (organization_id) DO UPDATE SET key_id = EXCLUDED.key_id, key_secret = EXCLUDED.key_secret, onboarding_status = 'CONNECTED'`,
      ['gw_tc_test', orgId]
    );

    const order = await feeService.initiatePayment(orgId, studentAId, {
      amount: 1000,
      paymentMethod: PaymentMethod.ONLINE,
    });

    expect(order.gatewayOrderId).toBeDefined();

    // Verify with sandbox test signature
    const confirmRes = await feeService.verifyAndConfirmPayment(orgId, {
      paymentId: order.paymentId,
      gatewayOrderId: order.gatewayOrderId,
      gatewayPaymentId: 'pay_tc24_success_id',
      gatewaySignature: 'SANDBOX_VERIFIED_SIGNATURE',
    });

    expect(confirmRes.payment.status).toBe('SUCCESS');
    expect(confirmRes.receipt).toBeDefined();
    expect(confirmRes.receipt.receiptNumber).toBeDefined();
  });

  it('TC25 – Gateway card failure: invalid HMAC signature rejected', async () => {
    const order = await feeService.initiatePayment(orgId, studentAId, {
      amount: 1000,
      paymentMethod: PaymentMethod.ONLINE,
    });

    await expect(
      feeService.verifyAndConfirmPayment(orgId, {
        paymentId: order.paymentId,
        gatewayOrderId: order.gatewayOrderId,
        gatewayPaymentId: 'pay_tc25_invalid',
        gatewaySignature: 'FORGED_INVALID_SIGNATURE_999',
      })
    ).rejects.toThrow('Payment verification failed: Invalid cryptographic signature');
  });

  it('TC29 – Gateway callback/webhook handling: idempotency prevents duplicate capture', async () => {
    const order = await feeService.initiatePayment(orgId, studentBId, {
      amount: 1500,
      paymentMethod: PaymentMethod.ONLINE,
    });

    const eventId = 'evt_webhook_test_001';
    const rawPayload = JSON.stringify({
      id: eventId,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_webhook_entity_001',
            order_id: order.gatewayOrderId,
            amount: 150000,
            status: 'captured',
            notes: { organizationId: orgId },
          },
        },
      },
    });

    // Process webhook with test signature
    const res1 = await feeService.processWebhookPayment(rawPayload, 'SANDBOX_VERIFIED_SIGNATURE', JSON.parse(rawPayload));
    expect(res1).toBeDefined();

    // Secondary webhook replay with same eventId -> handled idempotently
    const res2 = await feeService.processWebhookPayment(rawPayload, 'SANDBOX_VERIFIED_SIGNATURE', JSON.parse(rawPayload));
    expect(res2.message).toContain('already processed (Idempotent)');
  });

  it('TC30 – Invalid gateway webhook response: bad signature rejected', async () => {
    const rawPayload = JSON.stringify({ id: 'evt_invalid_002', event: 'payment.captured' });
    await expect(
      feeService.processWebhookPayment(rawPayload, 'INVALID_SIGNATURE_HEADER', JSON.parse(rawPayload))
    ).rejects.toThrow('Webhook signature verification failed');
  });

  // ===========================================================================
  // SECTION 7: API & FINANCIAL INTEGRITY (TC33 - TC40)
  // ===========================================================================

  it('TC33 – Backend 404 route test: non-existent payment route returns 404', async () => {
    const res = await request(app).get('/api/payments-unknown-route-404-check');
    expect(res.status).toBe(404);
  });

  it('TC34 – Frontend/backend request compatibility: /fees/student/payment-initiation responds', async () => {
    const res = await zeroGatewayPaymentService.getStudentHostelPaymentInfo(orgId, studentAId, 2500);
    expect(res).toBeDefined();
    expect(res.availablePaymentMethods).toBeDefined();
    expect(res.student.hostelName).toBe('Hostel Alpha');
  });

  it('TC35 – Receipt amount matches actual payment: exact numeric equality', async () => {
    const receipt = await queryOne<any>(
      `SELECT amount FROM receipts WHERE receipt_number = $1`,
      [createdReceiptNumber]
    );
    expect(Number(receipt.amount)).toBe(5000);
  });

  it('TC36 – Hostel ledger updates correctly: payment credit row inserted in fee_ledgers', async () => {
    const ledger = await queryOne<any>(
      `SELECT * FROM fee_ledgers WHERE reference_number = $1 AND organization_id = $2`,
      [createdReceiptNumber, orgId]
    );
    expect(ledger).not.toBeNull();
    expect(ledger.transaction_type).toBe('PAYMENT_CREDIT');
    expect(Number(ledger.amount)).toBe(5000);
  });

  it('TC37 – Student outstanding balance updates correctly: debt reduced by paid amount', async () => {
    const student = await queryOne<any>(
      `SELECT financial_total_paid, financial_outstanding_balance FROM students WHERE id = $1`,
      [studentAId]
    );
    // 5000 was verified in TC16, 1000 in TC24
    expect(Number(student.financial_total_paid)).toBe(6000);
    expect(Number(student.financial_outstanding_balance)).toBe(4000);
  });

  it('TC38 – Refresh does not duplicate receipt: idempotent receipt retrieval', async () => {
    const r1 = await feeService.getReceiptByPaymentId(orgId, verifiedPaymentId);
    const r2 = await feeService.getReceiptByPaymentId(orgId, verifiedPaymentId);
    expect(r1.receiptNumber).toBe(r2.receiptNumber);

    const count = await queryOne<any>(
      `SELECT COUNT(*)::int as c FROM receipts WHERE payment_id = $1`,
      [verifiedPaymentId]
    );
    expect(count.c).toBe(1);
  });

  it('TC39 – Payment retry works correctly: rejected UTR allows new submission with different UTR', async () => {
    const retryRes = await zeroGatewayPaymentService.submitZeroGatewayPayment(orgId, {
      studentId: studentCId,
      amount: 2000,
      paymentMethod: 'UPI',
      transactionRef: 'UTR_RETRY_VALID_002',
      notes: 'Valid retry payment',
    });

    expect(retryRes.payment).toBeDefined();
    expect(retryRes.payment.status).toBe('UNDER_VERIFICATION');
    expect(retryRes.payment.transactionRef).toBe('UTR_RETRY_VALID_002');
  });

  it('TC40 – Missing payment configuration gives a clear user-facing error', async () => {
    // Create a new hostel with no payment config
    const brandNewHostel = await hostelService.create(orgId, {
      name: 'Brand New Hostel Unconfigured',
      hostelName: 'Brand New Hostel Unconfigured',
      branchName: 'Branch 3',
      city: 'Hyderabad',
      address: 'Kondapur',
      contactPhone: '+91 9848033333',
    });

    const studentNew = 'stu_new_005';
    await query(
      `INSERT INTO students (
        id, student_id, customer_code, organization_id, hostel_id, full_name, email,
        phone, gender, admission_date, financial_total_demanded, financial_total_paid,
        financial_outstanding_balance, portal_access, status
      ) VALUES ($1, 'STU-N-05', 'CUST-N-05', $2, $3, 'Student New', 'new@test.com',
                '+91 9999900005', 'MALE', CURRENT_TIMESTAMP, 5000, 0, 5000, true, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [studentNew, orgId, brandNewHostel.id]
    );

    const initRes = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentNew, 2000);
    expect(initRes.configured).toBe(false);
    expect(initRes.message).toContain('Payment configuration not completed');
    expect(initRes.paymentDetails.upi).toBeNull();
    expect(initRes.paymentDetails.bank).toBeNull();

    await expect(
      zeroGatewayPaymentService.submitZeroGatewayPayment(orgId, {
        studentId: studentNew,
        amount: 2000,
        paymentMethod: 'UPI',
        transactionRef: 'UTR_NEW_HOSTEL_FAIL',
      })
    ).rejects.toThrow('Payment configuration not completed');
  });
});
