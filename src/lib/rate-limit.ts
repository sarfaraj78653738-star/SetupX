import { kvRateLimit, kvGetSession, kvSetSession, kvDeleteSession, kvGetUser, kvSetUser, kvGetWatchlist, kvSetWatchlist, kvCacheGet, kvCacheSet } from "./kv";
import type { FetchEvent } from "@vercel/edge";

// Re-export KV-backed rate limiting
export { kvRateLimit } from "./kv";

// ---------------------------------------------------------------------------
// KV-backed rate limiters (drop-in replacement for broken in-memory ones)
// ---------------------------------------------------------------------------

/**
 * Global rate limiter: 60 requests per minute per IP/client.
 * Vercel KV-backed — works across serverless invocations.
 */
export async function globalRateLimit(identifier: string): Promise<{ allowed: boolean; retryAfter: number }> {
  const result = await kvRateLimit(`global:${identifier}`, 60, 60);
  return { allowed: result.allowed, retryAfter: result.retryAfter };
}

/**
 * Scan rate limiter: 12 scans per minute per IP/client.
 */
export async function scanRateLimit(identifier: string): Promise<{ allowed: boolean; retryAfter: number }> {
  const result = await kvRateLimit(`scan:${identifier}`, 12, 60);
  return { allowed: result.allowed, retryAfter: result.retryAfter };
}

/**
 * Auth rate limiter: 8 auth attempts per minute per IP/client.
 */
export async function authRateLimit(identifier: string): Promise<{ allowed: boolean; retryAfter: number }> {
  const result = await kvRateLimit(`auth:${identifier}`, 8, 60);
  return { allowed: result.allowed, retryAfter: result.retryAfter };
}

// ---------------------------------------------------------------------------
// KV-backed scan result cache (replaces broken in-memory scanCache)
// ---------------------------------------------------------------------------

const SCAN_CACHE_TTL_MS = 15 * 1000; // 15 seconds

export interface CachedScanEntry {
  result: unknown;
  candles: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>;
  quote: {
    price: number;
    change: number;
    changePercent: number;
    prevClose: number;
    dayHigh: number;
    dayLow: number;
  };
  dataSource: "kite" | "yahoo";
  computedAt: string;
}

export async function cacheScanResult(symbol: string, entry: Omit<CachedScanEntry, "computedAt">): Promise<void> {
  const key = `scan:${symbol.toUpperCase()}`;
  const payload = {
    ...entry,
    computedAt: new Date().toISOString(),
  };
  await kvCacheSet(key, payload, Math.floor(SCAN_CACHE_TTL_MS / 1000));
}

export async function getCachedScanResult(symbol: string): Promise<CachedScanEntry | null> {
  const key = `scan:${symbol.toUpperCase()}`;
  const raw = await kvCacheGet<CachedScanEntry>(key);
  if (!raw) return null;
  const ageMs = Date.now() - new Date(raw.computedAt).getTime();
  if (ageMs > SCAN_CACHE_TTL_MS) {
    await kvCacheDelete(key);
    return null;
  }
  return raw;
}

export async function clearScanCache(): Promise<void> {
  // KV doesn't support pattern deletion; we'd need to track keys.
  // For now, individual entries TTL out in 15s.
  // A full clear would require iterating known keys — skip for now.
}

// ---------------------------------------------------------------------------
// KV-backed broker instrument cache (replaces per-invocation Kite cache)
// ---------------------------------------------------------------------------

const INSTRUMENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function cacheInstruments(broker: string, key: string, instruments: unknown): Promise<void> {
  const cacheKey = `instruments:${broker}:${key}`;
  await kvCacheSet(cacheKey, instruments, Math.floor(INSTRUMENT_CACHE_TTL_MS / 1000));
}

export async function getCachedInstruments(broker: string, key: string): Promise<unknown | null> {
  const cacheKey = `instruments:${broker}:${key}`;
  return kvCacheGet(cacheKey);
}

// ---------------------------------------------------------------------------
// KV-backed Fyers + Angel One rate limit state (replaces per-invocation)
// ---------------------------------------------------------------------------

/**
 * Generic sliding-window rate limiter backed by KV.
 * Tracks call timestamps in a Sorted Set-like structure using a simple counter + window.
 */
export interface DistributedRateLimiter {
  /** Wait if necessary and record a call. Returns the wait time applied (0 if no wait). */
  wait(label: string): Promise<number>;
}

export function createDistributedRateLimiter(
  prefix: string,
  maxPerSecond: number,
  maxPerMinute: number,
): DistributedRateLimiter {
  const getKey = (window: "sec" | "min") => `${RATE_PREFIX}${prefix}:${window}`;

  return {
    async wait(label: string): Promise<number> {
      const now = Date.now();
      const secResult = await kvRateLimit(getKey("sec"), maxPerSecond, 1);
      if (!secResult.allowed) {
        const waitMs = Math.max(0, secResult.retryAfter * 1000 + 50);
        await new Promise((r) => setTimeout(r, waitMs));
        return waitMs;
      }

      const minResult = await kvRateLimit(getKey("min"), maxPerMinute, 60);
      if (!minResult.allowed) {
        const waitMs = Math.max(0, minResult.retryAfter * 1000 + 50);
        await new Promise((r) => setTimeout(r, waitMs));
        return waitMs;
      }

      return 0;
    },
  };
}

// Pre-configured limiters (use these instead of per-invocation state)
export const fyersRateLimiter = createDistributedRateLimiter("fyers", 7, 170);
export const angelRateLimiter = createDistributedRateLimiter("angel", 1, 60);

// ---------------------------------------------------------------------------
// Per-function retry/backoff helpers (used alongside distributed limiters)
// ---------------------------------------------------------------------------

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 2,
  baseMs = 400,
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxRetries) {
        const waitMs = Math.round(baseMs * Math.pow(2, attempt) + Math.random() * 200);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw lastError ?? new Error("unknown error");
}
