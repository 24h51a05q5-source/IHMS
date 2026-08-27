import { query, queryOne, queryRows } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { BedStatus } from '../../config/constants';
import { emitRealTimeEvent } from '../../events/events.gateway';
import { generateIhmsId } from '../../common/utils/code-generator';

export interface IRoom {
  id: string;
  _id?: string;
  roomNumber: string;
  number?: string;
  roomCode?: string;
  floor?: number;
  floorNumber?: number;
  buildingName?: string;
  blockName?: string;
  capacity?: number;
  totalBeds?: number;
  occupied?: number;
  occupiedBeds?: number;
  available?: number;
  availableBeds?: number;
  hostelId: string;
  branchId?: string;
  hostelName?: string;
  branchCode?: string;
  type?: string;
  roomType?: string;
  monthlyRentPerBed?: number;
  monthlyRate?: number;
  status?: string;
  amenities?: string[];
  beds?: any[];
  createdAt?: string;
  updatedAt?: string;
}

export interface IBed {
  id: string;
  _id?: string;
  number?: string;
  bedNumber: number;
  bedCode: string;
  roomId: string;
  roomCode?: string;
  hostelId?: string;
  branchId?: string;
  status: string;
  monthlyRate?: number;
  monthlyFee?: number;
  studentId?: string;
  currentStudentId?: string;
  customerCode?: string;
  currentCustomerCode?: string;
  studentName?: string;
  currentStudentName?: string;
  allocatedAt?: string;
  student?: any;
}

export class RoomService {
  async createRoom(orgId: string, branchId: string, data: any): Promise<{ room: any; beds: any[] }> {
    const branch = await queryOne<any>(
      'SELECT id, branch_code as "branchCode", name FROM hostels WHERE id = $1 AND organization_id = $2',
      [branchId, orgId]
    );
    if (!branch) throw new AppError('Hostel branch not found', 404);

    const bCode = branch.branchCode || 'HYD001';
    const roomNumber = String(data.roomNumber || data.number || '101').trim();
    const floorNumber = Number(data.floorNumber ?? data.floor ?? 1);
    const blockName = String(data.blockName || '1').trim();
    const buildingName = String(data.buildingName || 'Main Building').trim();

    const existingRoom = await queryOne(
      'SELECT id FROM rooms WHERE organization_id = $1 AND hostel_id = $2 AND room_number = $3',
      [orgId, branchId, roomNumber]
    );
    if (existingRoom) {
      throw new AppError(`Room '${roomNumber}' already exists in this hostel branch.`, 400);
    }

    const bedCount = Number(data.totalBeds || data.capacity || 2);
    const monthlyRate = Number(data.monthlyRate || data.monthlyRentPerBed || 8000);
    const roomType = data.roomType || data.type || (bedCount === 1 ? 'SINGLE' : bedCount === 2 ? 'DOUBLE' : bedCount === 3 ? 'TRIPLE' : 'FOUR_SHARING');
    const roomId = require('crypto').randomUUID();
    const roomCode = await generateIhmsId('R', branch.name, 'Main', orgId);

    const room = await queryOne<any>(
      `INSERT INTO rooms (
        id, room_number, room_code, hostel_id, organization_id, room_type, floor, floor_number,
        building_name, block_name, capacity, total_beds, occupied_beds, available_beds,
        monthly_rent, monthly_rate, status, amenities
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, $13, $14, $15, $16, $17)
      RETURNING id, id as "_id", room_number as "roomNumber", room_number as "number",
                room_code as "roomCode", hostel_id as "hostelId", hostel_id as "branchId", room_type as "type",
                room_type as "roomType", floor, floor_number as "floorNumber",
                building_name as "buildingName", block_name as "blockName",
                capacity, total_beds as "totalBeds", occupied_beds as "occupied",
                occupied_beds as "occupiedBeds", available_beds as "available",
                available_beds as "availableBeds", monthly_rent as "monthlyRentPerBed",
                monthly_rate as "monthlyRate", status, created_at as "createdAt", updated_at as "updatedAt"`,
      [
        roomId,
        roomNumber,
        roomCode,
        branchId,
        orgId,
        roomType,
        floorNumber,
        floorNumber,
        buildingName,
        blockName,
        bedCount,
        bedCount,
        bedCount,
        monthlyRate,
        monthlyRate,
        data.status || 'ACTIVE',
        Array.isArray(data.amenities) ? data.amenities.join(',') : (data.amenities || 'Bed,Study Table,Cupboard,Fan')
      ]
    );

    const beds: any[] = [];
    for (let i = 1; i <= bedCount; i++) {
      const bedId = require('crypto').randomUUID();
      const bedCode = await generateIhmsId('B', branch.name, 'Main', orgId);
      const bed = await queryOne<any>(
        `INSERT INTO beds (
          id, room_id, hostel_id, organization_id, bed_number, bed_code,
          monthly_rate, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, id as "_id", bed_number as "bedNumber", bed_number as "number",
                  bed_code as "bedCode", room_id as "roomId", hostel_id as "hostelId",
                  hostel_id as "branchId", monthly_rate as "monthlyRate",
                  monthly_rate as "monthlyFee", status, created_at as "createdAt"`,
        [bedId, roomId, branchId, orgId, i, bedCode, monthlyRate, BedStatus.AVAILABLE]
      );
      beds.push(bed);
    }

    emitRealTimeEvent('branch.capacity_updated', { branchId, totalCapacity: bedCount }, { branchId });
    emitRealTimeEvent('dashboard.kpi_updated', { orgId, branchId }, { orgId });

    return { room, beds };
  }

