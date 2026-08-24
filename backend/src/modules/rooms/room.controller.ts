import { Router, Request, Response, NextFunction } from 'express';
import { roomService } from './room.service';
import { query, queryOne, queryRows } from '../../config/database';
import { authenticate, authorize } from '../../common/guards/auth.guard';
import { UserRole } from '../../config/constants';

const router = Router();
router.use(authenticate);
router.use(authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.WARDEN, UserRole.MAINTENANCE_STAFF));

// ==========================================
// BEDS ENDPOINTS (/api/beds or /api/rooms/beds)
// ==========================================

// GET /beds
router.get('/beds', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId, status, page = 1, pageSize = 100 } = req.query;
    const orgId = req.user!.organizationId;

    let sql = 'SELECT * FROM beds WHERE organization_id = $1';
    const params: any[] = [orgId];

    if (roomId) {
      params.push(roomId);
      sql += ` AND room_id = $${params.length}`;
    }
    if (status && status !== 'ALL') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    const countSql = `SELECT COUNT(*)::int as total FROM (${sql}) as sub`;
    const totalRow = await queryOne<any>(countSql, params);
    const total = totalRow?.total || 0;

    const limit = Number(pageSize);
    const offset = (Number(page) - 1) * limit;
    sql += ` ORDER BY bed_number ASC LIMIT ${limit} OFFSET ${offset}`;

    const beds = await queryRows<any>(sql, params);

    const mapped = beds.map((b: any) => ({
      id: b.id,
      _id: b.id,
      number: String(b.bed_number),
      bedNumber: String(b.bed_number),
      bedCode: b.bed_code,
      roomId: b.room_id,
      status: b.status,
      studentId: b.current_student_id,
      studentName: b.current_student_name,
      customerCode: b.current_customer_code,
      monthlyFee: Number(b.monthly_rate || 0),
      monthlyRate: Number(b.monthly_rate || 0),
    }));

    res.json({
      success: true,
      data: {
        items: mapped,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) { next(err); }
});

// GET /beds/:id
router.get('/beds/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bed = await queryOne<any>('SELECT * FROM beds WHERE (id = $1 OR bed_code = $1) AND organization_id = $2', [req.params.id, req.user!.organizationId]);
    if (!bed) return res.status(404).json({ success: false, message: 'Bed not found' });
    res.json({
      success: true,
      data: {
        id: bed.id,
        _id: bed.id,
        number: String(bed.bed_number),
        bedNumber: String(bed.bed_number),
        bedCode: bed.bed_code,
        roomId: bed.room_id,
        status: bed.status,
        studentId: bed.current_student_id,
        studentName: bed.current_student_name,
        customerCode: bed.current_customer_code,
        monthlyFee: Number(bed.monthly_rate || 0),
        monthlyRate: Number(bed.monthly_rate || 0),
      },
    });
  } catch (err) { next(err); }
});

// POST /beds (Create individual bed)
router.post('/beds', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId, monthlyRate, status } = req.body;
    if (!roomId) return res.status(400).json({ success: false, message: 'roomId is required' });
    const result = await roomService.addBedToRoom(req.user!.organizationId, roomId, { monthlyRate, status });
    res.status(201).json({ success: true, data: result.bed, message: 'Bed added successfully' });
  } catch (err) { next(err); }
});

// PATCH & PUT /beds/:id
const handleUpdateBed = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, monthlyRate, monthlyFee, bedCode } = req.body;
    const rate = monthlyRate !== undefined ? monthlyRate : monthlyFee;
    const updated = await roomService.updateBed(req.user!.organizationId, req.params.id, {
      status,
      monthlyRate: rate !== undefined ? Number(rate) : undefined,
      bedCode,
    });
    res.json({ success: true, data: updated, message: 'Bed updated successfully' });
  } catch (err) { next(err); }
};
router.patch('/beds/:id', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), handleUpdateBed);
router.put('/beds/:id', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), handleUpdateBed);

