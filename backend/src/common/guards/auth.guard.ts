import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../filters/http-exception.filter';
import { queryOne } from '../../config/database';
import { CURRENT_TERMS_VERSION } from '../../modules/terms/terms.constants';

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
  termsAccepted?: boolean;
  acceptedTermsVersion?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function isTermsExemptPath(urlPath: string): boolean {
  if (!urlPath) return false;
  const cleanPath = urlPath.split('?')[0].toLowerCase().replace(/^\/api/, '');
  const exemptRoutes = [
    '/auth/me',
    '/auth/terms',
    '/auth/terms/accept',
    '/auth/logout',
    '/auth/change-password',
    '/terms',
    '/terms/accept',
    '/terms/status',
    '/health',
  ];
  return exemptRoutes.some((route) => cleanPath === route || cleanPath.startsWith(route + '/'));
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && typeof req.query.token === 'string' && req.query.token.trim()) {
    token = req.query.token.trim();
  }

  if (!token) {
    return next(new AppError('Authentication required. Missing Bearer token.', 401));
  }

  try {
    const secret = process.env.JWT_SECRET || 'ihms-super-secret-jwt-key-production-2026';
    const decoded = jwt.verify(token, secret) as AuthenticatedUser;
    req.user = decoded;

    // Enforce Terms & Conditions Acceptance on non-exempt routes
    const requestPath = req.originalUrl || req.baseUrl + req.path || req.url || req.path || '';
    if (!isTermsExemptPath(requestPath) && decoded.id) {
      const userRecord = await queryOne<any>(
        'SELECT terms_accepted, accepted_terms_version FROM users WHERE id = $1',
        [decoded.id]
      );
      if (
        !userRecord ||
        !userRecord.terms_accepted ||
        userRecord.accepted_terms_version !== CURRENT_TERMS_VERSION
      ) {
        const err = new AppError(
          'You must review and accept the latest Terms & Conditions before accessing this platform.',
          403,
          { code: 'TERMS_ACCEPTANCE_REQUIRED', currentVersion: CURRENT_TERMS_VERSION }
        );
        (err as any).code = 'TERMS_ACCEPTANCE_REQUIRED';
        return next(err);
      }
    }

    next();
  } catch (err: any) {
    if (err instanceof AppError) return next(err);
    return next(new AppError('Invalid or expired authentication token.', 401));
  }
}

export async function ensureTermsAccepted(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new AppError('Authentication required. Please sign in.', 401));
  }
  const userRecord = await queryOne<any>(
    'SELECT terms_accepted, accepted_terms_version FROM users WHERE id = $1',
    [req.user.id]
  );
  if (
    !userRecord ||
    !userRecord.terms_accepted ||
    userRecord.accepted_terms_version !== CURRENT_TERMS_VERSION
  ) {
    const err = new AppError(
      'You must review and accept the latest Terms & Conditions before accessing this platform.',
      403,
      { code: 'TERMS_ACCEPTANCE_REQUIRED', currentVersion: CURRENT_TERMS_VERSION }
    );
    (err as any).code = 'TERMS_ACCEPTANCE_REQUIRED';
    return next(err);
  }
  next();
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
