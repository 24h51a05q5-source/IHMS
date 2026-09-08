import { connectDatabase, disconnectDatabase, query } from '../src/config/database';
import { hostelPaymentConfigService } from '../src/modules/hostels/hostel-payment-config.service';

describe('IHMS Payment Settings UPI ID Validation & Save Flow', () => {
  const orgId = 'test_org_payment_settings_2026';
  const hostelId = 'hostel_payment_test_1';
  const ownerId = 'owner_payment_test_1';

  beforeAll(async () => {
    await connectDatabase();

    await query(
      `INSERT INTO organizations (id, org_code, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [orgId, 'ORG_PAY_SETTINGS', 'Payment Settings Test Org']
    );

    await query(
      `INSERT INTO hostels (id, hostel_id, owner_id, organization_id, hostel_name, name)
       VALUES ($1, $1, $2, $3, $4, $4) ON CONFLICT DO NOTHING`,
      [hostelId, ownerId, orgId, 'Sri Residency Test Hostel']
    );
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('1. should throw "UPI ID / VPA is required." when UPI ID is empty or whitespace only', async () => {
    await expect(
      hostelPaymentConfigService.initiateVerification(orgId, hostelId, ownerId, 'UPI', {
        vpaAddress: '',
      })
    ).rejects.toThrow('UPI ID / VPA is required.');

    await expect(
      hostelPaymentConfigService.initiateVerification(orgId, hostelId, ownerId, 'UPI', {
        vpaAddress: '   ',
      })
    ).rejects.toThrow('UPI ID / VPA is required.');

    await expect(
      hostelPaymentConfigService.initiateVerification(orgId, hostelId, ownerId, 'UPI', {
        upiConfig: { vpaAddress: '  ' },
      })
    ).rejects.toThrow('UPI ID / VPA is required.');
  });

  it('2. should reject invalid UPI ID format', async () => {
    await expect(
      hostelPaymentConfigService.initiateVerification(orgId, hostelId, ownerId, 'UPI', {
        vpaAddress: 'invalid-vpa-without-at',
      })
    ).rejects.toThrow(/Invalid UPI ID format/);
  });

  it('3. should successfully accept flat vpaAddress and trim leading/trailing spaces', async () => {
    const rawVpa = '  srihostel@upi  ';
    const res = await hostelPaymentConfigService.initiateVerification(orgId, hostelId, ownerId, 'UPI', {
      vpaAddress: rawVpa,
      displayName: 'Sri Residency',
    });

    expect(res).toBeDefined();
    expect(res.upiConfig.pendingVpaAddress).toBe('srihostel@upi');
  });

  it('4. should confirm and activate the pending UPI configuration', async () => {
    const activated = await hostelPaymentConfigService.confirmAndActivate(orgId, hostelId, ownerId, 'UPI');

    expect(activated).toBeDefined();
    expect(activated.upiConfig.status).toBe('ACTIVE');
    expect(activated.upiConfig.vpaAddress).toBe('srihostel@upi');
    expect(activated.upiConfig.pendingVpaAddress).toBeUndefined();
  });

  it('5. should reload saved UPI ID in both flat upi_vpa and nested upiConfig formats when reopened', async () => {
    const loaded = await hostelPaymentConfigService.getByHostelId(orgId, hostelId);

    expect(loaded).not.toBeNull();
    // Flat property for frontend settings page
    expect(loaded!.upi_vpa).toBe('srihostel@upi');
    // Nested property for payment gateway / dynamic QR checkout
    expect(loaded!.upiConfig.vpaAddress).toBe('srihostel@upi');
    expect(loaded!.upiConfig.status).toBe('ACTIVE');
  });

  it('6. should also support nested upiConfig format seamlessly', async () => {
    const nestedRes = await hostelPaymentConfigService.initiateVerification(orgId, hostelId, ownerId, 'UPI', {
      upiConfig: {
        vpaAddress: '  hostelalpha@okhdfcbank  ',
        displayName: 'Hostel Alpha',
      },
    });

    expect(nestedRes.upiConfig.pendingVpaAddress).toBe('hostelalpha@okhdfcbank');

    const confirmed = await hostelPaymentConfigService.confirmAndActivate(orgId, hostelId, ownerId, 'UPI');
    expect(confirmed.upiConfig.vpaAddress).toBe('hostelalpha@okhdfcbank');
    expect(confirmed.upi_vpa).toBe('hostelalpha@okhdfcbank');
  });

  it('7. should preserve Direct Bank Transfer Settlement functionality', async () => {
    const bankRes = await hostelPaymentConfigService.initiateVerification(orgId, hostelId, ownerId, 'BANK', {
      beneficiaryName: 'Sri Residency Pvt Ltd',
      accountNumber: '123456789012',
      confirmAccountNumber: '123456789012',
      ifscCode: 'SBIN0001234',
      bankName: 'State Bank of India',
    });

    expect(bankRes).toBeDefined();

    const bankConfirmed = await hostelPaymentConfigService.confirmAndActivate(orgId, hostelId, ownerId, 'BANK');
    expect(bankConfirmed.bankConfig.status).toBe('ACTIVE');
    expect(bankConfirmed.bankConfig.accountNumber).toBe('123456789012');
    expect(bankConfirmed.bank_account_number).toBe('123456789012');
    expect(bankConfirmed.bank_ifsc_code).toBe('SBIN0001234');
  });
});
