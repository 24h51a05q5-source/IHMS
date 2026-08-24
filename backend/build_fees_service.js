const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

write('src/modules/fees/fee.service.ts', `
import { FeeDemandModel, IFeeDemand } from './fee-demand.schema';
import { PaymentModel, IPayment } from './payment.schema';
import { ReceiptModel, IReceipt } from './receipt.schema';
import { StudentModel } from '../students/student.schema';
import { HostelBranchModel } from '../hostels/hostel.schema';
import { VoucherModel } from '../finance/voucher.schema';
import { AppError } from '../../common/filters/http-exception.filter';
import { generateReceiptNumber } from '../../common/utils/code-generator';
import { generateQrDataUrl } from '../../common/utils/qr-generator';
import { PaymentMethod, PaymentStatus, VoucherType } from '../../config/constants';
import { emitRealTimeEvent } from '../../events/events.gateway';

export class FeeService {
  async createDemand(orgId: string, branchId: string, data: any): Promise<IFeeDemand> {
    const student = await StudentModel.findOne({ _id: data.studentId, organizationId: orgId });
    if (!student) throw new AppError('Student not found', 404);

    const breakdown = {
      hostelRent: Number(data.hostelRent) || 0,
      messFee: Number(data.messFee) || 0,
      admissionFee: Number(data.admissionFee) || 0,
      securityDeposit: Number(data.securityDeposit) || 0,
      laundryFee: Number(data.laundryFee) || 0,
      otherCharges: Number(data.otherCharges) || 0,
    };

    const totalAmount = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const demandNumber = 'DEM-' + Date.now();

    const demand = await FeeDemandModel.create({
      demandNumber,
      organizationId: orgId,
      branchId,
      studentId: student._id.toString(),
      customerCode: student.customerCode,
      academicPeriod: data.academicPeriod || new Date().getFullYear().toString(),
      termName: data.termName || 'Monthly Rent',
      breakdown,
      totalAmount,
      paidAmount: 0,
      balanceAmount: totalAmount,
      dueDate: data.dueDate ? new Date(data.dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'UNPAID',
    });

    student.financialSummary.totalDemanded += totalAmount;
    student.financialSummary.outstandingBalance += totalAmount;
    await student.save();

    emitRealTimeEvent('fee.demand_created', { demandId: demand._id, customerCode: student.customerCode, totalAmount }, { userId: student.userId });
    return demand;
  }

  async recordPayment(orgId: string, data: {
    studentId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    transactionRef?: string;
    notes?: string;
    receivedBy?: string;
    demandId?: string;
  }): Promise<{ payment: IPayment; receipt: IReceipt }> {
    const student = await StudentModel.findOne({ _id: data.studentId, organizationId: orgId });
    if (!student) throw new AppError('Student not found', 404);

    const branch = await HostelBranchModel.findById(student.branchId);
    const hostelCode = branch?.branchCode || 'HYD001';
    const amount = Number(data.amount);

    if (amount <= 0) throw new AppError('Payment amount must be greater than 0', 400);

    const paymentNumber = 'PAY-' + Date.now();
    const transactionRef = data.transactionRef || \`TXN-\${Date.now()}-\${Math.floor(1000 + Math.random() * 9000)}\`;

    const payment = await PaymentModel.create({
      paymentNumber,
      organizationId: orgId,
      branchId: student.branchId,
      studentId: student._id.toString(),
      customerCode: student.customerCode,
      demandId: data.demandId,
      amount,
      paymentMethod: data.paymentMethod || PaymentMethod.UPI,
      transactionRef,
      status: PaymentStatus.SUCCESS,
      notes: data.notes || '',
      receivedBy: data.receivedBy || 'Accountant',
      timestamp: new Date(),
    });

    const receiptNumber = await generateReceiptNumber(orgId, hostelCode);
    const qrPayload = await generateQrDataUrl({
      receiptNumber,
      customerCode: student.customerCode,
      studentName: student.fullName,
      amount,
      method: payment.paymentMethod,
      date: payment.timestamp,
    });

    const receipt = await ReceiptModel.create({
      receiptNumber,
      paymentId: payment._id.toString(),
      organizationId: orgId,
      branchId: student.branchId,
      studentId: student._id.toString(),
      customerCode: student.customerCode,
      studentName: student.fullName,
      amount,
      paymentMethod: payment.paymentMethod,
      transactionRef,
      issuedBy: payment.receivedBy,
      qrPayload,
      issuedAt: new Date(),
    });

    student.financialSummary.totalPaid += amount;
    student.financialSummary.outstandingBalance = Math.max(0, student.financialSummary.totalDemanded - student.financialSummary.totalPaid);
    await student.save();

    let remaining = amount;
    const openDemands = await FeeDemandModel.find({
      organizationId: orgId,
      studentId: student._id.toString(),
      status: { $in: ['UNPAID', 'PARTIAL'] }
    }).sort({ createdAt: 1 });

    for (const dem of openDemands) {
      if (remaining <= 0) break;
      const need = dem.balanceAmount;
      if (remaining >= need) {
        dem.paidAmount += need;
        dem.balanceAmount = 0;
        dem.status = 'PAID';
        remaining -= need;
      } else {
        dem.paidAmount += remaining;
        dem.balanceAmount -= remaining;
        dem.status = 'PARTIAL';
        remaining = 0;
      }
      await dem.save();
    }

    const voucherNumber = 'VCH-' + Date.now();
    await VoucherModel.create({
      voucherNumber,
      voucherType: VoucherType.RECEIPT,
      organizationId: orgId,
      branchId: student.branchId,
      account: 'HOSTEL_FEE_COLLECTION',
      debit: 0,
      credit: amount,
      date: new Date(),
      narration: \`Fee receipt \${receiptNumber} collected from \${student.fullName} (\${student.customerCode})\`,
      referenceId: receiptNumber,
    });

    emitRealTimeEvent('payment.completed', {
      receiptNumber,
      customerCode: student.customerCode,
      amount,
      outstandingBalance: student.financialSummary.outstandingBalance,
      branchId: student.branchId,
    }, { branchId: student.branchId });

    emitRealTimeEvent('dashboard.kpi_updated', { orgId }, { orgId });

    return { payment, receipt };
  }

  async getStatement(orgId: string, studentId: string) {
    const student = await StudentModel.findOne({ _id: studentId, organizationId: orgId });
    if (!student) throw new AppError('Student not found', 404);

    const demands = await FeeDemandModel.find({ organizationId: orgId, studentId }).sort({ createdAt: -1 });
    const payments = await PaymentModel.find({ organizationId: orgId, studentId }).sort({ timestamp: -1 });
    const receipts = await ReceiptModel.find({ organizationId: orgId, studentId }).sort({ issuedAt: -1 });

    return {
      student,
      demands,
      payments,
      receipts,
      summary: student.financialSummary,
    };
  }

  async listReceipts(orgId: string, branchId?: string) {
    const query: any = { organizationId: orgId };
    if (branchId) query.branchId = branchId;
    return ReceiptModel.find(query).sort({ issuedAt: -1 });
  }

  async listPayments(orgId: string, branchId?: string) {
    const query: any = { organizationId: orgId };
    if (branchId) query.branchId = branchId;
    return PaymentModel.find(query).sort({ timestamp: -1 });
  }
}
export const feeService = new FeeService();
`);

