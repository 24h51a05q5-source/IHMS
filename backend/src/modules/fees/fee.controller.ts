import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { feeService } from './fee.service';
import { feeReminderService } from './fee-reminder.service';
import { query, queryOne, queryRows } from '../../config/database';
import { authenticate, authorize } from '../../common/guards/auth.guard';
import { verifyHostelActive } from '../../common/guards/hostel-active.guard';
import { UserRole, PaymentMethod } from '../../config/constants';
import { AppError } from '../../common/filters/http-exception.filter';

const router = Router();

// 1. Cashfree Webhook Listener (Cryptographically verified via HMAC-SHA256 signature)
const handleWebhookProbe = (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    status: 'ACTIVE',
    service: 'IHMS ERP Cashfree Webhook Gateway',
    message: 'Cashfree Webhook receiver endpoint is operational and ready to accept event notifications.',
    timestamp: new Date().toISOString(),
  });
};

const handleCashfreeWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = String(
      req.headers['x-webhook-signature'] ||
      req.headers['signature'] ||
      ''
    );
    const timestamp = String(
      req.headers['x-webhook-timestamp'] ||
      ''
    );

    // Cashfree Dashboard "Test & Add" or test verification payload detection
    const isTestWebhook =
      req.body?.type === 'TEST_WEBHOOK' ||
      req.body?.event === 'TEST' ||
      req.body?.eventType === 'TEST_WEBHOOK' ||
      req.body?.data?.order_id === 'TEST_ORDER' ||
      req.body?.order_id === 'TEST_ORDER' ||
      (!signature && typeof req.body === 'object' && Object.keys(req.body).length === 0);

    if (isTestWebhook) {
      return res.status(200).json({
        success: true,
        status: 'ACTIVE',
        message: 'Cashfree test webhook ping verified successfully.',
        timestamp: new Date().toISOString(),
      });
    }

    // Production IP whitelisting validation (enabled when CASHFREE_ENFORCE_IP_WHITELIST=true)
    if (process.env.CASHFREE_ENFORCE_IP_WHITELIST === 'true') {
      const clientIp = (
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        ''
      ).replace(/^.*:/, '');

      const CASHFREE_PRODUCTION_IPS = new Set([
        '52.66.101.190',
        '3.109.91.50',
        '3.108.136.237',
        '13.235.150.146',
        '65.0.93.81',
        '3.108.137.95',
        '13.235.150.147',
        '65.0.93.82',
        '3.109.91.51',
      ]);

      if (clientIp && !CASHFREE_PRODUCTION_IPS.has(clientIp) && clientIp !== '127.0.0.1' && clientIp !== 'localhost') {
        return res.status(403).json({
          success: false,
          message: `Webhook origin IP (${clientIp}) is not authorized.`,
        });
      }
    }

    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const result = await feeService.processCashfreeWebhook(rawBody, signature, timestamp, req.body);
    res.json(result);
  } catch (err: any) {
    console.error(`[CashfreeWebhook] Webhook processing failed: ${err.message}`, err.stack);
    const statusCode = err.statusCode || (err.status ? Number(err.status) : 500);
    res.status(statusCode).json({
      success: false,
      statusCode,
      message: err.message || 'Webhook processing failed',
      details: err.details || null,
    });
  }
};

// Cashfree Webhook Probe Endpoints (Supports GET, HEAD, OPTIONS for dashboard health verification)
router.get(['/webhooks/cashfree', '/payments/webhooks/cashfree', '/webhooks', '/cashfree'], handleWebhookProbe);
router.head(['/webhooks/cashfree', '/payments/webhooks/cashfree', '/webhooks', '/cashfree'], handleWebhookProbe);
router.options(['/webhooks/cashfree', '/payments/webhooks/cashfree', '/webhooks', '/cashfree'], (_req: Request, res: Response) => {
  res.status(200).end();
});

router.post(['/webhooks/cashfree', '/payments/webhooks/cashfree', '/webhooks', '/cashfree'], handleCashfreeWebhook);

// Phase 0: Deprecate legacy gateway webhooks
const handleDeprecatedWebhook = (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    message: 'Legacy payment webhook endpoint is permanently deprecated and disabled. Webhooks are exclusively received via /api/webhooks/cashfree.',
  });
};
router.post('/payments/webhook', handleDeprecatedWebhook);
router.post('/webhook', handleDeprecatedWebhook);

// Phase 0: Deprecate legacy order & payment initiation endpoints
const handleDeprecatedOrder = (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    message: 'Legacy payment endpoints have been permanently deprecated. All fee checkout must exclusively use Cashfree Dynamic UPI QR via POST /api/orders/create-upi-qr.',
  });
};
router.post('/payments/order', handleDeprecatedOrder);
router.post('/payments/initiate', handleDeprecatedOrder);
router.post('/payments/verify', handleDeprecatedOrder);
router.post('/payments/:id/confirm', handleDeprecatedOrder);

