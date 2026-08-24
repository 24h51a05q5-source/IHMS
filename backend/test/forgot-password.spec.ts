import { connectDatabase, disconnectDatabase, queryOne, queryRows, query } from '../src/config/database';
import { runMigrations } from '../src/config/migrations';
import { authService } from '../src/modules/auth/auth.service';
import { studentService } from '../src/modules/students/student.service';
import { hostelService } from '../src/modules/hostels/hostel.service';
import { roomService } from '../src/modules/rooms/room.service';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

describe('Secure Forgot Password & Password Reset Flow Tests', () => {
    let orgId: string;
    let hostelId: string;
    let bedId: string;
    let ownerEmail = 'forgot_owner_test@example.com';
    let studentEmail = 'forgot_student_test@example.com';
    let studentCode: string;
    let studentId: string;

    beforeAll(async () => {
        await connectDatabase();
        await runMigrations();

        // Setup test organization & owner
        const ownerRes = await authService.registerOwner({
            orgName: 'Forgot Pw Test Hostel Org',
            orgEmail: 'org_forgot@example.com',
            ownerName: 'Forgot Pw Owner',
            ownerEmail,
            ownerPassword: 'InitialOwnerPass@123',
        });
        orgId = ownerRes.organization._id.toString();

        // Create hostel branch & room
        const branch = await hostelService.create(orgId, {
            name: 'Forgot Pw Branch',
            branchCode: 'FPW01',
            type: 'BOYS',
            city: 'Test City',
        });
        hostelId = branch.id || branch._id.toString();

        const { beds } = await roomService.createRoom(orgId, hostelId, {
            roomNumber: '101',
            floorNumber: 1,
            totalBeds: 1,
            monthlyRate: 5000,
        });
        bedId = beds[0].id || beds[0]._id.toString();

        // Admit student and enable portal access
        const student = await studentService.admitStudent(orgId, hostelId, {
            fullName: 'Forgot Pw Student',
            email: studentEmail,
            phone: '+91 9988776655',
            bedId,
        });
        studentId = student.id;
        studentCode = student.customerCode || student.student_id || studentEmail;
        await studentService.setPortalAccess(orgId, studentId, 'GRANT');
        const testOtp = '4920';
        const otpHash = await bcrypt.hash(testOtp, 10);
        await query(
            "UPDATE otps SET otp_hash = $1 WHERE user_id = $2 AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION' AND used_at IS NULL",
            [otpHash, studentId]
        );
        const verifyRes = await authService.verifyStudentActivationOtp(studentEmail, testOtp);
        await authService.activateStudentAccount(verifyRes.activationToken, 'InitialStudentPass@123', 'InitialStudentPass@123');
    }, 60000);

    afterAll(async () => {
        await disconnectDatabase();
    });

    describe('Step 1: Forgot Password OTP Generation & Protection', () => {
        it('should generate secure hashed OTP for Owner and return generic message without exposing OTP in response', async () => {
            const res = await authService.requestPasswordResetOtp(ownerEmail);
            expect(res.success).toBe(true);
            expect(res.message).toMatch(/If an account exists/i);
            expect((res as any).otp).toBeUndefined();
            expect((res as any).code).toBeUndefined();

            // Verify DB record has hashed OTP and purpose PASSWORD_RESET
            const otpRecord = await queryOne<any>(
                "SELECT * FROM otps WHERE identifier = $1 AND otp_purpose = 'PASSWORD_RESET' ORDER BY created_at DESC LIMIT 1",
                [ownerEmail.toLowerCase()]
            );
            expect(otpRecord).toBeDefined();
            expect(otpRecord.otp_hash).toBeDefined();
            expect(otpRecord.otp_hash).not.toBe('123456'); // Hash check
            expect(otpRecord.used_at).toBeNull();
            expect(otpRecord.attempt_count).toBe(0);
        });

        it('should generate secure hashed OTP for Student via Student ID or Email', async () => {
            const res = await authService.requestPasswordResetOtp(studentCode);
            expect(res.success).toBe(true);
            expect(res.message).toMatch(/If an account exists/i);

            // Verify OTP stored in DB for student
            const user = await queryOne<any>('SELECT id FROM users WHERE LOWER(email) = $1', [studentEmail.toLowerCase()]);
            const otpRecord = await queryOne<any>(
                "SELECT * FROM otps WHERE user_id = $1 AND otp_purpose = 'PASSWORD_RESET' ORDER BY created_at DESC LIMIT 1",
                [user.id]
            );
            expect(otpRecord).toBeDefined();
            expect(otpRecord.used_at).toBeNull();
        });

        it('should return generic response for non-existent emails without error or enumeration leaks', async () => {
            const res = await authService.requestPasswordResetOtp('nonexistent_user_9999@example.com');
            expect(res.success).toBe(true);
            expect(res.message).toMatch(/If an account exists/i);
        });
    });

    describe('Step 2: Resend OTP & Cooldown Enforcements', () => {
        it('should reject resend request if made within 60-second cooldown period', async () => {
            await expect(authService.resendPasswordResetOtp(ownerEmail)).rejects.toThrow(/wait 60 seconds/i);
        });

        it('should invalidate previous unused OTP when new OTP is generated after cooldown', async () => {
            // Artificially age previous OTP timestamp in DB to simulate 61 seconds passing
            const user = await queryOne<any>('SELECT id FROM users WHERE LOWER(email) = $1', [ownerEmail.toLowerCase()]);
            await query(
                "UPDATE otps SET created_at = NOW() - INTERVAL '61 seconds' WHERE user_id = $1 AND otp_purpose = 'PASSWORD_RESET'",
                [user.id]
            );

            const resendRes = await authService.resendPasswordResetOtp(ownerEmail);
            expect(resendRes.success).toBe(true);

            // Check that only 1 OTP remains unused and previous ones are invalidated
            const activeOtps = await queryRows<any>(
                "SELECT * FROM otps WHERE user_id = $1 AND otp_purpose = 'PASSWORD_RESET' AND used_at IS NULL",
                [user.id]
            );
            expect(activeOtps.length).toBe(1);
        });
    });

    describe('Step 3: OTP Verification & Attempt Tracking', () => {
        let validOtpCode: string;
        let targetUser: any;
        let currentOtpId: string;

        beforeEach(async () => {
            targetUser = await queryOne<any>('SELECT id FROM users WHERE LOWER(email) = $1', [studentEmail.toLowerCase()]);
            validOtpCode = '884920';
            const otpHash = await bcrypt.hash(validOtpCode, 10);
            currentOtpId = crypto.randomUUID();

            await query(
                "UPDATE otps SET used_at = NOW() WHERE user_id = $1 AND otp_purpose = 'PASSWORD_RESET'",
                [targetUser.id]
            );
            await query(
                `INSERT INTO otps (
          id, user_id, identifier, organization_id, otp_purpose, otp_hash, expires_at, attempt_count, max_attempts
        ) VALUES ($1, $2, $3, $4, 'PASSWORD_RESET', $5, NOW() + INTERVAL '10 minutes', 0, 5)`,
                [currentOtpId, targetUser.id, studentEmail.toLowerCase(), orgId, otpHash]
            );
        });

        it('should reject invalid / wrong OTP and increment attempt_count in database', async () => {
            await expect(authService.verifyPasswordResetOtp(studentEmail, '000000')).rejects.toThrow(/invalid verification code/i);

            const otpRec = await queryOne<any>('SELECT attempt_count FROM otps WHERE id = $1', [currentOtpId]);
            expect(otpRec.attempt_count).toBe(1);
        });

        it('should invalidate OTP after 5 consecutive failed attempts (brute force protection)', async () => {
            await query('UPDATE otps SET attempt_count = 4 WHERE id = $1', [currentOtpId]);

            await expect(authService.verifyPasswordResetOtp(studentEmail, '000000')).rejects.toThrow(/maximum verification attempts exceeded/i);

            const otpRec = await queryOne<any>('SELECT used_at FROM otps WHERE id = $1', [currentOtpId]);
            expect(otpRec.used_at).not.toBeNull(); // OTP invalidated
        });

        it('should verify correct OTP code and issue a short-lived reset authorization token', async () => {
            const verifyRes = await authService.verifyPasswordResetOtp(studentEmail, validOtpCode);
            expect(verifyRes.success).toBe(true);
            expect(verifyRes.resetToken).toBeDefined();
            expect(typeof verifyRes.resetToken).toBe('string');
            expect(verifyRes.resetToken.length).toBeGreaterThan(20);

            // Verify OTP is marked used
            const otpRec = await queryOne<any>('SELECT used_at FROM otps WHERE id = $1', [currentOtpId]);
            expect(otpRec.used_at).not.toBeNull();
        });
    });

    describe('Step 4: Create New Password & Session Invalidation', () => {
        let resetToken: string;

        beforeEach(async () => {
            const user = await queryOne<any>('SELECT id FROM users WHERE LOWER(email) = $1', [studentEmail.toLowerCase()]);
            resetToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

            await query(
                `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes')`,
                [crypto.randomUUID(), user.id, tokenHash]
            );
        });

        it('should reject password reset when passwords do not match or fail complexity requirements', async () => {
            await expect(authService.resetPasswordWithToken(resetToken, 'weak', 'weak')).rejects.toThrow(/at least 8 characters/i);
            await expect(authService.resetPasswordWithToken(resetToken, 'Alllowercase1', 'MismatchPassword1')).rejects.toThrow(/do not match/i);
            await expect(authService.resetPasswordWithToken(resetToken, 'alllowercase1', 'alllowercase1')).rejects.toThrow(/uppercase/i);
        });

        it('should successfully update user password and invalidate reset token', async () => {
            const newPass = 'BrandNewSecuredPass@2026';
            const res = await authService.resetPasswordWithToken(resetToken, newPass, newPass);

            expect(res.success).toBe(true);
            expect(res.message).toMatch(/password changed successfully/i);

            // Verify student can now login with new password
            const loginRes = await authService.login(studentEmail, newPass, 'STUDENT');
            expect(loginRes.token).toBeDefined();
            expect(loginRes.user.email).toBe(studentEmail);

            // Verify old password fails
            await expect(authService.login(studentEmail, 'InitialStudentPass@123', 'STUDENT')).rejects.toThrow(/invalid/i);

            // Verify reset token cannot be reused
            await expect(authService.resetPasswordWithToken(resetToken, 'AnotherPass@123', 'AnotherPass@123')).rejects.toThrow(/invalid or has expired/i);
        });
    });
});
