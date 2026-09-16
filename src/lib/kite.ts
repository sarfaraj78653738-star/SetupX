/**
 * Kite (Zerodha) Connect helper module.
 *
 * Instrumentation master columns:
 *   0 instrument_token  (numeric)
 *   1 exchange_token
 *   2 tradingsymbol
 *   3 name
 *   4 last_price
 *   5 expiry            (may be empty)
 *   6 strike             (may be empty)
 *   7 tick_size
 *   8 lot_size
 *   9 instrument_type   ("EQ", "FUT", "OPT", ...)
 *  10 segment            (e.g. "NSE", "NFO")
 *  11 exchange           (e.g. "NSE", "BSE")
 */

export interface KiteCredentials {
  apiKey: string;
  accessToken: string;
}

const KITE_BASE = "https://api.kite.trade";

export function parseKiteAuthHeader(apiKey: string, accessToken: string): string {
  return `token ${apiKey}:${accessToken}`;
}

function kiteHeaders(creds: KiteCredentials): Record<string, string> {
  return {
    Authorization: parseKiteAuthHeader(creds.apiKey, creds.accessToken),
    "X-Kite-Version": "3",
  };
}

function logServerWarn(scope: string, message: string): void {
  if (typeof console !== "undefined") {
    console.warn(`[bsr:kite] ${scope} — ${message}`);
  }
}

export interface KiteProfileUser {
  user_id: string;
  user_name: string;
  email: string;
}

export async function kiteProfile(
  credentials: KiteCredentials
): Promise<{ status: "ok" | "invalid"; user?: KiteProfileUser; error?: string }> {
  if (!credentials.apiKey || !credentials.accessToken) {
    return { status: "invalid", error: "Missing API key or access token" };
  }
  try {
    const res = await fetch(`${KITE_BASE}/user/profile`, {
      headers: kiteHeaders(credentials),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      const err = `HTTP ${res.status} — ${text.slice(0, 200)}`;
      logServerWarn("kiteProfile", err);
      return { status: "invalid", error: err };
    }
    const json = await res.json();
    if (!json?.data?.user_id) {
      return { status: "invalid", error: "Profile response missing user_id" };
    }
    return {
      status: "ok",
      user: {
        user_id: json.data.user_id,
        user_name: json.data.user_name,
        email: json.data.email,
      },
    };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Network error";
    logServerWarn("kiteProfile", err);
    return { status: "invalid", error: err };
  }
}

export interface KiteCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Normalize a Kite timestamp string for cross-browser compatibility.
 * Kite returns dates like "2024-01-01T09:15:00+0530" (no colon in offset),
 * which `new Date()` parses in Chrome/V8 but returns Invalid Date in Safari.
 * This inserts the missing colon: "+0530" → "+05:30".
 */
export function normalizeKiteDate(raw: string): string {
  if (raw.endsWith("Z") || raw.includes("Z")) return raw;
  return raw.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
}

export type KiteInterval = "minute" | "3minute" | "5minute" | "10minute" | "15minute" | "30minute" | "60minute" | "day" | "week";

export async function fetchKiteHistorical(
  credentials: KiteCredentials,
  instrumentToken: number,
  interval: KiteInterval = "day",
  days = 180
): Promise<KiteCandle[]> {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);
  const url =
    `${KITE_BASE}/instruments/historical/${instrumentToken}/${interval}` +
    `?from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: kiteHeaders(credentials),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : "Network error";
    logServerWarn(`fetchKiteHistorical(${instrumentToken})`, err);
    throw new Error(`Kite historical network error: ${err}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logServerWarn(
      `fetchKiteHistorical(${instrumentToken})`,
      `HTTP ${res.status} — ${text.slice(0, 200)}`
    );
    throw new Error(`Kite historical HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: { candles?: unknown } };
  const candles = Array.isArray(json?.data?.candles) ? json.data!.candles : [];
  const out: KiteCandle[] = [];
  for (const raw of candles) {
    if (!Array.isArray(raw) || raw.length < 6) continue;
    const [date, open, high, low, close, volume] = raw as [
      string,
      number,
      number,
      number,
      number,
      number
    ];
    if (
      typeof open !== "number" ||
      typeof high !== "number" ||
      typeof low !== "number" ||
      typeof close !== "number" ||
      typeof volume !== "number"
    ) {
      continue;
    }
    out.push({ date: normalizeKiteDate(date), open, high, low, close, volume });
  }
  return out;
}

export interface KiteQuoteRow {
  lastPrice: number;
  changePct: number;
  volume: number;
  ohlc: { open: number; high: number; low: number; close: number };
}

export async function fetchKiteQuote(
  credentials: KiteCredentials,
  symbols: string[]
): Promise<Record<string, KiteQuoteRow>> {
  if (symbols.length === 0) return {};
  const url =
    `${KITE_BASE}/quote?i=` +
    symbols.map((s) => `NSE:${encodeURIComponent(s)}`).join("&i=");
  let res: Response;
  try {
    res = await fetch(url, {
      headers: kiteHeaders(credentials),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch (e) {
    logServerWarn(
      "fetchKiteQuote",
      e instanceof Error ? e.message : "Network error"
    );
    throw new Error(`Kite quote network error`);
  }
  if (!res.ok) {
    logServerWarn("fetchKiteQuote", `HTTP ${res.status}`);
    throw new Error(`Kite quote HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: Record<string, KiteRawQuote> };
  const out: Record<string, KiteQuoteRow> = {};
  for (const s of symbols) {
    const q = json?.data?.[`NSE:${s}`];
    if (!q) continue;
    const lastPrice = typeof q.last_price === "number" ? q.last_price : 0;
    let changePct = 0;
    if (typeof q.net_change === "number") {
      changePct = q.net_change;
    } else if (q.ohlc?.close && q.ohlc.close > 0) {
      changePct = ((lastPrice - q.ohlc.close) / q.ohlc.close) * 100;
    } else if (lastPrice > 0 && q.ohlc?.close) {
      changePct = ((lastPrice - q.ohlc.close) / lastPrice) * 100;
    }
    out[s] = {
      lastPrice,
      changePct,
      volume: typeof q.volume === "number" ? q.volume : 0,
      ohlc: q.ohlc ?? { open: 0, high: 0, low: 0, close: 0 },
    };
  }
  return out;
}

