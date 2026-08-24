import { Router, Request, Response, NextFunction } from 'express';
import { inventoryService } from './inventory.service';
import { query } from '../../config/database';
import { authenticate } from '../../common/guards/auth.guard';
import { enforceTenantIsolation } from '../../common/guards/tenant.guard';
import { authorizeRoles } from '../../common/guards/roles.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate, enforceTenantIsolation);

const handleListAssets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId, category } = req.query;
    const assets = await inventoryService.listAssets(req.user!.organizationId, branchId as string, category as string);
    const mapped = assets.map((a: any) => ({
      id: a.id || a._id,
      _id: a.id || a._id,
      assetCode: a.assetCode,
      name: a.name,
      category: a.category || 'FURNITURE',
      quantity: a.quantity || 1,
      cost: a.cost || a.purchasePrice || 0,
      condition: a.condition || 'GOOD',
      status: a.status || 'IN_USE',
      roomLocation: a.roomLocation || 'General',
      purchaseDate: a.purchaseDate,
      qrPayload: a.qrPayload,
    }));
    res.json({ success: true, data: mapped });
  } catch (err) { next(err); }
};

const handleCreateAsset = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.body.branchId || req.user!.branchId || 'default-branch';
    const asset = await inventoryService.createAsset(req.user!.organizationId, branchId, req.body);
    res.status(201).json({ success: true, data: asset, message: `Asset registered with Code ${asset.assetCode}` });
  } catch (err) { next(err); }
};

const handleUpdateStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const asset = await inventoryService.updateAssetStatus(req.user!.organizationId, req.params.id, req.body.status || req.body.condition);
    res.json({ success: true, data: asset, message: 'Asset status updated successfully' });
  } catch (err) { next(err); }
};

router.get('/', handleListAssets);
router.get('/assets', handleListAssets);
router.post('/', authorizeRoles(UserRole.OWNER, UserRole.STORE_MANAGER, UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN), handleCreateAsset);
router.post('/assets', authorizeRoles(UserRole.OWNER, UserRole.STORE_MANAGER, UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN), handleCreateAsset);
router.patch('/:id/status', authorizeRoles(UserRole.OWNER, UserRole.STORE_MANAGER, UserRole.BRANCH_MANAGER, UserRole.MAINTENANCE_STAFF, UserRole.SUPER_ADMIN), handleUpdateStatus);
router.patch('/assets/:id/status', authorizeRoles(UserRole.OWNER, UserRole.STORE_MANAGER, UserRole.BRANCH_MANAGER, UserRole.MAINTENANCE_STAFF, UserRole.SUPER_ADMIN), handleUpdateStatus);

router.delete('/:id', authorizeRoles(UserRole.OWNER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await query('DELETE FROM assets WHERE (id = $1 OR asset_code = $1) AND organization_id = $2', [req.params.id, req.user!.organizationId]);
    res.json({ success: true, message: 'Asset removed successfully' });
  } catch (err) { next(err); }
});

export const inventoryRouter = router;
