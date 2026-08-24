import { connectDatabase, disconnectDatabase, query } from './config/database';

async function test() {
  await connectDatabase();
  const tables = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  console.log('Created tables count:', tables.rows.length);
  console.log('Tables:', tables.rows.map((r: any) => r.table_name).sort());
  await disconnectDatabase();
}
test().catch(console.error);
