import { connectDatabase, disconnectDatabase, queryOne, queryRows, query } from '../src/config/database';
import { runMigrations } from '../src/config/migrations';
import { authService } from '../src/modules/auth/auth.service';
import { studentService } from '../src/modules/students/student.service';
import bcrypt from 'bcryptjs';

describe('Student 4-Digit Activation & First-Time Flow Tests', () => {
    let orgId: string;
    let hostelId: string;
    let bedId: string;

    let testStudentDbId: string;
    let testStudentCode: string;
    const testStudentEmail = `act_student_${Date.now()}@example.com`;

    beforeAll(async () => {
        await connectDatabase();
        await runMigrations();

        // Register test hostel owner
        const ownerRes = await authService.registerOwner({
            orgName: 'Activation Test Hostel Org',
            orgEmail: `act_org_${Date.now()}@example.com`,
            ownerName: 'Activation Owner',
            ownerEmail: `act_owner_${Date.now()}@example.com`,
            ownerPassword: 'InitialOwnerPass@123',
        });

        orgId = ownerRes.organization._id.toString();

        // Retrieve hostel branch id
        const branchRes = await queryOne<any>('SELECT id FROM hostels WHERE organization_id = $1 LIMIT 1', [orgId]);
        hostelId = branchRes.id;

        // Create room & bed
        const { roomService } = require('../src/modules/rooms/room.service');
        const { beds } = await roomService.createRoom(orgId, hostelId, {
            roomNumber: '101',
            floorNumber: 1,
            totalBeds: 2,
            monthlyRate: 5000,
        });
        bedId = beds[0].id || beds[0]._id?.toString();
    }, 60000);

    afterAll(async () => {
        await disconnectDatabase();
    });

    it('Step 1: Owner admits student without generating a temporary password', async () => {
        const student = await studentService.admitStudent(orgId, hostelId, {
            fullName: 'Activation Test Student',
            email: testStudentEmail,
            phone: '+91 9988776655',
            bedId,
        });

        testStudentDbId = student.id;
        testStudentCode = student.ihmsId || student.ihms_id || student.customerCode;

        // Verify database state: portal_access=false, activation_status='ACCOUNT_CREATED', password_set=false
        const dbStudent = await queryOne<any>('SELECT * FROM students WHERE id = $1', [testStudentDbId]);
        expect(dbStudent.portal_access).toBe(false);
        expect(dbStudent.activation_status).toBe('ACCOUNT_CREATED');
        expect(dbStudent.password_set).toBe(false);

        // Verify NO user record was created in users table
        const userCount = await queryOne<any>('SELECT COUNT(*) as count FROM users WHERE student_id = $1', [testStudentDbId]);
        expect(Number(userCount.count)).toBe(0);
    });

    it('Step 2: Owner grants portal access -> generates 4-digit activation OTP', async () => {
        const res = await studentService.setPortalAccess(orgId, testStudentDbId, 'GRANT');

        expect(res.success).toBe(true);
        expect(res.portalAccess).toBe(true);

        // NO temporary password returned
        expect((res as any).temporaryPassword).toBeUndefined();
        expect((res as any).defaultPassword).toBeUndefined();

        // Verify database state: portal_access=true, activation_status='ACCESS_GRANTED'
        const dbStudent = await queryOne<any>('SELECT * FROM students WHERE id = $1', [testStudentDbId]);
        expect(dbStudent.portal_access).toBe(true);
        expect(dbStudent.activation_status).toBe('ACCESS_GRANTED');

        // Verify 4-digit activation OTP is stored in otps table
        const otpRecord = await queryOne<any>(
            "SELECT * FROM otps WHERE user_id = $1 AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1",
            [testStudentDbId]
        );
        expect(otpRecord).toBeDefined();
        expect(otpRecord.attempt_count).toBe(0);
        expect(otpRecord.max_attempts).toBe(5);
    });

    it('Step 3: Student checks login status -> returns ACTIVATION_PENDING', async () => {
        const res = await authService.getStudentLoginStatus(testStudentEmail);

        expect(res.success).toBe(true);
        expect(res.requiresActivation).toBe(true);
        expect(res.requiresPassword).toBe(false);
        expect(res.status).toBe('ACTIVATION_PENDING');
    });

    it('Step 4: Student enters invalid 4-digit OTP -> rejected with attempt increment', async () => {
        await expect(authService.verifyStudentActivationOtp(testStudentEmail, '0000')).rejects.toThrow(/invalid 4-digit activation code/i);

        const otpRecord = await queryOne<any>(
            "SELECT attempt_count FROM otps WHERE user_id = $1 AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION' ORDER BY created_at DESC LIMIT 1",
            [testStudentDbId]
        );
        expect(otpRecord.attempt_count).toBe(1);
    });

    it('Step 5: Student verifies valid 4-digit OTP -> receives activation session token', async () => {
        // Inject known 4-digit OTP into database for test
        const testOtp = '4920';
        const otpHash = await bcrypt.hash(testOtp, 10);

        await query(
            "UPDATE otps SET otp_hash = $1 WHERE user_id = $2 AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION' AND used_at IS NULL",
            [otpHash, testStudentDbId]
        );

        const res = await authService.verifyStudentActivationOtp(testStudentEmail, testOtp);

        expect(res.success).toBe(true);
        expect(res.activationToken).toBeDefined();
        expect(typeof res.activationToken).toBe('string');

        const activationToken = res.activationToken;

        // Step 6: Student creates private password & completes account activation
        const newStudentPassword = 'MySecretPassword123!';

        const actRes = await authService.activateStudentAccount(activationToken, newStudentPassword, newStudentPassword);

        expect(actRes.success).toBe(true);
        expect(actRes.token).toBeDefined();
        expect(actRes.user).toBeDefined();
        expect(actRes.user.role).toBe('STUDENT');

        // Verify student database state: activation_status='ACTIVATED', password_set=true
        const dbStudent = await queryOne<any>('SELECT * FROM students WHERE id = $1', [testStudentDbId]);
        expect(dbStudent.activation_status).toBe('ACTIVATED');
        expect(dbStudent.password_set).toBe(true);

        // Verify user record is now created in users table
        const dbUser = await queryOne<any>('SELECT * FROM users WHERE student_id = $1', [testStudentDbId]);
        expect(dbUser).toBeDefined();
        expect(dbUser.status).toBe('ACTIVE');

        // Step 7: Subsequent student login check & authentication with newly created password
        const statusRes = await authService.getStudentLoginStatus(testStudentEmail);

        expect(statusRes.status).toBe('ACTIVATED');
        expect(statusRes.requiresActivation).toBe(false);
        expect(statusRes.requiresPassword).toBe(true);

        const loginRes = await authService.login(testStudentEmail, newStudentPassword, 'STUDENT');

        expect(loginRes.token).toBeDefined();
        expect(loginRes.user.role).toBe('STUDENT');
    });
});
