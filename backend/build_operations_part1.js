const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

// ==========================================
// MESS MODULE
// ==========================================
write('src/modules/mess/mess.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';

export interface IMessMenu extends Document {
  organizationId: string;
  branchId: string;
  dayOfWeek: number; // 0=Sunday, 1=Monday...
  dayName: string;
  breakfast: string;
  lunch: string;
  snacks: string;
  dinner: string;
  isSpecial: boolean;
}

const MessMenuSchema = new Schema<IMessMenu>({
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  dayOfWeek: { type: Number, required: true },
  dayName: { type: String, required: true },
  breakfast: { type: String, default: '' },
  lunch: { type: String, default: '' },
  snacks: { type: String, default: '' },
  dinner: { type: String, default: '' },
  isSpecial: { type: Boolean, default: false },
}, { timestamps: true });

MessMenuSchema.index({ organizationId: 1, branchId: 1, dayOfWeek: 1 }, { unique: true });

export const MessMenuModel = mongoose.model<IMessMenu>('MessMenu', MessMenuSchema);

export interface IMealAttendance extends Document {
  organizationId: string;
  branchId: string;
  studentId: string;
  customerCode: string;
  studentName: string;
  mealType: 'BREAKFAST' | 'LUNCH' | 'SNACKS' | 'DINNER';
  date: Date;
  markedAt: Date;
}

const MealAttendanceSchema = new Schema<IMealAttendance>({
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  studentId: { type: String, required: true, index: true },
  customerCode: { type: String, required: true },
  studentName: { type: String, required: true },
  mealType: { type: String, enum: ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'], required: true },
  date: { type: Date, required: true },
  markedAt: { type: Date, default: Date.now },
}, { timestamps: true });

export const MealAttendanceModel = mongoose.model<IMealAttendance>('MealAttendance', MealAttendanceSchema);
`);

write('src/modules/mess/mess.service.ts', `
import { MessMenuModel, MealAttendanceModel } from './mess.schema';
import { StudentModel } from '../students/student.schema';
import { AppError } from '../../common/filters/http-exception.filter';

export class MessService {
  async getMenu(orgId: string, branchId: string) {
    let menu = await MessMenuModel.find({ organizationId: orgId, branchId }).sort({ dayOfWeek: 1 });
    if (menu.length === 0) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const defaultMenus = days.map((dayName, idx) => ({
        organizationId: orgId,
        branchId,
        dayOfWeek: idx,
        dayName,
        breakfast: 'Idli / Sambar / Chutney, Tea / Coffee',
        lunch: 'Rice, Dal Tadka, Paneer Butter Masala, Curd, Salad',
        snacks: 'Samosa / Tea',
        dinner: 'Roti, Veg Pulao, Mixed Veg Curry, Gulab Jamun',
        isSpecial: idx === 0,
      }));
      menu = await MessMenuModel.insertMany(defaultMenus);
    }
    return menu;
  }

  async updateMenuDay(orgId: string, branchId: string, dayOfWeek: number, data: any) {
    const updated = await MessMenuModel.findOneAndUpdate(
      { organizationId: orgId, branchId, dayOfWeek },
      data,
      { new: true, upsert: true }
    );
    return updated;
  }

  async markMealAttendance(orgId: string, branchId: string, customerCode: string, mealType: string) {
    const student = await StudentModel.findOne({ organizationId: orgId, customerCode });
    if (!student) throw new AppError('Student not found with this customer code', 404);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await MealAttendanceModel.create({
      organizationId: orgId,
      branchId,
      studentId: student._id.toString(),
      customerCode: student.customerCode,
      studentName: student.fullName,
      mealType,
      date: today,
      markedAt: new Date(),
    });

    return record;
  }

  async getMealStats(orgId: string, branchId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const countAgg = await MealAttendanceModel.aggregate([
      { $match: { organizationId: orgId, branchId, date: { $gte: today } } },
      { $group: { _id: '$mealType', count: { $sum: 1 } } }
    ]);

    const stats: any = { BREAKFAST: 0, LUNCH: 0, SNACKS: 0, DINNER: 0 };
    countAgg.forEach(c => { stats[c._id] = c.count; });
    return stats;
  }
}
export const messService = new MessService();
`);

write('src/modules/mess/mess.controller.ts', `
import { Router, Request, Response, NextFunction } from 'express';
import { messService } from './mess.service';
import { authenticate } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';
import { authorizeRoles } from '../../common/guards/roles.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate, enforceTenantIsolation);

router.get('/menu', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = (req.query.branchId as string) || req.user!.branchId;
    const menu = await messService.getMenu(req.user!.organizationId, branchId);
    res.json({ success: true, data: menu });
  } catch (err) { next(err); }
});

router.put('/menu/:dayOfWeek', authorizeRoles(UserRole.OWNER, UserRole.MESS_MANAGER, UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.body.branchId || req.user!.branchId;
    const updated = await messService.updateMenuDay(req.user!.organizationId, branchId, Number(req.params.dayOfWeek), req.body);
    res.json({ success: true, data: updated, message: 'Mess menu updated successfully' });
  } catch (err) { next(err); }
});

