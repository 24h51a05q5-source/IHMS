import QRCode from 'qrcode';
import crypto from 'crypto';
import { query, queryOne, queryRows, transaction } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { hostelPaymentConfigService } from '../hostels/hostel-payment-config.service';
import { getNextReceiptNumber } from './receipt-sequence';
import { emitRealTimeEvent } from '../../events/events.gateway';
import { PaymentMethod } from '../../config/constants';
import { PaymentProviderFactory } from './provider-factory';
import { notificationService } from '../notifications/notification.service';
import { paymentGatewayService } from './payment-gateway.service';

export interface IInitiateZeroGatewayPaymentResponse {
  configured: boolean;
  isGatewayConfigured?: boolean;
  message?: string;
  paymentId?: string;
  paymentNumber?: string;
  student: {
    id: string;
    customerCode: string;
    fullName: string;
    hostelId: string;
    hostelName: string;
  };
  paymentDetails: {
    amount: number;
    expectedAmount?: number;
    expiresAt?: string;
    expiresInSeconds?: number;
    transactionNote: string;
    upi: {
      vpaAddress: string;
      displayName: string;
      intentUrl: string;
      qrDataUrl: string;
    } | null;
    bank: {
      beneficiaryName: string;
      accountNumber: string;
      maskedAccountNumber: string;
      ifscCode: string;
      bankName: string;
    } | null;
  };
}

export interface ISubmitPaymentInput {
  studentId: string;
  amount: number;
  paymentMethod: string; // 'UPI' | 'BANK_TRANSFER' | 'IMPS' | 'NEFT' | 'RTGS'
  transactionRef: string; // UTR Number / Bank Reference
  paymentDate?: string;
  proofUrl?: string; // Uploaded screenshot path
  notes?: string;
  installmentId?: string;
}

