import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, queryOne, queryRows, transaction } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { UserRole } from '../../config/constants';
import { generateOwnerId, generateHostelOrgId, generateIhmsId, maskEmail } from '../../common/utils/code-generator';
import { emailService } from '../../common/utils/email.service';

const JWT_SECRET = process.env.JWT_SECRET || 'ihms-super-secret-jwt-key-production-2026';
const JWT_EXPIRES_IN = '24h';
const REFRESH_EXPIRES_IN = '7d';

export function cleanHostelName(rawName?: string): string {
  if (!rawName) return '';
  const trimmed = rawName.trim();
  if (['main', 'sub branch', 'default'].includes(trimmed.toLowerCase())) {
    return '';
  }
  return trimmed;
}

export class AuthService {
  private async generateTokens(user: any) {
    const rawRole = user.role;
    const mappedRole = rawRole === UserRole.OWNER ? 'ORGANIZATION_OWNER'
      : rawRole === UserRole.SUPER_ADMIN ? 'PLATFORM_SUPER_ADMIN'
        : rawRole;

    const org = user.organization_id ? await queryOne<any>('SELECT name FROM organizations WHERE id = $1', [user.organization_id]) : null;
    let hostelBranchName = '';
    if (user.branch_id || user.organization_id) {
      const hostel = await queryOne<any>(
        'SELECT hostel_name, name FROM hostels WHERE id = $1 OR organization_id = $2 ORDER BY created_at ASC LIMIT 1',
        [user.branch_id || user.organization_id, user.organization_id]
      );
      if (hostel?.hostel_name) hostelBranchName = hostel.hostel_name.trim();
      else if (hostel?.name) hostelBranchName = hostel.name.trim();
    }
    const hostelName = cleanHostelName(org?.name) || cleanHostelName(user.hostel_name || user.hostelName) || cleanHostelName(hostelBranchName) || '';

    const payload = {
      id: user.id,
      sub: user.id,
      userId: user.user_id || user.userId,
      organizationId: user.organization_id || user.organizationId,
      branchId: user.branch_id || user.branchId,
      studentId: user.student_id || user.studentId,
      role: mappedRole,
      rawRole,
      email: user.email,
      name: user.name,
      ownerId: user.owner_id || user.ownerId || user.staff_code || user.staffCode,
      customerCode: user.customer_code || user.customerCode,
      mustChangePassword: user.must_change_password || user.mustChangePassword || false,
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: REFRESH_EXPIRES_IN });

