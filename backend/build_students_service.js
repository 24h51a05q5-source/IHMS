const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

write('src/modules/students/student.service.ts', `
import bcrypt from 'bcryptjs';
import { StudentModel, IStudent } from './student.schema';
import { StudentTransferModel } from './student-transfer.schema';
import { HostelBranchModel } from '../hostels/hostel.schema';
import { BedModel } from '../rooms/bed.schema';
import { RoomModel } from '../rooms/room.schema';
import { UserModel } from '../users/user.schema';
import { FeeDemandModel } from '../fees/fee-demand.schema';
import { AppError } from '../../common/filters/http-exception.filter';
import { generateStudentCustomerCode } from '../../common/utils/code-generator';
import { BedStatus, StudentStatus, UserRole } from '../../config/constants';
import { emitRealTimeEvent } from '../../events/events.gateway';

export class StudentService {
  async admitStudent(orgId: string, branchId: string, data: any): Promise<IStudent> {
    const branch = await HostelBranchModel.findOne({ _id: branchId, organizationId: orgId });
    if (!branch) throw new AppError('Hostel branch not found', 404);

    const bed = await BedModel.findOne({ _id: data.bedId, organizationId: orgId, branchId });
    if (!bed) throw new AppError('Specified Bed does not exist', 404);
    if (bed.status !== BedStatus.AVAILABLE) {
      throw new AppError(\`Bed '\${bed.bedCode}' is already \${bed.status}. Please select an available bed.\`, 400);
    }

    const room = await RoomModel.findById(bed.roomId);
    if (!room) throw new AppError('Room not found', 404);

    const customerCode = await generateStudentCustomerCode(orgId, branch.branchCode);

    let user = await UserModel.findOne({ email: data.email.toLowerCase() });
    if (!user) {
      const passwordHash = await bcrypt.hash(data.password || 'Student@123', 10);
      user = await UserModel.create({
        organizationId: orgId,
        branchId,
        name: data.fullName,
        email: data.email.toLowerCase(),
        passwordHash,
        role: UserRole.STUDENT,
        phone: data.phone,
        customerCode,
        status: 'ACTIVE',
      });
    }

    const monthlyRent = bed.monthlyRate || room.monthlyRate || 6000;
    const admissionFee = Number(data.admissionFee) || 1000;
    const securityDeposit = Number(data.securityDeposit) || 5000;
    const firstMonthTotal = monthlyRent + admissionFee + securityDeposit;

    const student = await StudentModel.create({
      organizationId: orgId,
      branchId,
      customerCode,
      userId: user._id.toString(),
      fullName: data.fullName,
      email: data.email.toLowerCase(),
      phone: data.phone,
      gender: data.gender || 'MALE',
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      bloodGroup: data.bloodGroup,
      aadharNumber: data.aadharNumber,
      collegeOrCompany: data.collegeOrCompany || '',
      courseOrDesignation: data.courseOrDesignation || '',
      guardian: {
        name: data.guardianName || 'Guardian',
        relation: data.guardianRelation || 'Parent',
        phone: data.guardianPhone || data.phone,
        email: data.guardianEmail,
        address: data.guardianAddress,
      },
      currentAssignment: {
        branchId,
        hostelCode: branch.branchCode,
        buildingName: room.buildingName,
        roomId: room._id.toString(),
        roomCode: room.roomCode,
        bedId: bed._id.toString(),
        bedCode: bed.bedCode,
        monthlyRent,
        allocatedAt: new Date(),
      },
      financialSummary: {
        totalDemanded: firstMonthTotal,
        totalPaid: 0,
        outstandingBalance: firstMonthTotal,
      },
      status: StudentStatus.ACTIVE,
      admissionDate: new Date(),
    });

    bed.status = BedStatus.OCCUPIED;
    bed.currentStudentId = student._id.toString();
    bed.currentCustomerCode = customerCode;
    bed.currentStudentName = student.fullName;
    bed.allocatedAt = new Date();
    await bed.save();

    const demandNumber = 'DEM-' + Date.now();
    await FeeDemandModel.create({
      demandNumber,
      organizationId: orgId,
      branchId,
      studentId: student._id.toString(),
      customerCode,
      academicPeriod: new Date().getFullYear().toString(),
      termName: 'Admission & 1st Month Fee',
      breakdown: {
        hostelRent: monthlyRent,
        messFee: 0,
        admissionFee,
        securityDeposit,
        laundryFee: 0,
        otherCharges: 0,
      },
      totalAmount: firstMonthTotal,
      paidAmount: 0,
      balanceAmount: firstMonthTotal,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'UNPAID',
    });

    emitRealTimeEvent('bed.status_changed', { bedId: bed._id, bedCode: bed.bedCode, status: BedStatus.OCCUPIED, branchId }, { branchId });
    emitRealTimeEvent('student.admitted', { studentId: student._id, customerCode, name: student.fullName, branchId }, { branchId });
    emitRealTimeEvent('dashboard.kpi_updated', { orgId, branchId }, { orgId });

    return student;
  }

  async transferStudent(orgId: string, studentId: string, data: { targetBranchId: string; targetBedId: string; reason: string; approvedBy: string }) {
    const student = await StudentModel.findOne({ _id: studentId, organizationId: orgId });
    if (!student) throw new AppError('Student not found', 404);

    const oldBedId = student.currentAssignment?.bedId;
    const oldBedCode = student.currentAssignment?.bedCode || 'N/A';
    const fromBranchId = student.branchId;

    const targetBed = await BedModel.findOne({ _id: data.targetBedId, organizationId: orgId, branchId: data.targetBranchId });
    if (!targetBed) throw new AppError('Destination bed not found', 404);
    if (targetBed.status !== BedStatus.AVAILABLE) {
      throw new AppError(\`Target bed '\${targetBed.bedCode}' is \${targetBed.status}. Must be AVAILABLE.\`, 400);
    }

    const targetRoom = await RoomModel.findById(targetBed.roomId);
    if (!targetRoom) throw new AppError('Target room not found', 404);

    const targetBranch = await HostelBranchModel.findById(data.targetBranchId);
    if (!targetBranch) throw new AppError('Target branch not found', 404);

    if (oldBedId) {
      await BedModel.findByIdAndUpdate(oldBedId, {
        status: BedStatus.AVAILABLE,
        $unset: { currentStudentId: 1, currentCustomerCode: 1, currentStudentName: 1, allocatedAt: 1 }
      });
      emitRealTimeEvent('bed.status_changed', { bedId: oldBedId, bedCode: oldBedCode, status: BedStatus.AVAILABLE, branchId: fromBranchId }, { branchId: fromBranchId });
    }

    targetBed.status = BedStatus.OCCUPIED;
    targetBed.currentStudentId = student._id.toString();
    targetBed.currentCustomerCode = student.customerCode;
    targetBed.currentStudentName = student.fullName;
    targetBed.allocatedAt = new Date();
    await targetBed.save();
    emitRealTimeEvent('bed.status_changed', { bedId: targetBed._id, bedCode: targetBed.bedCode, status: BedStatus.OCCUPIED, branchId: data.targetBranchId }, { branchId: data.targetBranchId });

    await StudentTransferModel.create({
      organizationId: orgId,
      studentId: student._id.toString(),
      customerCode: student.customerCode,
      studentName: student.fullName,
      fromBranchId,
      fromBedCode: oldBedCode,
      toBranchId: data.targetBranchId,
      toBedCode: targetBed.bedCode,
      toBedId: targetBed._id.toString(),
      balanceCarriedForward: student.financialSummary.outstandingBalance,
      reason: data.reason || 'Branch transfer',
      approvedBy: data.approvedBy || 'Admin',
      transferDate: new Date(),
      status: 'COMPLETED',
    });

    student.branchId = data.targetBranchId;
    student.currentAssignment = {
      branchId: data.targetBranchId,
      hostelCode: targetBranch.branchCode,
      buildingName: targetRoom.buildingName,
      roomId: targetRoom._id.toString(),
      roomCode: targetRoom.roomCode,
      bedId: targetBed._id.toString(),
      bedCode: targetBed.bedCode,
      monthlyRent: targetBed.monthlyRate || targetRoom.monthlyRate,
      allocatedAt: new Date(),
    };
    await student.save();

    if (student.userId) {
      await UserModel.findByIdAndUpdate(student.userId, { branchId: data.targetBranchId });
    }

    emitRealTimeEvent('student.transferred', { studentId: student._id, customerCode: student.customerCode, targetBranchId: data.targetBranchId }, { orgId });
    emitRealTimeEvent('dashboard.kpi_updated', { orgId }, { orgId });

    return student;
  }

  async list(orgId: string, branchId?: string, search?: string, status?: string): Promise<IStudent[]> {
    const query: any = { organizationId: orgId };
    if (branchId) query.branchId = branchId;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { customerCode: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }
    return StudentModel.find(query).sort({ createdAt: -1 });
  }

  async getById(orgId: string, id: string): Promise<IStudent> {
    const student = await StudentModel.findOne({ _id: id, organizationId: orgId });
    if (!student) throw new AppError('Student not found', 404);
    return student;
  }

  async getByCustomerCode(orgId: string, code: string): Promise<IStudent> {
    const student = await StudentModel.findOne({ customerCode: code, organizationId: orgId });
    if (!student) throw new AppError('Student not found with this customer code', 404);
    return student;
  }

  async getTransfers(orgId: string, studentId: string): Promise<any[]> {
    return StudentTransferModel.find({ organizationId: orgId, studentId }).sort({ transferDate: -1 });
  }
}
export const studentService = new StudentService();
`);

