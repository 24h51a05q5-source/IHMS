import { Router, Request, Response, NextFunction } from 'express';
import { complaintService } from './complaint.service';
import { query, queryOne, queryRows } from '../../config/database';
import { authenticate, authorize } from '../../common/guards/auth.guard';
import { UserRole, ComplaintStatus } from '../../config/constants';
import { generateComplaintNumber } from '../../common/utils/code-generator';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, status, priority, page = 1, pageSize = 50 } = req.query;
    const orgId = req.user!.organizationId;

    let whereClause = 'WHERE organization_id = $1';
    const params: any[] = [orgId];

    if (req.user!.role === UserRole.STUDENT) {
      const sId = req.user!.studentId || req.user!.id;
      params.push(sId);
      whereClause += ` AND (student_id = $${params.length} OR customer_code = $${params.length})`;
    } else if (studentId) {
      params.push(studentId);
      whereClause += ` AND (student_id = $${params.length} OR customer_code = $${params.length})`;
    }
    if (status && status !== 'ALL') {
      params.push(status);
      whereClause += ` AND status = $${params.length}`;
    }
    if (priority && priority !== 'ALL') {
      params.push(priority);
      whereClause += ` AND priority = $${params.length}`;
    }

    const countSql = `SELECT COUNT(id)::int as total FROM complaints ${whereClause}`;
    const totalRow = await queryOne<any>(countSql, params);
    const total = totalRow?.total || 0;

    const limit = Math.min(100, Math.max(1, Number(pageSize)));
    const offset = Math.max(0, (Number(page) - 1) * limit);
    const dataSql = `SELECT * FROM complaints ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const complaints = await queryRows<any>(dataSql, params);

    const mapped = complaints.map((c: any) => ({
      id: c.id,
      _id: c.id,
      ticketCode: c.complaint_number,
      complaintNumber: c.complaint_number,
      studentId: c.student_id,
      studentName: c.student_name || 'Student',
      title: c.title,
      description: c.description,
      category: c.category,
      status: c.status,
      priority: c.priority || 'MEDIUM',
      createdAt: c.created_at,
      remarks: c.resolution_notes,
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

router.get('/student/:studentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.organizationId;
    const complaints = await queryRows<any>(
      `SELECT * FROM complaints
       WHERE organization_id = $1 AND (student_id = $2 OR customer_code = $2)
       ORDER BY created_at DESC`,
      [orgId, req.params.studentId]
    );

    const mapped = complaints.map((c: any) => ({
      id: c.id,
      _id: c.id,
      ticketCode: c.complaint_number,
      studentId: c.student_id,
      title: c.title,
      description: c.description,
      category: c.category,
      status: c.status,
      priority: c.priority || 'MEDIUM',
      createdAt: c.created_at,
      remarks: c.resolution_notes,
    }));

    res.json({ success: true, data: mapped });
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, category, priority, studentId } = req.body;
    const orgId = req.user!.organizationId;
    const targetStudentId = studentId || req.user!.studentId || req.user!.id;

    const student = await queryOne<any>(
      'SELECT id, customer_code, full_name, hostel_id FROM students WHERE (id = $1 OR user_id = $1 OR customer_code = $1) AND organization_id = $2',
      [targetStudentId, orgId]
    );

    const sName = student?.full_name || 'Resident';
    const cCode = student?.customer_code || 'GEN-001';
    let bId = student?.hostel_id || req.user!.branchId;

    if (!bId) {
      const b = await queryOne<any>('SELECT id FROM hostels WHERE organization_id = $1 LIMIT 1', [orgId]);
      bId = b ? b.id : 'default-branch';
    }

    const branch = await queryOne<any>('SELECT branch_code FROM hostels WHERE id = $1', [bId]);
    const hostelCode = branch?.branch_code || 'HYD001';
    const complaintNumber = await generateComplaintNumber(orgId, hostelCode);
    const complaintId = require('crypto').randomUUID();

    const c = await queryOne<any>(
      `INSERT INTO complaints (
        id, complaint_number, organization_id, branch_id, student_id, customer_code,
        student_name, title, description, category, priority, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'OPEN')
      RETURNING *`,
      [
        complaintId,
        complaintNumber,
        orgId,
        bId,
        student?.id || targetStudentId,
        cCode,
        sName,
        title,
        description || '',
        category || 'OTHER',
        priority || 'MEDIUM'
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        id: c.id,
        ticketCode: c.complaint_number,
        studentId: targetStudentId,
        title: c.title,
        description: c.description,
        category: c.category,
        priority: c.priority,
        status: c.status,
        createdAt: c.created_at,
      },
    });
  } catch (err) { next(err); }
});

const handleUpdateStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, remarks, resolutionNotes, maintenanceCost } = req.body;
    const orgId = req.user!.organizationId;
    const targetStatus = status || 'RESOLVED';
    const cost = Number(maintenanceCost || 0);
    const notes = resolutionNotes || remarks || '';

    const c = await queryOne<any>(
      `UPDATE complaints
       SET status = $1, resolution_notes = $2, maintenance_cost = $3,
           resolved_at = CASE WHEN $1 IN ('RESOLVED', 'CLOSED') THEN NOW() ELSE resolved_at END,
           updated_at = NOW()
       WHERE (id = $4 OR complaint_number = $4) AND organization_id = $5
       RETURNING *`,
      [targetStatus, notes, cost, req.params.id, orgId]
    );
    res.json({ success: true, data: c });
  } catch (err) { next(err); }
};

router.patch('/:id/status', handleUpdateStatus);
router.patch('/:id/resolve', handleUpdateStatus);

export const complaintRouter = router;
