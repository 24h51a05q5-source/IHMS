import { Router, Request, Response, NextFunction } from 'express';
import { feeService } from './fee.service';
import { feeReminderService } from './fee-reminder.service';
import { query, queryOne, queryRows } from '../../config/database';
import { authenticate, authorize } from '../../common/guards/auth.guard';
import { UserRole, PaymentMethod } from '../../config/constants';

const router = Router();

// Webhook endpoints (Cryptographically verified via HMAC-SHA256 signature)
const handleWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = String(
      req.headers['x-razorpay-signature'] ||
      req.headers['x-webhook-signature'] ||
      req.headers['signature'] ||
      req.body?.signature ||
      ''
    );
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const result = await feeService.processWebhookPayment(rawBody, signature, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

router.post('/payments/webhook', handleWebhook);
router.post('/webhook', handleWebhook);

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
const handleGetPaymentDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { zeroGatewayPaymentService } = await import('./zero-gateway-payment.service');
    const isStaff = req.user!.role !== UserRole.STUDENT;
    const studentId = isStaff && req.query.studentId
      ? String(req.query.studentId)
      : (req.user!.studentId || (req.user as any).customerCode || (req.user as any).ihmsId || req.user!.id);
    const amount = req.query.amount ? Number(req.query.amount) : undefined;
    const result = await zeroGatewayPaymentService.getStudentHostelPaymentInfo(req.user!.organizationId, studentId, amount);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};
router.get('/student/payment-initiation', handleGetPaymentDetails);
router.get('/payments/zero-gateway/details', handleGetPaymentDetails);

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
       WHERE p.organization_id = $1 AND (p.student_id = $2 OR p.customer_code = $2)
       ORDER BY p.created_at DESC`,
      [orgId, studentId]
    );

    res.json({ success: true, data: payments });
  } catch (err) {
    next(err);
  }
});

// POST /payments/create (Record Offline / Cash Payment by Admin)
router.post(
  '/payments/create',
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
    } catch (err) {
      next(err);
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
    const result = await zeroGatewayPaymentService.verifyPaymentSubmission(req.user!.organizationId, req.params.id, verifierName);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /payments/:id/reject-submission
router.post('/payments/:id/reject-submission', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { zeroGatewayPaymentService } = await import('./zero-gateway-payment.service');
    const rejectedBy = req.user!.name || req.user!.email || 'Authorized Staff';
    const result = await zeroGatewayPaymentService.rejectPaymentSubmission(
      req.user!.organizationId,
      req.params.id,
      req.body.reason || req.body.rejectionReason,
      rejectedBy
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

// POST /payments/dynamic-qr (Initiate dynamic UPI QR payment request)
router.post('/payments/dynamic-qr', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { zeroGatewayPaymentService } = await import('./zero-gateway-payment.service');
    const isStaff = req.user!.role !== UserRole.STUDENT;
    const studentId = isStaff && req.body.studentId ? req.body.studentId : (req.user!.studentId || req.user!.id);
    const amount = req.body.amount ? Number(req.body.amount) : undefined;
    const installmentId = req.body.installmentId;
    const result = await zeroGatewayPaymentService.createDynamicQRPayment(
      req.user!.organizationId,
      studentId,
      amount,
      installmentId
    );
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /payments/:id/status (Verified server-side status check with expiry check)
router.get('/payments/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { zeroGatewayPaymentService } = await import('./zero-gateway-payment.service');
    const statusData = await zeroGatewayPaymentService.checkDynamicPaymentStatus(req.user!.organizationId, req.params.id);
    res.json({ success: true, data: statusData });
  } catch (err) { next(err); }
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

// GET /payment-settings
router.get(
  '/payment-settings',
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await feeService.getPaymentSettings(req.user!.organizationId);
      res.json({ success: true, data: settings });
    } catch (err) { next(err); }
  }
);

// PUT /payment-settings
router.put(
  '/payment-settings',
  authorize(UserRole.OWNER, UserRole.SUPER_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await feeService.updatePaymentSettings(req.user!.organizationId, req.body);
      res.json({ success: true, data: settings, message: 'Payment gateway settings updated successfully.' });
    } catch (err) { next(err); }
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
router.get('/payments/:id/receipt', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.organizationId;
    const receipt = await feeService.getReceiptByPaymentId(orgId, req.params.id);
    res.json({
      success: true,
      data: receipt,
    });
  } catch (err) {
    next(err);
  }
});

// GET /payments/:id/receipt/pdf (Stream PDF for download/print)
router.get('/payments/:id/receipt/pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pdf, receipt } = await feeService.generateReceiptPdfByPaymentId(
      req.user!.organizationId,
      req.params.id
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="receipt-${receipt.receiptNumber || req.params.id}.pdf"`
    );
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (err) {
    next(err);
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
  } catch (err) {
    next(err);
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
  } catch (err) {
    next(err);
  }
});

export const feeRouter = router;
