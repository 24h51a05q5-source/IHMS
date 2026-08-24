import { Router, Request, Response, NextFunction } from 'express';
import { hostelService } from './hostel.service';
import { query, queryOne, queryRows } from '../../config/database';
import { authenticate, authorize } from '../../common/guards/auth.guard';
import { UserRole } from '../../config/constants';
import { cleanHostelName } from '../auth/auth.service';

const router = Router();
router.use(authenticate);

async function resolveHostelInfo(orgId: string, b: any) {
  const org = await queryOne<any>('SELECT name FROM organizations WHERE id = $1', [orgId]);
  const hostelName = cleanHostelName(org?.name) || cleanHostelName(b?.hostel_name) || cleanHostelName(b?.name) || '';
  let branchName = (b?.branchName || b?.branch_name || '').trim();

  if (!branchName) {
    branchName = (b?.name && b.name.toLowerCase() !== hostelName.toLowerCase()) ? b.name : 'Main';
  }

  return { hostelName, branchName };
}

// GET /branches
router.get('/branches', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await queryOne<any>('SELECT name FROM organizations WHERE id = $1', [req.user!.organizationId]);
    const list = await hostelService.list(req.user!.organizationId);
    const mapped = list.map((b: any) => {
      const orgHostelName = cleanHostelName(org?.name) || cleanHostelName(b.hostel_name) || cleanHostelName(b.name) || '';
      let branchName = (b.branchName || b.branch_name || '').trim();
      if (!branchName) {
        branchName = (b.name && b.name.toLowerCase() !== orgHostelName.toLowerCase()) ? b.name : 'Main';
      }
      return {
        id: b.id || b._id,
        code: b.branchCode || b.branch_code || '',
        branchCode: b.branchCode || b.branch_code || '',
        name: orgHostelName,
        hostelName: orgHostelName,
        branchName: branchName,
        city: b.city || 'Hyderabad',
        state: b.state || 'Telangana',
        type: b.type || 'BOYS',
        address: b.address || '',
        capacity: b.totalCapacity || b.total_capacity || 0,
      };
    });
    res.json({ success: true, data: mapped });
  } catch (err) { next(err); }
});

// GET /hostels or GET /
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await hostelService.list(req.user!.organizationId);
    const mapped = await Promise.all(
      list.map(async (b: any) => {
        const { hostelName, branchName } = await resolveHostelInfo(req.user!.organizationId, b);
        return {
          id: b.id || b._id,
          _id: b.id || b._id,
          name: hostelName,
          hostelName: hostelName,
          branchName: branchName,
          code: b.branchCode || b.branch_code || '',
          branchCode: b.branchCode || b.branch_code || '',
          branchId: b.id || b._id,
          type: b.type || 'BOYS',
          address: b.address || '',
          city: b.city || '',
          state: b.state || '',
          phone: b.contactPhone || b.phone || b.contact_number || '',
          email: b.contactEmail || b.email || '',
          totalRooms: b.totalRooms || 0,
          totalBeds: b.totalBeds || b.totalCapacity || b.total_capacity || 0,
          totalCapacity: b.totalCapacity || b.total_capacity || 0,
          currentOccupancy: b.occupiedBeds || b.currentOccupancy || b.current_occupancy || 0,
          status: b.status || 'ACTIVE',
        };
      })
    );
    res.json({ success: true, data: mapped });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b: any = await hostelService.getById(req.user!.organizationId, req.params.id);
    const { hostelName, branchName } = await resolveHostelInfo(req.user!.organizationId, b);
    const mapped = {
      id: b.id || b._id,
      _id: b.id || b._id,
      name: hostelName,
      hostelName: hostelName,
      branchName: branchName,
      code: b.branchCode || b.branch_code || '',
      branchCode: b.branchCode || b.branch_code || '',
      branchId: b.id || b._id,
      type: b.type || 'BOYS',
      address: b.address || '',
      city: b.city || '',
      state: b.state || '',
      phone: b.contactPhone || b.phone || b.contact_number || '',
      email: b.contactEmail || b.email || '',
      totalRooms: b.totalRooms || 0,
      totalBeds: b.totalCapacity || b.total_capacity || 0,
      totalCapacity: b.totalCapacity || b.total_capacity || 0,
      currentOccupancy: b.currentOccupancy || b.current_occupancy || 0,
      status: b.status || 'ACTIVE',
    };
    res.json({ success: true, data: mapped });
  } catch (err) { next(err); }
});

router.post('/', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await queryOne<any>('SELECT name FROM organizations WHERE id = $1', [req.user!.organizationId]);
    const payload = {
      ...req.body,
      name: org?.name || req.body.name || req.body.hostelName || '',
      branchName: req.body.branchName || req.body.name || 'Main',
      contactPhone: req.body.phone || req.body.contactPhone || '',
      contactEmail: req.body.email || req.body.contactEmail || '',
    };
    const b = await hostelService.create(req.user!.organizationId, payload);
    res.status(201).json({ success: true, data: b, message: 'Hostel branch created successfully' });
  } catch (err) { next(err); }
});

const handleUpdate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = {
      ...req.body,
      name: req.body.name || req.body.hostelName,
      branchName: req.body.branchName,
      contactPhone: req.body.phone || req.body.contactPhone,
      contactEmail: req.body.email || req.body.contactEmail,
    };
    const b = await hostelService.update(req.user!.organizationId, req.params.id, payload);

    if (req.body.hostelName || req.body.organizationName || req.body.name) {
      const newHostelName = (req.body.hostelName || req.body.organizationName || req.body.name).trim();
      await query('UPDATE organizations SET name = $1 WHERE id = $2', [newHostelName, req.user!.organizationId]);
      await query('UPDATE users SET hostel_name = $1 WHERE organization_id = $2', [newHostelName, req.user!.organizationId]);
      await query('UPDATE hostels SET hostel_name = $1 WHERE organization_id = $2', [newHostelName, req.user!.organizationId]);
      await query('UPDATE owners SET registered_hostel_name = $1, business_name = $1 WHERE organization_id = $2', [newHostelName, req.user!.organizationId]);
    }

    res.json({ success: true, data: b, message: 'Hostel updated successfully' });
  } catch (err) { next(err); }
};

router.patch('/:id', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN), handleUpdate);
router.put('/:id', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN), handleUpdate);

export const hostelRouter = router;
