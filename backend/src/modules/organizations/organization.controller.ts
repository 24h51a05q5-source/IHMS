import { Router, Request, Response, NextFunction } from 'express';
import { organizationService } from './organization.service';
import { authenticate } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';
import { authorizeRoles } from '../../common/guards/roles.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate);

router.get('/current', enforceTenantIsolation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await organizationService.getById(req.user!.organizationId);
    res.json({ success: true, data: org });
  } catch (err) { next(err); }
});

router.put('/current', enforceTenantIsolation, authorizeRoles(UserRole.OWNER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await organizationService.update(req.user!.organizationId, req.body);
    res.json({ success: true, data: org, message: 'Organization settings updated successfully' });
  } catch (err) { next(err); }
});

router.get('/all', authorizeRoles(UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgs = await organizationService.listAll();
    res.json({ success: true, data: orgs });
  } catch (err) { next(err); }
});

export const organizationRouter = router;
