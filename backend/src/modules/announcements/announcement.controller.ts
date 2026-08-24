import { Router, Request, Response, NextFunction } from 'express';
import { announcementService, validateAndSaveImage } from './announcement.service';
import { authenticate } from '../../common/guards/auth.guard';
import { authorizeRoles } from '../../common/guards/roles.guard';
import { UserRole } from '../../config/constants';
import { AppError } from '../../common/filters/http-exception.filter';

const router = Router();
router.use(authenticate);

// Image Upload Endpoint (JPG, JPEG, PNG, WEBP <= 5MB)
router.post('/upload', authorizeRoles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.REGIONAL_MANAGER, UserRole.BRANCH_MANAGER, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawImage = req.body?.image || req.body?.file || req.body?.imageUrl;
    if (!rawImage) {
      throw new AppError('No image data provided for upload.', 400);
    }
    const savedUrl = validateAndSaveImage(rawImage, req.body?.fileName);
    res.json({
      success: true,
      url: savedUrl,
      imageUrl: savedUrl,
      attachmentUrl: savedUrl,
      message: 'Image uploaded and validated successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Student endpoints
router.get('/student', authorizeRoles(UserRole.STUDENT), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const announcements = await announcementService.getForStudent(user);
    res.json({ success: true, data: announcements });
  } catch (error) {
    next(error);
  }
});

router.get('/student/unread-count', authorizeRoles(UserRole.STUDENT), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const count = await announcementService.getUnreadCountForStudent(user);
    res.json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/read', authorizeRoles(UserRole.STUDENT), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const studentIdentifier = user.studentId || user.id;
    await announcementService.markAsRead(req.params.id, studentIdentifier);
    res.json({ success: true, message: 'Announcement marked as read' });
  } catch (error) {
    next(error);
  }
});

// Owner & Admin endpoints
router.get('/', authorizeRoles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.REGIONAL_MANAGER, UserRole.BRANCH_MANAGER, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const result = await announcementService.list(user.organizationId, req.query as any);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/', authorizeRoles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.REGIONAL_MANAGER, UserRole.BRANCH_MANAGER, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const created = await announcementService.create(req.body, user);
    res.status(201).json({ success: true, data: created, message: 'Announcement published successfully' });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authorizeRoles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.REGIONAL_MANAGER, UserRole.BRANCH_MANAGER, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const item = await announcementService.getById(req.params.id, user.organizationId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', authorizeRoles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.REGIONAL_MANAGER, UserRole.BRANCH_MANAGER, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const updated = await announcementService.update(req.params.id, req.body, user.organizationId);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }
    res.json({ success: true, data: updated, message: 'Announcement updated successfully' });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/toggle', authorizeRoles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.REGIONAL_MANAGER, UserRole.BRANCH_MANAGER, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const result = await announcementService.toggleStatus(req.params.id, user.organizationId);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }
    res.json({ success: true, data: result, message: `Announcement ${result.status.toLowerCase()}` });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authorizeRoles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.REGIONAL_MANAGER, UserRole.BRANCH_MANAGER, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const deleted = await announcementService.delete(req.params.id, user.organizationId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }
    res.json({ success: true, message: 'Announcement deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export const announcementRouter = router;
