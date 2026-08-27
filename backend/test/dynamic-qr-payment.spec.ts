import crypto from 'crypto';
import { connectDatabase, disconnectDatabase, query } from '../src/config/database';
import { zeroGatewayPaymentService } from '../src/modules/fees/zero-gateway-payment.service';
import { feeService } from '../src/modules/fees/fee.service';
import { hostelPaymentConfigService } from '../src/modules/hostels/hostel-payment-config.service';
import { PaymentProviderFactory } from '../src/modules/fees/provider-factory';

describe('IHMS Dynamic UPI QR Payment & Webhook Verification Architecture', () => {
  const orgId = 'test_org_dynamic_qr_2026';
  const hostelAId = 'hostel_a_branch_1';
  const hostelBId = 'hostel_b_branch_2';
  const ownerAId = 'owner_a_user_1';
  const ownerBId = 'owner_b_user_2';

  const studentAId = 'student_a_id_1';
  const studentBId = 'student_b_id_2';

  beforeAll(async () => {
    process.env.PAYMENT_PROVIDER = 'mock';
    process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET = 'test_whsec_ihms_2026';
    await connectDatabase();

    // Seed test organization
    await query(
      `INSERT INTO organizations (id, org_code, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [orgId, 'ORG_DYNAMIC_QR', 'Dynamic QR Test Org']
    );

    // Seed Hostels
    await query(
      `INSERT INTO hostels (id, hostel_id, owner_id, organization_id, hostel_name, name)
       VALUES ($1, $1, $2, $3, $4, $4) ON CONFLICT DO NOTHING`,
      [hostelAId, ownerAId, orgId, 'Hostel Alpha']
    );
    await query(
      `INSERT INTO hostels (id, hostel_id, owner_id, organization_id, hostel_name, name)
       VALUES ($1, $1, $2, $3, $4, $4) ON CONFLICT DO NOTHING`,
      [hostelBId, ownerBId, orgId, 'Hostel Beta']
    );

    // Configure Payment Destinations (Hostel A -> VPA A, Hostel B -> VPA B)
    await hostelPaymentConfigService.upsertConfig(orgId, hostelAId, ownerAId, {
      method: 'UPI',
      upiConfig: { vpaAddress: 'hostelalpha@upi', displayName: 'Hostel Alpha Settlements' },
    });
    await hostelPaymentConfigService.confirmAndActivate(orgId, hostelAId, ownerAId, 'UPI');

    await hostelPaymentConfigService.upsertConfig(orgId, hostelBId, ownerBId, {
      method: 'UPI',
      upiConfig: { vpaAddress: 'hostelbeta@upi', displayName: 'Hostel Beta Settlements' },
    });
    await hostelPaymentConfigService.confirmAndActivate(orgId, hostelBId, ownerBId, 'UPI');

    // Seed Students
    await query(
      `INSERT INTO students (id, student_id, customer_code, organization_id, hostel_id, full_name, email, financial_total_demanded, financial_total_paid, financial_outstanding_balance)
       VALUES ($1, $1, 'STU-ALPHA', $2, $3, 'Student Alpha', 'alpha@test.com', 5000.00, 0.00, 5000.00)
       ON CONFLICT DO NOTHING`,
      [studentAId, orgId, hostelAId]
    );

    await query(
      `INSERT INTO students (id, student_id, customer_code, organization_id, hostel_id, full_name, email, financial_total_demanded, financial_total_paid, financial_outstanding_balance)
       VALUES ($1, $1, 'STU-BETA', $2, $3, 'Student Beta', 'beta@test.com', 8000.00, 0.00, 8000.00)
       ON CONFLICT DO NOTHING`,
      [studentBId, orgId, hostelBId]
    );
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  test('Scenario A & B — Hostel Payment Destination Isolation (No cross-hostel leakage)', async () => {
    const pmtA = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentAId);
    expect(pmtA.configured).toBe(true);
    expect(pmtA.paymentDetails.upi?.vpaAddress).toBe('hostelalpha@upi');
    expect(pmtA.paymentDetails.amount).toBe(5000);

    const pmtB = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentBId);
    expect(pmtB.configured).toBe(true);
    expect(pmtB.paymentDetails.upi?.vpaAddress).toBe('hostelbeta@upi');
    expect(pmtB.paymentDetails.amount).toBe(8000);
  });

  test('Scenario E — Reject Invalid Webhook Signature', async () => {
    const invalidSignature = 'invalid_hmac_sha256_signature_string';
    const payload = {
      event: 'payment.captured',
      amount: 5000,
      paymentNumber: 'IHMS-PAY-FAKE-123',
    };

    await expect(
      feeService.processWebhookPayment(JSON.stringify(payload), invalidSignature, payload)
    ).rejects.toThrow('Webhook signature verification failed');
  });

  test('Scenario C — Webhook Confirmation with Exact Amount creates Ledger & Receipt', async () => {
    const pmt = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentAId, 5000);
    const pmtNo = pmt.paymentNumber!;

    const eventPayload = {
      id: `evt_test_${Date.now()}`,
      event: 'payment.captured',
      ihmsPaymentId: pmtNo,
      amount: 5000,
      utr: `UTR_EXACT_${Date.now()}`,
      organizationId: orgId,
    };

    const rawBody = JSON.stringify(eventPayload);
    const validSignature = crypto
      .createHmac('sha256', process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET || 'test_whsec_ihms_2026')
      .update(rawBody)
      .digest('hex');

    const result = (await feeService.processWebhookPayment(rawBody, validSignature, eventPayload)) as any;
    if (!result.success) console.log('DEBUG SCENARIO C RESULT:', result);
    expect(result.success).toBe(true);
    expect(result.status).toBe('SUCCESS');
    expect(result.receiptNumber).toBeDefined();

    // Verify payment record in database
    const statusData = await zeroGatewayPaymentService.checkDynamicPaymentStatus(orgId, pmtNo);
    expect(statusData.isSuccess).toBe(true);
    expect(statusData.status).toBe('SUCCESS');
    expect(statusData.receiptNumber).toBe(result.receiptNumber);
  });

  test('Scenario F — Duplicate Webhook Event is Idempotent', async () => {
    const pmt = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentAId, 5000);
    const pmtNo = pmt.paymentNumber!;

    const eventId = `evt_idempotent_${Date.now()}`;
    const eventPayload = {
      id: eventId,
      event: 'payment.captured',
      ihmsPaymentId: pmtNo,
      amount: 5000,
      utr: `UTR_IDEM_${Date.now()}`,
      organizationId: orgId,
    };

    const rawBody = JSON.stringify(eventPayload);
    const validSignature = crypto
      .createHmac('sha256', process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET || 'test_whsec_ihms_2026')
      .update(rawBody)
      .digest('hex');

    // First Webhook Call
    const res1 = (await feeService.processWebhookPayment(rawBody, validSignature, eventPayload)) as any;
    expect(res1.success).toBe(true);

    // Second Duplicate Webhook Call with same eventId
    const res2 = (await feeService.processWebhookPayment(rawBody, validSignature, eventPayload)) as any;
    expect(res2.success).toBe(true);
    expect(res2.message).toContain('Idempotent');
  });

  test('Scenario D — Wrong / Partial Amount received flags AMOUNT_MISMATCH', async () => {
    const pmt = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentBId, 8000);
    const pmtNo = pmt.paymentNumber!;

    const eventPayload = {
      id: `evt_mismatch_${Date.now()}`,
      event: 'payment.captured',
      ihmsPaymentId: pmtNo,
      amount: 500, // Expected 8000, received 500
      utr: `UTR_MISMATCH_${Date.now()}`,
      organizationId: orgId,
    };

    const rawBody = JSON.stringify(eventPayload);
    const validSignature = crypto
      .createHmac('sha256', process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET || 'test_whsec_ihms_2026')
      .update(rawBody)
      .digest('hex');

    const result = (await feeService.processWebhookPayment(rawBody, validSignature, eventPayload)) as any;
    expect(result.success).toBe(false);
    expect(result.status).toBe('AMOUNT_MISMATCH');

    const statusData = await zeroGatewayPaymentService.checkDynamicPaymentStatus(orgId, pmtNo);
    expect(statusData.status).toBe('AMOUNT_MISMATCH');
    expect(statusData.isSuccess).toBe(false);
  });

  test('Scenario G — Duplicate Transaction Reference (UTR) is blocked', async () => {
    const pmt1 = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentAId, 1000);
    const pmt2 = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentBId, 1000);

    const reusedUtr = `REUSED_UTR_${Date.now()}`;

    // Process payment 1 with UTR
    const payload1 = {
      id: `evt_utr1_${Date.now()}`,
      event: 'payment.captured',
      ihmsPaymentId: pmt1.paymentNumber!,
      amount: 1000,
      utr: reusedUtr,
      organizationId: orgId,
    };
    const rawBody1 = JSON.stringify(payload1);
    const sig1 = crypto
      .createHmac('sha256', process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET || 'test_whsec_ihms_2026')
      .update(rawBody1)
      .digest('hex');
    await feeService.processWebhookPayment(rawBody1, sig1, payload1);

    // Attempt to process payment 2 with the SAME UTR
    const payload2 = {
      id: `evt_utr2_${Date.now()}`,
      event: 'payment.captured',
      ihmsPaymentId: pmt2.paymentNumber!,
      amount: 1000,
      utr: reusedUtr,
      organizationId: orgId,
    };
    const rawBody2 = JSON.stringify(payload2);
    const sig2 = crypto
      .createHmac('sha256', process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET || 'test_whsec_ihms_2026')
      .update(rawBody2)
      .digest('hex');

    const result2 = (await feeService.processWebhookPayment(rawBody2, sig2, payload2)) as any;
    expect(result2.success).toBe(false);
    expect(result2.status).toBe('DUPLICATE');
  });

  test('Scenario H — QR Expiry status transition', async () => {
    const pmt = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentAId, 2000);
    const pmtNo = pmt.paymentNumber!;

    // Artificially set expires_at in the past
    await query(`UPDATE payments SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE payment_number = $1`, [pmtNo]);

    const statusData = await zeroGatewayPaymentService.checkDynamicPaymentStatus(orgId, pmtNo);
    expect(statusData.isExpired).toBe(true);
    expect(statusData.status).toBe('EXPIRED');
  });
});
