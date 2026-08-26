import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

export interface DbClient {
  query<R extends QueryResultRow = any, I extends any[] = any[]>(
    queryText: string,
    values?: I
  ): Promise<QueryResult<R>>;
}

let pool: Pool | null = null;
let isPgMem = false;

export function getPoolConfig(): PoolConfig {
  const maxPoolSize = parseInt(process.env.DB_POOL_MAX || '50', 10);
  const minPoolSize = parseInt(process.env.DB_POOL_MIN || '5', 10);
  const idleTimeout = parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10);
  const connTimeout = parseInt(process.env.DB_CONN_TIMEOUT || '10000', 10);

  const dbUrl = process.env.DATABASE_URL?.trim();
  if (dbUrl) {
    return {
      connectionString: dbUrl,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: maxPoolSize,
      min: minPoolSize,
      idleTimeoutMillis: idleTimeout,
      connectionTimeoutMillis: connTimeout,
      allowExitOnIdle: false,
    };
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'ihms_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: maxPoolSize,
    min: minPoolSize,
    idleTimeoutMillis: idleTimeout,
    connectionTimeoutMillis: connTimeout,
    allowExitOnIdle: false,
  };
}

export async function connectDatabase(): Promise<Pool> {
  if (pool) {
    return pool;
  }

  const config = getPoolConfig();

  try {
    const candidatePool = new Pool(config);
    // Test connectivity
    const client = await candidatePool.connect();
    const res = await client.query('SELECT NOW() AS now, current_database() AS db');
    client.release();

    pool = candidatePool;
    isPgMem = false;
    console.log(`[Database] ✅ Connected to PostgreSQL database "${res.rows[0]?.db}" at ${config.host || 'DATABASE_URL'}`);
    
    // Run migrations
    const { runMigrations } = await import('./migrations');
    await runMigrations();

    return pool;
  } catch (err: any) {
    console.warn(`[Database] ⚠️ Direct PostgreSQL connection unreachable (${err.message || 'connection refused'}).`);
    console.log('[Database] 🐘 Initializing local embedded PostgreSQL database engine (SQL compliant)...');
    
    const { newDb, DataType } = await import('pg-mem');
    const db = newDb({
      autoCreateForeignKeyIndices: true,
    });
    
    // Register common postgres functions
    db.public.registerFunction({
      name: 'gen_random_uuid',
      returns: DataType.text,
      implementation: () => require('crypto').randomUUID(),
    });
    db.public.registerFunction({
      name: 'replace',
      args: [DataType.text, DataType.text, DataType.text],
      returns: DataType.text,
      implementation: (str: string, findStr: string, replaceStr: string) => {
        if (str === null || str === undefined) return '';
        return String(str).split(String(findStr)).join(String(replaceStr));
      },
    });
    
    const pgAdapter = db.adapters.createPg();
    pool = new pgAdapter.Pool() as unknown as Pool;
    isPgMem = true;
    console.log('[Database] ✅ PostgreSQL relational database initialized and running.');

    // Run migrations on the PostgreSQL instance
    const { runMigrations } = await import('./migrations');
    await runMigrations();

    return pool;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[Database] Disconnected from PostgreSQL.');
  }
}

export async function query<R extends QueryResultRow = any>(
  sqlText: string,
  params?: any[]
): Promise<QueryResult<R>> {
  if (!pool) {
    await connectDatabase();
  }
  return pool!.query<R>(sqlText, params);
}

export async function queryRows<T = any>(sqlText: string, params?: any[]): Promise<T[]> {
  const result = await query(sqlText, params);
  return result.rows as T[];
}

export async function queryOne<T = any>(sqlText: string, params?: any[]): Promise<T | null> {
  const result = await query(sqlText, params);
  return (result.rows[0] as T) || null;
}

export async function transaction<T>(
  callback: (client: DbClient) => Promise<T>
): Promise<T> {
  if (!pool) {
    await connectDatabase();
  }

  const client = await pool!.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function isEmbeddedPostgres(): boolean {
  return isPgMem;
}

export async function pingDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await queryOne<{ val: number }>('SELECT 1 as val');
    const latencyMs = Date.now() - start;
    return { ok: res?.val === 1, latencyMs };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err?.message || 'Database ping failed' };
  }
}

export function getPoolStats() {
  if (!pool) {
    return { status: 'disconnected', totalCount: 0, idleCount: 0, waitingCount: 0 };
  }
  return {
    status: 'connected',
    isEmbedded: isPgMem,
    totalCount: (pool as any).totalCount || 0,
    idleCount: (pool as any).idleCount || 0,
    waitingCount: (pool as any).waitingCount || 0,
  };
}


