import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { connectDatabase, disconnectDatabase, query, queryOne } from '../src/config/database';
import { cashfreeService } from '../src/modules/fees/cashfree.service';
import { feeService } from '../src/modules/fees/fee.service';
import express, { Express } from 'express';
import feeRouter from '../src/modules/fees/fee.controller';
import { errorHandler } from '../src/common/filters/http-exception.filter';

describe('Master QA Checklist: Cashfree Easy Split (UPI QR Only)', () => {
  let app: Express;
  const orgId = 'org_cashfree_master_qa_2026';
  const hostelAId = 'hostel_alpha_branch';
  const hostelBId = 'hostel_beta_branch';
  const vendorAId = 'vnd_hostel_alpha_branch';
  const vendorBId = 'vnd_hostel_beta_branch';

  const studentAId = 'stu_alpha_001';
  const studentBId = 'stu_beta_002';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CASHFREE_APP_ID = 'test_cf_app_id_qa';
    process.env.CASHFREE_SECRET_KEY = 'test_cf_secret_key_qa_1234567890';
    process.env.CASHFREE_WEBHOOK_SECRET = 'test_cf_whsec_master_qa_2026';
    process.env.CASHFREE_API_VERSION = '2023-08-01';
    process.env.CASHFREE_ENV = 'TEST';

    await connectDatabase();

    // Mock Express application with feeRouter
    app = express();
    app.use(express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }));
    app.use(express.urlencoded({ extended: true }));

    app.use((req: any, _res, next) => {
      // Mock authenticated session
      req.user = {
        userId: 'test_qa_user',
        organizationId: orgId,
        role: 'OWNER',
      };
      next();
    });

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
    app.use('/api/orders', (req, res, next) => {
      req.url = '/orders' + (req.url === '/' ? '' : req.url);
      feeRouter(req, res, next);
    });
    app.use(errorHandler);

    // Seed test organization
    await query(
      `INSERT INTO organizations (id, org_code, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [orgId, 'ORG_CF_QA', 'Cashfree Master QA Organization']
    );

    // Seed Hostel A & Hostel B
    await query(
      `INSERT INTO hostels (id, hostel_id, organization_id, hostel_name, name, cashfree_vendor_id, cashfree_onboarding_status)
       VALUES ($1, $1, $2, 'Hostel Alpha', 'Hostel Alpha', $3, 'ACTIVE'),
              ($4, $4, $2, 'Hostel Beta', 'Hostel Beta', $5, 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET cashfree_vendor_id = EXCLUDED.cashfree_vendor_id, cashfree_onboarding_status = EXCLUDED.cashfree_onboarding_status`,
      [hostelAId, orgId, vendorAId, hostelBId, vendorBId]
    );

    // Seed Students in separate hostels
    await query(
      `INSERT INTO students (
        id, student_id, customer_code, organization_id, hostel_id, full_name, email, phone,
        financial_total_demanded, financial_total_paid, financial_outstanding_balance
      ) VALUES
        ($1, $1, 'STU-ALPHA-01', $2, $3, 'Alpha Student', 'alpha@qa.com', '9876543210', 10000.00, 0.00, 10000.00),
        ($4, $4, 'STU-BETA-02', $2, $5, 'Beta Student', 'beta@qa.com', '9876543211', 10000.00, 0.00, 10000.00)
      ON CONFLICT (id) DO UPDATE SET financial_outstanding_balance = EXCLUDED.financial_outstanding_balance`,
      [studentAId, orgId, hostelAId, studentBId, hostelBId]
    );
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  // ==========================================================================
  // PHASE 0: Deprecation & Clean Slate Verification
  // ==========================================================================
  describe('PHASE 0: Deprecation & Clean Slate Verification', () => {
    it('Backend Webhooks: should return 410 Gone on legacy payment webhook endpoints', async () => {
      const res1 = await request(app).post('/payments/webhook').send({});
      expect(res1.status).toBe(410);
      expect(res1.body.message).toContain('deprecated');

      const res2 = await request(app).post('/payments/order').send({});
      expect(res2.status).toBe(410);

      const res3 = await request(app).post('/payments/initiate').send({});
      expect(res3.status).toBe(410);
    });

    it('Dependencies: should verify that legacy gateway SDKs (razorpay, stripe, etc.) are uninstalled', () => {
      const backendPkgPath = path.resolve(__dirname, '../package.json');
      const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));

      const allDeps = {
        ...backendPkg.dependencies,
        ...backendPkg.devDependencies,
      };

      expect(allDeps['razorpay']).toBeUndefined();
      expect(allDeps['stripe']).toBeUndefined();
      expect(allDeps['paytm']).toBeUndefined();
    });

    it('Database Integrity: historical payments with older methods remain accessible and read-only without schema errors', async () => {
      const historicalId = `hist_pmt_${Date.now()}`;
      await query(
        `INSERT INTO payments (
          id, payment_number, organization_id, hostel_id, student_id, amount,
          payment_method, status, transaction_ref, notes
        ) VALUES ($1, $1, $2, $3, $4, 3000.00, 'CARD', 'SUCCESS', 'HIST_CARD_TX_123', 'Historical Card Payment')`,
        [historicalId, orgId, hostelAId, studentAId]
      );

      const readBack = await queryOne<any>(
        `SELECT id, amount, payment_method, status, transaction_ref, cashfree_order_id FROM payments WHERE id = $1`,
        [historicalId]
      );

      expect(readBack).toBeDefined();
      expect(readBack.payment_method).toBe('CARD');
      expect(readBack.status).toBe('SUCCESS');
      expect(readBack.cashfree_order_id).toBeNull();
    });
  });

  // ==========================================================================
  // PHASE 1: Sub-Merchant (Hostel Owner) Onboarding & KYC
  // ==========================================================================
  describe('PHASE 1: Sub-Merchant (Hostel Owner) Onboarding & KYC', () => {
    it('Vendor Creation API: should generate vendor ID and hosted onboarding link', async () => {
      const result = await cashfreeService.createVendor({
        hostelId: 'test_kyc_hostel',
        organizationId: orgId,
        ownerName: 'Ramesh Patel',
        email: 'ramesh@hostel.com',
        phone: '9876543210',
        registeredHostelName: 'Patel Residency',
      });

      expect(result.vendorId).toBe('vnd_test_kyc_hostel');
      expect(result.status).toBe('PENDING');
      expect(result.onboardingUrl).toBeDefined();
      expect(result.onboardingUrl).toContain('payments-test.cashfree.com/easy-split/onboarding');
      expect(result.onboardingUrl).toContain('vendor_id=vnd_test_kyc_hostel');
    });

    it('Sandbox PAN Testing: Test Case 1 (Success) - Individual PAN ABCPV1234D should pass validation', () => {
      const check = cashfreeService.validatePAN('ABCPV1234D');
      expect(check.valid).toBe(true);
      expect(check.panType).toBe('Individual');
    });

    it('Sandbox PAN Testing: Test Case 2 (Failure) - Invalid PAN DEFPV0126D should throw validation error', async () => {
      const check = cashfreeService.validatePAN('DEFPV0126D');
      expect(check.valid).toBe(false);
      expect(check.error).toContain('DEFPV0126D failed validation');

      await expect(
        cashfreeService.createVendor({
          hostelId: 'test_invalid_pan',
          organizationId: orgId,
          ownerName: 'Invalid Owner',
          email: 'invalid@pan.com',
          phone: '9876543210',
          pan: 'DEFPV0126D',
        })
      ).rejects.toThrow('DEFPV0126D failed validation');
    });

    it('Penny Drop Bank Testing: Test Case 1 (Success) - Account 026291800001191 / IFSC YESB0000262 fires SUCCESS status', async () => {
      const result = await cashfreeService.createVendor({
        hostelId: 'test_penny_success_hostel',
        organizationId: orgId,
        ownerName: 'Suresh Kumar',
        email: 'suresh@hostel.com',
        phone: '9876543210',
        pan: 'ABCPV1234D',
        bankAccount: '026291800001191',
        ifsc: 'YESB0000262',
      });

      expect(result.bankStatus).toBe('VERIFIED');
      expect(result.kycStatus).toBe('VERIFIED');
    });

    it('Penny Drop Bank Testing: Test Case 2 (Failure) - Account 2640101002729 / IFSC CNRR0002640 fires INVALID IFSC failure', async () => {
      const result = await cashfreeService.createVendor({
        hostelId: 'test_penny_fail_hostel',
        organizationId: orgId,
        ownerName: 'Mahesh Verma',
        email: 'mahesh@hostel.com',
        phone: '9876543210',
        pan: 'ABCPV1234D',
        bankAccount: '2640101002729',
        ifsc: 'CNRR0002640',
      });

      expect(result.bankStatus).toBe('FAILED');
      expect(result.status).toBe('REJECTED');
    });

    it('Database Update: when Cashfree sends KYC success webhook, backend flags vendor_id as ACTIVE in DB', async () => {
      const pendingHostelId = `hostel_kyc_pending_${Date.now()}`;
      const pendingVendorId = `vnd_${pendingHostelId}`;

      await query(
        `INSERT INTO hostels (id, hostel_id, organization_id, hostel_name, name, cashfree_vendor_id, cashfree_onboarding_status)
         VALUES ($1, $1, $2, 'Pending Hostel', 'Pending Hostel', $3, 'PENDING')`,
        [pendingHostelId, orgId, pendingVendorId]
      );

      const kycWebhookPayload = {
        type: 'VENDOR_VERIFICATION_WEBHOOK',
        event_time: new Date().toISOString(),
        data: {
          vendor: {
            vendor_id: pendingVendorId,
            status: 'ACTIVE',
            bank_details: {
              account_status: 'VERIFIED',
            },
            kyc_details: {
              status: 'VERIFIED',
            },
          },
        },
      };

      const rawBody = JSON.stringify(kycWebhookPayload);
      const timestamp = String(Date.now());
      const signature = cashfreeService.computeWebhookSignature(timestamp, rawBody);

      const res = await request(app)
        .post('/webhooks/cashfree')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ACTIVE');

      const updatedHostel = await queryOne<any>(
        `SELECT cashfree_onboarding_status, cashfree_bank_status, cashfree_kyc_status FROM hostels WHERE cashfree_vendor_id = $1`,
        [pendingVendorId]
      );

      expect(updatedHostel.cashfree_onboarding_status).toBe('ACTIVE');
      expect(updatedHostel.cashfree_bank_status).toBe('VERIFIED');
      expect(updatedHostel.cashfree_kyc_status).toBe('VERIFIED');
    });
  });

  // ==========================================================================
  // PHASE 2: Multi-Tenant Isolation & Split Routing
  // ==========================================================================
  describe('PHASE 2: Multi-Tenant Isolation & Split Routing', () => {
    it('Foreign Key Check: backend securely resolves student DB hostel_id -> vendor_id (ignoring any client spoofing)', async () => {
      // Student A belongs to Hostel A (vendorAId). Client tries to spoof vendor_id as vendorBId.
      const res = await request(app)
        .post('/orders/create-upi-qr')
        .send({
          studentId: studentAId,
          amount: 5000.00,
          vendorId: 'spoofed_vendor_malicious', // should be ignored by backend
        });

      expect(res.status).toBe(201);
      expect(res.body.data.vendorId).toBe(vendorAId); // strictly resolved from DB!
    });

    it('Customer Fee Bearer Math: creates order for base ₹5,000, 100% split to vendor, student pays ₹5,001.50', async () => {
      const baseAmount = 5000.00;
      const orderRes = await cashfreeService.createDynamicUPIOrder({
        orderId: `ORDER_MATH_${Date.now()}`,
        amount: baseAmount,
        studentId: studentAId,
        studentCustomerCode: 'STU-ALPHA-01',
        studentName: 'Alpha Student',
        studentEmail: 'alpha@qa.com',
        studentPhone: '9876543210',
        vendorId: vendorAId,
        hostelId: hostelAId,
        organizationId: orgId,
      });

      // 1. Verify 100% of base amount routed to vendor
      expect(orderRes.splits?.[0]?.vendor_id).toBe(vendorAId);
      expect(orderRes.splits?.[0]?.amount).toBe(5000.00);
      expect(orderRes.splits?.[0]?.percentage).toBeGreaterThanOrEqual(99);

      // 2. Verify "fee_bearer": "customer"
      expect(orderRes.feeBearer).toBe('customer');

      // 3. Verify convenience fee math
      expect(orderRes.baseAmount).toBe(5000.00);
      expect(orderRes.convenienceFee).toBeGreaterThanOrEqual(1.50);
      expect(orderRes.amount).toBe(orderRes.baseAmount + orderRes.convenienceFee);
      expect(orderRes.upiIntentUrl).toContain(`am=${orderRes.amount.toFixed(2)}`);
    });

    it('Cross-Tenant Routing Test: Student in Hostel A routes to vendor_A; Student in Hostel B routes to vendor_B (zero leakage)', async () => {
      const resA = await request(app)
        .post('/orders/create-upi-qr')
        .send({ studentId: studentAId, amount: 2000.00 });

      const resB = await request(app)
        .post('/orders/create-upi-qr')
        .send({ studentId: studentBId, amount: 3000.00 });

      expect(resA.status).toBe(201);
      expect(resB.status).toBe(201);

      // Hostel A check
      expect(resA.body.data.vendorId).toBe(vendorAId);
      expect(resA.body.data.hostelName).toBe('Hostel Alpha');

      // Hostel B check
      expect(resB.body.data.vendorId).toBe(vendorBId);
      expect(resB.body.data.hostelName).toBe('Hostel Beta');

      // Zero cross-tenant leakage
      expect(resA.body.data.vendorId).not.toBe(resB.body.data.vendorId);
    });
  });

  // ==========================================================================
  // PHASE 3: Frontend QR Generation & Silent Polling
  // ==========================================================================
  describe('PHASE 3: Frontend QR Generation & Silent Polling', () => {
    it('QR Rendering: returns high-resolution base64 PNG data URL and valid mobile UPI intent link', async () => {
      const res = await request(app)
        .post('/orders/create-upi-qr')
        .send({ studentId: studentAId, amount: 1500.00 });

      expect(res.status).toBe(201);
      expect(res.body.data.qrDataUrl).toContain('data:image/png;base64,');
      expect(res.body.data.upiIntentUrl).toContain('upi://pay');
      expect(res.body.data.expiresInSeconds).toBe(900); // 15 minutes
    });

    it('Polling Mechanism: GET /orders/status returns pending order details', async () => {
      const createRes = await request(app)
        .post('/orders/create-upi-qr')
        .send({ studentId: studentAId, amount: 1200.00 });

      const orderId = createRes.body.data.orderId;

      const pollRes = await request(app)
        .get(`/orders/status?order_id=${orderId}`);

      expect(pollRes.status).toBe(200);
      expect(pollRes.body.status).toBe('PENDING');
      expect(pollRes.body.amount).toBe(createRes.body.data.amount);
    });

    it('Timeout Handling: expired order returns EXPIRED status and halts checkout', async () => {
      const expiredOrderId = `EXP_ORDER_${Date.now()}`;
      const expiredDate = new Date(Date.now() - 1000).toISOString(); // expired 1s ago

      await query(
        `INSERT INTO payments (
          id, payment_number, organization_id, hostel_id, student_id, amount,
          base_amount, fee_bearer, payment_method, status, cashfree_order_id, expires_at
        ) VALUES ($1, $1, $2, $3, $4, 1000.00, 1000.00, 'customer', 'UPI', 'PENDING', $1, $5)`,
        [expiredOrderId, orgId, hostelAId, studentAId, expiredDate]
      );

      const pollRes = await request(app).get(`/orders/status?order_id=${expiredOrderId}`);
      expect(pollRes.status).toBe(200);
      expect(pollRes.body.status).toBe('EXPIRED');
    });
  });

  // ==========================================================================
  // PHASE 4: Webhook Verification, Screen Updates & Ledger Reconciliation
  // ==========================================================================
  describe('PHASE 4: Webhook Verification & Ledger Reconciliation', () => {
    it('Signature Verification (CRITICAL): fake webhook with mismatched HMAC signature is REJECTED with 401', async () => {
      const fakePayload = {
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        data: { order: { order_id: 'ORDER_FAKE' } },
      };

      const res = await request(app)
        .post('/webhooks/cashfree')
        .set('x-webhook-signature', 'forged_tampered_signature_999')
        .set('x-webhook-timestamp', String(Date.now()))
        .send(fakePayload);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Cryptographic signature verification failed');
    });

    it('Sandbox UPI Payment Testing: Test Case 1 (Success) - success@upi simulates payment, marks PAID, creates receipt', async () => {
      const payAmount = 2500.00;
      const orderId = `CF_ORDER_SUCCESS_${Date.now()}`;
      const cfPaymentId = `CF_PAY_${Date.now()}`;
      const bankUtr = `UTR_SUCCESS_${Date.now()}`;

      await query(
        `INSERT INTO payments (
          id, payment_number, organization_id, hostel_id, student_id, amount,
          base_amount, fee_bearer, payment_method, status, cashfree_order_id, cashfree_split_vendor_id
        ) VALUES ($1, $1, $2, $3, $4, $5, $5, 'customer', 'UPI', 'PENDING', $1, $6)`,
        [orderId, orgId, hostelAId, studentAId, payAmount, vendorAId]
      );

      const webhookPayload = {
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        event_time: new Date().toISOString(),
        data: {
          order: { order_id: orderId, order_amount: payAmount },
          payment: {
            cf_payment_id: cfPaymentId,
            payment_status: 'SUCCESS',
            payment_amount: payAmount,
            bank_reference: bankUtr,
            payment_method: { upi: { vpa: 'success@upi' } },
          },
        },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const timestamp = String(Date.now());
      const signature = cashfreeService.computeWebhookSignature(timestamp, rawBody);

      const res = await request(app)
        .post('/webhooks/cashfree')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PAID');

      // Verify silent poll catches it immediately
      const pollRes = await request(app).get(`/orders/status?order_id=${orderId}`);
      expect(pollRes.status).toBe(200);
      expect(pollRes.body.status).toBe('PAID');
      expect(pollRes.body.utr).toBe(bankUtr);
      expect(pollRes.body.receiptNumber).toBeDefined();
    });

    it('Sandbox UPI Payment Testing: Test Case 2 (Failure) - incorrect@upi simulates failure, marks FAILED', async () => {
      const failOrderId = `CF_ORDER_FAIL_${Date.now()}`;

      await query(
        `INSERT INTO payments (
          id, payment_number, organization_id, hostel_id, student_id, amount,
          base_amount, fee_bearer, payment_method, status, cashfree_order_id
        ) VALUES ($1, $1, $2, $3, $4, 1500.00, 1500.00, 'customer', 'UPI', 'PENDING', $1)`,
        [failOrderId, orgId, hostelAId, studentAId]
      );

      const failWebhookPayload = {
        type: 'PAYMENT_FAILED_WEBHOOK',
        event_time: new Date().toISOString(),
        data: {
          order: { order_id: failOrderId, order_amount: 1500.00 },
          payment: {
            cf_payment_id: `CF_PAY_FAIL_${Date.now()}`,
            payment_status: 'FAILED',
            payment_error: { error_code: 'INCORRECT_VPA_OR_PIN' },
            payment_method: { upi: { vpa: 'incorrect@upi' } },
          },
        },
      };

      const rawBody = JSON.stringify(failWebhookPayload);
      const timestamp = String(Date.now());
      const signature = cashfreeService.computeWebhookSignature(timestamp, rawBody);

      const res = await request(app)
        .post('/webhooks/cashfree')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('FAILED');

      // Verify database updated to FAILED
      const pmtRecord = await queryOne<any>(
        `SELECT status FROM payments WHERE cashfree_order_id = $1`,
        [failOrderId]
      );
      expect(pmtRecord.status).toBe('FAILED');

      // Verify polling returns FAILED
      const pollRes = await request(app).get(`/orders/status?order_id=${failOrderId}`);
      expect(pollRes.body.status).toBe('FAILED');
    });

    it('Database Reconciliation: ONLY Student A balance is deducted; Student B balance is 100% UNTOUCHED', async () => {
      // Record starting balance of Student B
      const studentBBefore = await queryOne<any>(
        `SELECT financial_outstanding_balance, financial_total_paid FROM students WHERE id = $1`,
        [studentBId]
      );

      const studentABefore = await queryOne<any>(
        `SELECT financial_outstanding_balance, financial_total_paid FROM students WHERE id = $1`,
        [studentAId]
      );

      const reconciledAmount = 1000.00;
      const reconOrderId = `RECON_ORDER_${Date.now()}`;

      await query(
        `INSERT INTO payments (
          id, payment_number, organization_id, hostel_id, student_id, amount,
          base_amount, fee_bearer, payment_method, status, cashfree_order_id
        ) VALUES ($1, $1, $2, $3, $4, $5, $5, 'customer', 'UPI', 'PENDING', $1)`,
        [reconOrderId, orgId, hostelAId, studentAId, reconciledAmount]
      );

      const reconPayload = {
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        data: {
          order: { order_id: reconOrderId, order_amount: reconciledAmount },
          payment: {
            cf_payment_id: `CF_RECON_${Date.now()}`,
            payment_status: 'SUCCESS',
            payment_amount: reconciledAmount,
            bank_reference: `UTR_RECON_${Date.now()}`,
          },
        },
      };

      const rawBody = JSON.stringify(reconPayload);
      const timestamp = String(Date.now());
      const signature = cashfreeService.computeWebhookSignature(timestamp, rawBody);

      await request(app)
        .post('/webhooks/cashfree')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      // Student A balance was deducted
      const studentAAfter = await queryOne<any>(
        `SELECT financial_outstanding_balance, financial_total_paid FROM students WHERE id = $1`,
        [studentAId]
      );
      expect(Number(studentAAfter.financial_outstanding_balance)).toBe(
        Number(studentABefore.financial_outstanding_balance) - reconciledAmount
      );

      // Student B balance was NOT affected (100% untouched)
      const studentBAfter = await queryOne<any>(
        `SELECT financial_outstanding_balance, financial_total_paid FROM students WHERE id = $1`,
        [studentBId]
      );
      expect(Number(studentBAfter.financial_outstanding_balance)).toBe(
        Number(studentBBefore.financial_outstanding_balance)
      );
      expect(Number(studentBAfter.financial_total_paid)).toBe(
        Number(studentBBefore.financial_total_paid)
      );
    });
  });

  // ==========================================================================
  // Post-Implementation: Edge-Case Debugging & Advanced Robustness Testing
  // ==========================================================================
  describe('Post-Implementation: Edge-Case Debugging & Robustness Hardening', () => {
    it('Double Webhook Race Condition: concurrent webhooks within 100ms execute idempotently with 1 ledger entry', async () => {
      const orderId = `CONCURRENT_WH_${Date.now()}`;
      const payAmount = 2000.00;

      await query(
        `INSERT INTO payments (
          id, payment_number, organization_id, hostel_id, student_id, amount,
          base_amount, fee_bearer, payment_method, status, cashfree_order_id, cashfree_split_vendor_id
        ) VALUES ($1, $1, $2, $3, $4, $5, $5, 'customer', 'UPI', 'PENDING', $1, $6)`,
        [orderId, orgId, hostelAId, studentAId, payAmount, vendorAId]
      );

      const stuStart = await queryOne<any>(
        `SELECT financial_total_paid FROM students WHERE id = $1`,
        [studentAId]
      );

      const webhookPayload = {
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        event_time: new Date().toISOString(),
        data: {
          order: { order_id: orderId, order_amount: payAmount },
          payment: {
            cf_payment_id: `CF_CONC_${Date.now()}`,
            payment_status: 'SUCCESS',
            payment_amount: payAmount,
            bank_reference: `UTR_CONC_${Date.now()}`,
          },
        },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const timestamp = String(Date.now());
      const signature = cashfreeService.computeWebhookSignature(timestamp, rawBody);

      // Send two concurrent webhook requests within <100ms
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/webhooks/cashfree')
          .set('x-webhook-signature', signature)
          .set('x-webhook-timestamp', timestamp)
          .set('Content-Type', 'application/json')
          .send(rawBody),
        request(app)
          .post('/webhooks/cashfree')
          .set('x-webhook-signature', signature)
          .set('x-webhook-timestamp', timestamp)
          .set('Content-Type', 'application/json')
          .send(rawBody),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Verify exactly 1 ledger record was inserted (NO duplicate crediting)
      const ledgers = await query(
        `SELECT id FROM fee_ledgers WHERE payment_id = $1`,
        [orderId]
      );
      expect(ledgers.rows.length).toBe(1);

      // Verify student total paid increased by exactly payAmount (not double)
      const stuEnd = await queryOne<any>(
        `SELECT financial_total_paid FROM students WHERE id = $1`,
        [studentAId]
      );
      expect(Number(stuEnd.financial_total_paid)).toBe(Number(stuStart.financial_total_paid) + payAmount);
    });

    it('Mismatch Amount: webhook reporting ₹4,000 for ₹5,000 order flags PARTIAL_PAYMENT_ERROR and blocks completion', async () => {
      const mismatchOrderId = `ORDER_MISMATCH_${Date.now()}`;
      const expectedAmount = 5000.00;
      const partialReceived = 4000.00;

      await query(
        `INSERT INTO payments (
          id, payment_number, organization_id, hostel_id, student_id, amount,
          base_amount, expected_amount, fee_bearer, payment_method, status, cashfree_order_id, cashfree_split_vendor_id
        ) VALUES ($1, $1, $2, $3, $4, $5, $5, $5, 'customer', 'UPI', 'PENDING', $1, $6)`,
        [mismatchOrderId, orgId, hostelAId, studentAId, expectedAmount, vendorAId]
      );

      const stuStart = await queryOne<any>(
        `SELECT financial_outstanding_balance FROM students WHERE id = $1`,
        [studentAId]
      );

      const mismatchPayload = {
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        data: {
          order: { order_id: mismatchOrderId, order_amount: expectedAmount },
          payment: {
            cf_payment_id: `CF_PARTIAL_${Date.now()}`,
            payment_status: 'SUCCESS',
            payment_amount: partialReceived,
            bank_reference: `UTR_PARTIAL_${Date.now()}`,
          },
        },
      };

      const rawBody = JSON.stringify(mismatchPayload);
      const timestamp = String(Date.now());
      const signature = cashfreeService.computeWebhookSignature(timestamp, rawBody);

      const res = await request(app)
        .post('/webhooks/cashfree')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PARTIAL_PAYMENT_ERROR');
      expect(res.body.message).toContain('PARTIAL_PAYMENT_ERROR');

      // Verify payment row flagged as PARTIAL_PAYMENT_ERROR
      const pmt = await queryOne<any>(
        `SELECT status, notes FROM payments WHERE cashfree_order_id = $1`,
        [mismatchOrderId]
      );
      expect(pmt.status).toBe('PARTIAL_PAYMENT_ERROR');
      expect(pmt.notes).toContain('PARTIAL_PAYMENT_ERROR');

      // Verify student balance was NOT marked as paid
      const stuEnd = await queryOne<any>(
        `SELECT financial_outstanding_balance FROM students WHERE id = $1`,
        [studentAId]
      );
      expect(Number(stuEnd.financial_outstanding_balance)).toBe(Number(stuStart.financial_outstanding_balance));

      // Verify silent poll endpoint returns PARTIAL_PAYMENT_ERROR
      const pollRes = await request(app).get(`/orders/status?order_id=${mismatchOrderId}`);
      expect(pollRes.status).toBe(200);
      expect(pollRes.body.status).toBe('PARTIAL_PAYMENT_ERROR');
    });

    it('Sub-Merchant Data Validation: null or empty vendor_id immediately aborts with 500 error to prevent un-split deposit', async () => {
      // Direct call to Cashfree service with empty vendorId
      await expect(
        cashfreeService.createDynamicUPIOrder({
          orderId: `NULL_VENDOR_${Date.now()}`,
          amount: 5000.00,
          studentId: studentAId,
          studentCustomerCode: 'STU-ALPHA-01',
          studentName: 'Alpha Student',
          studentPhone: '9876543210',
          studentEmail: 'alpha@qa.com',
          vendorId: '', // invalid empty vendorId
          hostelId: hostelAId,
          organizationId: orgId,
        })
      ).rejects.toThrow('CRITICAL: Missing sub-merchant vendor_id');

      // Direct call with whitespace vendorId
      await expect(
        cashfreeService.createDynamicUPIOrder({
          orderId: `NULL_VENDOR_${Date.now()}`,
          amount: 5000.00,
          studentId: studentAId,
          studentCustomerCode: 'STU-ALPHA-01',
          studentName: 'Alpha Student',
          studentPhone: '9876543210',
          studentEmail: 'alpha@qa.com',
          vendorId: '   ',
          hostelId: hostelAId,
          organizationId: orgId,
        })
      ).rejects.toThrow('CRITICAL: Missing sub-merchant vendor_id');
    });

    it('Historical Ledger & Receipt Check: historical card transaction from 3 months ago loads receipt without schema error', async () => {
      const histPaymentId = `hist_card_pmt_${Date.now()}`;
      const histReceiptNo = `REC-HIST-${Date.now()}`;

      await query(
        `INSERT INTO payments (
          id, payment_number, organization_id, hostel_id, student_id, amount,
          payment_method, status, receipt_number, transaction_ref, created_at
        ) VALUES ($1, $1, $2, $3, $4, 4500.00, 'CARD', 'SUCCESS', $5, 'HIST_UTR_99', NOW() - INTERVAL '90 days')`,
        [histPaymentId, orgId, hostelAId, studentAId, histReceiptNo]
      );

      await query(
        `INSERT INTO receipts (
          id, receipt_number, payment_id, payment_number, organization_id, hostel_id,
          student_id, customer_code, student_name, amount, payment_method, qr_payload, created_at
        ) VALUES ($1, $2, $3, $3, $4, $5, $6, 'STU-ALPHA-01', 'Alpha Student', 4500.00, 'CARD', $7, NOW() - INTERVAL '90 days')`,
        [`rec_id_${Date.now()}`, histReceiptNo, histPaymentId, orgId, hostelAId, studentAId, `IHMS-REC:${histReceiptNo}:STU-ALPHA-01:4500`]
      );

      const receipt = await feeService.getReceiptByPaymentId(orgId, histPaymentId);
      expect(receipt).toBeDefined();
      expect(receipt.receiptNumber).toBe(histReceiptNo);
      expect(receipt.paymentMethod).toBe('CARD');
      expect(Number(receipt.amount)).toBe(4500.00);
      expect(receipt.qrPayload).toContain(histReceiptNo);
    });

    it('Webhook IP Whitelisting: rejects unauthorized origin IP when CASHFREE_ENFORCE_IP_WHITELIST=true', async () => {
      process.env.CASHFREE_ENFORCE_IP_WHITELIST = 'true';

      const payload = { type: 'TEST_EVENT' };
      const res = await request(app)
        .post('/webhooks/cashfree')
        .set('x-forwarded-for', '198.51.100.42') // unauthorized external IP
        .send(payload);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('not authorized');

      delete process.env.CASHFREE_ENFORCE_IP_WHITELIST;
    });
  });
});