// DELETE /beds/:id
router.delete('/beds/:id', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await roomService.deleteBed(req.user!.organizationId, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

// PATCH /beds/:id/assign
router.patch('/beds/:id/assign', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.body;
    const bed = await queryOne<any>(
      `UPDATE beds
       SET status = 'OCCUPIED', current_student_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [studentId, req.params.id, req.user!.organizationId]
    );
    res.json({ success: true, data: bed });
  } catch (err) { next(err); }
});

// PATCH /beds/:id/vacate
router.patch('/beds/:id/vacate', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bed = await roomService.updateBed(req.user!.organizationId, req.params.id, { status: 'AVAILABLE' as any });
    res.json({ success: true, data: bed, message: 'Bed vacated successfully' });
  } catch (err) { next(err); }
});

// ==========================================
// ROOMS ENDPOINTS (/api/rooms)
// ==========================================

// GET / (List Rooms)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId, hostelId, page = 1, pageSize = 50 } = req.query;
    const orgId = req.user!.organizationId;
    const targetBranch = (branchId || hostelId) as string;

    const rooms = await roomService.listRooms(orgId, targetBranch);
    const limit = Number(pageSize);
    const offset = (Number(page) - 1) * limit;
    const paged = rooms.slice(offset, offset + limit);

    res.json({
      success: true,
      data: {
        items: paged,
        total: rooms.length,
        page: Number(page),
        pageSize: limit,
        totalPages: Math.ceil(rooms.length / limit) || 1,
      },
    });
  } catch (err) { next(err); }
});

// POST / (Create Room)
router.post('/', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId, hostelId, roomNumber, number, floorNumber, floor, capacity, totalBeds, roomType, type, monthlyRentPerBed, monthlyRate, buildingName, blockName, amenities, status } = req.body;
    const targetBranch = branchId || hostelId;
    const result = await roomService.createRoom(req.user!.organizationId, targetBranch, {
      buildingName: buildingName || 'Main Building',
      blockName: blockName || '1',
      roomNumber: Number(roomNumber || number || 101),
      floorNumber: Number(floorNumber ?? floor ?? 1),
      totalBeds: Number(totalBeds || capacity || 2),
      roomType: roomType || type || 'DOUBLE',
      monthlyRate: Number(monthlyRate || monthlyRentPerBed || 8000),
      amenities,
      status,
    });
    res.status(201).json({ success: true, data: result.room, message: 'Room and beds generated successfully' });
  } catch (err) { next(err); }
});

// GET /:id (Get Single Room Details)
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roomDetails = await roomService.getRoomById(req.user!.organizationId, req.params.id);
    res.json({ success: true, data: roomDetails });
  } catch (err) { next(err); }
});

// PUT & PATCH /:id (Update Room)
const handleUpdateRoom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await roomService.updateRoom(req.user!.organizationId, req.params.id, req.body);
    res.json({ success: true, data: updated, message: 'Room updated successfully' });
  } catch (err) { next(err); }
};
router.put('/:id', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), handleUpdateRoom);
router.patch('/:id', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), handleUpdateRoom);

// DELETE /:id (Delete Room)
router.delete('/:id', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await roomService.deleteRoom(req.user!.organizationId, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /:id/beds (Get Beds for Room)
router.get('/:id/beds', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query;
    const orgId = req.user!.organizationId;
    let sql = 'SELECT * FROM beds WHERE organization_id = $1 AND room_id = $2';
    const params: any[] = [orgId, req.params.id];
    if (status && status !== 'ALL') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    sql += ' ORDER BY bed_number ASC';
    const beds = await queryRows<any>(sql, params);

    res.json({
      success: true,
      data: beds.map((b: any) => ({
        id: b.id,
        _id: b.id,
        number: String(b.bed_number),
        bedNumber: String(b.bed_number),
        bedCode: b.bed_code,
        roomId: b.room_id,
        status: b.status,
        monthlyFee: Number(b.monthly_rate || 0),
        monthlyRate: Number(b.monthly_rate || 0),
        studentId: b.current_student_id,
        studentName: b.current_student_name,
        customerCode: b.current_customer_code,
      })),
    });
  } catch (err) { next(err); }
});

// POST /:id/beds (Add Bed to Room)
router.post('/:id/beds', authorize(UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.WARDEN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await roomService.addBedToRoom(req.user!.organizationId, req.params.id, req.body);
    res.status(201).json({ success: true, data: result, message: 'Bed added successfully' });
  } catch (err) { next(err); }
});

export const roomRouter = router;