// GET /orders/status (Phase 3: Silent Polling Endpoint: GET /api/orders/status?order_id=...)
router.get(['/orders/status', '/status'], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = String(req.query.order_id || req.query.orderId || req.query.id || '').trim();
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'order_id query parameter is required' });
    }

    const payment = await queryOne<any>(
      `SELECT p.*, r.receipt_number as receipt_no_rel
       FROM payments p
       LEFT JOIN receipts r ON (r.payment_id = p.id OR r.payment_number = p.payment_number)
       WHERE (p.cashfree_order_id = $1 OR p.gateway_order_id = $1 OR p.payment_number = $1 OR p.id = $1)
       LIMIT 1`,
      [orderId]
    );

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Server-side expiry check if still pending
    if (payment.status === 'PENDING' && payment.expires_at) {
      if (Date.now() > new Date(payment.expires_at).getTime()) {
        await query(
          `UPDATE payments SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [payment.id]
        );
        payment.status = 'EXPIRED';
      }
    }

    const isPaid = payment.status === 'PAID' || payment.status === 'SUCCESS';
    const status = isPaid ? 'PAID' : payment.status;

    const payload = {
      orderId: payment.cashfree_order_id || payment.gateway_order_id || payment.id,
      paymentId: payment.id,
      paymentNumber: payment.payment_number,
      status,
      amount: Number(payment.amount),
      currency: payment.currency || 'INR',
      receiptNumber: payment.receipt_number || payment.receipt_no_rel || null,
      utr: payment.transaction_reference || payment.transaction_ref || payment.gateway_transaction_id || null,
      expiresAt: payment.expires_at,
    };

    res.json({
      success: true,
      ...payload,
      data: payload,
    });
  } catch (err) {
    next(err);
  }
});

router.use(authenticate);

// GET /fees (List all student fee summaries)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, search, status, page = 1, pageSize = 50 } = req.query;
    const orgId = req.user!.organizationId;

    let whereClause = 'WHERE s.organization_id = $1';
    const params: any[] = [orgId];

    if (studentId) {
      params.push(studentId);
      whereClause += ` AND (s.id = $${params.length} OR s.customer_code = $${params.length})`;
    }

    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      params.push(q);
      whereClause += ` AND (s.full_name ILIKE $${params.length} OR s.customer_code ILIKE $${params.length} OR s.student_id ILIKE $${params.length})`;
    }

    const countSql = `SELECT COUNT(s.id)::int as total FROM students s ${whereClause}`;
    const totalRow = await queryOne<any>(countSql, params);
    const total = totalRow?.total || 0;

    const limit = Math.min(100, Math.max(1, Number(pageSize)));
    const offset = Math.max(0, (Number(page) - 1) * limit);

    const dataSql = `
      SELECT s.id, s.id as "_id", s.student_id as "studentId", s.customer_code as "customerCode",
             s.full_name as "studentName", s.financial_total_demanded as "total",
             s.financial_total_paid as "paid", s.financial_outstanding_balance as "outstanding",
             fa.payment_plan as "paymentPlan"
      FROM students s
      LEFT JOIN fee_accounts fa ON fa.student_id = s.id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const students = await queryRows<any>(dataSql, params);

    const mapped = students.map((s: any) => {
      const totalAmt = Number(s.total || 0);
      const paidAmt = Number(s.paid || 0);
      const outstandingAmt = Number(s.outstanding || 0);

      return {
        id: s.id,
        _id: s.id,
        studentId: s.studentId || s.customerCode,
        studentName: s.studentName,
        customerCode: s.customerCode,
        paymentPlan: s.paymentPlan || 'MONTHLY',
        total: totalAmt,
        paid: paidAmt,
        outstanding: outstandingAmt,
        status: outstandingAmt <= 0 ? 'PAID' : paidAmt > 0 ? 'PARTIAL' : 'OVERDUE',
        dueDate: '2026-08-31',
      };
    });

    res.json({
      success: true,
      data: {
        items: mapped,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /fees/demand or POST /fees (Create Fee Demand)
router.post(
  '/demand',
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const demand = await feeService.createFeeDemand(req.user!.organizationId, req.body);
      res.status(201).json({
        success: true,
        data: demand,
        message: `Fee demand created successfully. Demand #${demand.demand_number}`,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/',
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const demand = await feeService.createFeeDemand(req.user!.organizationId, req.body);
      res.status(201).json({
        success: true,
        data: demand,
        message: `Fee demand created successfully. Demand #${demand.demand_number}`,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /fees/student/payment-initiation (or /payments/zero-gateway/details)
// DEPRECATED: Replaced by Cashfree Dynamic UPI QR checkout (/orders/create-upi-qr)
const handleDeprecatedPaymentInitiation = (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    message: 'Legacy payment initiation details are permanently deprecated. All fee checkout must use Cashfree Dynamic UPI QR via POST /api/orders/create-upi-qr.',
  });
};
router.get('/student/payment-initiation', handleDeprecatedPaymentInitiation);
router.get('/payments/zero-gateway/details', handleDeprecatedPaymentInitiation);

// GET /fees/student/:studentId (Full Fee Account & Installments Details)
router.get('/student/:studentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const feeData = await feeService.getStudentFeeAccount(req.user!.organizationId, req.params.studentId);
    res.json({ success: true, data: feeData });
  } catch (err) {
    next(err);
  }
});

// POST /fees/student/:studentId/adjustment (Record Approved Adjustment / Discount)
router.post(
  '/student/:studentId/adjustment',
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { amount, reason } = req.body;
      const feeAccount = await feeService.recordApprovedAdjustment(req.user!.organizationId, req.params.studentId, {
        amount: Number(amount),
        reason,
        approvedBy: req.user!.name || req.user!.email,
      });
      res.json({ success: true, data: feeAccount, message: 'Adjustment recorded successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /fees/student/:studentId/settings (Update Due Day, Advance Payment, Reminder Rules)
router.patch(
  '/student/:studentId/settings',
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const feeAccount = await feeService.updateFeePlanSettings(
        req.user!.organizationId,
        req.params.studentId,
        req.body
      );
      res.json({ success: true, data: feeAccount, message: 'Fee plan settings updated.' });
    } catch (err) {
      next(err);
    }
  }
);

// POST /fees/student/:studentId/plan (Update/Recreate Payment Plan)
router.post(
  '/student/:studentId/plan',
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const student = await queryOne<any>(
        'SELECT id, customer_code, hostel_id FROM students WHERE (id = $1 OR user_id = $1 OR customer_code = $1) AND organization_id = $2',
        [req.params.studentId, req.user!.organizationId]
      );
      if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

      const result = await feeService.createFeeAccountAndInstallments(
        req.user!.organizationId,
        student.hostel_id,
        student.id,
        student.customer_code,
        req.body
      );
      res.json({ success: true, data: result, message: 'Payment plan updated successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

// POST /fees/reminders/process (Trigger Background Fee Reminders & Overdue Updates)
router.post(
  '/reminders/process',
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const results = await feeReminderService.processInstallmentReminders(req.user!.organizationId);
      res.json({
        success: true,
        data: results,
        message: `Processed reminders: ${results.upcomingSent} upcoming, ${results.dueTodaySent} due today, ${results.overdueSent} overdue notifications.`,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /payments (List all Payments)
router.get('/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, page = 1, pageSize = 50, search, status, paymentMethod } = req.query;
    const orgId = req.user!.organizationId;

    let sql = `
      SELECT p.id, p.id as "_id", p.payment_number as "paymentNumber", p.organization_id as "organizationId",
             p.hostel_id as "branchId", p.student_id as "studentId", p.customer_code as "customerCode",
             p.amount, p.payment_method as "paymentMethod", p.payment_method as "method",
             p.transaction_ref as "transactionRef", p.status, p.receipt_number as "receiptNumber",
             p.receipt_number as "receiptNo", p.received_by as "receivedBy", p.notes,
             p.created_at as "timestamp", p.created_at as "date", p.created_at as "createdAt",
             s.full_name as "studentName", r.room_number as "roomNumber", b.bed_code as "bedNumber",
             rc.fee_type as "feeType", rc.installment_month as "installmentMonth"
      FROM payments p
      LEFT JOIN students s ON s.id = p.student_id
      LEFT JOIN rooms r ON r.id = s.room_id
      LEFT JOIN beds b ON b.id = s.bed_id
      LEFT JOIN receipts rc ON (rc.payment_id = p.id OR rc.payment_number = p.payment_number)
      WHERE p.organization_id = $1
    `;
    const params: any[] = [orgId];

    if (studentId) {
      params.push(studentId);
      sql += ` AND (p.student_id = $${params.length} OR p.customer_code = $${params.length})`;
    }
    if (status && status !== 'ALL') {
      params.push(status);
      sql += ` AND p.status = $${params.length}`;
    }
    if (paymentMethod && paymentMethod !== 'ALL') {
      params.push(paymentMethod);
      sql += ` AND p.payment_method = $${params.length}`;
    }
    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      params.push(q);
      sql += ` AND (p.payment_number ILIKE $${params.length} OR p.receipt_number ILIKE $${params.length} OR s.full_name ILIKE $${params.length} OR p.customer_code ILIKE $${params.length})`;
    }

    const countSql = `SELECT COUNT(*)::int as total FROM (${sql}) as sub`;
    const totalRow = await queryOne<any>(countSql, params);
    const total = totalRow?.total || 0;

    const limit = Number(pageSize);
    const offset = (Number(page) - 1) * limit;
    sql += ` ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const payments = await queryRows<any>(sql, params);

    res.json({
      success: true,
      data: {
        items: payments,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /payments/student/:studentId
router.get('/payments/student/:studentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.organizationId;
    const studentId = req.params.studentId;

    const payments = await queryRows<any>(
      `SELECT p.id, p.id as "_id", p.payment_number as "paymentNumber", p.organization_id as "organizationId",
              p.hostel_id as "branchId", p.student_id as "studentId", p.customer_code as "customerCode",
              p.amount, p.payment_method as "paymentMethod", p.payment_method as "method",
              p.transaction_ref as "transactionRef", p.status, p.receipt_number as "receiptNumber",
              p.receipt_number as "receiptNo", p.received_by as "receivedBy", p.notes,
              p.created_at as "timestamp", p.created_at as "date", p.created_at as "createdAt",
              s.full_name as "studentName", r.room_number as "roomNumber", b.bed_code as "bedNumber",
              rc.fee_type as "feeType", rc.installment_month as "installmentMonth"
       FROM payments p
       LEFT JOIN students s ON s.id = p.student_id
       LEFT JOIN rooms r ON r.id = s.room_id
       LEFT JOIN beds b ON b.id = s.bed_id
       LEFT JOIN receipts rc ON (rc.payment_id = p.id OR rc.payment_number = p.payment_number)
       WHERE p.organization_id = $1 AND (
         p.student_id = $2 OR
         p.customer_code = $2 OR
         p.custom_id = $2 OR
         s.custom_id = $2 OR
         s.customer_code = $2 OR
         s.user_id = $2 OR
         s.student_id = $2 OR
         UPPER(COALESCE(s.custom_id, '')) = UPPER($2) OR
         UPPER(COALESCE(s.ihms_id, '')) = UPPER($2)
       )
       ORDER BY p.created_at DESC`,
      [orgId, studentId]
    );

    res.json({ success: true, data: payments });
  } catch (err: any) {
    console.error(`[FeeController] Failed to retrieve student payments: ${err.message}`, err.stack);
    next(err);
  }
});

// POST /payments/create (Record Offline / Cash Payment by Admin - supports both /payments/create and /payments)
router.post(
  ['/payments/create', '/payments', '/create'],
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        studentId,
        amount,
        method,
        paymentMode,
        feeType,
        roomNumber,
        bedNumber,
        paymentDate,
        remarks,
        notes,
        receivedBy,
        installmentId,
      } = req.body;
      const targetStudentId = studentId || req.user!.studentId;

      if (!targetStudentId) {
        return res.status(400).json({
          success: false,
          statusCode: 400,
          message: 'Student ID or customer code is required to record a payment.',
        });
      }

      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({
          success: false,
          statusCode: 400,
          message: 'Payment amount must be greater than ₹0.',
        });
      }

      const result = await feeService.recordPayment(req.user!.organizationId, {
        studentId: targetStudentId,
        amount: Number(amount),
        paymentMethod: (paymentMode || method || PaymentMethod.CASH) as PaymentMethod,
        feeType: feeType || 'Hostel Rent',
        roomNumber,
        bedNumber,
        paymentDate,
        notes: notes || remarks || 'Cash collection at hostel counter',
        receivedBy: receivedBy || req.user!.name || req.user!.email || 'Authorized Staff',
        installmentId,
      });

      res.status(201).json({
        success: true,
        data: {
          paymentId: result.payment.id || result.payment._id,
          payment: result.payment,
          receipt: result.receipt,
          status: 'SUCCESS',
        },
        message: `Payment recorded successfully. Receipt #${result.receipt.receiptNumber}`,
      });
    } catch (err: any) {
      console.error(`[FeeController] Failed to record payment: ${err.message}`, err.stack);
      const statusCode = err.statusCode || (err.status ? Number(err.status) : 500);
      res.status(statusCode).json({
        success: false,
        statusCode,
        message: err.message || 'Failed to record payment.',
        details: err.details || null,
        error: err.name || 'PaymentError',
      });
    }
  }
);

// POST /payments/order (or /payments/initiate)
router.post('/payments/order', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isStaff = req.user!.role !== UserRole.STUDENT;
    const studentId = isStaff && req.body.studentId ? req.body.studentId : (req.user!.studentId || req.user!.id);
    const order = await feeService.initiatePayment(req.user!.organizationId, studentId, {
      amount: Number(req.body.amount),
      installmentId: req.body.installmentId,
      paymentMethod: req.body.paymentMethod || PaymentMethod.ONLINE,
      idempotencyKey: req.body.idempotencyKey,
    });
    res.status(201).json({ success: true, data: order, message: 'Payment order created.' });
  } catch (err) { next(err); }
});

router.post('/payments/initiate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isStaff = req.user!.role !== UserRole.STUDENT;
    const studentId = isStaff && req.body.studentId ? req.body.studentId : (req.user!.studentId || req.user!.id);
    const order = await feeService.initiatePayment(req.user!.organizationId, studentId, {
      amount: Number(req.body.amount),
      installmentId: req.body.installmentId,
      paymentMethod: req.body.paymentMethod || PaymentMethod.ONLINE,
      idempotencyKey: req.body.idempotencyKey,
    });
    res.status(201).json({ success: true, data: order, message: 'Payment order created.' });
  } catch (err) { next(err); }
});

// POST /payments/zero-gateway/submit (or /student/submit-payment)
const handleSubmitPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { zeroGatewayPaymentService } = await import('./zero-gateway-payment.service');
    const isStaff = req.user!.role !== UserRole.STUDENT;
    const studentId = isStaff && req.body.studentId ? req.body.studentId : (req.user!.studentId || req.user!.id);
    const result = await zeroGatewayPaymentService.submitZeroGatewayPayment(req.user!.organizationId, {
      ...req.body,
      studentId,
    });
    res.status(201).json({ success: true, data: result.payment, message: result.message });
  } catch (err) { next(err); }
};
router.post('/payments/zero-gateway/submit', handleSubmitPayment);
router.post('/student/submit-payment', handleSubmitPayment);

// POST /payments/upload-proof (Secure Image Magic-Number Verified Upload)
router.post('/payments/upload-proof', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { UploadValidationService } = await import('../../common/utils/upload-validation.service');
    const imagePayload = req.body.file || req.body.image || req.body.screenshot || req.body.proof;
    if (!imagePayload) {
      return res.status(400).json({ success: false, message: 'Image payload is required for proof upload.' });
    }
    const relativeUrl = UploadValidationService.saveAndValidatePaymentProof(imagePayload);
    res.status(201).json({
      success: true,
      data: { url: relativeUrl },
      message: 'Payment proof screenshot uploaded and verified successfully.',
    });
  } catch (err) { next(err); }
});

// GET /payments/pending-verifications (Owner / Accountant Queue)
router.get('/payments/pending-verifications', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { zeroGatewayPaymentService } = await import('./zero-gateway-payment.service');
    const { hostelId, page = 1, pageSize = 50, search } = req.query;
    const data = await zeroGatewayPaymentService.getPendingVerifications(
      req.user!.organizationId,
      hostelId ? String(hostelId) : undefined,
      Number(page),
      Number(pageSize),
      search ? String(search) : undefined
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /payments/:id/verify-submission
router.post('/payments/:id/verify-submission', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { zeroGatewayPaymentService } = await import('./zero-gateway-payment.service');
    const verifierName = req.user!.name || req.user!.email || 'Authorized Staff';
    const expectedHostelId = req.body.hostelId || (req.user as any).branchId || undefined;
    const result = await zeroGatewayPaymentService.verifyPaymentSubmission(req.user!.organizationId, req.params.id, verifierName, expectedHostelId);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /payments/:id/reject-submission
router.post('/payments/:id/reject-submission', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { zeroGatewayPaymentService } = await import('./zero-gateway-payment.service');
    const rejectedBy = req.user!.name || req.user!.email || 'Authorized Staff';
    const expectedHostelId = req.body.hostelId || (req.user as any).branchId || undefined;
    const result = await zeroGatewayPaymentService.rejectPaymentSubmission(
      req.user!.organizationId,
      req.params.id,
      req.body.reason || req.body.rejectionReason,
      rejectedBy,
      expectedHostelId
    );
    res.json(result);
  } catch (err) { next(err); }
});

// POST /payments/verify
router.post('/payments/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { paymentId, gatewayOrderId, gatewayPaymentId, gatewaySignature } = req.body;
    const result = await feeService.verifyAndConfirmPayment(req.user!.organizationId, {
      paymentId,
      gatewayOrderId,
      gatewayPaymentId,
      gatewaySignature,
    });
    res.json({
      success: true,
      data: result,
      message: 'Payment verified successfully.',
    });
  } catch (err) {
    next(err);
  }
});

