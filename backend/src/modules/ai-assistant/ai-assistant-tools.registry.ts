import crypto from 'crypto';
import { query, queryOne, queryRows } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { roomService } from '../rooms/room.service';
import { studentService } from '../students/student.service';
import { feeService } from '../fees/fee.service';
import { complaintService } from '../complaints/complaint.service';
import { announcementService } from '../announcements/announcement.service';
import { dashboardService } from '../dashboard/dashboard.service';
import { AuthenticatedOwnerContext, ActionConfirmationProposal } from './ai-assistant.types';

export class AiAssistantToolsRegistry {
  // =========================================================================
  // CONFIRMATION TOKEN MANAGEMENT (Level 2 Actions)
  // =========================================================================

  async createConfirmationToken(
    orgId: string,
    ownerId: string,
    actionType: string,
    payload: Record<string, any>,
    description: string,
    expiresInMinutes: number = 15
  ): Promise<ActionConfirmationProposal> {
    const token = `ACT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

    await query(
      `INSERT INTO ai_confirmation_tokens (
        id, organization_id, owner_id, action_type, action_payload, status, expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, CURRENT_TIMESTAMP)`,
      [token, orgId, ownerId, actionType, JSON.stringify(payload), expiresAt]
    );

    return {
      token,
      actionType,
      description,
      actionDetails: payload,
      expiresAt,
    };
  }

  async validateAndConsumeToken(
    token: string,
    orgId: string,
    ownerId: string
  ): Promise<{ actionType: string; payload: any }> {
    const cleanToken = String(token || '').trim().toUpperCase();
    const tokenRow = await queryOne<any>(
      `SELECT * FROM ai_confirmation_tokens
       WHERE id = $1 AND organization_id = $2 AND owner_id = $3
       LIMIT 1`,
      [cleanToken, orgId, ownerId]
    );

    if (!tokenRow) {
      throw new AppError('Confirmation token not found or invalid for this owner.', 404);
    }

    if (tokenRow.status !== 'PENDING') {
      throw new AppError(`This action has already been ${tokenRow.status.toLowerCase()}.`, 400);
    }

    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      await query("UPDATE ai_confirmation_tokens SET status = 'EXPIRED' WHERE id = $1", [cleanToken]);
      throw new AppError('This confirmation request has expired. Please initiate the request again.', 400);
    }

    // Atomically mark confirmed
    await query("UPDATE ai_confirmation_tokens SET status = 'CONFIRMED' WHERE id = $1", [cleanToken]);

    const payload = typeof tokenRow.action_payload === 'string'
      ? JSON.parse(tokenRow.action_payload)
      : tokenRow.action_payload;

    return {
      actionType: tokenRow.action_type,
      payload,
    };
  }

  async cancelToken(
    token: string,
    orgId: string,
    ownerId: string
  ): Promise<{ success: boolean; message: string }> {
    const cleanToken = String(token || '').trim().toUpperCase();
    const res = await query(
      `UPDATE ai_confirmation_tokens
       SET status = 'CANCELLED'
       WHERE id = $1 AND organization_id = $2 AND owner_id = $3 AND status = 'PENDING'`,
      [cleanToken, orgId, ownerId]
    );

    if ((res as any).rowCount === 0) {
      throw new AppError('Pending confirmation token not found or already processed.', 404);
    }

    return {
      success: true,
      message: 'Action was successfully cancelled. No changes were made to IHMS.',
    };
  }

  // =========================================================================
  // LEVEL 1: READ-ONLY INFORMATION TOOLS
  // =========================================================================

  async getOccupancyStats(ctx: AuthenticatedOwnerContext, branchId?: string) {
    const targetBranch = branchId || ctx.hostelId;
    const rooms = await roomService.listRooms(ctx.organizationId, targetBranch);
    const totalRooms = rooms.length;
    let totalBeds = 0;
    let occupiedBeds = 0;

    for (const r of rooms) {
      totalBeds += Number(r.totalBeds || r.capacity || 0);
      occupiedBeds += Number(r.occupiedBeds || r.occupied || 0);
    }
    const vacantBeds = Math.max(0, totalBeds - occupiedBeds);
    const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    return {
      totalRooms,
      totalBeds,
      occupiedBeds,
      vacantBeds,
      occupancyRate: `${occupancyRate}%`,
    };
  }

  async getVacantBeds(ctx: AuthenticatedOwnerContext, branchId?: string, roomType?: string) {
    const targetBranch = branchId || ctx.hostelId;
    let sql = `
      SELECT b.id, b.bed_code as "bedCode", b.bed_number as "bedNumber",
             b.monthly_rate as "monthlyRate", b.status,
             r.room_number as "roomNumber", r.floor, r.room_type as "roomType",
             h.name as "hostelName"
      FROM beds b
      JOIN rooms r ON r.id = b.room_id
      LEFT JOIN hostels h ON h.id = b.hostel_id
      WHERE b.organization_id = $1 AND b.status = 'AVAILABLE'
    `;
    const params: any[] = [ctx.organizationId];

    if (targetBranch && targetBranch !== 'ALL') {
      params.push(targetBranch);
      sql += ` AND (b.hostel_id = $${params.length} OR r.hostel_id = $${params.length})`;
    }
    if (roomType) {
      params.push(roomType);
      sql += ` AND UPPER(r.room_type) = UPPER($${params.length})`;
    }

    sql += ' ORDER BY r.room_number ASC, b.bed_number ASC LIMIT 100';
    const rows = await queryRows<any>(sql, params);

    return {
      count: rows.length,
      vacantBeds: rows.map((b) => ({
        bedCode: b.bedCode,
        roomNumber: b.roomNumber,
        floor: b.floor,
        roomType: b.roomType || 'Standard',
        monthlyRate: Number(b.monthlyRate || 0),
        hostelName: b.hostelName || 'Main Branch',
      })),
    };
  }

  async getOccupiedBeds(ctx: AuthenticatedOwnerContext, branchId?: string, roomNumber?: string) {
    const targetBranch = branchId || ctx.hostelId;
    let sql = `
      SELECT b.id, b.bed_code as "bedCode", b.bed_number as "bedNumber",
             b.current_student_id as "studentId", b.current_student_name as "studentName",
             b.current_customer_code as "customerCode",
             r.room_number as "roomNumber", r.room_type as "roomType",
             h.name as "hostelName"
      FROM beds b
      JOIN rooms r ON r.id = b.room_id
      LEFT JOIN hostels h ON h.id = b.hostel_id
      WHERE b.organization_id = $1 AND (b.status = 'OCCUPIED' OR b.current_student_id IS NOT NULL)
    `;
    const params: any[] = [ctx.organizationId];

    if (targetBranch && targetBranch !== 'ALL') {
      params.push(targetBranch);
      sql += ` AND (b.hostel_id = $${params.length} OR r.hostel_id = $${params.length})`;
    }
    if (roomNumber) {
      params.push(roomNumber);
      sql += ` AND r.room_number = $${params.length}`;
    }

    sql += ' ORDER BY r.room_number ASC, b.bed_number ASC LIMIT 100';
    const rows = await queryRows<any>(sql, params);

    return {
      count: rows.length,
      occupiedBeds: rows.map((b) => ({
        bedCode: b.bedCode,
        roomNumber: b.roomNumber,
        studentName: b.studentName || 'Assigned Student',
        customerCode: b.customerCode || 'N/A',
      })),
    };
  }

  async getStudentCount(ctx: AuthenticatedOwnerContext, branchId?: string) {
    const targetBranch = branchId || ctx.hostelId;
    let sql = `
      SELECT status, COUNT(*) as count
      FROM students
      WHERE organization_id = $1
    `;
    const params: any[] = [ctx.organizationId];

    if (targetBranch && targetBranch !== 'ALL') {
      params.push(targetBranch);
      sql += ` AND hostel_id = $${params.length}`;
    }
    sql += ' GROUP BY status';
    const rows = await queryRows<any>(sql, params);

    let total = 0;
    let active = 0;
    let pending = 0;
    let left = 0;

    for (const r of rows) {
      const c = Number(r.count || 0);
      total += c;
      if (r.status === 'ACTIVE') active += c;
      else if (r.status === 'PENDING') pending += c;
      else if (r.status === 'LEFT') left += c;
    }

    return {
      total,
      active,
      pending,
      left,
    };
  }

  async getOutstandingFees(ctx: AuthenticatedOwnerContext, branchId?: string, search?: string) {
    const targetBranch = branchId || ctx.hostelId;
    let sql = `
      SELECT s.id, s.full_name as "fullName", s.customer_code as "customerCode",
             s.financial_total_demanded as "totalDemanded",
             s.financial_total_paid as "totalPaid",
             s.financial_outstanding_balance as "outstandingBalance",
             CASE WHEN s.financial_outstanding_balance <= 0 THEN 'PAID' WHEN s.financial_total_paid > 0 THEN 'PARTIAL' ELSE 'UNPAID' END as "paymentStatus",
             r.room_number as "roomNumber", b.bed_code as "bedCode"
      FROM students s
      LEFT JOIN rooms r ON r.id = s.room_id
      LEFT JOIN beds b ON b.id = s.bed_id
      WHERE s.organization_id = $1
        AND s.financial_outstanding_balance > 0
        AND s.status != 'LEFT'
    `;
    const params: any[] = [ctx.organizationId];

    if (targetBranch && targetBranch !== 'ALL') {
      params.push(targetBranch);
      sql += ` AND s.hostel_id = $${params.length}`;
    }
    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (LOWER(s.full_name) LIKE $${params.length} OR LOWER(s.customer_code) LIKE $${params.length})`;
    }

