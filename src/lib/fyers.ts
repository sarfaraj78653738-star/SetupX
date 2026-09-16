import type { BrokerCandle, BrokerQuote, BrokerCredentials, BrokerProfileUser } from "./broker-types";
import { createHash } from "crypto";

const FYERS_BASE = "https://api-t1.fyers.in/api/v3";
const FYERS_DATA_BASE = "https://api-t1.fyers.in/data";

function fyersHeaders(creds: BrokerCredentials): Record<string, string> {
  // Fyers does NOT use the standard "Bearer <token>" scheme. It requires the
  // App ID and access token joined with a colon, with no scheme prefix at
  // all: "Authorization: <appId>:<accessToken>". Sending "Bearer <token>"
  // causes Fyers to reject the request with a 500 "Invalid Request, please
  // provide valid method" error.
  const appId = creds.fyers?.appId ?? "";
  const accessToken = creds.fyers?.accessToken ?? "";
  return {
    Authorization: appId ? `${appId}:${accessToken}` : accessToken,
    "Content-Type": "application/json",
    version: "3",
  };
}

function logWarn(scope: string, message: string): void {
  if (typeof console !== "undefined") {
    console.warn(`[bsr:fyers] ${scope} — ${message}`);
  }
}

// --- Shared rate limiting for ALL outgoing Fyers calls ---------------------
// Fyers publishes hard limits of 10 requests/second and 200/minute per user.
// A scan that fetches many stocks concurrently can easily produce far more
// simultaneous calls than that (each stock needs 2-4 Fyers calls), which is
// exactly what was causing "HTTP 429" errors and the broker looking
// "disconnected" mid-scan. Every Fyers fetch in this file now goes through
// fyersFetch(), which (a) throttles calls to stay under those limits with
// margin, and (b) if Fyers still returns 429, backs off and retries a couple
// of times instead of failing the request outright.
const MAX_PER_SEC = 7; // stay under Fyers' 10/sec limit with margin
const MAX_PER_MIN = 170; // stay under Fyers' 200/min limit with margin
const callTimestamps: number[] = [];

async function fyersRateLimitWait(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (callTimestamps.length > 0 && now - callTimestamps[0] > 60_000) {
      callTimestamps.shift();
    }
    const inLastSecond = callTimestamps.reduce((n, t) => (now - t < 1000 ? n + 1 : n), 0);
    if (callTimestamps.length < MAX_PER_MIN && inLastSecond < MAX_PER_SEC) {
      callTimestamps.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, 60));
  }
}