write('src/modules/fees/fee.controller.ts', `
import { Router, Request, Response, NextFunction } from 'express';
import { feeService } from './fee.service';
import { StudentModel } from '../students/student.schema';
import { authenticate } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';
import { authorizeRoles } from '../../common/guards/roles.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate, enforceTenantIsolation);

router.post('/demands', authorizeRoles(UserRole.OWNER, UserRole.ACCOUNTANT, UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.body.branchId || req.user!.branchId;
    const demand = await feeService.createDemand(req.user!.organizationId, branchId, req.body);
    res.status(201).json({ success: true, data: demand, message: 'Fee demand generated successfully' });
  } catch (err) { next(err); }
});

router.post('/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let studentId = req.body.studentId;
    if (req.user!.role === UserRole.STUDENT) {
      const student = await StudentModel.findOne({ customerCode: req.user!.customerCode, organizationId: req.user!.organizationId });
      if (!student) return res.status(404).json({ success: false, message: 'Student record not found' });
      studentId = student._id.toString();
    }

    const result = await feeService.recordPayment(req.user!.organizationId, {
      ...req.body,
      studentId,
      receivedBy: req.user!.name,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: \`Payment recorded and Receipt \${result.receipt.receiptNumber} generated successfully\`,
    });
  } catch (err) { next(err); }
});

router.get('/statement/:studentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const statement = await feeService.getStatement(req.user!.organizationId, req.params.studentId);
    res.json({ success: true, data: statement });
  } catch (err) { next(err); }
});

router.get('/my-statement', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== UserRole.STUDENT) {
      return res.status(400).json({ success: false, message: 'Only students can access own statement via this route' });
    }
    const student = await StudentModel.findOne({ customerCode: req.user!.customerCode, organizationId: req.user!.organizationId });
    if (!student) return res.status(404).json({ success: false, message: 'Student record not found' });

    const statement = await feeService.getStatement(req.user!.organizationId, student._id.toString());
    res.json({ success: true, data: statement });
  } catch (err) { next(err); }
});

router.get('/receipts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const receipts = await feeService.listReceipts(req.user!.organizationId, req.query.branchId as string);
    res.json({ success: true, data: receipts });
  } catch (err) { next(err); }
});

router.get('/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payments = await feeService.listPayments(req.user!.organizationId, req.query.branchId as string);
    res.json({ success: true, data: payments });
  } catch (err) { next(err); }
});

export const feeRouter = router;
`);