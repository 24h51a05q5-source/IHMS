import { connectDatabase, disconnectDatabase, query, queryOne } from '../src/config/database';
import { roomService } from '../src/modules/rooms/room.service';
import { studentService } from '../src/modules/students/student.service';
import { BedStatus } from '../src/config/constants';
import { redisService } from '../src/common/redis/redis.service';

describe('Digital Room/Bed Map - 3-Status System & Lifecycle Synchronization', () => {
  const orgId = 'org-bed-map-test';
  const hostelId = 'H201';
  let createdRoom: any;
  let bed1: any;
  let bed2: any;
  let bed3: any;
  let bed4: any;

  beforeAll(async () => {
    await connectDatabase();
    redisService.resetInMemory();

    // Setup test organization & hostel
    await query(
      `INSERT INTO organizations (id, org_code, name)
       VALUES ($1, 'MAP001', 'Bed Map Test Org')
       ON CONFLICT (id) DO NOTHING`,
      [orgId]
    );

    await query(
      `INSERT INTO hostels (id, hostel_id, organization_id, name, branch_name, branch_code)
       VALUES ($1, $1, $2, 'Sunrise Heights', 'Branch Alpha', 'SUN01')
       ON CONFLICT (id) DO NOTHING`,
      [hostelId, orgId]
    );
  });

  afterAll(async () => {
    await redisService.disconnect();
    await disconnectDatabase();
  });

  // ============================================================================
  // 1. Room Creation & Individual Bed Configuration
  // ============================================================================
  it('1. Room creation should configure individual beds with AVAILABLE (Green) status', async () => {
    const res = await roomService.createRoom(orgId, hostelId, {
      roomNumber: '201',
      floorNumber: 2,
      blockName: 'A',
      buildingName: 'Main Wing',
      capacity: 4,
      totalBeds: 4,
      roomType: 'FOUR_SHARING',
      monthlyRentPerBed: 8500,
    });

    createdRoom = res.room;
    expect(res.room).toBeDefined();
    expect(res.room.roomNumber).toBe('201');
    expect(res.beds).toHaveLength(4);

    // Each bed must be individually generated with AVAILABLE status
    res.beds.forEach((bed, idx) => {
      expect(bed.status).toBe(BedStatus.AVAILABLE);
      expect(bed.bedNumber).toBe(idx + 1);
      expect(bed.monthlyRate).toBe(8500);
    });

    [bed1, bed2, bed3, bed4] = res.beds;
  });

  // ============================================================================
  // 2. Listing Rooms & Beds Exposes Individual Bed Details
  // ============================================================================
  it('2. listRooms and getRoomById should return individually configured beds with real-time status', async () => {
    const roomDetails = await roomService.getRoomById(orgId, createdRoom.id);
    expect(roomDetails.beds).toHaveLength(4);
    expect(roomDetails.capacity).toBe(4);
    expect(roomDetails.availableBeds).toBe(4);
    expect(roomDetails.occupiedBeds).toBe(0);

    const roomsList = await roomService.listRooms(orgId, hostelId);
    const found = roomsList.find((r) => r.id === createdRoom.id);
    expect(found).toBeDefined();
    expect(found.beds).toHaveLength(4);
    expect(found.availableBeds).toBe(4);
  });

  // ============================================================================
  // 3. Student Allocation Automatically Transitions Bed to OCCUPIED (Red)
  // ============================================================================
  it('3. Admitting a student should atomically transition Bed 1 to OCCUPIED (Red) with student details', async () => {
    const student = await studentService.admitStudent(orgId, hostelId, {
      fullName: 'Rahul Sharma',
      email: 'rahul.sharma@example.com',
      phone: '9876543210',
      gender: 'MALE',
      bedId: bed1.id,
      stayDurationMonths: 6,
    });

    expect(student).toBeDefined();
    expect(student.bedId).toBe(bed1.id);

    // Inspect bed from database
    const updatedBed1 = await queryOne<any>('SELECT * FROM beds WHERE id = $1', [bed1.id]);
    expect(updatedBed1.status).toBe(BedStatus.OCCUPIED);
    expect(updatedBed1.current_student_id).toBe(student.id);
    expect(updatedBed1.current_student_name).toBe('Rahul Sharma');
    expect(updatedBed1.current_customer_code).toBeDefined();

    // Verify room details reflected
    const room = await roomService.getRoomById(orgId, createdRoom.id);
    expect(room.occupiedBeds).toBe(1);
    expect(room.availableBeds).toBe(3);

    const b1InRoom = room.beds.find((b: any) => b.id === bed1.id);
    expect(b1InRoom.status).toBe(BedStatus.OCCUPIED);
    expect(b1InRoom.studentName).toBe('Rahul Sharma');
  });

  // ============================================================================
  // 4. Strict Guard: Prevent Allocating Student to OCCUPIED Bed
  // ============================================================================
  it('4. System must strictly block assigning another student to an OCCUPIED bed', async () => {
    await expect(
      studentService.admitStudent(orgId, hostelId, {
        fullName: 'Priya Verma',
        email: 'priya.verma@example.com',
        phone: '9876543211',
        gender: 'FEMALE',
        bedId: bed1.id, // already occupied
      })
    ).rejects.toThrow(/already OCCUPIED/i);
  });

  // ============================================================================
  // 5. Admin Maintenance Toggle: AVAILABLE (Green) <-> MAINTENANCE (Yellow)
  // ============================================================================
  it('5. Admin should be able to toggle an available bed to MAINTENANCE (Yellow) and back to AVAILABLE (Green)', async () => {
    // 5a. Set Bed 4 to MAINTENANCE
    const maintBed = await roomService.updateBed(orgId, bed4.id, { status: BedStatus.MAINTENANCE });
    expect(maintBed.status).toBe(BedStatus.MAINTENANCE);

    const roomDetails1 = await roomService.getRoomById(orgId, createdRoom.id);
    const b4 = roomDetails1.beds.find((b: any) => b.id === bed4.id);
    expect(b4.status).toBe(BedStatus.MAINTENANCE);

    // 5b. Toggle Bed 4 back to AVAILABLE
    const availBed = await roomService.updateBed(orgId, bed4.id, { status: BedStatus.AVAILABLE });
    expect(availBed.status).toBe(BedStatus.AVAILABLE);

    const roomDetails2 = await roomService.getRoomById(orgId, createdRoom.id);
    const b4Avail = roomDetails2.beds.find((b: any) => b.id === bed4.id);
    expect(b4Avail.status).toBe(BedStatus.AVAILABLE);
  });

  // ============================================================================
  // 6. Strict Guard: Prevent Allocating Student to MAINTENANCE Bed
  // ============================================================================
  it('6. System must strictly block assigning a student to a MAINTENANCE bed', async () => {
    // Put Bed 4 under maintenance
    await roomService.updateBed(orgId, bed4.id, { status: BedStatus.MAINTENANCE });

    await expect(
      studentService.admitStudent(orgId, hostelId, {
        fullName: 'Sneha Rao',
        email: 'sneha.rao@example.com',
        phone: '9876543212',
        gender: 'FEMALE',
        bedId: bed4.id, // under maintenance
      })
    ).rejects.toThrow(/already MAINTENANCE/i);
  });

  // ============================================================================
  // 7. Strict Guard: Prevent Marking an OCCUPIED Bed as MAINTENANCE
  // ============================================================================
  it('7. Admin should be blocked from marking an OCCUPIED bed as MAINTENANCE directly', async () => {
    // Bed 1 is currently occupied by Rahul Sharma
    await expect(
      roomService.updateBed(orgId, bed1.id, { status: BedStatus.MAINTENANCE })
    ).rejects.toThrow(/Cannot mark an occupied bed as Maintenance/i);
  });

  // ============================================================================
  // 8. Student Transfer Reverts Old Bed to AVAILABLE (Green) & Occupies New Bed
  // ============================================================================
  it('8. Transferring a student should revert the old bed to AVAILABLE and occupy the target bed', async () => {
    const student = await queryOne<any>('SELECT * FROM students WHERE bed_id = $1', [bed1.id]);
    expect(student).toBeDefined();

    // Transfer Rahul from Bed 1 to Bed 2
    await studentService.transferStudent(orgId, student.id, {
      targetBranchId: hostelId,
      targetBedId: bed2.id,
      reason: 'Room upgrade request',
      approvedBy: 'Admin',
    });

    // Old Bed (Bed 1) must be AVAILABLE (Green) and unassigned
    const oldBed = await queryOne<any>('SELECT * FROM beds WHERE id = $1', [bed1.id]);
    expect(oldBed.status).toBe(BedStatus.AVAILABLE);
    expect(oldBed.current_student_id).toBeNull();
    expect(oldBed.current_student_name).toBeNull();

    // New Bed (Bed 2) must be OCCUPIED (Red) with student details
    const newBed = await queryOne<any>('SELECT * FROM beds WHERE id = $1', [bed2.id]);
    expect(newBed.status).toBe(BedStatus.OCCUPIED);
    expect(newBed.current_student_id).toBe(student.id);
    expect(newBed.current_student_name).toBe('Rahul Sharma');
  });

  // ============================================================================
  // 9. Vacating an Occupied Bed Reverts it to AVAILABLE (Green)
  // ============================================================================
  it('9. Vacating a bed should clear student assignment and revert status to AVAILABLE (Green)', async () => {
    // Bed 2 is currently occupied by Rahul
    const vacatedBed = await roomService.updateBed(orgId, bed2.id, { status: BedStatus.AVAILABLE });
    expect(vacatedBed.status).toBe(BedStatus.AVAILABLE);
    expect(vacatedBed.current_student_id).toBeNull();
    expect(vacatedBed.current_student_name).toBeNull();

    // Verify student's bed reference is cleared
    const student = await queryOne<any>('SELECT * FROM students WHERE full_name = $1', ['Rahul Sharma']);
    expect(student.bed_id).toBeNull();
  });
});
