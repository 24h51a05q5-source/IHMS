import { Request, Response, NextFunction } from 'express';
import { AppError } from '../filters/http-exception.filter';
import { UserRole } from '../../config/constants';

export function authorizeRoles(...allowedRoles: (UserRole | string)[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Unauthenticated request', 401));
    }

    const userRole = req.user.role;
    const rawRole = req.user.rawRole;

    if (
      userRole === 'PLATFORM_SUPER_ADMIN' ||
      userRole === 'SUPER_ADMIN' ||
      rawRole === 'SUPER_ADMIN' ||
      rawRole === UserRole.SUPER_ADMIN
    ) {
      return next();
    }

    const normalizedAllowed = allowedRoles.flatMap((r) => {
      if (r === UserRole.OWNER || r === 'OWNER' || r === 'ORGANIZATION_OWNER') {
        return ['OWNER', 'ORGANIZATION_OWNER'];
      }
      if (r === UserRole.SUPER_ADMIN || r === 'SUPER_ADMIN' || r === 'PLATFORM_SUPER_ADMIN') {
        return ['SUPER_ADMIN', 'PLATFORM_SUPER_ADMIN'];
      }
      return [String(r)];
    });

    if (
      !normalizedAllowed.includes(userRole) &&
      (!rawRole || !normalizedAllowed.includes(rawRole))
    ) {
      return next(
        new AppError(
          'You do not have permission to access this resource.',
          403
        )
      );
    }

    next();
  };
}