router.post('/attendance', authorizeRoles(UserRole.OWNER, UserRole.MESS_MANAGER, UserRole.BRANCH_MANAGER, UserRole.WARDEN, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.body.branchId || req.user!.branchId;
    const record = await messService.markMealAttendance(req.user!.organizationId, branchId, req.body.customerCode, req.body.mealType);
    res.status(201).json({ success: true, data: record, message: \`Meal attendance marked for \${record.studentName}\` });
  } catch (err) { next(err); }
});

router.get('/attendance/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = (req.query.branchId as string) || req.user!.branchId;
    const stats = await messService.getMealStats(req.user!.organizationId, branchId);
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
});

export const messRouter = router;
`);

// ==========================================
// INVENTORY & ASSETS MODULE
// ==========================================
write('src/modules/inventory/asset.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';

export interface IAsset extends Document {
  organizationId: string;
  branchId: string;
  assetCode: string; // HYD001-AST-000245
  name: string;
  category: 'FURNITURE' | 'APPLIANCE' | 'ELECTRONICS' | 'SECURITY' | 'PLUMBING' | 'OTHER';
  roomLocation: string;
  purchaseDate: Date;
  cost: number;
  status: 'WORKING' | 'UNDER_REPAIR' | 'DAMAGED' | 'DISPOSED';
  amcVendor?: string;
  amcExpiryDate?: Date;
  qrPayload?: string;
  createdAt: Date;
}

const AssetSchema = new Schema<IAsset>({
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  assetCode: { type: String, required: true },
  name: { type: String, required: true },
  category: { type: String, enum: ['FURNITURE', 'APPLIANCE', 'ELECTRONICS', 'SECURITY', 'PLUMBING', 'OTHER'], default: 'FURNITURE' },
  roomLocation: { type: String, default: 'General / Common Area' },
  purchaseDate: { type: Date, default: Date.now },
  cost: { type: Number, default: 0 },
  status: { type: String, enum: ['WORKING', 'UNDER_REPAIR', 'DAMAGED', 'DISPOSED'], default: 'WORKING' },
  amcVendor: { type: String },
  amcExpiryDate: { type: Date },
  qrPayload: { type: String },
}, { timestamps: true });

AssetSchema.index({ organizationId: 1, assetCode: 1 }, { unique: true });

export const AssetModel = mongoose.model<IAsset>('Asset', AssetSchema);
`);

write('src/modules/inventory/inventory.service.ts', `
import { AssetModel, IAsset } from './asset.schema';
import { HostelBranchModel } from '../hostels/hostel.schema';
import { AppError } from '../../common/filters/http-exception.filter';
import { generateAssetCode } from '../../common/utils/code-generator';
import { generateQrDataUrl } from '../../common/utils/qr-generator';

export class InventoryService {
  async createAsset(orgId: string, branchId: string, data: any): Promise<IAsset> {
    const branch = await HostelBranchModel.findById(branchId);
    const hostelCode = branch?.branchCode || 'HYD001';
    const assetCode = await generateAssetCode(orgId, hostelCode);

    const qrPayload = await generateQrDataUrl({
      assetCode,
      name: data.name,
      category: data.category,
      roomLocation: data.roomLocation,
    });

    return AssetModel.create({
      ...data,
      organizationId: orgId,
      branchId,
      assetCode,
      qrPayload,
      purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : new Date(),
    });
  }

  async listAssets(orgId: string, branchId?: string, category?: string) {
    const query: any = { organizationId: orgId };
    if (branchId) query.branchId = branchId;
    if (category) query.category = category;
    return AssetModel.find(query).sort({ createdAt: -1 });
  }

  async updateAssetStatus(orgId: string, id: string, status: string) {
    const asset = await AssetModel.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { status },
      { new: true }
    );
    if (!asset) throw new AppError('Asset not found', 404);
    return asset;
  }
}
export const inventoryService = new InventoryService();
`);

write('src/modules/inventory/inventory.controller.ts', `
import { Router, Request, Response, NextFunction } from 'express';
import { inventoryService } from './inventory.service';
import { authenticate } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';
import { authorizeRoles } from '../../common/guards/roles.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate, enforceTenantIsolation);

router.post('/assets', authorizeRoles(UserRole.OWNER, UserRole.STORE_MANAGER, UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.body.branchId || req.user!.branchId;
    const asset = await inventoryService.createAsset(req.user!.organizationId, branchId, req.body);
    res.status(201).json({ success: true, data: asset, message: \`Asset registered with Code \${asset.assetCode}\` });
  } catch (err) { next(err); }
});

router.get('/assets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId, category } = req.query;
    const assets = await inventoryService.listAssets(req.user!.organizationId, branchId as string, category as string);
    res.json({ success: true, data: assets });
  } catch (err) { next(err); }
});

router.patch('/assets/:id/status', authorizeRoles(UserRole.OWNER, UserRole.STORE_MANAGER, UserRole.BRANCH_MANAGER, UserRole.MAINTENANCE_STAFF, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const asset = await inventoryService.updateAssetStatus(req.user!.organizationId, req.params.id, req.body.status);
    res.json({ success: true, data: asset, message: 'Asset status updated successfully' });
  } catch (err) { next(err); }
});

export const inventoryRouter = router;
`);