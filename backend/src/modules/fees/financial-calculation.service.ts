import crypto from 'crypto';
import { query, queryOne, queryRows } from '../../config/database';

export interface BillingDates {
  year: number;
  month: number;
  daysInMonth: number;
  billingMonth: string;         // e.g. '2026-09'
  generationDate: string;       // e.g. '2026-09-01'
  dueDate: string;              // e.g. '2026-09-05'
  dueDateIso: string;           // ISO timestamp for 5th 23:59:59
  gracePeriodDays: number;      // 2 days
  gracePeriodEnd: string;       // e.g. '2026-09-07T23:59:59.999Z'
  overdueTriggerDate: string;   // e.g. '2026-09-08T00:00:00.000Z'
}

export interface GeneratedInvoice {
  id: string;
  invoiceId: string;
  studentId: string;
  customerCode: string;
  customId?: string;
  billingMonth: string;
  dueDate: string;
  amountDue: number;
  status: 'PENDING' | 'PAID' | 'OVERDUE';
}

export class FinancialCalculationService {
  /**
   * Airtight date calculation handling 28, 29, 30, and 31-day months (including leap years).
   * Generates strictly:
   * - Generation Date: 1st of the month
   * - Standard Due Date: 5th of the month
   * - Grace Period: 2-day buffer up to midnight on the 7th
   * - Overdue Trigger: 8th of the month 00:00:00
   */
  calculateBillingDates(target: Date | string | { year: number; month: number }): BillingDates {
    let year: number;
    let month: number; // 1-12

    if (typeof target === 'object' && 'year' in target && 'month' in target) {
      year = target.year;
      month = target.month;
    } else {
      const d = typeof target === 'string' ? new Date(target) : target;
      if (isNaN(d.getTime())) {
        throw new Error(`Invalid date supplied to calculateBillingDates: ${target}`);
      }
      year = d.getUTCFullYear();
      month = d.getUTCMonth() + 1; // 1-indexed
    }

    if (month < 1 || month > 12) {
      throw new Error(`Invalid month: ${month}. Must be between 1 and 12.`);
    }

    // Number of days in this specific month (handles Feb 28/29 leap years automatically)
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthStr = String(month).padStart(2, '0');
    const billingMonth = `${year}-${monthStr}`;

    const generationDate = `${billingMonth}-01`;
    const dueDate = `${billingMonth}-05`;
    const dueDateIso = `${billingMonth}-05T23:59:59.999Z`;
    const gracePeriodDays = 2;
    const gracePeriodEnd = `${billingMonth}-07T23:59:59.999Z`;
    const overdueTriggerDate = `${billingMonth}-08T00:00:00.000Z`;

    return {
      year,
      month,
      daysInMonth,
      billingMonth,
      generationDate,
      dueDate,
      dueDateIso,
      gracePeriodDays,
      gracePeriodEnd,
      overdueTriggerDate,
    };
  }

