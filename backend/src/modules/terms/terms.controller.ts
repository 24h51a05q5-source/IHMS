import { Router, Request, Response, NextFunction } from 'express';
import { termsService } from './terms.service';
import { authenticate } from '../../common/guards/auth.guard';

const router = Router();

// GET /terms or /api/terms (Public or Authenticated)
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = (req.query.role as string) || (req.user?.role as string) || undefined;
    const termsData = termsService.getTerms(role);
    res.json({
      success: true,
      data: termsData,
      ...termsData,
    });
  } catch (err) {
    next(err);
  }
});

// GET /terms/status or /api/terms/status (Authenticated)
router.get('/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await termsService.checkUserTermsStatus(req.user!.id);
    res.json({
      success: true,
      data: status,
      ...status,
    });
  } catch (err) {
    next(err);
  }
});

// POST /terms/accept or /api/terms/accept (Authenticated)
router.post('/accept', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { version, termsVersion } = req.body;
    const submittedVersion = version || termsVersion;
    const ipAddress =
      (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';

    const result = await termsService.acceptTerms(
      req.user!.id,
      req.user!.role,
      submittedVersion,
      ipAddress,
      userAgent
    );

    res.json({
      success: true,
      message: result.message,
      data: result,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

export const termsRouter = router;
