import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { query, queryOne, queryRows } from '../../config/database';
import { emitRealTimeEvent } from '../../events/events.gateway';
import { AppError } from '../../common/filters/http-exception.filter';

export type AnnouncementPriority = 'NORMAL' | 'IMPORTANT' | 'URGENT';
export type AnnouncementTargetType = 'ALL' | 'BRANCH' | 'ROOM' | 'STUDENT';

export function validateAndSaveImage(imageData: string, originalName?: string): string {
  if (!imageData || typeof imageData !== 'string') {
    throw new AppError('Invalid image data provided.', 400);
  }

  // If already an uploaded URL, return as-is
  if (imageData.startsWith('/uploads/') || imageData.startsWith('http://') || imageData.startsWith('https://')) {
    return imageData;
  }

  let mimeType = '';
  let base64Data = imageData;

  // Check if data URI scheme: data:image/png;base64,...
  const match = imageData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (match) {
    mimeType = match[1].toLowerCase();
    base64Data = match[2];
  }

  const buffer = Buffer.from(base64Data, 'base64');

  // Check max file size (5MB)
  const MAX_SIZE_BYTES = 5 * 1024 * 1024;
  if (buffer.length > MAX_SIZE_BYTES) {
    throw new AppError('Image size exceeds 5MB limit. Please upload a smaller image.', 400);
  }

  if (buffer.length === 0) {
    throw new AppError('Uploaded image file is empty.', 400);
  }

  // Validate magic bytes
  let detectedExt = '';
  // JPEG: 0xFF, 0xD8, 0xFF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    detectedExt = 'jpg';
  }
  // PNG: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
  else if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    detectedExt = 'png';
  }
  // WEBP: starts with RIFF and contains WEBP at byte 8
  else if (
    buffer.length >= 12 &&
    buffer.toString('utf8', 0, 4) === 'RIFF' &&
    buffer.toString('utf8', 8, 12) === 'WEBP'
  ) {
    detectedExt = 'webp';
  }

  if (!detectedExt) {
    throw new AppError('Only JPG, JPEG, PNG, and WEBP image files are allowed.', 400);
  }

  // Validate declared MIME matches detected format if present
  if (mimeType) {
    const validMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validMimes.includes(mimeType)) {
      throw new AppError('Only JPG, JPEG, PNG, and WEBP image files are allowed.', 400);
    }
  }

  const uploadsDir = path.join(process.cwd(), 'uploads', 'announcements');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const uniqueFilename = `announcement_${crypto.randomUUID()}_${Date.now()}.${detectedExt}`;
  const filePath = path.join(uploadsDir, uniqueFilename);

  fs.writeFileSync(filePath, buffer);

  return `/uploads/announcements/${uniqueFilename}`;
}