write('src/modules/students/student.controller.ts', `
import { Router, Request, Response, NextFunction } from 'express';
import { studentService } from './student.service';
import { authenticate } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';
import { authorizeRoles } from '../../common/guards/roles.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate, enforceTenantIsolation);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId, search, status } = req.query;
    const students = await studentService.list(req.user!.organizationId, branchId as string, search as string, status as string);
    res.json({ success: true, data: students });
  } catch (err) { next(err); }
});

router.post('/admit', authorizeRoles(UserRole.OWNER, UserRole.BRANCH_MANAGER, UserRole.WARDEN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.body.branchId || req.user!.branchId;
    if (!branchId) return res.status(400).json({ success: false, message: 'branchId is required' });

    const student = await studentService.admitStudent(req.user!.organizationId, branchId, req.body);
    res.status(201).json({ success: true, data: student, message: \`Student admitted successfully with Customer Code \${student.customerCode}\` });
  } catch (err) { next(err); }
});

router.get('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === UserRole.STUDENT) {
      const student = await studentService.getByCustomerCode(req.user!.organizationId, req.user!.customerCode!);
      return res.json({ success: true, data: student });
    }
    res.status(400).json({ success: false, message: 'Only students can access own profile directly' });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await studentService.getById(req.user!.organizationId, req.params.id);
    res.json({ success: true, data: student });
  } catch (err) { next(err); }
});

router.post('/:id/transfer', authorizeRoles(UserRole.OWNER, UserRole.BRANCH_MANAGER, UserRole.WARDEN, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await studentService.transferStudent(req.user!.organizationId, req.params.id, {
      ...req.body,
      approvedBy: req.user!.name,
    });
    res.json({ success: true, data: result, message: 'Student transferred successfully to destination hostel' });
  } catch (err) { next(err); }
});

router.get('/:id/transfers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const history = await studentService.getTransfers(req.user!.organizationId, req.params.id);
    res.json({ success: true, data: history });
  } catch (err) { next(err); }
});

export const studentRouter = router;
`);