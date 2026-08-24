import { Router, Request, Response, NextFunction } from 'express';
import { dashboardService } from './dashboard.service';
import { queryOne, queryRows } from '../../config/database';
import { authenticate } from '../../common/guards/auth.guard';

const router = Router();
router.use(authenticate);

// ============================================================
// GET /dashboard/owner
// All data from real PostgreSQL queries — zero fake/hardcoded values
// ============================================================
router.get('/owner', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId } = req.query;
    const orgId = req.user!.organizationId;
    const bParam = (branchId as string) && (branchId as string) !== 'ALL' ? (branchId as string) : undefined;

    const stats = await dashboardService.getStats(orgId, bParam);
    const kpi = stats.kpi;

    // ── Real Recent Activity from audit_logs ──────────────────────────────────
    // Returns empty array when no real activity exists — never fake entries
    const recentActivityRows = await queryRows<any>(
      `SELECT id, action, details as description, created_at as "timestamp"
       FROM audit_logs
       WHERE organization_id = $1
       ORDER BY created_at DESC LIMIT 10`,
      [orgId]
    );
    const recentActivity = recentActivityRows.map((r) => ({
      id: r.id,
      description: r.description || r.action,
      timestamp: r.timestamp,
      type: r.action,
    }));

    // ── Real Collection vs Expenses — last 6 calendar months ─────────────────
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // SUM(actual payments) grouped by calendar month
    const collectionParams: any[] = [orgId, sixMonthsAgo];
    let collectionSql = `
      SELECT
        EXTRACT(YEAR FROM created_at)::int  AS year,
        EXTRACT(MONTH FROM created_at)::int AS month,
        COALESCE(SUM(amount), 0)::numeric   AS collection
      FROM payments
      WHERE organization_id = $1 AND status = 'SUCCESS' AND created_at >= $2`;
    if (bParam) { collectionParams.push(bParam); collectionSql += ` AND hostel_id = $${collectionParams.length}`; }
    collectionSql += ' GROUP BY year, month ORDER BY year ASC, month ASC';

    // SUM(actual expenses) grouped by calendar month
    const expenseParams: any[] = [orgId, sixMonthsAgo];
    let expenseSql = `
      SELECT
        EXTRACT(YEAR FROM expense_date)::int  AS year,
        EXTRACT(MONTH FROM expense_date)::int AS month,
        COALESCE(SUM(amount), 0)::numeric     AS expenses
      FROM expenses
      WHERE organization_id = $1 AND expense_date >= $2::date`;
    if (bParam) { expenseParams.push(bParam); expenseSql += ` AND hostel_id = $${expenseParams.length}`; }
    expenseSql += ' GROUP BY year, month ORDER BY year ASC, month ASC';

    const [collectionRows, expenseRows] = await Promise.all([
      queryRows<any>(collectionSql, collectionParams),
      queryRows<any>(expenseSql, expenseParams),
    ]);

    // Merge into unified month-keyed map
    const monthMap = new Map<string, { month: string; collection: number; expenses: number }>();
    for (const r of collectionRows) {
      const key = `${r.year}-${String(r.month).padStart(2, '0')}`;
      monthMap.set(key, { month: `${monthNames[r.month - 1]} ${r.year}`, collection: Number(r.collection || 0), expenses: 0 });
    }
    for (const r of expenseRows) {
      const key = `${r.year}-${String(r.month).padStart(2, '0')}`;
      if (monthMap.has(key)) {
        monthMap.get(key)!.expenses = Number(r.expenses || 0);
      } else {
        monthMap.set(key, { month: `${monthNames[r.month - 1]} ${r.year}`, collection: 0, expenses: Number(r.expenses || 0) });
      }
    }
    // Sort chronologically — empty array for a brand-new hostel
    const collectionTrend = [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v);

    // ── Real Occupancy — current actual snapshot ──────────────────────────────
    // Fake historical offsets (occupancyRate - 4, -2, 0) are removed.
    // Historical snapshots require a separate occupancy_snapshots table (future).
    // For now: single current-month data point when beds exist; empty otherwise.
    const occupancyTrend: { month: string; occupancy: number }[] = [];
    if (kpi.totalBeds > 0) {
      const now = new Date();
      occupancyTrend.push({
        month: `${monthNames[now.getMonth()]} ${now.getFullYear()}`,
        occupancy: kpi.occupancyRate,
      });
    }

    const ownerData = {
      totalHostels: kpi.totalBranches,
      totalStudents: kpi.totalStudents,
      totalBeds: kpi.totalBeds,
      occupiedBeds: kpi.occupiedBeds,
      availableBeds: kpi.availableBeds,
      occupancyPct: kpi.occupancyRate,
      monthlyCollection: kpi.monthlyIncome,
      outstandingFees: kpi.totalOutstanding,
      monthlyExpenses: kpi.monthlyExpenses,
      netProfitLoss: kpi.netProfitOrLoss,
      pendingComplaints: kpi.pendingComplaints,
      pendingApprovals: kpi.pendingLeaves,
      collectionTrend,   // real data only — empty array for new hostels
      occupancyTrend,    // real data only — empty array until beds exist
      recentActivity,    // real audit_logs — empty array when no action taken
      kpi,
      ...stats,
    };

    res.json({ success: true, data: ownerData, ...ownerData });
  } catch (err) { next(err); }
});

