import crypto from 'crypto';
import request from 'supertest';
import express, { Express } from 'express';
import { connectDatabase, disconnectDatabase, query, queryOne } from '../src/config/database';
import { cashfreeService } from '../src/modules/fees/cashfree.service';
import feeRouter from '../src/modules/fees/fee.controller';
import { errorHandler } from '../src/common/filters/http-exception.filter';

describe('Comprehensive Payment System Route & Error Handling Verification', () => {
  let app: Express;
  const orgId = 'org_comp_test_2026';
  const hostelId = 'hostel_comp_branch_1';
  const vendorId = `vnd_${hostelId}`;
  const studentCustomId = 'IHMS-HYD-9999';
  const studentDbId = 'stu_comp_uuid_001';
  const ownerId = 'owner_comp_001';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CASHFREE_APP_ID = 'test_cf_app_id_comp';
    process.env.CASHFREE_SECRET_KEY = 'test_cf_secret_comp_12345';
    process.env.CASHFREE_WEBHOOK_SECRET = 'whsec_comp_secure_2026';

    await connectDatabase();

    app = express();
    app.use(express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }));
    app.use(express.urlencoded({ extended: true }));

    // Mock authentication middleware
    app.use((req: any, _res, next) => {
      req.user = {
        id: ownerId,
        userId: ownerId,
        organizationId: orgId,
        role: 'OWNER',
        email: 'owner@comp.test',
        name: 'Comprehensive Owner',
      };
      next();
    });

    // Mount feeRouter exactly like main.ts
    app.use('/', feeRouter);
    app.use('/payments', (req, res, next) => {
      req.url = '/payments' + (req.url === '/' ? '' : req.url);
      feeRouter(req, res, next);
    });
    app.use('/orders', (req, res, next) => {
      req.url = '/orders' + (req.url === '/' ? '' : req.url);
      feeRouter(req, res, next);
    });
    app.use('/webhooks/cashfree', (req, res, next) => {
      req.url = '/webhooks/cashfree';
      feeRouter(req, res, next);
    });
    app.use('/payment-settings', (req, res, next) => {
      req.url = '/payment-settings' + (req.url === '/' ? '' : req.url);
      feeRouter(req, res, next);
    });

    app.use(errorHandler);

    // Seed test organization, hostel, owner, and student
    await query(
      `INSERT INTO organizations (id, org_code, name, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO NOTHING`,
      [orgId, 'ORG_COMP_01', 'Comprehensive Test Org']
    );

    await query(
      `INSERT INTO hostels (id, organization_id, name, cashfree_vendor_id, cashfree_onboarding_status, status)
       VALUES ($1, $2, 'Comprehensive Grand Hostel', $3, 'ACTIVE', 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET cashfree_vendor_id = $3, status = 'ACTIVE'`,
      [hostelId, orgId, vendorId]
    );

    await query(
      `INSERT INTO owners (id, organization_id, full_name, email, phone)
       VALUES ($1, $2, 'Hostel Owner', 'owner@comp.test', '9876543210')
       ON CONFLICT (id) DO NOTHING`,
      [ownerId, orgId]
    );

    await query(
      `INSERT INTO students (
        id, student_id, customer_code, custom_id, ihms_id, user_id, organization_id, hostel_id,
        full_name, email, phone, status, is_active, financial_total_demanded, financial_outstanding_balance
      ) VALUES ($1, $2, $2, $3, $3, $1, $4, $5, 'Vikram Malhotra', 'vikram@comp.test', '9876500000', 'ACTIVE', true, 10000.00, 10000.00)
      ON CONFLICT (id) DO UPDATE SET custom_id = $3, customer_code = $2, financial_outstanding_balance = 10000.00`,
      [studentDbId, 'STU-COMP-001', studentCustomId, orgId, hostelId]
    );
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  describe('1. Payment Settings API (/payment-settings & /fees/payment-settings)', () => {
    it('GET /payment-settings should return gateway configuration successfully', async () => {
      const res = await request(app).get('/payment-settings');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('provider');
      expect(res.body.data).toHaveProperty('environment');
    });

    it('PUT /payment-settings should successfully update gateway settings', async () => {
      const res = await request(app)
        .put('/payment-settings')
        .send({
          provider: 'CASHFREE',
          environment: 'TEST',
          keyId: 'CF_KEY_TEST_UPDATED',
          keySecret: 'cf_sec_live_key_99999',
          webhookSecret: 'whsec_comp_secure_2026',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.keyId).toBe('CF_KEY_TEST_UPDATED');
    });
  });

  describe('2. Offline Payment Creation (/payments and /payments/create)', () => {
    it('POST /payments should record counter payment and return receipt', async () => {
      const res = await request(app)
        .post('/payments')
        .send({
          studentId: studentCustomId, // Pass custom_id!
          amount: 2500.00,
          paymentMode: 'CASH',
          feeType: 'Hostel Rent',
          notes: 'Counter payment collected by cashier',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('SUCCESS');
      expect(res.body.data.receipt).toBeDefined();
      expect(res.body.data.receipt.receiptNumber).toMatch(/^(REC|RCP)-/);
    });

    it('POST /payments should return 400 when amount is invalid', async () => {
      const res = await request(app)
        .post('/payments')
        .send({
          studentId: studentCustomId,
          amount: -50,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('greater than ₹0');
    });
  });

  describe('3. Dynamic UPI QR Order with Custom ID and Easy Split (/orders/create-upi-qr)', () => {
    it('should create Dynamic UPI QR order when referenced by student custom_id', async () => {
      const res = await request(app)
        .post('/orders/create-upi-qr')
        .send({
          studentId: studentCustomId, // Student's custom_id IHMS-HYD-9999
          amount: 5000.00,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBeDefined();
      expect(res.body.data.qrDataUrl).toContain('data:image/png;base64,');
      expect(res.body.data.upiIntentUrl).toContain('upi://pay');
      expect(res.body.data.platformMicroFee).toBe(3.00);
      expect(res.body.data.splits?.[0]?.vendor_id).toBe(vendorId);
      expect(res.body.data.splits?.[0]?.percentage).toBeGreaterThanOrEqual(99);
    });

    it('should return 404 with structured error message when student does not exist', async () => {
      const res = await request(app)
        .post('/orders/create-upi-qr')
        .send({
          studentId: 'NON_EXISTENT_STUDENT_XYZ',
          amount: 1000.00,
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Student profile not found');
    });
  });

  describe('4. Silent Polling Status Endpoint (/orders/status)', () => {
    it('GET /orders/status should return status of order', async () => {
      // First create a pending order
      const qrRes = await request(app)
        .post('/orders/create-upi-qr')
        .send({
          studentId: studentCustomId,
          amount: 1500.00,
        });

      const orderId = qrRes.body.data.orderId;

      // Poll status
      const statusRes = await request(app)
        .get(`/orders/status?order_id=${orderId}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.success).toBe(true);
      expect(statusRes.body.status).toBe('PENDING');
      expect(statusRes.body.orderId).toBe(orderId);
    });
  });

  describe('5. Receipt Retrieval & PDF Generation (/payments/:id/receipt)', () => {
    it('should retrieve receipt by paymentId and stream PDF', async () => {
      // Create a payment first
      const pmtRes = await request(app)
        .post('/payments')
        .send({
          studentId: studentCustomId,
          amount: 1000.00,
          paymentMode: 'CASH',
        });

      const paymentId = pmtRes.body.data.paymentId;
      const receiptNumber = pmtRes.body.data.receipt.receiptNumber;

      // Fetch by paymentId
      const receiptRes = await request(app).get(`/payments/${paymentId}/receipt`);
      expect(receiptRes.status).toBe(200);
      expect(receiptRes.body.success).toBe(true);
      expect(receiptRes.body.data.receiptNumber).toBe(receiptNumber);

      // Fetch by receiptNumber on the same route
      const receiptByNumRes = await request(app).get(`/payments/${receiptNumber}/receipt`);
      expect(receiptByNumRes.status).toBe(200);
      expect(receiptByNumRes.body.data.receiptNumber).toBe(receiptNumber);

      // Stream PDF
      const pdfRes = await request(app).get(`/payments/${paymentId}/receipt/pdf`);
      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers['content-type']).toContain('application/pdf');
      expect(pdfRes.body).toBeDefined();
    });
  });

  describe('6. Webhook Cryptographic Security (/webhooks/cashfree)', () => {
    it('should reject forged webhook signature with 401 Unauthorized', async () => {
      const forgedPayload = {
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        data: { order: { order_id: 'ORDER_FORGED_999' } },
      };

      const res = await request(app)
        .post('/webhooks/cashfree')
        .set('x-webhook-signature', 'forged_tampered_signature_invalid')
        .set('x-webhook-timestamp', String(Date.now()))
        .send(forgedPayload);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('signature verification failed');
    });

    it('should accept Cashfree dashboard test ping and return 200 OK', async () => {
      const testPing = {
        type: 'TEST_WEBHOOK',
        event: 'TEST',
      };

      const res = await request(app)
        .post('/webhooks/cashfree')
        .send(testPing);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('ACTIVE');
    });
  });
});
