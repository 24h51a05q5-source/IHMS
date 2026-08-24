import { query } from '../../config/database';

export interface IReceiptSequence {
  id: string;
  organizationId: string;
  year: number;
  lastSequence: number;
}

export async function getNextReceiptNumber(organizationId: string, client?: any): Promise<string> {
  const currentYear = new Date().getFullYear();
  const id = `${organizationId}-${currentYear}`;
  const runner = client ? (sql: string, params: any[]) => client.query(sql, params) : query;
  const res = await runner(
    `INSERT INTO receipt_sequences (id, organization_id, year, last_sequence)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (id)
     DO UPDATE SET last_sequence = receipt_sequences.last_sequence + 1
     RETURNING last_sequence`,
    [id, organizationId, currentYear]
  );
  const seq = String(res.rows[0]?.last_sequence || 1).padStart(6, '0');
  return `RCP-${currentYear}-${seq}`;
}
