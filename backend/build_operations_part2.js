const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

// ==========================================
// ATTENDANCE & LEAVE MODULE
// ==========================================
write('src/modules/attendance/attendance.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';

export interface IAttendance extends Document {
  organizationId: string;
  branchId: string;
  studentId: string;
  customerCode: string;
  studentName: string;
  roomCode: string;
  bedCode: string;
  date: Date;
  status: 'PRESENT' | 'ABSENT' | 'ON_LEAVE';
  type: 'NIGHT_CHECK' | 'QR_SCAN' | 'MANUAL';
  markedBy: string;
  createdAt: Date;
}

const AttendanceSchema = new Schema<IAttendance>({
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  studentId: { type: String, required: true, index: true },
  customerCode: { type: String, required: true },
  studentName: { type: String, required: true },
  roomCode: { type: String, default: '' },
  bedCode: { type: String, default: '' },
  date: { type: Date, required: true },
  status: { type: String, enum: ['PRESENT', 'ABSENT', 'ON_LEAVE'], default: 'PRESENT' },
  type: { type: String, enum: ['NIGHT_CHECK', 'QR_SCAN', 'MANUAL'], default: 'NIGHT_CHECK' },
  markedBy: { type: String, default: 'Warden' },
}, { timestamps: true });

AttendanceSchema.index({ organizationId: 1, branchId: 1, date: 1 });

export const AttendanceModel = mongoose.model<IAttendance>('Attendance', AttendanceSchema);
`);

write('src/modules/attendance/leave.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';
import { LeaveStatus } from '../../config/constants';

export interface ILeaveRequest extends Document {
  leaveNumber: string; // LVR-2026-000001
  organizationId: string;
  branchId: string;
  studentId: string;
  customerCode: string;
  studentName: string;
  roomCode: string;
  startDate: Date;
  endDate: Date;
  reason: string;
  destinationAddress: string;
  parentContact: string;
  parentApproval: 'APPROVED' | 'PENDING' | 'REJECTED';
  wardenApproval: 'APPROVED' | 'PENDING' | 'REJECTED';
  status: LeaveStatus;
  gatePassCode?: string;
  gatePassQr?: string;
  actualOutTime?: Date;
  actualInTime?: Date;
  reviewedBy?: string;
  createdAt: Date;
}

const LeaveRequestSchema = new Schema<ILeaveRequest>({
  leaveNumber: { type: String, required: true },
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  studentId: { type: String, required: true, index: true },
  customerCode: { type: String, required: true, index: true },
  studentName: { type: String, required: true },
  roomCode: { type: String, default: '' },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String, required: true },
  destinationAddress: { type: String, default: '' },
  parentContact: { type: String, default: '' },
  parentApproval: { type: String, enum: ['APPROVED', 'PENDING', 'REJECTED'], default: 'APPROVED' },
  wardenApproval: { type: String, enum: ['APPROVED', 'PENDING', 'REJECTED'], default: 'PENDING' },
  status: { type: String, enum: Object.values(LeaveStatus), default: LeaveStatus.PENDING, index: true },
  gatePassCode: { type: String },
  gatePassQr: { type: String },
  actualOutTime: { type: Date },
  actualInTime: { type: Date },
  reviewedBy: { type: String },
}, { timestamps: true });

LeaveRequestSchema.index({ organizationId: 1, leaveNumber: 1 }, { unique: true });

export const LeaveRequestModel = mongoose.model<ILeaveRequest>('LeaveRequest', LeaveRequestSchema);
`);

