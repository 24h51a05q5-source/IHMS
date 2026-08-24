import { Router, Request, Response, NextFunction } from 'express';
import { studentService } from './student.service';
import { query, queryOne, queryRows } from '../../config/database';
import { authenticate, authorize } from '../../common/guards/auth.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate);
router.use(authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.WARDEN, UserRole.SECURITY_GUARD, UserRole.MESS_MANAGER, UserRole.MAINTENANCE_STAFF));

// GET /students with Lovable Paginated filter
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId, hostelId, search, status, portalAccess, page = 1, pageSize = 50, sortBy = 'createdAt', sortDir = 'desc' } = req.query;
    const orgId = req.user!.organizationId;

    let whereClause = 'WHERE s.organization_id = $1';
    const params: any[] = [orgId];

    const targetBranch = (branchId || hostelId) as string;
    if (targetBranch && targetBranch !== 'ALL') {
      params.push(targetBranch);
      whereClause += ` AND s.hostel_id = $${params.length}`;
    }
    if (status && status !== 'ALL') {
      params.push(status);
      whereClause += ` AND s.status = $${params.length}`;
    }
    if (portalAccess !== undefined && portalAccess !== '' && portalAccess !== 'ALL') {
      const isEnabled = portalAccess === 'ENABLED' || portalAccess === 'true';
      params.push(isEnabled);
      whereClause += ` AND s.portal_access = $${params.length}`;
    }
    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      params.push(q);
      whereClause += ` AND (s.full_name ILIKE $${params.length} OR s.customer_code ILIKE $${params.length} OR s.student_id ILIKE $${params.length} OR s.email ILIKE $${params.length} OR s.phone ILIKE $${params.length} OR r.room_number ILIKE $${params.length} OR b.bed_code ILIKE $${params.length} OR s.guardian_name ILIKE $${params.length})`;
    }

    const needsJoins = Boolean(search && String(search).trim());
    const countSql = needsJoins
      ? `SELECT COUNT(s.id)::int as total FROM students s LEFT JOIN rooms r ON r.id = s.room_id LEFT JOIN beds b ON b.id = s.bed_id ${whereClause}`
      : `SELECT COUNT(s.id)::int as total FROM students s ${whereClause}`;

    const totalRow = await queryOne<any>(countSql, params);
    const total = totalRow?.total || 0;

    const limit = Math.min(100, Math.max(1, Number(pageSize)));
    const offset = Math.max(0, (Number(page) - 1) * limit);

    const dataSql = `
      SELECT s.*, r.room_number, b.bed_code, h.name as hostel_name
      FROM students s
      LEFT JOIN rooms r ON r.id = s.room_id
      LEFT JOIN beds b ON b.id = s.bed_id
      LEFT JOIN hostels h ON h.id = s.hostel_id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const students = await queryRows<any>(dataSql, params);

    const mapped = students.map((s: any) => {
      const demanded = Number(s.financial_total_demanded || 0);
      const paid = Number(s.financial_total_paid || 0);
      const balance = Number(s.financial_outstanding_balance || 0);

      return {
        id: s.id,
        _id: s.id,
        customerCode: s.customer_code,
        studentId: s.student_id || s.customer_code,
        name: s.full_name,
        fullName: s.full_name,
        email: s.email,
        phone: s.phone,
        guardianName: s.guardian_name || '',
        guardianPhone: s.guardian_phone || '',
        hostelId: s.hostel_id,
        hostelName: s.hostel_name || 'Main Hostel',
        roomId: s.room_id,
        roomNumber: s.room_number || '',
        bedId: s.bed_id,
        bedNumber: s.bed_code || '',
        feeTotal: demanded,
        feePaid: paid,
        feeOutstanding: balance,
        feeStatus: balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'OVERDUE',
        portalAccess: s.portal_access ? 'ENABLED' : 'DISABLED',
        status: s.status || 'ACTIVE',
        course: s.course || '',
        year: 1,
        dateOfAdmission: s.admission_date || s.created_at,
      };
    });

    res.json({
      success: true,
      data: {
        items: mapped,
        total,
        page: Number(page),
        pageSize: limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) { next(err); }
});

// GET /students/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const s = await studentService.getById(req.user!.organizationId, req.params.id);
    res.json({ success: true, data: s });
  } catch (err) { next(err); }
});

// POST /students/register (Register student without initial room allocation)
router.post('/register', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetBranch = req.body.branchId || req.body.hostelId;
    const payload = {
      ...req.body,
      fullName: req.body.fullName || req.body.name,
      guardian: {
        name: req.body.guardianName || req.body.guardian?.name || 'Guardian',
        relation: req.body.guardianRelation || req.body.guardian?.relation || 'Parent',
        phone: req.body.guardianPhone || req.body.guardian?.phone || req.body.phone,
      },
    };
    const student = await studentService.registerStudent(req.user!.organizationId, targetBranch, payload);
    res.status(201).json({
      success: true,
      data: {
        student,
        customerCode: student.customerCode,
        portalAccess: student.portalAccess,
      },
      message: `Student registered successfully. Customer Code: ${student.customerCode}`,
    });
  } catch (err) { next(err); }
});

// POST /students/:id/allocate (Allocate student to an available room/bed)
router.post('/:id/allocate', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await studentService.allocateBedToStudent(req.user!.organizationId, req.params.id, req.body);
    res.json({
      success: true,
      data: student,
      message: `Student successfully allocated to Bed ${student.bedNumber || student.bedCode || req.body.bedId}`,
    });
  } catch (err) { next(err); }
});

// POST /students
router.post('/', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetBranch = req.body.branchId || req.body.hostelId;
    const payload = {
      ...req.body,
      fullName: req.body.fullName || req.body.name,
      guardian: {
        name: req.body.guardianName || req.body.guardian?.name || 'Guardian',
        relation: req.body.guardianRelation || req.body.guardian?.relation || 'Parent',
        phone: req.body.guardianPhone || req.body.guardian?.phone || req.body.phone,
      },
    };
    const student = await studentService.admitStudent(req.user!.organizationId, targetBranch, payload);
    res.status(201).json({
      success: true,
      data: {
        student,
        customerCode: student.customerCode,
        portalAccess: student.portalAccess,
      },
      message: `Student admitted successfully. Customer Code: ${student.customerCode}`,
    });
  } catch (err) { next(err); }
});

// PATCH & POST /students/:id/portal-access
const handlePortalAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, status, initialPassword, temporaryPassword, password } = req.body;
    const shouldEnable = status ? status === 'ENABLED' : (action === 'GRANT' || action === 'ENABLE');
    const tempPw = password || temporaryPassword || initialPassword;
    const result = await studentService.setPortalAccess(
      req.user!.organizationId,
      req.params.id,
      shouldEnable ? 'GRANT' : 'REVOKE',
      tempPw
    );
    const updatedStudent = await studentService.getById(req.user!.organizationId, req.params.id);
    res.json({
      success: true,
      message: result.message,
      data: {
        student: updatedStudent,
        portalAccess: shouldEnable ? 'ENABLED' : 'DISABLED',
        email: result.email,
        studentId: result.studentId || result.customerCode,
        customerCode: result.customerCode,
        maskedEmail: result.maskedEmail,
        _debugOtp: result._debugOtp,
      },
      ...result,
    });
  } catch (err) { next(err); }
};

router.patch('/:id/portal-access', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN), handlePortalAccess);
router.post('/:id/portal-access', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN), handlePortalAccess);

// POST /students/:id/reset-password (Admin resets student password)
router.post('/:id/reset-password', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password, temporaryPassword, newPassword } = req.body || {};
    const customPassword = password || temporaryPassword || newPassword;
    const result = await studentService.resetStudentPassword(req.user!.organizationId, req.params.id, customPassword);
    res.json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (err) { next(err); }
});

// PUT /students/:id
router.put('/:id', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await studentService.updateStudent(req.user!.organizationId, req.params.id, req.body);
    res.json({
      success: true,
      data: student,
      student,
      message: 'Student updated successfully',
    });
  } catch (err) { next(err); }
});

// DELETE /students/:id
router.delete('/:id', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await studentService.removeStudent(req.user!.organizationId, req.params.id);
    res.json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (err) { next(err); }
});

// Documents endpoints
router.get('/:id/documents', async (req: Request, res: Response) => {
  res.json({ success: true, data: [] });
});

router.post('/:id/documents', async (req: Request, res: Response) => {
  res.status(201).json({
    success: true,
    data: {
      id: 'doc-' + Date.now(),
      studentId: req.params.id,
      name: 'Uploaded Document',
      type: 'ID_PROOF',
      url: '/docs/sample.pdf',
      uploadedAt: new Date().toISOString(),
    },
  });
});

export const studentRouter = router;
