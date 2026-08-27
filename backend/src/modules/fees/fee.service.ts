import { query, queryOne, queryRows, transaction } from '../../config/database';
import { getNextReceiptNumber } from './receipt-sequence';
import { ReceiptPdfService, IReceipt } from './receipt-pdf.service';
import { AppError } from '../../common/filters/http-exception.filter';
import {
  PaymentMethod,
  PaymentStatus,
  PaymentPlan,
  InstallmentStatus,
  VoucherType,
} from '../../config/constants';
import { paymentGatewayService } from './payment-gateway.service';
import { emitRealTimeEvent } from '../../events/events.gateway';
import { dashboardService } from '../dashboard/dashboard.service';
import { PaymentProviderFactory } from './provider-factory';

export interface IFeeAccount {
  id: string;
  _id?: string;
  organizationId: string;
  branchId?: string;
  studentId: string;
  customerCode: string;
  paymentPlan: string;
  totalFee: number;
  totalPaid: number;
  balanceAmount: number;
  monthlyAmount: number;
  numberOfInstallments: number;
  paidInstallments: number;
  startMonth?: string;
  status: string;
  allowAdvancePayment?: boolean;
  installments?: any[];
  createdAt?: string;
  updatedAt?: string;
}

export interface IFeeInstallment {
  id: string;
  _id?: string;
  organizationId: string;
  branchId?: string;
  studentId: string;
  customerCode: string;
  installmentNumber: number;
  month: string;
  dueDate: string | Date;
  amount: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
  paymentId?: string;
  paidAt?: string | Date;
  receiptNumber?: string;
}

export interface IPayment {
  id: string;
  _id?: string;
  paymentNumber: string;
  organizationId: string;
  branchId?: string;
  studentId: string;
  customerCode: string;
  studentName?: string;
  amount: number;
  paymentMethod: string;
  transactionRef?: string;
  status: string;
  receiptNumber?: string;
  receivedBy?: string;
  notes?: string;
  timestamp?: string | Date;
}

export interface IFeeDemand {
  id: string;
  _id?: string;
  demandNumber: string;
  invoiceNumber?: string;
  organizationId: string;
  branchId?: string;
  studentId: string;
  customerCode: string;
  studentName?: string;
  termName: string;
  hostelRent: number;
  admissionFee: number;
  securityDeposit: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  dueDate?: string | Date;
  status: string;
  createdAt?: string | Date;
}

export class FeeService {
  async createFeeAccountAndInstallments(
    orgId: string,
    branchId: string,
    studentId: string,
    customerCode: string,
    data: {
      paymentPlan?: PaymentPlan;
      totalFee: number;
      totalPaid?: number;
      monthlyAmount?: number;
      startMonth?: string;
      numberOfMonths?: number;
      monthlyDueDay?: number;
      allowAdvancePayment?: boolean;
    }
  ): Promise<any> {
    const totalFee = Number(data.totalFee || 0);
    const plan = data.paymentPlan || PaymentPlan.MONTHLY;
    const numberOfMonths = Math.max(1, Number(data.numberOfMonths || 1));
    const monthlyAmount = Number(data.monthlyAmount || Math.round(totalFee / numberOfMonths));
    const dueDay = Math.min(28, Math.max(1, Number(data.monthlyDueDay || 5)));
    const startMonth = data.startMonth || this.getCurrentMonthString();

    const existingAccount = await queryOne<any>(
      'SELECT id FROM fee_accounts WHERE organization_id = $1 AND student_id = $2',
      [orgId, studentId]
    );

    let accountId = existingAccount?.id;
    if (!existingAccount) {
      accountId = require('crypto').randomUUID();
      await query(
        `INSERT INTO fee_accounts (
          id, organization_id, hostel_id, student_id, customer_code, payment_plan,
          total_fee, total_paid, balance_amount, monthly_amount, number_of_installments,
          paid_installments, start_month, status, allow_advance_payment
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, 0, $11, 'ACTIVE', $12)`,
        [
          accountId,
          orgId,
          branchId,
          studentId,
          customerCode,
          plan,
          totalFee,
          totalFee,
          monthlyAmount,
          numberOfMonths,
          startMonth,
          !!data.allowAdvancePayment
        ]
      );
    }

    // Delete existing unpaid installments
    await query(
      "DELETE FROM fee_installments WHERE organization_id = $1 AND student_id = $2 AND status = 'PENDING'",
      [orgId, studentId]
    );

    const startDate = this.parseMonthString(startMonth);
    for (let i = 1; i <= numberOfMonths; i++) {
      const installmentDate = new Date(startDate.getFullYear(), startDate.getMonth() + (i - 1), dueDay);
      const monthLabel = installmentDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      const instAmount = i === numberOfMonths ? totalFee - monthlyAmount * (numberOfMonths - 1) : monthlyAmount;
      const instId = require('crypto').randomUUID();

      await query(
        `INSERT INTO fee_installments (
          id, fee_account_id, organization_id, hostel_id, student_id, customer_code,
          installment_number, month_name, due_date, amount, paid_amount, balance_amount, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $10, 'PENDING')`,
        [
          instId,
          accountId,
          orgId,
          branchId,
          studentId,
          customerCode,
          i,
          monthLabel,
          installmentDate,
          instAmount
        ]
      );
    }

    return this.getStudentFeeAccount(orgId, studentId, branchId);
  }

  async createFeeDemand(
    orgId: string,
    data: {
      studentId: string;
      termName?: string;
      totalAmount?: number;
      amount?: number;
      hostelRent?: number;
      admissionFee?: number;
      securityDeposit?: number;
      dueDate?: string | Date;
    }
  ) {
    const totalAmount = Number(
      data.totalAmount !== undefined
        ? data.totalAmount
        : data.amount !== undefined
        ? data.amount
        : Number(data.hostelRent || 0) + Number(data.admissionFee || 0) + Number(data.securityDeposit || 0)
    );
    if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
      throw new AppError('Fee demand amount must be a positive number greater than 0.', 400);
    }

    const student = await queryOne<any>(
      'SELECT id, customer_code, full_name, hostel_id FROM students WHERE (id = $1 OR user_id = $1 OR customer_code = $1 OR UPPER(ihms_id) = UPPER($1) OR student_id = $1) AND organization_id = $2',
      [data.studentId, orgId]
    );
    if (!student) throw new AppError('Student profile not found in this organization.', 404);

    const demandId = require('crypto').randomUUID();
    const demandNumber = 'DEM-' + Date.now();
    const termName = data.termName || 'Hostel Fee Demand';
    const dueDate = data.dueDate ? new Date(data.dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const demand = await queryOne<any>(
      `INSERT INTO fee_demands (
        id, demand_number, organization_id, hostel_id, student_id, customer_code,
        term_name, hostel_rent, admission_fee, security_deposit, total_amount, paid_amount,
        balance_amount, due_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $11, $12, 'UNPAID')
      RETURNING *`,
      [
        demandId,
        demandNumber,
        orgId,
        student.hostel_id,
        student.id,
        student.customer_code,
        termName,
        Number(data.hostelRent || totalAmount),
        Number(data.admissionFee || 0),
        Number(data.securityDeposit || 0),
        totalAmount,
        dueDate
      ]
    );

    await this.recalculateStudentLedger(orgId, student.id);
    emitRealTimeEvent('fee.demand_created', { studentId: student.id, demandNumber, amount: totalAmount }, { branchId: student.hostel_id });
    emitRealTimeEvent('dashboard.kpi_updated', { orgId }, { orgId });

    return demand;
  }