// ============================================================
// GET /dashboard/student
// All data from real PostgreSQL — zero hardcoded names/values
// ============================================================
router.get('/student', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.organizationId;
    const studentId = req.query.studentId || req.user!.studentId || req.user!.id;

    // Real student record with room/bed/hostel joins
    const student = await queryOne<any>(
      `SELECT s.*, r.room_number, r.floor, b.bed_code, h.name as hostel_name, h.branch_name
       FROM students s
       LEFT JOIN rooms r ON r.id = s.room_id
       LEFT JOIN beds b ON b.id = s.bed_id
       LEFT JOIN hostels h ON h.id = s.hostel_id
       WHERE (s.id = $1 OR s.user_id = $1 OR UPPER(s.customer_code) = $2 OR LOWER(s.email) = $3)
         AND s.organization_id = $4`,
      [studentId, (req.user!.customerCode || '').toUpperCase(), (req.user!.email || '').toLowerCase(), orgId]
    );

    // Real complaints count
    const complaintsCount = await queryOne<any>(
      `SELECT COUNT(*)::int as count FROM complaints
       WHERE organization_id = $1 AND student_id = $2 AND status IN ('OPEN', 'IN_PROGRESS', 'PENDING')`,
      [orgId, student?.id || studentId]
    );

    // Real active leaves count
    const activeLeavesCount = await queryOne<any>(
      `SELECT COUNT(*)::int as count FROM leave_requests
       WHERE organization_id = $1 AND student_id = $2 AND status = 'APPROVED' AND end_date >= CURRENT_DATE`,
      [orgId, student?.id || studentId]
    );

    // Real attendance percentage for current month
    const attendanceRow = await queryOne<any>(
      `SELECT
         COUNT(*)::int AS total_days,
         SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END)::int AS present_days
       FROM attendances
       WHERE organization_id = $1 AND student_id = $2
         AND date >= DATE_TRUNC('month', CURRENT_DATE)`,
      [orgId, student?.id || studentId]
    );
    const totalDays = Number(attendanceRow?.total_days || 0);
    const presentDays = Number(attendanceRow?.present_days || 0);
    const attendancePct = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

    // Real announcements — empty array when none (no fake fallback)
    const announcements = await queryRows<any>(
      `SELECT id, title, content as message, created_at as "createdAt"
       FROM announcements
       WHERE organization_id = $1 AND (target_audience = 'ALL' OR target_audience = 'STUDENT')
       ORDER BY created_at DESC LIMIT 5`,
      [orgId]
    );

    // Real next due date from fee installments
    const nextDueRow = await queryOne<any>(
      `SELECT due_date FROM fee_installments
       WHERE organization_id = $1 AND student_id = $2 AND status IN ('UNPAID', 'PARTIAL')
       ORDER BY due_date ASC LIMIT 1`,
      [orgId, student?.id || studentId]
    );

    const studentData = {
      profile: {
        customerCode: student?.customer_code || '',
        name: student?.full_name || req.user!.name || '',
        hostelName: student?.hostel_name || '',
        branchName: student?.branch_name || '',
        roomNumber: student?.room_number || '',
        bedNumber: student?.bed_code || '',
        avatarUrl: '',
      },
      fee: {
        total: Number(student?.financial_total_demanded || 0),
        paid: Number(student?.financial_total_paid || 0),
        outstanding: Number(student?.financial_outstanding_balance || 0),
        nextDueDate: nextDueRow?.due_date || null,
      },
      attendancePct,  // real: 0 when no attendance records; percentage when records exist
      pendingComplaints: Number(complaintsCount?.count || 0),
      activeLeaveRequests: Number(activeLeavesCount?.count || 0),
      announcements,  // real announcements only — empty array when none published
    };

    res.json({ success: true, data: studentData });
  } catch (err) { next(err); }
});

