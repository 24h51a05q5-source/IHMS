import { Request, Response, NextFunction } from 'express';
import { AppError } from '../filters/http-exception.filter';
import { queryOne } from '../../config/database';

/**
 * Hostel Active Verification Middleware
 * Failsafe check to prevent payment or QR order creation for deactivated or suspended hostels.
 */
export async function verifyHostelActive(req: Request, res: Response, next: NextFunction) {
  try {
    const orgId = req.user?.organizationId;
    let hostelId = req.body?.hostelId || req.params?.hostelId || (req.query?.hostelId as string);

    // If hostelId is not explicitly sent, resolve it via studentId
    if (!hostelId) {
      const studentId = req.body?.studentId || req.user?.studentId || req.user?.id;
      if (studentId) {
        const student = await queryOne<any>(
          `SELECT hostel_id FROM students WHERE (id = $1 OR user_id = $1 OR customer_code = $1 OR custom_id = $1) ${orgId ? 'AND organization_id = $2' : ''} LIMIT 1`,
          orgId ? [studentId, orgId] : [studentId]
        );
        if (student) {
          hostelId = student.hostel_id;
        }
      }
    }

    if (hostelId) {
      const hostel = await queryOne<any>(
        `SELECT id, status FROM hostels WHERE (id = $1 OR hostel_id = $1) ${orgId ? 'AND organization_id = $2' : ''} LIMIT 1`,
        orgId ? [hostelId, orgId] : [hostelId]
      );

      if (hostel && (hostel.status === 'DEACTIVATED' || hostel.status === 'SUSPENDED' || hostel.status === 'INACTIVE')) {
        return next(new AppError('This hostel is no longer active.', 403));
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}
