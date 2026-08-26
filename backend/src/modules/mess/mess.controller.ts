import { Router, Request, Response, NextFunction } from 'express';
import { messService } from './mess.service';
import { queryOne } from '../../config/database';
import { authenticate, authorize } from '../../common/guards/auth.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate);

function toLovableMessMenu(m: any) {
  if (!m) return null;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let days = m.days || [];
  if (typeof days === 'string') {
    try { days = JSON.parse(days); } catch { days = []; }
  }

  const week = dayNames.map((dName) => {
    const found = days.find((d: any) => d.day?.toLowerCase() === dName.toLowerCase());
    return {
      day: dName,
      breakfast: (found?.breakfast || []).map((item: any, i: number) => ({
        id: typeof item === 'object' && item?.id ? item.id : `b-${i}`,
        name: typeof item === 'string' ? item : (item?.name || String(item)),
        special: typeof item === 'object' ? Boolean(item?.special) : Boolean(found?.isSpecial),
        vegetarian: true,
      })),
      lunch: (found?.lunch || []).map((item: any, i: number) => ({
        id: typeof item === 'object' && item?.id ? item.id : `l-${i}`,
        name: typeof item === 'string' ? item : (item?.name || String(item)),
        special: typeof item === 'object' ? Boolean(item?.special) : Boolean(found?.isSpecial),
        vegetarian: true,
      })),
      snacks: (found?.snacks || []).map((item: any, i: number) => ({
        id: typeof item === 'object' && item?.id ? item.id : `s-${i}`,
        name: typeof item === 'string' ? item : (item?.name || String(item)),
        special: typeof item === 'object' ? Boolean(item?.special) : Boolean(found?.isSpecial),
        vegetarian: true,
      })),
      dinner: (found?.dinner || []).map((item: any, i: number) => ({
        id: typeof item === 'object' && item?.id ? item.id : `d-${i}`,
        name: typeof item === 'string' ? item : (item?.name || String(item)),
        special: typeof item === 'object' ? Boolean(item?.special) : Boolean(found?.isSpecial),
        vegetarian: true,
      })),
    };
  });

  return {
    id: m.id || m._id,
    _id: m.id || m._id,
    branchId: m.hostel_id || m.hostelBranchId || m.branchId,
    hostelBranchId: m.hostel_id || m.hostelBranchId || m.branchId,
    status: m.status,
    week,
    weekDays: week,
    days,
    weekStartDate: m.week_start_date || m.weekStartDate,
    weekEndDate: m.week_end_date || m.weekEndDate,
    updatedAt: m.updated_at || m.updatedAt,
  };
}

const handleGetStudentMenu = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await queryOne<any>(
      'SELECT hostel_id FROM students WHERE (id = $1 OR user_id = $1 OR UPPER(customer_code) = $2 OR LOWER(email) = $3) AND organization_id = $4',
      [req.user!.studentId || req.user!.id, (req.user!.customerCode || '').toUpperCase(), (req.user!.email || '').toLowerCase(), req.user!.organizationId]
    );

    const branchId = student?.hostel_id || req.user!.branchId;
    if (!branchId) return res.json({ success: true, data: null });

    const menu = await queryOne<any>(
      "SELECT * FROM mess_menus WHERE organization_id = $1 AND hostel_id = $2 AND status = 'PUBLISHED' ORDER BY week_start_date DESC LIMIT 1",
      [req.user!.organizationId, branchId]
    );

    res.json({ success: true, data: toLovableMessMenu(menu) });
  } catch (err) { next(err); }
};

// 1. Student menu routes MUST be registered before /menu/:branchId? wildcard!
router.get('/menu/student', handleGetStudentMenu);
router.get('/student-menu', handleGetStudentMenu);

const handleGetMenu = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.params.branchId || req.query.branchId;
    if (!branchId) {
      const menus = await messService.listMenus(req.user!.organizationId);
      return res.json({ success: true, data: menus.map(toLovableMessMenu) });
    }

    const menu = await messService.getOrInitializeMenu(
      req.user!.organizationId,
      branchId as string,
      req.user!.name || req.user!.email
    );

    res.json({ success: true, data: toLovableMessMenu(menu) });
  } catch (err) { next(err); }
};

