/**
 * In-memory cache for LLM results.
 *
 * Avoids re-calling the provider for identical inputs in the same process
 * lifetime. Only safe to cache pure functions (same input always produces
 * equivalent output). Results are stored by a deterministic hash of the
 * prompt content.
 *
 * The cache is intentionally NOT persisted to disk or a remote store,
 * keeping the implementation dependency-free and avoiding stale-result
 * problems across deployments.
 */

import crypto from 'crypto';
import type { CacheKey } from './types';

interface CacheEntry<T> {
  value: T;
  createdAt: number;
  /** TTL in ms; 0 = never expire */
  ttlMs: number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class LLMCache<T = unknown> {
  private readonly store = new Map<CacheKey, CacheEntry<T>>();

  /** Returns a stable cache key for arbitrary serialisable input */
  static key(...parts: unknown[]): CacheKey {
    const payload = JSON.stringify(parts);
    return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
  }

  get(key: CacheKey): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.ttlMs > 0 && Date.now() - entry.createdAt > entry.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: CacheKey, value: T, ttlMs = DEFAULT_TTL_MS): void {
    this.store.set(key, { value, createdAt: Date.now(), ttlMs });
  }

  has(key: CacheKey): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/**
 * Wraps an async factory with caching.
 *
 * @param cache   The LLMCache instance
 * @param key     Cache key
 * @param factory Function to call on cache miss
 * @param ttlMs   Optional TTL override
 */
export async function withCache<T>(
  cache: LLMCache<T>,
  key: CacheKey,
  factory: () => Promise<T>,
  ttlMs?: number
): Promise<T> {
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const result = await factory();
  cache.set(key, result, ttlMs);
  return result;
}