interface KiteRawQuote {
  last_price?: number;
  net_change?: number;
  ohlc?: { open: number; high: number; low: number; close: number };
  volume?: number;
}

interface InstrumentCacheEntry {
  token: number;
  name: string;
  segment: string;
  exchange: string;
  lastPrice: number;
}

const INSTRUMENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let instrumentCache: {
  fetchedAt: number;
  fetchedFor: string | null;
  map: Map<string, InstrumentCacheEntry>;
} = {
  fetchedAt: 0,
  fetchedFor: null,
  map: new Map(),
};

let instrumentPromise: Promise<Map<string, InstrumentCacheEntry>> | null = null;

export async function fetchKiteInstruments(
  credentials: KiteCredentials
): Promise<Map<string, InstrumentCacheEntry>> {
  const now = Date.now();
  const cacheKey = `${credentials.apiKey}:${credentials.accessToken}`;
  if (
    instrumentCache.fetchedAt > 0 &&
    instrumentCache.fetchedFor === cacheKey &&
    now - instrumentCache.fetchedAt < INSTRUMENT_CACHE_TTL_MS &&
    instrumentCache.map.size > 0
  ) {
    return instrumentCache.map;
  }
  if (instrumentPromise) {
    return instrumentPromise;
  }
  instrumentPromise = (async () => {
    let res: Response;
    try {
      res = await fetch(`${KITE_BASE}/instruments`, {
        headers: kiteHeaders(credentials),
        signal: AbortSignal.timeout(30000),
        cache: "no-store",
      });
    } catch (e) {
      logServerWarn(
        "fetchKiteInstruments",
        e instanceof Error ? e.message : "Network error"
      );
      instrumentPromise = null;
      return new Map();
    }
    if (!res.ok) {
      logServerWarn("fetchKiteInstruments", `HTTP ${res.status}`);
      instrumentPromise = null;
      return new Map();
    }
    const text = await res.text();
    const map = parseNseInstrumentsCsv(text);
    instrumentCache = {
      fetchedAt: Date.now(),
      fetchedFor: cacheKey,
      map,
    };
    instrumentPromise = null;
    logServerWarn(
      "fetchKiteInstruments",
      `Loaded ${map.size} NSE EQ instruments`
    );
    return map;
  })();
  return instrumentPromise;
}

export function parseNseInstrumentsCsv(text: string): Map<string, InstrumentCacheEntry> {
  const out = new Map<string, InstrumentCacheEntry>();
  const lines = text.split(/\r?\n/);
  let header = false;
  for (const line of lines) {
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 12) continue;
    if (!header) {
      header = parts[0].trim().toLowerCase().startsWith("instrument_token");
      if (header) continue;
    }
    const instrumentToken = parseInt(parts[0], 10);
    const tradingsymbol = parts[2]?.trim();
    const segment = parts[10]?.trim();
    const exchange = parts[11]?.trim();
    const instrumentType = parts[9]?.trim();
    const lastPrice = parseFloat(parts[4]);
    const name = parts[3]?.trim() ?? "";
    if (!tradingsymbol || !Number.isFinite(instrumentToken)) continue;
    if (exchange !== "NSE") continue;
    if (segment !== "NSE") continue;
    if (instrumentType !== "EQ") continue;
    const existing = out.get(tradingsymbol);
    if (!existing) {
      out.set(tradingsymbol, {
        token: instrumentToken,
        name,
        segment,
        exchange,
        lastPrice: Number.isFinite(lastPrice) ? lastPrice : 0,
      });
    }
  }
  return out;
}

export async function getNseInstrumentToken(
  credentials: KiteCredentials,
  tradingsymbol: string
): Promise<number | null> {
  const map = await fetchKiteInstruments(credentials);
  const e = map.get(tradingsymbol.toUpperCase());
  return e ? e.token : null;
}

export function _resetKiteInstrumentCache(): void {
  instrumentCache = {
    fetchedAt: 0,
    fetchedFor: null,
    map: new Map(),
  };
  instrumentPromise = null;
}