export function safeDeleteUploadedImage(fileUrl?: string | null) {
  if (!fileUrl || typeof fileUrl !== 'string') return;
  try {
    if (fileUrl.startsWith('/uploads/announcements/')) {
      const fileName = path.basename(fileUrl);
      const filePath = path.join(process.cwd(), 'uploads', 'announcements', fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (err) {
    console.warn('[AnnouncementService] Note on removing old attachment image:', err);
  }
}

export interface CreateAnnouncementDto {
  title: string;
  message?: string;
  priority?: AnnouncementPriority;
  targetType: AnnouncementTargetType;
  targetId?: string;
  targetLabel?: string;
  branchId?: string;
  expiresAt?: string | Date;
  imageUrl?: string;
  attachmentUrl?: string;
  announcementImage?: string;
  image?: string;
}

export interface UpdateAnnouncementDto {
  title?: string;
  message?: string;
  priority?: AnnouncementPriority;
  targetType?: AnnouncementTargetType;
  targetId?: string;
  targetLabel?: string;
  branchId?: string;
  expiresAt?: string | Date;
  status?: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  imageUrl?: string | null;
  attachmentUrl?: string | null;
  announcementImage?: string | null;
  image?: string | null;
}

export class AnnouncementService {
  async create(dto: CreateAnnouncementDto, user: { id: string; name?: string; organizationId: string }): Promise<any> {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    let targetLabel = dto.targetLabel || 'All Students';

    if (dto.targetType === 'ALL') {
      targetLabel = 'All Students';
    } else if (dto.targetType === 'BRANCH' && !dto.targetLabel && dto.targetId) {
      targetLabel = 'Specific Branch';
    } else if (dto.targetType === 'ROOM' && !dto.targetLabel && dto.targetId) {
      targetLabel = `Room ${dto.targetId}`;
    } else if (dto.targetType === 'STUDENT' && !dto.targetLabel && dto.targetId) {
      const student = await queryOne<any>('SELECT full_name FROM students WHERE id = $1', [dto.targetId]);
      targetLabel = student ? student.full_name : 'Specific Student';
    }

    let savedImageUrl: string | null = null;
    const rawImage = dto.imageUrl || dto.attachmentUrl || dto.announcementImage || dto.image;
    if (rawImage && typeof rawImage === 'string' && rawImage.trim()) {
      savedImageUrl = validateAndSaveImage(rawImage.trim());
    }

    const title = (dto.title || '').trim();
    if (!title) {
      throw new AppError('Announcement title is required.', 400);
    }
    let message = (dto.message || '').trim();
    if (!message && !savedImageUrl) {
      throw new AppError('Please provide announcement text or attach an image.', 400);
    }
    if (!message && savedImageUrl) {
      message = '[Photo Announcement]';
    }

    const annId = crypto.randomUUID();
    const announcement = await queryOne<any>(
      `INSERT INTO announcements (
        id, organization_id, branch_id, title, message, priority, target_type,
        target_id, target_label, image_url, attachment_url, announcement_image,
        created_by, created_by_name, expires_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $10, $11, $12, $13, 'ACTIVE')
      RETURNING *`,
      [
        annId,
        user.organizationId,
        dto.branchId || null,
        title,
        message,
        dto.priority || 'NORMAL',
        dto.targetType || 'ALL',
        dto.targetId || null,
        targetLabel,
        savedImageUrl,
        user.id,
        user.name || 'Hostel Administration',
        expiresAt
      ]
    );

    // Notify targeted students
    await this.notifyTargetedStudents(announcement);

    emitRealTimeEvent('announcement.created', {
      id: announcement.id,
      title: announcement.title,
      priority: announcement.priority,
      targetType: announcement.target_type,
      targetLabel: announcement.target_label,
      imageUrl: savedImageUrl,
      createdAt: announcement.created_at,
    }, { orgId: user.organizationId });

    return this.formatAnnouncement(announcement);
  }

  private async notifyTargetedStudents(announcement: any): Promise<void> {
    try {
      let sql = 'SELECT id, user_id, full_name FROM students WHERE organization_id = $1';
      const params: any[] = [announcement.organization_id];

      if (announcement.target_type === 'BRANCH' && announcement.target_id) {
        params.push(announcement.target_id);
        sql += ` AND hostel_id = $${params.length}`;
      } else if (announcement.target_type === 'ROOM' && announcement.target_id) {
        params.push(announcement.target_id);
        sql += ` AND room_id = $${params.length}`;
      } else if (announcement.target_type === 'STUDENT' && announcement.target_id) {
        params.push(announcement.target_id);
        sql += ` AND (id = $${params.length} OR user_id = $${params.length} OR customer_code = $${params.length})`;
      }

      sql += ' LIMIT 500';
      const targetedStudents = await queryRows<any>(sql, params);

      const notifType =
        announcement.priority === 'URGENT' ? 'ALERT' :
        announcement.priority === 'IMPORTANT' ? 'WARNING' : 'INFO';

      for (const st of targetedStudents) {
        const notifId = require('crypto').randomUUID();
        const shortMsg = announcement.message.length > 120 ? `${announcement.message.slice(0, 117)}...` : announcement.message;
        await query(
          `INSERT INTO notifications (id, organization_id, branch_id, user_id, role, title, message, type, is_read)
           VALUES ($1, $2, $3, $4, 'STUDENT', $5, $6, $7, false)`,
          [notifId, announcement.organization_id, announcement.branch_id, st.user_id || st.id, `📢 ${announcement.title}`, shortMsg, notifType]
        );
      }
    } catch (err) {
      console.error('[AnnouncementService] Failed to create notifications for announcement:', err);
    }
  }

  async list(
    organizationId: string,
    queryObj: { branchId?: string; search?: string; page?: number; pageSize?: number; status?: string }
  ) {
    const page = Math.max(1, Number(queryObj.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(queryObj.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    let whereClause = 'a.organization_id = $1';
    const params: any[] = [organizationId];

    if (queryObj.branchId && queryObj.branchId !== 'ALL') {
      params.push(queryObj.branchId);
      whereClause += ` AND (a.branch_id = $${params.length} OR a.branch_id IS NULL OR a.target_type = 'ALL')`;
    }
    if (queryObj.status && queryObj.status !== 'ALL') {
      params.push(queryObj.status);
      whereClause += ` AND a.status = $${params.length}`;
    }
    if (queryObj.search && queryObj.search.trim()) {
      const q = `%${queryObj.search.trim()}%`;
      params.push(q);
      whereClause += ` AND (a.title ILIKE $${params.length} OR a.message ILIKE $${params.length} OR a.target_label ILIKE $${params.length})`;
    }

    const countSql = `SELECT COUNT(*)::int as total FROM announcements a WHERE ${whereClause}`;
    const totalRow = await queryOne<any>(countSql, params);
    const total = totalRow?.total || 0;

    const dataSql = `
      SELECT a.*, COALESCE(r.read_count, 0)::int as read_count
      FROM announcements a
      LEFT JOIN (
        SELECT announcement_id, COUNT(*)::int as read_count
        FROM announcement_reads
        GROUP BY announcement_id
      ) r ON r.announcement_id = a.id
      WHERE ${whereClause}
      ORDER BY a.created_at DESC LIMIT ${pageSize} OFFSET ${offset}
    `;
    const rows = await queryRows<any>(dataSql, params);

    const now = new Date();
    const formatted = rows.map((doc) => {
      let status = doc.status;
      if (doc.expires_at && new Date(doc.expires_at) < now && status === 'ACTIVE') {
        status = 'EXPIRED';
      }
      return {
        ...this.formatAnnouncement(doc),
        status,
        readCount: Number(doc.read_count || 0),
      };
    });

    return {
      items: formatted,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async getById(id: string, organizationId: string) {
    const item = await queryOne<any>(
      'SELECT * FROM announcements WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    if (!item) return null;
    return this.formatAnnouncement(item);
  }

  async update(id: string, dto: UpdateAnnouncementDto, organizationId: string) {
    const existing = await queryOne<any>('SELECT * FROM announcements WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    if (!existing) return null;

    const title = dto.title !== undefined ? dto.title.trim() : existing.title;
    const message = dto.message !== undefined ? dto.message.trim() : existing.message;
    const priority = dto.priority !== undefined ? dto.priority : existing.priority;
    const targetType = dto.targetType !== undefined ? dto.targetType : existing.target_type;
    const targetId = dto.targetId !== undefined ? dto.targetId : existing.target_id;
    const targetLabel = dto.targetLabel !== undefined ? dto.targetLabel : existing.target_label;
    const status = dto.status !== undefined ? dto.status : existing.status;
    const expiresAt = dto.expiresAt !== undefined ? (dto.expiresAt ? new Date(dto.expiresAt) : null) : existing.expires_at;

    let savedImageUrl = existing.image_url || existing.attachment_url || existing.announcement_image || null;
    const rawImage = dto.imageUrl !== undefined ? dto.imageUrl : (dto.attachmentUrl !== undefined ? dto.attachmentUrl : (dto.announcementImage !== undefined ? dto.announcementImage : dto.image));

    if (rawImage !== undefined) {
      if (rawImage === null || rawImage === '') {
        safeDeleteUploadedImage(existing.image_url);
        savedImageUrl = null;
      } else if (rawImage.startsWith('data:image/') || rawImage.startsWith('data:application/')) {
        savedImageUrl = validateAndSaveImage(rawImage.trim());
        if (existing.image_url && existing.image_url !== savedImageUrl) {
          safeDeleteUploadedImage(existing.image_url);
        }
      } else {
        savedImageUrl = rawImage;
      }
    }

    const updated = await queryOne<any>(
      `UPDATE announcements
       SET title = $1, message = $2, priority = $3, target_type = $4,
           target_id = $5, target_label = $6, status = $7, expires_at = $8,
           image_url = $9, attachment_url = $9, announcement_image = $9,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 AND organization_id = $11
       RETURNING *`,
      [title, message, priority, targetType, targetId, targetLabel, status, expiresAt, savedImageUrl, id, organizationId]
    );

    if (updated) {
      emitRealTimeEvent('announcement.updated', { id: updated.id, imageUrl: savedImageUrl }, { orgId: organizationId });
    }

    return updated ? this.formatAnnouncement(updated) : null;
  }

  async delete(id: string, organizationId: string) {
    const existing = await queryOne<any>('SELECT * FROM announcements WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    if (existing?.image_url) {
      safeDeleteUploadedImage(existing.image_url);
    }
    await query('DELETE FROM announcement_reads WHERE announcement_id = $1', [id]);
    const res = await query('DELETE FROM announcements WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    if (res.rowCount && res.rowCount > 0) {
      emitRealTimeEvent('announcement.deleted', { id }, { orgId: organizationId });
      return true;
    }
    return false;
  }

  async toggleStatus(id: string, organizationId: string) {
    const current = await queryOne<any>('SELECT * FROM announcements WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    if (!current) return null;
    const newStatus = current.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await query('UPDATE announcements SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newStatus, id]);
    return { id: current.id, status: newStatus };
  }

  async getForStudent(studentUser: { id: string; studentId?: string; organizationId: string; branchId?: string }) {
    let student = null;
    if (studentUser.studentId) {
      student = await queryOne<any>('SELECT * FROM students WHERE id = $1', [studentUser.studentId]);
    }
    if (!student) {
      student = await queryOne<any>(
        'SELECT * FROM students WHERE user_id = $1 OR id = $1 OR customer_code = $1',
        [studentUser.id]
      );
    }

    const orgId = student ? student.organization_id : studentUser.organizationId;
    const branchId = student ? student.hostel_id : studentUser.branchId;
    const roomId = student?.room_id;
    const studentDbId = student ? student.id : studentUser.studentId || studentUser.id;

    const rows = await queryRows<any>(
      `SELECT a.*,
              CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END as is_read_count
       FROM announcements a
       LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND (r.student_id = $1 OR r.user_id = $1)
       WHERE a.organization_id = $2
         AND a.status = 'ACTIVE'
         AND (a.expires_at IS NULL OR a.expires_at >= NOW())
         AND (
           a.target_type = 'ALL'
           OR (a.target_type = 'BRANCH' AND a.target_id = $3)
           OR (a.target_type = 'ROOM' AND a.target_id = $4)
           OR (a.target_type = 'STUDENT' AND (a.target_id = $1 OR a.target_id = $5))
         )
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [studentDbId, orgId, branchId || '', roomId || '', student?.customer_code || '']
    );

    return rows.map((a) => {
      const img = a.image_url || a.attachment_url || a.announcement_image || null;
      return {
        id: a.id,
        _id: a.id,
        title: a.title,
        message: a.message,
        priority: a.priority,
        targetType: a.target_type,
        targetLabel: a.target_label,
        imageUrl: img,
        attachmentUrl: img,
        announcementImage: img,
        createdByName: a.created_by_name || 'Hostel Administration',
        createdAt: a.created_at,
        expiresAt: a.expires_at,
        isRead: Number(a.is_read_count || 0) > 0,
      };
    });
  }

  async markAsRead(id: string, studentIdentifier: string) {
    const readId = crypto.randomUUID();
    await query(
      `INSERT INTO announcement_reads (id, announcement_id, student_id, read_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (announcement_id, student_id) DO NOTHING`,
      [readId, id, studentIdentifier]
    );
    return true;
  }

  async getUnreadCountForStudent(studentUser: { id: string; studentId?: string; organizationId: string; branchId?: string }) {
    const list = await this.getForStudent(studentUser);
    return list.filter((a) => !a.isRead).length;
  }

  private formatAnnouncement(a: any): any {
    const img = a.image_url || a.attachment_url || a.announcement_image || null;
    return {
      id: a.id,
      _id: a.id,
      organizationId: a.organization_id,
      branchId: a.branch_id,
      title: a.title,
      message: a.message,
      priority: a.priority,
      targetType: a.target_type,
      targetId: a.target_id,
      targetLabel: a.target_label,
      imageUrl: img,
      attachmentUrl: img,
      announcementImage: img,
      createdBy: a.created_by,
      createdByName: a.created_by_name,
      expiresAt: a.expires_at,
      status: a.status,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    };
  }
}

export const announcementService = new AnnouncementService();
