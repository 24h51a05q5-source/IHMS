const fs = require('fs');
const path = require('path');

function writeFile(relPath, content) {
  const fullPath = path.join(__dirname, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log('Created: ' + relPath);
}

// ==========================================
// 1. ORGANIZATIONS MODULE
// ==========================================
writeFile('src/modules/organizations/organization.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';

export interface IOrganization extends Document {
  orgCode: string;
  name: string;
  taxGstin?: string;
  currency: string;
  address: string;
  phone: string;
  email: string;
  subscriptionTier: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>({
  orgCode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  taxGstin: { type: String },
  currency: { type: String, default: 'INR' },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, required: true },
  subscriptionTier: { type: String, default: 'ENTERPRISE' },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
}, { timestamps: true });

export const OrganizationModel = mongoose.model<IOrganization>('Organization', OrganizationSchema);
`);

writeFile('src/modules/organizations/organization.service.ts', `
import { OrganizationModel, IOrganization } from './organization.schema';
import { AppError } from '../../common/filters/http-exception.filter';

export class OrganizationService {
  async getById(id: string): Promise<IOrganization> {
    const org = await OrganizationModel.findById(id);
    if (!org) throw new AppError('Organization not found', 404);
    return org;
  }

  async update(id: string, data: Partial<IOrganization>): Promise<IOrganization> {
    const org = await OrganizationModel.findByIdAndUpdate(id, data, { new: true });
    if (!org) throw new AppError('Organization not found', 404);
    return org;
  }

  async listAll(): Promise<IOrganization[]> {
    return OrganizationModel.find().sort({ createdAt: -1 });
  }
}
export const organizationService = new OrganizationService();
`);

writeFile('src/modules/organizations/organization.controller.ts', `
import { Router, Request, Response, NextFunction } from 'express';
import { organizationService } from './organization.service';
import { authenticate } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';
import { authorizeRoles } from '../../common/guards/roles.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate);

router.get('/current', enforceTenantIsolation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await organizationService.getById(req.user!.organizationId);
    res.json({ success: true, data: org });
  } catch (err) { next(err); }
});

router.put('/current', enforceTenantIsolation, authorizeRoles(UserRole.OWNER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await organizationService.update(req.user!.organizationId, req.body);
    res.json({ success: true, data: org, message: 'Organization settings updated successfully' });
  } catch (err) { next(err); }
});

router.get('/all', authorizeRoles(UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgs = await organizationService.listAll();
    res.json({ success: true, data: orgs });
  } catch (err) { next(err); }
});

export const organizationRouter = router;
`);

// ==========================================
// 2. USERS MODULE
// ==========================================
writeFile('src/modules/users/user.schema.ts', `
import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '../../config/constants';

export interface IUser extends Document {
  organizationId: string;
  branchId?: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  phone?: string;
  staffCode?: string;
  customerCode?: string;
  status: 'ACTIVE' | 'INACTIVE';
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  organizationId: { type: String, required: true, index: true },
  branchId: { type: String, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: Object.values(UserRole), required: true },
  phone: { type: String },
  staffCode: { type: String },
  customerCode: { type: String },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  lastLoginAt: { type: Date }
}, { timestamps: true });

UserSchema.index({ organizationId: 1, role: 1 });
UserSchema.index({ organizationId: 1, customerCode: 1 });

export const UserModel = mongoose.model<IUser>('User', UserSchema);
`);

writeFile('src/modules/users/user.service.ts', `
import bcrypt from 'bcryptjs';
import { UserModel, IUser } from './user.schema';
import { AppError } from '../../common/filters/http-exception.filter';
import { UserRole } from '../../config/constants';
import { generateStaffCode } from '../../common/utils/code-generator';

export class UserService {
  async createStaff(orgId: string, branchId: string, hostelCode: string, data: any): Promise<IUser> {
    const existing = await UserModel.findOne({ email: data.email.toLowerCase() });
    if (existing) throw new AppError('A user with this email already exists', 400);

    const staffCode = await generateStaffCode(orgId, hostelCode || 'HYD001');
    const passwordHash = await bcrypt.hash(data.password || 'Staff@123', 10);

    const user = await UserModel.create({
      organizationId: orgId,
      branchId,
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash,
      role: data.role || UserRole.WARDEN,
      phone: data.phone,
      staffCode,
      status: 'ACTIVE',
    });

    return user;
  }

  async list(orgId: string, branchId?: string, role?: string): Promise<IUser[]> {
    const query: any = { organizationId: orgId };
    if (branchId) query.branchId = branchId;
    if (role) query.role = role;
    return UserModel.find(query).select('-passwordHash').sort({ createdAt: -1 });
  }