async function fyersFetch(url: string, init: RequestInit, label: string, retries = 2): Promise<Response> {
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await fyersRateLimitWait();
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    lastRes = res;
    const waitMs = Math.round(400 * Math.pow(2, attempt) + Math.random() * 200);
    logWarn("fyersFetch", `429 from Fyers on ${label} (attempt ${attempt + 1}/${retries + 1}), backing off ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return lastRes as Response;
}

export async function fyersProfile(
  credentials: BrokerCredentials
): Promise<{ status: "ok" | "invalid"; user?: BrokerProfileUser; error?: string }> {
  const token = credentials.fyers?.accessToken;
  if (!token) return { status: "invalid", error: "Missing Fyers access token" };
  try {
    const res = await fyersFetch(
      `${FYERS_BASE}/profile`,
      {
        headers: fyersHeaders(credentials),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      },
      "profile"
    );
    if (!res.ok) {
      const text = await res.text();
      return { status: "invalid", error: `HTTP ${res.status} — ${text.slice(0, 200)}` };
    }
    const json = await res.json();
    if (json?.s === "ok" && json?.data?.fy_id) {
      return {
        status: "ok",
        user: {
          user_id: json.data.fy_id,
          user_name: json.data.name ?? json.data.fy_id,
          email: json.data.email ?? "",
        },
      };
    }
    return { status: "invalid", error: json?.s === "error" ? (json.code ?? "Fyers auth failed") : "Invalid profile response" };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Network error";
    logWarn("fyersProfile", err);
    return { status: "invalid", error: err };
  }
}

export async function exchangeFyersAuthCode(
  appId: string,
  secretKey: string,
  authCode: string
): Promise<{ status: "ok" | "invalid"; accessToken?: string; error?: string }> {
  if (!appId || !secretKey || !authCode) {
    return { status: "invalid", error: "appId, secretKey and authCode are required" };
  }
  const appIdHash = createHash("sha256").update(`${appId}:${secretKey}`).digest("hex");
  if (appIdHash.length !== 64) {
    logWarn("exchangeFyersAuthCode", `appIdHash length is ${appIdHash.length}, expected 64 (appId must include the -100 suffix)`);
  }
  try {
    const res = await fyersFetch(
      `${FYERS_BASE}/validate-authcode`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "authorization_code", appIdHash, code: authCode }),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      },
      "validate-authcode"
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { status: "invalid", error: `HTTP ${res.status} — ${text.slice(0, 200)}` };
    }
    const json = await res.json();
    if (json?.s === "ok" && json?.access_token) {
      return { status: "ok", accessToken: json.access_token };
    }
    return { status: "invalid", error: json?.message ?? "Fyers rejected the auth code" };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Network error";
    logWarn("exchangeFyersAuthCode", err);
    return { status: "invalid", error: err };
  }
}

export const FYERS_INTERVAL_MAP: Record<string, string> = {
  minute: "1",
  "3minute": "3",
  "5minute": "5",
  "10minute": "10",
  "15minute": "15",
  "30minute": "30",
  "60minute": "60",
  day: "D",
  week: "W",
};

export async function fetchFyersHistorical(
  credentials: BrokerCredentials,
  symbol: string,
  interval: string = "day",
  days: number = 180
): Promise<BrokerCandle[]> {
  const token = credentials.fyers?.accessToken;
  if (!token) return [];

  const fyersInterval = FYERS_INTERVAL_MAP[interval] ?? "D";
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);

  const fyersSymbol = `NSE:${symbol}-EQ`;
  const rangeFrom = from.toISOString().slice(0, 10);
  const rangeTo = to.toISOString().slice(0, 10);

  const params = new URLSearchParams({
    symbol: fyersSymbol,
    resolution: fyersInterval,
    date_format: "1",
    range_from: rangeFrom,
    range_to: rangeTo,
    cont_flag: "1",
  });

  try {
    const res = await fyersFetch(
      `${FYERS_DATA_BASE}/history?${params.toString()}`,
      {
        headers: fyersHeaders(credentials),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      },
      "history"
    );
    const reqLabel = `symbol=${fyersSymbol} resolution=${fyersInterval} range=${rangeFrom}..${rangeTo}`;
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        body = "";
      }
      logWarn("fetchFyersHistorical", `HTTP ${res.status} ${res.statusText} — ${reqLabel} — ${body.slice(0, 300)}`);
      return [];
    }
    const json = await res.json();
    if (json?.s !== "ok") {
      logWarn(
        "fetchFyersHistorical",
        `broker error — ${reqLabel} — s=${json?.s} code=${json?.code ?? "n/a"} message=${json?.message ?? json?.msg ?? "unknown"}`
      );
      return [];
    }
    const candles = Array.isArray(json?.candles) ? json.candles : [];
    if (candles.length === 0) {
      logWarn(
        "fetchFyersHistorical",
        `no candles returned — ${reqLabel} — s=${json?.s} code=${json?.code ?? "n/a"} message=${json?.message ?? json?.msg ?? "empty response"}`
      );
    }
    const out: BrokerCandle[] = [];
    for (const raw of candles) {
      if (!Array.isArray(raw) || raw.length < 6) continue;
      const [ts, open, high, low, close, volume] = raw as [number, number, number, number, number, number];
      if (typeof open !== "number" || typeof high !== "number" || typeof low !== "number" || typeof close !== "number" || typeof volume !== "number") continue;
      out.push({ date: new Date(ts * 1000).toISOString(), open, high, low, close, volume });
    }
    return out;
  } catch (e) {
    logWarn("fetchFyersHistorical", e instanceof Error ? e.message : "Network error");
    return [];
  }
}

export async function fetchFyersQuote(
  credentials: BrokerCredentials,
  symbols: string[]
): Promise<Record<string, BrokerQuote>> {
  if (symbols.length === 0) return {};
  const token = credentials.fyers?.accessToken;
  if (!token) return {};

  const symbolsParam = symbols.map((s) => `NSE:${s}-EQ`).join(",");
  try {
    const res = await fyersFetch(
      `${FYERS_DATA_BASE}/quotes?symbols=${encodeURIComponent(symbolsParam)}`,
      {
        headers: fyersHeaders(credentials),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      },
      "quotes"
    );
    if (!res.ok) throw new Error(`Fyers quote HTTP ${res.status}`);
    const json = await res.json();
    const out: Record<string, BrokerQuote> = {};
    if (json?.s === "ok" && json?.d) {
      const results = Array.isArray(json.d) ? json.d : [json.d];
      for (const q of results) {
        const sym = (q.n ?? q.symbol ?? "").replace(/^NSE:|(-EQ)?$/g, "");
        if (!sym) continue;
        const lastPrice = typeof q.v?.lp === "number" ? q.v.lp : 0;
        const prevClose = typeof q.v?.prev_close_price === "number" ? q.v.prev_close_price : 0;
        const changePct = prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
        out[sym] = {
          lastPrice,
          changePct,
          volume: typeof q.v?.volume === "number" ? q.v.volume : 0,
          ohlc: {
            open: typeof q.v?.open_price === "number" ? q.v.open_price : 0,
            high: typeof q.v?.high_price === "number" ? q.v.high_price : 0,
            low: typeof q.v?.low_price === "number" ? q.v.low_price : 0,
            close: prevClose,
          },
        };
      }
    }
    return out;
  } catch (e) {
    logWarn("fetchFyersQuote", e instanceof Error ? e.message : "Network error");
    return {};
  }
}

let fyersInstrumentCache: { fetchedAt: number; map: Map<string, { token: string; name: string }> } = {
  fetchedAt: 0,
  map: new Map(),
};

export async function fetchFyersInstruments(
  credentials: BrokerCredentials
): Promise<Map<string, { token: string; name: string }>> {
  const now = Date.now();
  if (fyersInstrumentCache.fetchedAt > 0 && now - fyersInstrumentCache.fetchedAt < 24 * 60 * 60 * 1000 && fyersInstrumentCache.map.size > 0) {
    return fyersInstrumentCache.map;
  }
  try {
    const res = await fyersFetch(
      `${FYERS_DATA_BASE}/symbols?symbols=NSE:EQ`,
      {
        headers: fyersHeaders(credentials),
        signal: AbortSignal.timeout(30000),
        cache: "no-store",
      },
      "symbols"
    );
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        body = "";
      }
      logWarn("fetchFyersInstruments", `HTTP ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
      return new Map();
    }
    const json = await res.json();
    if (json?.s !== "ok") {
      logWarn(
        "fetchFyersInstruments",
        `broker error — s=${json?.s} code=${json?.code ?? "n/a"} message=${json?.message ?? json?.msg ?? "unknown"}`
      );
      return new Map();
    }
    const out = new Map<string, { token: string; name: string }>();
    if (Array.isArray(json?.data)) {
      for (const item of json.data) {
        const symbol = (item.symbol ?? "").replace(/^NSE:|(-EQ)?$/g, "");
        if (!symbol) continue;
        out.set(symbol, { token: item.token ?? item.symbol, name: item.name ?? "" });
      }
    }
    fyersInstrumentCache = { fetchedAt: Date.now(), map: out };
    return out;
  } catch (e) {
    logWarn("fetchFyersInstruments", e instanceof Error ? e.message : "Network error");
    return new Map();
  }
}

export async function getFyersInstrumentToken(
  credentials: BrokerCredentials,
  symbol: string
): Promise<string | null> {
  const map = await fetchFyersInstruments(credentials);
  const e = map.get(symbol.toUpperCase());
  return e ? e.token : null;
}