    sql += ' ORDER BY s.financial_outstanding_balance DESC LIMIT 100';
    const rows = await queryRows<any>(sql, params);

    const totalOutstandingAmount = rows.reduce(
      (sum, r) => sum + Number(r.outstandingBalance || 0),
      0
    );

    return {
      count: rows.length,
      totalOutstandingAmount,
      students: rows.map((r) => ({
        fullName: r.fullName,
        customerCode: r.customerCode,
        roomNumber: r.roomNumber || 'N/A',
        bedCode: r.bedCode || 'N/A',
        totalDemanded: Number(r.totalDemanded || 0),
        totalPaid: Number(r.totalPaid || 0),
        outstandingBalance: Number(r.outstandingBalance || 0),
        status: r.paymentStatus || 'UNPAID',
      })),
    };
  }

  async getPaymentHistory(
    ctx: AuthenticatedOwnerContext,
    branchId?: string,
    statusFilter?: string,
    limit: number = 20
  ) {
    const targetBranch = branchId || ctx.hostelId;
    let sql = `
      SELECT p.id, p.payment_number as "paymentNumber", p.amount, p.status,
             p.payment_method as "paymentMethod", p.created_at as "createdAt",
             p.receipt_number as "receiptNumber",
             s.full_name as "studentName", s.customer_code as "customerCode"
      FROM payments p
      LEFT JOIN students s ON s.id = p.student_id
      WHERE p.organization_id = $1
    `;
    const params: any[] = [ctx.organizationId];

    if (targetBranch && targetBranch !== 'ALL') {
      params.push(targetBranch);
      sql += ` AND p.hostel_id = $${params.length}`;
    }
    if (statusFilter && statusFilter !== 'ALL') {
      params.push(statusFilter.toUpperCase());
      sql += ` AND p.status = $${params.length}`;
    }

    sql += ` ORDER BY p.created_at DESC LIMIT ${Math.min(100, Math.max(1, limit))}`;
    const rows = await queryRows<any>(sql, params);

    // Filter out any internal secrets or payment gateway credentials
    return {
      count: rows.length,
      payments: rows.map((p) => ({
        paymentNumber: p.paymentNumber,
        studentName: p.studentName || 'Student',
        customerCode: p.customerCode || 'N/A',
        amount: Number(p.amount || 0),
        status: p.status,
        paymentMethod: p.paymentMethod,
        receiptNumber: p.receiptNumber || null,
        date: p.createdAt,
      })),
    };
  }

  async getComplaintsSummary(ctx: AuthenticatedOwnerContext, branchId?: string, statusFilter?: string) {
    const targetBranch = branchId || ctx.hostelId;
    const complaints = await complaintService.listComplaints(ctx.organizationId, targetBranch, statusFilter);
    const total = complaints.length;
    const open = complaints.filter((c: any) => c.status === 'OPEN').length;
    const inProgress = complaints.filter((c: any) => c.status === 'IN_PROGRESS').length;
    const resolved = complaints.filter((c: any) => c.status === 'RESOLVED').length;

    return {
      total,
      open,
      inProgress,
      resolved,
      recent: complaints.slice(0, 10).map((c: any) => ({
        complaintNumber: c.complaintNumber,
        studentName: c.studentName,
        roomCode: c.roomCode,
        category: c.category,
        title: c.title,
        priority: c.priority,
        status: c.status,
      })),
    };
  }

  async getAnnouncements(ctx: AuthenticatedOwnerContext, branchId?: string) {
    const targetBranch = branchId || ctx.hostelId;
    const result = await announcementService.list(ctx.organizationId, {
      branchId: targetBranch,
      pageSize: 10,
    });
    const announcements = result.items || [];
    return {
      count: result.total || announcements.length,
      announcements: announcements.slice(0, 10).map((a: any) => ({
        id: a.id,
        title: a.title,
        message: a.message,
        priority: a.priority,
        targetType: a.target_type || a.targetType,
        createdAt: a.created_at || a.createdAt,
      })),
    };
  }

  async getDashboardSummary(ctx: AuthenticatedOwnerContext, branchId?: string) {
    const targetBranch = branchId || ctx.hostelId;
    const occupancy = await this.getOccupancyStats(ctx, targetBranch);
    const students = await this.getStudentCount(ctx, targetBranch);
    const complaints = await this.getComplaintsSummary(ctx, targetBranch, 'OPEN');

    return {
      occupancy,
      students,
      openComplaints: complaints.open,
    };
  }

  // =========================================================================
  // LEVEL 2: LIMITED PERMITTED ACTIONS WITH EXPLICIT CONFIRMATION
  // =========================================================================

  async prepareRoomTransfer(
    ctx: AuthenticatedOwnerContext,
    params: {
      studentIdentifier: string;
      targetRoomNumber?: string;
      targetBedCode?: string;
      reason?: string;
    }
  ): Promise<ActionConfirmationProposal> {
    const ident = String(params.studentIdentifier || '').trim();
    if (!ident) {
      throw new AppError('Student name, student ID, or customer code is required.', 400);
    }

    // 1. Locate student
    const student = await queryOne<any>(
      `SELECT s.*, r.room_number, b.bed_code, h.name as hostel_name
       FROM students s
       LEFT JOIN rooms r ON r.id = s.room_id
       LEFT JOIN beds b ON b.id = s.bed_id
       LEFT JOIN hostels h ON h.id = s.hostel_id
       WHERE s.organization_id = $1
         AND (s.id = $2 OR UPPER(s.customer_code) = UPPER($2) OR s.student_id = $2 OR LOWER(s.full_name) LIKE $3)
       LIMIT 1`,
      [ctx.organizationId, ident, `%${ident.toLowerCase()}%`]
    );

    if (!student) {
      throw new AppError(`Student '${ident}' not found in your hostel organization.`, 404);
    }

    // 2. Locate available target bed
    let targetBed: any = null;
    if (params.targetBedCode) {
      targetBed = await queryOne<any>(
        `SELECT b.*, r.room_number, h.name as hostel_name
         FROM beds b
         JOIN rooms r ON r.id = b.room_id
         LEFT JOIN hostels h ON h.id = b.hostel_id
         WHERE b.organization_id = $1 AND UPPER(b.bed_code) = UPPER($2)`,
        [ctx.organizationId, params.targetBedCode.trim()]
      );
      if (!targetBed) {
        throw new AppError(`Target bed '${params.targetBedCode}' not found.`, 404);
      }
      if (targetBed.status !== 'AVAILABLE') {
        throw new AppError(`Target bed '${targetBed.bed_code}' is currently ${targetBed.status}.`, 400);
      }
    } else if (params.targetRoomNumber) {
      targetBed = await queryOne<any>(
        `SELECT b.*, r.room_number, h.name as hostel_name
         FROM beds b
         JOIN rooms r ON r.id = b.room_id
         LEFT JOIN hostels h ON h.id = b.hostel_id
         WHERE b.organization_id = $1 AND r.room_number = $2 AND b.status = 'AVAILABLE'
         ORDER BY b.bed_number ASC
         LIMIT 1`,
        [ctx.organizationId, params.targetRoomNumber.trim()]
      );
      if (!targetBed) {
        throw new AppError(
          `No available beds found in Room '${params.targetRoomNumber}'. Please choose another room.`,
          400
        );
      }
    } else {
      // Find any available bed in the same branch
      targetBed = await queryOne<any>(
        `SELECT b.*, r.room_number, h.name as hostel_name
         FROM beds b
         JOIN rooms r ON r.id = b.room_id
         LEFT JOIN hostels h ON h.id = b.hostel_id
         WHERE b.organization_id = $1 AND b.status = 'AVAILABLE'
         ORDER BY r.room_number ASC, b.bed_number ASC
         LIMIT 1`,
        [ctx.organizationId]
      );
      if (!targetBed) {
        throw new AppError('No vacant beds are currently available in the hostel for transfer.', 400);
      }
    }

    const currentRoom = student.room_number || 'Unassigned';
    const currentBed = student.bed_code || 'Unassigned';
    const toRoom = targetBed.room_number;
    const toBed = targetBed.bed_code;

    const payload = {
      studentId: student.id,
      studentName: student.full_name,
      customerCode: student.customer_code,
      fromBranchId: student.hostel_id,
      fromRoom: currentRoom,
      fromBed: currentBed,
      targetBranchId: targetBed.hostel_id,
      targetBedId: targetBed.id,
      toRoom,
      toBed,
      reason: params.reason || 'Room transfer requested via Owner AI Assistant',
    };

    const description = `${student.full_name} (${student.customer_code}) is currently in Room ${currentRoom} (Bed ${currentBed}).\nDestination Room ${toRoom} (Bed ${toBed}) is available.\n\nDo you want to confirm this room transfer?`;

    return this.createConfirmationToken(
      ctx.organizationId,
      ctx.userId,
      'ROOM_TRANSFER',
      payload,
      description
    );
  }

  async executeRoomTransfer(ctx: AuthenticatedOwnerContext, token: string) {
    const { actionType, payload } = await this.validateAndConsumeToken(token, ctx.organizationId, ctx.userId);
    if (actionType !== 'ROOM_TRANSFER') {
      throw new AppError(`Invalid action type '${actionType}' for room transfer execution.`, 400);
    }

    const result = await studentService.transferStudent(ctx.organizationId, payload.studentId, {
      targetBranchId: payload.targetBranchId,
      targetBedId: payload.targetBedId,
      reason: payload.reason,
      approvedBy: ctx.name || 'Owner AI Assistant',
    });

    return {
      success: true,
      action: 'ROOM_TRANSFER',
      message: `Successfully transferred ${payload.studentName} from Room ${payload.fromRoom} (Bed ${payload.fromBed}) to Room ${payload.toRoom} (Bed ${payload.toBed}).`,
      details: result,
    };
  }

  async prepareCreateAnnouncement(
    ctx: AuthenticatedOwnerContext,
    params: {
      title: string;
      message: string;
      priority?: 'NORMAL' | 'IMPORTANT' | 'URGENT';
      targetType?: 'ALL' | 'BRANCH';
      branchId?: string;
    }
  ): Promise<ActionConfirmationProposal> {
    const title = String(params.title || '').trim();
    const message = String(params.message || '').trim();

    if (!title || !message) {
      throw new AppError('Announcement title and message are required.', 400);
    }

    const payload = {
      title,
      message,
      priority: params.priority || 'NORMAL',
      targetType: params.targetType || 'ALL',
      branchId: params.branchId || ctx.hostelId || null,
    };

    const description = `Create ${payload.priority} Announcement: "${payload.title}" for ${payload.targetType === 'ALL' ? 'all hostel students' : 'selected branch'}.\n\nMessage preview:\n"${payload.message}"\n\nDo you want to broadcast this announcement?`;

    return this.createConfirmationToken(
      ctx.organizationId,
      ctx.userId,
      'CREATE_ANNOUNCEMENT',
      payload,
      description
    );
  }

  async executeCreateAnnouncement(ctx: AuthenticatedOwnerContext, token: string) {
    const { actionType, payload } = await this.validateAndConsumeToken(token, ctx.organizationId, ctx.userId);
    if (actionType !== 'CREATE_ANNOUNCEMENT') {
      throw new AppError(`Invalid action type '${actionType}' for announcement execution.`, 400);
    }

    const announcement = await announcementService.create(
      payload,
      { organizationId: ctx.organizationId, id: ctx.userId, name: ctx.name }
    );

    return {
      success: true,
      action: 'CREATE_ANNOUNCEMENT',
      message: `Announcement "${payload.title}" has been published and broadcasted to students.`,
      announcement,
    };
  }

  async prepareUpdateComplaintStatus(
    ctx: AuthenticatedOwnerContext,
    params: {
      complaintNumber: string;
      newStatus: 'IN_PROGRESS' | 'RESOLVED';
      notes?: string;
    }
  ): Promise<ActionConfirmationProposal> {
    const cNum = String(params.complaintNumber || '').trim();
    if (!cNum) throw new AppError('Complaint number is required.', 400);

    const complaint = await queryOne<any>(
      'SELECT * FROM complaints WHERE (complaint_number = $1 OR id = $1) AND organization_id = $2',
      [cNum, ctx.organizationId]
    );
    if (!complaint) throw new AppError(`Complaint #${cNum} not found.`, 404);

    const payload = {
      complaintId: complaint.id,
      complaintNumber: complaint.complaint_number,
      studentName: complaint.student_name,
      title: complaint.title,
      currentStatus: complaint.status,
      newStatus: params.newStatus,
      notes: params.notes || 'Status updated via Owner AI Assistant',
    };

    const description = `Update Complaint #${complaint.complaint_number} ("${complaint.title}") from ${complaint.status} to ${params.newStatus}.\n\nDo you want to confirm this status update?`;

    return this.createConfirmationToken(
      ctx.organizationId,
      ctx.userId,
      'UPDATE_COMPLAINT_STATUS',
      payload,
      description
    );
  }

  async executeUpdateComplaintStatus(ctx: AuthenticatedOwnerContext, token: string) {
    const { actionType, payload } = await this.validateAndConsumeToken(token, ctx.organizationId, ctx.userId);
    if (actionType !== 'UPDATE_COMPLAINT_STATUS') {
      throw new AppError(`Invalid action type '${actionType}' for complaint execution.`, 400);
    }

    if (payload.newStatus === 'RESOLVED') {
      await complaintService.resolveComplaint(ctx.organizationId, payload.complaintId, {
        resolutionNotes: payload.notes,
      });
    } else {
      await query(
        "UPDATE complaints SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND organization_id = $3",
        [payload.newStatus, payload.complaintId, ctx.organizationId]
      );
    }

    return {
      success: true,
      action: 'UPDATE_COMPLAINT_STATUS',
      message: `Complaint #${payload.complaintNumber} has been updated to ${payload.newStatus}.`,
    };
  }
}

export const aiAssistantToolsRegistry = new AiAssistantToolsRegistry();