  async getById(id: string): Promise<IUser> {
    const user = await UserModel.findById(id).select('-passwordHash');
    if (!user) throw new AppError('User not found', 404);
    return user;
  }
}
export const userService = new UserService();
`);

writeFile('src/modules/users/user.controller.ts', `
import { Router, Request, Response, NextFunction } from 'express';
import { userService } from './user.service';
import { authenticate } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';
import { authorizeRoles } from '../../common/guards/roles.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate, enforceTenantIsolation);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId, role } = req.query;
    const users = await userService.list(req.user!.organizationId, branchId as string, role as string);
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

router.post('/staff', authorizeRoles(UserRole.OWNER, UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId, hostelCode, ...staffData } = req.body;
    const user = await userService.createStaff(
      req.user!.organizationId,
      branchId || req.user!.branchId,
      hostelCode || 'HYD001',
      staffData
    );
    res.status(201).json({ success: true, data: user, message: 'Staff member created successfully' });
  } catch (err) { next(err); }
});

export const userRouter = router;
`);

// ==========================================
// 3. AUTH MODULE
// ==========================================
writeFile('src/modules/auth/auth.service.ts', `
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserModel, IUser } from '../users/user.schema';
import { OrganizationModel, IOrganization } from '../organizations/organization.schema';
import { AppError } from '../../common/filters/http-exception.filter';
import { UserRole } from '../../config/constants';
import { generateBusinessCode } from '../../common/utils/code-generator';

export class AuthService {
  private getSecret(): string {
    return process.env.JWT_SECRET || 'ihms-super-secret-production-key-2026';
  }

  generateTokens(user: IUser) {
    const payload = {
      id: user._id.toString(),
      userId: user._id.toString(),
      organizationId: user.organizationId,
      branchId: user.branchId,
      role: user.role,
      email: user.email,
      name: user.name,
      customerCode: user.customerCode,
      staffCode: user.staffCode,
    };

    const token = jwt.sign(payload, this.getSecret(), { expiresIn: '7d' });
    const refreshToken = jwt.sign({ id: user._id.toString() }, this.getSecret(), { expiresIn: '30d' });

    return { token, refreshToken, user: payload };
  }

  async registerOwner(data: {
    orgName: string;
    orgEmail: string;
    orgPhone?: string;
    currency?: string;
    ownerName: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerPhone?: string;
  }) {
    const existingUser = await UserModel.findOne({ email: data.ownerEmail.toLowerCase() });
    if (existingUser) {
      throw new AppError('A user with this email address already exists. Please log in.', 400);
    }

    const orgCode = 'ORG-' + Math.floor(1000 + Math.random() * 9000);
    const organization = await OrganizationModel.create({
      orgCode,
      name: data.orgName,
      email: data.orgEmail || data.ownerEmail,
      phone: data.orgPhone || data.ownerPhone || '',
      currency: data.currency || 'INR',
      status: 'ACTIVE',
    });

    const passwordHash = await bcrypt.hash(data.ownerPassword, 10);
    const owner = await UserModel.create({
      organizationId: organization._id.toString(),
      name: data.ownerName,
      email: data.ownerEmail.toLowerCase(),
      passwordHash,
      role: UserRole.OWNER,
      phone: data.ownerPhone || '',
      status: 'ACTIVE',
    });

    const tokens = this.generateTokens(owner);
    return { ...tokens, organization };
  }

  async login(email: string, password: string) {
    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new AppError('Invalid email or password. Please check your credentials.', 401);
    }

    if (user.status === 'INACTIVE') {
      throw new AppError('Your account has been deactivated. Please contact your organization administrator.', 403);
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new AppError('Invalid email or password. Please check your credentials.', 401);
    }

    user.lastLoginAt = new Date();
    await user.save();

    return this.generateTokens(user);
  }

  async getMe(userId: string) {
    const user = await UserModel.findById(userId).select('-passwordHash');
    if (!user) throw new AppError('User profile not found', 404);

    let organization = null;
    if (user.organizationId) {
      organization = await OrganizationModel.findById(user.organizationId);
    }

    return { user, organization };
  }
}
export const authService = new AuthService();
`);

writeFile('src/modules/auth/auth.controller.ts', `
import { Router, Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { authenticate } from '../../common/guards/auth.guard';

const router = Router();

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.registerOwner(req.body);
    res.status(201).json({
      success: true,
      data: result,
      message: 'Organization registered and Owner account created successfully.',
    });
  } catch (err) { next(err); }
});

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    const result = await authService.login(email, password);
    res.json({ success: true, data: result, message: 'Login successful' });
  } catch (err) { next(err); }
});

router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.getMe(req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export const authRouter = router;
`);

console.log('Orgs, Users, and Auth modules created.');