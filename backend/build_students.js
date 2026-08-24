const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

write('src/modules/students/student.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';
import { StudentStatus } from '../../config/constants';

export interface IStudent extends Document {
  organizationId: string;
  branchId: string;
  customerCode: string;
  userId?: string;
  fullName: string;
  email: string;
  phone: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  dateOfBirth?: Date;
  bloodGroup?: string;
  aadharNumber?: string;
  collegeOrCompany?: string;
  courseOrDesignation?: string;
  guardian: {
    name: string;
    relation: string;
    phone: string;
    email?: string;
    address?: string;
  };
  currentAssignment?: {
    branchId: string;
    hostelCode: string;
    buildingName: string;
    roomId: string;
    roomCode: string;
    bedId: string;
    bedCode: string;
    monthlyRent: number;
    allocatedAt: Date;
  };
  financialSummary: {
    totalDemanded: number;
    totalPaid: number;
    outstandingBalance: number;
  };
  status: StudentStatus;
  admissionDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudent>({
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  customerCode: { type: String, required: true },
  userId: { type: String },
  fullName: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, required: true },
  gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'], default: 'MALE' },
  dateOfBirth: { type: Date },
  bloodGroup: { type: String },
  aadharNumber: { type: String },
  collegeOrCompany: { type: String, default: '' },
  courseOrDesignation: { type: String, default: '' },
  guardian: {
    name: { type: String, required: true },
    relation: { type: String, default: 'Parent' },
    phone: { type: String, required: true },
    email: { type: String },
    address: { type: String },
  },
  currentAssignment: {
    branchId: { type: String },
    hostelCode: { type: String },
    buildingName: { type: String },
    roomId: { type: String },
    roomCode: { type: String },
    bedId: { type: String },
    bedCode: { type: String },
    monthlyRent: { type: Number, default: 0 },
    allocatedAt: { type: Date },
  },
  financialSummary: {
    totalDemanded: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
  },
  status: { type: String, enum: Object.values(StudentStatus), default: StudentStatus.ACTIVE },
  admissionDate: { type: Date, default: Date.now },
}, { timestamps: true });

StudentSchema.index({ organizationId: 1, customerCode: 1 }, { unique: true });
StudentSchema.index({ organizationId: 1, email: 1 });
StudentSchema.index({ organizationId: 1, branchId: 1, status: 1 });

export const StudentModel = mongoose.model<IStudent>('Student', StudentSchema);
`);

write('src/modules/students/student-transfer.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';

export interface IStudentTransfer extends Document {
  organizationId: string;
  studentId: string;
  customerCode: string;
  studentName: string;
  fromBranchId: string;
  fromBedCode: string;
  toBranchId: string;
  toBedCode: string;
  toBedId: string;
  balanceCarriedForward: number;
  reason: string;
  approvedBy: string;
  transferDate: Date;
  status: 'COMPLETED' | 'CANCELLED';
  createdAt: Date;
}

const StudentTransferSchema = new Schema<IStudentTransfer>({
  organizationId: { type: String, required: true, index: true },
  studentId: { type: String, required: true, index: true },
  customerCode: { type: String, required: true, index: true },
  studentName: { type: String, required: true },
  fromBranchId: { type: String, required: true },
  fromBedCode: { type: String, required: true },
  toBranchId: { type: String, required: true },
  toBedCode: { type: String, required: true },
  toBedId: { type: String, required: true },
  balanceCarriedForward: { type: Number, default: 0 },
  reason: { type: String, default: 'Student requested transfer' },
  approvedBy: { type: String, required: true },
  transferDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['COMPLETED', 'CANCELLED'], default: 'COMPLETED' },
}, { timestamps: true });

export const StudentTransferModel = mongoose.model<IStudentTransfer>('StudentTransfer', StudentTransferSchema);
`);