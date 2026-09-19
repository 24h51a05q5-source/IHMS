import { connectDatabase, disconnectDatabase, query, isEmbeddedPostgres } from '../config/database';
import { redisService } from '../common/redis/redis.service';

/**
 * Standalone Migration Script: Enterprise Student ID Migration (Window Function & Redis Hand-off)
 * Usage: ts-node src/scripts/migrate-student-ids.ts
 */
async function main() {
  console.log('====================================================');
  console.log('  🚀 Starting Enterprise Student ID Migration');
  console.log('  🎯 Target Format: [HostelID]-[SequentialNumber]');
  console.log('====================================================');

  await connectDatabase();

  try {
    console.log('[Migration] Phase 1: Executing PostgreSQL Window Function Migration...');
    if (!isEmbeddedPostgres()) {
      await query(`
        WITH numbered_students AS (
            SELECT 
                id, 
                hostel_id,
                ROW_NUMBER() OVER (PARTITION BY hostel_id ORDER BY created_at ASC) as seq_num
            FROM students
        )
        UPDATE students s
        SET custom_id = ns.hostel_id || '-' || LPAD(ns.seq_num::text, 4, '0')
        FROM numbered_students ns
        WHERE s.id = ns.id;
      `);
      console.log('[Migration] ✅ Window function migration applied successfully.');
    } else {
      console.log('[Migration] Embedded engine detected. Running grouping sequential update...');
      const students = await query(`
        SELECT id, hostel_id, created_at
        FROM students
        ORDER BY hostel_id ASC, created_at ASC
      `);

      const hostelCounters = new Map<string, number>();
      for (const stu of students.rows) {
        const hId = stu.hostel_id || 'H000';
        const current = hostelCounters.get(hId) || 0;
        const next = current + 1;
        hostelCounters.set(hId, next);
        const customId = `${hId}-${String(next).padStart(4, '0')}`;
        await query(`UPDATE students SET custom_id = $1 WHERE id = $2`, [customId, stu.id]);
      }
      console.log(`[Migration] ✅ Migrated ${students.rows.length} student records.`);
    }

    console.log('[Migration] Phase 2: Synchronizing Redis Counters with MAX(seq)...');
    const allCustomIds = await query(`
      SELECT hostel_id, custom_id
      FROM students
      WHERE custom_id IS NOT NULL AND custom_id != ''
    `);

    const maxMap = new Map<string, number>();
    for (const row of allCustomIds.rows) {
      const parts = String(row.custom_id).split('-');
      const hId = parts[0] || row.hostel_id || 'H000';
      const seqStr = parts[1] || '0';
      const seqNum = parseInt(seqStr, 10) || 0;
      const currentMax = maxMap.get(hId) || 0;
      if (seqNum > currentMax) {
        maxMap.set(hId, seqNum);
      }
    }

    for (const [hId, maxSeq] of maxMap.entries()) {
      await redisService.setHostelCounter(hId, maxSeq);
      console.log(`  📍 Hostel [${hId}]: Redis counter initialized to ${maxSeq}`);
    }

    console.log('[Migration] ✅ Redis sequence hand-off complete.');
  } catch (err: any) {
    console.error('[Migration] ❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await redisService.disconnect();
    await disconnectDatabase();
    console.log('[Migration] Finished.');
  }
}

main().catch(console.error);