  async getRoomById(orgId: string, roomId: string): Promise<any> {
    const room = await queryOne<any>(
      `SELECT r.id, r.id as "_id", r.room_number as "number", r.room_number as "roomNumber",
              r.floor, r.floor_number as "floorNumber", r.block_name as "blockName",
              r.building_name as "buildingName", r.capacity, r.total_beds as "totalBeds",
              r.hostel_id as "hostelId", r.hostel_id as "branchId", h.name as "hostelName",
              h.branch_code as "branchCode", r.room_type as "type", r.room_type as "roomType",
              r.monthly_rent as "monthlyRentPerBed", r.monthly_rate as "monthlyRate",
              r.status, r.amenities, r.created_at as "createdAt", r.updated_at as "updatedAt"
       FROM rooms r
       LEFT JOIN hostels h ON h.id = r.hostel_id
       WHERE r.id = $1 AND r.organization_id = $2`,
      [roomId, orgId]
    );
    if (!room) throw new AppError('Room not found', 404);

    const beds = await queryRows<any>(
      `SELECT b.id, b.id as "_id", b.bed_number as "number", b.bed_number as "bedNumber",
              b.bed_code as "bedCode", b.room_id as "roomId", b.status,
              b.monthly_rate as "monthlyRate", b.monthly_rate as "monthlyFee",
              b.current_student_id as "studentId", b.current_student_name as "studentName",
              b.current_customer_code as "customerCode", b.allocated_at as "allocatedAt",
              s.full_name as "studentFullName", s.email as "studentEmail", s.phone as "studentPhone",
              s.gender as "studentGender"
       FROM beds b
       LEFT JOIN students s ON s.id = b.current_student_id
       WHERE b.room_id = $1 AND b.organization_id = $2
       ORDER BY b.bed_number ASC`,
      [roomId, orgId]
    );

    const formattedBeds = beds.map((b) => ({
      id: b.id,
      _id: b.id,
      number: String(b.bedNumber),
      bedNumber: String(b.bedNumber),
      bedCode: b.bedCode,
      status: b.status,
      monthlyRate: Number(b.monthlyRate || room.monthlyRate || 0),
      monthlyFee: Number(b.monthlyRate || room.monthlyRate || 0),
      studentId: b.studentId,
      studentName: b.studentName || b.studentFullName,
      customerCode: b.customerCode,
      allocatedAt: b.allocatedAt,
      student: b.studentId ? {
        fullName: b.studentFullName,
        customerCode: b.customerCode,
        email: b.studentEmail,
        phone: b.studentPhone,
        gender: b.studentGender,
      } : null,
    }));

    const occupied = formattedBeds.filter((b) => b.status === BedStatus.OCCUPIED || b.studentId).length;
    const capacity = Number(room.capacity || formattedBeds.length || 1);

    return {
      ...room,
      capacity,
      totalBeds: capacity,
      occupied,
      occupiedBeds: occupied,
      available: Math.max(0, capacity - occupied),
      availableBeds: Math.max(0, capacity - occupied),
      amenities: typeof room.amenities === 'string' ? room.amenities.split(',').filter(Boolean) : ['Bed', 'Study Table', 'Cupboard', 'Fan'],
      beds: formattedBeds,
    };
  }

