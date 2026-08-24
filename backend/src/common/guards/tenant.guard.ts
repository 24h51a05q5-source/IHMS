import { Request, Response, NextFunction } from 'express';
import { AppError } from '../filters/http-exception.filter';
import { UserRole } from '../../config/constants';

export function enforceTenantIsolation(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new AppError('Unauthenticated request', 401));
  }

  // Super Admin can access cross-org if explicitly provided in query, otherwise filtered by their target
  if (req.user.role === UserRole.SUPER_ADMIN) {
    return next();
  }

  if (!req.user.organizationId) {
    return next(new AppError('Tenant isolation error: User does not belong to any Organization.', 403));
  }

  // Force tenant context on req body/query to prevent client spoofing
  if (req.body && typeof req.body === 'object') {
    req.body.organizationId = req.user.organizationId;
  }
  if (req.query) {
    req.query.organizationId = req.user.organizationId;
  }

  next();
}