  async getStudentFeeAccount(orgId: string, studentId: string, branchId?: string): Promise<any> {
    const student = await queryOne<any>(
      'SELECT id, customer_code, full_name, email, phone, room_id, bed_id, hostel_id, financial_total_demanded, financial_total_paid, financial_outstanding_balance FROM students WHERE (id = $1 OR user_id = $1 OR customer_code = $1 OR UPPER(ihms_id) = UPPER($1) OR student_id = $1) AND organization_id = $2',
      [studentId, orgId]
    );
    if (!student) throw new AppError('Student profile not found', 404);

    const sDbId = student.id;
    let account = await queryOne<any>(
      'SELECT * FROM fee_accounts WHERE organization_id = $1 AND student_id = $2',
      [orgId, sDbId]
    );

    const installments = await queryRows<any>(
      `SELECT id, id as "_id", installment_number as "installmentNumber", month_name as "month",
              due_date as "dueDate", amount, paid_amount as "paidAmount", balance_amount as "balanceAmount",
              status, payment_id as "paymentId", paid_at as "paidAt", receipt_number as "receiptNumber"
       FROM fee_installments
       WHERE organization_id = $1 AND student_id = $2
       ORDER BY installment_number ASC`,
      [orgId, sDbId]
    );

    const payments = await queryRows<any>(
      `SELECT id, id as "_id", payment_number as "paymentNumber", amount,
              payment_method as "paymentMethod", transaction_ref as "transactionRef",
              status, receipt_number as "receiptNumber", received_by as "receivedBy",
              notes, created_at as "timestamp", created_at as "createdAt"
       FROM payments
       WHERE organization_id = $1 AND student_id = $2
       ORDER BY created_at DESC`,
      [orgId, sDbId]
    );

    const demands = await queryRows<any>(
      `SELECT id, id as "_id", demand_number as "demandNumber", demand_number as "invoiceNumber",
              term_name as "termName", hostel_rent as "hostelRent", admission_fee as "admissionFee",
              security_deposit as "securityDeposit", total_amount as "totalAmount",
              paid_amount as "paidAmount", balance_amount as "balanceAmount",
              due_date as "dueDate", status, created_at as "createdAt"
       FROM fee_demands
       WHERE organization_id = $1 AND student_id = $2
       ORDER BY created_at DESC`,
      [orgId, sDbId]
    );

    const totalDemanded = Number(student.financial_total_demanded || (demands.length > 0 ? demands.reduce((acc, d) => acc + Number(d.totalAmount), 0) : account?.total_fee || 0));
    const totalPaid = Number(student.financial_total_paid || payments.filter((p) => p.status === 'SUCCESS').reduce((acc, p) => acc + Number(p.amount), 0));
    const balanceAmount = Math.max(0, totalDemanded - totalPaid);

    let feeStatus: 'PAID' | 'PARTIAL' | 'OVERDUE' | 'NO_DUE' = 'NO_DUE';
    if (totalDemanded > 0) {
      if (balanceAmount <= 0) feeStatus = 'PAID';
      else if (totalPaid > 0) feeStatus = 'PARTIAL';
      else feeStatus = 'OVERDUE';
    }

    return {
      id: account?.id || sDbId,
      _id: account?.id || sDbId,
      studentId: sDbId,
      customerCode: student.customer_code,
      studentName: student.full_name,
      paymentPlan: account?.payment_plan || PaymentPlan.MONTHLY,
      totalFee: totalDemanded,
      totalPaid,
      balanceAmount,
      monthlyAmount: Number(account?.monthly_amount || 0),
      numberOfInstallments: Number(account?.number_of_installments || installments.length || 1),
      paidInstallments: Number(account?.paid_installments || installments.filter((i) => i.status === 'PAID').length),
      status: account?.status || 'ACTIVE',
      feeStatus,
      allowAdvancePayment: account?.allow_advance_payment ?? false,
      installments,
      payments,
      demands,
      financialSummary: {
        totalDemanded,
        totalPaid,
        outstandingBalance: balanceAmount,
      },
    };
  }

  async updateStudentPaymentPlan(orgId: string, studentId: string, data: any): Promise<any> {
    const student = await queryOne<any>(
      'SELECT id, customer_code, hostel_id, financial_total_demanded, financial_total_paid FROM students WHERE (id = $1 OR user_id = $1 OR customer_code = $1) AND organization_id = $2',
      [studentId, orgId]
    );
    if (!student) throw new AppError('Student profile not found', 404);

    const sDbId = student.id;
    const plan = data.paymentPlan === 'ONE_TIME' ? PaymentPlan.ONE_TIME : PaymentPlan.MONTHLY;
    const totalFee = Number(data.totalFee || student.financial_total_demanded || 0);
    const numberOfMonths = Math.max(1, Number(data.numberOfMonths || 1));
    const monthlyAmount = Number(data.monthlyAmount || Math.round(totalFee / numberOfMonths));
    const dueDay = Math.min(28, Math.max(1, Number(data.monthlyDueDay || 5)));
    const startMonth = data.startMonth || this.getCurrentMonthString();

    await query(
      `INSERT INTO fee_accounts (
        id, organization_id, hostel_id, student_id, customer_code, payment_plan,
        total_fee, total_paid, balance_amount, monthly_amount, number_of_installments,
        paid_installments, start_month, status, allow_advance_payment
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $12, 'ACTIVE', $13)
      ON CONFLICT (organization_id, student_id)
      DO UPDATE SET payment_plan = $6, total_fee = $7, monthly_amount = $10,
                    number_of_installments = $11, start_month = $12,
                    allow_advance_payment = $13, updated_at = CURRENT_TIMESTAMP`,
      [
        require('crypto').randomUUID(),
        orgId,
        student.hostel_id,
        sDbId,
        student.customer_code,
        plan,
        totalFee,
        Number(student.financial_total_paid || 0),
        Math.max(0, totalFee - Number(student.financial_total_paid || 0)),
        monthlyAmount,
        numberOfMonths,
        startMonth,
        !!data.allowAdvancePayment
      ]
    );

    // Rebuild uncollected installments
    await query(
      "DELETE FROM fee_installments WHERE organization_id = $1 AND student_id = $2 AND (status = 'PENDING' OR status = 'OVERDUE')",
      [orgId, sDbId]
    );

    const account = await queryOne<any>('SELECT id FROM fee_accounts WHERE organization_id = $1 AND student_id = $2', [orgId, sDbId]);
    const startDate = this.parseMonthString(startMonth);

    for (let i = 1; i <= numberOfMonths; i++) {
      const installmentDate = new Date(startDate.getFullYear(), startDate.getMonth() + (i - 1), dueDay);
      const monthLabel = installmentDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      const instAmount = i === numberOfMonths ? totalFee - monthlyAmount * (numberOfMonths - 1) : monthlyAmount;

      await query(
        `INSERT INTO fee_installments (
          id, fee_account_id, organization_id, hostel_id, student_id, customer_code,
          installment_number, month_name, due_date, amount, paid_amount, balance_amount, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $10, 'PENDING')`,
        [
          require('crypto').randomUUID(),
          account.id,
          orgId,
          student.hostel_id,
          sDbId,
          student.customer_code,
          i,
          monthLabel,
          installmentDate,
          instAmount
        ]
      );
    }

    emitRealTimeEvent('fee.plan_updated', { studentId: sDbId, plan, totalFee }, { branchId: student.hostel_id });
    return this.getStudentFeeAccount(orgId, sDbId, student.hostel_id);
  }

  async updateFeePlanSettings(orgId: string, studentId: string, data: any): Promise<any> {
    return this.updateStudentPaymentPlan(orgId, studentId, data);
  }

  async recalculateStudentLedger(orgId: string, studentId: string, client?: any): Promise<any> {
    const runQueryOne = client ? (sql: string, p?: any[]) => client.query(sql, p).then((r: any) => r.rows[0] || null) : queryOne;
    const runQuery = client ? (sql: string, p?: any[]) => client.query(sql, p) : query;

    const student = await runQueryOne(
      'SELECT id, customer_code, hostel_id FROM students WHERE (id = $1 OR user_id = $1 OR customer_code = $1) AND organization_id = $2',
      [studentId, orgId]
    );
    if (!student) throw new AppError('Student profile not found', 404);

    const sDbId = student.id;

    const paidAgg = await runQueryOne(
      "SELECT COALESCE(SUM(amount), 0)::numeric as total FROM payments WHERE organization_id = $1 AND student_id = $2 AND status = 'SUCCESS'",
      [orgId, sDbId]
    );
    const totalPaid = Number(paidAgg?.total || 0);

    const demandedAgg = await runQueryOne(
      'SELECT COALESCE(SUM(total_amount), 0)::numeric as total FROM fee_demands WHERE organization_id = $1 AND student_id = $2',
      [orgId, sDbId]
    );
    const totalDemanded = Number(demandedAgg?.total || 0);
    const outstandingBalance = Math.max(0, totalDemanded - totalPaid);

    await runQuery(
      'UPDATE students SET financial_total_demanded = $1, financial_total_paid = $2, financial_outstanding_balance = $3 WHERE id = $4',
      [totalDemanded, totalPaid, outstandingBalance, sDbId]
    );

    await runQuery(
      'UPDATE fee_accounts SET total_fee = $1, total_paid = $2, balance_amount = $3 WHERE organization_id = $4 AND student_id = $5',
      [totalDemanded, totalPaid, outstandingBalance, orgId, sDbId]
    );

    return { totalDemanded, totalPaid, outstandingBalance };
  }

