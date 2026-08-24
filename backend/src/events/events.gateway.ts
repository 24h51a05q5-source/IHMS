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
      console.log(`[Socket] User ${user.email} (${user.role}) connected to real-time stream`);
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
