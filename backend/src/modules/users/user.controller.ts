import { Router, Request, Response } from 'express';
import { query, queryOne, queryRows } from '../../config/database';
import { authenticate } from '../../common/guards/auth.guard';

const router = Router();
router.use(authenticate);

// GET /notifications
router.get('/notifications', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * pageSize;

    let items: any[] = [];
    let total = 0;

    if (user.role === 'STUDENT') {
      const studentTargets = [user.id, user.userId, user.studentId].filter(Boolean);
      items = await queryRows(
        `SELECT id, title, message, type, read, link as "actionUrl", created_at as "createdAt"
         FROM notifications
         WHERE (organization_id = $1 OR organization_id IS NULL)
           AND (user_id = ANY($2::text[]) OR user_id = 'ALL' OR user_id IS NULL)
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [user.organizationId, studentTargets, pageSize, offset]
      );
      const countRes = await queryOne(
        `SELECT COUNT(*)::int as count FROM notifications
         WHERE (organization_id = $1 OR organization_id IS NULL)
           AND (user_id = ANY($2::text[]) OR user_id = 'ALL' OR user_id IS NULL)`,
        [user.organizationId, studentTargets]
      );
      total = countRes?.count || 0;
    } else {
      items = await queryRows(
        `SELECT id, title, message, type, read, link as "actionUrl", created_at as "createdAt"
         FROM notifications
         WHERE (organization_id = $1 OR organization_id IS NULL)
           AND (user_id = $2 OR user_id = 'ALL' OR user_id IS NULL)
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [user.organizationId, user.id, pageSize, offset]
      );
      const countRes = await queryOne(
        `SELECT COUNT(*)::int as count FROM notifications
         WHERE (organization_id = $1 OR organization_id IS NULL)
           AND (user_id = $2 OR user_id = 'ALL' OR user_id IS NULL)`,
        [user.organizationId, user.id]
      );
      total = countRes?.count || 0;
    }

    res.json({
      success: true,
      data: {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch notifications' });
  }
});

// PATCH /notifications/:id/read
router.patch('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    await query(
      'UPDATE notifications SET read = true WHERE id = $1 AND (organization_id = $2 OR organization_id IS NULL)',
      [req.params.id, user.organizationId]
    );
    res.json({ success: true, data: { id: req.params.id, read: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update notification' });
  }
});

// POST /notifications/read-all
router.post('/notifications/read-all', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    await query(
      'UPDATE notifications SET read = true WHERE (organization_id = $1 OR organization_id IS NULL) AND user_id = $2',
      [user.organizationId, user.id]
    );
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to mark notifications read' });
  }
});

export const userRouter = router;
