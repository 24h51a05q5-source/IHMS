import { Request, Response, NextFunction } from 'express';
import { AppError } from '../filters/http-exception.filter';
import { UserRole } from '../../config/constants';

export function enforceTenantIsolation(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new AppError('Unauthenticated request', 401));
  }

  // Super Admin can access cross-org if explicitly provided in query, otherwise filtered by their target
  if (req.user.role === UserRole.SUPER_ADMIN || (req.user.role as any) === 'SUPER_ADMIN') {
    return next();
  }

  if (!req.user.organizationId) {
    return next(new AppError('Tenant isolation error: User does not belong to any Organization.', 403));
  }

  // Cross-organization validation
  const requestedOrg = (req.params?.orgId || req.query?.orgId || (req.body && req.body.orgId)) as string | undefined;
  if (requestedOrg && requestedOrg !== 'ALL' && requestedOrg !== req.user.organizationId) {
    return next(new AppError('Forbidden: Cross-organization data access is strictly prohibited.', 403));
  }

  // Force tenant context on req body/query to prevent client spoofing
  if (req.body && typeof req.body === 'object') {
    req.body.organizationId = req.user.organizationId;
  }
  if (req.query) {
    req.query.organizationId = req.user.organizationId;
  }

  // Multi-Hostel Branch Scoping:
  // Owners / Super Admins can access any branch in their organization.
  // Branch-scoped roles (Warden, Accountant, Security Guard, Mess Manager, Student)
  // must be restricted to their assigned branch if user.branchId is set.
  const isOrgWideRole = req.user.role === UserRole.OWNER ||
                        (req.user.role as any) === 'OWNER' ||
                        (req.user.role as any) === 'ORGANIZATION_OWNER' ||
                        req.user.role === UserRole.SUPER_ADMIN;

  if (!isOrgWideRole && req.user.branchId) {
    const userBranch = req.user.branchId;

    // Check if client provided a branch/hostel ID in params, query, or body
    const paramBranch = (req.params && (req.params.branchId || req.params.hostelId)) as string | undefined;
    const queryBranch = (req.query && (req.query.branchId || req.query.hostelId)) as string | undefined;
    const bodyBranch = (req.body && (req.body.branchId || req.body.hostelId)) as string | undefined;

    if (paramBranch && paramBranch !== 'ALL' && paramBranch !== userBranch) {
      return next(new AppError('Forbidden: You are not authorized to access data for another hostel branch.', 403));
    }
    if (queryBranch && queryBranch !== 'ALL' && queryBranch !== userBranch) {
      return next(new AppError('Forbidden: You are not authorized to access data for another hostel branch.', 403));
    }
    if (bodyBranch && bodyBranch !== userBranch) {
      return next(new AppError('Forbidden: You are not authorized to modify data for another hostel branch.', 403));
    }

    // Force assigned branch scoping
    if (req.query) {
      req.query.branchId = userBranch;
      req.query.hostelId = userBranch;
    }
    if (req.body && typeof req.body === 'object') {
      req.body.branchId = userBranch;
      req.body.hostelId = userBranch;
    }
  }

  next();
}
