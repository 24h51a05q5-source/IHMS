import crypto from 'crypto';
import { query, queryOne } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import {
  CURRENT_TERMS_VERSION,
  TERMS_EFFECTIVE_DATE,
  TERMS_LAST_UPDATED,
  TERMS_SECTIONS,
  TermsSection,
} from './terms.constants';

export class TermsService {
  getTerms(role?: string) {
    let sections: TermsSection[] = [...TERMS_SECTIONS];
    const normalizedRole = (role || '').toUpperCase();

    if (normalizedRole === 'STUDENT') {
      sections = sections.filter(
        (s) => s.applicableTo === 'ALL' || s.applicableTo === 'STUDENT'
      );
    } else if (
      normalizedRole === 'OWNER' ||
      normalizedRole === 'ORGANIZATION_OWNER' ||
      normalizedRole === 'SUPER_ADMIN' ||
      normalizedRole === 'PLATFORM_SUPER_ADMIN'
    ) {
      sections = sections.filter(
        (s) => s.applicableTo === 'ALL' || s.applicableTo === 'OWNER'
      );
    }

    // Sort by order ascending
    sections.sort((a, b) => a.order - b.order);

    return {
      version: CURRENT_TERMS_VERSION,
      effectiveDate: TERMS_EFFECTIVE_DATE,
      lastUpdated: TERMS_LAST_UPDATED,
      currentVersion: CURRENT_TERMS_VERSION,
      totalSections: sections.length,
      sections,
    };
  }

  async checkUserTermsStatus(userId: string) {
    const user = await queryOne<any>(
      'SELECT id, role, terms_accepted, accepted_terms_version, terms_accepted_at FROM users WHERE id = $1',
      [userId]
    );

    if (!user) {
      throw new AppError('User account not found.', 404);
    }

    const isAccepted = Boolean(
      user.terms_accepted && user.accepted_terms_version === CURRENT_TERMS_VERSION
    );

    return {
      userId: user.id,
      role: user.role,
      termsAccepted: isAccepted,
      acceptedTermsVersion: user.accepted_terms_version || null,
      termsAcceptedAt: user.terms_accepted_at || null,
      currentVersion: CURRENT_TERMS_VERSION,
      requiresReacceptance: !isAccepted,
    };
  }

  async acceptTerms(
    userId: string,
    role: string,
    termsVersion: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    if (!termsVersion || typeof termsVersion !== 'string') {
      throw new AppError('Terms version is required for acceptance.', 400);
    }

    if (termsVersion.trim() !== CURRENT_TERMS_VERSION) {
      throw new AppError(
        `Invalid Terms & Conditions version submitted (${termsVersion}). The current platform version is ${CURRENT_TERMS_VERSION}. Please refresh and review the updated terms.`,
        400,
        { code: 'INVALID_TERMS_VERSION', currentVersion: CURRENT_TERMS_VERSION }
      );
    }

    const user = await queryOne<any>('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) {
      throw new AppError('User session invalid or user account not found.', 404);
    }

    const acceptanceId = crypto.randomUUID();
    const effectiveRole = role || user.role;
    const clientIp = (ipAddress || '127.0.0.1').replace('::ffff:', '');
    const clientAgent = (userAgent || 'Unknown Browser').slice(0, 500);

    // 1. Record immutable audit row in terms_acceptances
    await query(
      `INSERT INTO terms_acceptances (
        id, user_id, role, terms_version, ip_address, user_agent, status, accepted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'ACCEPTED', CURRENT_TIMESTAMP)`,
      [acceptanceId, userId, effectiveRole, CURRENT_TERMS_VERSION, clientIp, clientAgent]
    );

    // 2. Update user record
    await query(
      `UPDATE users
       SET terms_accepted = TRUE,
           accepted_terms_version = $1,
           terms_accepted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [CURRENT_TERMS_VERSION, userId]
    );

    // 3. Record system audit trail entry
    try {
      await query(
        `INSERT INTO audit_logs (
          id, organization_id, user_id, action, entity_type, entity_id, new_values, ip_address
        ) VALUES ($1, $2, $3, 'TERMS_ACCEPTED', 'TERMS', $4, $5, $6)`,
        [
          crypto.randomUUID(),
          user.organization_id || null,
          userId,
          acceptanceId,
          JSON.stringify({
            termsVersion: CURRENT_TERMS_VERSION,
            role: effectiveRole,
            ipAddress: clientIp,
            acceptedAt: new Date().toISOString(),
          }),
          clientIp,
        ]
      );
    } catch {
      // Audit log table might vary in test environments; continue gracefully
    }

    return {
      success: true,
      message: 'Terms & Conditions accepted successfully.',
      acceptanceId,
      acceptedVersion: CURRENT_TERMS_VERSION,
      acceptedAt: new Date().toISOString(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        termsAccepted: true,
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
      },
    };
  }
}

export const termsService = new TermsService();
