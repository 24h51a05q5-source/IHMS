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
