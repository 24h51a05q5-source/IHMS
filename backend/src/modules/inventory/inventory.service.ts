import { query, queryOne, queryRows } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { generateAssetCode } from '../../common/utils/code-generator';
import { generateQrDataUrl } from '../../common/utils/qr-generator';

export class InventoryService {
  async createAsset(orgId: string, branchId: string, data: any): Promise<any> {
    const branch = await queryOne<any>('SELECT branch_code FROM hostels WHERE id = $1', [branchId]);
    const hostelCode = branch?.branch_code || 'HYD001';
    const assetCode = await generateAssetCode(orgId, hostelCode);

    const qrPayload = await generateQrDataUrl({
      assetCode,
      name: data.name,
      category: data.category,
      roomLocation: data.roomLocation || '',
    });

    const assetId = require('crypto').randomUUID();
    const asset = await queryOne<any>(
      `INSERT INTO assets (
        id, asset_code, organization_id, branch_id, name, category,
        room_location, purchase_date, cost, status, qr_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, id as "_id", asset_code as "assetCode", organization_id as "organizationId",
                branch_id as "branchId", name, category, room_location as "roomLocation",
                purchase_date as "purchaseDate", cost, status, qr_payload as "qrPayload",
                created_at as "createdAt", updated_at as "updatedAt"`,
      [
        assetId,
        assetCode,
        orgId,
        branchId,
        data.name,
        data.category || 'FURNITURE',
        data.roomLocation || '',
        data.purchaseDate ? new Date(data.purchaseDate) : new Date(),
        Number(data.cost) || 0,
        data.status || 'OPERATIONAL',
        qrPayload
      ]
    );

    return asset;
  }

  async listAssets(orgId: string, branchId?: string, category?: string) {
    let sql = `SELECT id, id as "_id", asset_code as "assetCode", organization_id as "organizationId",
                      branch_id as "branchId", name, category, room_location as "roomLocation",
                      purchase_date as "purchaseDate", cost, status, qr_payload as "qrPayload",
                      created_at as "createdAt", updated_at as "updatedAt"
               FROM assets
               WHERE organization_id = $1`;
    const params: any[] = [orgId];

    if (branchId && branchId !== 'ALL') {
      params.push(branchId);
      sql += ` AND branch_id = $${params.length}`;
    }
    if (category && category !== 'ALL') {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';
    return queryRows(sql, params);
  }

  async updateAssetStatus(orgId: string, id: string, status: string) {
    const asset = await queryOne<any>(
      `UPDATE assets
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE (id = $2 OR asset_code = $2) AND organization_id = $3
       RETURNING id, id as "_id", asset_code as "assetCode", organization_id as "organizationId",
                 branch_id as "branchId", name, category, room_location as "roomLocation",
                 purchase_date as "purchaseDate", cost, status, qr_payload as "qrPayload",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [status, id, orgId]
    );
    if (!asset) throw new AppError('Asset not found', 404);
    return asset;
  }
}

export const inventoryService = new InventoryService();
