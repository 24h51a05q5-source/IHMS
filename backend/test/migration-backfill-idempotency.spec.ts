import { connectDatabase, disconnectDatabase, query, queryRows } from '../src/config/database';
import { runMigrations, backfillIhmsIds } from '../src/config/migrations';
import bcrypt from 'bcryptjs';

describe('Database Migration & Owner Backfill Idempotency & Uniqueness Test Suite', () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('MIG TEST 1: runMigrations() can execute successfully', async () => {
    await expect(runMigrations()).resolves.not.toThrow();
  });

  it('MIG TEST 2: runMigrations() can execute a SECOND time without duplicate errors (Idempotency)', async () => {
    // Running a second time directly should be completely idempotent and error-free
    await expect(runMigrations()).resolves.not.toThrow();
  });

  it('MIG TEST 3: Multiple owners with missing ihms_id do not collide or violate users_user_id_key', async () => {
    const defaultHash = await bcrypt.hash('Password123!', 10);
    const org1 = `org_test_mig_01_${Date.now()}`;
    const org2 = `org_test_mig_02_${Date.now()}`;

    // Create 2 test organizations
    await query(`INSERT INTO organizations (id, org_code, name) VALUES ($1, $1, 'Org 1'), ($2, $2, 'Org 2')`, [org1, org2]);

    // Insert 4 owner/admin users across these organizations with distinct existing user_id values but NO ihms_id
    const u1 = `usr_owner_mig_1_${Date.now()}`;
    const u2 = `usr_owner_mig_2_${Date.now()}`;
    const u3 = `usr_admin_mig_3_${Date.now()}`;
    const u4 = `usr_owner_mig_4_${Date.now()}`;

    await query(`
      INSERT INTO users (id, user_id, email, password_hash, role, organization_id, name, status)
      VALUES 
        ($1, 'OWN_LEGACY_01', 'owner1_mig@test.com', $5, 'OWNER', $6, 'Legacy Owner 1', 'ACTIVE'),
        ($2, 'OWN_LEGACY_02', 'owner2_mig@test.com', $5, 'OWNER', $6, 'Legacy Owner 2 (Same Org)', 'ACTIVE'),
        ($3, 'ADM_LEGACY_03', 'admin3_mig@test.com', $5, 'ADMIN', $6, 'Legacy Admin (Same Org)', 'ACTIVE'),
        ($4, 'OWN_LEGACY_04', 'owner4_mig@test.com', $5, 'OWNER', $7, 'Legacy Owner 4 (Other Org)', 'ACTIVE')
    `, [u1, u2, u3, u4, defaultHash, org1, org2]);

    // Insert an owner entity linked to u1
    const ownerEntityId = `own_entity_mig_1_${Date.now()}`;
    await query(`
      INSERT INTO owners (id, user_id, organization_id, full_name, email, status)
      VALUES ($1, $2, $3, 'Legacy Owner 1', 'owner1_mig@test.com', 'ACTIVE')
    `, [ownerEntityId, u1, org1]);

    // Run backfill
    await expect(backfillIhmsIds()).resolves.not.toThrow();

    // Verify all 4 users preserved their existing user_id
    const users = await queryRows<any>(`
      SELECT id, user_id, ihms_id, role FROM users WHERE id IN ($1, $2, $3, $4)
    `, [u1, u2, u3, u4]);

    expect(users.length).toBe(4);
    const u1Row = users.find(u => u.id === u1);
    const u2Row = users.find(u => u.id === u2);
    const u3Row = users.find(u => u.id === u3);
    const u4Row = users.find(u => u.id === u4);

    expect(u1Row.user_id).toBe('OWN_LEGACY_01');
    expect(u2Row.user_id).toBe('OWN_LEGACY_02');
    expect(u3Row.user_id).toBe('ADM_LEGACY_03');
    expect(u4Row.user_id).toBe('OWN_LEGACY_04');

    // Verify all 4 users received non-colliding ihms_id
    expect(u1Row.ihms_id).toBeDefined();
    expect(u2Row.ihms_id).toBeDefined();
    expect(u3Row.ihms_id).toBeDefined();
    expect(u4Row.ihms_id).toBeDefined();

    const ihmsIds = [u1Row.ihms_id, u2Row.ihms_id, u3Row.ihms_id, u4Row.ihms_id];
    const uniqueIhmsIds = new Set(ihmsIds);
    expect(uniqueIhmsIds.size).toBe(4); // All 4 MUST be completely unique!

    // Verify owner entity was synchronized with u1's ihms_id and user_id
    const owner = await queryRows<any>(`SELECT * FROM owners WHERE id = $1`, [ownerEntityId]);
    expect(owner[0].user_id).toBe(u1);
    expect(owner[0].ihms_id).toBe(u1Row.ihms_id);
  });

  it('MIG TEST 4: Re-running backfill and migrations after backfill is completely idempotent', async () => {
    // Execute backfill and runMigrations again
    await expect(backfillIhmsIds()).resolves.not.toThrow();
    await expect(runMigrations()).resolves.not.toThrow();

    // Verify no duplicates created
    const userRows = await queryRows<any>(`SELECT user_id FROM users`);
    const userCounts = new Map<string, number>();
    for (const r of userRows) {
      userCounts.set(r.user_id, (userCounts.get(r.user_id) || 0) + 1);
    }
    const duplicateUsers = Array.from(userCounts.entries()).filter(([_, count]) => count > 1);
    expect(duplicateUsers.length).toBe(0);

    const ihmsRows = await queryRows<any>(`SELECT ihms_id FROM users WHERE ihms_id IS NOT NULL AND ihms_id != ''`);
    const ihmsCounts = new Map<string, number>();
    for (const r of ihmsRows) {
      ihmsCounts.set(r.ihms_id, (ihmsCounts.get(r.ihms_id) || 0) + 1);
    }
    const duplicateIhms = Array.from(ihmsCounts.entries()).filter(([_, count]) => count > 1);
    expect(duplicateIhms.length).toBe(0);
  });
});
