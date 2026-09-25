import crypto from 'crypto';
import { query, queryOne, queryRows } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { UserRole } from '../../config/constants';
import { emailService } from '../../common/utils/email.service';

export interface CreateWardenDto {
  name: string;
  email: string;
  phone?: string;
  hostelId: string;
}

export class WardenService {
  async createWarden(ownerUser: { id: string; organizationId: string }, data: CreateWardenDto) {
    const name = String(data.name || '').trim();
    const email = String(data.email || '').toLowerCase().trim();
    const phone = String(data.phone || '').trim();
    const hostelId = String(data.hostelId || '').trim();

    if (!name) throw new AppError('Warden Name is required.', 400);
    if (!email || !email.includes('@')) throw new AppError('Valid Warden Email is required.', 400);
    if (!hostelId) throw new AppError('Assigned Hostel is required.', 400);

    // Verify hostel belongs to owner's organization
    const hostel = await queryOne<any>(
      'SELECT id, name, hostel_name FROM hostels WHERE id = $1 AND organization_id = $2',
      [hostelId, ownerUser.organizationId]
    );
    if (!hostel) {
      throw new AppError('Selected hostel was not found or does not belong to your organization.', 400);
    }

    // Check existing email
    const existing = await queryOne<any>('SELECT id, role, status FROM users WHERE LOWER(email) = $1', [email]);
    if (existing) {
      throw new AppError('A user with this email address already exists in the system.', 409);
    }

    const wardenUuid = crypto.randomUUID();
    const staffCode = `WRD-${wardenUuid.slice(0, 8).toUpperCase()}`;
    const hostelName = hostel.hostel_name || hostel.name || 'Hostel';

    const result = await queryOne<any>(
      `INSERT INTO users (
        id, user_id, ihms_id, staff_code, name, email, phone, role,
        organization_id, branch_id, hostel_name, password_hash,
        status, is_active, access_given, terms_accepted, accepted_terms_version, must_change_password
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '', 'INVITED', true, false, true, '1.0', false)
      RETURNING id, user_id, name, email, phone, role, organization_id, branch_id, hostel_name, status, access_given, created_at`,
      [
        wardenUuid,
        staffCode,
        staffCode,
        staffCode,
        name,
        email,
        phone,
        UserRole.WARDEN,
        ownerUser.organizationId,
        hostelId,
        hostelName,
      ]
    );

    return {
      success: true,
      data: {
        id: result.id,
        wardenId: result.user_id,
        name: result.name,
        email: result.email,
        phone: result.phone,
        role: result.role,
        hostelId: result.branch_id,
        hostelName: result.hostel_name,
        status: result.status,
        accessGiven: Boolean(result.access_given),
        createdAt: result.created_at,
      },
      message: 'Warden account created successfully in INVITED status. Click Give Access to enable activation.',
    };
  }

  async getWardens(ownerUser: { organizationId: string }) {
    const wardens = await queryRows<any>(
      `SELECT u.id, u.user_id as "wardenId", u.name, u.email, u.phone, u.role,
              u.organization_id as "organizationId", u.branch_id as "hostelId",
              u.hostel_name as "hostelName", u.status, u.access_given as "accessGiven",
              u.is_active as "isActive", u.created_at as "createdAt",
              h.name as "branchName"
       FROM users u
       LEFT JOIN hostels h ON h.id = u.branch_id
       WHERE u.role = 'WARDEN' AND u.organization_id = $1
       ORDER BY u.created_at DESC`,
      [ownerUser.organizationId]
    );

    return wardens.map((w) => ({
      ...w,
      accessGiven: Boolean(w.accessGiven),
      isActive: Boolean(w.isActive),
    }));
  }

