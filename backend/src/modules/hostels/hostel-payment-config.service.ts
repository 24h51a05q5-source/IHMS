import { query, queryOne } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';

export type PaymentConfigStatus =
  | 'NOT_CONFIGURED'
  | 'NOT_VERIFIED'
  | 'VERIFICATION_IN_PROGRESS'
  | 'VERIFIED'
  | 'OWNER_CONFIRMED'
  | 'VERIFICATION_FAILED'
  | 'ACTIVE';

export interface IHostelPaymentConfigInput {
  method?: 'UPI' | 'BANK';
  upiConfig?: {
    vpaAddress?: string;
    displayName?: string;
  };
  bankConfig?: {
    beneficiaryName?: string;
    accountNumber?: string;
    confirmAccountNumber?: string;
    ifscCode?: string;
    bankName?: string;
  };
  // Direct/flat fields support
  vpaAddress?: string;
  displayName?: string;
  beneficiaryName?: string;
  accountNumber?: string;
  confirmAccountNumber?: string;
  ifscCode?: string;
  bankName?: string;
}

export interface IHostelPaymentConfigResponse {
  id: string;
  organizationId: string;
  hostelId: string;
  ownerId?: string;
  upi_vpa?: string;
  upi_display_name?: string;
  bank_beneficiary_name?: string;
  bank_account_number?: string;
  bank_ifsc_code?: string;
  bank_name?: string;
  verified_beneficiary_name?: string;
  pending_beneficiary_name?: string;
  pending_bank_name?: string;
  upiConfig: {
    vpaAddress: string;
    displayName: string;
    status: PaymentConfigStatus;
    pendingVpaAddress?: string;
    pendingDisplayName?: string;
  };
  bankConfig: {
    beneficiaryName: string;
    accountNumber: string;
    maskedAccountNumber: string;
    ifscCode: string;
    bankName: string;
    status: PaymentConfigStatus;
    pendingBeneficiaryName?: string;
    pendingAccountNumber?: string;
    pendingMaskedAccountNumber?: string;
    pendingIfscCode?: string;
    pendingBankName?: string;
  };
  verification: {
    isAutoVerificationAvailable: boolean;
    verifiedBeneficiaryName?: string;
    rateLimitCount: number;
    lastAttemptAt?: string;
  };
  auditLog: Array<{
    timestamp: string;
    userId: string;
    event: string;
    details: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export class HostelPaymentConfigService {
  /**
   * Helper to mask account number safely (e.g. ••••••••1234)
   */
  public static maskAccountNumber(accountNumber: string): string {
    if (!accountNumber) return '';
    const clean = accountNumber.trim();
    if (clean.length <= 4) return clean;
    const last4 = clean.slice(-4);
    return '•'.repeat(Math.max(4, clean.length - 4)) + last4;
  }

  /**
   * Validate UPI format (must contain @ and valid characters)
   */
  public static validateVpa(vpa: string): boolean {
    if (!vpa || typeof vpa !== 'string') return false;
    const clean = vpa.trim();
    return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(clean);
  }

  /**
   * Validate Indian Financial System Code (IFSC) format
   */
  public static validateIfsc(ifsc: string): boolean {
    if (!ifsc || typeof ifsc !== 'string') return false;
    const clean = ifsc.trim().toUpperCase();
    return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(clean);
  }

  /**
   * Helper to parse audit logs safely
   */
  private parseAuditLog(raw: any): Array<any> {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  /**
   * Check rate limiting (Max 5 verification requests per 15 minutes)
   */
  private checkRateLimit(config: any): void {
    if (!config) return;
    const count = Number(config.verification_rate_limit_count || 0);
    const lastAt = config.verification_last_attempt_at ? new Date(config.verification_last_attempt_at).getTime() : 0;
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;

    if (now - lastAt < fifteenMinutes && count >= 5) {
      throw new AppError('Rate limit exceeded. Maximum 5 account verification attempts allowed per 15 minutes. Please wait before retrying.', 429);
    }
  }

  /**
   * Get payment configuration for a specific hostel branch
   */
  async getByHostelId(orgId: string, hostelId: string): Promise<IHostelPaymentConfigResponse | null> {
    let effectiveOrgId = orgId;
    let hostelName = '';
    if (hostelId) {
      const hostel = await queryOne<any>(
        'SELECT organization_id, name, hostel_name FROM hostels WHERE id = $1',
        [hostelId]
      );
      if (hostel) {
        if (hostel.organization_id) effectiveOrgId = hostel.organization_id;
        hostelName = hostel.hostel_name || hostel.name || '';
      }
    }

    let config = await queryOne<any>(
      `SELECT * FROM hostel_payment_configs WHERE organization_id = $1 AND hostel_id = $2`,
      [effectiveOrgId, hostelId]
    );

    // Fallback: if not configured for this specific branch, check for any active payment config in the organization
    if (!config && effectiveOrgId) {
      config = await queryOne<any>(
        `SELECT * FROM hostel_payment_configs
         WHERE organization_id = $1
         ORDER BY (CASE WHEN upi_status = 'ACTIVE' OR bank_status = 'ACTIVE' THEN 0 ELSE 1 END), created_at ASC
         LIMIT 1`,
        [effectiveOrgId]
      );
    }

    // Auto-create default active configuration if none exists yet for a valid hostel
    if (!config && effectiveOrgId && hostelId && hostelName) {
      const cleanCode = hostelName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const defaultUpi = `${cleanCode || 'hostel'}@upi`;
      const newId = require('crypto').randomUUID();
      try {
        config = await queryOne<any>(
          `INSERT INTO hostel_payment_configs (
            id, organization_id, hostel_id,
            upi_vpa, upi_display_name, upi_status,
            bank_beneficiary_name, bank_status
          ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $5, 'NOT_CONFIGURED')
          ON CONFLICT (organization_id, hostel_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
          RETURNING *`,
          [newId, effectiveOrgId, hostelId, defaultUpi, hostelName]
        );
      } catch {
        config = await queryOne<any>(
          `SELECT * FROM hostel_payment_configs WHERE organization_id = $1 AND hostel_id = $2`,
          [effectiveOrgId, hostelId]
        );
      }
    }

    if (!config) return null;

    const isAutoAvailable = Boolean(process.env.PAYMENT_VERIFICATION_API_KEY);

    const effectiveVpa = config.upi_vpa || config.pending_upi_vpa || '';
    const effectiveUpiName = config.upi_display_name || config.pending_upi_display_name || '';
    const effectiveBeneficiary = config.bank_beneficiary_name || config.pending_bank_beneficiary_name || '';
    const effectiveAccount = config.bank_account_number || config.pending_bank_account_number || '';
    const effectiveIfsc = config.bank_ifsc_code || config.pending_bank_ifsc_code || '';
    const effectiveBankName = config.bank_name || config.pending_bank_name || '';

    return {
      id: config.id,
      organizationId: config.organization_id,
      hostelId: config.hostel_id,
      ownerId: config.owner_id,
      upi_vpa: effectiveVpa,
      upi_display_name: effectiveUpiName,
      bank_beneficiary_name: effectiveBeneficiary,
      bank_account_number: effectiveAccount,
      bank_ifsc_code: effectiveIfsc,
      bank_name: effectiveBankName,
      verified_beneficiary_name: config.verified_beneficiary_name || '',
      pending_beneficiary_name: config.pending_bank_beneficiary_name || '',
      pending_bank_name: config.pending_bank_name || '',
      upiConfig: {
        vpaAddress: effectiveVpa,
        displayName: effectiveUpiName,
        status: (config.upi_status as PaymentConfigStatus) || (effectiveVpa ? 'ACTIVE' : 'NOT_CONFIGURED'),
        pendingVpaAddress: config.pending_upi_vpa || undefined,
        pendingDisplayName: config.pending_upi_display_name || undefined,
      },
      bankConfig: {
        beneficiaryName: effectiveBeneficiary,
        accountNumber: effectiveAccount,
        maskedAccountNumber: HostelPaymentConfigService.maskAccountNumber(effectiveAccount),
        ifscCode: effectiveIfsc,
        bankName: effectiveBankName,
        status: (config.bank_status as PaymentConfigStatus) || (effectiveAccount ? 'ACTIVE' : 'NOT_CONFIGURED'),
        pendingBeneficiaryName: config.pending_bank_beneficiary_name || undefined,
        pendingAccountNumber: config.pending_bank_account_number || undefined,
        pendingMaskedAccountNumber: HostelPaymentConfigService.maskAccountNumber(config.pending_bank_account_number || ''),
        pendingIfscCode: config.pending_bank_ifsc_code || undefined,
        pendingBankName: config.pending_bank_name || undefined,
      },
      verification: {
        isAutoVerificationAvailable: isAutoAvailable,
        verifiedBeneficiaryName: config.verified_beneficiary_name || undefined,
        rateLimitCount: Number(config.verification_rate_limit_count || 0),
        lastAttemptAt: config.verification_last_attempt_at || undefined,
      },
      auditLog: this.parseAuditLog(config.audit_log),
      createdAt: config.created_at,
      updatedAt: config.updated_at,
    };
  }

  /**
   * Create or update hostel payment configuration (Legacy or Direct Save)
   */
  async upsertConfig(
    orgId: string,
    hostelId: string,
    ownerId: string,
    input: IHostelPaymentConfigInput
  ): Promise<IHostelPaymentConfigResponse> {
    const hasUpi = Boolean(input.vpaAddress || input.upiConfig?.vpaAddress || (input as any).upiVpa || (input as any).upi_vpa);
    const hasBank = Boolean(input.accountNumber || input.bankConfig?.accountNumber || (input as any).bankAccountNumber);

    if (hasUpi && hasBank) {
      await this.initiateVerification(orgId, hostelId, ownerId, 'UPI', input, true);
      await this.confirmAndActivate(orgId, hostelId, ownerId, 'UPI');
      await this.initiateVerification(orgId, hostelId, ownerId, 'BANK', input, true);
      return this.confirmAndActivate(orgId, hostelId, ownerId, 'BANK');
    }

    if ((input as any).clearBank || input.bankConfig === null || ((input as any).bankConfig && (input as any).bankConfig.accountNumber === '')) {
      await query(
        `UPDATE hostel_payment_configs
         SET bank_status = 'NOT_CONFIGURED', bank_account_number = NULL, bank_ifsc_code = NULL,
             bank_beneficiary_name = NULL, bank_name = NULL,
             pending_bank_account_number = NULL, pending_bank_ifsc_code = NULL,
             pending_bank_beneficiary_name = NULL, pending_bank_name = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE hostel_id = $1 AND organization_id = $2`,
        [hostelId, orgId]
      );
    }

    const method = input.method || (hasUpi ? 'UPI' : 'BANK');
    await this.initiateVerification(orgId, hostelId, ownerId, method, input, true);
    return this.confirmAndActivate(orgId, hostelId, ownerId, method);
  }

  /**
   * STEP 2 & 3: Initiate Owner Self-Verification
   */
  async initiateVerification(
    orgId: string,
    hostelId: string,
    ownerId: string,
    method: 'UPI' | 'BANK',
    input: IHostelPaymentConfigInput,
    skipRateLimit: boolean = false
  ): Promise<IHostelPaymentConfigResponse> {
    const hostel = await queryOne<any>(
      `SELECT id, hostel_name, name FROM hostels WHERE id = $1 AND organization_id = $2`,
      [hostelId, orgId]
    );
    if (!hostel) {
      throw new AppError('Hostel branch not found in your organization.', 404);
    }

    const existingBranch = await queryOne<any>(
      `SELECT * FROM hostel_payment_configs WHERE organization_id = $1 AND hostel_id = $2`,
      [orgId, hostelId]
    );

    // Fallback: if not configured for this specific branch, check for any existing config in the organization to pre-populate
    let orgFallback = null;
    if (!existingBranch && orgId) {
      orgFallback = await queryOne<any>(
        `SELECT * FROM hostel_payment_configs
         WHERE organization_id = $1
         ORDER BY (CASE WHEN upi_status = 'ACTIVE' OR bank_status = 'ACTIVE' THEN 0 ELSE 1 END), created_at ASC
         LIMIT 1`,
        [orgId]
      );
    }

    const existing = existingBranch || orgFallback;

    // Validate format FIRST so malformed inputs immediately return HTTP 400 Bad Request
    let upiStatus: PaymentConfigStatus = existingBranch?.upi_status || 'NOT_CONFIGURED';
    let bankStatus: PaymentConfigStatus = existingBranch?.bank_status || 'NOT_CONFIGURED';
    let verifiedBeneficiary: string | undefined = undefined;

    let pendingUpiVpa = existingBranch?.pending_upi_vpa || null;
    let pendingUpiName = existingBranch?.pending_upi_display_name || null;
    let pendingBeneficiaryName = existingBranch?.pending_bank_beneficiary_name || null;
    let pendingAccountNumber = existingBranch?.pending_bank_account_number || null;
    let pendingIfscCode = existingBranch?.pending_bank_ifsc_code || null;
    let pendingBankName = existingBranch?.pending_bank_name || null;

    const isAutoAvailable = Boolean(process.env.PAYMENT_VERIFICATION_API_KEY);

    if (method === 'UPI') {
      const vpa = (
        input?.upiConfig?.vpaAddress ||
        input?.vpaAddress ||
        (input as any)?.upiVpa ||
        (input as any)?.upi_vpa ||
        (input as any)?.vpa ||
        (input as any)?.upiId ||
        (input as any)?.upi_id ||
        existing?.pending_upi_vpa ||
        existing?.upi_vpa ||
        ''
      ).trim();
      const name = (
        input?.upiConfig?.displayName ||
        input?.displayName ||
        (input as any)?.upiDisplayName ||
        (input as any)?.upi_display_name ||
        existing?.pending_upi_display_name ||
        existing?.upi_display_name ||
        ''
      ).trim() || hostel.hostel_name || hostel.name || '';

      if (!vpa) {
        throw new AppError('UPI ID / VPA is required.', 400);
      }
      if (!HostelPaymentConfigService.validateVpa(vpa)) {
        throw new AppError(`Invalid UPI ID format "${vpa}". Expected format: hostelname@upi`, 400);
      }

      pendingUpiVpa = vpa;
      pendingUpiName = name;

      if (isAutoAvailable) {
        upiStatus = 'VERIFIED';
        verifiedBeneficiary = name;
      } else {
        upiStatus = 'OWNER_CONFIRMED';
        verifiedBeneficiary = name;
      }
    } else {
      const beneficiary = (
        input?.bankConfig?.beneficiaryName ||
        input?.beneficiaryName ||
        (input as any)?.bankBeneficiaryName ||
        existing?.pending_bank_beneficiary_name ||
        existing?.bank_beneficiary_name ||
        ''
      ).trim();
      const acc = (
        input?.bankConfig?.accountNumber ||
        input?.accountNumber ||
        (input as any)?.bankAccountNumber ||
        existing?.pending_bank_account_number ||
        existing?.bank_account_number ||
        ''
      ).trim();
      const confirmAcc = (
        input?.bankConfig?.confirmAccountNumber ||
        input?.confirmAccountNumber ||
        (input as any)?.confirmBankAccountNumber ||
        acc
      ).trim();
      const ifsc = (
        input?.bankConfig?.ifscCode ||
        input?.ifscCode ||
        (input as any)?.bankIfscCode ||
        existing?.pending_bank_ifsc_code ||
        existing?.bank_ifsc_code ||
        ''
      ).trim().toUpperCase();
      const bank = (
        input?.bankConfig?.bankName ||
        input?.bankName ||
        (input as any)?.bankName ||
        existing?.pending_bank_name ||
        existing?.bank_name ||
        ''
      ).trim();

      if (!beneficiary) throw new AppError('Beneficiary account holder name is required.', 400);
      if (!acc) throw new AppError('Bank account number is required.', 400);
      if (confirmAcc && acc !== confirmAcc) throw new AppError('Account Number and Confirm Account Number do not match.', 400);
      if (!ifsc) throw new AppError('Bank IFSC Code is required.', 400);
      if (!HostelPaymentConfigService.validateIfsc(ifsc)) {
        throw new AppError(`Invalid IFSC Code "${ifsc}". Expected 11 character format (e.g. SBIN0001234).`, 400);
      }
      if (acc.length < 8 || acc.length > 20 || !/^\d+$/.test(acc)) {
        throw new AppError('Bank account number must be between 8 and 20 numeric digits.', 400);
      }

      pendingBeneficiaryName = beneficiary;
      pendingAccountNumber = acc;
      pendingIfscCode = ifsc;
      pendingBankName = bank;

      if (isAutoAvailable) {
        bankStatus = 'VERIFIED';
        verifiedBeneficiary = beneficiary;
      } else {
        bankStatus = 'OWNER_CONFIRMED';
        verifiedBeneficiary = beneficiary;
      }
    }

    if (!skipRateLimit) {
      this.checkRateLimit(existingBranch || existing);
    }

    const nowIso = new Date().toISOString();
    const lastAt = existing?.verification_last_attempt_at ? new Date(existing.verification_last_attempt_at).getTime() : 0;
    const fifteenMinutes = 15 * 60 * 1000;
    let newCount = skipRateLimit ? Number(existing?.verification_rate_limit_count || 0) : ((existing?.verification_rate_limit_count || 0) + 1);
    if (!skipRateLimit && Date.now() - lastAt > fifteenMinutes) {
      newCount = 1;
    }

    const audit = this.parseAuditLog(existing?.audit_log);
    audit.push({
      timestamp: nowIso,
      userId: ownerId,
      event: `VERIFICATION_INITIATED_${method}`,
      details: method === 'UPI' ? `Target VPA: ${pendingUpiVpa}` : `Target Account: ${HostelPaymentConfigService.maskAccountNumber(pendingAccountNumber || '')}`,
    });

    let configId = existingBranch?.id;
    if (!existingBranch) {
      configId = require('crypto').randomUUID();
      await query(
        `INSERT INTO hostel_payment_configs (
          id, organization_id, hostel_id, owner_id,
          upi_status, bank_status,
          pending_upi_vpa, pending_upi_display_name,
          pending_bank_beneficiary_name, pending_bank_account_number, pending_bank_ifsc_code, pending_bank_name,
          verified_beneficiary_name, verification_rate_limit_count, verification_last_attempt_at, audit_log
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP, $15)`,
        [
          configId,
          orgId,
          hostelId,
          ownerId,
          upiStatus,
          bankStatus,
          pendingUpiVpa,
          pendingUpiName,
          pendingBeneficiaryName,
          pendingAccountNumber,
          pendingIfscCode,
          pendingBankName,
          verifiedBeneficiary,
          newCount,
          JSON.stringify(audit),
        ]
      );
    } else {
      await query(
        `UPDATE hostel_payment_configs
         SET upi_status = $1, bank_status = $2,
             pending_upi_vpa = $3, pending_upi_display_name = $4,
             pending_bank_beneficiary_name = $5, pending_bank_account_number = $6,
             pending_bank_ifsc_code = $7, pending_bank_name = $8,
             verified_beneficiary_name = $9, verification_rate_limit_count = $10,
             verification_last_attempt_at = CURRENT_TIMESTAMP, audit_log = $11,
             owner_id = $12, updated_at = CURRENT_TIMESTAMP
         WHERE id = $13 AND organization_id = $14`,
        [
          upiStatus,
          bankStatus,
          pendingUpiVpa,
          pendingUpiName,
          pendingBeneficiaryName,
          pendingAccountNumber,
          pendingIfscCode,
          pendingBankName,
          verifiedBeneficiary,
          newCount,
          JSON.stringify(audit),
          ownerId,
          configId,
          orgId,
        ]
      );
    }

    const updated = await this.getByHostelId(orgId, hostelId);
    if (!updated) throw new AppError('Failed to record payment verification.', 500);
    return updated;
  }

  /**
   * STEP 4 & 5: Confirm and Activate Payment Configuration
   */
  async confirmAndActivate(
    orgId: string,
    hostelId: string,
    ownerId: string,
    method: 'UPI' | 'BANK'
  ): Promise<IHostelPaymentConfigResponse> {
    let existing = await queryOne<any>(
      `SELECT * FROM hostel_payment_configs WHERE organization_id = $1 AND hostel_id = $2`,
      [orgId, hostelId]
    );

    if (!existing && orgId) {
      existing = await queryOne<any>(
        `SELECT * FROM hostel_payment_configs
         WHERE organization_id = $1
         ORDER BY (CASE WHEN upi_status = 'ACTIVE' OR bank_status = 'ACTIVE' THEN 0 ELSE 1 END), created_at ASC
         LIMIT 1`,
        [orgId]
      );
    }

    if (!existing) {
      throw new AppError('Payment configuration not found for activation.', 404);
    }

    const nowIso = new Date().toISOString();
    const audit = this.parseAuditLog(existing.audit_log);

    if (method === 'UPI') {
      const newVpa = existing.pending_upi_vpa || existing.upi_vpa;
      const newName = existing.pending_upi_display_name || existing.upi_display_name;

      if (!newVpa) {
        throw new AppError('No verified pending UPI configuration to activate.', 400);
      }

      audit.push({
        timestamp: nowIso,
        userId: ownerId,
        event: 'ACTIVATION_CONFIRMED_UPI',
        details: `Activated UPI: ${newVpa}`,
      });

      await query(
        `UPDATE hostel_payment_configs
         SET upi_vpa = $1, upi_display_name = $2, upi_status = 'ACTIVE',
             pending_upi_vpa = NULL, pending_upi_display_name = NULL,
             verification_rate_limit_count = 0,
             audit_log = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND organization_id = $5`,
        [newVpa, newName, JSON.stringify(audit), existing.id, orgId]
      );
    } else {
      const newBeneficiary = existing.pending_bank_beneficiary_name || existing.bank_beneficiary_name;
      const newAcc = existing.pending_bank_account_number || existing.bank_account_number;
      const newIfsc = existing.pending_bank_ifsc_code || existing.bank_ifsc_code;
      const newBank = existing.pending_bank_name || existing.bank_name;

      if (!newAcc || !newIfsc) {
        throw new AppError('No verified pending Bank configuration to activate.', 400);
      }

      audit.push({
        timestamp: nowIso,
        userId: ownerId,
        event: 'ACTIVATION_CONFIRMED_BANK',
        details: `Activated Bank Account: ${HostelPaymentConfigService.maskAccountNumber(newAcc)} (IFSC: ${newIfsc})`,
      });

      await query(
        `UPDATE hostel_payment_configs
         SET bank_beneficiary_name = $1, bank_account_number = $2,
             bank_ifsc_code = $3, bank_name = $4, bank_status = 'ACTIVE',
             pending_bank_beneficiary_name = NULL, pending_bank_account_number = NULL,
             pending_bank_ifsc_code = NULL, pending_bank_name = NULL,
             verification_rate_limit_count = 0,
             audit_log = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6 AND organization_id = $7`,
        [newBeneficiary, newAcc, newIfsc, newBank, JSON.stringify(audit), existing.id, orgId]
      );
    }

    const updated = await this.getByHostelId(orgId, hostelId);
    if (!updated) throw new AppError('Failed to activate payment configuration.', 500);
    return updated;
  }

  /**
   * STEP 6: Cancel Pending Replacement Configuration
   */
  async cancelPendingChanges(
    orgId: string,
    hostelId: string,
    ownerId: string,
    method: 'UPI' | 'BANK'
  ): Promise<IHostelPaymentConfigResponse> {
    let existing = await queryOne<any>(
      `SELECT * FROM hostel_payment_configs WHERE organization_id = $1 AND hostel_id = $2`,
      [orgId, hostelId]
    );

    if (!existing && orgId) {
      existing = await queryOne<any>(
        `SELECT * FROM hostel_payment_configs
         WHERE organization_id = $1
         ORDER BY (CASE WHEN upi_status = 'ACTIVE' OR bank_status = 'ACTIVE' THEN 0 ELSE 1 END), created_at ASC
         LIMIT 1`,
        [orgId]
      );
    }

    if (!existing) {
      throw new AppError('Payment configuration not found.', 404);
    }

    const nowIso = new Date().toISOString();
    const audit = this.parseAuditLog(existing.audit_log);

    if (method === 'UPI') {
      const revertStatus = existing.upi_vpa ? 'ACTIVE' : 'NOT_CONFIGURED';
      audit.push({
        timestamp: nowIso,
        userId: ownerId,
        event: 'PENDING_CANCELLED_UPI',
        details: `Discarded pending UPI edit`,
      });

      await query(
        `UPDATE hostel_payment_configs
         SET upi_status = $1, pending_upi_vpa = NULL, pending_upi_display_name = NULL,
             audit_log = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND organization_id = $4`,
        [revertStatus, JSON.stringify(audit), existing.id, orgId]
      );
    } else {
      const revertStatus = existing.bank_account_number ? 'ACTIVE' : 'NOT_CONFIGURED';
      audit.push({
        timestamp: nowIso,
        userId: ownerId,
        event: 'PENDING_CANCELLED_BANK',
        details: `Discarded pending Bank edit`,
      });

      await query(
        `UPDATE hostel_payment_configs
         SET bank_status = $1, pending_bank_beneficiary_name = NULL,
             pending_bank_account_number = NULL, pending_bank_ifsc_code = NULL,
             pending_bank_name = NULL, audit_log = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND organization_id = $4`,
        [revertStatus, JSON.stringify(audit), existing.id, orgId]
      );
    }

    const updated = await this.getByHostelId(orgId, hostelId);
    if (!updated) throw new AppError('Failed to cancel pending changes.', 500);
    return updated;
  }
}

export const hostelPaymentConfigService = new HostelPaymentConfigService();
