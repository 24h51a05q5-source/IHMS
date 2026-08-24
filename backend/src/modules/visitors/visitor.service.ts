import { query, queryOne, queryRows } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { generateVisitorPassNumber } from '../../common/utils/code-generator';
import { generateQrDataUrl } from '../../common/utils/qr-generator';
import { VisitorStatus } from '../../config/constants';
import { emitRealTimeEvent } from '../../events/events.gateway';

export class VisitorService {
  async registerVisitor(orgId: string, branchId: string, data: any): Promise<any> {
    const student = await queryOne<any>(
      'SELECT id, customer_code, full_name, hostel_id FROM students WHERE organization_id = $1 AND (UPPER(customer_code) = $2 OR id = $2)',
      [orgId, (data.customerCode || '').toUpperCase()]
    );
    if (!student) throw new AppError('Student not found with this customer code', 404);

    const branch = await queryOne<any>('SELECT branch_code FROM hostels WHERE id = $1', [branchId]);
    const hostelCode = branch?.branch_code || 'HYD001';

    const visitorPassNumber = await generateVisitorPassNumber(orgId, hostelCode);
    const checkInTime = new Date();
    const qrPayload = await generateQrDataUrl({
      visitorPassNumber,
      visitorName: data.visitorName,
      studentName: student.full_name,
      customerCode: student.customer_code,
      checkInTime,
    });

    const visitorId = require('crypto').randomUUID();
    const visitor = await queryOne<any>(
      `INSERT INTO visitors (
        id, visitor_pass_number, organization_id, branch_id, visitor_name, phone,
        student_id, customer_code, student_name, purpose, id_proof_number,
        status, check_in_time, qr_payload, security_guard_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'INSIDE', $12, $13, $14)
      RETURNING id, id as "_id", visitor_pass_number as "visitorPassNumber", organization_id as "organizationId",
                branch_id as "branchId", visitor_name as "visitorName", phone,
                student_id as "studentId", customer_code as "customerCode",
                student_name as "studentName", purpose, id_proof_number as "idProofNumber",
                status, check_in_time as "checkInTime", qr_payload as "qrPayload",
                security_guard_name as "securityGuardName", created_at as "createdAt"`,
      [
        visitorId,
        visitorPassNumber,
        orgId,
        branchId,
        data.visitorName,
        data.phone || '',
        student.id,
        student.customer_code,
        student.full_name,
        data.purpose || 'Meeting Student',
        data.idProofNumber || '',
        checkInTime,
        qrPayload,
        data.securityGuardName || 'Security Staff'
      ]
    );

    emitRealTimeEvent('visitor.checked_in', {
      visitorPassNumber,
      visitorName: visitor.visitorName,
      studentName: student.full_name,
      branchId,
    }, { branchId });

    return visitor;
  }

  async checkOutVisitor(orgId: string, visitorId: string): Promise<any> {
    const visitor = await queryOne<any>(
      `UPDATE visitors
       SET status = 'EXITED', check_out_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE (id = $1 OR visitor_pass_number = $1) AND organization_id = $2
       RETURNING id, id as "_id", visitor_pass_number as "visitorPassNumber", organization_id as "organizationId",
                 branch_id as "branchId", visitor_name as "visitorName", phone,
                 student_id as "studentId", customer_code as "customerCode",
                 student_name as "studentName", purpose, id_proof_number as "idProofNumber",
                 status, check_in_time as "checkInTime", check_out_time as "checkOutTime",
                 qr_payload as "qrPayload", security_guard_name as "securityGuardName",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [visitorId, orgId]
    );
    if (!visitor) throw new AppError('Visitor record not found', 404);

    emitRealTimeEvent('visitor.checked_out', {
      visitorPassNumber: visitor.visitorPassNumber,
      visitorName: visitor.visitorName,
      branchId: visitor.branchId,
    }, { branchId: visitor.branchId });

    return visitor;
  }

  async listVisitors(orgId: string, branchId?: string, status?: string) {
    let sql = `SELECT id, id as "_id", visitor_pass_number as "visitorPassNumber", organization_id as "organizationId",
                      branch_id as "branchId", visitor_name as "visitorName", phone,
                      student_id as "studentId", customer_code as "customerCode",
                      student_name as "studentName", purpose, id_proof_number as "idProofNumber",
                      status, check_in_time as "checkInTime", check_out_time as "checkOutTime",
                      qr_payload as "qrPayload", security_guard_name as "securityGuardName",
                      created_at as "createdAt", updated_at as "updatedAt"
               FROM visitors
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

    sql += ' ORDER BY check_in_time DESC';
    return queryRows(sql, params);
  }

  async verifyPass(orgId: string, passNumber: string) {
    const visitor = await queryOne<any>(
      `SELECT id, id as "_id", visitor_pass_number as "visitorPassNumber", organization_id as "organizationId",
              branch_id as "branchId", visitor_name as "visitorName", phone,
              student_id as "studentId", customer_code as "customerCode",
              student_name as "studentName", purpose, id_proof_number as "idProofNumber",
              status, check_in_time as "checkInTime", check_out_time as "checkOutTime",
              qr_payload as "qrPayload", security_guard_name as "securityGuardName",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM visitors
       WHERE organization_id = $1 AND (visitor_pass_number = $2 OR id = $2)`,
      [orgId, passNumber]
    );
    if (!visitor) throw new AppError('Invalid Visitor Pass Number', 404);
    return visitor;
  }
}

export const visitorService = new VisitorService();