  /**
   * 1. Monthly Due Date & Invoice Generation Logic
   * Invoices generate on the 1st of every calendar month for all active students (is_active = TRUE).
   * Standard due date is set to the 5th of that specific month.
   */
  async generateMonthlyInvoices(options?: {
    targetDate?: Date | string | { year: number; month: number };
    orgId?: string;
    studentId?: string;
  }): Promise<{
    billingMonth: string;
    dueDate: string;
    generatedCount: number;
    skippedCount: number;
    invoices: GeneratedInvoice[];
  }> {
    const dates = this.calculateBillingDates(options?.targetDate || new Date());
    const orgId = options?.orgId;
    const targetStudentId = options?.studentId;

    let studentSql = `
      SELECT s.id, s.organization_id, s.hostel_id, s.customer_code, s.custom_id,
             s.full_name, s.email, s.room_id, s.bed_id,
             b.monthly_rate as bed_monthly_rate,
             r.monthly_rent as room_monthly_rent,
             r.monthly_rate as room_monthly_rate
      FROM students s
      LEFT JOIN beds b ON b.id = s.bed_id
      LEFT JOIN rooms r ON r.id = s.room_id
      WHERE s.is_active = TRUE AND COALESCE(s.status, 'ACTIVE') != 'INACTIVE'
    `;
    const params: any[] = [];
    if (orgId) {
      params.push(orgId);
      studentSql += ` AND s.organization_id = $${params.length}`;
    }
    if (targetStudentId) {
      params.push(targetStudentId);
      studentSql += ` AND (s.id = $${params.length} OR s.customer_code = $${params.length} OR s.custom_id = $${params.length})`;
    }

    const students = await queryRows<any>(studentSql, params);

    const invoices: GeneratedInvoice[] = [];
    let generatedCount = 0;
    let skippedCount = 0;

    for (const student of students) {
      // Idempotency: check if invoice already generated for this student & billing month
      const existing = await queryOne<any>(
        `SELECT id, invoice_id, amount_due, due_date, status
         FROM fee_ledgers
         WHERE student_id = $1 AND billing_month = $2 AND transaction_type = 'MONTHLY_INVOICE'`,
        [student.id, dates.billingMonth]
      );

      if (existing) {
        skippedCount++;
        invoices.push({
          id: existing.id,
          invoiceId: existing.invoice_id,
          studentId: student.id,
          customerCode: student.customer_code,
          customId: student.custom_id,
          billingMonth: dates.billingMonth,
          dueDate: typeof existing.due_date === 'string' ? existing.due_date.slice(0, 10) : existing.due_date.toISOString().slice(0, 10),
          amountDue: Number(existing.amount_due),
          status: existing.status,
        });
        continue;
      }

      // Calculate monthly rent amount
      const monthlyRate = Number(
        student.bed_monthly_rate || student.room_monthly_rate || student.room_monthly_rent || 8000.00
      );

      const ledgerId = crypto.randomUUID();
      const invoiceId = `INV-${dates.billingMonth.replace('-', '')}-${(student.custom_id || student.customer_code || student.id).replace(/[^a-zA-Z0-9]/g, '')}`;

      await query(
        `INSERT INTO fee_ledgers (
           id, organization_id, hostel_id, student_id, customer_code, custom_id,
           invoice_id, billing_month, amount, amount_due, base_amount, due_date,
           status, transaction_type, description, grace_period_days, late_fee_applied, stop_notifications
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $9, $10, 'PENDING', 'MONTHLY_INVOICE', $11, 2, 0.00, FALSE)`,
        [
          ledgerId,
          student.organization_id,
          student.hostel_id,
          student.id,
          student.customer_code,
          student.custom_id,
          invoiceId,
          dates.billingMonth,
          monthlyRate,
          dates.dueDateIso,
          `Monthly Rent for ${dates.billingMonth}`,
        ]
      );

      generatedCount++;
      invoices.push({
        id: ledgerId,
        invoiceId,
        studentId: student.id,
        customerCode: student.customer_code,
        customId: student.custom_id,
        billingMonth: dates.billingMonth,
        dueDate: dates.dueDate,
        amountDue: monthlyRate,
        status: 'PENDING',
      });
    }

    return {
      billingMonth: dates.billingMonth,
      dueDate: dates.dueDate,
      generatedCount,
      skippedCount,
      invoices,
    };
  }