// POST /payments/:id/confirm
router.post('/payments/:id/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const paymentId = req.params.id;
    const payload = req.body?.gatewayPayload || req.body || {};
    const result = await feeService.verifyAndConfirmPayment(req.user!.organizationId, {
      paymentId,
      gatewayOrderId: payload.gatewayOrderId || payload.orderId || payload.razorpay_order_id,
      gatewayPaymentId: payload.gatewayPaymentId || payload.paymentId || payload.razorpay_payment_id,
      gatewaySignature: payload.gatewaySignature || payload.signature || payload.razorpay_signature,
    });
    res.json({
      success: true,
      data: result,
      message: 'Payment confirmed successfully.',
    });
  } catch (err) {
    next(err);
  }
});

// Phase 2: Create Dynamic UPI QR Order with Split Logic & Customer Fee Bearer
const handleCreateCashfreeUpiQr = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cashfreeService } = await import('./cashfree.service');
    const isStaff = req.user!.role !== UserRole.STUDENT && (req.user!.role as any) !== 'STUDENT';
    const requestedStudentId = req.body.studentId ? String(req.body.studentId).trim() : '';
    const userStudentId = req.user?.studentId ? String(req.user.studentId).trim() : '';
    const userCustomerCode = req.user?.customerCode ? String(req.user.customerCode).trim() : '';
    const authUserId = req.user?.id ? String(req.user.id).trim() : '';

    const targetStudentId = requestedStudentId || userCustomerCode || userStudentId || authUserId;
    const requestedAmount = (req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== '')
      ? Number(req.body.amount)
      : undefined;
    const installmentId = req.body.installmentId;

    let orgId = req.user?.organizationId || (req.user as any)?.organization_id || (req.user as any)?.orgId;

    // Security Rule 1: Retrieve student from DB to enforce organization & hostel isolation
    // For students: match authenticated user's student record (s.user_id = authUserId) or provided identifiers
    // For staff: match by target student ID
    let student: any = null;

    if (!isStaff) {
      // Authenticated student flow: Prioritize their own student row linked by user_id = authUserId or s.id = authUserId
      student = await queryOne<any>(
        `SELECT s.id, s.customer_code, s.custom_id, s.ihms_id, s.student_id, s.user_id,
                s.full_name, s.email, s.phone, s.hostel_id, s.organization_id,
                s.financial_outstanding_balance,
                h.id as hostel_db_id, h.name as hostel_name, h.branch_code as hostel_branch_code, h.cashfree_vendor_id, h.cashfree_onboarding_status
         FROM students s
         LEFT JOIN hostels h ON h.id = s.hostel_id
         WHERE (
           s.user_id = $1 OR
           s.id = $1
         )
         ${orgId ? 'AND s.organization_id = $2' : ''}
         LIMIT 1`,
        orgId ? [authUserId, orgId] : [authUserId]
      );

      // Fallback for students where targetStudentId was specified (e.g., token without linked user_id)
      if (!student && targetStudentId) {
        student = await queryOne<any>(
          `SELECT s.id, s.customer_code, s.custom_id, s.ihms_id, s.student_id, s.user_id,
                  s.full_name, s.email, s.phone, s.hostel_id, s.organization_id,
                  s.financial_outstanding_balance,
                  h.id as hostel_db_id, h.name as hostel_name, h.branch_code as hostel_branch_code, h.cashfree_vendor_id, h.cashfree_onboarding_status
           FROM students s
           LEFT JOIN hostels h ON h.id = s.hostel_id
           WHERE (
             s.id = $1 OR
             s.customer_code = $1 OR
             s.custom_id = $1 OR
             s.student_id = $1 OR
             UPPER(COALESCE(s.customer_code, '')) = UPPER($1) OR
             UPPER(COALESCE(s.custom_id, '')) = UPPER($1) OR
             UPPER(COALESCE(s.ihms_id, '')) = UPPER($1)
           )
           ${orgId ? 'AND s.organization_id = $2' : ''}
           LIMIT 1`,
          orgId ? [targetStudentId, orgId] : [targetStudentId]
        );
      }
    } else {
      // Staff flow: search by target student identifier
      student = await queryOne<any>(
        `SELECT s.id, s.customer_code, s.custom_id, s.ihms_id, s.student_id, s.user_id,
                s.full_name, s.email, s.phone, s.hostel_id, s.organization_id,
                s.financial_outstanding_balance,
                h.id as hostel_db_id, h.name as hostel_name, h.branch_code as hostel_branch_code, h.cashfree_vendor_id, h.cashfree_onboarding_status
         FROM students s
         LEFT JOIN hostels h ON h.id = s.hostel_id
         WHERE (
           s.id = $1 OR
           s.user_id = $1 OR
           s.customer_code = $1 OR
           s.custom_id = $1 OR
           s.student_id = $1 OR
           UPPER(COALESCE(s.customer_code, '')) = UPPER($1) OR
           UPPER(COALESCE(s.custom_id, '')) = UPPER($1) OR
           UPPER(COALESCE(s.ihms_id, '')) = UPPER($1)
         )
         ${orgId ? 'AND s.organization_id = $2' : ''}
         LIMIT 1`,
        orgId ? [targetStudentId, orgId] : [targetStudentId]
      );
    }

    if (!student) {
      console.error(`[FeeController] Student profile not found for identifier: '${targetStudentId}' (AuthUser: ${authUserId}, Role: ${req.user?.role}, Org: ${orgId || 'unspecified'})`);
      return res.status(404).json({
        success: false,
        statusCode: 404,
        message: `Student profile not found for identifier: ${targetStudentId}. Please verify your student ID.`,
      });
    }

    if (!orgId) {
      orgId = student.organization_id;
    }

    // Security Rule 1.1: Ensure non-staff cannot initiate orders for another student's account
    if (!isStaff && student.user_id && authUserId && student.user_id !== authUserId && student.id !== authUserId) {
      return res.status(403).json({
        success: false,
        statusCode: 403,
        message: 'Unauthorized: You can only initiate payments for your own student fee account.',
      });
    }

    // Security Rule 2: Derive hostel_id strictly from database, NEVER from frontend
    let hostelId = student.hostel_id;
    let vendorId = student.cashfree_vendor_id;
    let vendorStatus = student.cashfree_onboarding_status;

    if (!hostelId) {
      const defaultHostel = await queryOne<any>(
        `SELECT id, name, cashfree_vendor_id, cashfree_onboarding_status FROM hostels WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [orgId]
      );
      if (defaultHostel) {
        hostelId = defaultHostel.id;
        vendorId = defaultHostel.cashfree_vendor_id;
        vendorStatus = defaultHostel.cashfree_onboarding_status;
      }
    }

    if (!hostelId) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'No hostel branch is assigned to this student.',
      });
    }

    // Tenant Offboarding Check: If hostel is DEACTIVATED or SUSPENDED, reject payment creation
    const hostelRecord = await queryOne<any>(
      `SELECT id, name, status, cashfree_vendor_id, cashfree_onboarding_status FROM hostels WHERE (id = $1 OR hostel_id = $1) AND organization_id = $2 LIMIT 1`,
      [hostelId, orgId]
    );

    if (hostelRecord && (hostelRecord.status === 'DEACTIVATED' || hostelRecord.status === 'SUSPENDED' || hostelRecord.status === 'INACTIVE')) {
      return res.status(403).json({
        success: false,
        statusCode: 403,
        message: 'This hostel is no longer active. Online payments are disabled.',
      });
    }

    // Auto-create sub-merchant account if not yet created on Cashfree
    if (!vendorId) {
      const owner = await queryOne<any>(
        `SELECT full_name, email, phone, registered_hostel_name FROM owners WHERE organization_id = $1 LIMIT 1`,
        [orgId]
      );
      try {
        const newVendor = await cashfreeService.createVendor({
          hostelId,
          organizationId: orgId,
          ownerName: owner?.full_name || 'Hostel Owner',
          email: owner?.email || 'owner@hostel.com',
          phone: owner?.phone || '9999999999',
          registeredHostelName: owner?.registered_hostel_name || student.hostel_name || 'Hostel',
        });
        vendorId = newVendor.vendorId;
        vendorStatus = newVendor.status;
      } catch (vendorErr: any) {
        console.warn(`[FeeController] Vendor auto-creation warning: ${vendorErr.message}`);
        vendorId = `VENDOR_${hostelId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      }
    }

    const baseAmount = requestedAmount && requestedAmount > 0 ? requestedAmount : Number(student.financial_outstanding_balance || 0);
    if (!baseAmount || baseAmount <= 0) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Payment amount must be greater than ₹0.',
      });
    }

    const orderId = `IHMS_CF_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const paymentId = crypto.randomUUID();
    const paymentNumber = `PAY-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    const studentDisplayCode = student.custom_id || student.customer_code || student.ihms_id || student.student_id || student.id;

    // Call Cashfree Platform Order API (Customer Fee Bearer Model)
    const qrResult = await cashfreeService.createDynamicUPIOrder({
      orderId,
      amount: baseAmount,
      studentId: student.id,
      studentCustomerCode: studentDisplayCode,
      studentName: student.full_name,
      studentPhone: student.phone || '9876543210',
      studentEmail: student.email || `${studentDisplayCode}@ihms.app`,
      vendorId,
      hostelId,
      organizationId: orgId,
    });

    // Save pending payment record in DB
    await query(
      `INSERT INTO payments (
        id, payment_number, organization_id, hostel_id, student_id, customer_code, custom_id,
        installment_id, amount, expected_amount, base_amount, convenience_fee, currency, payment_method,
        gateway_name, gateway_order_id, cashfree_order_id, cashfree_split_vendor_id,
        fee_bearer, status, expires_at, qr_code_data, received_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, 'INR', 'UPI', 'CASHFREE', $12, $12, $13, 'customer', 'PENDING', $14, $15, 'Cashfree Platform', $16)`,
      [
        paymentId,
        paymentNumber,
        orgId,
        hostelId,
        student.id,
        studentDisplayCode,
        studentDisplayCode,
        installmentId || null,
        qrResult.amount,
        baseAmount,
        qrResult.convenienceFee || 0,
        orderId,
        vendorId,
        qrResult.expiresAt,
        qrResult.qrDataUrl,
        `Cashfree Dynamic UPI QR Order for ${studentDisplayCode} (Vendor: ${vendorId})`,
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        orderId,
        paymentId,
        paymentNumber,
        amount: qrResult.amount,
        baseAmount: qrResult.baseAmount,
        convenienceFee: qrResult.convenienceFee || 0,
        platformMicroFee: qrResult.platformMicroFee || 3.00,
        currency: 'INR',
        vendorId,
        feeBearer: 'customer',
        upiIntentUrl: qrResult.upiIntentUrl,
        upiAppLinks: qrResult.upiAppLinks,
        paymentSessionId: qrResult.paymentSessionId,
        splits: qrResult.splits,
        qrDataUrl: qrResult.qrDataUrl,
        expiresAt: qrResult.expiresAt,
        expiresInSeconds: qrResult.expiresInSeconds,
        hostelName: student.hostel_name || 'Hostel',
        studentId: studentDisplayCode,
        studentCustomerCode: studentDisplayCode,
        customerCode: studentDisplayCode,
        student: {
          id: student.id,
          studentId: studentDisplayCode,
          customerCode: studentDisplayCode,
          customId: studentDisplayCode,
          name: student.full_name,
        },
      },
      message: 'Dynamic Cashfree UPI QR generated successfully.',
    });
  } catch (err: any) {
    console.error(`[FeeController] Error generating Cashfree Dynamic UPI QR: ${err.message}`, err.stack);
    const statusCode = err.statusCode || (err.status ? Number(err.status) : 500);
    return res.status(statusCode).json({
      success: false,
      statusCode,
      message: err.message || 'Failed to generate Dynamic UPI QR. Please try again later.',
      details: err.details || null,
      error: err.name || 'PaymentError',
    });
  }
};