// 2. GET menu routes
router.get('/', handleGetMenu);
router.get('/menus', handleGetMenu);
router.get('/menu/:branchId?', handleGetMenu);

const handleSaveMenu = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let { branchId, hostelBranchId, week, days, status, weekStartDate, weekEndDate } = req.body;
    let targetBranch = branchId || hostelBranchId || req.user!.branchId;

    if (!targetBranch) {
      const b = await queryOne<any>('SELECT id FROM hostels WHERE organization_id = $1 LIMIT 1', [req.user!.organizationId]);
      targetBranch = b ? b.id : 'default-branch';
    }

    const created = await messService.createMenu(req.user!.organizationId, targetBranch, {
      weekStartDate,
      weekEndDate,
      days,
      week,
      status: status || 'DRAFT',
    }, req.user!.name || req.user!.email);

    res.status(201).json({ success: true, data: toLovableMessMenu(created), message: 'Weekly mess menu saved' });
  } catch (err) { next(err); }
};

// 3. POST new menu routes
router.post('/', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.MESS_MANAGER), handleSaveMenu);
router.post('/menu', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.MESS_MANAGER), handleSaveMenu);
router.post('/menus', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.MESS_MANAGER), handleSaveMenu);

// 4. Update / Publish / Unpublish handler supporting PUT, POST, PATCH /menu/:id and /menu/:id/publish
const handleUpdateMenu = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    let { branchId, hostelBranchId, week, days, status, weekStartDate, weekEndDate } = req.body || {};

    if (req.path.endsWith('/publish')) {
      status = 'PUBLISHED';
    } else if (req.path.endsWith('/unpublish')) {
      status = 'DRAFT';
    }

    const updated = await messService.updateMenu(
      req.user!.organizationId,
      id,
      {
        branchId: branchId || hostelBranchId,
        status,
        week,
        days,
        weekStartDate,
        weekEndDate,
      },
      req.user!.name || req.user!.email
    );

    const isPub = updated.status === 'PUBLISHED';
    res.json({
      success: true,
      data: toLovableMessMenu(updated),
      message: isPub ? 'Weekly mess menu published successfully' : 'Weekly mess menu updated successfully',
    });
  } catch (err) { next(err); }
};

const handleDeleteMenu = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await messService.deleteMenu(req.user!.organizationId, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
};

const authRoles = authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.MESS_MANAGER);

// Explicit Publish / Unpublish sub-routes
router.put('/menu/:id/publish', authRoles, handleUpdateMenu);
router.post('/menu/:id/publish', authRoles, handleUpdateMenu);
router.patch('/menu/:id/publish', authRoles, handleUpdateMenu);
router.post('/menus/:id/publish', authRoles, handleUpdateMenu);
router.patch('/:id/publish', authRoles, handleUpdateMenu);

router.put('/menu/:id/unpublish', authRoles, handleUpdateMenu);
router.post('/menu/:id/unpublish', authRoles, handleUpdateMenu);
router.patch('/menu/:id/unpublish', authRoles, handleUpdateMenu);
router.patch('/:id/unpublish', authRoles, handleUpdateMenu);

// Direct Update routes (PUT /mess/menu/:id, PUT /mess/:id, etc.)
router.put('/menu/:id', authRoles, handleUpdateMenu);
router.put('/menus/:id', authRoles, handleUpdateMenu);
router.put('/:id', authRoles, handleUpdateMenu);
router.post('/menu/:id', authRoles, handleUpdateMenu);
router.patch('/menu/:id', authRoles, handleUpdateMenu);
router.patch('/:id', authRoles, handleUpdateMenu);

// Delete routes
router.delete('/menu/:id', authRoles, handleDeleteMenu);
router.delete('/menus/:id', authRoles, handleDeleteMenu);
router.delete('/:id', authRoles, handleDeleteMenu);

export const messRouter = router;
