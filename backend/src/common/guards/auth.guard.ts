import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../filters/http-exception.filter';

export interface AuthenticatedUser {
  id: string;
  userId?: string;
  organizationId: string;
  branchId?: string;
  studentId?: string;
  role: string;
  rawRole?: string;
  email: string;
  name: string;
  customerCode?: string;
  staffCode?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required. Missing Bearer token.', 401));
  }

  const token = authHeader.split(' ')[1];
  try {
    const secret = process.env.JWT_SECRET || 'ihms-super-secret-jwt-key-production-2026';
    const decoded = jwt.verify(token, secret) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (err: any) {
    return next(new AppError('Invalid or expired authentication token.', 401));
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Authentication required. Please sign in.', 401));
    const userRole = req.user.role;
    const rawRole = req.user.rawRole;

    const normalizedAllowed = roles.flatMap((r) => {
      if (r === 'OWNER') return ['OWNER', 'ORGANIZATION_OWNER'];
      if (r === 'SUPER_ADMIN') return ['SUPER_ADMIN', 'PLATFORM_SUPER_ADMIN'];
      return [r];
    });

    if (
      !normalizedAllowed.includes(userRole) &&
      (!rawRole || !normalizedAllowed.includes(rawRole))
    ) {
      return next(new AppError('You do not have permission to access this resource.', 403));
    }
    next();
  };
}

export const requireRoles = authorize;
export const requireOwnerOrAdmin = () => authorize('OWNER', 'SUPER_ADMIN', 'ORGANIZATION_OWNER');
export const requireStudent = () => authorize('STUDENT');
export const authGuard = authenticate;