router.post(
  [
    '/orders/create-upi-qr',
    '/create-upi-qr',
    '/payments/create-upi-qr',
    '/payments/dynamic-qr',
    '/dynamic-qr',
    '/orders/create',
    '/orders',
    '/create',
  ],
  verifyHostelActive,
  handleCreateCashfreeUpiQr
);

// GET /payments/:id/status (Verified server-side status check with expiry check)
router.get('/payments/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await queryOne<any>(
      `SELECT p.*, r.receipt_number as receipt_no_rel
       FROM payments p
       LEFT JOIN receipts r ON (r.payment_id = p.id OR r.payment_number = p.payment_number)
       WHERE (p.id = $1 OR p.payment_number = $1 OR p.gateway_order_id = $1 OR p.cashfree_order_id = $1)
         AND p.organization_id = $2`,
      [req.params.id, req.user!.organizationId]
    );

    if (!payment) {
      throw new AppError('Payment record not found.', 404);
    }

    if (payment.status === 'PENDING' && payment.expires_at) {
      if (Date.now() > new Date(payment.expires_at).getTime()) {
        await query(
          `UPDATE payments SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [payment.id]
        );
        payment.status = 'EXPIRED';
      }
    }

    const isPaid = payment.status === 'PAID' || payment.status === 'SUCCESS';
    const status = isPaid ? 'PAID' : payment.status;

    res.json({
      success: true,
      data: {
        orderId: payment.cashfree_order_id || payment.gateway_order_id || payment.id,
        paymentId: payment.id,
        paymentNumber: payment.payment_number,
        status,
        amount: Number(payment.amount),
        currency: payment.currency || 'INR',
        receiptNumber: payment.receipt_number || payment.receipt_no_rel || null,
        utr: payment.transaction_ref || payment.gateway_transaction_id || null,
        expiresAt: payment.expires_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Phase 1: Generate Cashfree Sub-Merchant Hosted Onboarding Link
router.post('/hostels/:hostelId/cashfree-onboarding-link', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cashfreeService } = await import('./cashfree.service');
    const hostel = await queryOne<any>(
      `SELECT h.id, h.name, h.cashfree_vendor_id, h.cashfree_onboarding_status, h.cashfree_onboarding_url,
              o.full_name as owner_name, o.email as owner_email, o.phone as owner_phone
       FROM hostels h
       LEFT JOIN owners o ON o.organization_id = h.organization_id
       WHERE (h.id = $1 OR h.hostel_id = $1) AND h.organization_id = $2`,
      [req.params.hostelId, req.user!.organizationId]
    );

    if (!hostel) {
      throw new AppError('Hostel not found', 404);
    }

    let vendorId = hostel.cashfree_vendor_id;
    if (!vendorId) {
      const vendor = await cashfreeService.createVendor({
        hostelId: hostel.id,
        organizationId: req.user!.organizationId,
        ownerName: hostel.owner_name || req.user!.name || 'Hostel Owner',
        email: hostel.owner_email || req.user!.email || 'owner@hostel.com',
        phone: hostel.owner_phone || '9999999999',
        registeredHostelName: hostel.name,
      });
      vendorId = vendor.vendorId;
    }

    const onboardingUrl = await cashfreeService.generateOnboardingLink(vendorId, hostel.name);

    await query(
      `UPDATE hostels SET cashfree_onboarding_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [onboardingUrl, hostel.id]
    );

    res.json({
      success: true,
      data: {
        vendorId,
        onboardingUrl,
        status: hostel.cashfree_onboarding_status || 'PENDING',
      },
      message: 'Cashfree hosted onboarding link generated.',
    });
  } catch (err) {
    next(err);
  }
});

