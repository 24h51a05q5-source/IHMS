import { Router, Request, Response, NextFunction } from 'express';
import { wardenService } from './warden.service';
import { authenticate, requireOwnerOrAdmin } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';

const router = Router();

// Apply auth and owner guards to all warden management endpoints
router.use(authenticate);
router.use(requireOwnerOrAdmin());
router.use(enforceTenantIsolation);

// GET /api/owner/wardens — List all wardens
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await wardenService.getWardens(req.user!);
    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/owner/wardens — Add Warden (role=WARDEN, status=INVITED, access_given=false)
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await wardenService.createWarden(req.user!, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/owner/wardens/:id/give-access — Owner Gives Access
router.post('/:id/give-access', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await wardenService.giveAccess(req.user!, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/owner/wardens/:id/resend-invite — Resend Activation Invitation
router.post('/:id/resend-invite', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await wardenService.resendInvite(req.user!, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/owner/wardens/:id/suspend — Owner Suspends Warden
router.post('/:id/suspend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await wardenService.suspendWarden(req.user!, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/owner/wardens/:id/reactivate — Owner Reactivates Warden
router.post('/:id/reactivate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await wardenService.reactivateWarden(req.user!, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/owner/wardens/:id — Owner Removes Warden Access
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await wardenService.removeWarden(req.user!, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export const wardenRouter = router;
