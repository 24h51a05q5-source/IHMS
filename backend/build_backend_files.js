const fs = require('fs');
const path = require('path');

function writeFile(relPath, content) {
  const fullPath = path.join(__dirname, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log('Created: ' + relPath);
}

// 1. Events Gateway (Socket.IO Real-time)
writeFile('src/events/events.gateway.ts', `
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

let ioInstance: SocketIOServer | null = null;

export function initSocketIO(server: any): SocketIOServer {
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    },
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) {
      return next();
    }
    try {
      const secret = process.env.JWT_SECRET || 'ihms-super-secret-production-key-2026';
      const decoded: any = jwt.verify(token, secret);
      (socket as any).user = decoded;
      next();
    } catch (err) {
      next();
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    if (user) {
      if (user.organizationId) {
        socket.join('org:' + user.organizationId);
      }
      if (user.branchId) {
        socket.join('branch:' + user.branchId);
      }
      if (user.id || user.userId) {
        socket.join('user:' + (user.id || user.userId));
      }
      if (user.role) {
        socket.join('role:' + user.role);
      }
      console.log(\`[Socket] User \${user.email} (\${user.role}) connected to real-time stream\`);
    }

    socket.on('join_room', (room: string) => {
      socket.join(room);
    });

    socket.on('disconnect', () => {
      // Disconnected
    });
  });

  ioInstance = io;
  return io;
}

export function emitRealTimeEvent(event: string, payload: any, target?: { orgId?: string; branchId?: string; userId?: string; role?: string }) {
  if (!ioInstance) return;

  if (target?.userId) {
    ioInstance.to('user:' + target.userId).emit(event, payload);
  } else if (target?.branchId) {
    ioInstance.to('branch:' + target.branchId).emit(event, payload);
  } else if (target?.orgId) {
    ioInstance.to('org:' + target.orgId).emit(event, payload);
  } else if (target?.role) {
    ioInstance.to('role:' + target.role).emit(event, payload);
  } else {
    ioInstance.emit(event, payload);
  }
}
`);

// 2. Auth Guards & Middlewares
writeFile('src/common/guards/auth.guard.ts', `
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../filters/http-exception.filter';

export interface AuthenticatedUser {
  id: string;
  userId?: string;
  organizationId: string;
  branchId?: string;
  role: string;
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
    const secret = process.env.JWT_SECRET || 'ihms-super-secret-production-key-2026';
    const decoded = jwt.verify(token, secret) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (err: any) {
    return next(new AppError('Invalid or expired authentication token.', 401));
  }
}
`);

writeFile('src/common/guards/roles.guard.ts', `
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../filters/http-exception.filter';
import { UserRole } from '../../config/constants';

export function authorizeRoles(...allowedRoles: (UserRole | string)[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Unauthenticated request', 401));
    }

    if (req.user.role === UserRole.SUPER_ADMIN) {
      return next();
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      return next(
        new AppError(
          \`Forbidden: Role '\${req.user.role}' does not have permission to perform this action.\`,
          403
        )
      );
    }

    next();
  };
}
`);

writeFile('src/common/guards/tenant.guard.ts', `
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
`);

console.log('Core guards and events written successfully.');