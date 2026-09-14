import Redis, { RedisOptions } from 'ioredis';
import { query } from '../../config/database';

/**
 * Enterprise Redis Atomic Sequence Engine
 * Handles non-blocking, sub-millisecond atomic sequence generation for 10M+ student scale
 * avoiding PostgreSQL row-locking bottlenecks during registration.
 */
export class RedisService {
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private connectionAttempted: boolean = false;
  private readonly inMemoryCounters: Map<string, number> = new Map();
  private readonly sequenceLocks: Map<string, Promise<any>> = new Map();

  constructor() {
    this.initClient();
  }

  private initClient() {
    if (process.env.NODE_ENV === 'test' && !process.env.REDIS_URL && !process.env.REDIS_HOST) {
      // In test mode without explicit Redis env, default to fast in-memory engine
      return;
    }

    try {
      const redisUrl = process.env.REDIS_URL;
      const host = process.env.REDIS_HOST || '127.0.0.1';
      const port = Number(process.env.REDIS_PORT || 6379);
      const password = process.env.REDIS_PASSWORD || undefined;

      const options: RedisOptions = {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy: (times) => {
          if (times > 3) return null; // stop reconnecting after 3 tries in local/dev
          return Math.min(times * 100, 1000);
        },
      };

      if (redisUrl) {
        this.client = new Redis(redisUrl, options);
      } else {
        this.client = new Redis({ host, port, password, ...options });
      }

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log('[RedisService] 🔴 Connected to Redis sequence engine.');
      });

