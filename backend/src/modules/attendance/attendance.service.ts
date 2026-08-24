import { query, queryOne, queryRows } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { generateLeaveNumber } from '../../common/utils/code-generator';
import { generateQrDataUrl } from '../../common/utils/qr-generator';
import { LeaveStatus } from '../../config/constants';
import { emitRealTimeEvent } from '../../events/events.gateway';

export class AttendanceService {
  async markBatchAttendance(orgId: string, branchId: string, records: any[], markedBy: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const r of records) {
      const attId = require('crypto').randomUUID();
      await query(
        `INSERT INTO attendances (
          id, organization_id, branch_id, student_id, customer_code,
          student_name, room_code, bed_code, date, status, type, marked_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'NIGHT_CHECK', $11)
        ON CONFLICT (organization_id, branch_id, student_id, date)
        DO UPDATE SET customer_code = $5, student_name = $6, room_code = $7,
                      bed_code = $8, status = $10, marked_by = $11, updated_at = CURRENT_TIMESTAMP`,
        [
          attId,
          orgId,
          branchId,
          r.studentId,
          r.customerCode || '',
          r.studentName || '',
          r.roomCode || '',
          r.bedCode || '',
          today,
          r.status || 'PRESENT',
          markedBy
        ]
      );
    }

    emitRealTimeEvent('attendance.updated', { branchId, date: today }, { branchId });
    return { success: true, count: records.length };
  }

  async getAttendanceReport(orgId: string, branchId: string, dateStr?: string) {
    const date = dateStr ? new Date(dateStr) : new Date();
    date.setHours(0, 0, 0, 0);

    const rows = await queryRows<any>(
      `SELECT id, id as "_id", organization_id as "organizationId", branch_id as "branchId",
              student_id as "studentId", customer_code as "customerCode",
              student_name as "studentName", room_code as "roomCode",
              bed_code as "bedCode", date, status, type, marked_by as "markedBy",
              created_at as "createdAt"
       FROM attendances
       WHERE organization_id = $1 AND branch_id = $2 AND date::date = $3::date`,
      [orgId, branchId, date]
    );
    return rows;
  }

  async applyLeave(orgId: string, data: any): Promise<any> {
    const student = await queryOne<any>(
      `SELECT s.*, r.room_number, b.bed_code
       FROM students s
       LEFT JOIN rooms r ON r.id = s.room_id
       LEFT JOIN beds b ON b.id = s.bed_id
       WHERE (s.id = $1 OR s.student_id = $1 OR UPPER(s.customer_code) = UPPER($1) OR s.user_id = $1) AND s.organization_id = $2`,
      [data.studentId, orgId]
    );
    if (!student) throw new AppError('Student not found', 404);

    const leaveNumber = await generateLeaveNumber(orgId);
    const leaveId = require('crypto').randomUUID();

    const leave = await queryOne<any>(
      `INSERT INTO leave_requests (
        id, leave_number, organization_id, branch_id, student_id, customer_code,
        student_name, room_code, start_date, end_date, reason, destination_address,
        parent_contact, parent_approval, warden_approval, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'APPROVED', 'PENDING', 'PENDING')
      RETURNING id, id as "_id", leave_number as "leaveNumber", organization_id as "organizationId",
                branch_id as "branchId", student_id as "studentId", customer_code as "customerCode",
                student_name as "studentName", room_code as "roomCode", start_date as "startDate",
                end_date as "endDate", reason, destination_address as "destinationAddress",
                parent_contact as "parentContact", parent_approval as "parentApproval",
                warden_approval as "wardenApproval", status, created_at as "createdAt"`,
      [
        leaveId,
        leaveNumber,
        orgId,
        student.hostel_id,
        student.id,
        student.customer_code,
        student.full_name,
        student.room_number || '',
        new Date(data.startDate),
        new Date(data.endDate),
        data.reason || '',
        data.destinationAddress || '',
        data.parentContact || student.guardian_phone
      ]
    );

    emitRealTimeEvent('leave.created', {
      leaveNumber,
      customerCode: student.customer_code,
      studentName: student.full_name,
      branchId: student.hostel_id,
    }, { branchId: student.hostel_id });

    return leave;
  }

  async approveLeave(orgId: string, leaveId: string, status: LeaveStatus, reviewedBy: string): Promise<any> {
    const leave = await queryOne<any>(
      'SELECT * FROM leave_requests WHERE (id = $1 OR leave_number = $1) AND organization_id = $2',
      [leaveId, orgId]
    );
    if (!leave) throw new AppError('Leave request not found', 404);

    let gatePassCode = leave.gate_pass_code;
    let gatePassQr = leave.gate_pass_qr;

    if (status === LeaveStatus.APPROVED) {
      gatePassCode = `GP-${leave.leave_number}`;
      gatePassQr = await generateQrDataUrl({
        gatePassCode,
        leaveNumber: leave.leave_number,
        customerCode: leave.customer_code,
        studentName: leave.student_name,
        validUntil: leave.end_date,
      });
    }

    const wardenApproval = status === LeaveStatus.APPROVED ? 'APPROVED' : 'REJECTED';

    const updated = await queryOne<any>(
      `UPDATE leave_requests
       SET status = $1, warden_approval = $2, reviewed_by = $3,
           gate_pass_code = $4, gate_pass_qr = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, id as "_id", leave_number as "leaveNumber", organization_id as "organizationId",
                 branch_id as "branchId", student_id as "studentId", customer_code as "customerCode",
                 student_name as "studentName", room_code as "roomCode", start_date as "startDate",
                 end_date as "endDate", reason, destination_address as "destinationAddress",
                 parent_contact as "parentContact", parent_approval as "parentApproval",
                 warden_approval as "wardenApproval", status, gate_pass_code as "gatePassCode",
                 gate_pass_qr as "gatePassQr", reviewed_by as "reviewedBy",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [status, wardenApproval, reviewedBy, gatePassCode, gatePassQr, leave.id]
    );

    emitRealTimeEvent('leave.status_changed', {
      leaveId: updated.id,
      leaveNumber: updated.leaveNumber,
      status,
      gatePassCode: updated.gatePassCode,
    }, { branchId: updated.branchId });

    return updated;
  }

  async listLeaves(orgId: string, branchId?: string, status?: string, studentId?: string) {
    let sql = `SELECT id, id as "_id", leave_number as "leaveNumber", organization_id as "organizationId",
                      branch_id as "branchId", student_id as "studentId", customer_code as "customerCode",
                      student_name as "studentName", room_code as "roomCode", start_date as "startDate",
                      end_date as "endDate", reason, destination_address as "destinationAddress",
                      parent_contact as "parentContact", parent_approval as "parentApproval",
                      warden_approval as "wardenApproval", status, gate_pass_code as "gatePassCode",
                      gate_pass_qr as "gatePassQr", actual_out_time as "actualOutTime",
                      actual_in_time as "actualInTime", reviewed_by as "reviewedBy",
                      created_at as "createdAt", updated_at as "updatedAt"
               FROM leave_requests
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

  async verifyGatePass(orgId: string, gatePassCode: string, action: 'EXIT' | 'ENTRY') {
    const leave = await queryOne<any>(
      'SELECT * FROM leave_requests WHERE organization_id = $1 AND gate_pass_code = $2',
      [orgId, gatePassCode]
    );
    if (!leave) throw new AppError('Invalid or expired Gate Pass Code', 404);

    let updated: any;
    if (action === 'EXIT') {
      updated = await queryOne<any>(
        'UPDATE leave_requests SET actual_out_time = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
        [leave.id]
      );
    } else {
      updated = await queryOne<any>(
        'UPDATE leave_requests SET actual_in_time = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
        [leave.id]
      );
    }

    emitRealTimeEvent('gatepass.verified', {
      gatePassCode,
      action,
      studentName: leave.student_name,
    }, { branchId: leave.branch_id });

    return { success: true, leave: updated, action, timestamp: new Date() };
  }
}

export const attendanceService = new AttendanceService();
