import bcrypt from 'bcryptjs';
import { query, queryOne, queryRows, transaction } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { generateStudentId, generateTemporaryPassword } from '../../common/utils/code-generator';
import { BedStatus, PaymentMethod, PaymentPlan, StudentStatus, UserRole } from '../../config/constants';
import { feeService } from '../fees/fee.service';
import { emitRealTimeEvent } from '../../events/events.gateway';
import { cache } from '../../common/utils/cache';

export class StudentService {
  async admitStudent(orgId: string, branchId: string, data: any): Promise<any> {
    const fullName = String(data.fullName || data.name || '').trim();
    if (!fullName || fullName.length < 2) {
      throw new AppError('Student full name is required (minimum 2 characters).', 400);
    }

    const studentEmail = String(data.email || '').toLowerCase().trim();
    if (studentEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(studentEmail)) {
        throw new AppError('Please provide a valid email address.', 400);
      }

      const existingStudent = await queryOne<any>(
        "SELECT id FROM students WHERE organization_id = $1 AND LOWER(email) = $2 AND status != 'LEFT'",
        [orgId, studentEmail]
      );
      if (existingStudent) {
        throw new AppError('A student with these details already exists.', 409);
      }
    }

    if (data.phone) {
      const phoneStr = String(data.phone).trim();
      const phoneRegex = /^[\d+\-\s()]{7,20}$/;
      if (!phoneRegex.test(phoneStr)) {
        throw new AppError('Phone number must be between 7 and 20 digits.', 400);
      }
    }

    const branch = await queryOne<any>(
      'SELECT id, branch_code as "branchCode", name FROM hostels WHERE (id = $1 OR hostel_id = $1 OR branch_code = $1) AND organization_id = $2',
      [branchId, orgId]
    );
    if (!branch) throw new AppError('Hostel branch not found.', 404);
    const actualBranchId = branch.id;

    if (!data.bedId) {
      throw new AppError('Please select an available bed for admission.', 400);
    }

    const bed = await queryOne<any>(
      'SELECT * FROM beds WHERE id = $1 AND organization_id = $2',
      [data.bedId, orgId]
    );
    if (!bed) throw new AppError('Specified Bed does not exist.', 404);
    if (bed.status !== BedStatus.AVAILABLE) {
      throw new AppError(`Bed '${bed.bed_code}' is already ${bed.status}. Please select an available bed.`, 400);
    }

    const room = await queryOne<any>('SELECT * FROM rooms WHERE id = $1', [bed.room_id]);
    if (!room) throw new AppError('Room not found.', 404);
    if (room.occupied_beds >= room.capacity) {
      throw new AppError(`Room '${room.room_number}' is already fully occupied.`, 400);
    }

    const studentId = await generateStudentId(orgId);
    const customerCode = studentId;
    const studentDbId = require('crypto').randomUUID();
    const finalEmail = studentEmail || `${customerCode.toLowerCase()}@example.com`;

    const monthlyRent = Number(bed.monthly_rate || room.monthly_rate || 8000);
    const stayDurationMonths = Number(data.stayDurationMonths || data.durationMonths || data.stayDuration || 1);
    const admissionFee = Number(data.admissionFee !== undefined ? data.admissionFee : (data.admissionFee === undefined && data.stayDurationMonths === undefined ? 1000 : 0));
    const securityDeposit = Number(data.securityDeposit !== undefined ? data.securityDeposit : (data.securityDeposit === undefined && data.stayDurationMonths === undefined ? 5000 : 0));
    const totalHostelRent = monthlyRent * stayDurationMonths;
    const totalAdmissionAmount = totalHostelRent + admissionFee + securityDeposit;

    const student = await transaction(async (client) => {
      // 1. Atomically occupy bed if AVAILABLE
      const bedUpdateRes = await client.query(
        `UPDATE beds
         SET status = 'OCCUPIED', current_student_id = $1, current_customer_code = $2,
             current_student_name = $3, allocated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND organization_id = $5 AND status = 'AVAILABLE'
         RETURNING id`,
        [studentDbId, customerCode, fullName, bed.id, orgId]
      );

      if (!bedUpdateRes.rows || bedUpdateRes.rows.length === 0) {
        throw new AppError(`Bed '${bed.bed_code}' was just occupied by another concurrent request. Please select an available bed.`, 409);
      }

      // 2. Insert student record
      const studentRes = await client.query(
        `INSERT INTO students (
          id, student_id, customer_code, organization_id, hostel_id, full_name, email,
          phone, gender, date_of_birth, blood_group, aadhar_number, college, course,
          guardian_name, guardian_relation, guardian_phone, guardian_email, guardian_address,
          room_id, bed_id, admission_date, portal_access, portal_access_approved, portal_status, status, financial_total_demanded,
          financial_total_paid, financial_outstanding_balance
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, CURRENT_TIMESTAMP, false, false, 'PENDING_APPROVAL', 'ACTIVE', $22, 0, $22)
        RETURNING *`,
        [
          studentDbId,
          studentId,
          customerCode,
          orgId,
          actualBranchId,
          fullName,
          studentEmail,
          data.phone || '+91 0000000000',
          data.gender || 'MALE',
          data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          data.bloodGroup || '',
          data.aadharNumber || '',
          data.collegeOrCompany || data.college || '',
          data.courseOrDesignation || data.course || '',
          data.guardianName || data.guardian?.name || 'Guardian',
          data.guardianRelation || data.guardian?.relation || 'Parent',
          data.guardianPhone || data.guardian?.phone || data.phone || '+91 0000000000',
          data.guardianEmail || data.guardian?.email || '',
          data.guardianAddress || data.guardian?.address || '',
          room.id,
          bed.id,
          totalAdmissionAmount
        ]
      );

      // 3. Create room allocation history
      await client.query(
        `INSERT INTO room_allocations (id, student_id, room_id, bed_id, hostel_id, organization_id, monthly_rent, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')`,
        [require('crypto').randomUUID(), studentDbId, room.id, bed.id, branchId, orgId, monthlyRent]
      );

      // 4. Create initial Fee Demand
      const demandNumber = 'DEM-' + Date.now();
      await client.query(
        `INSERT INTO fee_demands (
          id, demand_number, organization_id, hostel_id, student_id, customer_code,
          term_name, hostel_rent, admission_fee, security_deposit, total_amount, paid_amount,
          balance_amount, due_date, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $11, CURRENT_TIMESTAMP + INTERVAL '7 days', 'UNPAID')`,
        [
          require('crypto').randomUUID(),
          demandNumber,
          orgId,
          branchId,
          studentDbId,
          customerCode,
          `Admission & Hostel Fee (${stayDurationMonths} Month${stayDurationMonths > 1 ? 's' : ''})`,
          totalHostelRent,
          admissionFee,
          securityDeposit,
          totalAdmissionAmount
        ]
      );

      return studentRes.rows[0];
    });

