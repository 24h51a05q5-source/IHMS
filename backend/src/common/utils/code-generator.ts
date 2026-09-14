import { query } from '../../config/database';

export async function getNextSequence(organizationId: string, prefix: string): Promise<number> {
  const id = `${organizationId}_${prefix}`;
  const res = await query(
    `INSERT INTO counters (id, organization_id, prefix, seq)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (organization_id, prefix)
     DO UPDATE SET seq = counters.seq + 1
     RETURNING seq`,
    [id, organizationId, prefix]
  );
  return Number(res.rows[0]?.seq || 1);
}

export async function generateBusinessCode(
  organizationId: string,
  prefix: string,
  padLength: number = 6,
  customPrefix?: string
): Promise<string> {
  const seq = await getNextSequence(organizationId, prefix);
  const seqStr = String(seq).padStart(padLength, '0');
  if (customPrefix) {
    return `${customPrefix}-${seqStr}`;
  }
  return `${prefix}-${seqStr}`;
}

/**
 * Formats a sequence number into a strict 10-character systematic Hostel ID:
 * Format: IHMS[Series: AA..ZZ][0001..9999]
 * Vehicle registration series rollover: AA -> AB -> ... -> AZ -> BA -> ... -> ZZ
 */
export function formatHostelCode(seq: number): string {
  const safeSeq = Math.max(1, Math.floor(seq || 1));
  const index = safeSeq - 1;
  const num = (index % 9999) + 1;
  const numStr = String(num).padStart(4, '0');
  const seriesIndex = Math.floor(index / 9999);
  const letter1 = String.fromCharCode(65 + (Math.floor(seriesIndex / 26) % 26));
  const letter2 = String.fromCharCode(65 + (seriesIndex % 26));
  return `IHMS${letter1}${letter2}${numStr}`;
}

/**
 * Parses an existing systematic Hostel Code into its integer sequence number.
 */
export function parseHostelCodeSequence(code: string): number {
  const match = (code || '').trim().match(/^IHMS([A-Z])([A-Z])(\d{4})$/i);
  if (!match) return 0;
  const l1 = match[1].toUpperCase().charCodeAt(0) - 65;
  const l2 = match[2].toUpperCase().charCodeAt(0) - 65;
  const num = parseInt(match[3], 10);
  const seriesIndex = (l1 * 26) + l2;
  return (seriesIndex * 9999) + num;
}

/**
 * Generates the next systematic Hostel ID / Owner Code (e.g. IHMSAA0001)
 */
export async function generateSystematicHostelCode(organizationId: string = 'GLOBAL'): Promise<string> {
  let currentMax = 0;
  try {
    const resHostel = await query(
      `SELECT branch_code FROM hostels WHERE branch_code LIKE 'IHMS%' ORDER BY branch_code DESC LIMIT 10`
    );
    for (const row of resHostel.rows) {
      const code = String(row.branch_code || '').trim();
      if (/^IHMS[A-Z]{2}\d{4}$/i.test(code)) {
        currentMax = Math.max(currentMax, parseHostelCodeSequence(code));
      }
    }
  } catch (e) {
    // Ignore error if table not yet migrated
  }

  try {
    const resOrg = await query(
      `SELECT org_code FROM organizations WHERE org_code LIKE 'IHMS%' ORDER BY org_code DESC LIMIT 10`
    );
    for (const row of resOrg.rows) {
      const code = String(row.org_code || '').trim();
      if (/^IHMS[A-Z]{2}\d{4}$/i.test(code)) {
        currentMax = Math.max(currentMax, parseHostelCodeSequence(code));
      }
    }
  } catch (e) {
    // Ignore error
  }

  let nextSeq = currentMax + 1;
  try {
    const counterRow = await query(
      `SELECT seq FROM counters WHERE organization_id = 'SYSTEM' AND prefix = 'IHMS_HOSTEL_MASTER'`
    );
    if (counterRow.rows.length > 0) {
      const dbSeq = Number(counterRow.rows[0].seq || 0);
      nextSeq = Math.max(nextSeq, dbSeq + 1);
      await query(
        `UPDATE counters SET seq = $1 WHERE organization_id = 'SYSTEM' AND prefix = 'IHMS_HOSTEL_MASTER'`,
        [nextSeq]
      );
    } else {
      await query(
        `INSERT INTO counters (id, organization_id, prefix, seq)
         VALUES ('SYSTEM_IHMS_HOSTEL_MASTER', 'SYSTEM', 'IHMS_HOSTEL_MASTER', $1)`,
        [nextSeq]
      );
    }
  } catch (e) {
    // fallback if counters table issue
  }

  return formatHostelCode(nextSeq);
}

export async function generateStudentId(
  organizationId: string = 'GLOBAL',
  hostelNameOrCode?: string,
  branchNameOrCode?: string
): Promise<string> {
  return generateIhmsId('S', hostelNameOrCode, branchNameOrCode, organizationId);
}

export function generateTemporaryPassword(): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghjkmnpqrstuvwxyz';
  const numbers = '23456789';
  const specials = '@#$%&*!';

  const getRandom = (chars: string) => chars[Math.floor(Math.random() * chars.length)];

  // Guarantee at least one uppercase, lowercase, number, special char
  const parts = [
    getRandom(uppercase),
    getRandom(lowercase),
    getRandom(lowercase),
    '@',
    getRandom(numbers),
    getRandom(numbers),
    getRandom(numbers),
    getRandom(numbers),
  ];

  return parts.join('');
}

