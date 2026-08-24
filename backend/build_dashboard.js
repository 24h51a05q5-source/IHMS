const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

write('src/modules/dashboard/dashboard.service.ts', `
import { HostelBranchModel } from '../hostels/hostel.schema';
import { BedModel } from '../rooms/bed.schema';
import { StudentModel } from '../students/student.schema';
import { PaymentModel } from '../fees/payment.schema';
import { FeeDemandModel } from '../fees/fee-demand.schema';
import { ExpenseModel } from '../finance/expense.schema';
import { ComplaintModel } from '../complaints/complaint.schema';
import { LeaveRequestModel } from '../attendance/leave.schema';
import { VisitorModel } from '../visitors/visitor.schema';
import { BedStatus, ComplaintStatus, LeaveStatus, PaymentStatus, StudentStatus } from '../../config/constants';

export class DashboardService {
  async getStats(orgId: string, branchId?: string) {
    const branchFilter: any = { organizationId: orgId };
    if (branchId) branchFilter.branchId = branchId;

    // 1. Bed Occupancy Metrics
    const totalBranches = await HostelBranchModel.countDocuments({ organizationId: orgId });
    const totalBeds = await BedModel.countDocuments(branchFilter);
    const occupiedBeds = await BedModel.countDocuments({ ...branchFilter, status: BedStatus.OCCUPIED });
    const availableBeds = await BedModel.countDocuments({ ...branchFilter, status: BedStatus.AVAILABLE });
    const maintenanceBeds = await BedModel.countDocuments({ ...branchFilter, status: BedStatus.MAINTENANCE });
    const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    // 2. Student Metrics
    const totalStudents = await StudentModel.countDocuments({ ...branchFilter, status: StudentStatus.ACTIVE });

    // 3. Financial Metrics (Current Month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const paymentMatch: any = {
      organizationId: orgId,
      timestamp: { $gte: startOfMonth, $lte: endOfMonth },
      status: PaymentStatus.SUCCESS,
    };
    if (branchId) paymentMatch.branchId = branchId;

    const monthlyIncomeAgg = await PaymentModel.aggregate([
      { $match: paymentMatch },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const monthlyIncome = monthlyIncomeAgg.length > 0 ? monthlyIncomeAgg[0].total : 0;

    const expenseMatch: any = {
      organizationId: orgId,
      date: { $gte: startOfMonth, $lte: endOfMonth },
    };
    if (branchId) expenseMatch.branchId = branchId;

    const monthlyExpenseAgg = await ExpenseModel.aggregate([
      { $match: expenseMatch },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const monthlyExpenses = monthlyExpenseAgg.length > 0 ? monthlyExpenseAgg[0].total : 0;
    const netProfitOrLoss = monthlyIncome - monthlyExpenses;

    // 4. Lifetime Collection & Outstanding Balance
    const studentDuesAgg = await StudentModel.aggregate([
      { $match: { organizationId: orgId, ...(branchId ? { branchId } : {}) } },
      {
        $group: {
          _id: null,
          totalDemanded: { $sum: '$financialSummary.totalDemanded' },
          totalPaid: { $sum: '$financialSummary.totalPaid' },
          totalOutstanding: { $sum: '$financialSummary.outstandingBalance' }
        }
      }
    ]);
    const totalDemanded = studentDuesAgg.length > 0 ? studentDuesAgg[0].totalDemanded : 0;
    const totalCollected = studentDuesAgg.length > 0 ? studentDuesAgg[0].totalPaid : 0;
    const totalOutstanding = studentDuesAgg.length > 0 ? studentDuesAgg[0].totalOutstanding : 0;
    const collectionPercentage = totalDemanded > 0 ? Math.round((totalCollected / totalDemanded) * 100) : 100;

    // 5. Operations & Pending Approvals
    const pendingComplaints = await ComplaintModel.countDocuments({
      organizationId: orgId,
      ...(branchId ? { branchId } : {}),
      status: { $in: [ComplaintStatus.OPEN, ComplaintStatus.IN_PROGRESS] }
    });

    const pendingLeaves = await LeaveRequestModel.countDocuments({
      organizationId: orgId,
      ...(branchId ? { branchId } : {}),
      status: LeaveStatus.PENDING
    });

    const activeVisitors = await VisitorModel.countDocuments({
      organizationId: orgId,
      ...(branchId ? { branchId } : {}),
      status: 'INSIDE'
    });

    // 6. Monthly Collections Trend (Last 6 Months Aggregation)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const trendMatch: any = {
      organizationId: orgId,
      timestamp: { $gte: sixMonthsAgo },
      status: PaymentStatus.SUCCESS
    };
    if (branchId) trendMatch.branchId = branchId;

    const monthlyTrendAgg = await PaymentModel.aggregate([
      { $match: trendMatch },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' }
          },
          revenue: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenueTrend = monthlyTrendAgg.map((item) => ({
      month: \`\${months[item._id.month - 1]} \${item._id.year}\`,
      revenue: item.revenue
    }));

    return {
      kpi: {
        totalBranches,
        totalBeds,
        occupiedBeds,
        availableBeds,
        maintenanceBeds,
        occupancyRate,
        totalStudents,
        monthlyIncome,
        monthlyExpenses,
        netProfitOrLoss,
        totalDemanded,
        totalCollected,
        totalOutstanding,
        collectionPercentage,
        pendingComplaints,
        pendingLeaves,
        activeVisitors,
      },
      revenueTrend,
    };
  }

  async getBranchComparison(orgId: string) {
    const branches = await HostelBranchModel.find({ organizationId: orgId });

    const comparisons = await Promise.all(
      branches.map(async (b) => {
        const branchId = b._id.toString();
        const totalBeds = await BedModel.countDocuments({ organizationId: orgId, branchId });
        const occupiedBeds = await BedModel.countDocuments({ organizationId: orgId, branchId, status: BedStatus.OCCUPIED });
        const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

        const incomeAgg = await PaymentModel.aggregate([
          { $match: { organizationId: orgId, branchId, status: PaymentStatus.SUCCESS } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalRevenue = incomeAgg.length > 0 ? incomeAgg[0].total : 0;

        const expAgg = await ExpenseModel.aggregate([
          { $match: { organizationId: orgId, branchId } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalExpenses = expAgg.length > 0 ? expAgg[0].total : 0;
        const netProfit = totalRevenue - totalExpenses;

        return {
          branchId,
          branchCode: b.branchCode,
          branchName: b.name,
          city: b.city,
          totalBeds,
          occupiedBeds,
          occupancyRate,
          totalRevenue,
          totalExpenses,
          netProfit,
          status: b.status,
        };
      })
    );

    return comparisons;
  }
}
export const dashboardService = new DashboardService();
`);

write('src/modules/dashboard/dashboard.controller.ts', `
import { Router, Request, Response, NextFunction } from 'express';
import { dashboardService } from './dashboard.service';
import { authenticate } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';

const router = Router();
router.use(authenticate, enforceTenantIsolation);

router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId } = req.query;
    const stats = await dashboardService.getStats(
      req.user!.organizationId,
      (branchId as string) || (req.user!.branchId as string)
    );
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
});

router.get('/branch-comparison', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const comparison = await dashboardService.getBranchComparison(req.user!.organizationId);
    res.json({ success: true, data: comparison });
  } catch (err) { next(err); }
});

export const dashboardRouter = router;
`);