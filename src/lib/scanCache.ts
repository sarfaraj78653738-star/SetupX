import type { ScreenResult } from "./screener";

/**
 * In-memory cache of the most recent scan result for each symbol.
 * The screener route populates this as it scans; the stock detail route
 * reads from it first so the user sees the exact same scored result they
 * saw in the list view (no contradictory Supertrend/EMA flips).
 *
 * Entries expire after CACHE_TTL_MS so stale data doesn't persist forever.
 */

const CACHE_TTL_MS = 15 * 1000; // 15 seconds — live price updates

interface CacheEntry {
  result: ScreenResult;
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
  computedAt: string; // ISO timestamp
}

const cache = new Map<string, CacheEntry>();

export function cacheScanResult(
  symbol: string,
  entry: Omit<CacheEntry, "computedAt">
): void {
  cache.set(symbol.toUpperCase(), {
    ...entry,
    computedAt: new Date().toISOString(),
  });
}

export function getCachedScanResult(symbol: string): CacheEntry | null {
  const key = symbol.toUpperCase();
  const entry = cache.get(key);
  if (!entry) return null;
  const ageMs = Date.now() - new Date(entry.computedAt).getTime();
  if (ageMs > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function clearScanCache(): void {
  cache.clear();
}

// Periodic sweep to prevent unbounded growth
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now - new Date(v.computedAt).getTime() > CACHE_TTL_MS) {
        cache.delete(k);
      }
    }
  }, 15_000);
}
