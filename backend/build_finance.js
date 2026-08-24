const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

write('src/modules/finance/expense.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';
import { ExpenseCategory, PaymentMethod } from '../../config/constants';

export interface IExpense extends Document {
  expenseNumber: string;
  organizationId: string;
  branchId: string;
  category: ExpenseCategory;
  amount: number;
  paymentMethod: PaymentMethod;
  paidTo: string;
  date: Date;
  description: string;
  invoiceOrBillNumber?: string;
  approvedBy: string;
  createdAt: Date;
}

const ExpenseSchema = new Schema<IExpense>({
  expenseNumber: { type: String, required: true },
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  category: { type: String, enum: Object.values(ExpenseCategory), required: true, index: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, enum: Object.values(PaymentMethod), default: PaymentMethod.CASH },
  paidTo: { type: String, required: true },
  date: { type: Date, default: Date.now },
  description: { type: String, default: '' },
  invoiceOrBillNumber: { type: String },
  approvedBy: { type: String, default: 'Admin' },
}, { timestamps: true });

ExpenseSchema.index({ organizationId: 1, date: -1 });

export const ExpenseModel = mongoose.model<IExpense>('Expense', ExpenseSchema);
`);

write('src/modules/finance/voucher.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';
import { VoucherType } from '../../config/constants';

export interface IVoucher extends Document {
  voucherNumber: string;
  voucherType: VoucherType;
  organizationId: string;
  branchId: string;
  account: string;
  debit: number;
  credit: number;
  date: Date;
  narration: string;
  referenceId?: string;
  isReversal: boolean;
  createdAt: Date;
}

const VoucherSchema = new Schema<IVoucher>({
  voucherNumber: { type: String, required: true },
  voucherType: { type: String, enum: Object.values(VoucherType), required: true },
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  account: { type: String, required: true, index: true },
  debit: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  date: { type: Date, default: Date.now },
  narration: { type: String, required: true },
  referenceId: { type: String },
  isReversal: { type: Boolean, default: false },
}, { timestamps: true });

VoucherSchema.index({ organizationId: 1, date: -1 });

export const VoucherModel = mongoose.model<IVoucher>('Voucher', VoucherSchema);
`);

write('src/modules/finance/finance.service.ts', `
import { ExpenseModel, IExpense } from './expense.schema';
import { VoucherModel } from './voucher.schema';
import { PaymentModel } from '../fees/payment.schema';
import { AppError } from '../../common/filters/http-exception.filter';
import { ExpenseCategory, PaymentMethod, PaymentStatus, VoucherType } from '../../config/constants';
import { emitRealTimeEvent } from '../../events/events.gateway';

export class FinanceService {
  async recordExpense(orgId: string, branchId: string, data: any): Promise<IExpense> {
    const expenseNumber = 'EXP-' + Date.now();
    const amount = Number(data.amount);
    if (amount <= 0) throw new AppError('Expense amount must be greater than 0', 400);

    const expense = await ExpenseModel.create({
      expenseNumber,
      organizationId: orgId,
      branchId,
      category: data.category || ExpenseCategory.OTHER,
      amount,
      paymentMethod: data.paymentMethod || PaymentMethod.CASH,
      paidTo: data.paidTo || 'Vendor',
      date: data.date ? new Date(data.date) : new Date(),
      description: data.description || '',
      invoiceOrBillNumber: data.invoiceOrBillNumber,
      approvedBy: data.approvedBy || 'Manager',
    });

    const voucherNumber = 'VCH-' + Date.now();
    await VoucherModel.create({
      voucherNumber,
      voucherType: VoucherType.PAYMENT,
      organizationId: orgId,
      branchId,
      account: \`EXPENSE_\${expense.category}\`,
      debit: amount,
      credit: 0,
      date: expense.date,
      narration: \`Expense paid to \${expense.paidTo} for \${expense.category}: \${expense.description}\`,
      referenceId: expenseNumber,
    });

    emitRealTimeEvent('expense.created', { expenseNumber, amount, category: expense.category, branchId }, { orgId });
    emitRealTimeEvent('dashboard.kpi_updated', { orgId }, { orgId });

    return expense;
  }

  async listExpenses(orgId: string, branchId?: string, category?: string) {
    const query: any = { organizationId: orgId };
    if (branchId) query.branchId = branchId;
    if (category) query.category = category;
    return ExpenseModel.find(query).sort({ date: -1 });
  }

  async listVouchers(orgId: string, branchId?: string) {
    const query: any = { organizationId: orgId };
    if (branchId) query.branchId = branchId;
    return VoucherModel.find(query).sort({ date: -1 });
  }

  async generateProfitAndLoss(orgId: string, branchId?: string, startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date();

    const matchStage: any = {
      organizationId: orgId,
      timestamp: { $gte: start, $lte: end },
      status: PaymentStatus.SUCCESS,
    };
    if (branchId) matchStage.branchId = branchId;

    const incomeAgg = await PaymentModel.aggregate([
      { $match: matchStage },
      { $group: { _id: null, totalIncome: { $sum: '$amount' } } }
    ]);
    const totalIncome = incomeAgg.length > 0 ? incomeAgg[0].totalIncome : 0;

    const expMatchStage: any = {
      organizationId: orgId,
      date: { $gte: start, $lte: end },
    };
    if (branchId) expMatchStage.branchId = branchId;

    const expenseCategoryAgg = await ExpenseModel.aggregate([
      { $match: expMatchStage },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } }
    ]);

    const totalExpenses = expenseCategoryAgg.reduce((acc, cur) => acc + cur.total, 0);
    const netProfitOrLoss = totalIncome - totalExpenses;

    return {
      period: { startDate: start, endDate: end },
      income: {
        totalIncome,
        breakdown: [{ category: 'Hostel Fees & Collections', amount: totalIncome }],
      },
      expenses: {
        totalExpenses,
        byCategory: expenseCategoryAgg.map(e => ({ category: e._id, amount: e.total })),
      },
      summary: {
        totalIncome,
        totalExpenses,
        netProfitOrLoss,
        isProfitable: netProfitOrLoss >= 0,
      }
    };
  }
}
export const financeService = new FinanceService();
`);

write('src/modules/finance/finance.controller.ts', `
import { Router, Request, Response, NextFunction } from 'express';
import { financeService } from './finance.service';
import { authenticate } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';
import { authorizeRoles } from '../../common/guards/roles.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate, enforceTenantIsolation);

router.post('/expenses', authorizeRoles(UserRole.OWNER, UserRole.ACCOUNTANT, UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.body.branchId || req.user!.branchId;
    const expense = await financeService.recordExpense(req.user!.organizationId, branchId, {
      ...req.body,
      approvedBy: req.user!.name,
    });
    res.status(201).json({ success: true, data: expense, message: 'Expense recorded and journal entry posted.' });
  } catch (err) { next(err); }
});

router.get('/expenses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId, category } = req.query;
    const expenses = await financeService.listExpenses(req.user!.organizationId, branchId as string, category as string);
    res.json({ success: true, data: expenses });
  } catch (err) { next(err); }
});

router.get('/vouchers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vouchers = await financeService.listVouchers(req.user!.organizationId, req.query.branchId as string);
    res.json({ success: true, data: vouchers });
  } catch (err) { next(err); }
});

router.get('/profit-and-loss', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId, startDate, endDate } = req.query;
    const report = await financeService.generateProfitAndLoss(
      req.user!.organizationId,
      branchId as string,
      startDate as string,
      endDate as string
    );
    res.json({ success: true, data: report });
  } catch (err) { next(err); }
});

export const financeRouter = router;
`);