import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { connectDatabase, query, disconnectDatabase, transaction } from '../config/database';

export async function restoreDatabase(customBackupFilePath?: string): Promise<{ success: boolean; totalTablesRestored: number; totalRecordsRestored: number }> {
  console.log('=======================================================');
  console.log('  🔄 IHMS ERP — Automated Database Restore Engine');
  console.log('=======================================================');

  let backupFilePath = customBackupFilePath;
  if (!backupFilePath) {
    const backupDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      throw new Error(`Backup directory not found at: ${backupDir}`);
    }

    const files = fs.readdirSync(backupDir).filter((f) => f.startsWith('ihms-backup-') && f.endsWith('.json'));
    if (files.length === 0) {
      throw new Error('No backup files found in backups directory.');
    }

    files.sort().reverse();
    backupFilePath = path.join(backupDir, files[0]);
    console.log(`  ℹ️ No backup file specified. Auto-selected latest backup: ${files[0]}`);
  }

  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file does not exist: ${backupFilePath}`);
  }

  const raw = fs.readFileSync(backupFilePath, 'utf-8');
  const backupData = JSON.parse(raw);

  await connectDatabase();

  let totalRestoredRecords = 0;
  let restoredTablesCount = 0;

  await transaction(async (client) => {
    // Reverse dependency order for safe insertion
    const tableNames = Object.keys(backupData.tables || {});

    for (const table of tableNames) {
      const rows = backupData.tables[table] || [];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      console.log(`  ⏳ Restoring table "${table}" (${rows.length} rows)...`);

      for (const row of rows) {
        const columns = Object.keys(row);
        const values = Object.values(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

        const columnList = columns.map((c) => `"${c}"`).join(', ');

        const updateSet = columns
          .filter((c) => c !== 'id')
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(', ');

        const sql = updateSet.length > 0
          ? `INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) ON CONFLICT ("id") DO UPDATE SET ${updateSet}`
          : `INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) ON CONFLICT ("id") DO NOTHING`;

        await client.query(sql, values);
        totalRestoredRecords++;
      }

      restoredTablesCount++;
      console.log(`  ✓ Table "${table}" restored successfully.`);
    }
  });

  console.log('-------------------------------------------------------');
  console.log('✅ Database restore completed successfully.');
  console.log(`📊 Restored ${restoredTablesCount} tables with ${totalRestoredRecords} total records.`);
  console.log('=======================================================');

  return {
    success: true,
    totalTablesRestored: restoredTablesCount,
    totalRecordsRestored: totalRestoredRecords,
  };
}

if (require.main === module) {
  const customFile = process.argv[2];
  restoreDatabase(customFile)
    .then(async () => {
      await disconnectDatabase();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Restore failed:', err);
      await disconnectDatabase();
      process.exit(1);
    });
}