export async function generateStudentCustomerCode(
  organizationId: string,
  hostelCode: string
): Promise<string> {
  return generateStudentId(organizationId);
}

export async function generateStaffCode(
  organizationId: string,
  hostelCode: string
): Promise<string> {
  const prefix = `${hostelCode}-EMP`;
  return generateBusinessCode(organizationId, prefix, 3, prefix);
}

export async function generateReceiptNumber(
  organizationId: string,
  hostelCode?: string
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `RCP-${year}`;
  const seq = await getNextSequence(organizationId, prefix);
  return `${prefix}-${String(seq).padStart(6, '0')}`;
}

export async function generateInvoiceNumber(
  organizationId: string,
  hostelCode: string
): Promise<string> {
  const prefix = `${hostelCode}-INV`;
  return generateBusinessCode(organizationId, prefix, 6, prefix);
}

export async function generateComplaintNumber(
  organizationId: string,
  hostelCode: string
): Promise<string> {
  const prefix = `${hostelCode}-CMP`;
  return generateBusinessCode(organizationId, prefix, 6, prefix);
}

export async function generateVisitorPassNumber(
  organizationId: string,
  hostelCode: string
): Promise<string> {
  const prefix = `${hostelCode}-VIS`;
  return generateBusinessCode(organizationId, prefix, 6, prefix);
}

export async function generateLeaveNumber(
  organizationId: string
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LVR-${year}`;
  return generateBusinessCode(organizationId, prefix, 6, prefix);
}

export async function generateAssetCode(
  organizationId: string,
  hostelCode: string
): Promise<string> {
  const prefix = `${hostelCode}-AST`;
  return generateBusinessCode(organizationId, prefix, 6, prefix);
}

export async function generateOwnerId(
  hostelNameOrCode?: string,
  branchNameOrCode?: string,
  organizationId: string = 'GLOBAL'
): Promise<string> {
  return generateIhmsId('H', hostelNameOrCode, branchNameOrCode, organizationId);
}

export async function generateHostelOrgId(): Promise<string> {
  const seq = await getNextSequence('SYSTEM', 'IHMS-HST');
  return `IHMS-HST-${String(seq).padStart(6, '0')}`;
}

export async function generateTicketNumber(
  organizationId: string = 'GLOBAL'
): Promise<string> {
  const prefix = 'IHMS';
  const seq = await getNextSequence('SYSTEM', prefix);
  const ticketSeq = 1023 + seq;
  return `IHMS-${ticketSeq}`;
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) {
    return `${localPart}****@${domain}`;
  }
  const visible = localPart.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(4, localPart.length - 2))}@${domain}`;
}

export function derive2LetterCode(nameOrCode?: string, defaultFallback: string = 'AA'): string {
  if (!nameOrCode || !nameOrCode.trim()) return defaultFallback.toUpperCase();
  const cleaned = nameOrCode.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, '');
  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length === 1 && words[0] === 'MAIN') return 'MN';
  if (words.length >= 2 && words[0] === 'MAIN' && (words[1] === 'BRANCH' || words[1] === 'HOSTEL')) return 'MN';

  if (words.length >= 2) {
    if (words[0].length === 2 && !['MY', 'ST', 'NO'].includes(words[0])) {
      return words[0];
    }
    const code = (words[0][0] + words[1][0]).toUpperCase();
    if (code.length === 2) return code;
  }

  const alphaOnly = cleaned.replace(/\s+/g, '');
  if (alphaOnly.length >= 2) {
    return alphaOnly.slice(0, 2);
  }
  return (alphaOnly + 'A').slice(0, 2).padEnd(2, 'A');
}

export async function generateIhmsId(
  type: 'S' | 'H' | 'R' | 'B',
  hostelNameOrCode?: string,
  branchNameOrCode?: string,
  organizationId: string = 'GLOBAL'
): Promise<string> {
  const { queryOne } = require('../../config/database');

  const hostelCode = derive2LetterCode(hostelNameOrCode, 'AA');
  const branchCode = derive2LetterCode(branchNameOrCode, 'MN');

  const seqPrefix = `IHMS_${hostelCode}_${branchCode}_${type}`;
  let seq = await getNextSequence(organizationId, seqPrefix);
  let candidate = `IHM-${hostelCode}-${branchCode}-${type}-${String(seq).padStart(4, '0')}`;

  const checkExisting = async (cand: string) => {
    if (type === 'S') {
      return queryOne(
        `SELECT id FROM students WHERE UPPER(ihms_id) = UPPER($1) UNION SELECT id FROM users WHERE UPPER(ihms_id) = UPPER($1)`,
        [cand]
      );
    } else if (type === 'H') {
      return queryOne(
        `SELECT id FROM users WHERE UPPER(ihms_id) = UPPER($1) UNION SELECT id FROM owners WHERE UPPER(ihms_id) = UPPER($1)`,
        [cand]
      );
    } else if (type === 'R') {
      return queryOne(
        `SELECT id FROM rooms WHERE UPPER(room_code) = UPPER($1)`,
        [cand]
      );
    } else if (type === 'B') {
      return queryOne(
        `SELECT id FROM beds WHERE UPPER(bed_code) = UPPER($1)`,
        [cand]
      );
    }
    return null;
  };

  let existing = await checkExisting(candidate);

  while (existing) {
    seq = await getNextSequence(organizationId, seqPrefix);
    candidate = `IHM-${hostelCode}-${branchCode}-${type}-${String(seq).padStart(4, '0')}`;
    existing = await checkExisting(candidate);
  }

  return candidate;
}


