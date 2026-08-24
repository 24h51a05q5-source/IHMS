import { query, queryOne, queryRows } from '../../config/database';
import { BedStatus, ComplaintStatus, LeaveStatus, PaymentStatus, StudentStatus } from '../../config/constants';
import { cache } from '../../common/utils/cache';

export class DashboardService {
  invalidateCache(orgId: string) {
    cache.deletePattern(`dashboard:*:${orgId}*`);
  }

  async getStats(orgId: string, branchId?: string) {
    const isAll = !branchId || branchId === 'ALL';
    const branchParam = isAll ? null : branchId;
    const cacheKey = `dashboard:stats:${orgId}:${branchParam || 'ALL'}`;

    return cache.wrap(cacheKey, 15, async () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const startOfMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const endOfMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(lastDay)}`;

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      sixMonthsAgo.setHours(0, 0, 0, 0);

      // Execute all 10 independent KPI queries in parallel via Promise.all
      const [
        totalBranchesRow,
        bedRows,
        studentRow,
        payRow,
        expRow,
        duesRow,
        compRow,
        leaveRow,
        visRow,
        trendRows,
      ] = await Promise.all([
        // 1. Total branches
        queryOne<any>('SELECT COUNT(*)::int as count FROM hostels WHERE organization_id = $1', [orgId]),

        // 2. Bed Occupancy
        queryRows<any>(
          branchParam
            ? 'SELECT status, COUNT(*)::int as count FROM beds WHERE organization_id = $1 AND hostel_id = $2 GROUP BY status'
            : 'SELECT status, COUNT(*)::int as count FROM beds WHERE organization_id = $1 GROUP BY status',
          branchParam ? [orgId, branchParam] : [orgId]
        ),

        // 3. Active Students
        queryOne<any>(
          branchParam
            ? "SELECT COUNT(*)::int as count FROM students WHERE organization_id = $1 AND status = 'ACTIVE' AND hostel_id = $2"
            : "SELECT COUNT(*)::int as count FROM students WHERE organization_id = $1 AND status = 'ACTIVE'",
          branchParam ? [orgId, branchParam] : [orgId]
        ),

        // 4. Monthly Income
        queryOne<any>(
          branchParam
            ? "SELECT COALESCE(SUM(amount), 0)::numeric as total FROM payments WHERE organization_id = $1 AND status = 'SUCCESS' AND created_at >= $2 AND created_at <= $3 AND hostel_id = $4"
            : "SELECT COALESCE(SUM(amount), 0)::numeric as total FROM payments WHERE organization_id = $1 AND status = 'SUCCESS' AND created_at >= $2 AND created_at <= $3",
          branchParam ? [orgId, startOfMonth, endOfMonth, branchParam] : [orgId, startOfMonth, endOfMonth]
        ),

        // 5. Monthly Expenses
        queryOne<any>(
          branchParam
            ? 'SELECT COALESCE(SUM(amount), 0)::numeric as total FROM expenses WHERE organization_id = $1 AND expense_date >= $2::date AND expense_date <= $3::date AND hostel_id = $4'
            : 'SELECT COALESCE(SUM(amount), 0)::numeric as total FROM expenses WHERE organization_id = $1 AND expense_date >= $2::date AND expense_date <= $3::date',
          branchParam ? [orgId, startOfMonth, endOfMonth, branchParam] : [orgId, startOfMonth, endOfMonth]
        ),

        // 6. Demanded & Outstanding Balances
        queryOne<any>(
          branchParam
            ? 'SELECT COALESCE(SUM(financial_total_demanded), 0)::numeric as "totalDemanded", COALESCE(SUM(financial_total_paid), 0)::numeric as "totalPaid", COALESCE(SUM(financial_outstanding_balance), 0)::numeric as "totalOutstanding" FROM students WHERE organization_id = $1 AND hostel_id = $2'
            : 'SELECT COALESCE(SUM(financial_total_demanded), 0)::numeric as "totalDemanded", COALESCE(SUM(financial_total_paid), 0)::numeric as "totalPaid", COALESCE(SUM(financial_outstanding_balance), 0)::numeric as "totalOutstanding" FROM students WHERE organization_id = $1',
          branchParam ? [orgId, branchParam] : [orgId]
        ),

        // 7. Open Complaints
        queryOne<any>(
          branchParam
            ? "SELECT COUNT(*)::int as count FROM complaints WHERE organization_id = $1 AND status IN ('OPEN', 'IN_PROGRESS') AND (branch_id = $2 OR hostel_id = $2)"
            : "SELECT COUNT(*)::int as count FROM complaints WHERE organization_id = $1 AND status IN ('OPEN', 'IN_PROGRESS')",
          branchParam ? [orgId, branchParam] : [orgId]
        ),

        // 8. Pending Leaves
        queryOne<any>(
          branchParam
            ? "SELECT COUNT(*)::int as count FROM leave_requests WHERE organization_id = $1 AND status = 'PENDING' AND (branch_id = $2 OR hostel_id = $2)"
            : "SELECT COUNT(*)::int as count FROM leave_requests WHERE organization_id = $1 AND status = 'PENDING'",
          branchParam ? [orgId, branchParam] : [orgId]
        ),

        // 9. Active Visitors
        queryOne<any>(
          branchParam
            ? "SELECT COUNT(*)::int as count FROM visitors WHERE organization_id = $1 AND status = 'INSIDE' AND (branch_id = $2 OR hostel_id = $2)"
            : "SELECT COUNT(*)::int as count FROM visitors WHERE organization_id = $1 AND status = 'INSIDE'",
          branchParam ? [orgId, branchParam] : [orgId]
        ),

        // 10. Monthly Revenue Trend
        queryRows<any>(
          branchParam
            ? `SELECT EXTRACT(YEAR FROM created_at)::int as year, EXTRACT(MONTH FROM created_at)::int as month, COALESCE(SUM(amount), 0)::numeric as revenue FROM payments WHERE organization_id = $1 AND status = 'SUCCESS' AND created_at >= $2 AND hostel_id = $3 GROUP BY EXTRACT(YEAR FROM created_at), EXTRACT(MONTH FROM created_at) ORDER BY year ASC, month ASC`
            : `SELECT EXTRACT(YEAR FROM created_at)::int as year, EXTRACT(MONTH FROM created_at)::int as month, COALESCE(SUM(amount), 0)::numeric as revenue FROM payments WHERE organization_id = $1 AND status = 'SUCCESS' AND created_at >= $2 GROUP BY EXTRACT(YEAR FROM created_at), EXTRACT(MONTH FROM created_at) ORDER BY year ASC, month ASC`,
          branchParam ? [orgId, sixMonthsAgo, branchParam] : [orgId, sixMonthsAgo]
        ),
      ]);

      const totalBranches = totalBranchesRow?.count || 0;

      let totalBeds = 0;
      let occupiedBeds = 0;
      let availableBeds = 0;
      let maintenanceBeds = 0;

      for (const r of bedRows) {
        const c = Number(r.count || 0);
        totalBeds += c;
        if (r.status === 'OCCUPIED') occupiedBeds += c;
        else if (r.status === 'AVAILABLE') availableBeds += c;
        else if (r.status === 'MAINTENANCE') maintenanceBeds += c;
      }
      const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

      const totalStudents = studentRow?.count || 0;
      const monthlyIncome = Number(payRow?.total || 0);
      const monthlyExpenses = Number(expRow?.total || 0);
      const netProfitOrLoss = monthlyIncome - monthlyExpenses;

      const totalDemanded = Number(duesRow?.totalDemanded || 0);
      const totalCollected = Number(duesRow?.totalPaid || 0);
      const totalOutstanding = Number(duesRow?.totalOutstanding || 0);
      const collectionPercentage = totalDemanded > 0 ? Math.round((totalCollected / totalDemanded) * 100) : 100;

      const pendingComplaints = compRow?.count || 0;
      const pendingLeaves = leaveRow?.count || 0;
      const activeVisitors = visRow?.count || 0;

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const revenueTrend = trendRows.map((item) => ({
        month: `${months[item.month - 1]} ${item.year}`,
        revenue: Number(item.revenue || 0),
      }));

      return {
        kpi: {
          totalBranches,
          totalBeds,
          occupiedBeds,
          availableBeds,
          maintenanceBeds,
          occupancyRate,
          totalStudents,
          monthlyIncome,
          monthlyExpenses,
          netProfitOrLoss,
          totalDemanded,
          totalCollected,
          totalOutstanding,
          collectionPercentage,
          pendingComplaints,
          pendingLeaves,
          activeVisitors,
        },
        revenueTrend,
      };
    });
  }

  async getBranchComparison(orgId: string) {
    const cacheKey = `dashboard:branch-comparison:${orgId}`;

    return cache.wrap(cacheKey, 15, async () => {
      const [branches, bedsAgg, revAgg, expAgg] = await Promise.all([
        queryRows<any>('SELECT id, branch_code as "branchCode", name, city, status FROM hostels WHERE organization_id = $1', [orgId]),
        queryRows<any>('SELECT hostel_id, status, COUNT(*)::int as count FROM beds WHERE organization_id = $1 GROUP BY hostel_id, status', [orgId]),
        queryRows<any>("SELECT hostel_id, COALESCE(SUM(amount), 0)::numeric as total FROM payments WHERE organization_id = $1 AND status = 'SUCCESS' GROUP BY hostel_id", [orgId]),
        queryRows<any>('SELECT hostel_id, COALESCE(SUM(amount), 0)::numeric as total FROM expenses WHERE organization_id = $1 GROUP BY hostel_id', [orgId]),
      ]);

      const bedsMap: Record<string, { total: number; occupied: number }> = {};
      bedsAgg.forEach((r) => {
        if (!bedsMap[r.hostel_id]) bedsMap[r.hostel_id] = { total: 0, occupied: 0 };
        const c = Number(r.count || 0);
        bedsMap[r.hostel_id].total += c;
        if (r.status === 'OCCUPIED') bedsMap[r.hostel_id].occupied += c;
      });

      const revMap: Record<string, number> = {};
      revAgg.forEach((r) => {
        revMap[r.hostel_id] = Number(r.total || 0);
      });

      const expMap: Record<string, number> = {};
      expAgg.forEach((r) => {
        expMap[r.hostel_id] = Number(r.total || 0);
      });

      return branches.map((b) => {
        const bedInfo = bedsMap[b.id] || { total: 0, occupied: 0 };
        const totalRevenue = revMap[b.id] || 0;
        const totalExpenses = expMap[b.id] || 0;
        const occupancyRate = bedInfo.total > 0 ? Math.round((bedInfo.occupied / bedInfo.total) * 100) : 0;

        return {
          branchId: b.id,
          branchCode: b.branchCode,
          branchName: b.name,
          city: b.city,
          totalBeds: bedInfo.total,
          occupiedBeds: bedInfo.occupied,
          occupancyRate,
          totalRevenue,
          totalExpenses,
          netProfit: totalRevenue - totalExpenses,
          status: b.status,
        };
      });
    });
  }

  async getKpis(orgId: string, branchId?: string) {
    return this.getStats(orgId, branchId);
  }
}

export const dashboardService = new DashboardService();
