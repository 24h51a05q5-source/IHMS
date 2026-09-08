import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { notificationService } from './notification.service';
import { authenticate } from '../../common/guards/auth.guard';

const router = Router();

const extractUser = (req: Request): any => {
  if ((req as any).user) return (req as any).user;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const secret = process.env.JWT_SECRET || 'ihms-super-secret-jwt-key-production-2026';
      return jwt.verify(token, secret);
    } catch {
      return null;
    }
  }
  return null;
};

// GET /notifications/unread-count (Supports both authenticated users & safe optional fallback)
router.get('/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = extractUser(req);
    if (!user) {
      return res.json({
        success: true,
        count: 0,
        data: { count: 0 },
      });
    }
    const count = await notificationService.getUnreadCount(user);
    res.json({
      success: true,
      count,
      data: { count },
    });
  } catch (err) {
    next(err);
  }
});

// Authenticated routes below
router.use(authenticate);

// GET /notifications
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 50;
    const unreadOnly = req.query.unreadOnly === 'true';
    const type = req.query.type as string | undefined;

    const result = await notificationService.getNotifications(req.user, {
      page,
      pageSize,
      unreadOnly,
      type,
    });

    res.json({
      success: true,
      data: result,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /notifications/:id/read
router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notificationService.markAsRead(req.user, req.params.id);
    res.json({
      success: true,
      data: result,
      message: 'Notification marked as read.',
    });
  } catch (err) {
    next(err);
  }
});

// POST /notifications/read-all
router.post('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notificationService.markAllAsRead(req.user);
    res.json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
});

export const notificationRouter = router;
