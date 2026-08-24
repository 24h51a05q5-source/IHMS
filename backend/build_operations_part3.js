const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

// ==========================================
// VISITORS MODULE
// ==========================================
write('src/modules/visitors/visitor.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';
import { VisitorStatus } from '../../config/constants';

export interface IVisitor extends Document {
  visitorPassNumber: string; // HYD001-VIS-000101
  organizationId: string;
  branchId: string;
  visitorName: string;
  phone: string;
  studentId: string;
  customerCode: string;
  studentName: string;
  purpose: string;
  idProofNumber?: string;
  photoUrl?: string;
  status: VisitorStatus;
  checkInTime: Date;
  checkOutTime?: Date;
  qrPayload?: string;
  securityGuardName: string;
  createdAt: Date;
}

const VisitorSchema = new Schema<IVisitor>({
  visitorPassNumber: { type: String, required: true },
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  visitorName: { type: String, required: true },
  phone: { type: String, required: true },
  studentId: { type: String, required: true },
  customerCode: { type: String, required: true },
  studentName: { type: String, required: true },
  purpose: { type: String, default: 'Meeting Student' },
  idProofNumber: { type: String },
  photoUrl: { type: String },
  status: { type: String, enum: Object.values(VisitorStatus), default: VisitorStatus.INSIDE, index: true },
  checkInTime: { type: Date, default: Date.now },
  checkOutTime: { type: Date },
  qrPayload: { type: String },
  securityGuardName: { type: String, default: 'Security' },
}, { timestamps: true });

VisitorSchema.index({ organizationId: 1, visitorPassNumber: 1 }, { unique: true });

export const VisitorModel = mongoose.model<IVisitor>('Visitor', VisitorSchema);
`);

write('src/modules/visitors/visitor.service.ts', `
import { VisitorModel, IVisitor } from './visitor.schema';
import { StudentModel } from '../students/student.schema';
import { HostelBranchModel } from '../hostels/hostel.schema';
import { AppError } from '../../common/filters/http-exception.filter';
import { generateVisitorPassNumber } from '../../common/utils/code-generator';
import { generateQrDataUrl } from '../../common/utils/qr-generator';
import { VisitorStatus } from '../../config/constants';
import { emitRealTimeEvent } from '../../events/events.gateway';

export class VisitorService {
  async registerVisitor(orgId: string, branchId: string, data: any): Promise<IVisitor> {
    const student = await StudentModel.findOne({ organizationId: orgId, customerCode: data.customerCode });
    if (!student) throw new AppError('Student not found with this customer code', 404);

    const branch = await HostelBranchModel.findById(branchId);
    const hostelCode = branch?.branchCode || 'HYD001';

    const visitorPassNumber = await generateVisitorPassNumber(orgId, hostelCode);
    const qrPayload = await generateQrDataUrl({
      visitorPassNumber,
      visitorName: data.visitorName,
      studentName: student.fullName,
      customerCode: student.customerCode,
      checkInTime: new Date(),
    });

    const visitor = await VisitorModel.create({
      visitorPassNumber,
      organizationId: orgId,
      branchId,
      visitorName: data.visitorName,
      phone: data.phone,
      studentId: student._id.toString(),
      customerCode: student.customerCode,
      studentName: student.fullName,
      purpose: data.purpose || 'Meeting Student',
      idProofNumber: data.idProofNumber,
      status: VisitorStatus.INSIDE,
      checkInTime: new Date(),
      qrPayload,
      securityGuardName: data.securityGuardName || 'Security Staff',
    });

    emitRealTimeEvent('visitor.checked_in', {
      visitorPassNumber,
      visitorName: visitor.visitorName,
      studentName: student.fullName,
      branchId,
    }, { branchId });

    return visitor;
  }

  async checkOutVisitor(orgId: string, visitorId: string): Promise<IVisitor> {
    const visitor = await VisitorModel.findOne({ _id: visitorId, organizationId: orgId });
    if (!visitor) throw new AppError('Visitor record not found', 404);

    visitor.status = VisitorStatus.EXITED;
    visitor.checkOutTime = new Date();
    await visitor.save();

    emitRealTimeEvent('visitor.checked_out', {
      visitorPassNumber: visitor.visitorPassNumber,
      visitorName: visitor.visitorName,
      branchId: visitor.branchId,
    }, { branchId: visitor.branchId });

    return visitor;
  }

  async listVisitors(orgId: string, branchId?: string, status?: string) {
    const query: any = { organizationId: orgId };
    if (branchId) query.branchId = branchId;
    if (status) query.status = status;
    return VisitorModel.find(query).sort({ checkInTime: -1 });
  }

  async verifyPass(orgId: string, passNumber: string) {
    const visitor = await VisitorModel.findOne({ organizationId: orgId, visitorPassNumber: passNumber });
    if (!visitor) throw new AppError('Invalid Visitor Pass Number', 404);
    return visitor;
  }
}
export const visitorService = new VisitorService();
`);

write('src/modules/visitors/visitor.controller.ts', `
import { Router, Request, Response, NextFunction } from 'express';
import { visitorService } from './visitor.service';
import { authenticate } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';
import { authorizeRoles } from '../../common/guards/roles.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate, enforceTenantIsolation);

router.post('/', authorizeRoles(UserRole.OWNER, UserRole.SECURITY_GUARD, UserRole.RECEPTIONIST, UserRole.WARDEN, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.body.branchId || req.user!.branchId;
    const visitor = await visitorService.registerVisitor(req.user!.organizationId, branchId, {
      ...req.body,
      securityGuardName: req.user!.name,
    });
    res.status(201).json({ success: true, data: visitor, message: \`Visitor Pass \${visitor.visitorPassNumber} generated successfully\` });
  } catch (err) { next(err); }
});

router.patch('/:id/checkout', authorizeRoles(UserRole.OWNER, UserRole.SECURITY_GUARD, UserRole.RECEPTIONIST, UserRole.WARDEN, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const visitor = await visitorService.checkOutVisitor(req.user!.organizationId, req.params.id);
    res.json({ success: true, data: visitor, message: \`Visitor \${visitor.visitorName} checked out successfully\` });
  } catch (err) { next(err); }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const visitors = await visitorService.listVisitors(req.user!.organizationId, req.query.branchId as string, req.query.status as string);
    res.json({ success: true, data: visitors });
  } catch (err) { next(err); }
});

router.get('/verify/:passNumber', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const visitor = await visitorService.verifyPass(req.user!.organizationId, req.params.passNumber);
    res.json({ success: true, data: visitor });
  } catch (err) { next(err); }
});

export const visitorRouter = router;
`);

// ==========================================
// COMPLAINTS & MAINTENANCE MODULE
// ==========================================
write('src/modules/complaints/complaint.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';
import { ComplaintPriority, ComplaintStatus } from '../../config/constants';

export interface IComplaint extends Document {
  complaintNumber: string; // HYD001-CMP-000054
  organizationId: string;
  branchId: string;
  studentId: string;
  customerCode: string;
  studentName: string;
  roomCode: string;
  category: 'PLUMBING' | 'ELECTRICAL' | 'CARPENTRY' | 'CLEANING' | 'INTERNET' | 'MESS' | 'OTHER';
  title: string;
  description: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  assignedStaffId?: string;
  assignedStaffName?: string;
  maintenanceCost: number;
  resolutionNotes?: string;
  studentRating?: number;
  studentFeedback?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ComplaintSchema = new Schema<IComplaint>({
  complaintNumber: { type: String, required: true },
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  studentId: { type: String, required: true, index: true },
  customerCode: { type: String, required: true },
  studentName: { type: String, required: true },
  roomCode: { type: String, default: '' },
  category: { type: String, enum: ['PLUMBING', 'ELECTRICAL', 'CARPENTRY', 'CLEANING', 'INTERNET', 'MESS', 'OTHER'], default: 'OTHER' },
  title: { type: String, required: true },
  description: { type: String, required: true },
  priority: { type: String, enum: Object.values(ComplaintPriority), default: ComplaintPriority.MEDIUM },
  status: { type: String, enum: Object.values(ComplaintStatus), default: ComplaintStatus.OPEN, index: true },
  assignedStaffId: { type: String },
  assignedStaffName: { type: String },
  maintenanceCost: { type: Number, default: 0 },
  resolutionNotes: { type: String },
  studentRating: { type: Number },
  studentFeedback: { type: String },
  resolvedAt: { type: Date },
}, { timestamps: true });

ComplaintSchema.index({ organizationId: 1, complaintNumber: 1 }, { unique: true });

export const ComplaintModel = mongoose.model<IComplaint>('Complaint', ComplaintSchema);
`);

write('src/modules/complaints/complaint.service.ts', `
import { ComplaintModel, IComplaint } from './complaint.schema';
import { StudentModel } from '../students/student.schema';
import { HostelBranchModel } from '../hostels/hostel.schema';
import { AppError } from '../../common/filters/http-exception.filter';
import { generateComplaintNumber } from '../../common/utils/code-generator';
import { ComplaintPriority, ComplaintStatus } from '../../config/constants';
import { emitRealTimeEvent } from '../../events/events.gateway';

export class ComplaintService {
  async createComplaint(orgId: string, data: any): Promise<IComplaint> {
    const student = await StudentModel.findOne({ _id: data.studentId, organizationId: orgId });
    if (!student) throw new AppError('Student not found', 404);

    const branch = await HostelBranchModel.findById(student.branchId);
    const hostelCode = branch?.branchCode || 'HYD001';

    const complaintNumber = await generateComplaintNumber(orgId, hostelCode);

    const complaint = await ComplaintModel.create({
      complaintNumber,
      organizationId: orgId,
      branchId: student.branchId,
      studentId: student._id.toString(),
      customerCode: student.customerCode,
      studentName: student.fullName,
      roomCode: student.currentAssignment?.roomCode || '',
      category: data.category || 'OTHER',
      title: data.title,
      description: data.description,
      priority: data.priority || ComplaintPriority.MEDIUM,
      status: ComplaintStatus.OPEN,
    });

    emitRealTimeEvent('complaint.created', {
      complaintNumber,
      title: complaint.title,
      category: complaint.category,
      roomCode: complaint.roomCode,
      branchId: complaint.branchId,
    }, { branchId: complaint.branchId });

    emitRealTimeEvent('dashboard.kpi_updated', { orgId }, { orgId });

    return complaint;
  }

  async assignStaff(orgId: string, complaintId: string, staffId: string, staffName: string): Promise<IComplaint> {
    const complaint = await ComplaintModel.findOneAndUpdate(
      { _id: complaintId, organizationId: orgId },
      {
        assignedStaffId: staffId,
        assignedStaffName: staffName,
        status: ComplaintStatus.IN_PROGRESS,
      },
      { new: true }
    );
    if (!complaint) throw new AppError('Complaint not found', 404);

    emitRealTimeEvent('complaint.updated', {
      complaintNumber: complaint.complaintNumber,
      status: complaint.status,
      assignedStaffName: complaint.assignedStaffName,
    }, { branchId: complaint.branchId });

    return complaint;
  }

  async resolveComplaint(orgId: string, complaintId: string, data: { resolutionNotes: string; maintenanceCost?: number }): Promise<IComplaint> {
    const complaint = await ComplaintModel.findOneAndUpdate(
      { _id: complaintId, organizationId: orgId },
      {
        resolutionNotes: data.resolutionNotes,
        maintenanceCost: Number(data.maintenanceCost) || 0,
        status: ComplaintStatus.RESOLVED,
        resolvedAt: new Date(),
      },
      { new: true }
    );
    if (!complaint) throw new AppError('Complaint not found', 404);

    emitRealTimeEvent('complaint.resolved', {
      complaintNumber: complaint.complaintNumber,
      status: ComplaintStatus.RESOLVED,
    }, { branchId: complaint.branchId });

    emitRealTimeEvent('dashboard.kpi_updated', { orgId }, { orgId });

    return complaint;
  }

  async listComplaints(orgId: string, branchId?: string, status?: string, studentId?: string) {
    const query: any = { organizationId: orgId };
    if (branchId) query.branchId = branchId;
    if (status) query.status = status;
    if (studentId) query.studentId = studentId;
    return ComplaintModel.find(query).sort({ createdAt: -1 });
  }
}
export const complaintService = new ComplaintService();
`);

write('src/modules/complaints/complaint.controller.ts', `
import { Router, Request, Response, NextFunction } from 'express';
import { complaintService } from './complaint.service';
import { StudentModel } from '../students/student.schema';
import { authenticate } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';
import { authorizeRoles } from '../../common/guards/roles.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate, enforceTenantIsolation);

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let studentId = req.body.studentId;
    if (req.user!.role === UserRole.STUDENT) {
      const student = await StudentModel.findOne({ customerCode: req.user!.customerCode, organizationId: req.user!.organizationId });
      if (!student) return res.status(404).json({ success: false, message: 'Student record not found' });
      studentId = student._id.toString();
    }

    const complaint = await complaintService.createComplaint(req.user!.organizationId, { ...req.body, studentId });
    res.status(201).json({ success: true, data: complaint, message: \`Complaint ticket \${complaint.complaintNumber} created successfully\` });
  } catch (err) { next(err); }
});

router.patch('/:id/assign', authorizeRoles(UserRole.OWNER, UserRole.WARDEN, UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const complaint = await complaintService.assignStaff(req.user!.organizationId, req.params.id, req.body.staffId, req.body.staffName);
    res.json({ success: true, data: complaint, message: 'Complaint assigned to staff' });
  } catch (err) { next(err); }
});

router.patch('/:id/resolve', authorizeRoles(UserRole.OWNER, UserRole.WARDEN, UserRole.MAINTENANCE_STAFF, UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const complaint = await complaintService.resolveComplaint(req.user!.organizationId, req.params.id, req.body);
    res.json({ success: true, data: complaint, message: \`Complaint \${complaint.complaintNumber} marked as RESOLVED\` });
  } catch (err) { next(err); }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let studentId = req.query.studentId as string;
    if (req.user!.role === UserRole.STUDENT) {
      const student = await StudentModel.findOne({ customerCode: req.user!.customerCode, organizationId: req.user!.organizationId });
      studentId = student?._id.toString();
    }

    const complaints = await complaintService.listComplaints(
      req.user!.organizationId,
      req.query.branchId as string,
      req.query.status as string,
      studentId
    );
    res.json({ success: true, data: complaints });
  } catch (err) { next(err); }
});

export const complaintRouter = router;
`);

// ==========================================
// AUDIT LOGS & NOTIFICATIONS MODULE
// ==========================================
write('src/modules/audit/audit-log.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  organizationId: string;
  branchId?: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String },
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  userRole: { type: String, required: true },
  action: { type: String, required: true },
  entity: { type: String, required: true },
  entityId: { type: String },
  details: { type: String },
  ipAddress: { type: String },
  timestamp: { type: Date, default: Date.now },
});

AuditLogSchema.index({ organizationId: 1, timestamp: -1 });

export const AuditLogModel = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
`);

write('src/modules/notifications/notification.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  organizationId: string;
  branchId?: string;
  userId?: string;
  role?: string;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT';
  read: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String },
  userId: { type: String, index: true },
  role: { type: String },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['INFO', 'SUCCESS', 'WARNING', 'ALERT'], default: 'INFO' },
  read: { type: Boolean, default: false },
}, { timestamps: true });

export const NotificationModel = mongoose.model<INotification>('Notification', NotificationSchema);
`);