  async giveAccess(ownerUser: { organizationId: string }, wardenId: string) {
    const warden = await queryOne<any>(
      "SELECT * FROM users WHERE id = $1 AND organization_id = $2 AND role = 'WARDEN'",
      [wardenId, ownerUser.organizationId]
    );

    if (!warden) {
      throw new AppError('Warden account not found.', 404);
    }

    if (warden.status === 'SUSPENDED') {
      throw new AppError('Cannot give access to a suspended Warden. Please reactivate the account first.', 400);
    }

    await query(
      "UPDATE users SET access_given = true, status = CASE WHEN status = 'SUSPENDED' THEN 'SUSPENDED' ELSE 'INVITED' END, is_active = true, updated_at = NOW() WHERE id = $1",
      [warden.id]
    );

    // Send Warden invitation email
    try {
      await emailService.sendNotificationEmail({
        to: warden.email,
        subject: 'Warden Account Activation — IHMS Hostel ERP',
        title: `Welcome ${warden.name}!`,
        message: `Your Warden account for ${warden.hostel_name || 'your assigned hostel'} has been authorized by your hostel owner. You can now activate your account by visiting the Warden activation page using your registered email address (${warden.email}).`,
        actionLabel: 'Activate Warden Account',
        actionUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?role=warden&email=${encodeURIComponent(warden.email)}`,
      });
    } catch (err: any) {
      console.warn(`[WardenService] Email send note for ${warden.email}: ${err.message}`);
    }

    return {
      success: true,
      message: `Access granted for Warden ${warden.name}. Activation invitation sent to ${warden.email}.`,
    };
  }

  async resendInvite(ownerUser: { organizationId: string }, wardenId: string) {
    const warden = await queryOne<any>(
      "SELECT * FROM users WHERE id = $1 AND organization_id = $2 AND role = 'WARDEN'",
      [wardenId, ownerUser.organizationId]
    );

    if (!warden) {
      throw new AppError('Warden account not found.', 404);
    }

    if (!warden.access_given) {
      throw new AppError('Access has not been given to this Warden yet. Click Give Access first.', 400);
    }

    if (warden.status === 'SUSPENDED') {
      throw new AppError('Cannot send invitation to a suspended Warden.', 400);
    }

    try {
      await emailService.sendNotificationEmail({
        to: warden.email,
        subject: 'Reminder: Warden Account Activation — IHMS Hostel ERP',
        title: `Warden Activation Reminder for ${warden.name}`,
        message: `Please complete your Warden account activation for ${warden.hostel_name || 'your assigned hostel'}. Enter your registered email address (${warden.email}) on the activation page to receive your verification code.`,
        actionLabel: 'Activate Warden Account',
        actionUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?role=warden&email=${encodeURIComponent(warden.email)}`,
      });
    } catch (err: any) {
      console.warn(`[WardenService] Resend invite note for ${warden.email}: ${err.message}`);
    }

    return {
      success: true,
      message: `Activation invitation resent to ${warden.email}.`,
    };
  }

  async suspendWarden(ownerUser: { organizationId: string }, wardenId: string) {
    const warden = await queryOne<any>(
      "SELECT * FROM users WHERE id = $1 AND organization_id = $2 AND role = 'WARDEN'",
      [wardenId, ownerUser.organizationId]
    );

    if (!warden) {
      throw new AppError('Warden account not found.', 404);
    }

    await query(
      "UPDATE users SET status = 'SUSPENDED', is_active = false, updated_at = NOW() WHERE id = $1",
      [warden.id]
    );

    return {
      success: true,
      message: `Warden ${warden.name} has been suspended. Warden login and access are now blocked.`,
    };
  }

  async reactivateWarden(ownerUser: { organizationId: string }, wardenId: string) {
    const warden = await queryOne<any>(
      "SELECT * FROM users WHERE id = $1 AND organization_id = $2 AND role = 'WARDEN'",
      [wardenId, ownerUser.organizationId]
    );

    if (!warden) {
      throw new AppError('Warden account not found.', 404);
    }

    const hasPassword = Boolean(warden.password_hash && warden.password_hash.length > 10);
    const newStatus = hasPassword ? 'ACTIVE' : 'INVITED';

    await query(
      "UPDATE users SET status = $1, is_active = true, updated_at = NOW() WHERE id = $2",
      [newStatus, warden.id]
    );

    return {
      success: true,
      message: `Warden ${warden.name} has been reactivated (Status: ${newStatus}).`,
    };
  }

  async removeWarden(ownerUser: { organizationId: string }, wardenId: string) {
    const warden = await queryOne<any>(
      "SELECT * FROM users WHERE id = $1 AND organization_id = $2 AND role = 'WARDEN'",
      [wardenId, ownerUser.organizationId]
    );

    if (!warden) {
      throw new AppError('Warden account not found.', 404);
    }

    await query('DELETE FROM users WHERE id = $1', [warden.id]);

    return {
      success: true,
      message: `Warden ${warden.name} account has been removed.`,
    };
  }
}

export const wardenService = new WardenService();