    // Create Fee Account & Schedule
    const plan = data.paymentPlan === 'ONE_TIME' ? PaymentPlan.ONE_TIME : PaymentPlan.MONTHLY;
    await feeService.createFeeAccountAndInstallments(
      orgId,
      branchId,
      studentDbId,
      customerCode,
      {
        paymentPlan: plan,
        totalFee: totalAdmissionAmount,
        monthlyAmount: monthlyRent,
        startMonth: data.startMonth || data.firstPaymentMonth,
        numberOfMonths: stayDurationMonths,
        monthlyDueDay: Number(data.monthlyDueDay) || 5,
        allowAdvancePayment: !!data.allowAdvancePayment,
      }
    );

    emitRealTimeEvent('bed.status_changed', { bedId: bed.id, bedCode: bed.bed_code, status: BedStatus.OCCUPIED, branchId }, { branchId });
    emitRealTimeEvent('student.admitted', { studentId: studentDbId, customerCode, name: fullName, branchId }, { branchId });
    emitRealTimeEvent('dashboard.kpi_updated', { orgId, branchId }, { orgId });

    // Record audit log so Recent Activity on dashboard shows this admission
    await query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, resource, resource_id, details)
       VALUES ($1, $2, $3, 'STUDENT_ADMITTED', 'students', $4, $5)`,
      [
        require('crypto').randomUUID(),
        orgId,
        null,
        studentDbId,
        `Student ${fullName} (${customerCode}) admitted to hostel`,
      ]
    ).catch(() => { /* audit log failure must never block admission */ });

    return this.getById(orgId, studentDbId);
  }

  async setPortalAccess(orgId: string, studentId: string, action: 'GRANT' | 'REVOKE', customPassword?: string) {
    if (!studentId || typeof studentId !== 'string') {
      throw new AppError('Student ID is required.', 400);
    }
    const cleanId = studentId.trim();
    const student = await queryOne<any>(
      `SELECT * FROM students
       WHERE (id = $1 OR student_id = $1 OR UPPER(customer_code) = UPPER($1) OR user_id = $1)
         AND (organization_id = $2 OR $2 IS NULL OR $2 = '' OR $2 = 'ALL')`,
      [cleanId, orgId]
    );

    if (!student) {
      throw new AppError('Student not found or does not belong to your organization.', 404);
    }

    const sDbId = student.id;
    const sEmail = (student.email || '').trim().toLowerCase();
    const sCustomerCode = (student.customer_code || student.student_id || '').trim();
    const sStudentId = (student.student_id || student.customer_code || '').trim();
    const sFullName = student.full_name || 'Student';
    const sPhone = student.phone || '';
    const sBranchId = student.hostel_id || student.branch_id || '';

    if (action === 'GRANT') {
      if (!sEmail) {
        throw new AppError('Student has no registered email address. Please update the student profile with a valid email first.', 400);
      }

      if (student.status === 'EXPELLED' || student.status === 'LEFT' || student.status === 'INACTIVE') {
        throw new AppError('Cannot enable portal access for inactive or expelled students.', 400);
      }

      if ((student.portal_status === 'ACTIVE' || student.activation_status === 'ACTIVATED') && student.password_set) {
        return {
          success: true,
          message: `Portal access is already active for ${sFullName}.`,
          portalAccess: true,
          portalAccessApproved: true,
          portalStatus: 'ACTIVE',
          email: sEmail,
          studentId: sStudentId || sCustomerCode,
          customerCode: sCustomerCode,
        };
      }

      const crypto = require('crypto');
      const otpCode = crypto.randomInt(100000, 1000000).toString(); // 6-digit OTP
      const otpHash = await bcrypt.hash(otpCode, 10);

      await transaction(async (client) => {
        await client.query(
          `UPDATE students
           SET portal_access = true,
               portal_access_approved = true,
               portal_status = 'PENDING_ACTIVATION',
               activation_status = 'ACCESS_GRANTED',
               updated_at = NOW()
           WHERE id = $1 AND organization_id = $2`,
          [sDbId, orgId]
        );

        // Invalidate previous activation OTPs for this student
        await client.query(
          "UPDATE otps SET used_at = NOW() WHERE (LOWER(identifier) = LOWER($1) OR UPPER(identifier) = UPPER($2) OR user_id = $3) AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION' AND used_at IS NULL",
          [sEmail, sCustomerCode, sDbId]
        );

        // Insert new hashed 6-digit activation OTP (10 min expiry)
        await client.query(
          `INSERT INTO otps (
            id, user_id, identifier, organization_id, otp_purpose, otp_hash, expires_at, attempt_count, max_attempts
          ) VALUES ($1, $2, $3, $4, 'STUDENT_ACCOUNT_ACTIVATION', $5, NOW() + INTERVAL '10 minutes', 0, 5)`,
          [crypto.randomUUID(), sDbId, sEmail.toLowerCase(), orgId, otpHash]
        );
      });

      console.log(`[STUDENT-PORTAL-APPROVAL] 🔒 Owner approved portal access & generated 6-digit OTP for Student ${sFullName} (${sEmail}): ${otpCode}`);

      // Mask email for display
      const [local, domain] = sEmail.split('@');
      const visible = local.slice(0, Math.min(2, local.length));
      const maskedEmail = `${visible}${'*'.repeat(Math.max(4, local.length - 2))}@${domain}`;

      emitRealTimeEvent('student.portal_access_changed', {
        studentId: sDbId,
        customerCode: sCustomerCode,
        portalAccess: true,
        portalAccessApproved: true,
        portalStatus: 'PENDING_ACTIVATION',
        email: sEmail,
      }, { branchId: sBranchId });

      return {
        success: true,
        message: `Portal access approved for ${sFullName}. A 6-digit activation OTP has been sent to ${maskedEmail}.`,
        portalAccess: true,
        portalAccessApproved: true,
        portalStatus: 'PENDING_ACTIVATION',
        email: sEmail,
        maskedEmail,
        studentId: sStudentId || sCustomerCode,
        customerCode: sCustomerCode,
        _debugOtp: process.env.NODE_ENV !== 'production' ? otpCode : undefined,
      };
    } else {
      // REVOKE / DISABLE ACCESS
      await transaction(async (client) => {
        await client.query(
          `UPDATE students
           SET portal_access = false,
               portal_access_approved = false,
               portal_status = 'DISABLED',
               activation_status = 'ACCOUNT_CREATED',
               updated_at = NOW()
           WHERE id = $1 AND organization_id = $2`,
          [sDbId, orgId]
        );

        if (student.user_id) {
          await client.query("UPDATE users SET status = 'DISABLED', updated_at = NOW() WHERE id = $1", [student.user_id]);
        }

        await client.query(
          "UPDATE otps SET used_at = NOW() WHERE (LOWER(identifier) = LOWER($1) OR UPPER(identifier) = UPPER($2) OR user_id = $3) AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION' AND used_at IS NULL",
          [sEmail, sCustomerCode, sDbId]
        );
      });

      emitRealTimeEvent('student.portal_access_changed', {
        studentId: sDbId,
        customerCode: sCustomerCode,
        portalAccess: false,
        portalAccessApproved: false,
        portalStatus: 'DISABLED',
      }, { branchId: sBranchId });

      return {
        success: true,
        message: `Portal access disabled for ${sFullName}. Student portal activation and login are now blocked.`,
        portalAccess: false,
        portalAccessApproved: false,
        portalStatus: 'DISABLED',
      };
    }
  }

  async resetStudentPassword(orgId: string, studentId: string, customPassword?: string) {
    const student = await queryOne<any>(
      `SELECT * FROM students
       WHERE (id = $1 OR student_id = $1 OR UPPER(customer_code) = UPPER($1) OR user_id = $1)
         AND (organization_id = $2 OR $2 IS NULL OR $2 = '' OR $2 = 'ALL')`,
      [studentId ? studentId.trim() : studentId, orgId]
    );
    if (!student) throw new AppError('Student not found in this organization', 404);

    const sDbId = student.id;
    const sEmail = (student.email || '').trim().toLowerCase();
    const sCustomerCode = (student.customer_code || student.student_id || '').trim();
    const sStudentId = (student.student_id || student.customer_code || '').trim();
    const sFullName = student.full_name || 'Student';
    const sPhone = student.phone || '';
    const sBranchId = student.hostel_id || student.branch_id || '';

    const tempPassword = customPassword || generateTemporaryPassword();

    if (customPassword) {
      if (customPassword.length < 8) throw new AppError('Temporary password must be at least 8 characters long.', 400);
      if (!/[A-Z]/.test(customPassword)) throw new AppError('Temporary password must contain at least one uppercase letter.', 400);
      if (!/[a-z]/.test(customPassword)) throw new AppError('Temporary password must contain at least one lowercase letter.', 400);
      if (!/[0-9]/.test(customPassword)) throw new AppError('Temporary password must contain at least one number.', 400);
    }

    const passwordHash = await bcrypt.hash(tempPassword, 10);
    let finalUser: any = null;

    await transaction(async (client) => {
      // 1. Re-check existing user inside transaction to avoid race conditions
      const freshStudentRes = await client.query('SELECT * FROM students WHERE id = $1', [sDbId]);
      const freshStudent = freshStudentRes.rows[0] || student;

      let existingUser: any = null;
      if (freshStudent.user_id) {
        const res = await client.query('SELECT * FROM users WHERE id = $1', [freshStudent.user_id]);
        existingUser = res.rows[0];
      }
      if (!existingUser) {
        const res = await client.query('SELECT * FROM users WHERE student_id = $1', [sDbId]);
        existingUser = res.rows[0];
      }
      if (!existingUser && sCustomerCode) {
        const res = await client.query(
          'SELECT * FROM users WHERE UPPER(customer_code) = UPPER($1) OR UPPER(user_id) = UPPER($1)',
          [sCustomerCode]
        );
        existingUser = res.rows[0];
      }
      if (!existingUser && sEmail) {
        const res = await client.query(
          'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
          [sEmail]
        );
        existingUser = res.rows[0];
      }

      if (existingUser) {
        const updatedUserRes = await client.query(
          `UPDATE users
           SET password_hash = $1,
               must_change_password = true,
               status = 'ACTIVE',
               role = 'STUDENT',
               organization_id = $2,
               branch_id = $3,
               student_id = $4,
               customer_code = $5,
               name = $6,
               email = $7,
               phone = $8,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $9
           RETURNING *`,
          [
            passwordHash,
            orgId,
            sBranchId,
            sDbId,
            sCustomerCode,
            sFullName,
            sEmail,
            sPhone || existingUser.phone || '',
            existingUser.id,
          ]
        );
        finalUser = updatedUserRes.rows[0];
      } else {
        const newUserId = require('crypto').randomUUID();
        const targetUserId = sStudentId || sCustomerCode || ('STU-' + sDbId.slice(0, 8));

        try {
          const newUserRes = await client.query(
            `INSERT INTO users (
              id, user_id, organization_id, branch_id, student_id, name, email,
              password_hash, role, phone, customer_code, must_change_password, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'STUDENT', $9, $10, true, 'ACTIVE')
            RETURNING *`,
            [
              newUserId,
              targetUserId,
              orgId,
              sBranchId,
              sDbId,
              sFullName,
              sEmail,
              passwordHash,
              sPhone,
              sCustomerCode,
            ]
          );
          finalUser = newUserRes.rows[0];
        } catch (insertErr: any) {
          if (
            insertErr.code === '23505' ||
            (insertErr.message || '').toLowerCase().includes('duplicate key') ||
            (insertErr.message || '').toLowerCase().includes('already exists')
          ) {
            const updatedUserRes = await client.query(
              `UPDATE users
               SET password_hash = $1,
                   must_change_password = true,
                   status = 'ACTIVE',
                   role = 'STUDENT',
                   organization_id = $2,
                   branch_id = $3,
                   student_id = $4,
                   customer_code = $5,
                   name = $6,
                   phone = $7,
                   updated_at = CURRENT_TIMESTAMP
               WHERE LOWER(email) = LOWER($8) OR UPPER(user_id) = UPPER($9) OR student_id = $4
               RETURNING *`,
              [
                passwordHash,
                orgId,
                sBranchId,
                sDbId,
                sCustomerCode,
                sFullName,
                sPhone,
                sEmail,
                targetUserId,
              ]
            );
            finalUser = updatedUserRes.rows[0];
          } else {
            throw insertErr;
          }
        }
      }

      if (!finalUser) {
        const fallbackRes = await client.query('SELECT * FROM users WHERE student_id = $1 OR LOWER(email) = LOWER($2) LIMIT 1', [sDbId, sEmail]);
        finalUser = fallbackRes.rows[0];
      }

      await client.query(
        "UPDATE students SET portal_access = true, portal_access_approved = true, portal_status = 'ACTIVE', activation_status = 'ACTIVATED', password_set = true, user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [finalUser.id, sDbId]
      );
    });

    emitRealTimeEvent('student.portal_access_changed', {
      studentId: sDbId,
      customerCode: sCustomerCode,
      portalAccess: true,
      email: sEmail,
    }, { branchId: sBranchId });

    return {
      success: true,
      message: `Password reset successfully for ${sFullName}.`,
      studentId: sStudentId || sCustomerCode,
      customerCode: sCustomerCode,
      temporaryPassword: tempPassword,
    };
  }

  async getStudentProfile(orgId: string, studentId: string) {
    return this.getById(orgId, studentId);
  }

  async getStudentSelfProfile(orgId: string, studentIdOrUserId: string) {
    const student = await queryOne<any>(
      `SELECT s.*, r.room_number, r.room_type, b.bed_code, b.monthly_rate as bed_monthly_rate,
              h.name as hostel_name, h.branch_code
       FROM students s
       LEFT JOIN rooms r ON r.id = s.room_id
       LEFT JOIN beds b ON b.id = s.bed_id
       LEFT JOIN hostels h ON h.id = s.hostel_id
       WHERE (s.id = $1 OR s.user_id = $1 OR LOWER(s.email) = $2 OR UPPER(s.customer_code) = $3 OR UPPER(s.student_id) = $3)
         AND s.organization_id = $4`,
      [studentIdOrUserId, studentIdOrUserId.toLowerCase(), studentIdOrUserId.toUpperCase(), orgId]
    );
    if (!student) throw new AppError('Student profile not found', 404);
    return this.formatStudentDoc(student);
  }

  async updateStudentSelfProfile(orgId: string, studentIdOrUserId: string, data: { phone?: string; email?: string; address?: string }) {
    const student = await this.getStudentSelfProfile(orgId, studentIdOrUserId);
    if (data.phone) {
      await query('UPDATE students SET phone = $1 WHERE id = $2', [data.phone.trim(), student.id]);
    }
    if (data.email) {
      const email = data.email.toLowerCase().trim();
      await query('UPDATE students SET email = $1 WHERE id = $2', [email, student.id]);
      if (student.userId) {
        await query('UPDATE users SET email = $1 WHERE id = $2', [email, student.userId]);
      }
    }
    if (data.address !== undefined) {
      await query('UPDATE students SET guardian_address = $1 WHERE id = $2', [data.address.trim(), student.id]);
    }
    return this.getById(orgId, student.id);
  }

  async payMyFee(orgId: string, studentId: string, amount: number, paymentMethod: PaymentMethod = PaymentMethod.UPI, transactionRef?: string) {
    const student = await this.getStudentSelfProfile(orgId, studentId);
    if (amount <= 0) throw new AppError('Payment amount must be greater than 0', 400);

    return feeService.recordPayment(orgId, {
      studentId: student.id,
      amount,
      paymentMethod,
      transactionRef: transactionRef || 'ONLINE-' + Date.now(),
      receivedBy: 'Student Portal Self-Service',
      notes: 'Paid by student via Student Portal',
    });
  }

  async transferStudent(orgId: string, studentId: string, data: { targetBranchId: string; targetBedId: string; reason: string; approvedBy: string }) {
    const student = await queryOne<any>(
      `SELECT * FROM students
       WHERE (id = $1 OR student_id = $1 OR UPPER(customer_code) = UPPER($1) OR user_id = $1)
         AND (organization_id = $2 OR $2 IS NULL OR $2 = '' OR $2 = 'ALL')`,
      [studentId ? studentId.trim() : studentId, orgId]
    );
    if (!student) throw new AppError('Student not found in this organization', 404);

    const oldBedId = student.bed_id;
    const oldBed = oldBedId ? await queryOne<any>('SELECT * FROM beds WHERE id = $1', [oldBedId]) : null;
    const oldBedCode = oldBed?.bed_code || 'N/A';
    const fromBranchId = student.hostel_id;

    const targetBed = await queryOne<any>(
      'SELECT * FROM beds WHERE id = $1 AND organization_id = $2 AND hostel_id = $3',
      [data.targetBedId, orgId, data.targetBranchId]
    );
    if (!targetBed) throw new AppError('Destination bed not found', 404);
    if (targetBed.status !== BedStatus.AVAILABLE) {
      throw new AppError(`Target bed '${targetBed.bed_code}' is ${targetBed.status}. Must be AVAILABLE.`, 400);
    }

    const targetRoom = await queryOne<any>('SELECT * FROM rooms WHERE id = $1', [targetBed.room_id]);
    if (!targetRoom) throw new AppError('Target room not found', 404);

    // Release old bed
    if (oldBedId) {
      await query(
        `UPDATE beds
         SET status = 'AVAILABLE', current_student_id = NULL, current_customer_code = NULL,
             current_student_name = NULL, allocated_at = NULL
         WHERE id = $1`,
        [oldBedId]
      );
      emitRealTimeEvent('bed.status_changed', { bedId: oldBedId, bedCode: oldBedCode, status: BedStatus.AVAILABLE, branchId: fromBranchId }, { branchId: fromBranchId });
    }

    // Allocate new bed
    await query(
      `UPDATE beds
       SET status = 'OCCUPIED', current_student_id = $1, current_customer_code = $2,
           current_student_name = $3, allocated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [student.id, student.customer_code, student.full_name, targetBed.id]
    );

    // Record transfer
    await query(
      `INSERT INTO student_transfers (
        id, organization_id, student_id, customer_code, student_name, from_branch_id,
        from_bed_code, to_branch_id, to_bed_code, to_bed_id, balance_carried_forward,
        reason, approved_by, transfer_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, 'COMPLETED')`,
      [
        require('crypto').randomUUID(),
        orgId,
        student.id,
        student.customer_code,
        student.full_name,
        fromBranchId,
        oldBedCode,
        data.targetBranchId,
        targetBed.bed_code,
        targetBed.id,
        Number(student.financial_outstanding_balance || 0),
        data.reason || 'Branch transfer',
        data.approvedBy || 'Admin'
      ]
    );

    // Update room allocation history
    await query(
      "UPDATE room_allocations SET status = 'TRANSFERRED', vacated_date = CURRENT_TIMESTAMP WHERE student_id = $1 AND status = 'ACTIVE'",
      [student.id]
    );
    await query(
      `INSERT INTO room_allocations (id, student_id, room_id, bed_id, hostel_id, organization_id, monthly_rent, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')`,
      [require('crypto').randomUUID(), student.id, targetRoom.id, targetBed.id, data.targetBranchId, orgId, Number(targetBed.monthly_rate || targetRoom.monthly_rate || 0)]
    );

    // Update student record
    await query(
      'UPDATE students SET hostel_id = $1, room_id = $2, bed_id = $3 WHERE id = $4',
      [data.targetBranchId, targetRoom.id, targetBed.id, student.id]
    );

    if (student.user_id) {
      await query('UPDATE users SET branch_id = $1 WHERE id = $2', [data.targetBranchId, student.user_id]);
    }

    emitRealTimeEvent('student.transferred', { studentId: student.id, customerCode: student.customer_code, targetBranchId: data.targetBranchId }, { orgId });
    emitRealTimeEvent('dashboard.kpi_updated', { orgId }, { orgId });

    return this.getById(orgId, student.id);
  }

  async registerStudent(orgId: string, branchId: string, data: any): Promise<any> {
    const fullName = String(data.fullName || data.name || '').trim();
    if (!fullName || fullName.length < 2) {
      throw new AppError('Student full name is required (minimum 2 characters).', 400);
    }

    const studentEmail = String(data.email || '').toLowerCase().trim();
    if (studentEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(studentEmail)) {
        throw new AppError('Please provide a valid email address.', 400);
      }

      const existingStudent = await queryOne<any>(
        "SELECT id FROM students WHERE organization_id = $1 AND LOWER(email) = $2 AND status != 'LEFT'",
        [orgId, studentEmail]
      );
      if (existingStudent) {
        throw new AppError('A student with these details already exists.', 409);
      }
    }

    if (data.phone) {
      const phoneStr = String(data.phone).trim();
      const phoneRegex = /^[\d+\-\s()]{7,20}$/;
      if (!phoneRegex.test(phoneStr)) {
        throw new AppError('Phone number must be between 7 and 20 digits.', 400);
      }
    }

    const branch = await queryOne<any>(
      'SELECT id, branch_code as "branchCode", name FROM hostels WHERE (id = $1 OR hostel_id = $1 OR branch_code = $1) AND organization_id = $2',
      [branchId, orgId]
    );
    if (!branch) throw new AppError('Hostel branch not found.', 404);
    const actualBranchId = branch.id;

    if (data.bedId) {
      return this.admitStudent(orgId, actualBranchId, data);
    }

    const studentId = await generateStudentId(orgId);
    const customerCode = studentId;
    const studentDbId = require('crypto').randomUUID();
    const finalEmail = studentEmail || `${customerCode.toLowerCase()}@example.com`;

    const initialFee = Number(data.totalFee || data.admissionFee || 0);

    const student = await queryOne<any>(
      `INSERT INTO students (
        id, student_id, customer_code, organization_id, hostel_id, full_name, email,
        phone, gender, date_of_birth, blood_group, aadhar_number, college, course,
        guardian_name, guardian_relation, guardian_phone, guardian_email, guardian_address,
        admission_date, portal_access, portal_access_approved, portal_status, status, financial_total_demanded,
        financial_total_paid, financial_outstanding_balance
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CURRENT_TIMESTAMP, false, false, 'PENDING_APPROVAL', 'ACTIVE', $20, 0, $20)
      RETURNING *`,
      [
        studentDbId,
        studentId,
        customerCode,
        orgId,
        actualBranchId,
        fullName,
        finalEmail,
        data.phone || '+91 0000000000',
        data.gender || 'MALE',
        data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        data.bloodGroup || '',
        data.aadharNumber || '',
        data.collegeOrCompany || data.college || '',
        data.courseOrDesignation || data.course || '',
        data.guardianName || data.guardian?.name || 'Guardian',
        data.guardianRelation || data.guardian?.relation || 'Parent',
        data.guardianPhone || data.guardian?.phone || data.phone || '+91 0000000000',
        data.guardianEmail || data.guardian?.email || '',
        data.guardianAddress || data.guardian?.address || '',
        initialFee
      ]
    );

    emitRealTimeEvent('student.admitted', { studentId: studentDbId, customerCode, name: fullName, branchId: actualBranchId }, { branchId: actualBranchId });
    emitRealTimeEvent('dashboard.kpi_updated', { orgId }, { orgId });

    return this.getById(orgId, studentDbId);
  }

  async allocateBedToStudent(orgId: string, studentId: string, data: { bedId: string; branchId?: string; monthlyRent?: number }) {
    if (!data.bedId) {
      throw new AppError('Bed ID is required for allocation.', 400);
    }

    const student = await queryOne<any>(
      `SELECT * FROM students WHERE (id = $1 OR student_id = $1 OR UPPER(customer_code) = UPPER($1) OR user_id = $1) AND organization_id = $2`,
      [studentId, orgId]
    );
    if (!student) throw new AppError('Student not found in this organization.', 404);

    const bed = await queryOne<any>(
      `SELECT * FROM beds WHERE id = $1 AND organization_id = $2`,
      [data.bedId, orgId]
    );
    if (!bed) throw new AppError('Specified bed does not exist in this organization.', 404);
    if (bed.status !== BedStatus.AVAILABLE && bed.current_student_id !== student.id) {
      throw new AppError(`Bed '${bed.bed_code}' is already ${bed.status}. Please select an available bed.`, 400);
    }

    const room = await queryOne<any>('SELECT * FROM rooms WHERE id = $1', [bed.room_id]);
    if (!room) throw new AppError('Room not found.', 404);
    if (room.occupied_beds >= room.capacity && student.room_id !== room.id) {
      throw new AppError(`Room '${room.room_number}' is already full.`, 400);
    }

    // If student already has a different active bed, release it
    if (student.bed_id && student.bed_id !== bed.id) {
      await query(
        `UPDATE beds SET status = 'AVAILABLE', current_student_id = NULL, current_customer_code = NULL, current_student_name = NULL, allocated_at = NULL WHERE id = $1`,
        [student.bed_id]
      );
      await query(
        `UPDATE room_allocations SET status = 'VACATED', vacated_date = CURRENT_TIMESTAMP WHERE student_id = $1 AND status = 'ACTIVE'`,
        [student.id]
      );
    }

    const monthlyRent = Number(data.monthlyRent || bed.monthly_rate || room.monthly_rate || 8000);

    // Atomically occupy target bed
    await query(
      `UPDATE beds SET status = 'OCCUPIED', current_student_id = $1, current_customer_code = $2, current_student_name = $3, allocated_at = CURRENT_TIMESTAMP WHERE id = $4`,
      [student.id, student.customer_code, student.full_name, bed.id]
    );

    // Update room allocation record
    await query(
      `INSERT INTO room_allocations (id, student_id, room_id, bed_id, hostel_id, organization_id, monthly_rent, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')`,
      [require('crypto').randomUUID(), student.id, room.id, bed.id, room.hostel_id || student.hostel_id, orgId, monthlyRent]
    );

    // Update student
    await query(
      `UPDATE students SET room_id = $1, bed_id = $2, hostel_id = $3 WHERE id = $4`,
      [room.id, bed.id, room.hostel_id || student.hostel_id, student.id]
    );

    emitRealTimeEvent('bed.status_changed', { bedId: bed.id, bedCode: bed.bed_code, status: BedStatus.OCCUPIED }, { branchId: room.hostel_id });
    emitRealTimeEvent('dashboard.kpi_updated', { orgId }, { orgId });

    return this.getById(orgId, student.id);
  }

  async list(orgId: string, branchId?: string, search?: string, status?: string): Promise<any[]> {
    let sql = `SELECT s.*, r.room_number, r.room_type, b.bed_code, b.monthly_rate as bed_monthly_rate,
                      h.name as hostel_name, h.branch_code
               FROM students s
               LEFT JOIN rooms r ON r.id = s.room_id
               LEFT JOIN beds b ON b.id = s.bed_id
               LEFT JOIN hostels h ON h.id = s.hostel_id
               WHERE s.organization_id = $1`;
    const params: any[] = [orgId];

    if (branchId && branchId !== 'ALL') {
      params.push(branchId);
      sql += ` AND s.hostel_id = $${params.length}`;
    }
    if (status && status !== 'ALL') {
      params.push(status);
      sql += ` AND s.status = $${params.length}`;
    }
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      params.push(q);
      sql += ` AND (s.full_name ILIKE $${params.length} OR s.customer_code ILIKE $${params.length} OR s.student_id ILIKE $${params.length} OR s.email ILIKE $${params.length} OR s.phone ILIKE $${params.length} OR r.room_number ILIKE $${params.length} OR b.bed_code ILIKE $${params.length})`;
    }

    sql += ' ORDER BY s.created_at DESC';
    const rows = await queryRows<any>(sql, params);
    return rows.map((r) => this.formatStudentDoc(r));
  }

  async getById(orgId: string, id: string): Promise<any> {
    const student = await queryOne<any>(
      `SELECT s.*, r.room_number, r.room_type, b.bed_code, b.monthly_rate as bed_monthly_rate,
              h.name as hostel_name, h.branch_code
       FROM students s
       LEFT JOIN rooms r ON r.id = s.room_id
       LEFT JOIN beds b ON b.id = s.bed_id
       LEFT JOIN hostels h ON h.id = s.hostel_id
       WHERE (s.id = $1 OR s.student_id = $1 OR UPPER(s.customer_code) = UPPER($1) OR s.user_id = $1)
         AND (s.organization_id = $2 OR $2 IS NULL OR $2 = '' OR $2 = 'ALL')`,
      [id ? id.trim() : id, orgId]
    );
    if (!student) throw new AppError('Student not found in this organization', 404);
    return this.formatStudentDoc(student);
  }

  async getByCustomerCode(orgId: string, code: string): Promise<any> {
    const student = await queryOne<any>(
      `SELECT s.*, r.room_number, r.room_type, b.bed_code, b.monthly_rate as bed_monthly_rate,
              h.name as hostel_name, h.branch_code
       FROM students s
       LEFT JOIN rooms r ON r.id = s.room_id
       LEFT JOIN beds b ON b.id = s.bed_id
       LEFT JOIN hostels h ON h.id = s.hostel_id
       WHERE (UPPER(s.customer_code) = UPPER($1) OR UPPER(s.student_id) = UPPER($1) OR s.id = $1)
         AND (s.organization_id = $2 OR $2 IS NULL OR $2 = '' OR $2 = 'ALL')`,
      [code ? code.trim() : code, orgId]
    );
    if (!student) throw new AppError('Student not found with this customer code', 404);
    return this.formatStudentDoc(student);
  }

  async getTransfers(orgId: string, studentId: string): Promise<any[]> {
    return queryRows(
      `SELECT id, student_id as "studentId", customer_code as "customerCode",
              student_name as "studentName", from_branch_id as "fromBranchId",
              from_bed_code as "fromBedCode", to_branch_id as "toBranchId",
              to_bed_code as "toBedCode", balance_carried_forward as "balanceCarriedForward",
              reason, approved_by as "approvedBy", transfer_date as "transferDate",
              status, created_at as "createdAt"
       FROM student_transfers
       WHERE organization_id = $1 AND student_id = $2
       ORDER BY transfer_date DESC`,
      [orgId, studentId]
    );
  }

  async updateStudent(orgId: string, idOrCode: string, data: any): Promise<any> {
    const student = await queryOne<any>(
      `SELECT * FROM students
       WHERE (id = $1 OR student_id = $1 OR UPPER(customer_code) = UPPER($1) OR user_id = $1)
         AND (organization_id = $2 OR $2 IS NULL OR $2 = '' OR $2 = 'ALL')`,
      [idOrCode ? idOrCode.trim() : idOrCode, orgId]
    );
    if (!student) {
      throw new AppError('Student not found in this organization', 404);
    }

    const sDbId = student.id;
    const fullName = data.fullName || data.name || student.full_name;
    const email = data.email !== undefined ? data.email.trim().toLowerCase() : student.email;
    const phone = data.phone !== undefined ? data.phone : student.phone;
    const gender = data.gender || student.gender;
    const dob = data.dateOfBirth ? new Date(data.dateOfBirth) : student.date_of_birth;
    const bloodGroup = data.bloodGroup !== undefined ? data.bloodGroup : student.blood_group;
    const aadharNumber = data.aadharNumber !== undefined ? data.aadharNumber : student.aadhar_number;
    const college = data.college || data.collegeOrCompany || student.college;
    const course = data.course || data.courseOrDesignation || student.course;
    const guardianName = data.guardianName || data.guardian?.name || student.guardian_name;
    const guardianRelation = data.guardianRelation || data.guardian?.relation || student.guardian_relation;
    const guardianPhone = data.guardianPhone || data.guardian?.phone || student.guardian_phone;
    const guardianEmail = data.guardianEmail || data.guardian?.email || student.guardian_email;
    const guardianAddress = data.guardianAddress || data.guardian?.address || student.guardian_address;
    const status = data.status || student.status;

    await query(
      `UPDATE students
       SET full_name = $1, email = $2, phone = $3, gender = $4, date_of_birth = $5,
           blood_group = $6, aadhar_number = $7, college = $8, course = $9,
           guardian_name = $10, guardian_relation = $11, guardian_phone = $12,
           guardian_email = $13, guardian_address = $14, status = $15,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $16`,
      [
        fullName,
        email,
        phone,
        gender,
        dob,
        bloodGroup,
        aadharNumber,
        college,
        course,
        guardianName,
        guardianRelation,
        guardianPhone,
        guardianEmail,
        guardianAddress,
        status,
        sDbId,
      ]
    );

    // If linked user exists, keep user name & email in sync
    if (student.user_id) {
      await query(
        `UPDATE users
         SET name = $1, email = $2, phone = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [fullName, email, phone, student.user_id]
      );
    }

    emitRealTimeEvent('student.updated', { studentId: sDbId, name: fullName }, { orgId });

    return this.getById(orgId, sDbId);
  }

  async removeStudent(orgId: string, idOrCode: string): Promise<{ success: boolean; message: string; studentId: string }> {
    const student = await queryOne<any>(
      `SELECT * FROM students
       WHERE (id = $1 OR student_id = $1 OR UPPER(customer_code) = UPPER($1) OR user_id = $1)
         AND (organization_id = $2 OR $2 IS NULL OR $2 = '' OR $2 = 'ALL')`,
      [idOrCode ? idOrCode.trim() : idOrCode, orgId]
    );
    if (!student) {
      throw new AppError('Student not found in this organization', 404);
    }

    const sDbId = student.id;
    const sBedId = student.bed_id;
    const sUserId = student.user_id;
    const sName = student.full_name || 'Student';
    const sBranchId = student.hostel_id;
    const sCode = student.customer_code;

    await transaction(async (client) => {
      // 1. Vacate & Free Bed if assigned
      if (sBedId) {
        await client.query(
          `UPDATE beds
           SET status = 'AVAILABLE', current_student_id = NULL, current_customer_code = NULL,
               current_student_name = NULL, allocated_at = NULL
           WHERE id = $1`,
          [sBedId]
        );
      }
      // Also clear any bed where current_student_id = sDbId or current_customer_code = sCode
      await client.query(
        `UPDATE beds
         SET status = 'AVAILABLE', current_student_id = NULL, current_customer_code = NULL,
             current_student_name = NULL, allocated_at = NULL
         WHERE current_student_id = $1 OR current_customer_code = $2`,
        [sDbId, sCode]
      );

      // 2. Remove / Update Room Allocations
      await client.query('DELETE FROM room_allocations WHERE student_id = $1', [sDbId]);

      // 3. Remove Transfers
      await client.query('DELETE FROM student_transfers WHERE student_id = $1', [sDbId]);

      // 4. Remove Fees & Financials
      await client.query('DELETE FROM fee_installments WHERE student_id = $1', [sDbId]);
      await client.query('DELETE FROM fee_demands WHERE student_id = $1', [sDbId]);
      await client.query('DELETE FROM fee_accounts WHERE student_id = $1', [sDbId]);
      await client.query('DELETE FROM receipts WHERE student_id = $1', [sDbId]);
      await client.query('DELETE FROM payments WHERE student_id = $1', [sDbId]);

      // 5. Remove Operational records
      await client.query('DELETE FROM attendances WHERE student_id = $1', [sDbId]);
      await client.query('DELETE FROM meal_attendances WHERE student_id = $1', [sDbId]);
      await client.query('DELETE FROM leave_requests WHERE student_id = $1', [sDbId]);
      await client.query('DELETE FROM complaints WHERE student_id = $1', [sDbId]);
      await client.query('DELETE FROM visitors WHERE student_id = $1', [sDbId]);
      await client.query('DELETE FROM announcement_reads WHERE student_id = $1', [sDbId]);

      // 6. Remove Linked User Account if exists
      if (sUserId) {
        await client.query('DELETE FROM users WHERE id = $1', [sUserId]);
      }
      await client.query('DELETE FROM users WHERE student_id = $1 OR UPPER(customer_code) = UPPER($2)', [sDbId, sCode]);

      // 7. Delete Student Record
      await client.query('DELETE FROM students WHERE id = $1', [sDbId]);

      // 8. Record audit log
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, action, resource, resource_id, details)
         VALUES ($1, $2, 'DELETE_STUDENT', 'students', $3, $4)`,
        [
          require('crypto').randomUUID(),
          orgId,
          sDbId,
          `Student ${sName} (${sCode}) removed permanently by organization admin`
        ]
      );
    });

    // Invalidate dashboard caches
    cache.deletePattern(`dashboard:*:${orgId}*`);

    // Emit real-time events
    if (sBedId) {
      emitRealTimeEvent('bed.status_changed', { bedId: sBedId, status: BedStatus.AVAILABLE, branchId: sBranchId }, { branchId: sBranchId });
    }
    emitRealTimeEvent('student.deleted', { studentId: sDbId, customerCode: sCode, name: sName }, { orgId });
    emitRealTimeEvent('dashboard.kpi_updated', { orgId, branchId: sBranchId }, { orgId });

    return {
      success: true,
      message: `Student ${sName} removed successfully.`,
      studentId: sDbId,
    };
  }

  private formatStudentDoc(s: any): any {
    const totalDemanded = Number(s.financial_total_demanded || 0);
    const totalPaid = Number(s.financial_total_paid || 0);
    const outstandingBalance = Number(s.financial_outstanding_balance || 0);

    let feeStatus: 'PAID' | 'PARTIAL' | 'OVERDUE' | 'NO_DUE' = 'NO_DUE';
    if (totalDemanded > 0) {
      if (outstandingBalance <= 0) feeStatus = 'PAID';
      else if (totalPaid > 0) feeStatus = 'PARTIAL';
      else feeStatus = 'OVERDUE';
    }

    return {
      id: s.id,
      _id: s.id,
      studentId: s.student_id,
      customerCode: s.customer_code,
      name: s.full_name,
      fullName: s.full_name,
      email: s.email,
      phone: s.phone,
      gender: s.gender,
      dateOfBirth: s.date_of_birth,
      bloodGroup: s.blood_group,
      aadharNumber: s.aadhar_number,
      college: s.college,
      collegeOrCompany: s.college,
      course: s.course,
      courseOrDesignation: s.course,
      organizationId: s.organization_id,
      hostelId: s.hostel_id,
      branchId: s.hostel_id,
      hostelName: s.hostel_name || 'Main Hostel',
      roomId: s.room_id,
      roomNumber: s.room_number,
      bedId: s.bed_id,
      bedNumber: s.bed_code,
      bedCode: s.bed_code,
      dateOfAdmission: s.admission_date || s.created_at,
      admissionDate: s.admission_date || s.created_at,
      portalAccess: s.portal_access ? 'ENABLED' : 'DISABLED',
      status: s.status || 'ACTIVE',
      userId: s.user_id,
      avatarUrl: s.avatar_url || '',
      feeTotal: totalDemanded,
      feePaid: totalPaid,
      feeOutstanding: outstandingBalance,
      feeStatus,
      financialSummary: {
        totalDemanded,
        totalPaid,
        outstandingBalance,
      },
      guardian: {
        name: s.guardian_name,
        relation: s.guardian_relation,
        phone: s.guardian_phone,
        email: s.guardian_email,
        address: s.guardian_address,
      },
      guardianName: s.guardian_name,
      guardianPhone: s.guardian_phone,
      guardianEmail: s.guardian_email,
      guardianAddress: s.guardian_address,
      currentAssignment: s.room_id ? {
        branchId: s.hostel_id,
        hostelCode: s.branch_code || 'HYD001',
        roomId: s.room_id,
        roomNumber: s.room_number,
        roomCode: s.room_number,
        bedId: s.bed_id,
        bedCode: s.bed_code,
        monthlyRent: Number(s.bed_monthly_rate || 0),
        allocatedAt: s.admission_date,
      } : undefined,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    };
  }
}
export const studentService = new StudentService();
