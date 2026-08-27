import bcrypt from 'bcryptjs';
import { query, queryOne, queryRows } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { UserRole } from '../../config/constants';
import { generateStaffCode, generateIhmsId } from '../../common/utils/code-generator';

export interface IUser {
  id: string;
  _id?: string;
  userId?: string;
  name: string;
  email: string;
  passwordHash?: string;
  role: string;
  phone?: string;
  organizationId?: string;
  branchId?: string;
  studentId?: string;
  staffCode?: string;
  customerCode?: string;
  ownerId?: string;
  hostelName?: string;
  mustChangePassword?: boolean;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class UserService {
  async createStaff(orgId: string, branchId: string, hostelCode: string, data: any): Promise<any> {
    const existing = await queryOne('SELECT id FROM users WHERE LOWER(email) = $1', [data.email.toLowerCase()]);
    if (existing) throw new AppError('A user with this email already exists', 400);

    const ihmsId = await generateIhmsId('H', hostelCode || 'AA', 'Main', orgId);
    const passwordHash = await bcrypt.hash(data.password || 'Staff@123', 10);
    const id = require('crypto').randomUUID();

    const user = await queryOne<any>(
      `INSERT INTO users (
        id, user_id, ihms_id, name, email, password_hash, role, phone,
        organization_id, branch_id, staff_code, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, id as "_id", user_id as "userId", ihms_id as "ihmsId", name, email, role, phone,
                organization_id as "organizationId", branch_id as "branchId",
                staff_code as "staffCode", status, created_at as "createdAt"`,
      [
        id,
        ihmsId,
        ihmsId,
        data.name,
        data.email.toLowerCase(),
        passwordHash,
        data.role || UserRole.WARDEN,
        data.phone || '',
        orgId,
        branchId,
        ihmsId,
        'ACTIVE'
      ]
    );

    return user;
  }

  async list(orgId: string, branchId?: string, role?: string): Promise<any[]> {
    let sql = `SELECT id, id as "_id", user_id as "userId", name, email, role, phone,
                      organization_id as "organizationId", branch_id as "branchId",
                      staff_code as "staffCode", customer_code as "customerCode",
                      hostel_name as "hostelName", status, created_at as "createdAt"
               FROM users WHERE organization_id = $1`;
    const params: any[] = [orgId];

    if (branchId) {
      params.push(branchId);
      sql += ` AND branch_id = $${params.length}`;
    }
    if (role) {
      params.push(role);
      sql += ` AND role = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';
    return queryRows(sql, params);
  }

  async getById(id: string): Promise<any> {
    const user = await queryOne<any>(
      `SELECT id, id as "_id", user_id as "userId", name, email, role, phone,
              organization_id as "organizationId", branch_id as "branchId",
              staff_code as "staffCode", customer_code as "customerCode",
              hostel_name as "hostelName", status, created_at as "createdAt"
       FROM users WHERE id = $1`,
      [id]
    );
    if (!user) throw new AppError('User not found', 404);
    return user;
  }
}
export const userService = new UserService();