// Phase 1: Retrieve Cashfree Sub-Merchant Verification Status
router.get('/hostels/:hostelId/cashfree-status', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cashfreeService } = await import('./cashfree.service');
    const hostel = await queryOne<any>(
      `SELECT id, name, cashfree_vendor_id, cashfree_onboarding_status, cashfree_bank_status,
              cashfree_kyc_status, cashfree_onboarding_url
       FROM hostels
       WHERE (id = $1 OR hostel_id = $1) AND organization_id = $2`,
      [req.params.hostelId, req.user!.organizationId]
    );

    if (!hostel) {
      throw new AppError('Hostel not found', 404);
    }

    let statusData = {
      vendorId: hostel.cashfree_vendor_id,
      status: hostel.cashfree_onboarding_status || 'NOT_STARTED',
      bankStatus: hostel.cashfree_bank_status || 'PENDING',
      kycStatus: hostel.cashfree_kyc_status || 'PENDING',
      onboardingUrl: hostel.cashfree_onboarding_url,
    };

    if (hostel.cashfree_vendor_id) {
      const liveStatus = await cashfreeService.getVendorStatus(hostel.cashfree_vendor_id);
      statusData.status = liveStatus.status;
      statusData.bankStatus = liveStatus.bankStatus;
      statusData.kycStatus = liveStatus.kycStatus;
    }

    res.json({
      success: true,
      data: statusData,
    });
  } catch (err) {
    next(err);
  }
});

