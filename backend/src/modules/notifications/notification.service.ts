import crypto from 'crypto';
import { query, queryOne, queryRows } from '../../config/database';
import { emitRealTimeEvent } from '../../events/events.gateway';
import { AppError } from '../../common/filters/http-exception.filter';

export interface CreateNotificationDto {
  organizationId?: string;
  branchId?: string;
  userId: string;
  role?: string;
  title: string;
  message: string;
  type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  link?: string;
  entityType?: string;
  entityId?: string;
}

export class NotificationService {
  /**
   * Core method to insert a notification and emit real-time event
   */
  async createNotification(dto: CreateNotificationDto) {
    const id = crypto.randomUUID();
    const type = dto.type || 'INFO';
    const role = dto.role || 'STUDENT';

    await query(
      `INSERT INTO notifications (
        id, organization_id, branch_id, user_id, role, title, message, type,
        read, is_read, link, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, FALSE, $9, CURRENT_TIMESTAMP)`,
      [
        id,
        dto.organizationId || null,
        dto.branchId || null,
        dto.userId,
        role,
        dto.title,
        dto.message,
        type,
        dto.link || null,
      ]
    );

    const notification = {
      id,
      organizationId: dto.organizationId,
      branchId: dto.branchId,
      userId: dto.userId,
      role,
      title: dto.title,
      message: dto.message,
      type,
      read: false,
      isRead: false,
      link: dto.link,
      createdAt: new Date().toISOString(),
    };

    // Emit real-time notification event via Socket.IO
    try {
      emitRealTimeEvent('notification.created', notification, {
        orgId: dto.organizationId,
        branchId: dto.branchId,
        userId: dto.userId,
        role,
      });
    } catch {
      // Socket emission failure should not block HTTP response
    }

    return notification;
  }

  /**
   * Helper to send notification to a specific student
   */
  async notifyStudent(
    studentIdOrDbId: string,
    data: {
      organizationId?: string;
      branchId?: string;
      title: string;
      message: string;
      type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
      link?: string;
      entityType?: string;
      entityId?: string;
    }
  ) {
    if (!studentIdOrDbId) return null;

    // Look up student record to find student id / customer code / user id
    const student = await queryOne<any>(
      `SELECT id, user_id, organization_id, hostel_id, branch_id, customer_code, email
       FROM students
       WHERE id = $1 OR user_id = $1 OR customer_code = $1 OR student_id = $1 OR ihms_id = $1
       LIMIT 1`,
      [studentIdOrDbId]
    );

    const targetUserId = student?.id || student?.user_id || studentIdOrDbId;
    const orgId = data.organizationId || student?.organization_id;
    const branchId = data.branchId || student?.hostel_id || student?.branch_id;

    return await this.createNotification({
      organizationId: orgId,
      branchId,
      userId: targetUserId,
      role: 'STUDENT',
      title: data.title,
      message: data.message,
      type: data.type || 'INFO',
      link: data.link,
      entityType: data.entityType,
      entityId: data.entityId,
    });
  }

  /**
   * Helper to send notification to organization owner(s) and management
   */
  async notifyOwner(
    organizationId: string,
    data: {
      branchId?: string;
      title: string;
      message: string;
      type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
      link?: string;
      entityType?: string;
      entityId?: string;
    }
  ) {
    if (!organizationId) return null;

    // Query active owner users of this organization
    const owners = await queryRows<any>(
      `SELECT id, user_id FROM users
       WHERE organization_id = $1
         AND role IN ('OWNER', 'ORGANIZATION_OWNER', 'SUPER_ADMIN', 'PLATFORM_SUPER_ADMIN')
         AND status = 'ACTIVE'`,
      [organizationId]
    );

    const createdNotifications = [];
    if (owners.length > 0) {
      for (const owner of owners) {
        const notif = await this.createNotification({
          organizationId,
          branchId: data.branchId,
          userId: owner.id,
          role: 'OWNER',
          title: data.title,
          message: data.message,
          type: data.type || 'INFO',
          link: data.link,
          entityType: data.entityType,
          entityId: data.entityId,
        });
        createdNotifications.push(notif);
      }
    } else {
      // Fallback broadcast
      const notif = await this.createNotification({
        organizationId,
        branchId: data.branchId,
        userId: 'OWNER',
        role: 'OWNER',
        title: data.title,
        message: data.message,
        type: data.type || 'INFO',
        link: data.link,
        entityType: data.entityType,
        entityId: data.entityId,
      });
      createdNotifications.push(notif);
    }

    return createdNotifications;
  }

  /**
   * Get user targets for query isolation
   */
  private async getUserTargetIds(user: any): Promise<string[]> {
    const targets = [user.id];
    if (user.userId && user.userId !== user.id) targets.push(user.userId);
    if (user.studentId) targets.push(user.studentId);
    if (user.customerCode) targets.push(user.customerCode);

    if (user.role === 'STUDENT' || user.studentId) {
      try {
        const student = await queryOne<any>(
          `SELECT id, user_id, customer_code, student_id, ihms_id
           FROM students
           WHERE id = ANY($1::text[]) OR user_id = ANY($1::text[]) OR customer_code = ANY($1::text[])
           LIMIT 1`,
          [targets]
        );
        if (student) {
          if (student.id) targets.push(student.id);
          if (student.user_id) targets.push(student.user_id);
          if (student.customer_code) targets.push(student.customer_code);
          if (student.student_id) targets.push(student.student_id);
          if (student.ihms_id) targets.push(student.ihms_id);
        }
      } catch {
        /* ignore */
      }
    }

    return Array.from(new Set(targets.filter(Boolean)));
  }

