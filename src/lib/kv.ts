import { kv } from "@vercel/kv";
import { AUTH_KV_TTL } from "./constants";

let _client: ReturnType<typeof kv> | null = null;

export function getKV(): ReturnType<typeof kv> {
  if (!_client) {
    _client = kv();
  }
  return _client;
}

/** Session storage key prefix */
const SESSION_PREFIX = "session:";
const USER_PREFIX = "user:";
const RATE_PREFIX = "ratelimit:";
const WATCHLIST_PREFIX = "watchlist:";
const CACHE_PREFIX = "cache:";

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

export async function kvGetSession(sessionToken: string): Promise<Record<string, unknown> | null> {
  const client = getKV();
  const data = await client.get<Record<string, unknown>>(`${SESSION_PREFIX}${sessionToken}`);
  return data ?? null;
}

export async function kvSetSession(sessionToken: string, data: Record<string, unknown>, expiresAt: Date): Promise<void> {
  const client = getKV();
  const ttl = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  await client.set(`${SESSION_PREFIX}${sessionToken}`, data, { ex: ttl });
}

export async function kvDeleteSession(sessionToken: string): Promise<void> {
  const client = getKV();
  await client.del(`${SESSION_PREFIX}${sessionToken}`);
}

// ---------------------------------------------------------------------------
// User store (for auth + subscription)
// ---------------------------------------------------------------------------

export async function kvGetUser(email: string): Promise<Record<string, unknown> | null> {
  const client = getKV();
  const data = await client.get<Record<string, unknown>>(`${USER_PREFIX}${email.toLowerCase()}`);
  return data ?? null;
}

export async function kvSetUser(id: string, data: Record<string, unknown>): Promise<void> {
  const client = getKV();
  await client.set(`${USER_PREFIX}${id}`, data);
  // Also index by email for lookup
  if (data.email) {
    await client.set(`${USER_PREFIX}email:${data.email.toLowerCase()}`, { id }, { ex: AUTH_KV_TTL });
  }
}

export async function kvDeleteUser(id: string): Promise<void> {
  const client = getKV();
  const user = await client.get<Record<string, unknown>>(`${USER_PREFIX}${id}`);
  if (user?.email) {
    await client.del(`${USER_PREFIX}email:${user.email.toLowerCase()}`);
  }
  await client.del(`${USER_PREFIX}${id}`);
}

// ---------------------------------------------------------------------------
// Rate limiting (Vercel KV-backed — replaces broken in-memory limiters)
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
  remaining: number;
  resetAt: number;
}

export async function kvRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const client = getKV();
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const redisKey = `${RATE_PREFIX}${key}`;

  // Use a Lua-like approach via KV transactions if available, else do read-modify-write with lock
  // KV doesn't support Lua, so we use a simple counter with TTL reset
  try {
    const existing = await client.get<{ count: number; resetAt: number }>(redisKey);

    if (!existing || existing.resetAt < now) {
      // New window
      const resetAt = now + windowSeconds * 1000;
      await client.set(redisKey, { count: 1, resetAt }, { ex: windowSeconds + 10 });
      return { allowed: true, retryAfter: 0, remaining: maxRequests - 1, resetAt };
    }

    if (existing.count >= maxRequests) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      return {
        allowed: false,
        retryAfter: Math.max(1, retryAfter),
        remaining: 0,
        resetAt: existing.resetAt,
      };
    }

    const newCount = existing.count + 1;
    const resetAt = existing.resetAt;
    await client.set(redisKey, { count: newCount, resetAt }, { ex: windowSeconds + 10 });
    return {
      allowed: true,
      retryAfter: 0,
      remaining: maxRequests - newCount,
      resetAt,
    };
  } catch {
    // If KV is unavailable, fail open (allow the request) — better than blocking all traffic
    return { allowed: true, retryAfter: 0, remaining: maxRequests, resetAt: now + windowSeconds * 1000 };
  }
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export async function kvGetWatchlist(userId: string): Promise<string[]> {
  const client = getKV();
  const data = await client.get<string[]>(`${WATCHLIST_PREFIX}${userId}`);
  return data ?? [];
}

export async function kvSetWatchlist(userId: string, symbols: string[]): Promise<void> {
  const client = getKV();
  await client.set(`${WATCHLIST_PREFIX}${userId}`, symbols, { ex: AUTH_KV_TTL });
}

export async function kvAddWatchlistSymbol(userId: string, symbol: string): Promise<void> {
  const list = await kvGetWatchlist(userId);
  const upper = symbol.toUpperCase().trim();
  if (!list.includes(upper)) {
    list.push(upper);
    await kvSetWatchlist(userId, list);
  }
}

export async function kvRemoveWatchlistSymbol(userId: string, symbol: string): Promise<void> {
  const client = getKV();
  const list = await kvGetWatchlist(userId);
  const upper = symbol.toUpperCase().trim();
  const idx = list.indexOf(upper);
  if (idx >= 0) {
    list.splice(idx, 1);
    await kvSetWatchlist(userId, list);
  }
}

// ---------------------------------------------------------------------------
// Generic data cache (for fundamentals, news, etc. — replaces broken in-memory cache)
// ---------------------------------------------------------------------------

export async function kvCacheGet<T>(key: string): Promise<T | null> {
  const client = getKV();
  const raw = await client.get<{ data: T; expiresAt: number }>(`${CACHE_PREFIX}${key}`);
  if (!raw || raw.expiresAt < Date.now()) {
    if (raw) await client.del(`${CACHE_PREFIX}${key}`);
    return null;
  }
  return raw.data;
}

export async function kvCacheSet<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
  const client = getKV();
  await client.set(`${CACHE_PREFIX}${key}`, { data, expiresAt: Date.now() + ttlSeconds * 1000 }, { ex: ttlSeconds + 10 });
}

export async function kvCacheDelete(key: string): Promise<void> {
  const client = getKV();
  await client.del(`${CACHE_PREFIX}${key}`);
}

export async function kvCacheDeletePattern(prefix: string): Promise<void> {
  const client = getKV();
  // KV doesn't support pattern deletion natively; we track keys separately if needed
  // For now this is a no-op — caches TTL out naturally
  void prefix;
}
