import { connectDatabase, disconnectDatabase, query, queryOne } from '../src/config/database';
import { hostelService } from '../src/modules/hostels/hostel.service';
import { hostelPaymentConfigService } from '../src/modules/hostels/hostel-payment-config.service';
import { zeroGatewayPaymentService } from '../src/modules/fees/zero-gateway-payment.service';

describe('Real-World Payment System — 10 Production Scenarios', () => {
  const orgId = 'org_real_world_pmt_test';
  const ownerUserId = 'user_owner_real_world_test';
  let hostelAId: string;
  let hostelBId: string;
  let studentAId: string;
  let studentBId: string;

  beforeAll(async () => {
    await connectDatabase();

    // Create organization and owner
    await query(
      `INSERT INTO organizations (id, org_code, name, email) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [orgId, 'ORG_REAL_PMT', 'Real World Payment Org', 'owner@realworldpmt.com']
    );

    await query(
      `INSERT INTO users (id, user_id, organization_id, email, password_hash, role, name, status)
       VALUES ($1, $1, $2, 'owner@realworldpmt.com', 'hash', 'ORGANIZATION_OWNER', 'Real Owner', 'ACTIVE') ON CONFLICT DO NOTHING`,
      [ownerUserId, orgId]
    );
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 1: New hostel is created
  // ---------------------------------------------------------------------------
  it('Scenario 1: Creating a new hostel does NOT insert fake or default payment configuration', async () => {
    const branchA = await hostelService.create(orgId, {
      name: 'Hostel Alpha',
      hostelName: 'Hostel Alpha',
      branchName: 'Alpha Branch',
      city: 'Hyderabad',
      address: 'Madhapur',
      contactPhone: '+91 9848011111',
    });
    hostelAId = branchA.id;

    // Check payment table: NO row should have been created with fake defaults
    const rawConfig = await queryOne<any>(
      `SELECT * FROM hostel_payment_configs WHERE organization_id = $1 AND hostel_id = $2`,
      [orgId, hostelAId]
    );

    expect(rawConfig).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 2: New hostel has no payment configuration
  // ---------------------------------------------------------------------------
  it('Scenario 2: New hostel query returns null and does NOT return or auto-generate default values', async () => {
    const config = await hostelPaymentConfigService.getByHostelId(orgId, hostelAId);

    expect(config).toBeNull();

    // Confirm that no default record was secretly inserted
    const count = await queryOne<any>(
      `SELECT COUNT(*)::int as c FROM hostel_payment_configs WHERE organization_id = $1 AND hostel_id = $2`,
      [orgId, hostelAId]
    );
    expect(count.c).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 8: Student attempts payment before configuration
  // ---------------------------------------------------------------------------
  it('Scenario 8: Student attempts payment before configuration -> clearly prevented, no fake QR, no fake UPI', async () => {
    studentAId = require('crypto').randomUUID();
    await query(
      `INSERT INTO students (
        id, student_id, customer_code, organization_id, hostel_id, full_name, email,
        phone, gender, admission_date, financial_total_demanded, financial_total_paid,
        financial_outstanding_balance, portal_access, status
      ) VALUES ($1, 'STU-A-001', 'STU-A-001', $2, $3, 'Student Alpha', 'studenta@test.com',
                '+91 9999900001', 'MALE', CURRENT_TIMESTAMP, 10000, 0, 10000, true, 'ACTIVE')`,
      [studentAId, orgId, hostelAId]
    );

    // Call dynamic QR generation
    const qrResult = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentAId, 5000);

    // Must be configured = false
    expect(qrResult.configured).toBe(false);
    expect(qrResult.paymentDetails.upi).toBeNull();
    expect(qrResult.paymentDetails.bank).toBeNull();
    expect(qrResult.message).toContain('Payment configuration not completed');

    // Attempting to submit UTR before configuration must fail
    await expect(
      zeroGatewayPaymentService.submitZeroGatewayPayment(orgId, {
        studentId: studentAId,
        amount: 5000,
        paymentMethod: 'UPI',
        transactionRef: 'UTR123456789012',
      })
    ).rejects.toThrow('Payment configuration not completed');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Owner enters a UPI ID
  // ---------------------------------------------------------------------------
  it('Scenario 3: Owner enters a valid real-world UPI ID -> saved and activated against that hostel', async () => {
    const realUpi = 'srihostel.owner@ybl';

    await hostelPaymentConfigService.upsertConfig(orgId, hostelAId, ownerUserId, {
      vpaAddress: realUpi,
      displayName: 'Hostel Alpha Official',
    });

    const activeConfig = await hostelPaymentConfigService.getByHostelId(orgId, hostelAId);

    expect(activeConfig).not.toBeNull();
    expect(activeConfig?.upiConfig.vpaAddress).toBe(realUpi);
    expect(activeConfig?.upiConfig.status).toBe('ACTIVE');
    expect(activeConfig?.upi_vpa).toBe(realUpi);
    expect(activeConfig?.bankConfig.status).toBe('NOT_CONFIGURED');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Owner leaves bank details empty
  // ---------------------------------------------------------------------------
  it('Scenario 7: Owner leaves bank details empty -> UPI is active without requiring bank details', async () => {
    const config = await hostelPaymentConfigService.getByHostelId(orgId, hostelAId);

    expect(config?.upiConfig.status).toBe('ACTIVE');
    expect(config?.bankConfig.accountNumber || '').toBe('');
    expect(config?.bankConfig.status).toBe('NOT_CONFIGURED');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Owner changes the UPI ID
  // ---------------------------------------------------------------------------
  it('Scenario 4: Owner changes the UPI ID -> updates cleanly to new UPI without lockout', async () => {
    const newUpi = 'srihostel.updated@okaxis';

    await hostelPaymentConfigService.upsertConfig(orgId, hostelAId, ownerUserId, {
      vpaAddress: newUpi,
      displayName: 'Hostel Alpha Updated',
    });

    const updatedConfig = await hostelPaymentConfigService.getByHostelId(orgId, hostelAId);

    expect(updatedConfig?.upiConfig.vpaAddress).toBe(newUpi);
    expect(updatedConfig?.upiConfig.status).toBe('ACTIVE');
    expect(updatedConfig?.upiConfig.displayName).toBe('Hostel Alpha Updated');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 6: Owner enters bank details
  // ---------------------------------------------------------------------------
  it('Scenario 6: Owner enters bank details -> validates and activates bank account', async () => {
    await hostelPaymentConfigService.upsertConfig(orgId, hostelAId, ownerUserId, {
      vpaAddress: 'srihostel.updated@okaxis',
      displayName: 'Hostel Alpha Updated',
      bankConfig: {
        beneficiaryName: 'Hostel Alpha Enterprises',
        accountNumber: '918273645019',
        confirmAccountNumber: '918273645019',
        ifscCode: 'SBIN0001234',
        bankName: 'State Bank of India',
      },
    });

    const config = await hostelPaymentConfigService.getByHostelId(orgId, hostelAId);

    expect(config?.bankConfig.status).toBe('ACTIVE');
    expect(config?.bankConfig.accountNumber).toBe('918273645019');
    expect(config?.bankConfig.ifscCode).toBe('SBIN0001234');
    expect(config?.bankConfig.beneficiaryName).toBe('Hostel Alpha Enterprises');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Owner removes/updates payment details (e.g. clears bank)
  // ---------------------------------------------------------------------------
  it('Scenario 5: Owner removes bank details -> bank account is cleared and NOT_CONFIGURED while UPI remains ACTIVE', async () => {
    await hostelPaymentConfigService.upsertConfig(orgId, hostelAId, ownerUserId, {
      vpaAddress: 'srihostel.updated@okaxis',
      clearBank: true,
      bankConfig: null,
    } as any);

    const config = await hostelPaymentConfigService.getByHostelId(orgId, hostelAId);

    expect(config?.upiConfig.status).toBe('ACTIVE');
    expect(config?.upiConfig.vpaAddress).toBe('srihostel.updated@okaxis');
    expect(config?.bankConfig.status).toBe('NOT_CONFIGURED');
    expect(config?.bankConfig.accountNumber || '').toBe('');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 9: Student attempts payment after configuration
  // ---------------------------------------------------------------------------
  it('Scenario 9: Student attempts payment after configuration -> dynamic QR uses hostel exact UPI, UTR submission succeeds', async () => {
    const qrResult = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentAId, 2500);

    expect(qrResult.configured).toBe(true);
    expect(qrResult.paymentDetails.upi).not.toBeNull();
    expect(qrResult.paymentDetails.upi?.vpaAddress).toBe('srihostel.updated@okaxis');
    expect(qrResult.paymentDetails.upi?.intentUrl).toContain('pa=srihostel.updated%40okaxis');
    expect(qrResult.paymentDetails.upi?.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    // Student submits UTR
    const submission = await zeroGatewayPaymentService.submitZeroGatewayPayment(orgId, {
      studentId: studentAId,
      amount: 2500,
      paymentMethod: 'UPI',
      transactionRef: 'UTR998877665544',
    });

    expect(submission.payment).toBeDefined();
    expect(submission.payment.status).toBe('UNDER_VERIFICATION');
    expect(submission.payment.transactionRef).toBe('UTR998877665544');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 10: Multiple hostels have different UPI IDs (Strict Multi-Hostel Isolation)
  // ---------------------------------------------------------------------------
  it('Scenario 10: Multiple hostels have different UPI IDs -> strict isolation, no cross-branch fallback or leaking', async () => {
    // Create Hostel B in same organization
    const branchB = await hostelService.create(orgId, {
      name: 'Hostel Beta',
      hostelName: 'Hostel Beta',
      branchName: 'Beta Branch',
      city: 'Secunderabad',
      address: 'Clock Tower',
      contactPhone: '+91 9848022222',
    });
    hostelBId = branchB.id;

    // Create Student in Hostel B
    studentBId = require('crypto').randomUUID();
    await query(
      `INSERT INTO students (
        id, student_id, customer_code, organization_id, hostel_id, full_name, email,
        phone, gender, admission_date, financial_total_demanded, financial_total_paid,
        financial_outstanding_balance, portal_access, status
      ) VALUES ($1, 'STU-B-001', 'STU-B-001', $2, $3, 'Student Beta', 'studentb@test.com',
                '+91 9999900002', 'FEMALE', CURRENT_TIMESTAMP, 12000, 0, 12000, true, 'ACTIVE')`,
      [studentBId, orgId, hostelBId]
    );

    // 10a. Before Hostel B is configured, it must NOT inherit Hostel A's UPI ID!
    const unconfiguredB = await hostelPaymentConfigService.getByHostelId(orgId, hostelBId);
    expect(unconfiguredB).toBeNull();

    const studentBBefore = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentBId, 3000);
    expect(studentBBefore.configured).toBe(false);
    expect(studentBBefore.paymentDetails.upi).toBeNull();

    // 10b. Configure Hostel B with completely different UPI ID
    const upiB = 'hostelbeta.settle@paytm';
    await hostelPaymentConfigService.upsertConfig(orgId, hostelBId, ownerUserId, {
      vpaAddress: upiB,
      displayName: 'Hostel Beta Official',
    });

    // 10c. Verify Hostel A and Hostel B configurations remain strictly isolated
    const configA = await hostelPaymentConfigService.getByHostelId(orgId, hostelAId);
    const configB = await hostelPaymentConfigService.getByHostelId(orgId, hostelBId);

    expect(configA?.upiConfig.vpaAddress).toBe('srihostel.updated@okaxis');
    expect(configB?.upiConfig.vpaAddress).toBe('hostelbeta.settle@paytm');

    // 10d. Verify Student A gets Hostel A QR, Student B gets Hostel B QR
    const studentAPayment = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentAId, 1000);
    const studentBPayment = await zeroGatewayPaymentService.createDynamicQRPayment(orgId, studentBId, 1000);

    expect(studentAPayment.paymentDetails.upi?.vpaAddress).toBe('srihostel.updated@okaxis');
    expect(studentBPayment.paymentDetails.upi?.vpaAddress).toBe('hostelbeta.settle@paytm');

    expect(studentAPayment.paymentDetails.upi?.intentUrl).toContain('pa=srihostel.updated%40okaxis');
    expect(studentBPayment.paymentDetails.upi?.intentUrl).toContain('pa=hostelbeta.settle%40paytm');
  });
});
