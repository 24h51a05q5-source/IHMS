import { query, queryOne, queryRows } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { emitRealTimeEvent } from '../../events/events.gateway';

export class MessService {
  async createMenu(orgId: string, branchId: string, data: any, userId?: string): Promise<any> {
    const branch = await queryOne<any>(
      'SELECT * FROM hostels WHERE (id = $1 OR hostel_id = $1 OR branch_code = $1) AND organization_id = $2',
      [branchId, orgId]
    );
    if (!branch) throw new AppError('Hostel branch not found', 404);

    const actualBranchId = branch.id;

    if (!data.weekStartDate || !data.weekEndDate) {
      // Fallback if start/end dates omitted
      const now = new Date();
      const dow = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((dow + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const fmtDate = (d: Date) => d.toISOString().split('T')[0];

      data.weekStartDate = data.weekStartDate || fmtDate(monday);
      data.weekEndDate = data.weekEndDate || fmtDate(sunday);
    }

    const existing = await queryOne<any>(
      'SELECT id FROM mess_menus WHERE organization_id = $1 AND hostel_id = $2 AND week_start_date = $3',
      [orgId, actualBranchId, data.weekStartDate]
    );
    if (existing) {
      return this.updateMenu(orgId, existing.id, data, userId);
    }

    const toStrArray = (arr: any) => {
      if (!arr) return [];
      const list = Array.isArray(arr) ? arr : [arr];
      return list.map((item: any) => (typeof item === 'string' ? item : (item?.name || String(item)))).filter(Boolean);
    };

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const incomingDays = data.days || data.week || [];
    const sanitizedDays = dayNames.map((dName) => {
      const dayData = (incomingDays || []).find((d: any) => d.day?.toLowerCase() === dName.toLowerCase()) || {};
      return {
        day: dName,
        date: dayData.date || '',
        breakfast: toStrArray(dayData.breakfast),
        lunch: toStrArray(dayData.lunch),
        snacks: toStrArray(dayData.snacks),
        dinner: toStrArray(dayData.dinner),
        isSpecial: Boolean(dayData.isSpecial || (dayData.breakfast || []).some((x: any) => x?.special)),
      };
    });

    const menuId = require('crypto').randomUUID();
    const menu = await queryOne<any>(
      `INSERT INTO mess_menus (
        id, organization_id, hostel_id, week_start_date, week_end_date,
        days, status, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        menuId,
        orgId,
        actualBranchId,
        data.weekStartDate,
        data.weekEndDate,
        JSON.stringify(sanitizedDays),
        data.status || 'DRAFT',
        userId || null,
        userId || null
      ]
    );

    emitRealTimeEvent('mess.menu_created', { menuId: menu.id, branchId: actualBranchId, status: menu.status }, { branchId: actualBranchId });
    return this.formatMenu(menu);
  }

  async listMenus(orgId: string, branchId?: string, status?: string): Promise<any[]> {
    let sql = 'SELECT * FROM mess_menus WHERE organization_id = $1';
    const params: any[] = [orgId];

    if (branchId && branchId !== 'ALL') {
      params.push(branchId);
      sql += ` AND hostel_id = $${params.length}`;
    }
    if (status && status !== 'ALL') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY week_start_date DESC';
    const rows = await queryRows<any>(sql, params);
    return rows.map((r) => this.formatMenu(r));
  }

  async getMenuById(orgId: string, id: string): Promise<any> {
    const menu = await queryOne<any>('SELECT * FROM mess_menus WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (!menu) throw new AppError('Mess menu not found', 404);
    return this.formatMenu(menu);
  }

  async updateMenu(orgId: string, id: string, data: any, userId?: string): Promise<any> {
    const menu = await queryOne<any>('SELECT * FROM mess_menus WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (!menu) throw new AppError('Mess menu not found', 404);

    const weekStartDate = data.weekStartDate || menu.week_start_date;
    const weekEndDate = data.weekEndDate || menu.week_end_date;
    const status = data.status || menu.status;

    let days = menu.days;
    const incomingDays = data.days || data.week;

    if (incomingDays && Array.isArray(incomingDays)) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const toStrArray = (arr: any) => {
        if (!arr) return [];
        const list = Array.isArray(arr) ? arr : [arr];
        return list.map((item: any) => (typeof item === 'string' ? item : (item?.name || String(item)))).filter(Boolean);
      };

      days = JSON.stringify(dayNames.map((dName) => {
        const dayData = incomingDays.find((d: any) => d.day?.toLowerCase() === dName.toLowerCase()) || {};
        return {
          day: dName,
          date: dayData.date || '',
          breakfast: toStrArray(dayData.breakfast),
          lunch: toStrArray(dayData.lunch),
          snacks: toStrArray(dayData.snacks),
          dinner: toStrArray(dayData.dinner),
          isSpecial: Boolean(dayData.isSpecial || (dayData.breakfast || []).some((x: any) => x?.special)),
        };
      }));
    }

    const updated = await queryOne<any>(
      `UPDATE mess_menus
       SET week_start_date = $1, week_end_date = $2, days = $3, status = $4,
           updated_by = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND organization_id = $7
       RETURNING *`,
      [weekStartDate, weekEndDate, days, status, userId || null, id, orgId]
    );

    if (status === 'PUBLISHED') {
      emitRealTimeEvent('mess.menu_published', { menuId: updated.id, branchId: updated.hostel_id, status: updated.status }, { branchId: updated.hostel_id });
    } else {
      emitRealTimeEvent('mess.menu_updated', { menuId: updated.id, branchId: updated.hostel_id, status: updated.status }, { branchId: updated.hostel_id });
    }
    return this.formatMenu(updated);
  }

  async deleteMenu(orgId: string, id: string): Promise<{ success: boolean; message: string }> {
    const menu = await queryOne<any>('SELECT hostel_id FROM mess_menus WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (!menu) throw new AppError('Mess menu not found', 404);

    await query('DELETE FROM mess_menus WHERE id = $1', [id]);
    emitRealTimeEvent('mess.menu_deleted', { menuId: id, branchId: menu.hostel_id }, { branchId: menu.hostel_id });
    return { success: true, message: 'Mess menu deleted successfully' };
  }

  async setPublishStatus(orgId: string, id: string, status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED', userId?: string): Promise<any> {
    const menu = await queryOne<any>(
      `UPDATE mess_menus
       SET status = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND organization_id = $4
       RETURNING *`,
      [status, userId || null, id, orgId]
    );
    if (!menu) throw new AppError('Mess menu not found', 404);

    emitRealTimeEvent('mess.menu_published', { menuId: menu.id, branchId: menu.hostel_id, status: menu.status }, { branchId: menu.hostel_id });
    return this.formatMenu(menu);
  }

  async getStudentPublishedMenu(orgId: string, studentId: string): Promise<any | null> {
    const student = await queryOne<any>(
      'SELECT hostel_id FROM students WHERE (id = $1 OR user_id = $1 OR customer_code = $1) AND organization_id = $2',
      [studentId, orgId]
    );
    if (!student || !student.hostel_id) return null;

    const menu = await queryOne<any>(
      "SELECT * FROM mess_menus WHERE organization_id = $1 AND hostel_id = $2 AND status = 'PUBLISHED' ORDER BY week_start_date DESC LIMIT 1",
      [orgId, student.hostel_id]
    );

    return menu ? this.formatMenu(menu) : null;
  }

  async markMealAttendance(orgId: string, branchId: string, customerCode: string, mealType: string) {
    const student = await queryOne<any>(
      'SELECT id, customer_code, full_name FROM students WHERE organization_id = $1 AND (UPPER(customer_code) = $2 OR id = $2)',
      [orgId, customerCode.toUpperCase()]
    );
    if (!student) throw new AppError('Student not found with this customer code', 404);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const recordId = require('crypto').randomUUID();
    const record = await queryOne<any>(
      `INSERT INTO meal_attendances (
        id, organization_id, branch_id, student_id, customer_code,
        student_name, meal_type, date, marked_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        recordId,
        orgId,
        branchId,
        student.id,
        student.customer_code,
        student.full_name,
        mealType,
        today
      ]
    );

    return record;
  }

  async getMealStats(orgId: string, branchId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = await queryRows<any>(
      'SELECT meal_type, COUNT(*)::int as count FROM meal_attendances WHERE organization_id = $1 AND branch_id = $2 AND date >= $3 GROUP BY meal_type',
      [orgId, branchId, today]
    );

    const stats: any = { BREAKFAST: 0, LUNCH: 0, SNACKS: 0, DINNER: 0 };
    rows.forEach((r) => { stats[r.meal_type] = Number(r.count || 0); });
    return stats;
  }

  async getOrInitializeMenu(orgId: string, branchId: string, userId?: string): Promise<any> {
    const existing = await queryOne<any>(
      'SELECT * FROM mess_menus WHERE organization_id = $1 AND hostel_id = $2 ORDER BY created_at DESC LIMIT 1',
      [orgId, branchId]
    );
    if (existing) return this.formatMenu(existing);

    const branch = await queryOne<any>(
      'SELECT id FROM hostels WHERE (id = $1 OR hostel_id = $1 OR branch_code = $1) AND organization_id = $2',
      [branchId, orgId]
    );
    if (!branch) throw new AppError('Hostel branch not found', 404);
    const actualBranchId = branch.id;

    const recheck = await queryOne<any>(
      'SELECT * FROM mess_menus WHERE organization_id = $1 AND hostel_id = $2 ORDER BY created_at DESC LIMIT 1',
      [orgId, actualBranchId]
    );
    if (recheck) return this.formatMenu(recheck);

    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const defaultDays = [
      {
        day: 'Monday',
        breakfast: ['Idli & Sambar', 'Coconut Chutney', 'Tea / Coffee'],
        lunch: ['Steamed Rice', 'Dal Tadka', 'Aloo Gobi', 'Curd'],
        snacks: ['Samosa (2 pcs)', 'Masala Tea'],
        dinner: ['Roti (3 pcs)', 'Paneer Butter Masala', 'Jeera Rice', 'Gulab Jamun'],
        isSpecial: false,
      },
      {
        day: 'Tuesday',
        breakfast: ['Puri & Bhaji', 'Banana', 'Tea / Coffee'],
        lunch: ['Rice', 'Sambar', 'Bhindi Fry', 'Rasam', 'Papad'],
        snacks: ['Biscuits', 'Lemon Tea'],
        dinner: ['Chapati', 'Mix Veg Curry', 'Dal Fry', 'Kheer'],
        isSpecial: false,
      },
      {
        day: 'Wednesday',
        breakfast: ['Upma & Chutney', 'Boiled Egg / Banana', 'Tea / Coffee'],
        lunch: ['Veg Pulao', 'Rajma Masala', 'Boondi Raita', 'Salad'],
        snacks: ['Pakoda (Veg)', 'Filter Coffee'],
        dinner: ['Roti', 'Egg Curry / Paneer Curry', 'Steamed Rice', 'Ice Cream'],
        isSpecial: false,
      },
      {
        day: 'Thursday',
        breakfast: ['Poha & Sev', 'Sprouts', 'Tea / Coffee'],
        lunch: ['Rice', 'Kadhi Pakoda', 'Aloo Methi', 'Curd'],
        snacks: ['Puffed Rice Chivda', 'Tea'],
        dinner: ['Chapati', 'Chana Masala', 'Jeera Rice', 'Fruit Custard'],
        isSpecial: false,
      },
      {
        day: 'Friday',
        breakfast: ['Uttapam & Chutney', 'Sambar', 'Tea / Coffee'],
        lunch: ['Steamed Rice', 'Tomato Dal', 'Cabbage Poriyal', 'Rasam'],
        snacks: ['Veg Puff', 'Tea'],
        dinner: ['Roti', 'Veg Biryani', 'Mirchi Ka Salan', 'Raita', 'Sweet'],
        isSpecial: false,
      },
      {
        day: 'Saturday',
        breakfast: ['Aloo Paratha & Curd', 'Pickle', 'Tea / Coffee'],
        lunch: ['Rice', 'Dal Makhani', 'Baingan Bharta', 'Curd'],
        snacks: ['Bread Jam / Toast', 'Coffee'],
        dinner: ['Poori', 'Chole Masala', 'Jeera Rice', 'Halwa'],
        isSpecial: true,
      },
      {
        day: 'Sunday',
        breakfast: ['Masala Dosa & Chutney', 'Sambar', 'Tea / Coffee'],
        lunch: ['Special Hyderabadi Dum Biryani (Veg/Chicken)', 'Raita', 'Salad', 'Double Ka Meetha'],
        snacks: ['Sweet Corn', 'Cold Drink / Tea'],
        dinner: ['Light Khichdi / Roti', 'Moong Dal', 'Aloo Jeera', 'Curd'],
        isSpecial: true,
      },
    ];

    const menuId = require('crypto').randomUUID();
    const created = await queryOne<any>(
      `INSERT INTO mess_menus (
        id, organization_id, hostel_id, week_start_date, week_end_date,
        days, status, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        menuId,
        orgId,
        actualBranchId,
        fmt(monday),
        fmt(sunday),
        JSON.stringify(defaultDays),
        'DRAFT',
        userId || null,
        userId || null,
      ]
    );

    emitRealTimeEvent('mess.menu_initialized', { menuId: created.id, branchId: actualBranchId }, { branchId: actualBranchId });
    return this.formatMenu(created);
  }

  private formatMenu(m: any): any {
    let days = m.days;
    if (typeof days === 'string') {
      try { days = JSON.parse(days); } catch { days = []; }
    }
    return {
      id: m.id,
      _id: m.id,
      organizationId: m.organization_id,
      hostelBranchId: m.hostel_id,
      branchId: m.hostel_id,
      weekStartDate: m.week_start_date,
      weekEndDate: m.week_end_date,
      days,
      status: m.status,
      createdBy: m.created_by,
      updatedBy: m.updated_by,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    };
  }
}

export const messService = new MessService();
