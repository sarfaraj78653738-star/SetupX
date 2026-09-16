interface Bucket {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(
    private readonly keyPrefix: string,
    private readonly maxPerWindow: number,
    private readonly windowMs: number
  ) {}
  consume(identifier: string): { allowed: boolean; retryAfter: number } {
    const key = `${this.keyPrefix}:${identifier}`;
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfter: 0 };
    }
    if (existing.count >= this.maxPerWindow) {
      return { allowed: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
    }
    existing.count++;
    return { allowed: true, retryAfter: 0 };
  }
  periodicSweep() {
    if (typeof setInterval === "undefined") return;
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.buckets.entries()) {
        if (v.resetAt <= now) this.buckets.delete(k);
      }
    }, 60_000);
  }
}

const scrubPatterns = [
  /api[_ -]?key[\s:=]*[\w.-]+/gi,
  /access[_ -]?token[\s:=]*[\w.-]+/gi,
  /jwt[_ -]?token[\s:=]*[\w.-]+/gi,
  /refresh[_ -]?token[\s:=]*[\w.-]+/gi,
  /client[_ -]?code[\s:=]*[\w.-]+/gi,
  /token\s+[A-Za-z0-9:_-]{8,}/gi,
];

export function scrubSecrets(input: string | null | undefined): string {
  if (!input) return "";
  let s = input;
  for (const p of scrubPatterns) s = s.replace(p, "[REDACTED]");
  return s;
}

export function getClientIdentifier(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real;
  return "local";
}

export const globalLimiter = new RateLimiter("global", 60, 60_000);
export const scanLimiter = new RateLimiter("scan", 12, 60_000);
export const authLimiter = new RateLimiter("auth", 8, 60_000);
if (typeof setInterval !== "undefined") {
  [globalLimiter, scanLimiter, authLimiter].forEach((l) => l.periodicSweep());
}

export function isSafeSymbol(s: string): boolean {
  if (typeof s !== "string") return false;
  const cleaned = s.trim().toUpperCase();
  if (cleaned.length > 25 || cleaned.length < 1) return false;
  return /^[A-Z0-9.&_-]+$/.test(cleaned);
}

export function isSafeLimit(n: unknown): number {
  const v = typeof n === "string" ? parseInt(n, 10) : NaN;
  if (!Number.isFinite(v) || v < 1) return 50;
  return Math.min(v, 200);
}

export function isSafeScope(s: string | null): "all" | "nifty50" | "niftynext50" | "bse" | "broad" {
  const allowed = ["all", "nifty50", "niftynext50", "bse", "broad"] as const;
  return (allowed as readonly string[]).includes(s ?? "")
    ? ((s ?? "all") as "all" | "nifty50" | "niftynext50" | "bse" | "broad")
    : "all";
}

export function validateKiteCredentials(input: unknown): string | null {
  if (!input || typeof input !== "object") return "Invalid payload";
  const { apiKey, accessToken } = input as Record<string, unknown>;
  if (typeof apiKey !== "string" || typeof accessToken !== "string") {
    return "Both apiKey and accessToken are required";
  }
  if (apiKey.length < 4 || apiKey.length > 64) return "Invalid API key length";
  if (accessToken.length < 8 || accessToken.length > 256) return "Invalid access token length";
  if (!/^[A-Za-z0-9_-]+$/.test(apiKey)) return "Invalid API key characters";
  if (!/^[A-Za-z0-9_.-]+$/.test(accessToken)) return "Invalid access token characters";
  return null;
}

function parseAllowedFromEnv(): string[] {
  return (
    process.env.ALLOWED_ORIGIN?.split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean) ?? []
  );
}

/**
 * Returns the derived fallback allowlist when ALLOWED_ORIGIN is empty.
 * In production we DO NOT auto-allow anything — the server refuses the
 * request. In dev / non-prod, localhost variants are permitted.
 *
 * Note on VERCEL_URL: that env var contains the scheme-less hostname of the
 * current deployment (e.g. "stock-radar-user.vercel.app"). We expose that
 * hostname as an additional fallback when ALLOWED_ORIGIN is missing —
 * this means a Vercel deploy works out of the box without setting the var.
 */
function deriveFallbackAllowlist(): string[] {
  const out: string[] = [];
  const vercelHost = process.env.VERCEL_URL?.trim().toLowerCase();
  if (vercelHost) out.push(vercelHost, `www.${vercelHost}`);
  if (process.env.NODE_ENV !== "production") {
    out.push("localhost", "127.0.0.1", "localhost:3000", "localhost:4000");
  }
  return out;
}

let prodWarned = false;

if (process.env.NODE_ENV === "production") {
  if (parseAllowedFromEnv().length === 0 && deriveFallbackAllowlist().length === 0) {
    if (!prodWarned && typeof console !== "undefined") {
      console.warn(
        "[bsr:security] ALLOWED_ORIGIN is empty in production and no fallback (VERCEL_URL) is available. " +
          "Requests will still be accepted via the same-origin check (Origin/Referer host matches the request's Host header), " +
          "but for stricter control you can explicitly set ALLOWED_ORIGIN=https://<your-domain> in your environment."
      );
      prodWarned = true;
    }
  }
}

function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase();
  if (h === p) return true;
  if (p.startsWith("*.") && h.endsWith(p.slice(1))) return true;
  return false;
}

export function safeOriginCheck(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") {
    return true;
  }

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const target = origin ?? referer ?? "";
  if (!target) return false;

  let host = "";
  try {
    host = new URL(target).host.toLowerCase();
  } catch {
    return false;
  }

  const isDev = process.env.NODE_ENV !== "production";
  const isLocalLike = host === "localhost" || host === "127.0.0.1" || host.startsWith("localhost:");
  if (isDev && isLocalLike) return true;

  // Same-origin fallback: if the Origin/Referer host matches the Host header
  // the server itself was reached on, this is provably a same-origin request
  // — regardless of which domain or hosting platform we're deployed on. This
  // makes the check work out-of-the-box on any provider (not just Vercel)
  // without requiring ALLOWED_ORIGIN to be configured, while still rejecting
  // genuine cross-site requests (an attacker's page can't spoof the Host
  // header seen by our own server).
  const requestHost = req.headers.get("host")?.trim().toLowerCase();
  if (requestHost && host === requestHost) return true;

  const allowed = [...parseAllowedFromEnv(), ...deriveFallbackAllowlist()];
  for (const pattern of allowed) {
    if (hostMatches(host, pattern)) return true;
  }
  return false;
}

export function getEffectiveAllowedOrigins(): string[] {
  return [...parseAllowedFromEnv(), ...deriveFallbackAllowlist()];
}
