import crypto from 'crypto';
import request from 'supertest';
import express, { Application } from 'express';
import { connectDatabase, disconnectDatabase, query, queryOne } from '../src/config/database';
import { cashfreeService } from '../src/modules/fees/cashfree.service';
import { feeRouter } from '../src/modules/fees/fee.controller';
import { errorHandler } from '../src/common/filters/http-exception.filter';

describe('Cashfree Multi-Tenant Dynamic UPI QR System Integration Test', () => {
  let app: Application;
  const orgId = 'test_org_cashfree_2026';
  const hostelId = 'hostel_cf_test_branch_1';
  const ownerId = 'owner_cf_user_1';
  const studentId = 'student_cf_user_1';
  const testVendorId = `vnd_${hostelId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET || 'test_cashfree_webhook_secret_key_12345';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CASHFREE_WEBHOOK_SECRET = webhookSecret;
    await connectDatabase();

    // Create test Express app mounting feeRouter exactly like main.ts
    app = express();
    app.use(express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }));
    app.use(express.urlencoded({ extended: true }));

    // Mount routes
    app.use('/', feeRouter);
    app.use('/payments', (req, res, next) => {
      req.url = '/payments' + (req.url === '/' ? '' : req.url);
      feeRouter(req, res, next);
    });
    app.use('/webhooks/cashfree', (req, res, next) => {
      req.url = '/webhooks/cashfree';
      feeRouter(req, res, next);
    });
    app.use('/orders', (req, res, next) => {
      req.url = '/orders' + (req.url === '/' ? '' : req.url);
      feeRouter(req, res, next);
    });
    app.use(errorHandler);

    // 1. Seed test organization
    await query(
      `INSERT INTO organizations (id, org_code, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [orgId, 'ORG_CF_TEST', 'Cashfree Test Org']
    );

    // 2. Seed Hostel with Cashfree Vendor columns
    await query(
      `INSERT INTO hostels (
        id, hostel_id, owner_id, organization_id, hostel_name, name,
        cashfree_vendor_id, cashfree_onboarding_status, cashfree_bank_status, cashfree_kyc_status
      ) VALUES ($1, $1, $2, $3, $4, $4, $5, 'PENDING', 'PENDING', 'PENDING')
      ON CONFLICT (id) DO UPDATE SET
        cashfree_vendor_id = EXCLUDED.cashfree_vendor_id,
        cashfree_onboarding_status = EXCLUDED.cashfree_onboarding_status`,
      [hostelId, ownerId, orgId, 'Sri Residency Cashfree Hostel', testVendorId]
    );

    // 3. Seed Student with active balance
    await query(
      `INSERT INTO students (
        id, student_id, customer_code, organization_id, hostel_id, full_name, email,
        financial_total_demanded, financial_total_paid, financial_outstanding_balance
      ) VALUES ($1, $1, 'STU-CF-001', $2, $3, 'Kavya Sharma', 'kavya@test.com', 6000.00, 0.00, 6000.00)
      ON CONFLICT (id) DO UPDATE SET
        financial_outstanding_balance = 6000.00,
        financial_total_paid = 0.00`,
      [studentId, orgId, hostelId]
    );
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  // --------------------------------------------------------------------------
  // Phase 0: Deprecation of Non-UPI Payment Gateways & Legacy Webhooks
  // --------------------------------------------------------------------------
  describe('Phase 0: Teardown & Deprecation of Legacy Gateways', () => {
    it('should return 410 Gone on legacy payment webhook endpoint /payments/webhook', async () => {
      const res = await request(app)
        .post('/payments/webhook')
        .send({ event: 'payment.captured' });
      expect(res.status).toBe(410);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Legacy payment webhook endpoint is permanently deprecated');
    });

    it('should return 410 Gone on legacy payment order creation endpoint /payments/order', async () => {
      const res = await request(app)
        .post('/payments/order')
        .send({ amount: 5000 });
      expect(res.status).toBe(410);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Legacy payment endpoints have been permanently deprecated');
    });

    it('should return 410 Gone on legacy payment initiate endpoint /payments/initiate', async () => {
      const res = await request(app)
        .post('/payments/initiate')
        .send({ amount: 5000 });
      expect(res.status).toBe(410);
      expect(res.body.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Phase 1: Sub-Merchant Onboarding (The Hosted Link)
  // --------------------------------------------------------------------------
  describe('Phase 1: Sub-Merchant Onboarding via Cashfree Hosted Link', () => {
    it('should create sub-merchant vendor profile with PENDING status', async () => {
      const vendor = await cashfreeService.createVendor({
        hostelId,
        organizationId: orgId,
        ownerName: 'Sri Residency Cashfree Hostel',
        email: 'hostel_owner@test.com',
        phone: '9848012345',
        registeredHostelName: 'Sri Residency Cashfree Hostel',
      });

      expect(vendor).toBeDefined();
      expect(vendor.vendorId).toBe(testVendorId);
      expect(vendor.status).toBe('PENDING');
    });

    it('should generate Cashfree Hosted Onboarding URL for hostel owner', async () => {
      const onboardingUrl = await cashfreeService.generateOnboardingLink(
        testVendorId,
        'https://ihms.app/settings/payment/cashfree-callback'
      );

      expect(onboardingUrl).toBeDefined();
      expect(typeof onboardingUrl).toBe('string');
      expect(onboardingUrl).toContain('cashfree.com');
    });

    it('should activate sub-merchant upon receiving vendor verified webhook', async () => {
      const vendorActivationPayload = {
        type: 'VENDOR_STATUS_CHANGE',
        event_time: new Date().toISOString(),
        data: {
          vendor: {
            vendor_id: testVendorId,
            status: 'ACTIVE',
            bank_status: 'VERIFIED',
            kyc_status: 'VERIFIED',
          },
        },
      };

      const rawBody = JSON.stringify(vendorActivationPayload);
      const timestamp = String(Date.now());
      const signature = cashfreeService.computeWebhookSignature(timestamp, rawBody);

      const res = await request(app)
        .post('/webhooks/cashfree')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify DB hostel record updated to ACTIVE and VERIFIED
      const updatedHostel = await queryOne<any>(
        `SELECT cashfree_onboarding_status, cashfree_bank_status, cashfree_kyc_status
         FROM hostels WHERE cashfree_vendor_id = $1`,
        [testVendorId]
      );
      expect(updatedHostel?.cashfree_onboarding_status).toBe('ACTIVE');
      expect(updatedHostel?.cashfree_bank_status).toBe('VERIFIED');
    });
  });

  // --------------------------------------------------------------------------
  // Phase 2: Dynamic UPI QR Order Creation (Customer Fee Bearer & Easy Split)
  // --------------------------------------------------------------------------
  describe('Phase 2: Dynamic UPI QR Order Generation', () => {
    it('should enforce server-side hostel vendor mapping, customer fee bearer, and 100% sub-merchant split', async () => {
      const baseAmount = 2500.00;
      const orderRes = await cashfreeService.createDynamicUPIOrder({
        orderId: `IHMS_TEST_${Date.now()}`,
        amount: baseAmount,
        studentId,
        studentCustomerCode: 'STU-CF-001',
        studentName: 'Kavya Sharma',
        studentEmail: 'kavya@test.com',
        studentPhone: '9876543210',
        vendorId: testVendorId,
        hostelId,
        organizationId: orgId,
        notes: { note: 'Hostel Fee Installment - Direct Sub-Merchant UPI QR' },
      });

      expect(orderRes.orderId).toBeDefined();
      expect(orderRes.qrDataUrl).toBeDefined();
      expect(orderRes.qrDataUrl).toContain('data:image/png;base64,');
      expect(orderRes.upiIntentUrl).toBeDefined();
      expect(orderRes.upiIntentUrl).toContain('upi://pay');
      expect(orderRes.baseAmount).toBe(baseAmount);
      expect(orderRes.feeBearer).toBe('customer');
      expect(orderRes.splits).toBeDefined();
      expect(orderRes.splits?.[0]?.vendor_id).toBe(testVendorId);
      expect(orderRes.splits?.[0]?.percentage).toBe(100);
    });
  });

  // --------------------------------------------------------------------------
  // Phase 3 & 4: Cryptographic Webhook, Idempotency, Atomic Ledgering & Silent Polling
  // --------------------------------------------------------------------------
  describe('Phase 3 & 4: HMAC Webhook Verification, Atomic Ledger Settlement & Silent Polling', () => {
    it('should reject webhook with invalid signature', async () => {
      const payload = {
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        event_time: new Date().toISOString(),
        data: {
          order: { order_id: 'ORDER_INVALID_SIG', order_amount: 1000 },
          payment: { cf_payment_id: 'CF_PAY_123', payment_status: 'SUCCESS' },
        },
      };

      const res = await request(app)
        .post('/webhooks/cashfree')
        .set('x-webhook-signature', 'invalid_tampered_signature')
        .set('x-webhook-timestamp', String(Date.now()))
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Cryptographic signature verification failed');
    });

    it('should process payment webhook, record atomic ledger, deduct balance, and create digital receipt', async () => {
      const payAmount = 2000.00;
      const orderId = `IHMS_TEST_ORDER_${Date.now()}`;
      const cfPaymentId = `CF_PMT_${Date.now()}`;
      const bankUtr = `UTR${Date.now()}`;

      // Insert pending payment record referencing student
      await query(
        `INSERT INTO payments (
          id, payment_number, organization_id, hostel_id, student_id, amount,
          base_amount, fee_bearer, payment_method, status, cashfree_order_id, cashfree_split_vendor_id
        ) VALUES (
          $1, $1, $2, $3, $4, $5,
          $5, 'customer', 'UPI', 'PENDING', $1, $6
        )`,
        [orderId, orgId, hostelId, studentId, payAmount, testVendorId]
      );

      // Verify student's starting outstanding balance
      const studentBefore = await queryOne<any>(
        `SELECT financial_outstanding_balance, financial_total_paid FROM students WHERE id = $1`,
        [studentId]
      );
      const startingBalance = Number(studentBefore.financial_outstanding_balance);
      const startingPaid = Number(studentBefore.financial_total_paid);

      // Construct Cashfree PAYMENT_SUCCESS_WEBHOOK payload
      const webhookPayload = {
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        event_time: new Date().toISOString(),
        data: {
          order: {
            order_id: orderId,
            order_amount: payAmount,
            order_currency: 'INR',
          },
          payment: {
            cf_payment_id: cfPaymentId,
            payment_status: 'SUCCESS',
            payment_amount: payAmount,
            payment_currency: 'INR',
            bank_reference: bankUtr,
            payment_time: new Date().toISOString(),
          },
        },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const timestamp = String(Date.now());
      const signature = cashfreeService.computeWebhookSignature(timestamp, rawBody);

      // POST to /webhooks/cashfree
      const webhookRes = await request(app)
        .post('/webhooks/cashfree')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body.success).toBe(true);
      expect(webhookRes.body.status).toBe('PAID');

      // 1. Verify Payment record updated to PAID
      const paymentRecord = await queryOne<any>(
        `SELECT status, cashfree_payment_id, transaction_reference FROM payments WHERE cashfree_order_id = $1`,
        [orderId]
      );
      expect(['PAID', 'SUCCESS']).toContain(paymentRecord?.status);
      expect(paymentRecord?.cashfree_payment_id).toBe(cfPaymentId);
      expect(paymentRecord?.transaction_reference).toBe(bankUtr);

      // 2. Verify Student balance decreased by exactly payAmount
      const studentAfter = await queryOne<any>(
        `SELECT financial_outstanding_balance, financial_total_paid FROM students WHERE id = $1`,
        [studentId]
      );
      expect(Number(studentAfter.financial_outstanding_balance)).toBe(startingBalance - payAmount);
      expect(Number(studentAfter.financial_total_paid)).toBe(startingPaid + payAmount);

      // 3. Verify digital receipt created in receipts table
      const receiptRecord = await queryOne<any>(
        `SELECT receipt_number, amount, payment_id FROM receipts WHERE payment_id = $1`,
        [orderId]
      );
      expect(receiptRecord).toBeDefined();
      expect(Number(receiptRecord.amount)).toBe(payAmount);
      expect(receiptRecord.receipt_number).toBeDefined();

      // 4. Verify Idempotency: replay the same webhook
      const replayRes = await request(app)
        .post('/webhooks/cashfree')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(replayRes.status).toBe(200);
      expect(replayRes.body.message).toContain('already processed');

      // Verify student balance did not double-deduct
      const studentAfterReplay = await queryOne<any>(
        `SELECT financial_outstanding_balance FROM students WHERE id = $1`,
        [studentId]
      );
      expect(Number(studentAfterReplay.financial_outstanding_balance)).toBe(startingBalance - payAmount);

      // 5. Verify Silent Polling endpoint returns PAID status instantly with receipt details
      const pollRes = await request(app)
        .get(`/orders/status?order_id=${orderId}`);

      expect(pollRes.status).toBe(200);
      expect(pollRes.body.status).toBe('PAID');
      expect(pollRes.body.receiptNumber).toBe(receiptRecord.receipt_number);
      expect(pollRes.body.utr).toBe(bankUtr);
      expect(pollRes.body.amount).toBe(payAmount);
    });
  });
});