    return {
      accessToken,
      refreshToken,
      token: accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: mappedRole,
        organizationId: user.organization_id || user.organizationId,
        hostelName,
        organizationName: hostelName,
        hostelBranchId: user.branch_id || user.branchId,
        studentId: user.student_id || user.studentId,
        ownerId: user.owner_id || user.ownerId || user.staff_code || user.staffCode,
        customerCode: user.customer_code || user.customerCode,
        ihmsId: user.ihms_id || user.ihmsId,
        ihms_id: user.ihms_id || user.ihmsId,
        mustChangePassword: user.must_change_password || user.mustChangePassword || false,
      },
    };
  }

  async checkExistingHostelAccount(email: string) {
    const targetEmail = (email || '').toLowerCase().trim();
    if (!targetEmail) return null;

    const existingOwner = await queryOne<any>(
      `SELECT u.*, o.name as org_name, o.org_code, o.address as org_address,
              h.name as hostel_branch_name, h.city as branch_city, h.state as branch_state, h.branch_name
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       LEFT JOIN hostels h ON h.organization_id = u.organization_id
       WHERE LOWER(u.email) = $1 AND (u.role = 'OWNER' OR u.role = 'ORGANIZATION_OWNER')`,
      [targetEmail]
    );

    if (!existingOwner) return null;

    let ownerIdFormatted = existingOwner.user_id || existingOwner.staff_code || existingOwner.ihms_id;
    if (!ownerIdFormatted || !ownerIdFormatted.startsWith('IHM-')) {
      ownerIdFormatted = await generateIhmsId('H', existingOwner.hostel_name || 'AA', 'Main', existingOwner.organization_id || 'GLOBAL');
      await query('UPDATE users SET user_id = $1, staff_code = $1, ihms_id = $1 WHERE id = $2', [ownerIdFormatted, existingOwner.id]);
    }

    const orgIdFormatted = existingOwner.org_code || `IHMS-HST-${(existingOwner.organization_id || '').slice(-6).toUpperCase()}`;
    const orgName = existingOwner.org_name || existingOwner.hostel_name || 'Hostel Organization';
    const branchName = existingOwner.branch_name || 'Main';
    const location = [existingOwner.branch_city || existingOwner.org_address || 'Hyderabad', existingOwner.branch_state || 'Telangana'].filter(Boolean).join(', ') || 'Hyderabad, Telangana';
    const masked = maskEmail(targetEmail);

    return {
      accountAlreadyExists: true,
      organizationName: orgName,
      organizationId: orgIdFormatted,
      ownerId: ownerIdFormatted,
      branchName,
      location,
      maskedEmail: masked,
      email: targetEmail,
      status: existingOwner.status === 'ACTIVE' ? 'Active' : existingOwner.status,
    };
  }

  async registerOwner(data: {
    orgName?: string;
    hostelName?: string;
    branchName?: string;
    orgEmail?: string;
    orgPhone?: string;
    ownerName: string;
    ownerEmail: string;
    ownerPhone?: string;
    ownerPassword: string;
    currency?: string;
    hostelType?: 'BOYS' | 'GIRLS' | 'CO_ED';
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
    email?: string;
  }) {
    const targetEmail = String(
      data.ownerEmail ||
      data.email ||
      data.orgEmail ||
      (data as any).owner_email ||
      ''
    ).toLowerCase().trim();

    if (!targetEmail) {
      throw new AppError('Owner email is required.', 400);
    }

    const ownerPassword = String(data.ownerPassword || (data as any).password || '').trim();
    if (!ownerPassword) {
      throw new AppError('Password is required.', 400);
    }

    const registeredHostelName = String(
      data.hostelName ||
      data.orgName ||
      (data as any).hostel_name ||
      (data as any).name ||
      (data as any).organizationName ||
      (data as any).organization_name ||
      (data as any).businessName ||
      (data as any).business_name ||
      (data as any).hostelDetails?.name ||
      (data as any).hostelDetails?.hostelName ||
      ''
    ).trim();

    if (!registeredHostelName) {
      throw new AppError('Hostel Name is required.', 400);
    }

    const ownerName = String(
      data.ownerName ||
      (data as any).fullName ||
      (data as any).owner_name ||
      (data as any).name ||
      'Hostel Owner'
    ).trim();

    const initialBranchName = String(
      data.branchName ||
      (data as any).branch_name ||
      (data as any).initialBranchName ||
      (data as any).branch ||
      'Main'
    ).trim() || 'Main';

    const rawHostelType = String(
      data.hostelType ||
      (data as any).type ||
      (data as any).hostel_type ||
      'BOYS'
    ).toUpperCase();
    const normalizedHostelType = rawHostelType.includes('GIRL') ? 'GIRLS'
      : rawHostelType.includes('CO') ? 'CO_ED'
        : 'BOYS';

    const streetAddress = String(data.address || (data as any).streetAddress || (data as any).street_address || '').trim();
    const city = String(data.city || (data as any).branchCity || 'Hyderabad').trim() || 'Hyderabad';
    const state = String(data.state || (data as any).branchState || 'Telangana').trim() || 'Telangana';
    const pincode = String(data.pincode || (data as any).pinCode || (data as any).zip || '').trim();
    const phone = String(data.ownerPhone || data.phone || data.orgPhone || (data as any).owner_phone || '').trim();
    const fullAddress = [streetAddress, city, state, pincode].filter(Boolean).join(', ') || `${city}, ${state}`;

    const existingHostelAccount = await this.checkExistingHostelAccount(targetEmail);
    if (existingHostelAccount) {
      throw new AppError(
        'This email is already associated with an IHMS hostel owner account.',
        409,
        existingHostelAccount
      );
    }

    return transaction(async (client) => {
      const orgId = require('crypto').randomUUID();
      const orgCode = await generateHostelOrgId();

      await client.query(
        `INSERT INTO organizations (id, org_code, name, email, phone, address, currency, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          orgId,
          orgCode,
          registeredHostelName,
          targetEmail,
          phone,
          fullAddress,
          data.currency || 'INR',
          'ACTIVE'
        ]
      );

      const branchId = require('crypto').randomUUID();
      const branchCode = 'HYD001';
      await client.query(
        `INSERT INTO hostels (
          id, hostel_id, branch_code, owner_id, organization_id, hostel_name, name,
          branch_name, hostel_type, address, city, state, pincode, contact_phone,
          contact_email, total_rooms, total_beds, facilities, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          branchId,
          branchCode,
          branchCode,
          orgId,
          orgId,
          registeredHostelName,
          registeredHostelName,
          initialBranchName,
          normalizedHostelType,
          streetAddress || fullAddress,
          city,
          state,
          pincode,
          phone,
          targetEmail,
          0,
          0,
          '',
          'ACTIVE'
        ]
      );

      const ownerUserId = require('crypto').randomUUID();
      const ownerIhmsId = await generateIhmsId('H', registeredHostelName, 'Main', orgId);
      const ownerId = ownerIhmsId;
      const passwordHash = await bcrypt.hash(ownerPassword, 10);

      const ownerRes = await client.query(
        `INSERT INTO users (
          id, user_id, ihms_id, name, email, password_hash, role, phone,
          organization_id, branch_id, staff_code, hostel_name, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACTIVE')
        RETURNING *`,
        [
          ownerUserId,
          ownerId,
          ownerIhmsId,
          ownerName,
          targetEmail,
          passwordHash,
          UserRole.OWNER,
          phone,
          orgId,
          branchId,
          ownerId,
          registeredHostelName
        ]
      );
      const owner = ownerRes.rows[0];

      const ownerProfileId = require('crypto').randomUUID();
      await client.query(
        `INSERT INTO owners (id, user_id, ihms_id, organization_id, full_name, owner_name, email, phone, business_name, registered_hostel_name, address, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ACTIVE')`,
        [
          ownerProfileId,
          ownerUserId,
          ownerIhmsId,
          orgId,
          ownerName,
          ownerName,
          targetEmail,
          phone,
          registeredHostelName,
          registeredHostelName,
          fullAddress
        ]
      );

      // Auto-initialize default 7-day Mess Menu for the new hostel branch
      const now = new Date();
      const dow = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((dow + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const fmtDate = (d: Date) => d.toISOString().split('T')[0];

      const defaultMessDays = [
        {
          day: 'Monday',
          breakfast: ['Idli Sambar', 'Coconut Chutney', 'Tea/Coffee'],
          lunch: ['Rice', 'Dal Fry', 'Sabzi', 'Chapati', 'Salad', 'Buttermilk'],
          snacks: ['Biscuits', 'Tea'],
          dinner: ['Chapati', 'Paneer Curry', 'Rice', 'Dal', 'Salad'],
          isSpecial: false,
        },
        {
          day: 'Tuesday',
          breakfast: ['Poha', 'Boiled Egg', 'Tea/Coffee'],
          lunch: ['Rice', 'Sambar', 'Rasam', 'Papad', 'Curd', 'Pickle'],
          snacks: ['Bread Butter', 'Tea'],
          dinner: ['Chapati', 'Mix Veg Curry', 'Rice', 'Moong Dal', 'Salad'],
          isSpecial: false,
        },
        {
          day: 'Wednesday',
          breakfast: ['Upma', 'Coconut Chutney', 'Tea/Coffee'],
          lunch: ['Rice', 'Rajma', 'Chapati', 'Aloo Sabzi', 'Salad', 'Buttermilk'],
          snacks: ['Samosa', 'Tea'],
          dinner: ['Chapati', 'Egg Curry', 'Rice', 'Dal Tadka', 'Salad'],
          isSpecial: false,
        },
        {
          day: 'Thursday',
          breakfast: ['Dosa', 'Sambar', 'Chutney', 'Tea/Coffee'],
          lunch: ['Rice', 'Chole', 'Chapati', 'Gobi Sabzi', 'Salad', 'Curd'],
          snacks: ['Banana', 'Tea'],
          dinner: ['Chapati', 'Dal Makhani', 'Rice', 'Aloo Sabzi', 'Salad'],
          isSpecial: false,
        },
        {
          day: 'Friday',
          breakfast: ['Paratha', 'Pickle', 'Curd', 'Tea/Coffee'],
          lunch: ['Biryani / Pulao', 'Raita', 'Salad', 'Papad', 'Buttermilk'],
          snacks: ['Cake Slice', 'Tea'],
          dinner: ['Chapati', 'Paneer Masala', 'Rice', 'Dal', 'Salad'],
          isSpecial: false,
        },
        {
          day: 'Saturday',
          breakfast: ['Puri Bhaji', 'Tea/Coffee'],
          lunch: ['Rice', 'Sambar', 'Rasam', 'Pappad', 'Curd', 'Pickle'],
          snacks: ['Vadai', 'Tea'],
          dinner: ['Chapati', 'Chicken Curry / Mushroom Curry', 'Rice', 'Dal', 'Salad'],
          isSpecial: true,
        },
        {
          day: 'Sunday',
          breakfast: ['Bread Toast', 'Omelette / Banana', 'Juice / Tea'],
          lunch: ['Special Rice', 'Chicken Biryani / Veg Dum Biryani', 'Raita', 'Salad', 'Ice Cream'],
          snacks: ['Pakoda', 'Tea'],
          dinner: ['Chapati', 'Paneer Butter Masala', 'Rice', 'Dal', 'Halwa'],
          isSpecial: true,
        },
      ];

      await client.query(
        `INSERT INTO mess_menus (
          id, organization_id, hostel_id, week_start_date, week_end_date,
          days, status, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, $7)`,
        [
          require('crypto').randomUUID(),
          orgId,
          branchId,
          fmtDate(monday),
          fmtDate(sunday),
          JSON.stringify(defaultMessDays),
          ownerName
        ]
      );

      const tokens = await this.generateTokens(owner);
      return {
        ...tokens,
        ownerId,
        organizationId: orgId,
        organizationCode: orgCode,
        hostelBranchId: branchId,
        hostelCode: branchCode,
        hostelName: registeredHostelName,
        branchName: initialBranchName,
        ownerName: owner.name,
        email: owner.email,
        organization: {
          id: orgId,
          _id: orgId,
          orgCode,
          name: registeredHostelName,
          status: 'ACTIVE',
        },
      };
    });
  }

  async login(identifier: string, password: string, loginType?: 'STUDENT' | 'ADMIN') {
    const rawQuery = (identifier || '').trim();
    if (!rawQuery || !password) {
      throw new AppError('Email or ID and password are required.', 400);
    }

    const normalizedEmail = rawQuery.toLowerCase();
    const normalizedCode = rawQuery.toUpperCase();

    // 1. ADMIN / STAFF LOGIN
    if (loginType === 'ADMIN') {
      let user = await queryOne<any>(
        `SELECT * FROM users
         WHERE (LOWER(email) = $1 OR UPPER(ihms_id) = $2)
           AND role != 'STUDENT'`,
        [normalizedEmail, normalizedCode]
      );

      if (!user) {
        throw new AppError('Invalid Admin / Staff credentials.', 401);
      }

      if (user.status === 'DISABLED' || user.status === 'INACTIVE') {
        throw new AppError('Your account is disabled. Please contact your organization owner.', 403);
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        throw new AppError('Invalid Admin / Staff credentials.', 401);
      }

      await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
      return await this.generateTokens(user);
    }

    // 2. STUDENT LOGIN
    if (loginType === 'STUDENT') {
      const student = await this.findStudentForActivation(rawQuery);
      if (!student) {
        throw new AppError('Invalid Student credentials. Student ID or registered email not found.', 404);
      }

      const isApproved = Boolean(
        student.portal_access_approved === true ||
        student.portal_access === true ||
        student.portal_status === 'PENDING_ACTIVATION' ||
        student.portal_status === 'ACTIVE'
      );

      if (!isApproved) {
        throw new AppError('Student portal access is disabled by your hostel administration. Please contact your hostel owner.', 403);
      }

      let user: any = null;
      if (student.user_id) {
        user = await queryOne<any>('SELECT * FROM users WHERE id = $1 AND role = $2', [student.user_id, 'STUDENT']);
      }
      if (!user) {
        user = await queryOne<any>(
          `SELECT * FROM users
           WHERE (LOWER(email) = $1 OR UPPER(ihms_id) = $2)
             AND role = 'STUDENT'
           ORDER BY created_at DESC LIMIT 1`,
          [(student.email || '').toLowerCase(), (student.ihms_id || '').toUpperCase()]
        );
      }

      if (!user || !user.password_hash || (!student.password_set && student.portal_status !== 'ACTIVE' && student.activation_status !== 'ACTIVATED')) {
        throw new AppError('Your account requires activation. Please click Send OTP to complete account activation.', 400);
      }

      if (user.status === 'DISABLED' || user.status === 'INACTIVE' || student.portal_status === 'DISABLED') {
        throw new AppError('Student portal access has been disabled by your hostel administration.', 403);
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        throw new AppError('Invalid credentials or incorrect password. Please try again.', 401);
      }

      await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
      return await this.generateTokens(user);
    }

    // 3. AUTO / FALLBACK
    const autoStudent = await queryOne<any>(
      `SELECT * FROM students
       WHERE UPPER(ihms_id) = $1 OR LOWER(email) = $2`,
      [normalizedCode, normalizedEmail]
    );

    if (autoStudent) {
      if (!autoStudent.portal_access) {
        throw new AppError('Your portal access has not been enabled or is disabled by the hostel administration.', 403);
      }

      let user = await queryOne<any>(
        `SELECT * FROM users
         WHERE (id = $1 OR UPPER(ihms_id) = $2 OR LOWER(email) = $3)
           AND role = 'STUDENT'`,
        [autoStudent.user_id, (autoStudent.ihms_id || '').toUpperCase(), autoStudent.email.toLowerCase()]
      );

      if (!user || user.status === 'DISABLED' || user.status === 'INACTIVE') {
        throw new AppError('Your portal access has not been enabled or is disabled by the hostel administration.', 403);
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        throw new AppError('Invalid login credentials.', 401);
      }

      await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
      return await this.generateTokens(user);
    }

    let user = await queryOne<any>(
      `SELECT * FROM users
       WHERE LOWER(email) = $1 OR UPPER(ihms_id) = $2`,
      [normalizedEmail, normalizedCode]
    );

    if (user) {
      if (user.status === 'DISABLED' || user.status === 'INACTIVE') {
        throw new AppError('Your account is disabled.', 403);
      }
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        throw new AppError('Invalid login credentials.', 401);
      }
      await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
      return await this.generateTokens(user);
    }

    throw new AppError('Invalid login credentials.', 401);
  }

  async ensureSeedDefaults() {
    try {
      const defaultPasswordHash = await bcrypt.hash('Admin@123', 10);
      let org = await queryOne<any>('SELECT * FROM organizations LIMIT 1');
      if (!org) {
        const orgId = require('crypto').randomUUID();
        org = await queryOne<any>(
          `INSERT INTO organizations (id, org_code, name, email, phone, currency, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [orgId, 'ORG-1001', 'Green Valley Hostels Pvt Ltd', 'admin@greenvalleyhostels.com', '+91 9848012345', 'INR', 'ACTIVE']
        );
      }

      const orgId = org.id;

      const ownerExists = await queryOne('SELECT id FROM users WHERE LOWER(email) = $1', ['owner@ihms.com']);
      if (!ownerExists) {
        await query(
          `INSERT INTO users (id, user_id, name, email, password_hash, role, phone, organization_id, staff_code, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [require('crypto').randomUUID(), 'OWN-1001', 'Rajesh Varma (Owner)', 'owner@ihms.com', defaultPasswordHash, UserRole.OWNER, '+91 9848011111', orgId, 'OWN-1001', 'ACTIVE']
        );
      }

      const adminExists = await queryOne('SELECT id FROM users WHERE LOWER(email) = $1', ['admin@ihms.com']);
      if (!adminExists) {
        await query(
          `INSERT INTO users (id, user_id, name, email, password_hash, role, phone, organization_id, staff_code, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [require('crypto').randomUUID(), 'ADM-1001', 'Hostel Admin', 'admin@ihms.com', defaultPasswordHash, UserRole.OWNER, '+91 9848011112', orgId, 'ADM-1001', 'ACTIVE']
        );
      }

      const superAdminExists = await queryOne('SELECT id FROM users WHERE LOWER(email) = $1', ['superadmin@ihms.com']);
      if (!superAdminExists) {
        await query(
          `INSERT INTO users (id, user_id, name, email, password_hash, role, phone, organization_id, staff_code, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [require('crypto').randomUUID(), 'SUP-1001', 'Global Super Admin', 'superadmin@ihms.com', defaultPasswordHash, UserRole.SUPER_ADMIN, '+91 9848000000', orgId, 'SUP-1001', 'ACTIVE']
        );
      }

      const hostel = await queryOne<any>('SELECT id FROM hostels WHERE organization_id = $1 LIMIT 1', [orgId]);
      const hostelId = hostel ? hostel.id : orgId;

      const activeStudentExists = await queryOne("SELECT id FROM students WHERE UPPER(customer_code) = 'HYD001-ST000001' OR LOWER(email) = 'student@ihms.com'");
      if (!activeStudentExists) {
        const studentUuid = require('crypto').randomUUID();
        const userUuid = require('crypto').randomUUID();
        await query(
          `INSERT INTO users (id, user_id, name, email, password_hash, role, phone, organization_id, customer_code, student_id, status)
           VALUES ($1, 'HYD001-ST000001', 'Rahul Kumar', 'student@ihms.com', $2, 'STUDENT', '+91 9848099999', $3, 'HYD001-ST000001', $4, 'ACTIVE')`,
          [userUuid, defaultPasswordHash, orgId, studentUuid]
        );

        await query(
          `INSERT INTO students (
            id, user_id, organization_id, hostel_id, customer_code, student_id, ihms_id, full_name, email,
            portal_access, portal_access_approved, portal_status, activation_status, password_set, status
          ) VALUES ($1, $2, $3, $4, 'IHM-GV-MN-S-0001', 'IHM-GV-MN-S-0001', 'IHM-GV-MN-S-0001', 'Rahul Kumar', 'student@ihms.com', true, true, 'ACTIVE', 'ACTIVATED', true, 'ACTIVE')`,
          [studentUuid, userUuid, orgId, hostelId]
        );
      }

      const stu2026003Exists = await queryOne("SELECT id FROM students WHERE UPPER(customer_code) = 'IHM-GV-MN-S-0003' OR UPPER(ihms_id) = 'IHM-GV-MN-S-0003'");
      if (!stu2026003Exists) {
        const studentUuid = require('crypto').randomUUID();
        await query(
          `INSERT INTO students (
            id, organization_id, hostel_id, customer_code, student_id, ihms_id, full_name, email,
            portal_access, portal_access_approved, portal_status, activation_status, password_set, status
          ) VALUES ($1, $2, $3, 'IHM-GV-MN-S-0003', 'IHM-GV-MN-S-0003', 'IHM-GV-MN-S-0003', 'Rahul Varma', 'stu2026003@ihms.com', true, true, 'PENDING_ACTIVATION', 'UNACTIVATED', false, 'ACTIVE')`,
          [studentUuid, orgId, hostelId]
        );
      }
    } catch (err: any) {
      console.warn('[Bootstrap] Warning while ensuring seed defaults:', err.message);
    }
  }

  async getSystemSetupStatus() {
    const orgCountRow = await queryOne<any>('SELECT COUNT(*)::int as count FROM organizations');
    const orgCount = Number(orgCountRow?.count || 0);
    const userCountRow = await queryOne<any>("SELECT COUNT(*)::int as count FROM users WHERE role IN ('OWNER', 'ORGANIZATION_OWNER', 'SUPER_ADMIN')");
    const userCount = Number(userCountRow?.count || 0);

    return {
      isSetupCompleted: orgCount > 0 && userCount > 0,
      hasOrganizations: orgCount > 0,
      organizationCount: orgCount,
      userCount: userCount,
    };
  }

  async getMe(userId: string) {
    const user = await queryOne<any>('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) throw new AppError('User session expired or not found', 404);

    const org = user.organization_id ? await queryOne<any>('SELECT name FROM organizations WHERE id = $1', [user.organization_id]) : null;
    let hostelBranchName = '';
    if (user.branch_id || user.organization_id) {
      const hostel = await queryOne<any>(
        'SELECT hostel_name, name FROM hostels WHERE id = $1 OR organization_id = $2 ORDER BY created_at ASC LIMIT 1',
        [user.branch_id || user.organization_id, user.organization_id]
      );
      if (hostel?.hostel_name) hostelBranchName = hostel.hostel_name.trim();
      else if (hostel?.name) hostelBranchName = hostel.name.trim();
    }
    const hostelName = cleanHostelName(org?.name) || cleanHostelName(user.hostel_name) || cleanHostelName(hostelBranchName) || '';

    const rawRole = user.role;
    const mappedRole = rawRole === UserRole.OWNER ? 'ORGANIZATION_OWNER'
      : rawRole === UserRole.SUPER_ADMIN ? 'PLATFORM_SUPER_ADMIN'
        : rawRole;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: mappedRole as any,
      rawRole,
      organizationId: user.organization_id,
      hostelName,
      organizationName: hostelName,
      hostelBranchId: user.branch_id,
      studentId: user.student_id,
      ownerId: user.user_id || user.staff_code,
      customerCode: user.customer_code,
      ihmsId: user.ihms_id,
      ihms_id: user.ihms_id,
      mustChangePassword: user.must_change_password || false,
      avatarUrl: '',
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (!currentPassword || !newPassword) {
      throw new AppError('Current password and new password are required.', 400);
    }

    const user = await queryOne<any>('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) throw new AppError('User not found.', 404);

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      throw new AppError('Current password is incorrect.', 400);
    }

    if (newPassword.length < 8) {
      throw new AppError('New password must be at least 8 characters long.', 400);
    }
    if (!/[A-Z]/.test(newPassword)) {
      throw new AppError('New password must contain at least one uppercase letter.', 400);
    }
    if (!/[a-z]/.test(newPassword)) {
      throw new AppError('New password must contain at least one lowercase letter.', 400);
    }
    if (!/[0-9]/.test(newPassword)) {
      throw new AppError('New password must contain at least one number.', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [passwordHash, userId]);
    user.password_hash = passwordHash;
    user.must_change_password = false;

    return {
      success: true,
      message: 'Password changed successfully.',
      tokens: await this.generateTokens(user),
    };
  }

  private async findUserForPasswordReset(queryStr: string) {
    const normalized = (queryStr || '').trim();
    if (!normalized) return null;

    const lower = normalized.toLowerCase();
    const upper = normalized.toUpperCase();

    // 1. Search users table (Owner, Admin, Super Admin, Student)
    let user = await queryOne<any>(
      `SELECT * FROM users
       WHERE LOWER(email) = $1 OR UPPER(ihms_id) = $2 OR UPPER(user_id) = $2 OR UPPER(staff_code) = $2 OR UPPER(customer_code) = $2`,
      [lower, upper]
    );

    // 2. If not found directly in users, search students table
    if (!user) {
      const student = await queryOne<any>(
        `SELECT * FROM students
         WHERE LOWER(email) = $1 OR UPPER(ihms_id) = $2 OR UPPER(customer_code) = $2 OR UPPER(student_id) = $2`,
        [lower, upper]
      );

      if (student && (student.portal_access === true || student.portal_access === 'true' || student.portal_access === 't' || student.portal_access === 1)) {
        user = await queryOne<any>(
          `SELECT * FROM users
           WHERE (id = $1 OR student_id = $2 OR UPPER(customer_code) = $3 OR UPPER(ihms_id) = $3 OR LOWER(email) = $4)
             AND role = 'STUDENT'`,
          [student.user_id, student.id, (student.ihms_id || student.customer_code || '').toUpperCase(), (student.email || '').toLowerCase()]
        );
      }
    }

    return user;
  }

  async requestPasswordResetOtp(identifier: string) {
    const genericResponse = {
      success: true,
      message: 'If an account exists for this email or ID, a verification code has been sent.',
    };

    const queryStr = (identifier || '').trim();
    if (!queryStr) {
      return genericResponse;
    }

    const user = await this.findUserForPasswordReset(queryStr);
    if (!user || user.status === 'DISABLED' || user.status === 'INACTIVE') {
      return genericResponse;
    }

    // Cooldown check (60 seconds between resends/requests)
    const lastOtp = await queryOne<any>(
      "SELECT created_at FROM otps WHERE user_id = $1 AND otp_purpose = 'PASSWORD_RESET' ORDER BY created_at DESC LIMIT 1",
      [user.id]
    );

    if (lastOtp && (Date.now() - new Date(lastOtp.created_at).getTime()) < 60000) {
      return genericResponse;
    }

    // Invalidate previous active OTPs for PASSWORD_RESET purpose for this user
    await query(
      "UPDATE otps SET used_at = NOW() WHERE user_id = $1 AND otp_purpose = 'PASSWORD_RESET' AND used_at IS NULL",
      [user.id]
    );

    // Generate cryptographically secure 6-digit OTP
    const crypto = require('crypto');
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otpCode, 10);

    const otpId = crypto.randomUUID();
    await query(
      `INSERT INTO otps (
        id, user_id, identifier, organization_id, otp_purpose, otp_hash, expires_at, attempt_count, max_attempts
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '10 minutes', 0, 5)`,
      [
        otpId,
        user.id,
        queryStr.toLowerCase(),
        user.organization_id || null,
        'PASSWORD_RESET',
        otpHash,
      ]
    );

    // Send email via emailService
    await emailService.sendOtpEmail({
      to: user.email,
      otpCode,
      studentName: user.name,
      purpose: 'PASSWORD_RESET',
    });

    return genericResponse;
  }

  async resendPasswordResetOtp(identifier: string) {
    const genericResponse = {
      success: true,
      message: 'If an account exists for this email or ID, a verification code has been sent.',
    };

    const queryStr = (identifier || '').trim();
    if (!queryStr) return genericResponse;

    const user = await this.findUserForPasswordReset(queryStr);
    if (!user || user.status === 'DISABLED' || user.status === 'INACTIVE') {
      return genericResponse;
    }

    const lastOtp = await queryOne<any>(
      "SELECT created_at FROM otps WHERE user_id = $1 AND otp_purpose = 'PASSWORD_RESET' ORDER BY created_at DESC LIMIT 1",
      [user.id]
    );

    if (lastOtp && (Date.now() - new Date(lastOtp.created_at).getTime()) < 60000) {
      throw new AppError('Please wait 60 seconds before requesting another verification code.', 429);
    }

    await query(
      "UPDATE otps SET used_at = NOW() WHERE user_id = $1 AND otp_purpose = 'PASSWORD_RESET' AND used_at IS NULL",
      [user.id]
    );

    const crypto = require('crypto');
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otpCode, 10);

    await query(
      `INSERT INTO otps (
        id, user_id, identifier, organization_id, otp_purpose, otp_hash, expires_at, attempt_count, max_attempts
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '10 minutes', 0, 5)`,
      [
        crypto.randomUUID(),
        user.id,
        queryStr.toLowerCase(),
        user.organization_id || null,
        'PASSWORD_RESET',
        otpHash,
      ]
    );

    await emailService.sendOtpEmail({
      to: user.email,
      otpCode,
      studentName: user.name,
      purpose: 'PASSWORD_RESET',
    });

    return genericResponse;
  }

  async verifyPasswordResetOtp(identifier: string, otp: string) {
    const queryStr = (identifier || '').trim();
    const inputOtp = (otp || '').trim();

    if (!queryStr || !inputOtp) {
      throw new AppError('Registered email/ID and verification code are required.', 400);
    }

    const user = await this.findUserForPasswordReset(queryStr);
    if (!user || user.status === 'DISABLED' || user.status === 'INACTIVE') {
      throw new AppError('Invalid or expired verification code. Please request a new code.', 400);
    }

    const activeOtp = await queryOne<any>(
      `SELECT * FROM otps
       WHERE user_id = $1 AND otp_purpose = 'PASSWORD_RESET' AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );

    if (!activeOtp) {
      throw new AppError('Verification code has expired or is invalid. Please request a new code.', 400);
    }

    if (activeOtp.attempt_count >= activeOtp.max_attempts) {
      await query('UPDATE otps SET used_at = NOW() WHERE id = $1', [activeOtp.id]);
      throw new AppError('Maximum verification attempts exceeded. Please request a new code.', 400);
    }

    const isMatch = await bcrypt.compare(inputOtp, activeOtp.otp_hash);
    if (!isMatch) {
      const nextCount = Number(activeOtp.attempt_count || 0) + 1;
      if (nextCount >= activeOtp.max_attempts) {
        await query('UPDATE otps SET attempt_count = $1, used_at = NOW() WHERE id = $2', [nextCount, activeOtp.id]);
        throw new AppError('Maximum verification attempts exceeded. Please request a new code.', 400);
      } else {
        await query('UPDATE otps SET attempt_count = $1 WHERE id = $2', [nextCount, activeOtp.id]);
        throw new AppError('Invalid verification code. Please check and try again.', 400);
      }
    }

    // Mark OTP as used
    await query('UPDATE otps SET used_at = NOW() WHERE id = $1', [activeOtp.id]);

    // Issue short-lived reset authorization token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    await query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes')`,
      [crypto.randomUUID(), user.id, tokenHash]
    );

    return {
      success: true,
      resetToken,
      message: 'Verification code confirmed successfully. Please set your new password.',
    };
  }

  async resetPasswordWithToken(resetToken: string, newPassword: string, confirmPassword?: string) {
    if (!resetToken || !newPassword) {
      throw new AppError('Reset token and new password are required.', 400);
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      throw new AppError('New password and confirm password do not match.', 400);
    }

    if (newPassword.length < 8) {
      throw new AppError('New password must be at least 8 characters long.', 400);
    }
    if (!/[A-Z]/.test(newPassword)) {
      throw new AppError('New password must contain at least one uppercase letter.', 400);
    }
    if (!/[a-z]/.test(newPassword)) {
      throw new AppError('New password must contain at least one lowercase letter.', 400);
    }
    if (!/[0-9]/.test(newPassword)) {
      throw new AppError('New password must contain at least one number.', 400);
    }

    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(resetToken.trim()).digest('hex');

    const tokenRecord = await queryOne<any>(
      `SELECT * FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );

    if (!tokenRecord) {
      throw new AppError('Password reset authorization is invalid or has expired. Please restart the forgot password process.', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query(
      'UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE id = $2',
      [passwordHash, tokenRecord.user_id]
    );

    // Invalidate reset token and all active reset tokens / OTPs for this user
    await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [tokenRecord.id]);
    await query("UPDATE otps SET used_at = NOW() WHERE user_id = $1 AND otp_purpose = 'PASSWORD_RESET' AND used_at IS NULL", [tokenRecord.user_id]);
    await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [tokenRecord.user_id]);

    await query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, resource, resource_id, details)
       VALUES ($1, $2, $3, 'PASSWORD_RESET', 'users', $3, 'Password reset completed via secure OTP verification')`,
      [crypto.randomUUID(), tokenRecord.organization_id || null, tokenRecord.user_id]
    ).catch(() => { });

    return {
      success: true,
      message: 'Password changed successfully. Please sign in with your new password.',
    };
  }

  // ----------------------------------------------------
  // 6-DIGIT OTP STUDENT ACCOUNT ACTIVATION & FIRST-TIME LOGIN
  // ----------------------------------------------------

  async findStudentForActivation(identifier: string) {
    if (!identifier || typeof identifier !== 'string') return null;
    const cleanId = identifier.trim();
    if (!cleanId) return null;

    const isEmail = cleanId.includes('@');
    const lookupType = isEmail ? 'EMAIL' : 'STUDENT_ID';

    console.log(`[STUDENT-OTP-LOOKUP] ----------------------------------------------------`);
    console.log(`[STUDENT-OTP-LOOKUP] Identifier received from frontend: "${cleanId}"`);
    console.log(`[STUDENT-OTP-LOOKUP] Lookup type: ${lookupType}`);

    const normalizedClean = cleanId.replace(/[\s-]/g, '').toUpperCase();

    // 1. Direct query on students table (case-insensitive email & normalized ihms_id)
    let student = await queryOne<any>(
      `SELECT s.*, o.name as org_name
       FROM students s
       LEFT JOIN organizations o ON o.id = s.organization_id
       WHERE LOWER(s.email) = LOWER($1)
          OR UPPER(s.ihms_id) = UPPER($1)
          OR REPLACE(REPLACE(UPPER(COALESCE(s.ihms_id, '')), '-', ''), ' ', '') = $2
       ORDER BY s.created_at DESC LIMIT 1`,
      [cleanId, normalizedClean]
    );

    // 2. Fallback query on users table if student record is not directly matched (role = 'STUDENT')
    if (!student) {
      const user = await queryOne<any>(
        `SELECT * FROM users
         WHERE (LOWER(email) = LOWER($1)
             OR UPPER(ihms_id) = UPPER($1)
             OR REPLACE(REPLACE(UPPER(COALESCE(ihms_id, '')), '-', ''), ' ', '') = $2)
           AND role = 'STUDENT'
         LIMIT 1`,
        [cleanId, normalizedClean]
      );

      if (user) {
        student = await queryOne<any>(
          `SELECT s.*, o.name as org_name
           FROM students s
           LEFT JOIN organizations o ON o.id = s.organization_id
           WHERE s.id = $1
              OR s.user_id = $2
              OR LOWER(s.email) = LOWER($3)
              OR UPPER(s.customer_code) = UPPER($4)
           ORDER BY s.created_at DESC LIMIT 1`,
          [user.student_id || user.id, user.id, user.email, user.customer_code || user.user_id]
        );

        if (!student) {
          student = {
            id: user.student_id || user.id,
            student_id: user.student_id || user.user_id,
            customer_code: user.customer_code || user.user_id,
            user_id: user.id,
            organization_id: user.organization_id,
            full_name: user.name,
            email: user.email,
            phone: user.phone,
            portal_access: true,
            portal_access_approved: true,
            portal_status: 'ACTIVE',
            activation_status: 'ACTIVATED',
            password_set: true,
            status: user.status || 'ACTIVE',
          };
        }
      }
    }

    if (student) {
      console.log(`[STUDENT-OTP-LOOKUP] Matching student found: YES (Student ID: ${student.customer_code || student.student_id || student.id}, Name: ${student.full_name}, Email: ${student.email})`);
    } else {
      console.log(`[STUDENT-OTP-LOOKUP] Matching student found: NO`);
    }
    console.log(`[STUDENT-OTP-LOOKUP] ----------------------------------------------------`);

    return student || null;
  }

  async getStudentLoginStatus(identifier: string) {
    const student = await this.findStudentForActivation(identifier);
    if (!student) {
      throw new AppError('Student ID or registered email not found.', 404);
    }

    const isApproved = Boolean(
      student.status === 'ACTIVE' ||
      student.portal_access_approved === true ||
      student.portal_access === true ||
      student.portal_status === 'PENDING_APPROVAL' ||
      student.portal_status === 'PENDING_ACTIVATION' ||
      student.portal_status === 'ACTIVE' ||
      !student.portal_status
    );

    if (!isApproved) {
      throw new AppError('Student portal access has not been enabled by your hostel administration. Please contact your hostel owner.', 403);
    }

    // Check if a user record already exists and has set a password
    let existingUser: any = null;
    if (student.user_id) {
      existingUser = await queryOne<any>('SELECT * FROM users WHERE id = $1', [student.user_id]);
    }
    if (!existingUser) {
      existingUser = await queryOne<any>(
        `SELECT * FROM users
         WHERE (LOWER(email) = LOWER($1)
             OR UPPER(customer_code) = UPPER($2)
             OR UPPER(student_id) = UPPER($3)
             OR UPPER(user_id) = UPPER($3)
             OR id = $4)
           AND role = 'STUDENT'
         ORDER BY created_at DESC LIMIT 1`,
        [student.email, student.customer_code, student.id, student.user_id || student.id]
      );
    }

    const hasValidPassword = Boolean(existingUser && existingUser.password_hash && existingUser.password_hash.length > 10);
    const hasPassword = Boolean(hasValidPassword || student.password_set === true);
    const isStudentFlaggedActive = Boolean(
      student.portal_status === 'ACTIVE' ||
      student.activation_status === 'ACTIVATED'
    );
    const isActivated = Boolean(hasPassword || isStudentFlaggedActive);

    if (isActivated) {
      return {
        success: true,
        exists: true,
        hasPassword: true,
        alreadyActivated: true,
        requiresActivation: false,
        requiresPassword: true,
        requiresOtp: false,
        nextStep: 'PASSWORD_LOGIN',
        status: 'ACTIVATED',
        studentId: student.customer_code || student.student_id,
        fullName: student.full_name,
        email: student.email,
        message: 'Your student portal is already activated. Please sign in using your password.',
      };
    }

    return {
      success: true,
      exists: true,
      hasPassword: false,
      alreadyActivated: false,
      requiresActivation: true,
      requiresPassword: false,
      requiresOtp: true,
      nextStep: 'OTP_ACTIVATION',
      status: 'ACTIVATION_PENDING',
      studentId: student.customer_code || student.student_id,
      fullName: student.full_name,
      email: student.email,
      message: 'Student account is approved for activation. Please request and verify your OTP.',
    };
  }

  async sendStudentActivationOtp(identifier: string, emailCandidate?: string, studentIdCandidate?: string) {
    const rawInput = identifier || emailCandidate || studentIdCandidate;
    if (!rawInput || typeof rawInput !== 'string' || !rawInput.trim()) {
      throw new AppError('Please enter your Student ID or registered email address.', 400);
    }
    const cleanId = rawInput.trim();

    const student = await this.findStudentForActivation(cleanId);
    if (!student) {
      throw new AppError('Student ID or registered email not found.', 404);
    }

    const sEmail = (student.email || '').trim().toLowerCase();
    const sCustomerCode = (student.customer_code || '').trim().toUpperCase();

    // 1. Check student status
    if (student.status === 'EXPELLED' || student.status === 'LEFT' || student.status === 'INACTIVE') {
      throw new AppError('Cannot send OTP for inactive or expelled students. Please contact your hostel admin.', 403);
    }

    // 2. Check if student has valid registered email
    if (!sEmail) {
      throw new AppError('No registered email found for this student. Please contact your hostel admin.', 400);
    }

    // 3. Cross-check: Is the student account already activated?
    let linkedUser: any = null;
    if (student.user_id) {
      linkedUser = await queryOne<any>('SELECT * FROM users WHERE id = $1', [student.user_id]);
    }
    if (!linkedUser) {
      linkedUser = await queryOne<any>(
        `SELECT * FROM users
         WHERE (LOWER(email) = LOWER($1)
             OR UPPER(customer_code) = UPPER($2)
             OR UPPER(student_id) = UPPER($3)
             OR UPPER(user_id) = UPPER($3)
             OR id = $4)
           AND role = 'STUDENT'
         ORDER BY created_at DESC LIMIT 1`,
        [sEmail, sCustomerCode, student.id, student.user_id || student.id]
      );
    }

    const hasValidPassword = Boolean(linkedUser && linkedUser.password_hash && linkedUser.password_hash.length > 10);
    const hasPassword = Boolean(hasValidPassword || student.password_set === true);
    const isAlreadyActive = Boolean(hasPassword || student.activation_status === 'ACTIVATED' || student.portal_status === 'ACTIVE');

    if (isAlreadyActive) {
      return {
        success: true,
        exists: true,
        hasPassword: true,
        alreadyActivated: true,
        requiresPassword: true,
        requiresOtp: false,
        nextStep: 'PASSWORD_LOGIN',
        studentId: student.customer_code || student.student_id,
        fullName: student.full_name,
        email: sEmail,
        message: 'Your student portal is already activated. Please sign in using your password.',
      };
    }

    // Mask email (e.g. s*****@gmail.com)
    const [local, domain] = sEmail.split('@');
    const visible = local.slice(0, Math.min(2, local.length));
    const maskedEmail = `${visible}${'*'.repeat(Math.max(4, local.length - 2))}@${domain}`;

    // 4. Rate limit check: if OTP was generated within 60 seconds and still active, return success with masked email
    const recentOtp = await queryOne<any>(
      `SELECT * FROM otps
       WHERE (LOWER(identifier) = LOWER($1) OR UPPER(identifier) = UPPER($2) OR user_id = $3)
         AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION'
         AND created_at > (NOW() - INTERVAL '60 seconds')
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [sEmail, sCustomerCode, student.id]
    );

    if (recentOtp) {
      return {
        success: true,
        exists: true,
        hasPassword: false,
        alreadyActivated: false,
        requiresOtp: true,
        nextStep: 'OTP_ACTIVATION',
        maskedEmail,
        email: sEmail,
        studentId: student.customer_code || student.student_id,
        fullName: student.full_name,
        message: `Verification code sent to ${maskedEmail}`,
        _debugOtp: process.env.NODE_ENV !== 'production' ? recentOtp.otp_code : undefined,
      };
    }

    // Invalidate previous activation OTPs
    await query(
      "UPDATE otps SET used_at = NOW() WHERE (LOWER(identifier) = LOWER($1) OR UPPER(identifier) = UPPER($2) OR user_id = $3) AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION' AND used_at IS NULL",
      [sEmail, sCustomerCode, student.id]
    );

    const crypto = require('crypto');
    const otpCode = crypto.randomInt(100000, 1000000).toString(); // 6-digit OTP
    const otpHash = await bcrypt.hash(otpCode, 10);

    await query(
      `INSERT INTO otps (
        id, user_id, identifier, organization_id, otp_purpose, otp_hash, expires_at, attempt_count, max_attempts
      ) VALUES ($1, $2, $3, $4, 'STUDENT_ACCOUNT_ACTIVATION', $5, NOW() + INTERVAL '10 minutes', 0, 5)`,
      [crypto.randomUUID(), student.id, sEmail, student.organization_id, otpHash]
    );

    // Attempt to send email via SMTP email service
    await emailService.sendOtpEmail({
      to: sEmail,
      otpCode,
      studentName: student.full_name,
      purpose: 'ACTIVATION',
    });

    return {
      success: true,
      exists: true,
      hasPassword: false,
      alreadyActivated: false,
      requiresOtp: true,
      nextStep: 'OTP_ACTIVATION',
      maskedEmail,
      email: sEmail,
      studentId: student.customer_code || student.student_id,
      fullName: student.full_name,
      message: `Verification code sent to ${maskedEmail}`,
      _debugOtp: process.env.NODE_ENV !== 'production' ? otpCode : undefined,
    };
  }

  async verifyStudentActivationOtp(identifier: string, otp: string) {
    if (!otp || typeof otp !== 'string' || (otp.trim().length !== 4 && otp.trim().length !== 6)) {
      throw new AppError('Invalid 4-digit or 6-digit activation code.', 400);
    }

    const student = await this.findStudentForActivation(identifier);
    if (!student) {
      throw new AppError('Student ID or registered email not found.', 404);
    }

    const isApproved = Boolean(
      student.portal_access_approved === true ||
      student.portal_access === true ||
      student.portal_status === 'PENDING_ACTIVATION' ||
      student.portal_status === 'ACTIVE' ||
      student.activation_status === 'ACCESS_GRANTED'
    );

    if (!isApproved) {
      throw new AppError('Student portal access has not been enabled by your hostel administration. Please contact your hostel owner.', 403);
    }

    const cleanOtp = otp.trim();
    const sEmail = (student.email || '').toLowerCase();
    const sCustomerCode = (student.customer_code || '').toUpperCase();

    // Look up active activation OTP (10 min expiry)
    const activeOtp = await queryOne<any>(
      `SELECT * FROM otps
       WHERE (LOWER(identifier) = LOWER($1) OR UPPER(identifier) = UPPER($2) OR user_id = $3)
         AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION'
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [sEmail, sCustomerCode, student.id]
    );

    if (!activeOtp) {
      const expiredOtp = await queryOne<any>(
        `SELECT * FROM otps
         WHERE (LOWER(identifier) = LOWER($1) OR UPPER(identifier) = UPPER($2) OR user_id = $3)
           AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION'
           AND used_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [sEmail, sCustomerCode, student.id]
      );

      if (expiredOtp) {
        throw new AppError('The verification code has expired. Please click Resend OTP to get a new code.', 400);
      }

      throw new AppError('Invalid or expired verification code. Please request a new code.', 400);
    }

    if (activeOtp.attempt_count >= activeOtp.max_attempts) {
      await query('UPDATE otps SET used_at = NOW() WHERE id = $1', [activeOtp.id]);
      throw new AppError('Maximum verification attempts exceeded. Please click Resend OTP for a new code.', 400);
    }

    const isMatch = await bcrypt.compare(cleanOtp, activeOtp.otp_hash);
    if (!isMatch) {
      const nextCount = Number(activeOtp.attempt_count || 0) + 1;
      if (nextCount >= activeOtp.max_attempts) {
        await query('UPDATE otps SET attempt_count = $1, used_at = NOW() WHERE id = $2', [nextCount, activeOtp.id]);
        throw new AppError('Maximum verification attempts exceeded. Please click Resend OTP for a new code.', 400);
      } else {
        await query('UPDATE otps SET attempt_count = $1 WHERE id = $2', [nextCount, activeOtp.id]);
        throw new AppError(`Invalid 4-digit activation code. (${activeOtp.max_attempts - nextCount} attempts remaining)`, 400);
      }
    }

    // Mark OTP as used
    await query('UPDATE otps SET used_at = NOW() WHERE id = $1', [activeOtp.id]);

    // Issue activation session token (32 bytes hex)
    const crypto = require('crypto');
    const activationToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(activationToken).digest('hex');

    await query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes')`,
      [crypto.randomUUID(), student.id, tokenHash]
    );

    return {
      success: true,
      activationToken,
      studentId: student.customer_code || student.student_id,
      fullName: student.full_name,
      email: student.email,
      message: 'Verification successful! Please create your new password.',
    };
  }

  async resendStudentActivationOtp(identifier: string) {
    return this.sendStudentActivationOtp(identifier);
  }

  async activateStudentAccount(activationToken: string, newPassword: string, confirmPassword?: string) {
    if (!activationToken || typeof activationToken !== 'string') {
      throw new AppError('Activation token is required.', 400);
    }
    if (!newPassword || newPassword.length < 8) {
      throw new AppError('Password must be at least 8 characters long.', 400);
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      throw new AppError('Password and confirm password do not match.', 400);
    }
    if (!/[A-Z]/.test(newPassword)) {
      throw new AppError('Password must contain at least one uppercase letter.', 400);
    }
    if (!/[a-z]/.test(newPassword)) {
      throw new AppError('Password must contain at least one lowercase letter.', 400);
    }
    if (!/[0-9]/.test(newPassword)) {
      throw new AppError('Password must contain at least one number.', 400);
    }

    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(activationToken.trim()).digest('hex');

    const tokenRecord = await queryOne<any>(
      `SELECT * FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );

    if (!tokenRecord) {
      throw new AppError('Activation session has expired or is invalid. Please verify your OTP code again.', 400);
    }

    const studentId = tokenRecord.user_id;
    const student = await queryOne<any>('SELECT * FROM students WHERE id = $1', [studentId]);
    if (!student) {
      throw new AppError('Student account not found.', 404);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const orgId = student.organization_id;
    const sBranchId = student.hostel_id || student.branch_id || '';
    const sEmail = (student.email || '').trim().toLowerCase();
    const sCustomerCode = (student.customer_code || '').trim();
    const sStudentId = (student.student_id || student.customer_code || '').trim();
    const sFullName = student.full_name || 'Student';
    const sPhone = student.phone || '';

    let finalUser: any = null;

    await transaction(async (client) => {
      // Find existing user if any
      let existingUser: any = null;
      if (student.user_id) {
        const res = await client.query('SELECT * FROM users WHERE id = $1', [student.user_id]);
        existingUser = res.rows[0];
      }
      if (!existingUser) {
        const res = await client.query(
          'SELECT * FROM users WHERE organization_id = $1 AND (LOWER(email) = LOWER($2) OR UPPER(customer_code) = UPPER($3) OR student_id = $4)',
          [orgId, sEmail, sCustomerCode, student.id]
        );
        existingUser = res.rows[0];
      }

      if (existingUser) {
        const updatedUser = await client.query(
          `UPDATE users
           SET password_hash = $1,
               must_change_password = false,
               status = 'ACTIVE',
               role = 'STUDENT',
               organization_id = $2,
               branch_id = $3,
               student_id = $4,
               customer_code = $5,
               name = $6,
               email = $7,
               phone = $8,
               updated_at = NOW()
           WHERE id = $9
           RETURNING *`,
          [passwordHash, orgId, sBranchId, student.id, sCustomerCode, sFullName, sEmail, sPhone, existingUser.id]
        );
        finalUser = updatedUser.rows[0];
      } else {
        const newUserId = crypto.randomUUID();
        const targetUserId = sCustomerCode || sStudentId || ('STU-' + student.id.slice(0, 8));

        const newUserRes = await client.query(
          `INSERT INTO users (
            id, user_id, organization_id, branch_id, student_id, name, email,
            password_hash, role, phone, customer_code, must_change_password, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'STUDENT', $9, $10, false, 'ACTIVE')
          RETURNING *`,
          [newUserId, targetUserId, orgId, sBranchId, student.id, sFullName, sEmail, passwordHash, sPhone, sCustomerCode]
        );
        finalUser = newUserRes.rows[0];
      }

      // Update student table state to ACTIVATED and password_set = true
      await client.query(
        `UPDATE students
         SET portal_access = true,
             portal_access_approved = true,
             portal_status = 'ACTIVE',
             activation_status = 'ACTIVATED',
             password_set = true,
             user_id = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [finalUser.id, student.id]
      );

      // Mark token and activation OTPs as used
      await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [tokenRecord.id]);
      await client.query(
        "UPDATE otps SET used_at = NOW() WHERE (LOWER(identifier) = LOWER($1) OR UPPER(identifier) = UPPER($2) OR user_id = $3) AND otp_purpose = 'STUDENT_ACCOUNT_ACTIVATION' AND used_at IS NULL",
        [sEmail, sCustomerCode, student.id]
      );
    });

    // Create session JWT tokens for automatic login after activation
    const authResult = await this.generateTokens(finalUser);

    return {
      success: true,
      message: 'Student account activated successfully! Welcome to IHMS Student Portal.',
      token: authResult.token,
      refreshToken: authResult.refreshToken,
      user: authResult.user,
    };
  }

  // Legacy/Fallback handler for backward compatibility
  async forgotPassword(identifier: string, newPassword?: string) {
    if (newPassword) {
      const user = await this.findUserForPasswordReset(identifier);
      if (!user) throw new AppError('No account found matching this Student ID or Email.', 404);
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [passwordHash, user.id]);
      return { success: true, message: 'Password has been reset successfully. Please log in.' };
    }
    return this.requestPasswordResetOtp(identifier);
  }
}
export const authService = new AuthService();