// POST /payments/:id/refund
router.post(
  '/payments/:id/refund',
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await feeService.refundPayment(req.user!.organizationId, req.params.id, {
        amount: req.body.amount ? Number(req.body.amount) : undefined,
        reason: req.body.reason,
        authorizedBy: req.user!.name || req.user!.email || 'Authorized Staff',
      });
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Safe Organization ID resolution helper for multi-tenant payment settings
async function resolvePaymentSettingsOrgId(req: Request): Promise<string> {
  let orgId =
    req.user?.organizationId ||
    (req.user as any)?.orgId ||
    (req.user as any)?.organization_id ||
    (req.body && (req.body.organizationId || req.body.orgId || req.body.organization_id)) ||
    (req.query && (req.query.organizationId || req.query.orgId || req.query.organization_id)) ||
    (req.headers['x-organization-id'] as string) ||
    '';

  if (!orgId && req.user?.id) {
    try {
      const u = await queryOne<any>('SELECT organization_id, owner_id FROM users WHERE id = $1', [req.user.id]);
      if (u?.organization_id) orgId = u.organization_id;
      else if (u?.owner_id) orgId = u.owner_id;
    } catch { }
  }

  if (!orgId) {
    try {
      const o = await queryOne<any>('SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1');
      if (o?.id) orgId = o.id;
    } catch { }
  }

  if (!orgId) {
    orgId = 'org_default_ihms_01';
  }

  return orgId;
}

// GET /payment-settings
router.get(
  '/payment-settings',
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = await resolvePaymentSettingsOrgId(req);
      const settings = await feeService.getPaymentSettings(orgId);
      return res.json({ success: true, data: settings });
    } catch (err: any) {
      console.error(`[FeeController] ❌ GET /payment-settings failed for user "${req.user?.id || 'unknown'}":`, err.message);
      if (err.stack) console.error(err.stack);
      return res.status(err.statusCode || 500).json({
        success: false,
        statusCode: err.statusCode || 500,
        message: err.message || 'Failed to retrieve payment gateway settings.',
        error: err.message || 'Internal Server Error',
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
      });
    }
  }
);

