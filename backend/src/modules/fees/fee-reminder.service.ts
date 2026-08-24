import { query, queryRows } from '../../config/database';
import { InstallmentStatus } from '../../config/constants';
import { emitRealTimeEvent } from '../../events/events.gateway';

export class FeeReminderService {
  async processInstallmentReminders(orgId?: string): Promise<{
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
      sql += ` AND i.organization_id = $1`;
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

      // OVERDUE
      if (diffDays < 0 && dueStr < todayStr) {
        if (inst.status !== InstallmentStatus.OVERDUE) {
          await query("UPDATE fee_installments SET status = 'OVERDUE' WHERE id = $1", [inst.id]);
          statusUpdated++;
        }
        overdueSent++;
        await this.createFeeNotification({
          orgId: inst.organization_id,
          branchId: inst.hostel_id,
          userId: inst.user_id,
          studentId: inst.student_id,
          title: 'Fee Payment Overdue',
          message: `Your hostel fee payment has an overdue balance of ${amountStr}. Please complete the payment as soon as possible.`,
          type: 'ALERT',
        });
      } else if (dueStr === todayStr) {
        dueTodaySent++;
        await this.createFeeNotification({
          orgId: inst.organization_id,
          branchId: inst.hostel_id,
          userId: inst.user_id,
          studentId: inst.student_id,
          title: 'Fee Payment Due Today',
          message: `Your hostel fee payment of ${amountStr} for ${inst.month_name} is due today.`,
          type: 'WARNING',
        });
      } else if (diffDays > 0 && diffDays <= 7) {
        upcomingSent++;
        await this.createFeeNotification({
          orgId: inst.organization_id,
          branchId: inst.hostel_id,
          userId: inst.user_id,
          studentId: inst.student_id,
          title: 'Upcoming Fee Payment',
          message: `Your hostel fee installment of ${amountStr} for ${inst.month_name} is due on ${formattedDueDate}.`,
          type: 'INFO',
        });
      }
    }

    return { upcomingSent, dueTodaySent, overdueSent, statusUpdated };
  }

  private async createFeeNotification(data: {
    orgId: string;
    branchId: string;
    userId?: string;
    studentId: string;
    title: string;
    message: string;
    type: 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS';
  }) {
    const notifId = require('crypto').randomUUID();
    await query(
      `INSERT INTO notifications (id, organization_id, branch_id, user_id, role, title, message, type, is_read)
       VALUES ($1, $2, $3, $4, 'STUDENT', $5, $6, $7, false)`,
      [notifId, data.orgId, data.branchId, data.userId || null, data.title, data.message, data.type]
    );

    emitRealTimeEvent('fee.reminder', {
      studentId: data.studentId,
      title: data.title,
      message: data.message,
      type: data.type,
    }, { userId: data.userId });
  }
}

export const feeReminderService = new FeeReminderService();
