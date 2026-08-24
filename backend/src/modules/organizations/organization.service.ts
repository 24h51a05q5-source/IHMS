import { query, queryOne, queryRows } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';

export interface IOrganization {
  id: string;
  _id?: string;
  orgCode: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  currency?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class OrganizationService {
  async getById(id: string): Promise<any> {
    const org = await queryOne<any>(
      `SELECT id, id as "_id", org_code as "orgCode", name, email, phone, address, 
              currency, status, created_at as "createdAt", updated_at as "updatedAt"
       FROM organizations WHERE id = $1`,
      [id]
    );
    if (!org) throw new AppError('Organization not found', 404);
    return org;
  }

  async update(id: string, data: any): Promise<any> {
    const org = await queryOne<any>(
      `UPDATE organizations
       SET name = COALESCE($2, name),
           email = COALESCE($3, email),
           phone = COALESCE($4, phone),
           address = COALESCE($5, address),
           currency = COALESCE($6, currency),
           status = COALESCE($7, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, id as "_id", org_code as "orgCode", name, email, phone, address, currency, status, created_at as "createdAt", updated_at as "updatedAt"`,
      [id, data.name, data.email, data.phone, data.address, data.currency, data.status]
    );
    if (!org) throw new AppError('Organization not found', 404);
    if (data.name) {
      const newName = String(data.name).trim();
      await query('UPDATE users SET hostel_name = $1 WHERE organization_id = $2', [newName, id]);
      await query('UPDATE hostels SET hostel_name = $1 WHERE organization_id = $2', [newName, id]);
      await query('UPDATE owners SET registered_hostel_name = $1, business_name = $1 WHERE organization_id = $2', [newName, id]);
    }
    return org;
  }

  async listAll(): Promise<any[]> {
    return queryRows<any>(
      `SELECT id, id as "_id", org_code as "orgCode", name, email, phone, address, 
              currency, status, created_at as "createdAt", updated_at as "updatedAt"
       FROM organizations ORDER BY created_at DESC`
    );
  }
}
export const organizationService = new OrganizationService();
