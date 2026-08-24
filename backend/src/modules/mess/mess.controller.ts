import { Router, Request, Response, NextFunction } from 'express';
import { messService } from './mess.service';
import { queryOne } from '../../config/database';
import { authenticate, authorize } from '../../common/guards/auth.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate);

function toLovableMessMenu(m: any) {
  if (!m) return null;
  const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
  let days = m.days || [];
  if (typeof days === 'string') {
    try { days = JSON.parse(days); } catch { days = []; }
  }

  const week = dayNames.map((dName) => {
    const found = days.find((d: any) => d.day?.toUpperCase() === dName);
    return {
      day: dName,
      breakfast: (found?.breakfast || []).map((name: string, i: number) => ({ id: `b-${i}`, name, special: found?.isSpecial, vegetarian: true })),
      lunch: (found?.lunch || []).map((name: string, i: number) => ({ id: `l-${i}`, name, special: found?.isSpecial, vegetarian: true })),
      snacks: (found?.snacks || []).map((name: string, i: number) => ({ id: `s-${i}`, name, special: found?.isSpecial, vegetarian: true })),
      dinner: (found?.dinner || []).map((name: string, i: number) => ({ id: `d-${i}`, name, special: found?.isSpecial, vegetarian: true })),
    };
  });

  return {
    id: m.id || m._id,
    _id: m.id || m._id,
    branchId: m.hostel_id || m.hostelBranchId,
    hostelBranchId: m.hostel_id || m.hostelBranchId,
    status: m.status,
    week,
    days,
    weekStartDate: m.week_start_date || m.weekStartDate,
    weekEndDate: m.week_end_date || m.weekEndDate,
    updatedAt: m.updated_at || m.updatedAt,
  };
}

const handleGetMenu = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.params.branchId || req.query.branchId;
    if (!branchId) {
      const menus = await messService.listMenus(req.user!.organizationId);
      return res.json({ success: true, data: menus.map(toLovableMessMenu) });
    }

    // Auto-initialize default menu if none exists — no more 404 "No menu configured"
    const menu = await messService.getOrInitializeMenu(
      req.user!.organizationId,
      branchId as string,
      req.user!.name || req.user!.email
    );

    res.json({ success: true, data: toLovableMessMenu(menu) });
  } catch (err) { next(err); }
};

router.get('/', handleGetMenu);
router.get('/menus', handleGetMenu);
router.get('/menu/:branchId?', handleGetMenu);

router.get('/student-menu', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await queryOne<any>(
      'SELECT hostel_id FROM students WHERE (id = $1 OR user_id = $1 OR UPPER(customer_code) = $2 OR LOWER(email) = $3) AND organization_id = $4',
      [req.user!.studentId || req.user!.id, (req.user!.customerCode || '').toUpperCase(), (req.user!.email || '').toLowerCase(), req.user!.organizationId]
    );

    const branchId = student?.hostel_id || req.user!.branchId;
    if (!branchId) return res.json({ success: true, data: null });

    const menu = await queryOne<any>(
      "SELECT * FROM mess_menus WHERE organization_id = $1 AND hostel_id = $2 AND status = 'PUBLISHED' ORDER BY created_at DESC LIMIT 1",
      [req.user!.organizationId, branchId]
    );

    res.json({ success: true, data: toLovableMessMenu(menu) });
  } catch (err) { next(err); }
});

const handleSaveMenu = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let { branchId, hostelBranchId, week, days, status, weekStartDate, weekEndDate } = req.body;
    let targetBranch = branchId || hostelBranchId || req.user!.branchId;

    if (!targetBranch) {
      const b = await queryOne<any>('SELECT id FROM hostels WHERE organization_id = $1 LIMIT 1', [req.user!.organizationId]);
      targetBranch = b ? b.id : 'default-branch';
    }

    let formattedDays = days;
    if (week && Array.isArray(week)) {
      formattedDays = week.map((w: any) => ({
        day: w.day.charAt(0).toUpperCase() + w.day.slice(1).toLowerCase(),
        breakfast: (w.breakfast || []).map((x: any) => typeof x === 'string' ? x : x.name),
        lunch: (w.lunch || []).map((x: any) => typeof x === 'string' ? x : x.name),
        snacks: (w.snacks || []).map((x: any) => typeof x === 'string' ? x : x.name),
        dinner: (w.dinner || []).map((x: any) => typeof x === 'string' ? x : x.name),
        isSpecial: (w.breakfast || []).some((x: any) => x.special) || false,
      }));
    }

    // Compute current week (Mon–Sun) as fallback if not provided
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dow + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmtDate = (d: Date) => d.toISOString().split('T')[0];

    const created = await messService.createMenu(req.user!.organizationId, targetBranch, {
      weekStartDate: weekStartDate || fmtDate(monday),
      weekEndDate: weekEndDate || fmtDate(sunday),
      days: formattedDays || [],
      status: status || 'DRAFT',
    }, req.user!.name || req.user!.email);

    res.status(201).json({ success: true, data: toLovableMessMenu(created), message: 'Weekly mess menu saved' });
  } catch (err) { next(err); }
};

router.post('/', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.MESS_MANAGER), handleSaveMenu);
router.post('/menu', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.MESS_MANAGER), handleSaveMenu);
router.post('/menus', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.MESS_MANAGER), handleSaveMenu);

const handlePublishMenu = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const m = await messService.setPublishStatus(req.user!.organizationId, req.params.id, 'PUBLISHED', req.user!.name || req.user!.email);
    res.json({ success: true, data: toLovableMessMenu(m), message: 'Weekly mess menu published' });
  } catch (err) { next(err); }
};

const handleUnpublishMenu = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const m = await messService.setPublishStatus(req.user!.organizationId, req.params.id, 'DRAFT', req.user!.name || req.user!.email);
    res.json({ success: true, data: toLovableMessMenu(m), message: 'Weekly mess menu unpublished' });
  } catch (err) { next(err); }
};

router.patch('/:id/publish', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.MESS_MANAGER), handlePublishMenu);
router.post('/menus/:id/publish', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.MESS_MANAGER), handlePublishMenu);
router.patch('/:id/unpublish', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.MESS_MANAGER), handleUnpublishMenu);

export const messRouter = router;