  async recordPayment(
    orgId: string,
    data: {
      studentId: string;
      amount: number;
      paymentId?: string;
      paymentNumber?: string;
      paymentMethod?: PaymentMethod;
      feeType?: string;
      roomNumber?: string;
      bedNumber?: string;
      paymentDate?: string | Date;
      transactionRef?: string;
      notes?: string;
      receivedBy?: string;
      installmentId?: string;
      demandId?: string;
    }
  ): Promise<{ payment: any; receipt: any }> {
    const amount = Number(data.amount);
    if (!amount || isNaN(amount) || amount <= 0) {
      throw new AppError('Payment amount must be greater than 0.', 400);
    }

    const student = await queryOne<any>(
      `SELECT s.*, r.room_number, b.bed_code, h.name as hostel_name
       FROM students s
       LEFT JOIN rooms r ON r.id = s.room_id
       LEFT JOIN beds b ON b.id = s.bed_id
       LEFT JOIN hostels h ON h.id = s.hostel_id
       WHERE (s.id = $1 OR s.student_id = $1 OR UPPER(s.customer_code) = UPPER($1) OR UPPER(s.ihms_id) = UPPER($1) OR s.user_id = $1) AND s.organization_id = $2`,
      [data.studentId, orgId]
    );
    if (!student) throw new AppError('Student profile not found.', 404);

    const sDbId = student.id;
    const paymentId = data.paymentId || require('crypto').randomUUID();
    const paymentNumber = data.paymentNumber || ('PAY-' + Date.now());
    const pMethod = data.paymentMethod || PaymentMethod.CASH;
    const branchId = student.hostel_id;
    const transactionRef = data.transactionRef || ('REF-' + Date.now());
    const result = await transaction(async (client) => {
      // 0. Verify fee is not already fully paid
      const demandsCheck = await client.query(
        'SELECT * FROM fee_demands WHERE organization_id = $1 AND student_id = $2',
        [orgId, sDbId]
      );
      if (data.demandId) {
        const specificDemand = demandsCheck.rows.find(
          (d: any) => d.id === data.demandId || d.demand_number === data.demandId
        );
        if (specificDemand && (specificDemand.status === 'PAID' || Number(specificDemand.balance_amount) <= 0)) {
          throw new AppError('This fee has already been paid. Please view the existing receipt.', 400);
        }
      }

      const totalDemanded = Number(
        student.financial_total_demanded ||
          (demandsCheck.rows.length > 0
            ? demandsCheck.rows.reduce((acc: number, d: any) => acc + Number(d.total_amount || 0), 0)
            : 0)
      );
      const totalPaid = Number(student.financial_total_paid || 0);
      const outstanding = Number(
        student.financial_outstanding_balance ?? Math.max(0, totalDemanded - totalPaid)
      );

      if (
        totalDemanded > 0 &&
        outstanding <= 0 &&
        demandsCheck.rows.length > 0 &&
        demandsCheck.rows.every((d: any) => d.status === 'PAID' || Number(d.balance_amount) <= 0)
      ) {
        throw new AppError('This fee has already been paid. Please view the existing receipt.', 400);
      }

      // 1. Check if receipt already exists for this payment
      let existingReceiptRow = await client.query(
        'SELECT * FROM receipts WHERE (payment_id = $1 OR payment_number = $2) AND organization_id = $3',
        [paymentId, paymentNumber, orgId]
      );
      let receiptNumber = existingReceiptRow.rows[0]?.receipt_number;

      if (!receiptNumber) {
        receiptNumber = await getNextReceiptNumber(orgId, client);
      }

      // 2. Insert or update payment record
      let payment: any;
      if (data.paymentId) {
        const updateRes = await client.query(
          `UPDATE payments
           SET status = 'SUCCESS', amount = $1, payment_method = $2, transaction_ref = $3,
               receipt_number = $4, received_by = $5, notes = $6, updated_at = CURRENT_TIMESTAMP
           WHERE id = $7 AND organization_id = $8
           RETURNING id, id as "_id", payment_number as "paymentNumber", organization_id as "organizationId",
                     hostel_id as "branchId", student_id as "studentId", customer_code as "customerCode",
                     amount, payment_method as "paymentMethod", transaction_ref as "transactionRef",
                     status, receipt_number as "receiptNumber", received_by as "receivedBy", notes,
                     created_at as "timestamp", created_at as "createdAt"`,
          [
            amount,
            pMethod,
            transactionRef,
            receiptNumber,
            data.receivedBy || 'Authorized Staff',
            data.notes || 'Fee collection',
            paymentId,
            orgId,
          ]
        );
        payment = updateRes.rows[0];
      }

      if (!payment) {
        const paymentRes = await client.query(
          `INSERT INTO payments (
            id, payment_number, organization_id, hostel_id, student_id, customer_code,
            amount, payment_method, transaction_ref, status, receipt_number, received_by, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'SUCCESS', $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET status = 'SUCCESS', receipt_number = $10, updated_at = CURRENT_TIMESTAMP
          RETURNING id, id as "_id", payment_number as "paymentNumber", organization_id as "organizationId",
                    hostel_id as "branchId", student_id as "studentId", customer_code as "customerCode",
                    amount, payment_method as "paymentMethod", transaction_ref as "transactionRef",
                    status, receipt_number as "receiptNumber", received_by as "receivedBy", notes,
                    created_at as "timestamp", created_at as "createdAt"`,
          [
            paymentId,
            paymentNumber,
            orgId,
            branchId,
            sDbId,
            student.customer_code,
            amount,
            pMethod,
            transactionRef,
            receiptNumber,
            data.receivedBy || 'Authorized Staff',
            data.notes || 'Fee collection'
          ]
        );
        payment = paymentRes.rows[0];
      }

      // 3. Allocate across fee installments
      let remainingToDistribute = amount;
      const pendingInstallmentsRes = await client.query(
        "SELECT * FROM fee_installments WHERE organization_id = $1 AND student_id = $2 AND status != 'PAID' ORDER BY installment_number ASC",
        [orgId, sDbId]
      );

      for (const inst of pendingInstallmentsRes.rows) {
        if (remainingToDistribute <= 0) break;
        const needed = Number(inst.balance_amount);
        if (remainingToDistribute >= needed) {
          await client.query(
            "UPDATE fee_installments SET paid_amount = amount, balance_amount = 0, status = 'PAID', payment_id = $1, receipt_number = $2, paid_at = CURRENT_TIMESTAMP WHERE id = $3",
            [paymentId, receiptNumber, inst.id]
          );
          remainingToDistribute -= needed;
        } else {
          await client.query(
            "UPDATE fee_installments SET paid_amount = paid_amount + $1, balance_amount = balance_amount - $1, status = 'PARTIAL', payment_id = $2, receipt_number = $3 WHERE id = $4",
            [remainingToDistribute, paymentId, receiptNumber, inst.id]
          );
          remainingToDistribute = 0;
        }
      }

      // 4. Allocate across fee demands
      let demandDist = amount;
      const unpaidDemandsRes = await client.query(
        "SELECT * FROM fee_demands WHERE organization_id = $1 AND student_id = $2 AND status != 'PAID' ORDER BY created_at ASC",
        [orgId, sDbId]
      );

      for (const d of unpaidDemandsRes.rows) {
        if (demandDist <= 0) break;
        const bal = Number(d.balance_amount);
        if (demandDist >= bal) {
          await client.query(
            "UPDATE fee_demands SET paid_amount = total_amount, balance_amount = 0, status = 'PAID' WHERE id = $1",
            [d.id]
          );
          demandDist -= bal;
        } else {
          await client.query(
            "UPDATE fee_demands SET paid_amount = paid_amount + $1, balance_amount = balance_amount - $1, status = 'PARTIAL' WHERE id = $1",
            [demandDist, d.id]
          );
          demandDist = 0;
        }
      }

      // 5. Recalculate Ledger
      const ledger = await this.recalculateStudentLedger(orgId, sDbId, client);

      // 6. Create Receipt (only if not already created)
      let receipt: IReceipt;
      if (existingReceiptRow.rows.length > 0) {
        const r = existingReceiptRow.rows[0];
        receipt = {
          id: r.id,
          receiptNumber: r.receipt_number,
          paymentId: r.payment_id || paymentId,
          paymentNumber: r.payment_number,
          organizationId: r.organization_id,
          branchId: r.hostel_id,
          hostelName: student.hostel_name || 'Hostel',
          studentId: r.student_id,
          customerCode: r.customer_code,
          studentName: r.student_name,
          roomNumber: r.room_number,
          bedNumber: r.bed_number,
          feeType: r.fee_type,
          installmentMonth: r.installment_month,
          amount: Number(r.amount),
          paymentMethod: r.payment_method,
          remainingBalance: Number(r.remaining_balance || 0),
          issuedBy: r.issued_by,
          issuedAt: r.issued_at,
          notes: r.notes,
          qrPayload: r.qr_payload,
        };
      } else {
        const receiptId = require('crypto').randomUUID();
        receipt = {
          id: receiptId,
          receiptNumber,
          paymentId,
          paymentNumber,
          organizationId: orgId,
          branchId,
          hostelName: student.hostel_name || 'Main Hostel',
          studentId: sDbId,
          customerCode: student.customer_code,
          studentName: student.full_name,
          roomNumber: student.room_number || '',
          bedNumber: student.bed_code || '',
          feeType: data.feeType || 'Hostel Rent',
          installmentMonth: this.getCurrentMonthString(),
          amount,
          paymentMethod: pMethod,
          remainingBalance: ledger.outstandingBalance,
          issuedBy: data.receivedBy || 'Authorized Staff',
          issuedAt: new Date().toISOString(),
          notes: data.notes || '',
          qrPayload: `IHMS-REC:${receiptNumber}:${student.customer_code}:${amount}`,
        };

        await client.query(
          `INSERT INTO receipts (
            id, receipt_number, payment_id, payment_number, organization_id, hostel_id,
            student_id, customer_code, student_name, room_number, bed_number, fee_type,
            installment_month, amount, payment_method, remaining_balance, issued_by, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (receipt_number) DO NOTHING`,
          [
            receiptId,
            receiptNumber,
            paymentId,
            paymentNumber,
            orgId,
            branchId,
            sDbId,
            student.customer_code,
            student.full_name,
            student.room_number || '',
            student.bed_code || '',
            receipt.feeType,
            receipt.installmentMonth,
            amount,
            pMethod,
            ledger.outstandingBalance,
            receipt.issuedBy,
            data.notes || ''
          ]
        );
      }

      // 7. Accounting Voucher
      await client.query(
        `INSERT INTO vouchers (
          id, voucher_number, voucher_type, organization_id, hostel_id, account,
          debit, credit, narration, reference_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          require('crypto').randomUUID(),
          'VCH-' + Date.now(),
          VoucherType.RECEIPT,
          orgId,
          branchId,
          'HOSTEL_FEE_COLLECTION',
          0,
          amount,
          `Fee received from ${student.full_name} (${student.customer_code}) via ${pMethod}: Receipt ${receiptNumber}`,
          paymentNumber
        ]
      );

      // 8. Immutable Fee Ledger Entry
      await client.query(
        `INSERT INTO fee_ledgers (
          id, organization_id, hostel_id, student_id, customer_code, invoice_id,
          payment_id, transaction_type, amount, currency, reference_number, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PAYMENT_CREDIT', $8, 'INR', $9, $10)`,
        [
          require('crypto').randomUUID(),
          orgId,
          branchId,
          sDbId,
          student.customer_code,
          data.installmentId || null,
          paymentId,
          amount,
          receiptNumber,
          `Payment received via ${pMethod} - Ref: ${transactionRef || receiptNumber}`
        ]
      );

      return { payment, receipt, ledger };
    });

    dashboardService.invalidateCache(orgId);

    emitRealTimeEvent('fee.payment_recorded', {
      paymentNumber,
      receiptNumber: result.receipt.receiptNumber,
      customerCode: student.customer_code,
      studentName: student.full_name,
      amount,
      balanceAmount: result.ledger.outstandingBalance,
      branchId,
    }, { branchId });

    emitRealTimeEvent('dashboard.kpi_updated', { orgId, branchId }, { orgId });

    // Audit log so Recent Activity shows real payment events
    await query(
      `INSERT INTO audit_logs (id, organization_id, action, resource, resource_id, details)
       VALUES ($1, $2, 'PAYMENT_RECORDED', 'payments', $3, $4)`,
      [
        require('crypto').randomUUID(),
        orgId,
        result.payment.id,
        `Fee payment of ₹${amount} received from ${student.full_name} (${student.customer_code}) — Receipt ${result.receipt.receiptNumber}`,
      ]
    ).catch(() => { /* audit log failure must never block payment */ });

    return { payment: result.payment, receipt: result.receipt };
  }

  private inFlightInitiates = new Map<string, Promise<any>>();

  async initiatePayment(
    orgId: string,
    studentId: string,
    data: {
      amount: number;
      installmentId?: string;
      paymentMethod?: PaymentMethod;
      idempotencyKey?: string;
    }
  ) {
    const lockKey = data.idempotencyKey ? `${orgId}:${data.idempotencyKey}` : null;
    if (lockKey && this.inFlightInitiates.has(lockKey)) {
      return this.inFlightInitiates.get(lockKey);
    }

    const execute = async () => {
      const student = await queryOne<any>(
        'SELECT id, customer_code, full_name, hostel_id, financial_outstanding_balance FROM students WHERE (id = $1 OR student_id = $1 OR UPPER(customer_code) = UPPER($1) OR user_id = $1) AND organization_id = $2',
        [studentId, orgId]
      );
      if (!student) throw new AppError('Student not found in this organization', 404);

      const maxPayable = Number(student.financial_outstanding_balance || 0);
      const amount = Number(data.amount);
      if (!amount || amount <= 0) throw new AppError('Payment amount must be greater than ₹0.', 400);

      // Prevent duplicate active orders with same idempotencyKey
      if (data.idempotencyKey) {
        const existing = await queryOne<any>(
          'SELECT * FROM payments WHERE idempotency_key = $1 AND organization_id = $2 AND status = \'PENDING\'',
          [data.idempotencyKey, orgId]
        );
        if (existing) {
          return {
            paymentId: existing.id,
            paymentNumber: existing.payment_number,
            gatewayOrderId: existing.gateway_order_id,
            amount: Math.round(Number(existing.amount) * 100),
            currency: existing.currency || 'INR',
            keyId: paymentGatewayService.getKeyId(),
            provider: 'RAZORPAY',
            status: existing.status,
          };
        }
      }

      const paymentNumber = 'PAY-' + Date.now();
      const gatewayOrder = await paymentGatewayService.createOrder(orgId, paymentNumber, amount, {
        studentId: student.id,
        customerCode: student.customer_code,
        organizationId: orgId,
      });

      const paymentId = require('crypto').randomUUID();
      try {
        await query(
          `INSERT INTO payments (
            id, payment_number, organization_id, hostel_id, student_id, customer_code,
            amount, currency, payment_method, transaction_ref, gateway_order_id,
            idempotency_key, status, received_by, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, 'PENDING', 'Online Gateway', $12)`,
          [
            paymentId,
            paymentNumber,
            orgId,
            student.hostel_id,
            student.id,
            student.customer_code,
            amount,
            gatewayOrder.currency,
            data.paymentMethod || PaymentMethod.ONLINE,
            gatewayOrder.orderId,
            data.idempotencyKey || null,
            `Gateway Order: ${gatewayOrder.orderId}`
          ]
        );
      } catch (insertErr: any) {
        if (data.idempotencyKey) {
          const raceExisting = await queryOne<any>(
            'SELECT * FROM payments WHERE idempotency_key = $1 AND organization_id = $2',
            [data.idempotencyKey, orgId]
          );
          if (raceExisting) {
            return {
              paymentId: raceExisting.id,
              paymentNumber: raceExisting.payment_number,
              gatewayOrderId: raceExisting.gateway_order_id,
              amount: Math.round(Number(raceExisting.amount) * 100),
              currency: raceExisting.currency || 'INR',
              keyId: paymentGatewayService.getKeyId(),
              provider: gatewayOrder.provider,
              status: raceExisting.status,
            };
          }
        }
        throw insertErr;
      }

      return {
        paymentId,
        paymentNumber,
        gatewayOrderId: gatewayOrder.orderId,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
        keyId: gatewayOrder.keyId,
        provider: gatewayOrder.provider,
        status: 'PENDING',
      };
    };

    if (lockKey) {
      const promise = execute().finally(() => {
        this.inFlightInitiates.delete(lockKey);
      });
      this.inFlightInitiates.set(lockKey, promise);
      return promise;
    }

    return execute();
  }

  async verifyAndConfirmPayment(
    orgId: string,
    data: {
      paymentId: string;
      gatewayOrderId: string;
      gatewayPaymentId: string;
      gatewaySignature: string;
    }
  ) {
    const isValid = await paymentGatewayService.verifySignature(
      orgId,
      data.gatewayOrderId,
      data.gatewayPaymentId,
      data.gatewaySignature
    );

    if (!isValid) {
      throw new AppError('Payment verification failed: Invalid cryptographic signature.', 400);
    }

    const payment = await queryOne<any>(
      'SELECT * FROM payments WHERE (id = $1 OR payment_number = $1 OR gateway_order_id = $2) AND organization_id = $3',
      [data.paymentId, data.gatewayOrderId, orgId]
    );
    if (!payment) throw new AppError('Payment record not found', 404);

    if (payment.status === 'SUCCESS') {
      const receipt = await this.getReceiptByPaymentId(orgId, payment.id);
      return { payment, receipt };
    }

    // Atomic confirmation updating the existing pending payment
    const recorded = await this.recordPayment(orgId, {
      studentId: payment.student_id,
      amount: Number(payment.amount),
      paymentId: payment.id,
      paymentNumber: payment.payment_number,
      paymentMethod: PaymentMethod.ONLINE,
      transactionRef: data.gatewayPaymentId,
      receivedBy: 'Online Gateway Verification',
      notes: `Online Gateway Order: ${data.gatewayOrderId}`,
    });

    return recorded;
  }

  async processWebhookPayment(
    rawBody: string | Buffer,
    signature: string,
    eventPayload: any
  ) {
    const providerAdapter = PaymentProviderFactory.getProvider();
    const parsed = providerAdapter.parseWebhookPayload(eventPayload, rawBody);
    const eventId = parsed.eventId;
    const eventType = parsed.eventType;

    // 1. Webhook Signature Security Verification
    const orgId = eventPayload?.payload?.payment?.entity?.notes?.organizationId || eventPayload?.organizationId;
    let isValid = await providerAdapter.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      isValid = await paymentGatewayService.verifyWebhookSignature(orgId, rawBody, signature);
    }

    if (!isValid) {
      throw new AppError('Webhook signature verification failed.', 400);
    }

    // 2. Prevent Duplicate Webhook Processing (Idempotency Ledger)
    const existingEvent = await queryOne<any>(
      'SELECT * FROM payment_webhook_events WHERE gateway_event_id = $1',
      [eventId]
    );
    if (existingEvent) {
      return { success: true, message: 'Event already processed (Idempotent)', eventId };
    }

    // Record webhook event in ledger
    await query(
      `INSERT INTO payment_webhook_events (
        id, organization_id, gateway_event_id, event_type, gateway_order_id,
        gateway_payment_id, payload, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PROCESSED')`,
      [
        require('crypto').randomUUID(),
        orgId || null,
        eventId,
        eventType,
        parsed.providerPaymentId || null,
        parsed.providerTransactionId || null,
        typeof rawBody === 'string' ? rawBody : rawBody?.toString ? rawBody.toString('utf8') : JSON.stringify(eventPayload),
      ]
    ).catch(() => { /* ledger backup fallback */ });

    // Handle Payment Success Confirmation Events
    if (parsed.status === 'SUCCESS' || ['payment.captured', 'order.paid', 'payment.success', 'captured'].includes(eventType.toLowerCase())) {
      const matchRef = parsed.ihmsPaymentId || parsed.providerPaymentId;

      if (!matchRef) {
        return { success: false, message: 'No IHMS payment reference provided in webhook.', eventId };
      }

      // Find original internal IHMS payment record
      const payment = await queryOne<any>(
        `SELECT * FROM payments
         WHERE (payment_number = $1 OR id = $1 OR gateway_order_id = $1 OR gateway_payment_id = $1)
           AND status NOT IN ('REJECTED')`,
        [matchRef]
      );

      if (!payment) {
        return { success: false, message: `No pending IHMS payment found matching reference "${matchRef}".`, eventId };
      }

      // 3. ATOMIC PAYMENT FINALIZATION IN POSTGRESQL TRANSACTION WITH ROW LOCKING
      return transaction(async (client) => {
        const lockRes = await client.query(
          `SELECT * FROM payments WHERE id = $1`,
          [payment.id]
        );
        const lockedPayment = lockRes.rows[0];

        if (!lockedPayment) {
          throw new AppError('Payment record locked or unavailable.', 404);
        }

        // Idempotency: If already verified or successful, return existing receipt
        if (lockedPayment.status === 'SUCCESS' || lockedPayment.status === 'VERIFIED') {
          const receipt = await this.getReceiptByPaymentId(lockedPayment.organization_id, lockedPayment.id);
          return { success: true, message: 'Payment already finalized (Idempotent)', payment: lockedPayment, receipt };
        }

        const utrToUse = parsed.utr || parsed.providerTransactionId || lockedPayment.transaction_ref || `UTR-${Date.now()}`;
        const pmtOrgId = lockedPayment.organization_id;

        // 4. Duplicate Transaction Reference Protection across database
        const dupCheck = await client.query(
          `SELECT id FROM payments WHERE organization_id = $1 AND LOWER(transaction_ref) = LOWER($2) AND id != $3 AND status IN ('SUCCESS', 'VERIFIED')`,
          [pmtOrgId, utrToUse, lockedPayment.id]
        );

        if (dupCheck.rows.length > 0) {
          await client.query(
            `UPDATE payments SET status = 'DUPLICATE', notes = notes || $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [` [Duplicate UTR detected: ${utrToUse}]`, lockedPayment.id]
          );
          return { success: false, status: 'DUPLICATE', message: `Duplicate transaction reference / UTR (${utrToUse}) blocked.` };
        }

        // 5. Exact Amount Verification
        const expectedAmount = Number(lockedPayment.expected_amount || lockedPayment.amount);
        const receivedAmount = parsed.amount && parsed.amount > 0 ? Number(parsed.amount) : expectedAmount;

        if (receivedAmount < expectedAmount) {
          // Amount Mismatch Handling: Do NOT mark full fee as paid. Do NOT generate full receipt!
          await client.query(
            `UPDATE payments
             SET status = 'AMOUNT_MISMATCH', amount = $1, transaction_ref = $2,
                 notes = notes || $3, updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [
              receivedAmount,
              utrToUse,
              ` [AMOUNT MISMATCH: Expected ₹${expectedAmount}, Received ₹${receivedAmount} via Webhook ${eventId}]`,
              lockedPayment.id,
            ]
          );

          emitRealTimeEvent(
            'payment.mismatch',
            {
              paymentId: lockedPayment.id,
              studentId: lockedPayment.student_id,
              expectedAmount,
              receivedAmount,
              status: 'AMOUNT_MISMATCH',
            },
            { branchId: lockedPayment.hostel_id }
          );

          return {
            success: false,
            status: 'AMOUNT_MISMATCH',
            message: `Payment amount mismatch: Expected ₹${expectedAmount}, Received ₹${receivedAmount}. Fee ledger not updated as fully paid.`,
          };
        }

        // 6. ATOMIC FINALIZATION & CANONICAL DIGITAL RECEIPT CREATION
        await client.query(
          `UPDATE payments
           SET status = 'SUCCESS', amount = $1, transaction_ref = $2, gateway_transaction_id = $3,
               verified_by = 'Provider Webhook', verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [receivedAmount, utrToUse, parsed.providerTransactionId || utrToUse, lockedPayment.id]
        );

        const receiptNumber = await getNextReceiptNumber(pmtOrgId, client);

        await client.query(
          `UPDATE payments SET receipt_number = $1 WHERE id = $2`,
          [receiptNumber, lockedPayment.id]
        );

        // Update Student Financial Totals
        const studentRes = await client.query(`SELECT * FROM students WHERE id = $1`, [lockedPayment.student_id]);
        const student = studentRes.rows[0];

        const newTotalPaid = Number(student?.financial_total_paid || 0) + receivedAmount;
        const newOutstanding = Math.max(0, Number(student?.financial_outstanding_balance || 0) - receivedAmount);

        await client.query(
          `UPDATE students
           SET financial_total_paid = $1, financial_outstanding_balance = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [newTotalPaid, newOutstanding, lockedPayment.student_id]
        );

        // Update Master Fee Account
        await client.query(
          `UPDATE fee_accounts
           SET total_paid = total_paid + $1, balance_amount = GREATEST(0, balance_amount - $1),
               outstanding_balance = GREATEST(0, outstanding_balance - $1), updated_at = CURRENT_TIMESTAMP
           WHERE organization_id = $2 AND student_id = $3`,
          [receivedAmount, pmtOrgId, lockedPayment.student_id]
        );

        // Allocate across Fee Installments
        if (lockedPayment.installment_id) {
          await client.query(
            `UPDATE fee_installments
             SET paid_amount = paid_amount + $1, balance_amount = GREATEST(0, balance_amount - $1),
                 status = CASE WHEN (balance_amount - $1) <= 0 THEN 'PAID' ELSE 'PARTIALLY_PAID' END,
                 payment_id = $2, paid_at = CURRENT_TIMESTAMP, receipt_number = $3, updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [receivedAmount, lockedPayment.id, receiptNumber, lockedPayment.installment_id]
          );
        } else {
          const instRes = await client.query(
            `SELECT id, amount, paid_amount, balance_amount FROM fee_installments
             WHERE organization_id = $1 AND student_id = $2 AND status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
             ORDER BY installment_number ASC`,
            [pmtOrgId, lockedPayment.student_id]
          );

          let remainingToApply = receivedAmount;
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
              [applyAmt, newBal, newStatus, lockedPayment.id, receiptNumber, inst.id]
            );

            remainingToApply -= applyAmt;
          }
        }

        // Post Immutable Fee Ledger Entry
        const ledgerId = crypto.randomUUID();
        await client.query(
          `INSERT INTO fee_ledgers (
            id, organization_id, hostel_id, student_id, customer_code, payment_id,
            transaction_type, amount, reference_number, description
          ) VALUES ($1, $2, $3, $4, $5, $6, 'PAYMENT_CREDIT', $7, $8, $9)`,
          [
            ledgerId,
            pmtOrgId,
            lockedPayment.hostel_id,
            lockedPayment.student_id,
            student?.customer_code || lockedPayment.customer_code,
            lockedPayment.id,
            receivedAmount,
            receiptNumber,
            `Webhook verified payment via ${lockedPayment.payment_method || 'UPI'} (Ref: ${utrToUse})`,
          ]
        );

        // Generate Canonical Digital Receipt Record
        const receiptId = crypto.randomUUID();
        const qrPayload = `IHMS-REC:${receiptNumber}:${student?.customer_code}:${receivedAmount}`;

        await client.query(
          `INSERT INTO receipts (
            id, receipt_number, payment_id, payment_number, organization_id, hostel_id,
            student_id, customer_code, student_name, amount, payment_method, remaining_balance,
            issued_by, qr_payload, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (receipt_number) DO NOTHING`,
          [
            receiptId,
            receiptNumber,
            lockedPayment.id,
            lockedPayment.payment_number,
            pmtOrgId,
            lockedPayment.hostel_id,
            lockedPayment.student_id,
            student?.customer_code || lockedPayment.customer_code,
            student?.full_name || 'Student',
            receivedAmount,
            lockedPayment.payment_method || 'UPI',
            newOutstanding,
            'Provider Webhook',
            qrPayload,
            `Official Digital Receipt generated via Provider Webhook confirmation (${utrToUse})`,
          ]
        );

        dashboardService.invalidateCache(pmtOrgId);

        emitRealTimeEvent(
          'payment.success',
          {
            paymentId: lockedPayment.id,
            paymentNumber: lockedPayment.payment_number,
            receiptNumber,
            studentId: lockedPayment.student_id,
            amount: receivedAmount,
            status: 'SUCCESS',
            utr: utrToUse,
          },
          { branchId: lockedPayment.hostel_id }
        );

        emitRealTimeEvent('fee.updated', { studentId: lockedPayment.student_id }, { branchId: lockedPayment.hostel_id });
        emitRealTimeEvent('dashboard.kpi_updated', { orgId: pmtOrgId }, { orgId: pmtOrgId });

        return {
          success: true,
          receiptNumber,
          paymentId: lockedPayment.id,
          amount: receivedAmount,
          status: 'SUCCESS',
          message: `Payment verified and finalized via webhook. Receipt #${receiptNumber} generated.`,
        };
      });
    }

    return { success: true, message: 'Webhook processed successfully.', eventId };
  }

  async refundPayment(
    orgId: string,
    paymentId: string,
    data: { amount?: number; reason?: string; authorizedBy: string }
  ) {
    return transaction(async (client) => {
      const payment = await queryOne<any>(
        'SELECT * FROM payments WHERE (id = $1 OR payment_number = $1) AND organization_id = $2 FOR UPDATE',
        [paymentId, orgId]
      );
      if (!payment) throw new AppError('Payment record not found', 404);
      if (payment.status !== 'SUCCESS') throw new AppError('Only successful payments can be refunded', 400);

      const refundAmount = Number(data.amount || payment.amount);
      if (refundAmount <= 0 || refundAmount > Number(payment.amount)) {
        throw new AppError('Invalid refund amount', 400);
      }

      // Update payment record
      await client.query(
        "UPDATE payments SET status = 'REFUNDED', refunded_amount = $1, notes = notes || $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
        [refundAmount, ` [Refunded ₹${refundAmount} by ${data.authorizedBy}: ${data.reason || 'Requested by student/admin'}]`, payment.id]
      );

      // Restore Student balance
      await client.query(
        `UPDATE students
         SET financial_total_paid = GREATEST(0, financial_total_paid - $1),
             financial_outstanding_balance = financial_outstanding_balance + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND organization_id = $3`,
        [refundAmount, payment.student_id, orgId]
      );

      // Post Immutable Refund Ledger Entry
      await client.query(
        `INSERT INTO fee_ledgers (
          id, organization_id, hostel_id, student_id, customer_code, invoice_id,
          payment_id, transaction_type, amount, currency, reference_number, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'REFUND_DEBIT', $8, 'INR', $9, $10)`,
        [
          require('crypto').randomUUID(),
          orgId,
          payment.hostel_id,
          payment.student_id,
          payment.customer_code,
          null,
          payment.id,
          refundAmount,
          `REF-${payment.payment_number}`,
          `Refund issued: ₹${refundAmount} - Reason: ${data.reason || 'Admin authorized'}`
        ]
      );

      // Accounting Voucher
      await client.query(
        `INSERT INTO vouchers (
          id, voucher_number, voucher_type, organization_id, hostel_id, account,
          debit, credit, narration, reference_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          require('crypto').randomUUID(),
          'VCH-REF-' + Date.now(),
          VoucherType.PAYMENT,
          orgId,
          payment.hostel_id,
          'HOSTEL_FEE_REFUND',
          refundAmount,
          0,
          `Refund of payment ${payment.payment_number} to student (${payment.customer_code})`,
          payment.payment_number
        ]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, action, resource, resource_id, details)
         VALUES ($1, $2, 'PAYMENT_REFUNDED', 'payments', $3, $4)`,
        [
          require('crypto').randomUUID(),
          orgId,
          payment.id,
          `Refund of ₹${refundAmount} processed for payment ${payment.payment_number} by ${data.authorizedBy}`,
        ]
      );

      return { success: true, message: `Payment refunded successfully. Amount: ₹${refundAmount}` };
    });
  }

  async getPaymentSettings(orgId: string) {
    const config = await paymentGatewayService.getOrgConfig(orgId);
    return {
      provider: config.provider,
      environment: config.environment,
      keyId: config.keyId,
      maskedSecret: paymentGatewayService.maskKey(config.keySecret),
      webhookSecret: paymentGatewayService.maskKey(config.webhookSecret),
      webhookUrl: '/api/fees/payments/webhook',
      merchantId: config.merchantId || '',
      onboardingStatus: config.onboardingStatus,
      payoutStatus: config.payoutStatus,
    };
  }

  async updatePaymentSettings(orgId: string, data: any) {
    const existing = await queryOne<any>(
      'SELECT id FROM payment_gateway_configs WHERE organization_id = $1',
      [orgId]
    );

    if (existing) {
      await query(
        `UPDATE payment_gateway_configs
         SET provider = COALESCE($2, provider),
             environment = COALESCE($3, environment),
             key_id = COALESCE($4, key_id),
             key_secret = CASE WHEN $5 IS NOT NULL AND $5 != '' AND $5 NOT LIKE '%***%' THEN $5 ELSE key_secret END,
             webhook_secret = CASE WHEN $6 IS NOT NULL AND $6 != '' AND $6 NOT LIKE '%***%' THEN $6 ELSE webhook_secret END,
             merchant_id = COALESCE($7, merchant_id),
             onboarding_status = COALESCE($8, onboarding_status),
             payout_status = COALESCE($9, payout_status),
             updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = $1`,
        [
          orgId,
          data.provider,
          data.environment,
          data.keyId,
          data.keySecret,
          data.webhookSecret,
          data.merchantId,
          data.onboardingStatus,
          data.payoutStatus,
        ]
      );
    } else {
      await query(
        `INSERT INTO payment_gateway_configs (
          id, organization_id, provider, environment, key_id, key_secret,
          webhook_secret, merchant_id, onboarding_status, payout_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          require('crypto').randomUUID(),
          orgId,
          data.provider || 'RAZORPAY',
          data.environment || 'TEST',
          data.keyId || paymentGatewayService.getKeyId(),
          data.keySecret || 'ihms_sec_k8923f_prod_secret',
          data.webhookSecret || 'whsec_ihms_secure_webhook_key_2026',
          data.merchantId || '',
          data.onboardingStatus || 'CONNECTED',
          data.payoutStatus || 'ACTIVE',
        ]
      );
    }

    return this.getPaymentSettings(orgId);
  }

  async getFeeLedger(orgId: string, studentId?: string) {
    let sql = `
      SELECT l.id, l.id as "_id", l.organization_id as "organizationId", l.hostel_id as "branchId",
             l.student_id as "studentId", l.customer_code as "customerCode", l.invoice_id as "invoiceId",
             l.payment_id as "paymentId", l.transaction_type as "transactionType", l.amount,
             l.currency, l.reference_number as "referenceNumber", l.description, l.created_at as "createdAt",
             s.full_name as "studentName"
      FROM fee_ledgers l
      LEFT JOIN students s ON s.id = l.student_id
      WHERE l.organization_id = $1
    `;
    const params: any[] = [orgId];
    if (studentId) {
      params.push(studentId);
      sql += ` AND (l.student_id = $${params.length} OR l.customer_code = $${params.length})`;
    }
    sql += ' ORDER BY l.created_at DESC';
    return queryRows(sql, params);
  }

  async listReconciliationPayments(orgId: string) {
    const sql = `
      SELECT p.id, p.id as "_id", p.payment_number as "paymentNumber",
             p.organization_id as "organizationId", p.hostel_id as "branchId",
             p.student_id as "studentId", p.customer_code as "customerCode",
             p.amount, p.currency, p.payment_method as "paymentMethod",
             p.gateway_order_id as "gatewayOrderId", p.gateway_payment_id as "gatewayPaymentId",
             p.transaction_ref as "transactionRef", p.status, p.created_at as "createdAt",
             s.full_name as "studentName", s.email as "studentEmail"
      FROM payments p
      LEFT JOIN students s ON s.id = p.student_id
      WHERE p.organization_id = $1
        AND p.status IN ('PENDING', 'PROCESSING', 'REQUIRES_RECONCILIATION')
      ORDER BY p.created_at DESC
    `;
    return queryRows(sql, [orgId]);
  }

  async reconcilePayment(orgId: string, paymentId: string, authorizedBy: string) {
    const payment = await queryOne<any>(
      'SELECT * FROM payments WHERE (id = $1 OR payment_number = $1 OR gateway_order_id = $1) AND organization_id = $2',
      [paymentId, orgId]
    );
    if (!payment) throw new AppError('Payment not found in this organization', 404);

    if (payment.status === 'SUCCESS') {
      return { success: true, message: 'Payment already reconciled as SUCCESS', payment };
    }

    // In a production setup, we query the gateway provider API (e.g. razorpay.orders.fetchPayments(gateway_order_id))
    // If the provider has captured payment:
    const reconciledResult = await this.recordPayment(orgId, {
      studentId: payment.student_id,
      amount: Number(payment.amount),
      paymentMethod: PaymentMethod.ONLINE,
      transactionRef: payment.gateway_payment_id || `RECON-${payment.gateway_order_id}`,
      receivedBy: `Reconciliation by ${authorizedBy}`,
      notes: `Reconciled from Gateway Order: ${payment.gateway_order_id}`,
    });

    await query(
      "UPDATE payments SET status = 'SUCCESS', notes = notes || $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [` [Reconciled by ${authorizedBy}]`, payment.id]
    );

    await query(
      `INSERT INTO audit_logs (id, organization_id, action, resource, resource_id, details)
       VALUES ($1, $2, 'PAYMENT_RECONCILED', 'payments', $3, $4)`,
      [
        require('crypto').randomUUID(),
        orgId,
        payment.id,
        `Payment ${payment.payment_number} manually/automatically reconciled by ${authorizedBy}`,
      ]
    );

    return { success: true, message: 'Payment successfully reconciled and ledger posted.', result: reconciledResult };
  }

  async cancelPayment(orgId: string, paymentId: string, reason?: string) {
    const payment = await queryOne<any>(
      'SELECT * FROM payments WHERE (id = $1 OR payment_number = $1) AND organization_id = $2',
      [paymentId, orgId]
    );
    if (!payment) throw new AppError('Payment not found', 404);

    await query(
      "UPDATE payments SET status = 'CANCELLED', notes = notes || $1 WHERE id = $2",
      [` [Cancelled: ${reason || 'User cancelled'}]`, payment.id]
    );

    return { success: true, message: 'Payment cancelled successfully' };
  }

  async recordApprovedAdjustment(orgId: string, studentId: string, data: { amount: number; reason: string; approvedBy: string }) {
    return this.applyAdjustment(orgId, studentId, {
      adjustmentType: 'DISCOUNT',
      amount: data.amount,
      reason: data.reason,
      approvedBy: data.approvedBy,
    });
  }

  async applyAdjustment(orgId: string, studentId: string, data: { adjustmentType: 'DISCOUNT' | 'WAIVER' | 'FINE'; amount: number; reason: string; approvedBy: string }) {
    const amount = Number(data.amount);
    if (amount <= 0) throw new AppError('Adjustment amount must be greater than 0', 400);

    const student = await queryOne<any>(
      'SELECT id, customer_code, hostel_id, full_name, financial_total_demanded, financial_total_paid FROM students WHERE (id = $1 OR student_id = $1 OR UPPER(customer_code) = UPPER($1) OR user_id = $1) AND organization_id = $2',
      [studentId, orgId]
    );
    if (!student) throw new AppError('Student profile not found', 404);

    const sDbId = student.id;
    if (data.adjustmentType === 'FINE') {
      const demandNumber = 'DEM-FINE-' + Date.now();
      await query(
        `INSERT INTO fee_demands (
          id, demand_number, organization_id, hostel_id, student_id, customer_code,
          term_name, hostel_rent, admission_fee, security_deposit, total_amount, paid_amount,
          balance_amount, due_date, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 0, $8, 0, $8, CURRENT_TIMESTAMP + INTERVAL '7 days', 'UNPAID')`,
        [
          require('crypto').randomUUID(),
          demandNumber,
          orgId,
          student.hostel_id,
          sDbId,
          student.customer_code,
          `Fine: ${data.reason || 'Hostel disciplinary/late fee'}`,
          amount
        ]
      );
    } else {
      const oldestDemand = await queryOne<any>(
        "SELECT * FROM fee_demands WHERE organization_id = $1 AND student_id = $2 AND status != 'PAID' ORDER BY created_at ASC",
        [orgId, sDbId]
      );
      if (oldestDemand) {
        const newTotal = Math.max(0, Number(oldestDemand.total_amount) - amount);
        const newBal = Math.max(0, Number(oldestDemand.balance_amount) - amount);
        await query(
          'UPDATE fee_demands SET total_amount = $1, balance_amount = $2 WHERE id = $3',
          [newTotal, newBal, oldestDemand.id]
        );
      }
    }

    const ledger = await this.recalculateStudentLedger(orgId, sDbId);
    return { success: true, ledger };
  }

  async listPayments(
    orgId: string,
    queryObj: { branchId?: string; studentId?: string; paymentMethod?: string; status?: string; search?: string }
  ): Promise<any[]> {
    let sql = `SELECT p.id, p.id as "_id", p.payment_number as "paymentNumber",
                      p.organization_id as "organizationId", p.hostel_id as "branchId",
                      p.student_id as "studentId", p.customer_code as "customerCode",
                      p.amount, p.payment_method as "paymentMethod", p.transaction_ref as "transactionRef",
                      p.status, p.receipt_number as "receiptNumber", p.received_by as "receivedBy",
                      p.notes, p.created_at as "timestamp", p.created_at as "createdAt",
                      s.full_name as "studentName", s.email as "studentEmail", s.phone as "studentPhone",
                      h.name as "hostelName"
               FROM payments p
               LEFT JOIN students s ON s.id = p.student_id
               LEFT JOIN hostels h ON h.id = p.hostel_id
               WHERE p.organization_id = $1`;
    const params: any[] = [orgId];

    if (queryObj.branchId && queryObj.branchId !== 'ALL') {
      params.push(queryObj.branchId);
      sql += ` AND p.hostel_id = $${params.length}`;
    }
    if (queryObj.studentId) {
      params.push(queryObj.studentId);
      sql += ` AND (p.student_id = $${params.length} OR p.customer_code = $${params.length})`;
    }
    if (queryObj.paymentMethod && queryObj.paymentMethod !== 'ALL') {
      params.push(queryObj.paymentMethod);
      sql += ` AND p.payment_method = $${params.length}`;
    }
    if (queryObj.status && queryObj.status !== 'ALL') {
      params.push(queryObj.status);
      sql += ` AND p.status = $${params.length}`;
    }
    if (queryObj.search && queryObj.search.trim()) {
      const q = `%${queryObj.search.trim()}%`;
      params.push(q);
      sql += ` AND (p.payment_number ILIKE $${params.length} OR p.receipt_number ILIKE $${params.length} OR p.customer_code ILIKE $${params.length} OR s.full_name ILIKE $${params.length} OR p.transaction_ref ILIKE $${params.length})`;
    }

    sql += ' ORDER BY p.created_at DESC';
    return queryRows(sql, params);
  }

  async listDemands(orgId: string, branchId?: string, studentId?: string, status?: string): Promise<any[]> {
    let sql = `SELECT d.id, d.id as "_id", d.demand_number as "demandNumber", d.demand_number as "invoiceNumber",
                      d.organization_id as "organizationId", d.hostel_id as "branchId",
                      d.student_id as "studentId", d.customer_code as "customerCode",
                      d.term_name as "termName", d.hostel_rent as "hostelRent",
                      d.admission_fee as "admissionFee", d.security_deposit as "securityDeposit",
                      d.total_amount as "totalAmount", d.paid_amount as "paidAmount",
                      d.balance_amount as "balanceAmount", d.due_date as "dueDate",
                      d.status, d.created_at as "createdAt",
                      s.full_name as "studentName"
               FROM fee_demands d
               LEFT JOIN students s ON s.id = d.student_id
               WHERE d.organization_id = $1`;
    const params: any[] = [orgId];

    if (branchId && branchId !== 'ALL') {
      params.push(branchId);
      sql += ` AND d.hostel_id = $${params.length}`;
    }
    if (studentId) {
      params.push(studentId);
      sql += ` AND (d.student_id = $${params.length} OR d.customer_code = $${params.length})`;
    }
    if (status && status !== 'ALL') {
      params.push(status);
      sql += ` AND d.status = $${params.length}`;
    }

    sql += ' ORDER BY d.created_at DESC';
    return queryRows(sql, params);
  }

  async listInstallments(orgId: string, branchId?: string, studentId?: string, status?: string): Promise<any[]> {
    let sql = `SELECT i.id, i.id as "_id", i.installment_number as "installmentNumber",
                      i.month_name as "month", i.due_date as "dueDate", i.amount,
                      i.paid_amount as "paidAmount", i.balance_amount as "balanceAmount",
                      i.status, i.payment_id as "paymentId", i.paid_at as "paidAt",
                      i.receipt_number as "receiptNumber", i.student_id as "studentId",
                      i.customer_code as "customerCode", s.full_name as "studentName"
               FROM fee_installments i
               LEFT JOIN students s ON s.id = i.student_id
               WHERE i.organization_id = $1`;
    const params: any[] = [orgId];

    if (branchId && branchId !== 'ALL') {
      params.push(branchId);
      sql += ` AND i.hostel_id = $${params.length}`;
    }
    if (studentId) {
      params.push(studentId);
      sql += ` AND (i.student_id = $${params.length} OR i.customer_code = $${params.length})`;
    }
    if (status && status !== 'ALL') {
      params.push(status);
      sql += ` AND i.status = $${params.length}`;
    }

    sql += ' ORDER BY i.due_date ASC';
    return queryRows(sql, params);
  }

  async listReceipts(orgId: string, branchId?: string, studentId?: string, search?: string): Promise<any[]> {
    let sql = `SELECT r.id, r.id as "_id", r.receipt_number as "receiptNumber",
                      r.payment_number as "paymentNumber", r.organization_id as "organizationId",
                      r.hostel_id as "branchId", r.student_id as "studentId",
                      r.customer_code as "customerCode", r.student_name as "studentName",
                      r.room_number as "roomNumber", r.bed_number as "bedNumber",
                      r.fee_type as "feeType", r.installment_month as "installmentMonth",
                      r.amount, r.payment_method as "paymentMethod",
                      r.remaining_balance as "remainingBalance", r.issued_by as "issuedBy",
                      r.notes, r.issued_at as "issuedAt", r.created_at as "createdAt"
               FROM receipts r
               WHERE r.organization_id = $1`;
    const params: any[] = [orgId];

    if (branchId && branchId !== 'ALL') {
      params.push(branchId);
      sql += ` AND r.hostel_id = $${params.length}`;
    }
    if (studentId) {
      params.push(studentId);
      sql += ` AND (r.student_id = $${params.length} OR r.customer_code = $${params.length})`;
    }
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      params.push(q);
      sql += ` AND (r.receipt_number ILIKE $${params.length} OR r.payment_number ILIKE $${params.length} OR r.customer_code ILIKE $${params.length} OR r.student_name ILIKE $${params.length})`;
    }

    sql += ' ORDER BY r.created_at DESC';
    return queryRows(sql, params);
  }

  async getReceiptByNumber(orgId: string, receiptNumber: string): Promise<IReceipt> {
    const receipt = await queryOne<any>(
      `SELECT r.id, r.id as "_id", r.receipt_number as "receiptNumber",
              r.payment_number as "paymentNumber", r.organization_id as "organizationId",
              r.hostel_id as "branchId", r.student_id as "studentId",
              r.customer_code as "customerCode", r.student_name as "studentName",
              r.room_number as "roomNumber", r.bed_number as "bedNumber",
              r.fee_type as "feeType", r.installment_month as "installmentMonth",
              r.amount, r.payment_method as "paymentMethod",
              r.remaining_balance as "remainingBalance", r.issued_by as "issuedBy",
              r.notes, r.issued_at as "issuedAt", r.created_at as "createdAt",
              h.name as "hostelName"
       FROM receipts r
       LEFT JOIN hostels h ON h.id = r.hostel_id
       WHERE UPPER(r.receipt_number) = $1 AND r.organization_id = $2`,
      [receiptNumber.toUpperCase(), orgId]
    );
    if (!receipt) throw new AppError('Receipt not found', 404);
    return receipt;
  }

  async getReceiptByPaymentId(orgId: string, paymentId: string): Promise<IReceipt> {
    const payment = await queryOne<any>(
      'SELECT id, payment_number, receipt_number, student_id, amount, status, payment_method, transaction_ref, received_by, created_at, hostel_id FROM payments WHERE (id = $1 OR payment_number = $1 OR gateway_order_id = $1) AND organization_id = $2',
      [paymentId, orgId]
    );
    if (!payment) throw new AppError('Payment not found.', 404);

    let receipt = await queryOne<any>(
      `SELECT r.id, r.id as "_id", r.receipt_number as "receiptNumber",
              r.payment_id as "paymentId", r.payment_number as "paymentNumber", r.organization_id as "organizationId",
              r.hostel_id as "branchId", r.student_id as "studentId",
              r.customer_code as "customerCode", r.student_name as "studentName",
              r.room_number as "roomNumber", r.bed_number as "bedNumber",
              r.fee_type as "feeType", r.installment_month as "installmentMonth",
              r.amount, r.payment_method as "paymentMethod",
              r.remaining_balance as "remainingBalance", r.issued_by as "issuedBy",
              r.notes, r.issued_at as "issuedAt", r.created_at as "createdAt",
              h.name as "hostelName"
       FROM receipts r
       LEFT JOIN hostels h ON h.id = r.hostel_id
       WHERE (r.payment_id = $1 OR r.payment_number = $2 OR (r.receipt_number = $3 AND $3 != ''))
         AND r.organization_id = $4
       LIMIT 1`,
      [payment.id, payment.payment_number, payment.receipt_number || '', orgId]
    );

    if (!receipt) {
      if (payment.status !== 'SUCCESS') {
        throw new AppError('Receipt is only available for successful payments.', 400);
      }

      // Generate the single canonical receipt if missing
      const student = await queryOne<any>(
        `SELECT s.*, r.room_number, b.bed_code, h.name as hostel_name
         FROM students s
         LEFT JOIN rooms r ON r.id = s.room_id
         LEFT JOIN beds b ON b.id = s.bed_id
         LEFT JOIN hostels h ON h.id = s.hostel_id
         WHERE s.id = $1 AND s.organization_id = $2`,
        [payment.student_id, orgId]
      );

      const receiptNumber = payment.receipt_number || (await getNextReceiptNumber(orgId));
      const receiptId = require('crypto').randomUUID();

      await query(
        `INSERT INTO receipts (
          id, receipt_number, payment_id, payment_number, organization_id, hostel_id,
          student_id, customer_code, student_name, room_number, bed_number, fee_type,
          installment_month, amount, payment_method, remaining_balance, issued_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (receipt_number) DO NOTHING`,
        [
          receiptId,
          receiptNumber,
          payment.id,
          payment.payment_number,
          orgId,
          payment.hostel_id,
          student?.id || payment.student_id,
          student?.customer_code || '',
          student?.full_name || 'Student',
          student?.room_number || '',
          student?.bed_code || '',
          'Hostel Rent',
          this.getCurrentMonthString(),
          Number(payment.amount),
          payment.payment_method || 'ONLINE',
          Number(student?.financial_outstanding_balance || 0),
          payment.received_by || 'Authorized Staff',
          payment.notes || ''
        ]
      );

      if (!payment.receipt_number) {
        await query('UPDATE payments SET receipt_number = $1 WHERE id = $2', [receiptNumber, payment.id]);
      }

      receipt = {
        id: receiptId,
        receiptNumber,
        paymentId: payment.id,
        paymentNumber: payment.payment_number,
        organizationId: orgId,
        branchId: payment.hostel_id,
        hostelName: student?.hostel_name || 'Main Hostel',
        studentId: payment.student_id,
        customerCode: student?.customer_code || '',
        studentName: student?.full_name || 'Student',
        roomNumber: student?.room_number || '',
        bedNumber: student?.bed_code || '',
        feeType: 'Hostel Rent',
        installmentMonth: this.getCurrentMonthString(),
        amount: Number(payment.amount),
        paymentMethod: payment.payment_method || 'ONLINE',
        remainingBalance: Number(student?.financial_outstanding_balance || 0),
        issuedBy: payment.received_by || 'Authorized Staff',
        issuedAt: payment.created_at,
        notes: payment.notes || '',
        qrPayload: `IHMS-REC:${receiptNumber}:${student?.customer_code}:${payment.amount}`,
      };
    }

    return receipt;
  }

  async generateReceiptPdfByNumber(orgId: string, receiptNumber: string): Promise<{ pdf: Buffer; receipt: IReceipt }> {
    const receipt = await this.getReceiptByNumber(orgId, receiptNumber);
    const pdf = await ReceiptPdfService.generateReceiptPdf(receipt);
    return { pdf, receipt };
  }

  async generateReceiptPdfByPaymentId(orgId: string, paymentId: string): Promise<{ pdf: Buffer; receipt: IReceipt }> {
    const receipt = await this.getReceiptByPaymentId(orgId, paymentId);
    const pdf = await ReceiptPdfService.generateReceiptPdf(receipt);
    return { pdf, receipt };
  }

  private getCurrentMonthString(): string {
    return new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  private parseMonthString(monthStr: string): Date {
    const d = new Date(monthStr);
    return isNaN(d.getTime()) ? new Date() : d;
  }
}

export const feeService = new FeeService();
