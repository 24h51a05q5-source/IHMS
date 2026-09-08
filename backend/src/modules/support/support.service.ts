import { query, queryOne, queryRows } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { generateTicketNumber } from '../../common/utils/code-generator';
import { emailService } from '../../common/utils/email.service';
import { emitRealTimeEvent } from '../../events/events.gateway';

export interface CreateSupportTicketInput {
  userName?: string;
  userRole?: string;
  hostelName?: string;
  email?: string;
  subject: string;
  category: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  description: string;
  screenshotUrl?: string;
}

export interface UpdateSupportTicketStatusInput {
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  resolutionNotes?: string;
  resolvedBy?: string;
}

export class SupportService {
  async createTicket(
    currentUser: { id?: string; userId?: string; organizationId?: string; role?: string; email?: string; name?: string; hostelName?: string } | undefined,
    data: CreateSupportTicketInput
  ) {
    if (!data.subject || !data.subject.trim()) {
      throw new AppError('Subject / Problem Title is required', 400);
    }
    if (!data.category || !data.category.trim()) {
      throw new AppError('Problem Category is required', 400);
    }
    if (!data.description || !data.description.trim()) {
      throw new AppError('Detailed Description is required', 400);
    }

    const orgId = currentUser?.organizationId || 'GLOBAL';
    const ticketNumber = await generateTicketNumber(orgId);
    const ticketId = require('crypto').randomUUID();

    const userName = data.userName?.trim() || currentUser?.name || 'Authorized User';
    const userRole = data.userRole?.trim() || currentUser?.role || 'STUDENT';
    const email = data.email?.trim() || currentUser?.email || 'support@hostel.local';
    const hostelName = data.hostelName?.trim() || currentUser?.hostelName || '';
    const userId = currentUser?.id || currentUser?.userId || null;
    const priority = data.priority || 'MEDIUM';

    // 1. Insert ticket first so the request is safely recorded and NEVER lost
    const ticket = await queryOne<any>(
      `INSERT INTO support_tickets (
        id, ticket_number, organization_id, user_id, user_name, user_role,
        hostel_name, email, subject, category, priority, description, screenshot_url, status, email_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'OPEN', 'PENDING')
      RETURNING
        id,
        id as "_id",
        ticket_number as "ticketNumber",
        ticket_number as "ticketId",
        organization_id as "organizationId",
        user_id as "userId",
        user_name as "userName",
        user_role as "userRole",
        hostel_name as "hostelName",
        email,
        subject,
        category,
        priority,
        description,
        screenshot_url as "screenshotUrl",
        status,
        email_status as "emailStatus",
        resolution_notes as "resolutionNotes",
        resolved_by as "resolvedBy",
        resolved_at as "resolvedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        ticketId,
        ticketNumber,
        orgId,
        userId,
        userName,
        userRole,
        hostelName,
        email,
        data.subject.trim(),
        data.category.trim(),
        priority,
        data.description.trim(),
        data.screenshotUrl || null,
      ]
    );

    // 2. Dispatch email to ihmserp00@gmail.com with Reply-To set to user's email
    try {
      await emailService.sendSupportEmail({
        ticketNumber: ticket.ticketNumber,
        userName: ticket.userName,
        userRole: ticket.userRole,
        hostelName: ticket.hostelName,
        userEmail: ticket.email,
        category: ticket.category,
        priority: ticket.priority,
        subject: ticket.subject,
        description: ticket.description,
        screenshotUrl: ticket.screenshotUrl,
        submittedAt: new Date(ticket.createdAt || Date.now()),
      });

      await query(
        `UPDATE support_tickets SET email_status = 'SENT', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [ticket.id]
      );
      ticket.emailStatus = 'SENT';
    } catch (err: any) {
      console.error(`[SUPPORT] ❌ Failed to dispatch support email for #${ticket.ticketNumber}:`, err?.message);
      await query(
        `UPDATE support_tickets SET email_status = 'FAILED', resolution_notes = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [ticket.id, `Email dispatch error: ${err?.message || 'Delivery failure'}`]
      );
      ticket.emailStatus = 'FAILED';
      throw new AppError('Your support request could not be sent. Please try again.', 500);
    }

    // Broadcast real-time support event to admins/organization
    try {
      emitRealTimeEvent('support.ticket_created', {
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        category: ticket.category,
        userRole: ticket.userRole,
        userName: ticket.userName,
        status: ticket.status,
      }, { orgId });
    } catch {
      // Non-blocking socket emission
    }

    return ticket;
  }

  async getUserTickets(userId?: string, userEmail?: string, orgId?: string) {
    let sql = `
      SELECT
        id,
        id as "_id",
        ticket_number as "ticketNumber",
        ticket_number as "ticketId",
        organization_id as "organizationId",
        user_id as "userId",
        user_name as "userName",
        user_role as "userRole",
        hostel_name as "hostelName",
        email,
        subject,
        category,
        priority,
        description,
        screenshot_url as "screenshotUrl",
        status,
        email_status as "emailStatus",
        resolution_notes as "resolutionNotes",
        resolved_by as "resolvedBy",
        resolved_at as "resolvedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM support_tickets
      WHERE 1=1
    `;

    const params: any[] = [];
    if (userId && userEmail) {
      params.push(userId, userEmail);
      sql += ` AND (user_id = $1 OR LOWER(email) = LOWER($2))`;
    } else if (userId) {
      params.push(userId);
      sql += ` AND user_id = $1`;
    } else if (userEmail) {
      params.push(userEmail);
      sql += ` AND LOWER(email) = LOWER($1)`;
    }

    if (orgId && orgId !== 'GLOBAL') {
      params.push(orgId);
      sql += ` AND (organization_id = $${params.length} OR organization_id = 'GLOBAL')`;
    }

    sql += ` ORDER BY created_at DESC`;

    return queryRows(sql, params);
  }

  async getAllTickets(orgId?: string, isSuperAdmin = false, filters?: { status?: string; category?: string; search?: string }) {
    let sql = `
      SELECT
        id,
        id as "_id",
        ticket_number as "ticketNumber",
        ticket_number as "ticketId",
        organization_id as "organizationId",
        user_id as "userId",
        user_name as "userName",
        user_role as "userRole",
        hostel_name as "hostelName",
        email,
        subject,
        category,
        priority,
        description,
        screenshot_url as "screenshotUrl",
        status,
        email_status as "emailStatus",
        resolution_notes as "resolutionNotes",
        resolved_by as "resolvedBy",
        resolved_at as "resolvedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM support_tickets
      WHERE 1=1
    `;

    const params: any[] = [];

    if (!isSuperAdmin && orgId && orgId !== 'GLOBAL') {
      params.push(orgId);
      sql += ` AND (organization_id = $${params.length} OR organization_id = 'GLOBAL')`;
    }

    if (filters?.status && filters.status !== 'ALL') {
      params.push(filters.status);
      sql += ` AND status = $${params.length}`;
    }

    if (filters?.category && filters.category !== 'ALL') {
      params.push(filters.category);
      sql += ` AND category = $${params.length}`;
    }

    if (filters?.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      const p = `$${params.length}`;
      sql += ` AND (
        ticket_number ILIKE ${p} OR
        subject ILIKE ${p} OR
        user_name ILIKE ${p} OR
        email ILIKE ${p} OR
        hostel_name ILIKE ${p} OR
        description ILIKE ${p}
      )`;
    }

    sql += ` ORDER BY created_at DESC`;

    return queryRows(sql, params);
  }

  async getTicketById(ticketIdOrNumber: string, orgId?: string, userId?: string, isStaffOrAdmin = false) {
    const ticket = await queryOne<any>(
      `SELECT
        id,
        id as "_id",
        ticket_number as "ticketNumber",
        ticket_number as "ticketId",
        organization_id as "organizationId",
        user_id as "userId",
        user_name as "userName",
        user_role as "userRole",
        hostel_name as "hostelName",
        email,
        subject,
        category,
        priority,
        description,
        screenshot_url as "screenshotUrl",
        status,
        email_status as "emailStatus",
        resolution_notes as "resolutionNotes",
        resolved_by as "resolvedBy",
        resolved_at as "resolvedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM support_tickets
      WHERE (id = $1 OR ticket_number = $1)`,
      [ticketIdOrNumber]
    );

    if (!ticket) {
      throw new AppError('Support ticket not found', 404);
    }

    if (!isStaffOrAdmin && userId && ticket.userId && ticket.userId !== userId) {
      throw new AppError('Access denied to this ticket', 403);
    }

    return ticket;
  }

  async updateTicketStatus(
    ticketIdOrNumber: string,
    orgId: string | undefined,
    data: UpdateSupportTicketStatusInput,
    adminName: string = 'Support Team'
  ) {
    const validStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
    if (!validStatuses.includes(data.status)) {
      throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const isResolvedOrClosed = data.status === 'RESOLVED' || data.status === 'CLOSED';

    const ticket = await queryOne<any>(
      `UPDATE support_tickets
       SET
         status = $1,
         resolution_notes = COALESCE($2, resolution_notes),
         resolved_by = CASE WHEN $3 THEN $4 ELSE resolved_by END,
         resolved_at = CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE resolved_at END,
         updated_at = CURRENT_TIMESTAMP
       WHERE (id = $5 OR ticket_number = $5)
       RETURNING
         id,
         id as "_id",
         ticket_number as "ticketNumber",
         ticket_number as "ticketId",
         organization_id as "organizationId",
         user_id as "userId",
         user_name as "userName",
         user_role as "userRole",
         hostel_name as "hostelName",
         email,
         subject,
         category,
         description,
         screenshot_url as "screenshotUrl",
         status,
         resolution_notes as "resolutionNotes",
         resolved_by as "resolvedBy",
         resolved_at as "resolvedAt",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [
        data.status,
        data.resolutionNotes || null,
        isResolvedOrClosed,
        adminName,
        ticketIdOrNumber,
      ]
    );

    if (!ticket) {
      throw new AppError('Support ticket not found', 404);
    }

    try {
      emitRealTimeEvent('support.ticket_updated', {
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        resolutionNotes: ticket.resolutionNotes,
        resolvedBy: ticket.resolvedBy,
      }, { orgId: ticket.organizationId });
    } catch {
      // Non-blocking socket emission
    }

    return ticket;
  }
}

export const supportService = new SupportService();
