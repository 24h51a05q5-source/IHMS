import { query, queryOne, queryRows } from '../../config/database';
import { InstallmentStatus } from '../../config/constants';
import { notificationService } from '../notifications/notification.service';
import { emitRealTimeEvent } from '../../events/events.gateway';

export class FeeReminderService {
  async processInstallmentReminders(orgId?: string, studentId?: string): Promise<{
    upcomingSent: number;
    dueTodaySent: number;
    overdueSent: number;
    statusUpdated: number;
  }> {
    let sql = `
      SELECT i.*, s.user_id, s.full_name as student_name
      FROM fee_installments i
      LEFT JOIN students s ON s.id = i.student_id
      WHERE i.status != 'PAID' AND i.balance_amount > 0
    `;
    const params: any[] = [];
    if (orgId) {
      params.push(orgId);
      sql += ` AND i.organization_id = $${params.length}`;
    }
    if (studentId) {
      params.push(studentId);
      sql += ` AND (i.student_id = $${params.length} OR s.user_id = $${params.length} OR s.customer_code = $${params.length})`;
    }

    const installments = await queryRows<any>(sql, params);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    let upcomingSent = 0;
    let dueTodaySent = 0;
    let overdueSent = 0;
    let statusUpdated = 0;

    for (const inst of installments) {
      const remainingAmount = Number(inst.balance_amount || 0);
      if (remainingAmount <= 0) continue;

      const due = new Date(inst.due_date);
      const dueStr = due.toISOString().slice(0, 10);
      const diffMs = due.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const amountStr = `₹${remainingAmount.toLocaleString('en-IN')}`;
      const formattedDueDate = due.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      const installmentLink = `/student/fees?installment=${inst.id}`;

      // OVERDUE
      if (diffDays < 0 && dueStr < todayStr) {
        if (inst.status !== InstallmentStatus.OVERDUE) {
          await query("UPDATE fee_installments SET status = 'OVERDUE' WHERE id = $1", [inst.id]);
          statusUpdated++;
        }

        const title = 'Fee Payment Overdue';
        const alreadySent = await this.isReminderAlreadySentToday(inst.organization_id, inst.student_id, inst.user_id, title, installmentLink);
        if (!alreadySent) {
          overdueSent++;
          await this.sendStudentFeeNotification({
            orgId: inst.organization_id,
            branchId: inst.hostel_id,
            studentId: inst.student_id,
            userId: inst.user_id,
            title,
            message: `Your hostel fee payment has an overdue balance of ${amountStr} for ${inst.month_name || 'installment'}. Please complete the payment as soon as possible.`,
            type: 'WARNING',
            link: installmentLink,
            installmentId: inst.id,
          });
        }
      } else if (dueStr === todayStr) {
        // DUE TODAY
        const title = 'Fee Payment Due Today';
        const alreadySent = await this.isReminderAlreadySentToday(inst.organization_id, inst.student_id, inst.user_id, title, installmentLink);
        if (!alreadySent) {
          dueTodaySent++;
          await this.sendStudentFeeNotification({
            orgId: inst.organization_id,
            branchId: inst.hostel_id,
            studentId: inst.student_id,
            userId: inst.user_id,
            title,
            message: `Your hostel fee payment of ${amountStr} for ${inst.month_name || 'installment'} is due today.`,
            type: 'WARNING',
            link: installmentLink,
            installmentId: inst.id,
          });
        }
      } else if (diffDays > 0 && diffDays <= 7) {
        // UPCOMING (Within next 7 days)
        const title = 'Upcoming Fee Payment';
        const alreadySent = await this.isReminderAlreadySentToday(inst.organization_id, inst.student_id, inst.user_id, title, installmentLink);
        if (!alreadySent) {
          upcomingSent++;
          await this.sendStudentFeeNotification({
            orgId: inst.organization_id,
            branchId: inst.hostel_id,
            studentId: inst.student_id,
            userId: inst.user_id,
            title,
            message: `Your hostel fee installment of ${amountStr} for ${inst.month_name || 'installment'} is due on ${formattedDueDate}.`,
            type: 'INFO',
            link: installmentLink,
            installmentId: inst.id,
          });
        }
      }
    }

    return { upcomingSent, dueTodaySent, overdueSent, statusUpdated };
  }

  /**
   * Check if a reminder with the given title and installment link was already sent today
   * to avoid duplicate notifications.
   */
  private async isReminderAlreadySentToday(
    orgId: string,
    studentId: string,
    userId: string | undefined,
    title: string,
    link: string
  ): Promise<boolean> {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startOfDayIso = startOfDay.toISOString();

      const existing = await queryOne<any>(
        `SELECT id FROM notifications
         WHERE (organization_id = $1 OR organization_id IS NULL)
           AND (user_id = $2 OR user_id = $3)
           AND title = $4
           AND link = $5
           AND created_at >= $6
         LIMIT 1`,
        [orgId, studentId, userId || studentId, title, link, startOfDayIso]
      );
      return !!existing;
    } catch (err: any) {
      console.warn('[FeeReminderService] isReminderAlreadySentToday check error:', err?.message || err);
      return false;
    }
  }

  private async sendStudentFeeNotification(data: {
    orgId: string;
    branchId: string;
    studentId: string;
    userId?: string;
    title: string;
    message: string;
    type: 'INFO' | 'WARNING' | 'ERROR';
    link: string;
    installmentId: string;
  }) {
    // Route through central notificationService so user lookup, role, read/is_read, and real-time events are all properly handled
    await notificationService.notifyStudent(data.studentId, {
      organizationId: data.orgId,
      branchId: data.branchId,
      title: data.title,
      message: data.message,
      type: data.type,
      link: data.link,
      entityType: 'FEE_INSTALLMENT',
      entityId: data.installmentId,
    });

    emitRealTimeEvent('fee.reminder', {
      studentId: data.studentId,
      title: data.title,
      message: data.message,
      type: data.type,
      installmentId: data.installmentId,
    }, { userId: data.userId || data.studentId });
  }
}

export const feeReminderService = new FeeReminderService();