// PUT /payment-settings
router.put(
  '/payment-settings',
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log(`[FeeController] 📥 PUT /payment-settings request from user "${req.user?.id || 'unknown'}" (${req.user?.role}):`, {
        provider: req.body?.provider,
        environment: req.body?.environment,
        hasKeyId: Boolean(req.body?.keyId),
        hasKeySecret: Boolean(req.body?.keySecret),
        hasWebhookSecret: Boolean(req.body?.webhookSecret),
      });

      const orgId = await resolvePaymentSettingsOrgId(req);
      const settings = await feeService.updatePaymentSettings(orgId, req.body);

      console.log(`[FeeController] ✅ PUT /payment-settings successfully saved for organization "${orgId}"`);
      return res.json({
        success: true,
        data: settings,
        message: 'Payment gateway settings updated successfully.'
      });
    } catch (err: any) {
      console.error(`[FeeController] ❌ PUT /payment-settings failed for user "${req.user?.id || 'unknown'}":`, err.message);
      if (err.stack) console.error(err.stack);
      return res.status(err.statusCode || 500).json({
        success: false,
        statusCode: err.statusCode || 500,
        message: err.message || 'Failed to update payment gateway settings.',
        error: err.message || 'Internal Server Error',
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
        details: err.details || err.message,
      });
    }
  }
);

