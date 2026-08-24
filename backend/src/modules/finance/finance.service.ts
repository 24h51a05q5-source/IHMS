import { query, queryOne, queryRows } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { ExpenseCategory, PaymentMethod, VoucherType } from '../../config/constants';
import { emitRealTimeEvent } from '../../events/events.gateway';

export class FinanceService {
  async recordExpense(orgId: string, branchId: string, data: any): Promise<any> {
    const expenseNumber = 'EXP-' + Date.now();
    const amount = Number(data.amount);
    if (amount <= 0) throw new AppError('Expense amount must be greater than 0', 400);

    const expenseDate = data.date || data.expenseDate ? new Date(data.date || data.expenseDate) : new Date();
    const category = data.category || ExpenseCategory.OTHER;
    const paymentMethod = data.paymentMethod || PaymentMethod.CASH;
    const paidTo = data.paidTo || 'Vendor';
    const expenseId = require('crypto').randomUUID();

    const expense = await queryOne<any>(
      `INSERT INTO expenses (
        id, expense_number, organization_id, hostel_id, category, amount,
        payment_method, paid_to, expense_date, description, invoice_or_bill_number, approved_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, id as "_id", expense_number as "expenseNumber", organization_id as "organizationId",
                hostel_id as "branchId", category, amount, payment_method as "paymentMethod",
                paid_to as "paidTo", expense_date as "expenseDate", expense_date as "date",
                description, invoice_or_bill_number as "invoiceOrBillNumber",
                approved_by as "approvedBy", created_at as "createdAt"`,
      [
        expenseId,
        expenseNumber,
        orgId,
        branchId,
        category,
        amount,
        paymentMethod,
        paidTo,
        expenseDate,
        data.description || '',
        data.invoiceOrBillNumber || '',
        data.approvedBy || 'Manager'
      ]
    );

    const voucherNumber = 'VCH-' + Date.now();
    await query(
      `INSERT INTO vouchers (
        id, voucher_number, voucher_type, organization_id, hostel_id, account,
        debit, credit, voucher_date, narration, reference_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10)`,
      [
        require('crypto').randomUUID(),
        voucherNumber,
        VoucherType.PAYMENT,
        orgId,
        branchId,
        `EXPENSE_${category}`,
        amount,
        expenseDate,
        `Expense paid to ${paidTo} for ${category}: ${data.description || ''}`,
        expenseNumber
      ]
    );

    const { dashboardService } = require('../dashboard/dashboard.service');
    dashboardService.invalidateCache(orgId);

    emitRealTimeEvent('expense.created', { expenseNumber, amount, category, branchId }, { orgId });
    emitRealTimeEvent('dashboard.kpi_updated', { orgId }, { orgId });

    // Audit log so Recent Activity shows real expense events
    await query(
      `INSERT INTO audit_logs (id, organization_id, action, resource, resource_id, details)
       VALUES ($1, $2, 'EXPENSE_RECORDED', 'expenses', $3, $4)`,
      [
        require('crypto').randomUUID(),
        orgId,
        expenseId,
        `Expense of ₹${amount} recorded — ${category}${data.description ? ': ' + data.description : ''}`,
      ]
    ).catch(() => { /* audit log failure must never block expense recording */ });

    return expense;
  }

  async listExpenses(orgId: string, branchId?: string, category?: string) {
    let sql = `SELECT id, id as "_id", expense_number as "expenseNumber", organization_id as "organizationId",
                      hostel_id as "branchId", category, amount, payment_method as "paymentMethod",
                      paid_to as "paidTo", expense_date as "expenseDate", expense_date as "date",
                      description, invoice_or_bill_number as "invoiceOrBillNumber",
                      approved_by as "approvedBy", created_at as "createdAt", updated_at as "updatedAt"
               FROM expenses
               WHERE organization_id = $1`;
    const params: any[] = [orgId];

    if (branchId && branchId !== 'ALL') {
      params.push(branchId);
      sql += ` AND hostel_id = $${params.length}`;
    }
    if (category && category !== 'ALL') {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    sql += ' ORDER BY expense_date DESC, created_at DESC';
    return queryRows(sql, params);
  }

  async listVouchers(orgId: string, branchId?: string) {
    let sql = `SELECT id, id as "_id", voucher_number as "voucherNumber", voucher_type as "voucherType",
                      organization_id as "organizationId", hostel_id as "branchId", account,
                      debit, credit, voucher_date as "voucherDate", voucher_date as "date",
                      narration, reference_id as "referenceId", created_at as "createdAt"
               FROM vouchers
               WHERE organization_id = $1`;
    const params: any[] = [orgId];

    if (branchId && branchId !== 'ALL') {
      params.push(branchId);
      sql += ` AND hostel_id = $${params.length}`;
    }

    sql += ' ORDER BY voucher_date DESC, created_at DESC';
    return queryRows(sql, params);
  }

  async generateProfitAndLoss(orgId: string, branchId?: string, startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date();

    let incSql = `SELECT COALESCE(SUM(amount), 0)::numeric as total
                  FROM payments
                  WHERE organization_id = $1 AND status = 'SUCCESS' AND created_at >= $2 AND created_at <= $3`;
    const incParams: any[] = [orgId, start, end];
    if (branchId && branchId !== 'ALL') {
      incParams.push(branchId);
      incSql += ` AND hostel_id = $${incParams.length}`;
    }
    const incRow = await queryOne<any>(incSql, incParams);
    const totalIncome = Number(incRow?.total || 0);

    let expSql = `SELECT category, COALESCE(SUM(amount), 0)::numeric as total
                  FROM expenses
                  WHERE organization_id = $1 AND expense_date >= $2::date AND expense_date <= $3::date`;
    const expParams: any[] = [orgId, start, end];
    if (branchId && branchId !== 'ALL') {
      expParams.push(branchId);
      expSql += ` AND hostel_id = $${expParams.length}`;
    }
    expSql += ' GROUP BY category ORDER BY total DESC';
    const expenseRows = await queryRows<any>(expSql, expParams);

    const totalExpenses = expenseRows.reduce((acc, cur) => acc + Number(cur.total || 0), 0);
    const netProfitOrLoss = totalIncome - totalExpenses;

    return {
      period: { startDate: start, endDate: end },
      income: {
        totalIncome,
        breakdown: [{ category: 'Hostel Fees & Collections', amount: totalIncome }],
      },
      expenses: {
        totalExpenses,
        byCategory: expenseRows.map((e) => ({ category: e.category, amount: Number(e.total || 0) })),
      },
      summary: {
        totalIncome,
        totalExpenses,
        netProfitOrLoss,
        isProfitable: netProfitOrLoss >= 0,
      },
    };
  }
}

export const financeService = new FinanceService();
