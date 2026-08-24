import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { connectDatabase, queryRows, disconnectDatabase, isEmbeddedPostgres } from '../config/database';

export async function createDatabaseBackup(customBackupDir?: string): Promise<{ success: boolean; backupPath: string; totalTables: number; totalRecords: number }> {
  console.log('=======================================================');
  console.log('  📦 IHMS ERP — Automated Database Backup Engine');
  console.log('=======================================================');

  const pool = await connectDatabase();

  const backupDir = customBackupDir || path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const filename = `ihms-backup-${timestamp}.json`;
  const backupPath = path.join(backupDir, filename);

  const tables = [
    'organizations',
    'users',
    'owners',
    'hostels',
    'rooms',
    'beds',
    'students',
    'student_transfers',
    'room_allocations',
    'fee_structures',
    'fee_accounts',
    'fee_demands',
    'fee_installments',
    'payments',
    'payment_gateway_configs',
    'payment_webhook_events',
    'fee_ledgers',
    'receipts',
    'receipt_sequences',
    'expenses',
    'vouchers',
    'complaints',
    'announcements',
    'announcement_reads',
    'notifications',
    'visitors',
    'attendances',
    'leave_requests',
    'mess_menus',
    'meal_attendances',
    'assets',
    'support_tickets',
    'audit_logs',
    'otps',
    'password_reset_tokens',
    'counters'
  ];

  const backupData: {
    metadata: {
      system: string;
      version: string;
      createdAt: string;
      engine: string;
      totalTables: number;
      totalRecords: number;
    };
    tables: Record<string, any[]>;
  } = {
    metadata: {
      system: 'Integrated Hostel Management System (IHMS) ERP',
      version: '1.0.0',
      createdAt: now.toISOString(),
      engine: isEmbeddedPostgres() ? 'Embedded-PostgreSQL' : 'PostgreSQL-Relational',
      totalTables: 0,
      totalRecords: 0,
    },
    tables: {},
  };

  let totalRecords = 0;
  let exportedTables = 0;

  for (const table of tables) {
    try {
      const rows = await queryRows(`SELECT * FROM ${table}`);
      backupData.tables[table] = rows;
      totalRecords += rows.length;
      exportedTables++;
      console.log(`  ✓ Exported table "${table}": ${rows.length} record(s)`);
    } catch (err: any) {
      console.warn(`  ⚠️ Table "${table}" could not be exported (may not exist): ${err.message}`);
      backupData.tables[table] = [];
    }
  }

  backupData.metadata.totalTables = exportedTables;
  backupData.metadata.totalRecords = totalRecords;

  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf-8');

  const stats = fs.statSync(backupPath);
  const sizeKb = (stats.size / 1024).toFixed(2);

  console.log('-------------------------------------------------------');
  console.log(`✅ Backup successfully created at: ${backupPath}`);
  console.log(`📊 Total Tables: ${exportedTables} | Total Records: ${totalRecords} | File Size: ${sizeKb} KB`);
  console.log('=======================================================');

  return {
    success: true,
    backupPath,
    totalTables: exportedTables,
    totalRecords,
  };
}

if (require.main === module) {
  createDatabaseBackup()
    .then(async () => {
      await disconnectDatabase();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Backup failed:', err);
      await disconnectDatabase();
      process.exit(1);
    });
}
