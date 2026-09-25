import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import crypto from 'crypto';

let ioInstance: SocketIOServer | null = null;
const instanceId = crypto.randomUUID();

// Redis Pub/Sub for multi-instance horizontal scaling (app1, app2, app3)
let redisPublisher: Redis | null = null;
let redisSubscriber: Redis | null = null;

function initRedisPubSub() {
  if (process.env.NODE_ENV === 'test' && !process.env.REDIS_URL && !process.env.REDIS_HOST) {
    return;
  }

  try {
    const redisUrl = process.env.REDIS_URL;
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = Number(process.env.REDIS_PORT || 6379);
    const password = process.env.REDIS_PASSWORD || undefined;

    const redisOpts = {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 100, 1000)),
    };

    redisPublisher = redisUrl ? new Redis(redisUrl, redisOpts) : new Redis({ host, port, password, ...redisOpts });
    redisSubscriber = redisUrl ? new Redis(redisUrl, redisOpts) : new Redis({ host, port, password, ...redisOpts });

    redisPublisher.on('error', () => { /* graceful silent fallback */ });
    redisSubscriber.on('error', () => { /* graceful silent fallback */ });

    redisSubscriber.connect().then(() => {
      redisSubscriber?.subscribe('ihms:socket_events', (err) => {
        if (!err) {
          console.log('[Socket.IO Cluster] Connected and subscribed to Redis event bus.');
        }
      });

      redisSubscriber?.on('message', (_channel, message) => {
        try {
          const data = JSON.parse(message);
          if (data.senderInstanceId !== instanceId) {
            emitLocalEvent(data.event, data.payload, data.target);
          }
        } catch {
          // ignore malformed pub/sub messages
        }
      });
    }).catch(() => {
      // In standalone or test mode without running Redis, gracefully continue with local events
    });

    redisPublisher.connect().catch(() => {});
  } catch {
    // Redis optional fallback
  }
}

function emitLocalEvent(event: string, payload: any, target?: { orgId?: string; branchId?: string; userId?: string; role?: string }) {
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

export function initSocketIO(server: any): SocketIOServer {
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    },
  });

  initRedisPubSub();

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) {
      return next();
    }
    try {
      const secret = process.env.JWT_SECRET || 'ihms-super-secret-jwt-key-production-2026';
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
      if (!user) {
        socket.emit('error', { message: 'Unauthorized: Authentication required to join rooms.' });
        return;
      }
      if (typeof room !== 'string' || !room.trim()) return;
      const targetRoom = room.trim();

      // Enforce tenant, branch, role, and identity boundaries (NEW-007)
      const isAllowed =
        (user.organizationId && targetRoom === 'org:' + user.organizationId) ||
        (user.branchId && targetRoom === 'branch:' + user.branchId) ||
        (user.id && targetRoom === 'user:' + user.id) ||
        (user.userId && targetRoom === 'user:' + user.userId) ||
        (user.studentId && targetRoom === 'user:' + user.studentId) ||
        (user.role && targetRoom === 'role:' + user.role) ||
        (user.rawRole && targetRoom === 'role:' + user.rawRole);

      if (isAllowed) {
        socket.join(targetRoom);
      } else {
        socket.emit('error', { message: `Unauthorized: Cannot join room '${targetRoom}'.` });
      }
    });

    socket.on('disconnect', () => {
      // Disconnected
    });
  });

  ioInstance = io;
  return io;
}

export function emitRealTimeEvent(event: string, payload: any, target?: { orgId?: string; branchId?: string; userId?: string; role?: string }) {
  // 1. Emit to local instance clients
  emitLocalEvent(event, payload, target);

  // 2. Broadcast across multi-instance cluster via Redis if connected (NEW-007)
  if (redisPublisher && redisPublisher.status === 'ready') {
    redisPublisher.publish(
      'ihms:socket_events',
      JSON.stringify({
        senderInstanceId: instanceId,
        event,
        payload,
        target,
      })
    ).catch(() => {});
  }
}
