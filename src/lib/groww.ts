import type { BrokerCandle, BrokerQuote, BrokerCredentials, BrokerProfileUser } from "./broker-types";
import { normalizeBrokerDate } from "./broker-types";

const GROWW_BASE = "https://api.groww.in";

function logWarn(scope: string, message: string): void {
  if (typeof console !== "undefined") {
    console.warn(`[bsr:groww] ${scope} — ${message}`);
  }
}

export async function growwProfile(
  credentials: BrokerCredentials
): Promise<{ status: "ok" | "invalid"; user?: BrokerProfileUser; error?: string }> {
  const token = credentials.groww?.accessToken;
  if (!token) return { status: "invalid", error: "Missing Groww access token" };

  try {
    const res = await fetch(`${GROWW_BASE}/api/v1/users/profile`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      return { status: "invalid", error: `HTTP ${res.status} — ${text.slice(0, 200)}` };
    }
    const json = await res.json();
    if (json?.userId || json?.email) {
      return {
        status: "ok",
        user: {
          user_id: json.userId ?? json.email ?? "groww_user",
          user_name: json.name ?? json.email ?? "Groww User",
          email: json.email ?? "",
        },
      };
    }
    return { status: "invalid", error: json?.message ?? "Groww profile fetch failed" };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Network error";
    logWarn("growwProfile", err);
    return { status: "invalid", error: err };
  }
}

export const GROWW_INTERVAL_MAP: Record<string, string> = {
  "5minute": "FIVE_MINUTE",
  "15minute": "FIFTEEN_MINUTE",
  "30minute": "THIRTY_MINUTE",
  day: "ONE_DAY",
};

export async function fetchGrowwHistorical(
  credentials: BrokerCredentials,
  symbol: string,
  interval: string = "day",
  days: number = 180
): Promise<BrokerCandle[]> {
  const token = credentials.groww?.accessToken;
  if (!token) return [];

  const growwInterval = GROWW_INTERVAL_MAP[interval] ?? "ONE_DAY";
  const to = Date.now();
  const from = to - days * 24 * 60 * 60 * 1000;

  try {
    const exchange = "NSE";
    const url = `${GROWW_BASE}/v3/stocks/${exchange}/${symbol}/historical?interval=${growwInterval}&start=${from}&end=${to}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = await res.json();
    const candles = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    const out: BrokerCandle[] = [];
    for (const raw of candles) {
      const date = raw?.date ?? raw?.timestamp ?? raw?.time;
      const open = parseFloat(raw?.open);
      const high = parseFloat(raw?.high);
      const low = parseFloat(raw?.low);
      const close = parseFloat(raw?.close);
      const volume = parseInt(raw?.volume ?? raw?.vol, 10) || 0;
      if (!date || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue;
      out.push({ date: normalizeBrokerDate(date), open, high, low, close, volume });
    }
    return out;
  } catch (e) {
    logWarn("fetchGrowwHistorical", e instanceof Error ? e.message : "Network error");
    return [];
  }
}

export async function fetchGrowwQuote(
  credentials: BrokerCredentials,
  symbols: string[]
): Promise<Record<string, BrokerQuote>> {
  if (symbols.length === 0) return {};
  const token = credentials.groww?.accessToken;
  if (!token) return {};

  const results: Record<string, BrokerQuote> = {};
  try {
    const promises = symbols.map(async (sym) => {
      try {
        const res = await fetch(`${GROWW_BASE}/api/v1/stocks/${sym}/detail`, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(5000),
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        const lastPrice = typeof json?.ltp === "number" ? json.ltp : typeof json?.price === "number" ? json.price : 0;
        const prevClose = typeof json?.prevClose === "number" ? json.prevClose : 0;
        const changePct = prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
        results[sym] = {
          lastPrice,
          changePct,
          volume: typeof json?.volume === "number" ? json.volume : 0,
          ohlc: {
            open: typeof json?.open === "number" ? json.open : 0,
            high: typeof json?.dayHigh === "number" ? json.dayHigh : typeof json?.high === "number" ? json.high : 0,
            low: typeof json?.dayLow === "number" ? json.dayLow : typeof json?.low === "number" ? json.low : 0,
            close: prevClose,
          },
        };
      } catch {}
    });
    await Promise.all(promises);
    return results;
  } catch (e) {
    logWarn("fetchGrowwQuote", e instanceof Error ? e.message : "Network error");
    return {};
  }
}

let growwInstrumentCache: { fetchedAt: number; map: Map<string, { token: string; name: string }> } = {
  fetchedAt: 0,
  map: new Map(),
};

export async function fetchGrowwInstruments(
  _credentials: BrokerCredentials
): Promise<Map<string, { token: string; name: string }>> {
  const now = Date.now();
  if (growwInstrumentCache.fetchedAt > 0 && now - growwInstrumentCache.fetchedAt < 24 * 60 * 60 * 1000 && growwInstrumentCache.map.size > 0) {
    return growwInstrumentCache.map;
  }
  const out = new Map<string, { token: string; name: string }>();
  try {
    const res = await fetch(`${GROWW_BASE}/api/v1/stocks?page=1&size=2000`, {
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
    if (!res.ok) return out;
    const json = await res.json();
    const stocks = Array.isArray(json?.stocks) ? json.stocks : Array.isArray(json) ? json : [];
    for (const stock of stocks) {
      const sym = (stock?.symbol ?? stock?.ticker ?? "").toUpperCase();
      if (!sym) continue;
      out.set(sym, { token: stock?.id ?? sym, name: stock?.name ?? stock?.companyName ?? "" });
    }
    growwInstrumentCache = { fetchedAt: Date.now(), map: out };
    return out;
  } catch (e) {
    logWarn("fetchGrowwInstruments", e instanceof Error ? e.message : "Network error");
    return new Map();
  }
}

export async function getGrowwInstrumentToken(
  credentials: BrokerCredentials,
  symbol: string
): Promise<string | null> {
  const map = await fetchGrowwInstruments(credentials);
  const e = map.get(symbol.toUpperCase());
  return e ? e.token : null;
}