write('src/modules/attendance/attendance.service.ts', `
import { AttendanceModel } from './attendance.schema';
import { LeaveRequestModel, ILeaveRequest } from './leave.schema';
import { StudentModel } from '../students/student.schema';
import { AppError } from '../../common/filters/http-exception.filter';
import { generateLeaveNumber } from '../../common/utils/code-generator';
import { generateQrDataUrl } from '../../common/utils/qr-generator';
import { LeaveStatus } from '../../config/constants';
import { emitRealTimeEvent } from '../../events/events.gateway';

export class AttendanceService {
  async markBatchAttendance(orgId: string, branchId: string, records: any[], markedBy: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const operations = records.map((r) => ({
      updateOne: {
        filter: { organizationId: orgId, branchId, studentId: r.studentId, date: today },
        update: {
          $set: {
            customerCode: r.customerCode,
            studentName: r.studentName,
            roomCode: r.roomCode || '',
            bedCode: r.bedCode || '',
            status: r.status || 'PRESENT',
            type: 'NIGHT_CHECK',
            markedBy,
          }
        },
        upsert: true,
      }
    }));

    await AttendanceModel.bulkWrite(operations);
    emitRealTimeEvent('attendance.updated', { branchId, date: today }, { branchId });
    return { success: true, count: records.length };
  }

  async getAttendanceReport(orgId: string, branchId: string, dateStr?: string) {
    const date = dateStr ? new Date(dateStr) : new Date();
    date.setHours(0, 0, 0, 0);

    return AttendanceModel.find({ organizationId: orgId, branchId, date });
  }

  async applyLeave(orgId: string, data: any): Promise<ILeaveRequest> {
    const student = await StudentModel.findOne({ _id: data.studentId, organizationId: orgId });
    if (!student) throw new AppError('Student not found', 404);

    const leaveNumber = await generateLeaveNumber(orgId);
    const leave = await LeaveRequestModel.create({
      leaveNumber,
      organizationId: orgId,
      branchId: student.branchId,
      studentId: student._id.toString(),
      customerCode: student.customerCode,
      studentName: student.fullName,
      roomCode: student.currentAssignment?.roomCode || '',
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      reason: data.reason,
      destinationAddress: data.destinationAddress || '',
      parentContact: data.parentContact || student.guardian.phone,
      parentApproval: 'APPROVED',
      wardenApproval: 'PENDING',
      status: LeaveStatus.PENDING,
    });

    emitRealTimeEvent('leave.created', { leaveNumber, customerCode: student.customerCode, studentName: student.fullName, branchId: student.branchId }, { branchId: student.branchId });
    return leave;
  }

  async approveLeave(orgId: string, leaveId: string, status: LeaveStatus, reviewedBy: string): Promise<ILeaveRequest> {
    const leave = await LeaveRequestModel.findOne({ _id: leaveId, organizationId: orgId });
    if (!leave) throw new AppError('Leave request not found', 404);

    leave.status = status;
    leave.wardenApproval = status === LeaveStatus.APPROVED ? 'APPROVED' : 'REJECTED';
    leave.reviewedBy = reviewedBy;

    if (status === LeaveStatus.APPROVED) {
      const gatePassCode = \`GP-\${leave.leaveNumber}\`;
      const gatePassQr = await generateQrDataUrl({
        gatePassCode,
        leaveNumber: leave.leaveNumber,
        customerCode: leave.customerCode,
        studentName: leave.studentName,
        validUntil: leave.endDate,
      });
      leave.gatePassCode = gatePassCode;
      leave.gatePassQr = gatePassQr;
    }

    await leave.save();

    emitRealTimeEvent('leave.status_changed', {
      leaveId: leave._id,
      leaveNumber: leave.leaveNumber,
      status,
      gatePassCode: leave.gatePassCode,
    }, { branchId: leave.branchId });

    return leave;
  }

  async listLeaves(orgId: string, branchId?: string, status?: string, studentId?: string) {
    const query: any = { organizationId: orgId };
    if (branchId) query.branchId = branchId;
    if (status) query.status = status;
    if (studentId) query.studentId = studentId;

    return LeaveRequestModel.find(query).sort({ createdAt: -1 });
  }

  async verifyGatePass(orgId: string, gatePassCode: string, action: 'EXIT' | 'ENTRY') {
    const leave = await LeaveRequestModel.findOne({ organizationId: orgId, gatePassCode });
    if (!leave) throw new AppError('Invalid or expired Gate Pass Code', 404);

    if (action === 'EXIT') {
      leave.actualOutTime = new Date();
    } else {
      leave.actualInTime = new Date();
    }
    await leave.save();

    emitRealTimeEvent('gatepass.verified', { gatePassCode, action, studentName: leave.studentName }, { branchId: leave.branchId });
    return { success: true, leave, action, timestamp: new Date() };
  }
}
export const attendanceService = new AttendanceService();
`);

write('src/modules/attendance/attendance.controller.ts', `
import { Router, Request, Response, NextFunction } from 'express';
import { attendanceService } from './attendance.service';
import { StudentModel } from '../students/student.schema';
import { authenticate } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';
import { authorizeRoles } from '../../common/guards/roles.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate, enforceTenantIsolation);

router.post('/mark', authorizeRoles(UserRole.OWNER, UserRole.WARDEN, UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.body.branchId || req.user!.branchId;
    const result = await attendanceService.markBatchAttendance(req.user!.organizationId, branchId, req.body.records, req.user!.name);
    res.json({ success: true, data: result, message: 'Attendance records saved successfully' });
  } catch (err) { next(err); }
});

router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = (req.query.branchId as string) || req.user!.branchId;
    const records = await attendanceService.getAttendanceReport(req.user!.organizationId, branchId, req.query.date as string);
    res.json({ success: true, data: records });
  } catch (err) { next(err); }
});

router.post('/leave', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let studentId = req.body.studentId;
    if (req.user!.role === UserRole.STUDENT) {
      const student = await StudentModel.findOne({ customerCode: req.user!.customerCode, organizationId: req.user!.organizationId });
      if (!student) return res.status(404).json({ success: false, message: 'Student record not found' });
      studentId = student._id.toString();
    }

    const leave = await attendanceService.applyLeave(req.user!.organizationId, { ...req.body, studentId });
    res.status(201).json({ success: true, data: leave, message: \`Leave request \${leave.leaveNumber} submitted successfully\` });
  } catch (err) { next(err); }
});

router.get('/leave', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let studentId = req.query.studentId as string;
    if (req.user!.role === UserRole.STUDENT) {
      const student = await StudentModel.findOne({ customerCode: req.user!.customerCode, organizationId: req.user!.organizationId });
      studentId = student?._id.toString();
    }

    const leaves = await attendanceService.listLeaves(
      req.user!.organizationId,
      req.query.branchId as string,
      req.query.status as string,
      studentId
    );
    res.json({ success: true, data: leaves });
  } catch (err) { next(err); }
});

router.patch('/leave/:id/approve', authorizeRoles(UserRole.OWNER, UserRole.WARDEN, UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const leave = await attendanceService.approveLeave(req.user!.organizationId, req.params.id, req.body.status, req.user!.name);
    res.json({ success: true, data: leave, message: \`Leave request \${leave.leaveNumber} updated to \${leave.status}\` });
  } catch (err) { next(err); }
});

router.post('/gatepass/verify', authorizeRoles(UserRole.OWNER, UserRole.SECURITY_GUARD, UserRole.WARDEN, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await attendanceService.verifyGatePass(req.user!.organizationId, req.body.gatePassCode, req.body.action || 'EXIT');
    res.json({ success: true, data: result, message: \`Gate pass verified for \${result.action}\` });
  } catch (err) { next(err); }
});

export const attendanceRouter = router;
`);