// GET /ledger
router.get(
  '/ledger',
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ledgers = await feeService.getFeeLedger(req.user!.organizationId, req.query.studentId as string);
      res.json({ success: true, data: ledgers });
    } catch (err) { next(err); }
  }
);

// GET /payments/reconciliation (List pending/unresolved payments)
router.get(
  '/payments/reconciliation',
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payments = await feeService.listReconciliationPayments(req.user!.organizationId);
      res.json({ success: true, data: payments });
    } catch (err) { next(err); }
  }
);

// POST /payments/:id/reconcile (Trigger manual or automated gateway status reconciliation)
router.post(
  '/payments/:id/reconcile',
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await feeService.reconcilePayment(
        req.user!.organizationId,
        req.params.id,
        req.user!.name || req.user!.email || 'Authorized Staff'
      );
      res.json(result);
    } catch (err) { next(err); }
  }
);

// GET /payments/:id/receipt
router.get(['/payments/:id/receipt', '/receipts/:id'], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.organizationId;
    let receipt: any;
    try {
      receipt = await feeService.getReceiptByPaymentId(orgId, req.params.id);
    } catch (e) {
      receipt = await feeService.getReceiptByNumber(orgId, req.params.id);
    }
    res.json({
      success: true,
      data: receipt,
    });
  } catch (err: any) {
    console.error(`[FeeController] Failed to fetch receipt for "${req.params.id}": ${err.message}`, err.stack);
    const statusCode = err.statusCode || (err.status ? Number(err.status) : 404);
    res.status(statusCode).json({
      success: false,
      statusCode,
      message: err.message || 'Receipt not found.',
      details: err.details || null,
    });
  }
});

// GET /payments/:id/receipt/pdf (Stream PDF for download/print)
router.get(['/payments/:id/receipt/pdf', '/receipts/:id/pdf'], async (req: Request, res: Response, next: NextFunction) => {
  try {
    let result: { pdf: Buffer; receipt: any };
    try {
      result = await feeService.generateReceiptPdfByPaymentId(
        req.user!.organizationId,
        req.params.id
      );
    } catch (e) {
      result = await feeService.generateReceiptPdfByNumber(
        req.user!.organizationId,
        req.params.id
      );
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="receipt-${result.receipt?.receiptNumber || req.params.id}.pdf"`
    );
    res.setHeader('Content-Length', result.pdf.length);
    res.send(result.pdf);
  } catch (err: any) {
    console.error(`[FeeController] Failed to stream receipt PDF for "${req.params.id}": ${err.message}`, err.stack);
    const statusCode = err.statusCode || (err.status ? Number(err.status) : 404);
    res.status(statusCode).json({
      success: false,
      statusCode,
      message: err.message || 'Receipt PDF could not be generated.',
      details: err.details || null,
    });
  }
});

// GET /receipts/:receiptNumber (Fetch Receipt by receipt number)
router.get('/receipts/:receiptNumber', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const receipt = await feeService.getReceiptByNumber(
      req.user!.organizationId,
      req.params.receiptNumber
    );
    res.json({ success: true, data: receipt });
  } catch (err: any) {
    console.error(`[FeeController] Failed to fetch receipt by number: ${err.message}`, err.stack);
    const statusCode = err.statusCode || (err.status ? Number(err.status) : 404);
    res.status(statusCode).json({
      success: false,
      statusCode,
      message: err.message || 'Receipt not found.',
      details: err.details || null,
    });
  }
});

// GET /receipts/:receiptNumber/pdf (Stream PDF by receipt number)
router.get('/receipts/:receiptNumber/pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pdf, receipt } = await feeService.generateReceiptPdfByNumber(
      req.user!.organizationId,
      req.params.receiptNumber
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="receipt-${receipt.receiptNumber}.pdf"`
    );
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (err: any) {
    console.error(`[FeeController] Failed to stream receipt PDF by number: ${err.message}`, err.stack);
    const statusCode = err.statusCode || (err.status ? Number(err.status) : 404);
    res.status(statusCode).json({
      success: false,
      statusCode,
      message: err.message || 'Receipt PDF could not be generated.',
      details: err.details || null,
    });
  }
});

export const feeRouter = router;
export default router;
