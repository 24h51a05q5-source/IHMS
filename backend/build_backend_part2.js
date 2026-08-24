const fs = require('fs');
const path = require('path');

function writeFile(relPath, content) {
  const fullPath = path.join(__dirname, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log('Created: ' + relPath);
}

// ==========================================
// 4. HOSTELS / BRANCHES MODULE
// ==========================================
writeFile('src/modules/hostels/hostel.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';

export interface IHostelBranch extends Document {
  organizationId: string;
  branchCode: string;
  name: string;
  type: 'BOYS' | 'GIRLS' | 'CO_ED';
  address: string;
  city: string;
  state: string;
  contactPhone: string;
  contactEmail: string;
  totalCapacity: number;
  managerId?: string;
  managerName?: string;
  status: 'ACTIVE' | 'INACTIVE';
  rules?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const HostelBranchSchema = new Schema<IHostelBranch>({
  organizationId: { type: String, required: true, index: true },
  branchCode: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['BOYS', 'GIRLS', 'CO_ED'], default: 'BOYS' },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  totalCapacity: { type: Number, default: 0 },
  managerId: { type: String },
  managerName: { type: String },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  rules: [{ type: String }],
}, { timestamps: true });

HostelBranchSchema.index({ organizationId: 1, branchCode: 1 }, { unique: true });

export const HostelBranchModel = mongoose.model<IHostelBranch>('HostelBranch', HostelBranchSchema);
`);

writeFile('src/modules/hostels/hostel.service.ts', `
import { HostelBranchModel, IHostelBranch } from './hostel.schema';
import { BedModel } from '../rooms/bed.schema';
import { AppError } from '../../common/filters/http-exception.filter';
import { generateBusinessCode } from '../../common/utils/code-generator';

export class HostelService {
  async create(orgId: string, data: Partial<IHostelBranch>): Promise<IHostelBranch> {
    const branchCode = data.branchCode || (await generateBusinessCode(orgId, 'HYD', 3, 'HYD'));
    const existing = await HostelBranchModel.findOne({ organizationId: orgId, branchCode });
    if (existing) throw new AppError(\`Branch Code '\${branchCode}' already exists in your organization\`, 400);

    return HostelBranchModel.create({
      ...data,
      organizationId: orgId,
      branchCode,
      status: 'ACTIVE',
    });
  }

  async list(orgId: string): Promise<any[]> {
    const branches = await HostelBranchModel.find({ organizationId: orgId }).sort({ createdAt: -1 });

    // Aggregate real bed occupancy per branch
    const branchStats = await Promise.all(
      branches.map(async (b) => {
        const totalBeds = await BedModel.countDocuments({ organizationId: orgId, branchId: b._id.toString() });
        const occupiedBeds = await BedModel.countDocuments({ organizationId: orgId, branchId: b._id.toString(), status: 'OCCUPIED' });
        const availableBeds = await BedModel.countDocuments({ organizationId: orgId, branchId: b._id.toString(), status: 'AVAILABLE' });
        return {
          ...b.toObject(),
          totalBeds,
          occupiedBeds,
          availableBeds,
          occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
        };
      })
    );

    return branchStats;
  }

  async getById(orgId: string, id: string): Promise<IHostelBranch> {
    const branch = await HostelBranchModel.findOne({ _id: id, organizationId: orgId });
    if (!branch) throw new AppError('Hostel branch not found', 404);
    return branch;
  }

  async update(orgId: string, id: string, data: Partial<IHostelBranch>): Promise<IHostelBranch> {
    const branch = await HostelBranchModel.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      data,
      { new: true }
    );
    if (!branch) throw new AppError('Hostel branch not found', 404);
    return branch;
  }
}
export const hostelService = new HostelService();
`);

writeFile('src/modules/hostels/hostel.controller.ts', `
import { Router, Request, Response, NextFunction } from 'express';
import { hostelService } from './hostel.service';
import { authenticate } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';
import { authorizeRoles } from '../../common/guards/roles.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate, enforceTenantIsolation);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branches = await hostelService.list(req.user!.organizationId);
    res.json({ success: true, data: branches });
  } catch (err) { next(err); }
});

router.post('/', authorizeRoles(UserRole.OWNER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branch = await hostelService.create(req.user!.organizationId, req.body);
    res.status(201).json({ success: true, data: branch, message: 'Hostel branch created successfully' });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branch = await hostelService.getById(req.user!.organizationId, req.params.id);
    res.json({ success: true, data: branch });
  } catch (err) { next(err); }
});

router.put('/:id', authorizeRoles(UserRole.OWNER, UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branch = await hostelService.update(req.user!.organizationId, req.params.id, req.body);
    res.json({ success: true, data: branch, message: 'Hostel branch updated successfully' });
  } catch (err) { next(err); }
});

export const hostelRouter = router;
`);

// ==========================================
// 5. ROOMS AND BEDS MODULE
// ==========================================
writeFile('src/modules/rooms/room.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';

export interface IRoom extends Document {
  organizationId: string;
  branchId: string;
  buildingName: string;
  blockName: string;
  floorNumber: number;
  roomNumber: string;
  roomCode: string; // e.g. HYD001-B1-F2-R205
  roomType: 'SINGLE' | 'DOUBLE' | 'TRIPLE' | 'FOUR_SHARING';
  totalBeds: number;
  monthlyRate: number;
  amenities: string[];
  status: 'ACTIVE' | 'MAINTENANCE';
  createdAt: Date;
  updatedAt: Date;
}

const RoomSchema = new Schema<IRoom>({
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  buildingName: { type: String, default: 'Main Building' },
  blockName: { type: String, default: 'A' },
  floorNumber: { type: Number, required: true },
  roomNumber: { type: String, required: true },
  roomCode: { type: String, required: true },
  roomType: { type: String, enum: ['SINGLE', 'DOUBLE', 'TRIPLE', 'FOUR_SHARING'], default: 'DOUBLE' },
  totalBeds: { type: Number, required: true, default: 2 },
  monthlyRate: { type: Number, required: true, default: 6000 },
  amenities: [{ type: String }],
  status: { type: String, enum: ['ACTIVE', 'MAINTENANCE'], default: 'ACTIVE' },
}, { timestamps: true });

RoomSchema.index({ organizationId: 1, branchId: 1, roomCode: 1 }, { unique: true });

export const RoomModel = mongoose.model<IRoom>('Room', RoomSchema);
`);

writeFile('src/modules/rooms/bed.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';
import { BedStatus } from '../../config/constants';

export interface IBed extends Document {
  organizationId: string;
  branchId: string;
  roomId: string;
  roomCode: string;
  bedNumber: number;
  bedCode: string; // e.g. HYD001-R205-B01
  status: BedStatus;
  monthlyRate: number;
  currentStudentId?: string;
  currentCustomerCode?: string;
  currentStudentName?: string;
  allocatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BedSchema = new Schema<IBed>({
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true },
  roomId: { type: String, required: true, index: true },
  roomCode: { type: String, required: true },
  bedNumber: { type: Number, required: true },
  bedCode: { type: String, required: true },
  status: {
    type: String,
    enum: Object.values(BedStatus),
    default: BedStatus.AVAILABLE,
    index: true,
  },
  monthlyRate: { type: Number, required: true, default: 6000 },
  currentStudentId: { type: String },
  currentCustomerCode: { type: String },
  currentStudentName: { type: String },
  allocatedAt: { type: Date },
}, { timestamps: true });

BedSchema.index({ organizationId: 1, branchId: 1, bedCode: 1 }, { unique: true });
BedSchema.index({ organizationId: 1, branchId: 1, status: 1 });

export const BedModel = mongoose.model<IBed>('Bed', BedSchema);
`);

writeFile('src/modules/rooms/room.service.ts', `
import { RoomModel, IRoom } from './room.schema';
import { BedModel, IBed } from './bed.schema';
import { HostelBranchModel } from '../hostels/hostel.schema';
import { AppError } from '../../common/filters/http-exception.filter';
import { BedStatus } from '../../config/constants';
import { emitRealTimeEvent } from '../../events/events.gateway';

export class RoomService {
  async createRoom(orgId: string, branchId: string, data: any): Promise<{ room: IRoom; beds: IBed[] }> {
    const branch = await HostelBranchModel.findOne({ _id: branchId, organizationId: orgId });
    if (!branch) throw new AppError('Hostel branch not found', 404);

    const bCode = branch.branchCode;
    const roomCode = \`\${bCode}-B\${data.blockName || '1'}-F\${data.floorNumber}-R\${data.roomNumber}\`;

    const existingRoom = await RoomModel.findOne({ organizationId: orgId, branchId, roomCode });
    if (existingRoom) {
      throw new AppError(\`Room code '\${roomCode}' already exists in this branch.\`, 400);
    }

    const bedCount = Number(data.totalBeds) || 2;
    const room = await RoomModel.create({
      organizationId: orgId,
      branchId,
      buildingName: data.buildingName || 'Main Building',
      blockName: data.blockName || '1',
      floorNumber: data.floorNumber,
      roomNumber: data.roomNumber,
      roomCode,
      roomType: data.roomType || (bedCount === 1 ? 'SINGLE' : bedCount === 2 ? 'DOUBLE' : bedCount === 3 ? 'TRIPLE' : 'FOUR_SHARING'),
      totalBeds: bedCount,
      monthlyRate: Number(data.monthlyRate) || 6000,
      amenities: data.amenities || ['Bed', 'Study Table', 'Cupboard', 'Fan'],
      status: 'ACTIVE',
    });

    const beds: IBed[] = [];
    for (let i = 1; i <= bedCount; i++) {
      const bedCode = \`\${bCode}-R\${data.roomNumber}-B\${String(i).padStart(2, '0')}\`;
      const bed = await BedModel.create({
        organizationId: orgId,
        branchId,
        roomId: room._id.toString(),
        roomCode,
        bedNumber: i,
        bedCode,
        status: BedStatus.AVAILABLE,
        monthlyRate: room.monthlyRate,
      });
      beds.push(bed);
    }

    // Update branch total capacity
    const totalBedsInBranch = await BedModel.countDocuments({ organizationId: orgId, branchId });
    await HostelBranchModel.findByIdAndUpdate(branchId, { totalCapacity: totalBedsInBranch });

    emitRealTimeEvent('branch.capacity_updated', { branchId, totalCapacity: totalBedsInBranch }, { branchId });

    return { room, beds };
  }

  async listRooms(orgId: string, branchId?: string): Promise<any[]> {
    const query: any = { organizationId: orgId };
    if (branchId) query.branchId = branchId;

    const rooms = await RoomModel.find(query).sort({ roomNumber: 1 });
    const roomsWithBeds = await Promise.all(
      rooms.map(async (r) => {
        const beds = await BedModel.find({ roomId: r._id.toString() });
        const occupied = beds.filter((b) => b.status === BedStatus.OCCUPIED).length;
        return {
          ...r.toObject(),
          beds,
          occupiedBeds: occupied,
          availableBeds: beds.length - occupied,
        };
      })
    );

    return roomsWithBeds;
  }

  async listBeds(orgId: string, branchId?: string, status?: string): Promise<IBed[]> {
    const query: any = { organizationId: orgId };
    if (branchId) query.branchId = branchId;
    if (status) query.status = status;

    return BedModel.find(query).sort({ roomCode: 1, bedNumber: 1 });
  }

  async updateBedStatus(orgId: string, bedId: string, status: BedStatus, notes?: string): Promise<IBed> {
    const bed = await BedModel.findOne({ _id: bedId, organizationId: orgId });
    if (!bed) throw new AppError('Bed not found', 404);

    if (bed.status === BedStatus.OCCUPIED && status === BedStatus.AVAILABLE) {
      bed.currentStudentId = undefined;
      bed.currentCustomerCode = undefined;
      bed.currentStudentName = undefined;
      bed.allocatedAt = undefined;
    }

    bed.status = status;
    await bed.save();

    emitRealTimeEvent('bed.status_changed', { bedId: bed._id, bedCode: bed.bedCode, status, branchId: bed.branchId }, { branchId: bed.branchId });
    return bed;
  }
}
export const roomService = new RoomService();
`);

writeFile('src/modules/rooms/room.controller.ts', `
import { Router, Request, Response, NextFunction } from 'express';
import { roomService } from './room.service';
import { authenticate } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';
import { authorizeRoles } from '../../common/guards/roles.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate, enforceTenantIsolation);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId } = req.query;
    const rooms = await roomService.listRooms(req.user!.organizationId, branchId as string);
    res.json({ success: true, data: rooms });
  } catch (err) { next(err); }
});

router.post('/', authorizeRoles(UserRole.OWNER, UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.body.branchId || req.user!.branchId;
    if (!branchId) return res.status(400).json({ success: false, message: 'branchId is required' });

    const result = await roomService.createRoom(req.user!.organizationId, branchId, req.body);
    res.status(201).json({ success: true, data: result, message: 'Room and Beds created successfully' });
  } catch (err) { next(err); }
});

router.get('/beds', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId, status } = req.query;
    const beds = await roomService.listBeds(req.user!.organizationId, branchId as string, status as string);
    res.json({ success: true, data: beds });
  } catch (err) { next(err); }
});

router.patch('/beds/:bedId/status', authorizeRoles(UserRole.OWNER, UserRole.BRANCH_MANAGER, UserRole.WARDEN, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bed = await roomService.updateBedStatus(req.user!.organizationId, req.params.bedId, req.body.status);
    res.json({ success: true, data: bed, message: 'Bed status updated successfully' });
  } catch (err) { next(err); }
});

export const roomRouter = router;
`);

console.log('Hostels and Rooms/Beds modules created.');