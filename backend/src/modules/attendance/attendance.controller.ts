import { Router, Request, Response, NextFunction } from 'express';
import { attendanceService } from './attendance.service';
import { query, queryOne, queryRows } from '../../config/database';
import { authenticate, authorize } from '../../common/guards/auth.guard';
import { UserRole, LeaveStatus } from '../../config/constants';
import { generateLeaveNumber } from '../../common/utils/code-generator';
import { generateQrDataUrl } from '../../common/utils/qr-generator';

const router = Router();
router.use(authenticate);

// Attendance routes
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, page = 1, pageSize = 50 } = req.query;
    const orgId = req.user!.organizationId;

    let sql = 'SELECT * FROM attendances WHERE organization_id = $1';
    const params: any[] = [orgId];

    if (studentId) {
      params.push(studentId);
      sql += ` AND (student_id = $${params.length} OR customer_code = $${params.length})`;
    }

    const countSql = `SELECT COUNT(*)::int as total FROM (${sql}) as sub`;
    const totalRow = await queryOne<any>(countSql, params);
    const total = totalRow?.total || 0;

    const limit = Number(pageSize);
    const offset = (Number(page) - 1) * limit;
    sql += ` ORDER BY date DESC LIMIT ${limit} OFFSET ${offset}`;

    const records = await queryRows<any>(sql, params);

    const mapped = records.map((r: any) => ({
      id: r.id,
      _id: r.id,
      studentId: r.student_id,
      studentName: r.student_name || 'Student',
      customerCode: r.customer_code || '',
      date: r.date,
      status: r.status || 'PRESENT',
      checkInTime: r.created_at,
      checkOutTime: r.created_at,
    }));

    res.json({
      success: true,
      data: {
        items: mapped,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) { next(err); }
});

const handleMarkAttendance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, date, status } = req.body;
    const orgId = req.user!.organizationId;
    const student = await queryOne<any>('SELECT * FROM students WHERE (id = $1 OR user_id = $1) AND organization_id = $2', [studentId, orgId]);

    const attDate = date ? new Date(date) : new Date();
    attDate.setHours(0, 0, 0, 0);

    const attId = require('crypto').randomUUID();
    const branchId = student?.hostel_id || req.user!.branchId || 'default-branch';

    const record = await queryOne<any>(
      `INSERT INTO attendances (
        id, organization_id, branch_id, student_id, customer_code,
        student_name, date, status, marked_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (organization_id, branch_id, student_id, date)
      DO UPDATE SET status = $8, updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        attId,
        orgId,
        branchId,
        studentId,
        student?.customer_code || '',
        student?.full_name || 'Resident',
        attDate,
        status || 'PRESENT',
        req.user!.name || req.user!.email || 'Staff'
      ]
    );
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
};

router.post('/mark', handleMarkAttendance);
router.post('/', handleMarkAttendance);

// Leave routes
router.get('/leave', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, status, page = 1, pageSize = 50 } = req.query;
    const orgId = req.user!.organizationId;

    let sql = 'SELECT * FROM leave_requests WHERE organization_id = $1';
    const params: any[] = [orgId];

    if (studentId) {
      params.push(studentId);
      sql += ` AND (student_id = $${params.length} OR customer_code = $${params.length})`;
    }
    if (status && status !== 'ALL') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    const countSql = `SELECT COUNT(*)::int as total FROM (${sql}) as sub`;
    const totalRow = await queryOne<any>(countSql, params);
    const total = totalRow?.total || 0;

    const limit = Number(pageSize);
    const offset = (Number(page) - 1) * limit;
    sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const leaves = await queryRows<any>(sql, params);

    const mapped = leaves.map((l: any) => ({
      id: l.id,
      _id: l.id,
      leaveNumber: l.leave_number,
      studentId: l.student_id,
      studentName: l.student_name || 'Student',
      customerCode: l.customer_code || '',
      fromDate: l.start_date,
      toDate: l.end_date,
      reason: l.reason,
      status: l.status,
      appliedAt: l.created_at,
      remarks: l.reason,
    }));

    res.json({
      success: true,
      data: {
        items: mapped,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) { next(err); }
});

const handleApplyLeave = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, fromDate, toDate, startDate, endDate, reason } = req.body;
    const orgId = req.user!.organizationId;
    const targetStudentId = studentId || req.user!.studentId || req.user!.id;

    const student = await queryOne<any>(
      'SELECT * FROM students WHERE (id = $1 OR user_id = $1 OR customer_code = $1) AND organization_id = $2',
      [targetStudentId, orgId]
    );

    const sName = student?.full_name || 'Resident';
    const cCode = student?.customer_code || 'GEN-001';
    const bId = student?.hostel_id || req.user!.branchId || 'default-branch';

    const leaveNumber = await generateLeaveNumber(orgId);
    const leaveId = require('crypto').randomUUID();

    const l = await queryOne<any>(
      `INSERT INTO leave_requests (
        id, leave_number, organization_id, branch_id, student_id, customer_code,
        student_name, start_date, end_date, reason, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING')
      RETURNING *`,
      [
        leaveId,
        leaveNumber,
        orgId,
        bId,
        student?.id || targetStudentId,
        cCode,
        sName,
        new Date(fromDate || startDate || new Date()),
        new Date(toDate || endDate || new Date()),
        reason || 'Personal'
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        id: l.id,
        leaveNumber: l.leave_number,
        studentId: targetStudentId,
        fromDate: l.start_date,
        toDate: l.end_date,
        reason: l.reason,
        status: l.status,
        appliedAt: l.created_at,
      },
    });
  } catch (err) { next(err); }
};

router.post('/leave/apply', handleApplyLeave);
router.post('/apply', handleApplyLeave);
router.post('/leave', handleApplyLeave);

const handleApproveLeave = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    const orgId = req.user!.organizationId;
    const targetStatus = (status || 'APPROVED') as LeaveStatus;

    const updated = await attendanceService.approveLeave(
      orgId,
      req.params.id,
      targetStatus,
      req.user!.name || req.user!.email || 'Admin'
    );
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

router.patch('/leave/:id/approve', handleApproveLeave);
router.patch('/leave/:id/status', handleApproveLeave);
router.patch('/:id/approve', handleApproveLeave);
router.patch('/:id/status', handleApproveLeave);

export const attendanceRouter = router;