  async updateRoom(orgId: string, roomId: string, data: any): Promise<any> {
    const existing = await queryOne<any>(
      'SELECT * FROM rooms WHERE id = $1 AND organization_id = $2',
      [roomId, orgId]
    );
    if (!existing) throw new AppError('Room not found', 404);

    const newRoomNumber = data.roomNumber !== undefined ? String(data.roomNumber).trim() : (data.number !== undefined ? String(data.number).trim() : existing.room_number);
    const newFloorNumber = data.floorNumber !== undefined ? Number(data.floorNumber) : (data.floor !== undefined ? Number(data.floor) : existing.floor_number);
    const newBlockName = data.blockName !== undefined ? String(data.blockName).trim() : existing.block_name;
    const newBuildingName = data.buildingName !== undefined ? String(data.buildingName).trim() : existing.building_name;
    const newMonthlyRate = data.monthlyRate !== undefined ? Number(data.monthlyRate) : (data.monthlyRentPerBed !== undefined ? Number(data.monthlyRentPerBed) : Number(existing.monthly_rate));
    const newRoomType = data.roomType || data.type || existing.room_type;
    const newStatus = data.status || existing.status;
    const newAmenities = Array.isArray(data.amenities) ? data.amenities.join(',') : (data.amenities || existing.amenities);

    // Bed capacity updates
    const currentBeds = await queryRows<any>(
      'SELECT * FROM beds WHERE room_id = $1 AND organization_id = $2 ORDER BY bed_number ASC',
      [roomId, orgId]
    );
    const occupiedBeds = currentBeds.filter((b) => b.status === BedStatus.OCCUPIED || Boolean(b.current_student_id));
    const targetCapacity = data.totalBeds !== undefined ? Number(data.totalBeds) : (data.capacity !== undefined ? Number(data.capacity) : currentBeds.length);

    if (targetCapacity < occupiedBeds.length) {
      throw new AppError(
        `Cannot reduce room capacity to ${targetCapacity}. The room currently has ${occupiedBeds.length} occupied bed(s). Please vacate or reassign students first.`,
        400
      );
    }

    const branch = await queryOne<any>('SELECT branch_code FROM hostels WHERE id = $1', [existing.hostel_id]);
    const bCode = branch?.branch_code || 'HYD001';

    if (targetCapacity > currentBeds.length) {
      const maxBedNumber = currentBeds.reduce((max, b) => Math.max(max, Number(b.bed_number) || 0), 0);
      const bedsToAdd = targetCapacity - currentBeds.length;
      for (let i = 1; i <= bedsToAdd; i++) {
        const nextNum = maxBedNumber + i;
        const bedId = require('crypto').randomUUID();
        const bedCode = await generateIhmsId('B', branch?.name, 'Main', orgId);
        await query(
          `INSERT INTO beds (id, room_id, hostel_id, organization_id, bed_number, bed_code, monthly_rate, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [bedId, roomId, existing.hostel_id, orgId, nextNum, bedCode, newMonthlyRate, BedStatus.AVAILABLE]
        );
      }
    } else if (targetCapacity < currentBeds.length) {
      const availableBeds = currentBeds
        .filter((b) => b.status !== BedStatus.OCCUPIED && !b.current_student_id)
        .sort((a, b) => Number(b.bed_number) - Number(a.bed_number));
      const bedsToRemoveCount = currentBeds.length - targetCapacity;
      const toDelete = availableBeds.slice(0, bedsToRemoveCount);
      for (const bed of toDelete) {
        await query('DELETE FROM beds WHERE id = $1 AND organization_id = $2', [bed.id, orgId]);
      }
    }

    // Update bed codes and rates if room number changed
    await query(
      `UPDATE rooms
       SET room_number = $3, floor = $4, floor_number = $4, block_name = $5,
           building_name = $6, monthly_rent = $7, monthly_rate = $7, room_type = $8,
           capacity = $9, total_beds = $9, status = $10, amenities = $11,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2`,
      [
        roomId,
        orgId,
        newRoomNumber,
        newFloorNumber,
        newBlockName,
        newBuildingName,
        newMonthlyRate,
        newRoomType,
        targetCapacity,
        newStatus,
        newAmenities
      ]
    );

    return this.getRoomById(orgId, roomId);
  }

  async deleteRoom(orgId: string, roomId: string): Promise<{ success: boolean; message: string }> {
    const room = await queryOne<any>('SELECT * FROM rooms WHERE id = $1 AND organization_id = $2', [roomId, orgId]);
    if (!room) throw new AppError('Room not found', 404);

    const occupiedBeds = await queryRows<any>(
      "SELECT id FROM beds WHERE room_id = $1 AND organization_id = $2 AND (status = 'OCCUPIED' OR current_student_id IS NOT NULL)",
      [roomId, orgId]
    );

    const assignedStudents = await queryRows<any>(
      "SELECT id FROM students WHERE room_id = $1 AND organization_id = $2 AND status = 'ACTIVE'",
      [roomId, orgId]
    );

    if (occupiedBeds.length > 0 || assignedStudents.length > 0) {
      throw new AppError(
        `Cannot delete Room ${room.room_number}: This room contains ${occupiedBeds.length || assignedStudents.length} occupied bed(s) or assigned student(s). Please reassign or vacate all students before deleting.`,
        400
      );
    }

    await query('DELETE FROM beds WHERE room_id = $1 AND organization_id = $2', [roomId, orgId]);
    await query('DELETE FROM rooms WHERE id = $1 AND organization_id = $2', [roomId, orgId]);

    emitRealTimeEvent('branch.capacity_updated', { branchId: room.hostel_id }, { branchId: room.hostel_id });
    emitRealTimeEvent('dashboard.kpi_updated', { orgId, branchId: room.hostel_id }, { orgId });

    return {
      success: true,
      message: `Room ${room.room_number} and its beds have been successfully deleted.`,
    };
  }

  async addBedToRoom(orgId: string, roomId: string, data?: any): Promise<any> {
    const room = await queryOne<any>('SELECT * FROM rooms WHERE id = $1 AND organization_id = $2', [roomId, orgId]);
    if (!room) throw new AppError('Room not found', 404);

    const branch = await queryOne<any>('SELECT branch_code FROM hostels WHERE id = $1', [room.hostel_id]);
    const bCode = branch?.branch_code || 'HYD001';

    const currentBeds = await queryRows<any>('SELECT bed_number FROM beds WHERE room_id = $1 AND organization_id = $2', [roomId, orgId]);
    const maxBedNumber = currentBeds.reduce((max, b) => Math.max(max, Number(b.bed_number) || 0), 0);
    const nextBedNumber = maxBedNumber + 1;
    const bedCode = await generateIhmsId('B', branch?.name, 'Main', orgId);
    const bedId = require('crypto').randomUUID();

    const bed = await queryOne<any>(
      `INSERT INTO beds (id, room_id, hostel_id, organization_id, bed_number, bed_code, monthly_rate, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, id as "_id", bed_number as "bedNumber", bed_number as "number",
                 bed_code as "bedCode", room_id as "roomId", hostel_id as "hostelId",
                 monthly_rate as "monthlyRate", status, created_at as "createdAt"`,
      [
        bedId,
        roomId,
        room.hostel_id,
        orgId,
        nextBedNumber,
        bedCode,
        Number(data?.monthlyRate || room.monthly_rate || 8000),
        data?.status || BedStatus.AVAILABLE
      ]
    );

    await query('UPDATE rooms SET capacity = capacity + 1, total_beds = total_beds + 1 WHERE id = $1', [roomId]);

    return {
      bed,
      room: await this.getRoomById(orgId, roomId),
    };
  }

  async updateBed(orgId: string, bedId: string, data: any): Promise<any> {
    const bed = await queryOne<any>('SELECT * FROM beds WHERE id = $1 AND organization_id = $2', [bedId, orgId]);
    if (!bed) throw new AppError('Bed not found', 404);

    if (data.status === BedStatus.AVAILABLE && bed.status === BedStatus.OCCUPIED) {
      if (bed.current_student_id) {
        await query('UPDATE students SET bed_id = NULL, room_id = NULL WHERE id = $1', [bed.current_student_id]);
      }
      await query(
        `UPDATE beds
         SET status = $3, current_student_id = NULL, current_customer_code = NULL,
             current_student_name = NULL, allocated_at = NULL,
             monthly_rate = COALESCE($4, monthly_rate), bed_code = COALESCE($5, bed_code),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2`,
        [bedId, orgId, BedStatus.AVAILABLE, data.monthlyRate, data.bedCode]
      );
    } else {
      await query(
        `UPDATE beds
         SET status = COALESCE($3, status),
             monthly_rate = COALESCE($4, monthly_rate),
             bed_code = COALESCE($5, bed_code),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2`,
        [bedId, orgId, data.status, data.monthlyRate, data.bedCode]
      );
    }

    return queryOne('SELECT * FROM beds WHERE id = $1 AND organization_id = $2', [bedId, orgId]);
  }

  async deleteBed(orgId: string, bedId: string): Promise<{ success: boolean; message: string }> {
    const bed = await queryOne<any>('SELECT * FROM beds WHERE id = $1 AND organization_id = $2', [bedId, orgId]);
    if (!bed) throw new AppError('Bed not found', 404);

    if (bed.status === BedStatus.OCCUPIED || Boolean(bed.current_student_id)) {
      throw new AppError(
        `Cannot delete Bed '${bed.bed_code}': A student is currently assigned to this bed. Please reassign or vacate first.`,
        400
      );
    }

    await query('DELETE FROM beds WHERE id = $1 AND organization_id = $2', [bedId, orgId]);
    await query('UPDATE rooms SET capacity = GREATEST(0, capacity - 1), total_beds = GREATEST(0, total_beds - 1) WHERE id = $1', [bed.room_id]);

    return {
      success: true,
      message: `Bed ${bed.bed_code} deleted successfully.`,
    };
  }

  async listRooms(orgId: string, branchId?: string): Promise<any[]> {
    let sql = `SELECT r.id, r.id as "_id", r.room_number as "number", r.room_number as "roomNumber",
                      r.floor, r.floor_number as "floorNumber", r.block_name as "blockName",
                      r.building_name as "buildingName", r.capacity, r.total_beds as "totalBeds",
                      r.hostel_id as "hostelId", r.hostel_id as "branchId", h.name as "hostelName",
                      h.branch_code as "branchCode", r.room_type as "type", r.room_type as "roomType",
                      r.monthly_rent as "monthlyRentPerBed", r.monthly_rate as "monthlyRate",
                      r.status, r.amenities, r.created_at as "createdAt", r.updated_at as "updatedAt"
               FROM rooms r
               LEFT JOIN hostels h ON h.id = r.hostel_id
               WHERE r.organization_id = $1`;
    const params: any[] = [orgId];

    if (branchId && branchId !== 'ALL') {
      params.push(branchId);
      sql += ` AND (r.hostel_id = $${params.length} OR h.branch_code = $${params.length})`;
    }

    sql += ' ORDER BY r.room_number ASC';
    const rows = await queryRows<any>(sql, params);

    const allBeds = await queryRows<any>(
      `SELECT b.id, b.id as "_id", b.bed_number as "number", b.bed_number as "bedNumber",
              b.bed_code as "bedCode", b.room_id as "roomId", b.status,
              b.monthly_rate as "monthlyRate", b.monthly_rate as "monthlyFee",
              b.current_student_id as "studentId", b.current_student_name as "studentName",
              b.current_customer_code as "customerCode", b.allocated_at as "allocatedAt"
       FROM beds b
       WHERE b.organization_id = $1`,
      [orgId]
    );

    const bedsByRoom: Record<string, any[]> = {};
    allBeds.forEach((b) => {
      if (!bedsByRoom[b.roomId]) bedsByRoom[b.roomId] = [];
      bedsByRoom[b.roomId].push(b);
    });

    return rows.map((r) => {
      const roomBeds = bedsByRoom[r.id] || [];
      const occupied = roomBeds.filter((b: any) => b.status === 'OCCUPIED' || Boolean(b.studentId)).length;
      const capacity = Number(r.capacity || roomBeds.length || 1);
      return {
        ...r,
        occupied,
        occupiedBeds: occupied,
        available: Math.max(0, capacity - occupied),
        availableBeds: Math.max(0, capacity - occupied),
        amenities: typeof r.amenities === 'string' ? r.amenities.split(',').filter(Boolean) : ['Bed', 'Study Table', 'Cupboard', 'Fan'],
        beds: roomBeds,
      };
    });
  }

  async listBeds(orgId: string, branchId?: string, status?: string): Promise<any[]> {
    let sql = `SELECT b.id, b.id as "_id", b.bed_number as "number", b.bed_number as "bedNumber",
                      b.bed_code as "bedCode", b.room_id as "roomId", b.hostel_id as "hostelId",
                      b.hostel_id as "branchId", b.status, b.monthly_rate as "monthlyRate",
                      b.monthly_rate as "monthlyFee", b.current_student_id as "studentId",
                      b.current_student_name as "studentName", b.current_customer_code as "customerCode",
                      b.allocated_at as "allocatedAt"
               FROM beds b
               WHERE b.organization_id = $1`;
    const params: any[] = [orgId];

    if (branchId && branchId !== 'ALL') {
      params.push(branchId);
      sql += ` AND b.hostel_id = $${params.length}`;
    }
    if (status && status !== 'ALL') {
      params.push(status);
      sql += ` AND b.status = $${params.length}`;
    }

    sql += ' ORDER BY b.bed_code ASC';
    return queryRows(sql, params);
  }

  async updateBedStatus(orgId: string, bedId: string, status: BedStatus, notes?: string): Promise<any> {
    return this.updateBed(orgId, bedId, { status });
  }
}
export const roomService = new RoomService();
