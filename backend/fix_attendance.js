const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

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

    const operations: any[] = records.map((r) => ({
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