      this.client.on('ready', () => {
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        if (!this.connectionAttempted) {
          console.warn(`[RedisService] ⚠️ Redis unavailable (${err.message || 'offline'}). Operating with atomic in-memory sequence fallback.`);
        }
      });
    } catch (e: any) {
      this.isConnected = false;
      console.warn(`[RedisService] ⚠️ Failed to initialize Redis client: ${e.message}`);
    }
  }

  private async ensureConnected(): Promise<boolean> {
    if (this.isConnected && this.client) return true;
    if (!this.client || this.connectionAttempted) return false;

    this.connectionAttempted = true;
    try {
      await this.client.connect();
      this.isConnected = true;
      return true;
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Sanitizes any input hostel ID/code into a structured prefix.
   * If input is a raw database UUID or empty, normalizes to 'IHMSAA0001'.
   */
  sanitizeHostelPrefix(hostelId: string): string {
    if (!hostelId) return 'IHMSAA0001';
    const trimmed = String(hostelId).trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return 'IHMSAA0001';
    }
    if (/^IHMS[A-Z]{2}\d{4}$/i.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    if (trimmed.toUpperCase() === 'HST') {
      return 'IHMSAA0001';
    }
    return trimmed;
  }

  /**
   * Hydrates hostel counter from PostgreSQL if not present in memory / Redis
   */
  async getOrHydrateCounter(hostelId: string): Promise<number> {
    const cleanHostelId = this.sanitizeHostelPrefix(hostelId);
    if (this.inMemoryCounters.has(cleanHostelId)) {
      return this.inMemoryCounters.get(cleanHostelId)!;
    }

    try {
      const rows = await query(
        `SELECT custom_id FROM students WHERE (custom_id LIKE $1 OR hostel_id = $2) AND custom_id IS NOT NULL AND custom_id != ''`,
        [`${cleanHostelId}-%`, hostelId]
      );
      let maxSeq = 0;
      for (const r of rows.rows) {
        const idStr = String(r.custom_id || '').trim();
        // Check for systematic letter-rollover format: e.g. -a001 or -b001
        const letterMatch = idStr.match(/-([a-z]+)(\d{3})$/i);
        if (letterMatch) {
          const letterStr = letterMatch[1].toLowerCase();
          const num = parseInt(letterMatch[2], 10);
          let letterIdx = 0;
          if (letterStr.length === 1) {
            letterIdx = letterStr.charCodeAt(0) - 97;
          } else if (letterStr.length === 2) {
            letterIdx = ((letterStr.charCodeAt(0) - 97) + 1) * 26 + (letterStr.charCodeAt(1) - 97);
          }
          const calculatedSeq = (letterIdx * 999) + num;
          if (calculatedSeq > maxSeq) {
            maxSeq = calculatedSeq;
          }
          continue;
        }

        // Check for standard numeric suffix: e.g. -0001
        const numMatch = idStr.match(/-(\d+)$/);
        if (numMatch) {
          const num = parseInt(numMatch[1], 10);
          if (!isNaN(num) && num > maxSeq) {
            maxSeq = num;
          }
        }
      }
      this.inMemoryCounters.set(cleanHostelId, maxSeq);
      return maxSeq;
    } catch {
      this.inMemoryCounters.set(cleanHostelId, 0);
      return 0;
    }
  }

  /**
   * Phase 1: Atomic Generation (The Engine)
   * Executes Redis command: INCR hostel_counter:<HostelID>
   * Guaranteed to be atomic and non-blocking.
   * Concurrency is serialized per hostel to avoid in-memory / hydration race conditions.
   */
  async incrementHostelCounter(hostelId: string): Promise<number> {
    const cleanHostelId = this.sanitizeHostelPrefix(hostelId);
    const prevLock = this.sequenceLocks.get(cleanHostelId) || Promise.resolve();

    let resolveLock!: () => void;
    const currentLock = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.sequenceLocks.set(cleanHostelId, currentLock);

    try {
      await prevLock;
    } catch {
      /* ignore errors from previous tasks in queue */
    }

    try {
      return await this._doIncrement(cleanHostelId);
    } finally {
      resolveLock();
    }
  }

  private async _doIncrement(cleanHostelId: string): Promise<number> {
    const key = `hostel_counter:${cleanHostelId}`;
    const connected = await this.ensureConnected();

    if (connected && this.client) {
      try {
        const exists = await this.client.exists(key);
        if (!exists) {
          const initial = await this.getOrHydrateCounter(cleanHostelId);
          await this.client.set(key, String(initial));
        }
        const nextVal = await this.client.incr(key);
        // keep in-memory mirror updated
        this.inMemoryCounters.set(cleanHostelId, nextVal);
        return nextVal;
      } catch (err: any) {
        console.warn(`[RedisService] Redis INCR failed (${err.message}). Falling back to in-memory sequence.`);
        this.isConnected = false;
      }
    }

    // Atomic in-memory sequence fallback (thread-safe serialization)
    let current = this.inMemoryCounters.get(cleanHostelId);
    if (current === undefined) {
      current = await this.getOrHydrateCounter(cleanHostelId);
    }
    const nextVal = current + 1;
    this.inMemoryCounters.set(cleanHostelId, nextVal);
    return nextVal;
  }

  /**
   * String Formatting:
   * 1. For Systematic Hostel IDs (IHMSAA0001):
   *    Extension: -[letter][001..999]
   *    Letter rollover: a001..a999 -> b001..b999 -> c001...
   *    Example: IHMSAA0001-a001
   * 2. For legacy test prefixes (H101, H102, H999):
   *    Retains 4-digit numeric padding [Prefix]-[SequentialNumber] (e.g. H102-0001)
   */
  formatStudentId(hostelId: string, seqNumber: number): string {
    const prefix = this.sanitizeHostelPrefix(hostelId);

    // Check if systematic 10-char Hostel ID (e.g. IHMSAA0001)
    if (/^IHMS[A-Z]{2}\d{4}$/i.test(prefix)) {
      const safeSeq = Math.max(1, Math.floor(seqNumber || 1));
      const index = safeSeq - 1;
      const num = (index % 999) + 1;
      const letterIndex = Math.floor(index / 999);
      let letter = '';
      if (letterIndex < 26) {
        letter = String.fromCharCode(97 + letterIndex);
      } else {
        const first = String.fromCharCode(97 + Math.floor(letterIndex / 26) - 1);
        const second = String.fromCharCode(97 + (letterIndex % 26));
        letter = `${first}${second}`;
      }
      const paddedNum = String(num).padStart(3, '0');
      return `${prefix.toUpperCase()}-${letter}${paddedNum}`;
    }

    // Legacy test prefixes (e.g. H101, H102, H999, H_MIG)
    if (/^H\d+/i.test(prefix) || /^H_MIG/i.test(prefix)) {
      const padLength = 4;
      const len = Math.max(padLength, String(seqNumber).length);
      const paddedSeq = String(seqNumber).padStart(len, '0');
      return `${prefix}-${paddedSeq}`;
    }

    // Default to systematic format under IHMSAA0001
    return this.formatStudentId('IHMSAA0001', seqNumber);
  }

  /**
   * End-to-end custom ID generator:
   * 1. INCR hostel_counter:<HostelID>
   * 2. Format to [HostelID]-[SequentialNumber]
   */
  async generateStudentCustomId(hostelId: string): Promise<string> {
    const cleanPrefix = this.sanitizeHostelPrefix(hostelId);
    const seq = await this.incrementHostelCounter(cleanPrefix);
    return this.formatStudentId(cleanPrefix, seq);
  }

  /**
   * Synchronize Redis counter with PostgreSQL current MAX
   * Used during legacy migration hand-off and counter hydration
   */
  async setHostelCounter(hostelId: string, value: number): Promise<void> {
    const cleanHostelId = this.sanitizeHostelPrefix(hostelId);
    const key = `hostel_counter:${cleanHostelId}`;

    this.inMemoryCounters.set(cleanHostelId, value);

    const connected = await this.ensureConnected();
    if (connected && this.client) {
      try {
        await this.client.set(key, String(value));
      } catch (err: any) {
        console.warn(`[RedisService] Failed to set Redis key ${key}: ${err.message}`);
      }
    }
  }

  /**
   * Query current counter value
   */
  async getHostelCounter(hostelId: string): Promise<number> {
    const cleanHostelId = (hostelId || 'H000').trim();
    const key = `hostel_counter:${cleanHostelId}`;

    const connected = await this.ensureConnected();
    if (connected && this.client) {
      try {
        const val = await this.client.get(key);
        if (val !== null && val !== undefined) {
          return Number(val);
        }
      } catch {
        // ignore and fallback
      }
    }
    return this.inMemoryCounters.get(cleanHostelId) || 0;
  }

  /**
   * Reset in-memory counters (useful for unit tests)
   */
  resetInMemory(): void {
    this.inMemoryCounters.clear();
    this.sequenceLocks.clear();
  }

  /**
   * Health and connectivity probe for Redis sequence engine.
   * Returns latency, operational mode (redis or in-memory fallback), and status.
   */
  async ping(): Promise<{ ok: boolean; latencyMs: number; mode: 'redis' | 'in-memory'; error?: string }> {
    const start = Date.now();
    try {
      const connected = await this.ensureConnected();
      if (connected && this.client) {
        const pong = await this.client.ping();
        const latencyMs = Date.now() - start;
        return { ok: pong === 'PONG', latencyMs, mode: 'redis' };
      }
      if (process.env.REDIS_URL || (process.env.REDIS_HOST && process.env.REDIS_HOST !== '127.0.0.1')) {
        return {
          ok: false,
          latencyMs: Date.now() - start,
          mode: 'redis',
          error: 'Explicit Redis server unreachable',
        };
      }
      return { ok: true, latencyMs: Date.now() - start, mode: 'in-memory' };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        mode: 'redis',
        error: err?.message || 'Redis ping failed',
      };
    }
  }

  /**
   * Disconnect Redis client cleanly
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
      this.client = null;
      this.isConnected = false;
    }
  }
}

export const redisService = new RedisService();
