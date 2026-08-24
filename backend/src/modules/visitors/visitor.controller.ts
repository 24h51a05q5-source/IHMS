import { Router, Request, Response, NextFunction } from 'express';
import { visitorService } from './visitor.service';
import { query, queryOne, queryRows } from '../../config/database';
import { authenticate } from '../../common/guards/auth.guard';
import { VisitorStatus } from '../../config/constants';
import { generateVisitorPassNumber } from '../../common/utils/code-generator';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, status, page = 1, pageSize = 50 } = req.query;
    const orgId = req.user!.organizationId;

    let sql = 'SELECT * FROM visitors WHERE organization_id = $1';
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
    sql += ` ORDER BY check_in_time DESC LIMIT ${limit} OFFSET ${offset}`;

    const visitors = await queryRows<any>(sql, params);

    const mapped = visitors.map((v: any) => ({
      id: v.id,
      _id: v.id,
      passNumber: v.visitor_pass_number,
      visitorPassNumber: v.visitor_pass_number,
      studentId: v.student_id,
      studentName: v.student_name || 'Student',
      visitorName: v.visitor_name,
      relation: v.relation || 'Parent/Relative',
      phone: v.phone || '',
      purpose: v.purpose || 'Visit',
      checkInTime: v.check_in_time || v.created_at,
      checkOutTime: v.check_out_time,
      status: v.check_out_time ? 'CHECKED_OUT' : 'CHECKED_IN',
    }));

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

const handleCheckIn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { visitorName, relation, phone, purpose, studentId, studentName, customerCode, branchId } = req.body;
    const orgId = req.user!.organizationId;
    let sName = studentName || 'General Resident';
    let cCode = customerCode || 'GEN-001';
    let bId = branchId || req.user!.branchId;

    if (studentId) {
      const student = await queryOne<any>('SELECT * FROM students WHERE (id = $1 OR user_id = $1 OR customer_code = $1) AND organization_id = $2', [studentId, orgId]);
      if (student) {
        sName = student.full_name;
        cCode = student.customer_code;
        bId = student.hostel_id || bId;
      }
    }

    if (!bId) {
      const b = await queryOne<any>('SELECT id FROM hostels WHERE organization_id = $1 LIMIT 1', [orgId]);
      bId = b ? b.id : 'default-branch';
    }

    const branch = await queryOne<any>('SELECT branch_code FROM hostels WHERE id = $1', [bId]);
    const hostelCode = branch?.branch_code || 'HYD001';
    const visitorPassNumber = await generateVisitorPassNumber(orgId, hostelCode);
    const visitorId = require('crypto').randomUUID();

    const v = await queryOne<any>(
      `INSERT INTO visitors (
        id, visitor_pass_number, organization_id, branch_id, student_id, customer_code,
        student_name, visitor_name, relation, phone, purpose, status, check_in_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'INSIDE', CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        visitorId,
        visitorPassNumber,
        orgId,
        bId,
        studentId || req.user!.id,
        cCode,
        sName,
        visitorName || 'Guest',
        relation || 'Guest',
        phone || '0000000000',
        purpose || 'Visit'
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        id: v.id,
        passNumber: v.visitor_pass_number,
        visitorName: v.visitor_name,
        relation: v.relation,
        purpose: v.purpose,
        checkInTime: v.check_in_time,
        status: 'CHECKED_IN',
      },
    });
  } catch (err) { next(err); }
};

router.post('/check-in', handleCheckIn);
router.post('/', handleCheckIn);

const handleCheckOut = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const v = await queryOne<any>(
      `UPDATE visitors
       SET check_out_time = CURRENT_TIMESTAMP, status = 'EXITED', updated_at = CURRENT_TIMESTAMP
       WHERE (id = $1 OR visitor_pass_number = $1) AND organization_id = $2
       RETURNING *`,
      [req.params.id, req.user!.organizationId]
    );
    res.json({
      success: true,
      data: {
        id: v?.id,
        checkOutTime: v?.check_out_time,
        status: 'CHECKED_OUT',
      },
    });
  } catch (err) { next(err); }
};

router.patch('/:id/check-out', handleCheckOut);
router.patch('/:id/checkout', handleCheckOut);

export const visitorRouter = router;