export class ZeroGatewayPaymentService {
  /**
   * Create an internal IHMS payment record FIRST, then generate dynamic QR through configured provider adapter
   */
  async createDynamicQRPayment(
    orgId: string,
    studentUserIdOrId: string,
    requestedAmount?: number,
    installmentId?: string
  ): Promise<IInitiateZeroGatewayPaymentResponse> {
    const student = await queryOne<any>(
      `SELECT s.id, s.customer_code, s.full_name, s.hostel_id, s.financial_outstanding_balance, h.name as hostel_name, h.hostel_name as alt_hostel_name
       FROM students s
       LEFT JOIN hostels h ON h.id = s.hostel_id
       WHERE (s.id = $1 OR s.user_id = $1 OR s.customer_code = $1 OR s.student_id = $1) AND s.organization_id = $2`,
      [studentUserIdOrId, orgId]
    );

    if (!student) {
      throw new AppError('Student profile not found in your organization.', 404);
    }

    const hostelId = student.hostel_id;
    if (!hostelId) {
      throw new AppError('Student is not assigned to any hostel branch. Cannot determine payment destination.', 400);
    }

    const hostelName = student.hostel_name || student.alt_hostel_name || 'Hostel';
    const config = await hostelPaymentConfigService.getByHostelId(orgId, hostelId || student.hostel_id);

    // Build UPI Payload if active
    let upiPayload: any = null;
    const isUpiActive = Boolean(config?.upiConfig?.vpaAddress && (config.upiConfig.status === 'ACTIVE' || config.upiConfig.status === 'VERIFIED' || config.upiConfig.status === 'OWNER_CONFIRMED'));
    if (isUpiActive && config?.upiConfig?.vpaAddress) {
      upiPayload = {
        vpaAddress: config.upiConfig.vpaAddress,
        displayName: config.upiConfig.displayName || hostelName,
        intentUrl: '',
        qrDataUrl: '',
      };
    }

    // Build Bank Payload if active
    let bankPayload: any = null;
    const isBankActive = Boolean(config?.bankConfig?.accountNumber && (config.bankConfig.status === 'ACTIVE' || config.bankConfig.status === 'VERIFIED' || config.bankConfig.status === 'OWNER_CONFIRMED'));
    if (isBankActive && config?.bankConfig) {
      bankPayload = {
        beneficiaryName: config.bankConfig.beneficiaryName || hostelName,
        accountNumber: config.bankConfig.accountNumber,
        maskedAccountNumber: config.bankConfig.maskedAccountNumber,
        ifscCode: config.bankConfig.ifscCode,
        bankName: config.bankConfig.bankName,
      };
    }

    const isConfigured = Boolean(isUpiActive || isBankActive);
    const gwConfig = await paymentGatewayService.getOrgConfig(orgId);
    const isGatewayConfigured = paymentGatewayService.isGatewayConfigured(gwConfig);

    if (!config || !isConfigured) {
      return {
        configured: false,
        isGatewayConfigured,
        message: 'Payment configuration not completed. Your hostel administration has not configured payment details (UPI ID or Bank Account). Please contact the hostel office.',
        student: {
          id: student.id,
          customerCode: student.customer_code,
          fullName: student.full_name,
          hostelId: student.hostel_id || hostelId,
          hostelName,
        },
        paymentDetails: {
          amount: Number(requestedAmount || student.financial_outstanding_balance || 0),
          transactionNote: '',
          upi: null,
          bank: null,
        },
      };
    }

    // Enforce positive requestedAmount if specified
    if (requestedAmount !== undefined && requestedAmount !== null && Number(requestedAmount) <= 0) {
      throw new AppError('Payment amount must be greater than ₹0.', 400);
    }

    // Amount determination (calculated on backend, not trusting frontend input blindly)
    const outstanding = Number(student.financial_outstanding_balance || 0);
    const amountToPay = requestedAmount && requestedAmount > 0 ? Number(requestedAmount) : outstanding;

    // If no positive amount was requested, return the available configuration without generating a pending payment order
    if (!amountToPay || amountToPay <= 0) {
      return {
        configured: true,
        isGatewayConfigured,
        student: {
          id: student.id,
          customerCode: student.customer_code,
          fullName: student.full_name,
          hostelId: student.hostel_id || hostelId,
          hostelName,
        },
        paymentDetails: {
          amount: 0,
          expectedAmount: 0,
          transactionNote: 'Fee Payment',
          upi: upiPayload,
          bank: bankPayload,
        },
      };
    }

    if (!isUpiActive || !config.upiConfig?.vpaAddress) {
      throw new AppError('UPI / Dynamic QR payment is not configured or enabled for this hostel. Please contact hostel administration.', 400);
    }

    // Generate unique internal IHMS payment reference
    const paymentId = crypto.randomUUID();
    const paymentNumber = `IHMS-PAY-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Obtain configured payment provider adapter
    const providerAdapter = PaymentProviderFactory.getProvider();

    // Call provider adapter to generate dynamic QR
    const qrResult = await providerAdapter.createDynamicQr({
      paymentId: paymentNumber,
      amount: amountToPay,
      vpaAddress: config.upiConfig.vpaAddress,
      payeeName: config.upiConfig.displayName || hostelName,
      description: `IHMS Hostel Fee ${student.customer_code}`,
      expirySeconds: 900, // 15 minutes validity
      organizationId: orgId,
      hostelId: student.hostel_id,
      studentId: student.id,
    });

    // Create internal IHMS payment record BEFORE sending QR to student
    await query(
      `INSERT INTO payments (
        id, payment_number, organization_id, hostel_id, student_id, customer_code,
        installment_id, amount, expected_amount, currency, payment_method, gateway_name,
        gateway_order_id, status, expires_at, received_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, 'INR', 'UPI', $9, $10, 'PENDING', $11, 'Dynamic UPI QR', $12)`,
      [
        paymentId,
        paymentNumber,
        orgId,
        student.hostel_id,
        student.id,
        student.customer_code,
        installmentId || null,
        amountToPay,
        providerAdapter.getProviderName(),
        qrResult.providerPaymentId,
        qrResult.expiresAt,
        `Dynamic QR generated via ${providerAdapter.getProviderName()}`,
      ]
    );

    if (upiPayload) {
      upiPayload.intentUrl = qrResult.intentUrl;
      upiPayload.qrDataUrl = qrResult.qrDataUrl;
    }

    return {
      configured: true,
      isGatewayConfigured,
      paymentId,
      paymentNumber,
      student: {
        id: student.id,
        customerCode: student.customer_code,
        fullName: student.full_name,
        hostelId: student.hostel_id,
        hostelName,
      },
      paymentDetails: {
        amount: amountToPay,
        expectedAmount: amountToPay,
        expiresAt: qrResult.expiresAt.toISOString(),
        expiresInSeconds: 900,
        transactionNote: paymentNumber,
        upi: upiPayload,
        bank: bankPayload,
      },
    };
  }

  /**
   * Check dynamic payment status and enforce server-side QR expiry handling
   */
  async checkDynamicPaymentStatus(orgId: string, paymentIdOrNumber: string): Promise<any> {
    const payment = await queryOne<any>(
      `SELECT p.*, r.receipt_number as receipt_no_rel
       FROM payments p
       LEFT JOIN receipts r ON (r.payment_id = p.id OR r.payment_number = p.payment_number)
       WHERE (p.id = $1 OR p.payment_number = $1 OR p.gateway_order_id = $1) AND p.organization_id = $2`,
      [paymentIdOrNumber, orgId]
    );

    if (!payment) {
      throw new AppError('Payment record not found.', 404);
    }

    // Server-side QR Expiry Check
    if (payment.status === 'PENDING' && payment.expires_at) {
      const expiryTime = new Date(payment.expires_at).getTime();
      if (Date.now() > expiryTime) {
        await query(
          `UPDATE payments SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [payment.id]
        );
        payment.status = 'EXPIRED';
      }
    }

    const receiptNumber = payment.receipt_number || payment.receipt_no_rel || null;

    return {
      id: payment.id,
      paymentNumber: payment.payment_number,
      amount: Number(payment.amount),
      expectedAmount: Number(payment.expected_amount || payment.amount),
      status: payment.status,
      transactionRef: payment.transaction_ref || null,
      receiptNumber,
      expiresAt: payment.expires_at || null,
      isExpired: payment.status === 'EXPIRED',
      isSuccess: payment.status === 'SUCCESS' || payment.status === 'VERIFIED',
      createdAt: payment.created_at,
    };
  }

  /**
   * Dynamically generate payment details (UPI QR, deep link, bank details) for a student's associated hostel
   */
  async getStudentHostelPaymentInfo(
    orgId: string,
    studentUserIdOrId: string,
    requestedAmount?: number
  ): Promise<IInitiateZeroGatewayPaymentResponse> {
    return this.createDynamicQRPayment(orgId, studentUserIdOrId, requestedAmount);
  }

  /**
   * Submit payment reference / UTR for manual verification with duplicate UTR protection
   */
  async submitZeroGatewayPayment(orgId: string, input: ISubmitPaymentInput): Promise<any> {
    const { studentId, amount, paymentMethod, transactionRef, paymentDate, proofUrl, notes, installmentId } = input;

    const cleanUtr = (transactionRef || '').trim();
    if (!cleanUtr) {
      throw new AppError('Transaction reference or UTR number is required to submit payment.', 400);
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      throw new AppError('Payment amount must be a positive number greater than 0.', 400);
    }

    const student = await queryOne<any>(
      `SELECT id, customer_code, full_name, hostel_id, financial_outstanding_balance FROM students WHERE (id = $1 OR user_id = $1) AND organization_id = $2`,
      [studentId, orgId]
    );

    if (!student) {
      throw new AppError('Student record not found.', 404);
    }

    if (!student.hostel_id) {
      throw new AppError('Student is not assigned to any hostel branch.', 400);
    }

    // Verify the hostel has actually configured and activated the payment channel
    const config = await hostelPaymentConfigService.getByHostelId(orgId, student.hostel_id);
    const isUpiActive = Boolean(config?.upiConfig?.vpaAddress && (config.upiConfig.status === 'ACTIVE' || config.upiConfig.status === 'VERIFIED' || config.upiConfig.status === 'OWNER_CONFIRMED'));
    const isBankActive = Boolean(config?.bankConfig?.accountNumber && (config.bankConfig.status === 'ACTIVE' || config.bankConfig.status === 'VERIFIED' || config.bankConfig.status === 'OWNER_CONFIRMED'));

    const pmtMethod = paymentMethod || PaymentMethod.UPI;
    if (pmtMethod === PaymentMethod.UPI && !isUpiActive) {
      throw new AppError('Payment configuration not completed. UPI payments are not enabled for this hostel.', 400);
    }
    if ((pmtMethod === 'BANK_TRANSFER' || pmtMethod === 'IMPS' || pmtMethod === 'NEFT' || pmtMethod === 'RTGS') && !isBankActive) {
      throw new AppError('Payment configuration not completed. Direct Bank Transfer is not enabled for this hostel.', 400);
    }

    const maxPayable = Number(student.financial_outstanding_balance || 0);
    const feeAccount = await queryOne<any>(
      'SELECT allow_advance_payment FROM fee_accounts WHERE student_id = $1 AND organization_id = $2',
      [student.id, orgId]
    );
    if (maxPayable <= 0 && !feeAccount?.allow_advance_payment) {
      throw new AppError('Your fees are already fully paid. No outstanding balance due.', 400);
    }

    // Check for existing UTR in database to prevent replay attacks
    const existingUtr = await queryOne<any>(
      `SELECT id, payment_number, status, created_at FROM payments
       WHERE organization_id = $1 AND LOWER(transaction_ref) = LOWER($2) AND status NOT IN ('REJECTED', 'FAILED')`,
      [orgId, cleanUtr]
    );

    if (existingUtr) {
      throw new AppError('This transaction reference has already been submitted.', 409);
    }

    return transaction(async (client) => {
      // Secondary check within transaction lock
      const lockCheck = await client.query(
        `SELECT id FROM payments WHERE organization_id = $1 AND LOWER(transaction_ref) = LOWER($2) AND status NOT IN ('REJECTED', 'FAILED')`,
        [orgId, cleanUtr]
      );
      if (lockCheck.rows.length > 0) {
        throw new AppError('This transaction reference has already been submitted.', 409);
      }

      const paymentId = require('crypto').randomUUID();
      const paymentNumber = 'PMT-UG-' + Date.now();
      const pmtMethod = paymentMethod || PaymentMethod.UPI;

      const pmtRes = await client.query(
        `INSERT INTO payments (
          id, payment_number, organization_id, hostel_id, student_id, customer_code,
          installment_id, amount, payment_method, transaction_ref, proof_url,
          notes, status, received_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'UNDER_VERIFICATION', $13)
        RETURNING *`,
        [
          paymentId,
          paymentNumber,
          orgId,
          student.hostel_id,
          student.id,
          student.customer_code,
          installmentId || null,
          amount,
          pmtMethod,
          cleanUtr,
          proofUrl || null,
          notes || `Zero-Gateway ${pmtMethod} self-reported payment`,
          'Self-Reported Student UTR',
        ]
      );

      const paymentRecord = pmtRes.rows[0];

      emitRealTimeEvent(
        'payment.created',
        {
          paymentId,
          paymentNumber,
          studentId: student.id,
          studentName: student.full_name,
          amount,
          status: 'UNDER_VERIFICATION',
          utr: cleanUtr,
        },
        { branchId: student.hostel_id }
      );

      // Notify Owner for verification
      notificationService.notifyOwner(orgId, {
        branchId: student.hostel_id,
        title: 'Payment Verification Required',
        message: `${student.full_name} (${student.customer_code}) submitted a payment of ₹${amount} via ${input.paymentMethod} (UTR: ${cleanUtr}) for verification.`,
        type: 'INFO',
        link: '/finance',
        entityType: 'PAYMENT',
        entityId: paymentRecord.id,
      }).catch(() => {});

      // Notify Student of submission acknowledgement
      notificationService.notifyStudent(student.id, {
        organizationId: orgId,
        branchId: student.hostel_id,
        title: 'Payment Under Verification',
        message: `Your payment of ₹${amount} (UTR: ${cleanUtr}) has been submitted and is awaiting hostel administration verification.`,
        type: 'INFO',
        link: '/student/fees',
        entityType: 'PAYMENT',
        entityId: paymentRecord.id,
      }).catch(() => {});

      return {
        payment: {
          id: paymentRecord.id,
          _id: paymentRecord.id,
          paymentNumber: paymentRecord.payment_number,
          studentId: paymentRecord.student_id,
          customerCode: paymentRecord.customer_code,
          studentName: student.full_name,
          amount: Number(paymentRecord.amount),
          paymentMethod: paymentRecord.payment_method,
          transactionRef: paymentRecord.transaction_ref,
          proofUrl: paymentRecord.proof_url,
          status: 'UNDER_VERIFICATION',
          createdAt: paymentRecord.created_at,
        },
        message: 'Payment details submitted successfully. It is now under verification by the hostel administration.',
      };
    });
  }

  /**
   * List submitted payments awaiting verification (for Owner & Accountant)
   */
  async getPendingVerifications(
    orgId: string,
    hostelId?: string,
    page: number = 1,
    pageSize: number = 50,
    search?: string
  ): Promise<any> {
    let whereClause = `WHERE p.organization_id = $1 AND p.status IN ('UNDER_VERIFICATION', 'SUBMITTED', 'PENDING')`;
    const params: any[] = [orgId];

    if (hostelId) {
      params.push(hostelId);
      whereClause += ` AND p.hostel_id = $${params.length}`;
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      params.push(q);
      whereClause += ` AND (p.transaction_ref ILIKE $${params.length} OR p.payment_number ILIKE $${params.length} OR s.full_name ILIKE $${params.length} OR s.customer_code ILIKE $${params.length})`;
    }

    const countSql = `SELECT COUNT(p.id)::int as total FROM payments p LEFT JOIN students s ON s.id = p.student_id ${whereClause}`;
    const totalRow = await queryOne<any>(countSql, params);
    const total = totalRow?.total || 0;

    const limit = Math.min(100, Math.max(1, Number(pageSize)));
    const offset = Math.max(0, (Number(page) - 1) * limit);

    const dataSql = `
      SELECT p.id, p.id as "_id", p.payment_number as "paymentNumber", p.organization_id as "organizationId",
             p.hostel_id as "hostelId", p.student_id as "studentId", p.customer_code as "customerCode",
             p.amount, p.payment_method as "paymentMethod", p.transaction_ref as "transactionRef",
             p.proof_url as "proofUrl", p.notes, p.status, p.created_at as "submittedAt",
             s.full_name as "studentName", s.email as "studentEmail", s.phone as "studentPhone",
             r.room_number as "roomNumber", b.bed_code as "bedNumber", h.name as "hostelName"
      FROM payments p
      LEFT JOIN students s ON s.id = p.student_id
      LEFT JOIN rooms r ON r.id = s.room_id
      LEFT JOIN beds b ON b.id = s.bed_id
      LEFT JOIN hostels h ON h.id = p.hostel_id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const items = await queryRows<any>(dataSql, params);

    return {
      items,
      total,
      page: Number(page),
      pageSize: limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Verify and approve student submitted payment (Owner / Admin)
   */
  async verifyPaymentSubmission(orgId: string, paymentId: string, verifierName: string): Promise<any> {
    return transaction(async (client) => {
      const pmtRes = await client.query(
        `SELECT * FROM payments WHERE (id = $1 OR payment_number = $1) AND organization_id = $2 FOR UPDATE`,
        [paymentId, orgId]
      );
      const payment = pmtRes.rows[0];

      if (!payment) {
        throw new AppError('Payment submission record not found.', 404);
      }

      if (payment.status === 'VERIFIED' || payment.status === 'SUCCESS') {
        throw new AppError('This payment has already been verified.', 400);
      }

      const amount = Number(payment.amount);
      const studentId = payment.student_id;

      // Update payment record to VERIFIED / SUCCESS
      await client.query(
        `UPDATE payments
         SET status = 'VERIFIED', verified_by = $1, verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [verifierName, payment.id]
      );

      // Generate digital receipt sequence number
      const receiptNumber = await getNextReceiptNumber(orgId, client);

      await client.query(
        `UPDATE payments SET receipt_number = $1 WHERE id = $2`,
        [receiptNumber, payment.id]
      );

      // Fetch student info
      const studentRes = await client.query(`SELECT * FROM students WHERE id = $1`, [studentId]);
      const student = studentRes.rows[0];

      // Update student financial balance
      const newTotalPaid = Number(student?.financial_total_paid || 0) + amount;
      const newOutstanding = Math.max(0, Number(student?.financial_outstanding_balance || 0) - amount);

      await client.query(
        `UPDATE students
         SET financial_total_paid = $1, financial_outstanding_balance = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [newTotalPaid, newOutstanding, studentId]
      );

      // Update fee_account
      await client.query(
        `UPDATE fee_accounts
         SET total_paid = total_paid + $1, balance_amount = GREATEST(0, balance_amount - $1),
             outstanding_balance = GREATEST(0, outstanding_balance - $1), updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = $2 AND student_id = $3`,
        [amount, orgId, studentId]
      );

      // Update pending fee installments if installment_id is specified or systematically top to bottom
      if (payment.installment_id) {
        await client.query(
          `UPDATE fee_installments
           SET paid_amount = paid_amount + $1, balance_amount = GREATEST(0, balance_amount - $1),
               status = CASE WHEN (balance_amount - $1) <= 0 THEN 'PAID' ELSE 'PARTIALLY_PAID' END,
               payment_id = $2, paid_at = CURRENT_TIMESTAMP, receipt_number = $3, updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [amount, payment.id, receiptNumber, payment.installment_id]
        );
      } else {
        // Find unpaid installments and apply paid amount
        const instRes = await client.query(
          `SELECT id, amount, paid_amount, balance_amount FROM fee_installments
           WHERE organization_id = $1 AND student_id = $2 AND status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
           ORDER BY installment_number ASC`,
          [orgId, studentId]
        );

        let remainingToApply = amount;
        for (const inst of instRes.rows) {
          if (remainingToApply <= 0) break;
          const instBal = Number(inst.balance_amount);
          const applyAmt = Math.min(remainingToApply, instBal);
          const newBal = instBal - applyAmt;
          const newStatus = newBal <= 0 ? 'PAID' : 'PARTIALLY_PAID';

          await client.query(
            `UPDATE fee_installments
             SET paid_amount = paid_amount + $1, balance_amount = $2, status = $3,
                 payment_id = $4, paid_at = CURRENT_TIMESTAMP, receipt_number = $5, updated_at = CURRENT_TIMESTAMP
             WHERE id = $6`,
            [applyAmt, newBal, newStatus, payment.id, receiptNumber, inst.id]
          );

          remainingToApply -= applyAmt;
        }
      }

      // Add record into immutable fee_ledgers table
      const ledgerId = require('crypto').randomUUID();
      await client.query(
        `INSERT INTO fee_ledgers (
          id, organization_id, hostel_id, student_id, customer_code, payment_id,
          transaction_type, amount, reference_number, description
        ) VALUES ($1, $2, $3, $4, $5, $6, 'PAYMENT_CREDIT', $7, $8, $9)`,
        [
          ledgerId,
          orgId,
          payment.hostel_id,
          studentId,
          student?.customer_code || payment.customer_code,
          payment.id,
          amount,
          receiptNumber,
          `Verified ${payment.payment_method} payment (${payment.transaction_ref})`,
        ]
      );

      // Create official Digital IHMS Receipt record
      const receiptId = require('crypto').randomUUID();
      const qrPayload = `IHMS-REC:${receiptNumber}:${student?.customer_code}:${amount}`;

      await client.query(
        `INSERT INTO receipts (
          id, receipt_number, payment_id, payment_number, organization_id, hostel_id,
          student_id, customer_code, student_name, amount, payment_method, remaining_balance,
          issued_by, qr_payload, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          receiptId,
          receiptNumber,
          payment.id,
          payment.payment_number,
          orgId,
          payment.hostel_id,
          studentId,
          student?.customer_code || payment.customer_code,
          student?.full_name || 'Student',
          amount,
          payment.payment_method,
          newOutstanding,
          verifierName,
          qrPayload,
          `Official IHMS Payment Receipt for UTR ${payment.transaction_ref}`,
        ]
      );

      emitRealTimeEvent(
        'payment.success',
        {
          paymentId: payment.id,
          receiptNumber,
          studentId,
          amount,
          status: 'VERIFIED',
        },
        { branchId: payment.hostel_id }
      );

      emitRealTimeEvent('fee.updated', { studentId }, { branchId: payment.hostel_id });

      // Notify Student that payment is verified and receipt is ready
      notificationService.notifyStudent(studentId, {
        organizationId: orgId,
        branchId: payment.hostel_id,
        title: 'Payment Verified',
        message: `Your payment of ₹${amount} (Ref: ${payment.transaction_ref}) has been verified! Receipt #${receiptNumber} generated.`,
        type: 'SUCCESS',
        link: '/student/fees',
        entityType: 'PAYMENT',
        entityId: payment.id,
      }).catch(() => {});

      // Notify Owner
      notificationService.notifyOwner(orgId, {
        branchId: payment.hostel_id,
        title: 'Payment Verified',
        message: `Payment of ₹${amount} for ${student?.full_name || payment.customer_code} was verified by ${verifierName}.`,
        type: 'SUCCESS',
        link: '/finance',
        entityType: 'PAYMENT',
        entityId: payment.id,
      }).catch(() => {});

      return {
        success: true,
        receiptNumber,
        paymentId: payment.id,
        amount,
        status: 'VERIFIED',
        message: `Payment verified successfully. Receipt #${receiptNumber} generated.`,
      };
    });
  }

  /**
   * Reject student submitted payment with a specified reason
   */
  async rejectPaymentSubmission(
    orgId: string,
    paymentId: string,
    rejectionReason: string,
    rejectedBy: string
  ): Promise<any> {
    const payment = await queryOne<any>(
      `SELECT * FROM payments WHERE (id = $1 OR payment_number = $1) AND organization_id = $2`,
      [paymentId, orgId]
    );

    if (!payment) {
      throw new AppError('Payment record not found.', 404);
    }

    if (payment.status === 'VERIFIED' || payment.status === 'SUCCESS') {
      throw new AppError('A verified payment cannot be rejected.', 400);
    }

    const reason = (rejectionReason || 'UTR or transaction proof could not be verified by hostel owner.').trim();

    await query(
      `UPDATE payments
       SET status = 'REJECTED', rejection_reason = $1, verified_by = $2, verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND organization_id = $4`,
      [reason, rejectedBy, payment.id, orgId]
    );

    // Notify student via notificationService
    await notificationService.notifyStudent(payment.student_id, {
      organizationId: orgId,
      branchId: payment.hostel_id,
      title: 'Payment Submission Rejected',
      message: `Your payment submission (Ref: ${payment.transaction_ref || payment.payment_number}) was rejected. Reason: ${reason}`,
      type: 'WARNING',
      link: '/student/fees',
      entityType: 'PAYMENT',
      entityId: payment.id,
    });

    emitRealTimeEvent(
      'payment.rejected',
      {
        paymentId: payment.id,
        studentId: payment.student_id,
        reason,
      },
      { branchId: payment.hostel_id }
    );

    return {
      success: true,
      paymentId: payment.id,
      status: 'REJECTED',
      message: 'Payment submission has been rejected.',
    };
  }
}

export const zeroGatewayPaymentService = new ZeroGatewayPaymentService();