  /**
   * 2 & 3. Grace Period, Defaulter Trigger & Late-Fee Penalty Calculations
   * If current_date > due_date + grace_period (i.e. on or past the 8th):
   * - Automatically flips status from PENDING to OVERDUE.
   * - Applies configurable flat late-fee penalty (e.g. ₹500 or ₹100).
   */
  async processOverdueTransitions(options?: {
    currentDate?: Date | string;
    orgId?: string;
  }): Promise<{
    transitionedCount: number;
    updatedInvoices: any[];
  }> {
    const checkDate = options?.currentDate
      ? (typeof options.currentDate === 'string' ? new Date(options.currentDate) : options.currentDate)
      : new Date();

    const checkTimestamp = checkDate.getTime();
    const orgId = options?.orgId;

    let sql = `
      SELECT l.*, h.late_fee_enabled, h.late_fee_amount
      FROM fee_ledgers l
      LEFT JOIN hostels h ON h.id = l.hostel_id
      WHERE l.status = 'PENDING' AND l.transaction_type = 'MONTHLY_INVOICE'
    `;
    const params: any[] = [];
    if (orgId) {
      params.push(orgId);
      sql += ` AND l.organization_id = $${params.length}`;
    }

    const pendingInvoices = await queryRows<any>(sql, params);
    let transitionedCount = 0;
    const updatedInvoices: any[] = [];

    for (const inv of pendingInvoices) {
      if (!inv.due_date) continue;

      const dueStr = typeof inv.due_date === 'string'
        ? inv.due_date
        : (inv.due_date instanceof Date ? inv.due_date.toISOString() : String(inv.due_date));
      
      const year = parseInt(dueStr.slice(0, 4), 10);
      const month = parseInt(dueStr.slice(5, 7), 10);
      const day = parseInt(dueStr.slice(8, 10), 10);
      const graceDays = inv.grace_period_days || 2;

      // Grace period expires at midnight 2 days after due date (e.g., 5th + 2 = end of 7th: 23:59:59.999 UTC)
      const graceExpiry = new Date(Date.UTC(year, month - 1, day + graceDays, 23, 59, 59, 999));

      if (checkTimestamp > graceExpiry.getTime()) {
        // Current date has passed the grace period!
        const baseAmount = Number(inv.base_amount || inv.amount_due || inv.amount);
        const lateFeeEnabled = inv.late_fee_enabled !== false;
        const flatLateFee = lateFeeEnabled ? Number(inv.late_fee_amount || 500.00) : 0.00;
        const newTotalDue = baseAmount + flatLateFee;

        await query(
          `UPDATE fee_ledgers
           SET status = 'OVERDUE',
               amount_due = $1,
               late_fee_applied = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [newTotalDue, flatLateFee, inv.id]
        );

        transitionedCount++;
        updatedInvoices.push({
          id: inv.id,
          invoiceId: inv.invoice_id,
          studentId: inv.student_id,
          previousStatus: 'PENDING',
          newStatus: 'OVERDUE',
          baseAmount,
          lateFeeApplied: flatLateFee,
          newAmountDue: newTotalDue,
        });
      }
    }

    return {
      transitionedCount,
      updatedInvoices,
    };
  }

  /**
   * Cashfree Webhook Reconciliation
   * Reconciles invoice upon receiving payment webhook.
   * Marks status as 'PAID', records paid_on_timestamp, and sets stop_notifications = TRUE.
   */
  async reconcilePaymentWebhook(params: {
    paymentId: string;
    studentId: string;
    amount: number;
    paidAt?: Date | string;
    organizationId?: string;
    invoiceId?: string;
  }): Promise<{
    reconciled: boolean;
    invoiceId?: string;
    paidOnTimestamp?: string;
    previousStatus?: string;
    newStatus: string;
  }> {
    const paidAtDate = params.paidAt
      ? (typeof params.paidAt === 'string' ? new Date(params.paidAt) : params.paidAt)
      : new Date();

    const paidAtIso = paidAtDate.toISOString();

    // Find the matching invoice for this student
    let invoiceQuery = `
      SELECT id, invoice_id, amount_due, status
      FROM fee_ledgers
      WHERE student_id = $1 AND transaction_type = 'MONTHLY_INVOICE'
    `;
    const qParams: any[] = [params.studentId];

    if (params.invoiceId) {
      qParams.push(params.invoiceId);
      invoiceQuery += ` AND invoice_id = $${qParams.length}`;
    } else {
      invoiceQuery += ` AND status IN ('PENDING', 'OVERDUE') ORDER BY due_date ASC LIMIT 1`;
    }

    let invoice = await queryOne<any>(invoiceQuery, qParams);

    // If no specific pending/overdue invoice, fetch latest invoice for this student
    if (!invoice) {
      invoice = await queryOne<any>(
        `SELECT id, invoice_id, amount_due, status
         FROM fee_ledgers
         WHERE student_id = $1 AND transaction_type = 'MONTHLY_INVOICE'
         ORDER BY created_at DESC LIMIT 1`,
        [params.studentId]
      );
    }

    if (!invoice) {
      return {
        reconciled: false,
        newStatus: 'NO_INVOICE_FOUND',
      };
    }

    const previousStatus = invoice.status;

    await query(
      `UPDATE fee_ledgers
       SET status = 'PAID',
           payment_id = $1,
           paid_on_timestamp = $2,
           amount_due = GREATEST(0, amount_due - $3),
           stop_notifications = TRUE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [params.paymentId, paidAtIso, params.amount, invoice.id]
    );

    return {
      reconciled: true,
      invoiceId: invoice.invoice_id,
      paidOnTimestamp: paidAtIso,
      previousStatus,
      newStatus: 'PAID',
    };
  }

  /**
   * Helper to verify if overdue notifications should be suppressed for a student
   */
  async shouldSendOverdueNotification(studentId: string, billingMonth?: string): Promise<boolean> {
    let sql = `
      SELECT status, stop_notifications
      FROM fee_ledgers
      WHERE student_id = $1 AND transaction_type = 'MONTHLY_INVOICE'
    `;
    const params: any[] = [studentId];
    if (billingMonth) {
      params.push(billingMonth);
      sql += ` AND billing_month = $${params.length}`;
    } else {
      sql += ` ORDER BY due_date DESC LIMIT 1`;
    }

    const record = await queryOne<any>(sql, params);
    if (!record) return true;
    if (record.status === 'PAID' || record.stop_notifications === true) {
      return false; // Suppress notification!
    }
    return true;
  }
}

export const financialCalculationService = new FinancialCalculationService();
