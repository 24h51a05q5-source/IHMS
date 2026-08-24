import express, { Application, Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
dotenv.config();

import { connectDatabase, queryOne, pingDatabase, getPoolStats, disconnectDatabase } from './config/database';
import { runSeed } from './seed';
import { initSocketIO } from './events/events.gateway';
import { errorHandler } from './common/filters/http-exception.filter';

import { authRouter } from './modules/auth/auth.controller';
import { authService } from './modules/auth/auth.service';
import { organizationRouter } from './modules/organizations/organization.controller';
import { hostelRouter } from './modules/hostels/hostel.controller';
import { roomRouter } from './modules/rooms/room.controller';
import { studentRouter } from './modules/students/student.controller';
import { studentPortalRouter } from './modules/students/student-portal.controller';
import { feeRouter } from './modules/fees/fee.controller';
import { financeRouter } from './modules/finance/finance.controller';
import { dashboardRouter } from './modules/dashboard/dashboard.controller';
import { messRouter } from './modules/mess/mess.controller';
import { inventoryRouter } from './modules/inventory/inventory.controller';
import { attendanceRouter } from './modules/attendance/attendance.controller';
import { visitorRouter } from './modules/visitors/visitor.controller';
import { complaintRouter } from './modules/complaints/complaint.controller';
import { announcementRouter } from './modules/announcements/announcement.controller';
import { userRouter } from './modules/users/user.controller';
import { supportRouter } from './modules/support/support.controller';

const app: Application = express();
const server = http.createServer(app);

const INSTANCE_ID = process.env.INSTANCE_ID || process.env.HOSTNAME || `instance-${process.env.PORT || '5000'}`;

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-razorpay-signature', 'x-webhook-signature', 'signature'],
}));

// Multi-instance identification header
app.use((req, res, next) => {
  res.setHeader('X-Handled-By', INSTANCE_ID);
  res.setHeader('X-Server-Instance', INSTANCE_ID);
  next();
});

import path from 'path';
import fs from 'fs';

// Ensure upload directories exist
const uploadsDir = path.join(process.cwd(), 'uploads');
const announcementsUploadDir = path.join(uploadsDir, 'announcements');
if (!fs.existsSync(announcementsUploadDir)) {
  fs.mkdirSync(announcementsUploadDir, { recursive: true });
}

app.use(express.json({
  limit: '15mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.use('/uploads', express.static(uploadsDir));
app.use('/api/uploads', express.static(uploadsDir));

initSocketIO(server);

// Comprehensive Health & Readiness Endpoint for Load Balancers
app.get('/api/health', async (req: Request, res: Response) => {
  const dbPing = await pingDatabase();
  const poolStats = getPoolStats();
  const memory = process.memoryUsage();
  
  const isHealthy = dbPing.ok;
  const statusCode = isHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    system: 'Integrated Hostel Management System (IHMS) ERP',
    instanceId: INSTANCE_ID,
    port: process.env.PORT || 5000,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: dbPing.ok ? 'connected' : 'disconnected',
      latencyMs: dbPing.latencyMs,
      pool: poolStats,
      error: dbPing.error,
    },
    memory: {
      rssMb: Math.round(memory.rss / (1024 * 1024)),
      heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
      heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
    },
    version: '1.0.0',
  });
});

// Mount Module Routers
app.use('/api/auth', authRouter);
app.use('/api/organizations', organizationRouter);
app.use('/api/hostels', hostelRouter);
app.use('/api/branches', hostelRouter); // Alias for Lovable /api/branches
app.use('/api/rooms', roomRouter);
app.use('/api/beds', (req, res, next) => {
  req.url = '/beds' + (req.url === '/' ? '' : req.url);
  roomRouter(req, res, next);
});
app.use('/api/students', studentRouter);
app.use('/api/student', studentPortalRouter);
app.use('/api/fees', feeRouter);
app.use('/api/payments', (req, res, next) => {
  req.url = '/payments' + (req.url === '/' ? '' : req.url);
  feeRouter(req, res, next);
});
app.use('/api/finance', financeRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reports', dashboardRouter); // Alias for Lovable /api/reports/...
app.use('/api/mess', messRouter);
app.use('/api/student/mess-menu', (req, res, next) => { req.url = '/student-menu'; messRouter(req, res, next); });
app.use('/api/student/mess', (req, res, next) => { req.url = '/student-menu'; messRouter(req, res, next); });
app.use('/api/inventory', inventoryRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/leave', (req, res, next) => {
  req.url = '/leave' + (req.url === '/' ? '' : req.url);
  attendanceRouter(req, res, next);
});
app.use('/api/visitors', visitorRouter);
app.use('/api/complaints', complaintRouter);
app.use('/api/student/complaints', complaintRouter);
app.use('/api/announcements', announcementRouter);
app.use('/api/student/announcements', (req, res, next) => {
  req.url = '/student' + (req.url === '/' ? '' : req.url);
  announcementRouter(req, res, next);
});
app.use('/api/notifications', (req, res, next) => {
  req.url = '/notifications' + (req.url === '/' ? '' : req.url);
  userRouter(req, res, next);
});
app.use('/api/users', userRouter);
app.use('/api/support', supportRouter);
app.use('/api/student/support', (req, res, next) => {
  req.url = '/tickets' + (req.url === '/' ? '' : req.url);
  supportRouter(req, res, next);
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    await connectDatabase();
    const countRow = await queryOne<{ count: string }>('SELECT count(*) as count FROM organizations');
    const count = parseInt(countRow?.count || '0', 10);
    if (count === 0) {
      console.log('[Bootstrap] Database is empty. Running initial PostgreSQL seed...');
      await runSeed();
    } else {
      await authService.ensureSeedDefaults();
    }

    server.listen(PORT, () => {
      console.log('=======================================================');
      console.log(`  🚀 IHMS ERP BACKEND RUNNING ON http://localhost:${PORT}`);
      console.log(`  🏷️  Instance Identity: ${INSTANCE_ID}`);
      console.log('  📡 Real-time WebSocket Gateway enabled on /socket.io');
      console.log('  🐘 PostgreSQL Multi-tenant Isolation: ACTIVE');
      console.log('=======================================================');
    });

    const shutdown = async (signal: string) => {
      console.log(`\n[Server ${INSTANCE_ID}] Received ${signal}. Starting graceful shutdown...`);
      server.close(async () => {
        console.log(`[Server ${INSTANCE_ID}] HTTP server closed.`);
        await disconnectDatabase();
        process.exit(0);
      });
      setTimeout(() => {
        console.error(`[Server ${INSTANCE_ID}] Force shutdown after timeout.`);
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();

