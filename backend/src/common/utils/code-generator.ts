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

export async function generateStudentId(organizationId: string): Promise<string> {
  const { queryOne } = require('../../config/database');
  const year = new Date().getFullYear();
  const prefix = `STU${year}`;
  let seq = await getNextSequence('GLOBAL', prefix);
  let candidate = `${prefix}${String(seq).padStart(4, '0')}`;
  let existing = await queryOne('SELECT id FROM students WHERE UPPER(student_id) = UPPER($1) OR UPPER(customer_code) = UPPER($1)', [candidate]);
  while (existing) {
    seq = await getNextSequence('GLOBAL', prefix);
    candidate = `${prefix}${String(seq).padStart(4, '0')}`;
    existing = await queryOne('SELECT id FROM students WHERE UPPER(student_id) = UPPER($1) OR UPPER(customer_code) = UPPER($1)', [candidate]);
  }
  return candidate;
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

export async function generateOwnerId(): Promise<string> {
  const seq = await getNextSequence('SYSTEM', 'IHMS-OWN');
  return `IHMS-OWN-${String(seq).padStart(6, '0')}`;
}

export async function generateHostelOrgId(): Promise<string> {
  const seq = await getNextSequence('SYSTEM', 'IHMS-HST');
  return `IHMS-HST-${String(seq).padStart(6, '0')}`;
}

export async function generateTicketNumber(
  organizationId: string = 'GLOBAL'
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TKT-${year}`;
  const seq = await getNextSequence(organizationId || 'GLOBAL', prefix);
  return `${prefix}-${String(seq).padStart(5, '0')}`;
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


