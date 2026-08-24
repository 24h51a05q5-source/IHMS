const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

write('src/modules/fees/fee-structure.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';

export interface IFeeStructure extends Document {
  organizationId: string;
  branchId: string;
  name: string;
  roomType: string;
  baseHostelFee: number;
  messFee: number;
  securityDeposit: number;
  admissionFee: number;
  laundryFee: number;
  maintenanceFee: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
}

const FeeStructureSchema = new Schema<IFeeStructure>({
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  roomType: { type: String, required: true },
  baseHostelFee: { type: Number, required: true },
  messFee: { type: Number, default: 0 },
  securityDeposit: { type: Number, default: 0 },
  admissionFee: { type: Number, default: 0 },
  laundryFee: { type: Number, default: 0 },
  maintenanceFee: { type: Number, default: 0 },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
}, { timestamps: true });

export const FeeStructureModel = mongoose.model<IFeeStructure>('FeeStructure', FeeStructureSchema);
`);

write('src/modules/fees/fee-demand.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';

export interface IFeeDemand extends Document {
  demandNumber: string;
  organizationId: string;
  branchId: string;
  studentId: string;
  customerCode: string;
  academicPeriod: string;
  termName: string;
  breakdown: {
    hostelRent: number;
    messFee: number;
    admissionFee: number;
    securityDeposit: number;
    laundryFee: number;
    otherCharges: number;
  };
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  dueDate: Date;
  status: 'UNPAID' | 'PARTIAL' | 'PAID';
  createdAt: Date;
  updatedAt: Date;
}

const FeeDemandSchema = new Schema<IFeeDemand>({
  demandNumber: { type: String, required: true },
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  studentId: { type: String, required: true, index: true },
  customerCode: { type: String, required: true, index: true },
  academicPeriod: { type: String, required: true },
  termName: { type: String, required: true },
  breakdown: {
    hostelRent: { type: Number, default: 0 },
    messFee: { type: Number, default: 0 },
    admissionFee: { type: Number, default: 0 },
    securityDeposit: { type: Number, default: 0 },
    laundryFee: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
  },
  totalAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ['UNPAID', 'PARTIAL', 'PAID'], default: 'UNPAID', index: true },
}, { timestamps: true });

FeeDemandSchema.index({ organizationId: 1, studentId: 1, status: 1 });

export const FeeDemandModel = mongoose.model<IFeeDemand>('FeeDemand', FeeDemandSchema);
`);

write('src/modules/fees/payment.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';
import { PaymentMethod, PaymentStatus } from '../../config/constants';

export interface IPayment extends Document {
  paymentNumber: string;
  organizationId: string;
  branchId: string;
  studentId: string;
  customerCode: string;
  demandId?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  transactionRef: string;
  status: PaymentStatus;
  notes?: string;
  receivedBy: string;
  timestamp: Date;
}

const PaymentSchema = new Schema<IPayment>({
  paymentNumber: { type: String, required: true },
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  studentId: { type: String, required: true, index: true },
  customerCode: { type: String, required: true, index: true },
  demandId: { type: String },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, enum: Object.values(PaymentMethod), required: true },
  transactionRef: { type: String, required: true },
  status: { type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.SUCCESS, index: true },
  notes: { type: String, default: '' },
  receivedBy: { type: String, default: 'System' },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

PaymentSchema.index({ organizationId: 1, timestamp: -1 });

export const PaymentModel = mongoose.model<IPayment>('Payment', PaymentSchema);
`);

write('src/modules/fees/receipt.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';
import { PaymentMethod } from '../../config/constants';

export interface IReceipt extends Document {
  receiptNumber: string;
  paymentId: string;
  organizationId: string;
  branchId: string;
  studentId: string;
  customerCode: string;
  studentName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  transactionRef: string;
  issuedBy: string;
  qrPayload: string;
  issuedAt: Date;
}

const ReceiptSchema = new Schema<IReceipt>({
  receiptNumber: { type: String, required: true },
  paymentId: { type: String, required: true },
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  studentId: { type: String, required: true, index: true },
  customerCode: { type: String, required: true, index: true },
  studentName: { type: String, required: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, enum: Object.values(PaymentMethod), required: true },
  transactionRef: { type: String, required: true },
  issuedBy: { type: String, default: 'Accounts' },
  qrPayload: { type: String, default: '' },
  issuedAt: { type: Date, default: Date.now },
}, { timestamps: true });

ReceiptSchema.index({ organizationId: 1, receiptNumber: 1 }, { unique: true });

export const ReceiptModel = mongoose.model<IReceipt>('Receipt', ReceiptSchema);
`);