import { query, queryOne, queryRows } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { generateComplaintNumber } from '../../common/utils/code-generator';
import { ComplaintPriority, ComplaintStatus } from '../../config/constants';
import { emitRealTimeEvent } from '../../events/events.gateway';

export class ComplaintService {
  async createComplaint(orgId: string, data: any): Promise<any> {
    const student = await queryOne<any>(
      `SELECT s.*, r.room_number, b.bed_code, h.branch_code
       FROM students s
       LEFT JOIN rooms r ON r.id = s.room_id
       LEFT JOIN beds b ON b.id = s.bed_id
       LEFT JOIN hostels h ON h.id = s.hostel_id
       WHERE (s.id = $1 OR s.student_id = $1 OR UPPER(s.customer_code) = UPPER($1) OR s.user_id = $1) AND s.organization_id = $2`,
      [data.studentId, orgId]
    );
    if (!student) throw new AppError('Student not found', 404);

    const hostelCode = student.branch_code || 'HYD001';
    const complaintNumber = await generateComplaintNumber(orgId, hostelCode);
    const complaintId = require('crypto').randomUUID();

    const complaint = await queryOne<any>(
      `INSERT INTO complaints (
        id, complaint_number, organization_id, branch_id, student_id, customer_code,
        student_name, room_code, category, title, description, priority, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'OPEN')
      RETURNING id, id as "_id", complaint_number as "complaintNumber", organization_id as "organizationId",
                branch_id as "branchId", student_id as "studentId", customer_code as "customerCode",
                student_name as "studentName", room_code as "roomCode", category, title,
                description, priority, status, created_at as "createdAt"`,
      [
        complaintId,
        complaintNumber,
        orgId,
        student.hostel_id,
        student.id,
        student.customer_code,
        student.full_name,
        student.room_number || '',
        data.category || 'OTHER',
        data.title,
        data.description || '',
        data.priority || ComplaintPriority.MEDIUM
      ]
    );

    emitRealTimeEvent('complaint.created', {
      complaintNumber,
      title: complaint.title,
      category: complaint.category,
      roomCode: complaint.roomCode,
      branchId: complaint.branchId,
    }, { branchId: complaint.branchId });

    emitRealTimeEvent('dashboard.kpi_updated', { orgId }, { orgId });

    return complaint;
  }

  async assignStaff(orgId: string, complaintId: string, staffId: string, staffName: string): Promise<any> {
    const complaint = await queryOne<any>(
      `UPDATE complaints
       SET assigned_staff_id = $1, assigned_staff_name = $2, status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP
       WHERE (id = $3 OR complaint_number = $3) AND organization_id = $4
       RETURNING id, id as "_id", complaint_number as "complaintNumber", organization_id as "organizationId",
                 branch_id as "branchId", student_id as "studentId", customer_code as "customerCode",
                 student_name as "studentName", room_code as "roomCode", category, title,
                 description, priority, status, assigned_staff_id as "assignedStaffId",
                 assigned_staff_name as "assignedStaffName", created_at as "createdAt", updated_at as "updatedAt"`,
      [staffId, staffName, complaintId, orgId]
    );
    if (!complaint) throw new AppError('Complaint not found', 404);

    emitRealTimeEvent('complaint.updated', {
      complaintNumber: complaint.complaintNumber,
      status: complaint.status,
      assignedStaffName: complaint.assignedStaffName,
    }, { branchId: complaint.branchId });

    return complaint;
  }

  async resolveComplaint(orgId: string, complaintId: string, data: { resolutionNotes: string; maintenanceCost?: number }): Promise<any> {
    const complaint = await queryOne<any>(
      `UPDATE complaints
       SET resolution_notes = $1, maintenance_cost = $2, status = 'RESOLVED',
           resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE (id = $3 OR complaint_number = $3) AND organization_id = $4
       RETURNING id, id as "_id", complaint_number as "complaintNumber", organization_id as "organizationId",
                 branch_id as "branchId", student_id as "studentId", customer_code as "customerCode",
                 student_name as "studentName", room_code as "roomCode", category, title,
                 description, priority, status, assigned_staff_id as "assignedStaffId",
                 assigned_staff_name as "assignedStaffName", resolution_notes as "resolutionNotes",
                 maintenance_cost as "maintenanceCost", resolved_at as "resolvedAt",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [data.resolutionNotes, Number(data.maintenanceCost) || 0, complaintId, orgId]
    );
    if (!complaint) throw new AppError('Complaint not found', 404);

    emitRealTimeEvent('complaint.resolved', {
      complaintNumber: complaint.complaintNumber,
      status: ComplaintStatus.RESOLVED,
    }, { branchId: complaint.branchId });

    emitRealTimeEvent('dashboard.kpi_updated', { orgId }, { orgId });

    return complaint;
  }

  async listComplaints(orgId: string, branchId?: string, status?: string, studentId?: string) {
    let sql = `SELECT id, id as "_id", complaint_number as "complaintNumber", organization_id as "organizationId",
                      branch_id as "branchId", student_id as "studentId", customer_code as "customerCode",
                      student_name as "studentName", room_code as "roomCode", category, title,
                      description, priority, status, assigned_staff_id as "assignedStaffId",
                      assigned_staff_name as "assignedStaffName", resolution_notes as "resolutionNotes",
                      maintenance_cost as "maintenanceCost", resolved_at as "resolvedAt",
                      created_at as "createdAt", updated_at as "updatedAt"
               FROM complaints
               WHERE organization_id = $1`;
    const params: any[] = [orgId];

    if (branchId && branchId !== 'ALL') {
      params.push(branchId);
      sql += ` AND branch_id = $${params.length}`;
    }
    if (status && status !== 'ALL') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    if (studentId) {
      params.push(studentId);
      sql += ` AND (student_id = $${params.length} OR customer_code = $${params.length})`;
    }

    sql += ' ORDER BY created_at DESC';
    return queryRows(sql, params);
  }
}

export const complaintService = new ComplaintService();
