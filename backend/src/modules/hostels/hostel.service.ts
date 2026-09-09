import { query, queryOne, queryRows } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { generateBusinessCode } from '../../common/utils/code-generator';

export interface IHostelBranch {
  id: string;
  _id?: string;
  hostelId?: string;
  organizationId: string;
  branchCode: string;
  hostelName?: string;
  name: string;
  branchName?: string;
  type?: string;
  hostelType?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  contactPhone?: string;
  contactEmail?: string;
  totalRooms?: number;
  totalBeds?: number;
  totalCapacity?: number;
  facilities?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class HostelService {
  async create(orgId: string, data: any): Promise<any> {
    const branchCode = data.branchCode || (await generateBusinessCode(orgId, 'HYD', 3, 'HYD'));
    const existing = await queryOne<any>(
      'SELECT id FROM hostels WHERE organization_id = $1 AND (branch_code = $2 OR name = $3)',
      [orgId, branchCode, data.name]
    );
    if (existing) {
      return this.update(orgId, existing.id, data);
    }

    const id = data.id || require('crypto').randomUUID();
    const hostelName = data.hostelName || data.name || 'Main Hostel';
    const branchName = data.branchName || 'Main';

    const branch = await queryOne<any>(
      `INSERT INTO hostels (
        id, hostel_id, branch_code, owner_id, organization_id, hostel_name, name,
        branch_name, hostel_type, address, city, state, pincode, contact_phone,
        contact_email, total_rooms, total_beds, facilities, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id, id as "_id", hostel_id as "hostelId", branch_code as "branchCode",
                organization_id as "organizationId", hostel_name as "hostelName", name,
                branch_name as "branchName", hostel_type as "type", hostel_type as "hostelType",
                address, city, state, pincode, contact_phone as "contactPhone",
                contact_email as "contactEmail", total_rooms as "totalRooms",
                total_beds as "totalBeds", total_beds as "totalCapacity", facilities, status,
                created_at as "createdAt", updated_at as "updatedAt"`,
      [
        id,
        branchCode,
        branchCode,
        orgId,
        orgId,
        hostelName,
        hostelName,
        branchName,
        data.type || data.hostelType || 'BOYS',
        data.address || '',
        data.city || 'Hyderabad',
        data.state || 'Telangana',
        data.pincode || '',
        data.contactPhone || data.phone || '',
        data.contactEmail || data.email || '',
        Number(data.totalRooms || 0),
        Number(data.totalBeds || data.totalCapacity || 0),
        typeof data.facilities === 'object' ? JSON.stringify(data.facilities) : (data.facilities || ''),
        data.status || 'ACTIVE'
      ]
    );

    // Auto-inherit or initialize payment configuration for newly created branch
    try {
      const existingConfig = await queryOne<any>(
        `SELECT * FROM hostel_payment_configs WHERE organization_id = $1 AND (upi_status = 'ACTIVE' OR bank_status = 'ACTIVE') ORDER BY created_at ASC LIMIT 1`,
        [orgId]
      );
      const cleanUpi = existingConfig?.upi_vpa || `${hostelName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'hostel'}@upi`;
      await query(
        `INSERT INTO hostel_payment_configs (
          id, organization_id, hostel_id,
          upi_vpa, upi_display_name, upi_status,
          bank_beneficiary_name, bank_account_number, bank_ifsc_code, bank_name, bank_status
        ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7, $8, $9, $10)
        ON CONFLICT (organization_id, hostel_id) DO NOTHING`,
        [
          require('crypto').randomUUID(),
          orgId,
          id,
          cleanUpi,
          existingConfig?.upi_display_name || hostelName,
          existingConfig?.bank_beneficiary_name || hostelName,
          existingConfig?.bank_account_number || null,
          existingConfig?.bank_ifsc_code || null,
          existingConfig?.bank_name || null,
          existingConfig?.bank_status || 'NOT_CONFIGURED',
        ]
      );
    } catch (e: any) {
      // Non-fatal
    }

    return branch;
  }

  async list(orgId: string): Promise<any[]> {
    const hostels = await queryRows<any>(
      `SELECT h.id, h.id as "_id", h.hostel_id as "hostelId", h.branch_code as "branchCode",
              h.organization_id as "organizationId", h.hostel_name as "hostelName",
              h.name, h.branch_name as "branchName", h.hostel_type as "type",
              h.hostel_type as "hostelType", h.address, h.city, h.state, h.pincode,
              h.contact_phone as "contactPhone", h.contact_email as "contactEmail",
              h.facilities, h.status, h.created_at as "createdAt", h.updated_at as "updatedAt"
       FROM hostels h
       WHERE h.organization_id = $1
       ORDER BY h.created_at DESC`,
      [orgId]
    );

    const rooms = await queryRows<any>('SELECT hostel_id FROM rooms WHERE organization_id = $1', [orgId]);
    const beds = await queryRows<any>('SELECT hostel_id, status FROM beds WHERE organization_id = $1', [orgId]);

    const roomsByHostel: Record<string, number> = {};
    rooms.forEach((r) => { roomsByHostel[r.hostel_id] = (roomsByHostel[r.hostel_id] || 0) + 1; });

    const bedsByHostel: Record<string, { total: number; occupied: number; available: number }> = {};
    beds.forEach((b) => {
      if (!bedsByHostel[b.hostel_id]) bedsByHostel[b.hostel_id] = { total: 0, occupied: 0, available: 0 };
      bedsByHostel[b.hostel_id].total++;
      if (b.status === 'OCCUPIED') bedsByHostel[b.hostel_id].occupied++;
      else if (b.status === 'AVAILABLE') bedsByHostel[b.hostel_id].available++;
    });

    return hostels.map((b) => {
      const bStats = bedsByHostel[b.id] || { total: 0, occupied: 0, available: 0 };
      const totalRooms = roomsByHostel[b.id] || 0;
      return {
        ...b,
        totalRooms,
        totalBeds: bStats.total,
        totalCapacity: bStats.total,
        occupiedBeds: bStats.occupied,
        availableBeds: bStats.available,
        occupancyRate: bStats.total > 0 ? Math.round((bStats.occupied / bStats.total) * 100) : 0,
      };
    });
  }

  async getById(orgId: string, id: string): Promise<any> {
    const branch = await queryOne<any>(
      `SELECT h.id, h.id as "_id", h.hostel_id as "hostelId", h.branch_code as "branchCode",
              h.organization_id as "organizationId", h.hostel_name as "hostelName",
              h.name, h.branch_name as "branchName", h.hostel_type as "type",
              h.hostel_type as "hostelType", h.address, h.city, h.state, h.pincode,
              h.contact_phone as "contactPhone", h.contact_email as "contactEmail",
              h.facilities, h.status, h.created_at as "createdAt", h.updated_at as "updatedAt"
       FROM hostels h
       WHERE (h.id = $1 OR h.hostel_id = $1 OR h.branch_code = $1) AND h.organization_id = $2`,
      [id, orgId]
    );
    if (!branch) throw new AppError('Hostel branch not found', 404);

    const roomsCount = await queryOne<any>('SELECT count(*)::int as count FROM rooms WHERE hostel_id = $1', [branch.id]);
    const beds = await queryRows<any>('SELECT status FROM beds WHERE hostel_id = $1', [branch.id]);
    const totalBeds = beds.length;
    const occupiedBeds = beds.filter((b) => b.status === 'OCCUPIED').length;
    const availableBeds = beds.filter((b) => b.status === 'AVAILABLE').length;

    return {
      ...branch,
      totalRooms: Number(roomsCount?.count || 0),
      totalBeds,
      totalCapacity: totalBeds,
      occupiedBeds,
      availableBeds,
      occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
    };
  }

  async update(orgId: string, id: string, data: any): Promise<any> {
    const branch = await queryOne<any>(
      `UPDATE hostels
       SET name = COALESCE($3, name),
           hostel_name = COALESCE($3, hostel_name),
           branch_name = COALESCE($4, branch_name),
           hostel_type = COALESCE($5, hostel_type),
           address = COALESCE($6, address),
           city = COALESCE($7, city),
           state = COALESCE($8, state),
           pincode = COALESCE($9, pincode),
           contact_phone = COALESCE($10, contact_phone),
           contact_email = COALESCE($11, contact_email),
           status = COALESCE($12, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE (id = $1 OR hostel_id = $1 OR branch_code = $1) AND organization_id = $2
       RETURNING id, id as "_id", hostel_id as "hostelId", branch_code as "branchCode",
                 organization_id as "organizationId", hostel_name as "hostelName", name,
                 branch_name as "branchName", hostel_type as "type", address, city, state,
                 pincode, contact_phone as "contactPhone", contact_email as "contactEmail",
                 status, created_at as "createdAt", updated_at as "updatedAt"`,
      [
        id,
        orgId,
        data.name || data.hostelName,
        data.branchName,
        data.type || data.hostelType,
        data.address,
        data.city,
        data.state,
        data.pincode,
        data.contactPhone || data.phone,
        data.contactEmail || data.email,
        data.status
      ]
    );
    if (!branch) throw new AppError('Hostel branch not found', 404);
    return branch;
  }
}

export const hostelService = new HostelService();