  private isOwnerRole(role?: string): boolean {
    if (!role) return false;
    return [
      'OWNER',
      'ORGANIZATION_OWNER',
      'SUPER_ADMIN',
      'PLATFORM_SUPER_ADMIN',
      'BRANCH_MANAGER',
      'ADMIN',
    ].includes(role);
  }

  /**
   * Retrieve paginated notifications with strict user and role isolation
   */
  async getNotifications(
    user: any,
    options: { page?: number; pageSize?: number; unreadOnly?: boolean; type?: string }
  ) {
    const page = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 50));
    const offset = (page - 1) * pageSize;
    const targetIds = await this.getUserTargetIds(user);
    const isOwner = this.isOwnerRole(user.role);

    let whereClause = `
      WHERE (organization_id = $1 OR organization_id IS NULL)
        AND (
          user_id = ANY($2::text[])
          OR ($3 = TRUE AND (user_id = 'OWNER' OR role = 'OWNER' OR user_id = ANY($2::text[])))
          OR user_id = 'ALL'
        )
    `;
    const params: any[] = [user.organizationId, targetIds, isOwner];

    if (options.unreadOnly) {
      whereClause += ` AND (read = FALSE AND is_read = FALSE)`;
    }

    if (options.type) {
      params.push(options.type);
      whereClause += ` AND type = $${params.length}`;
    }

    const items = await queryRows<any>(
      `SELECT id, title, message, type, read, is_read as "isRead", link as "actionUrl", created_at as "createdAt"
       FROM notifications
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    const countRow = await queryOne<any>(
      `SELECT COUNT(*)::int as count FROM notifications ${whereClause}`,
      params
    );

    const total = Number(countRow?.count || 0);

    return {
      items: items.map((r) => ({
        ...r,
        read: Boolean(r.read || r.isRead),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Get accurate unread count for user
   */
  async getUnreadCount(user: any): Promise<number> {
    const targetIds = await this.getUserTargetIds(user);
    const isOwner = this.isOwnerRole(user.role);

    const countRow = await queryOne<any>(
      `SELECT COUNT(*)::int as count FROM notifications
       WHERE (organization_id = $1 OR organization_id IS NULL)
         AND (
           user_id = ANY($2::text[])
           OR ($3 = TRUE AND (user_id = 'OWNER' OR role = 'OWNER' OR user_id = ANY($2::text[])))
           OR user_id = 'ALL'
         )
         AND (read = FALSE AND is_read = FALSE)`,
      [user.organizationId, targetIds, isOwner]
    );

    return Number(countRow?.count || 0);
  }

  /**
   * Mark a single notification as read (with strict ownership check)
   */
  async markAsRead(user: any, notificationId: string) {
    const targetIds = await this.getUserTargetIds(user);
    const isOwner = this.isOwnerRole(user.role);

    // Verify ownership
    const existing = await queryOne<any>(
      `SELECT id, user_id, organization_id, role FROM notifications WHERE id = $1`,
      [notificationId]
    );

    if (!existing) {
      throw new AppError('Notification not found.', 404);
    }

    // Security check: Must belong to user's organization if set
    if (existing.organization_id && existing.organization_id !== user.organizationId) {
      throw new AppError('You do not have permission to modify this notification.', 403);
    }

    // Security check: Must belong to user's targets, or be an org-level owner broadcast
    const isOwnerTarget =
      isOwner && (existing.user_id === 'OWNER' || existing.role === 'OWNER' || targetIds.includes(existing.user_id));

    const isDirectTarget = targetIds.includes(existing.user_id) || existing.user_id === 'ALL';

    if (!isOwnerTarget && !isDirectTarget) {
      throw new AppError('You do not have permission to modify this notification.', 403);
    }

    await query(
      `UPDATE notifications
       SET read = TRUE, is_read = TRUE
       WHERE id = $1`,
      [notificationId]
    );

    return { id: notificationId, read: true, isRead: true };
  }

  /**
   * Mark all notifications belonging to user as read
   */
  async markAllAsRead(user: any) {
    const targetIds = await this.getUserTargetIds(user);
    const isOwner = this.isOwnerRole(user.role);

    await query(
      `UPDATE notifications
       SET read = TRUE, is_read = TRUE
       WHERE (organization_id = $1 OR organization_id IS NULL)
         AND (
           user_id = ANY($2::text[])
           OR ($3 = TRUE AND (user_id = 'OWNER' OR role = 'OWNER' OR user_id = ANY($2::text[])))
           OR user_id = 'ALL'
         )
         AND (read = FALSE OR is_read = FALSE)`,
      [user.organizationId, targetIds, isOwner]
    );

    return { success: true, message: 'All notifications marked as read.' };
  }
}

export const notificationService = new NotificationService();