// ============================================================
// GET /dashboard/occupancy
// Real current bed occupancy data from PostgreSQL
// ============================================================
router.get('/occupancy', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.organizationId;
    const { branchId } = req.query;
    const bParam = (branchId as string) && (branchId as string) !== 'ALL' ? (branchId as string) : undefined;

    const params: any[] = [orgId];
    let sql = `SELECT status, COUNT(*)::int as count FROM beds WHERE organization_id = $1`;
    if (bParam) { params.push(bParam); sql += ` AND hostel_id = $${params.length}`; }
    sql += ' GROUP BY status';

    const bedRows = await queryRows<any>(sql, params);
    let total = 0, occupied = 0;
    for (const r of bedRows) {
      total += Number(r.count || 0);
      if (r.status === 'OCCUPIED') occupied += Number(r.count || 0);
    }
    const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;

    // Real current occupancy snapshot — empty when no beds configured yet
    const data = total > 0
      ? [{ date: new Date().toISOString().split('T')[0], occupancy: rate }]
      : [];

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ============================================================
// GET /dashboard/collection
// Real 6-month collection vs expenses from PostgreSQL
// ============================================================
router.get('/collection', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.organizationId;
    const { branchId } = req.query;
    const bParam = (branchId as string) && (branchId as string) !== 'ALL' ? (branchId as string) : undefined;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const collParams: any[] = [orgId, sixMonthsAgo];
    let collSql = `SELECT EXTRACT(YEAR FROM created_at)::int AS year, EXTRACT(MONTH FROM created_at)::int AS month, COALESCE(SUM(amount), 0)::numeric AS collection
                   FROM payments WHERE organization_id = $1 AND status = 'SUCCESS' AND created_at >= $2`;
    if (bParam) { collParams.push(bParam); collSql += ` AND hostel_id = $${collParams.length}`; }
    collSql += ' GROUP BY year, month ORDER BY year, month';

    const expParams: any[] = [orgId, sixMonthsAgo];
    let expSql = `SELECT EXTRACT(YEAR FROM expense_date)::int AS year, EXTRACT(MONTH FROM expense_date)::int AS month, COALESCE(SUM(amount), 0)::numeric AS expenses
                  FROM expenses WHERE organization_id = $1 AND expense_date >= $2::date`;
    if (bParam) { expParams.push(bParam); expSql += ` AND hostel_id = $${expParams.length}`; }
    expSql += ' GROUP BY year, month ORDER BY year, month';

    const [cRows, eRows] = await Promise.all([queryRows<any>(collSql, collParams), queryRows<any>(expSql, expParams)]);

    const map = new Map<string, { month: string; collection: number; expenses: number }>();
    for (const r of cRows) {
      const k = `${r.year}-${String(r.month).padStart(2, '0')}`;
      map.set(k, { month: months[r.month - 1], collection: Number(r.collection), expenses: 0 });
    }
    for (const r of eRows) {
      const k = `${r.year}-${String(r.month).padStart(2, '0')}`;
      if (map.has(k)) map.get(k)!.expenses = Number(r.expenses);
      else map.set(k, { month: months[r.month - 1], collection: 0, expenses: Number(r.expenses) });
    }

    // Real data sorted chronologically — empty array for brand-new hostels
    const data = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export const dashboardRouter = router;
