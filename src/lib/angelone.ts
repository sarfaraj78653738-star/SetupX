import type { BrokerCandle, BrokerQuote, BrokerCredentials, BrokerProfileUser } from "./broker-types";
import { normalizeBrokerDate } from "./broker-types";
import { createHmac } from "crypto";

const ANGEL_BASE = "https://apiconnect.angelone.in";
const ANGEL_HISTORICAL_BASE = "https://angelone.in/api";

function logWarn(scope: string, message: string): void {
  if (typeof console !== "undefined") {
    console.warn(`[bsr:angelone] ${scope} — ${message}`);
  }
}

// --- TOTP (RFC 6238) generation from the user's TOTP secret ----------------
// Angel One's login API needs a fresh 6-digit code every 30 seconds. Instead
// of asking the user to type that in each time, we generate it ourselves
// from their TOTP secret (the same value they'd have entered into an
// authenticator app like Google Authenticator when they set up API access).
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secret: string, stepSeconds = 30, digits = 6): string {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / stepSeconds);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binCode % 10 ** digits).toString().padStart(digits, "0");
}

// --- Rate limiting for Angel One --------------------------------------------
// Angel One's published limit is a strict 1 request/second/client for most
// endpoints (LTP, historical, profile). Unlike most APIs, they signal a
// rate-limit hit with HTTP 403 + the message "Access denied because of
// exceeding access rate" — NOT 429 — so we specifically check for that
// phrase before deciding to back off and retry (a genuine 403 auth failure
// should fail immediately, not be retried).
let lastAngelCallAt = 0;
const ANGEL_MIN_GAP_MS = 1100; // stay safely under 1 req/sec

async function angelRateLimitWait(): Promise<void> {
  const now = Date.now();
  const wait = lastAngelCallAt + ANGEL_MIN_GAP_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAngelCallAt = Date.now();
}

async function angelFetch(url: string, init: RequestInit, label: string, retries = 2): Promise<Response> {
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await angelRateLimitWait();
    const res = await fetch(url, init);
    let isRateLimited = res.status === 429;
    if (!isRateLimited && res.status === 403) {
      try {
        const bodyText = await res.clone().text();
        isRateLimited = /exceeding access rate/i.test(bodyText);
      } catch {
        /* ignore */
      }
    }
    if (!isRateLimited) return res;
    lastRes = res;
    const waitMs = Math.round(700 * Math.pow(2, attempt) + Math.random() * 200);
    logWarn("angelFetch", `Rate-limited on ${label} (attempt ${attempt + 1}/${retries + 1}), backing off ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return lastRes as Response;
}

// --- Login (raw) -------------------------------------------------------------
export async function angelLogin(
  apiKey: string,
  clientCode: string,
  password: string,
  totp: string
): Promise<{ status: "ok" | "invalid"; jwtToken?: string; refreshToken?: string; error?: string }> {
  try {
    const res = await angelFetch(
      `${ANGEL_BASE}/rest/auth/angelbroking/user/v1/loginByPassword`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-UserType": "USER",
          "X-SourceID": "WEB",
          "X-ClientLocalIP": "127.0.0.1",
          "X-ClientPublicIP": "127.0.0.1",
          "X-MACAddress": "00:00:00:00:00:00",
          "X-PrivateKey": apiKey,
        },
        body: JSON.stringify({ clientcode: clientCode, password, totp }),
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      },
      "login"
    );
    const json = await res.json();
    if (json?.status === true && json?.data?.jwtToken) {
      return {
        status: "ok",
        jwtToken: json.data.jwtToken,
        refreshToken: json.data.refreshToken,
      };
    }
    return { status: "invalid", error: json?.message ?? json?.error ?? "Angel One login failed" };
  } catch (e) {
    return { status: "invalid", error: e instanceof Error ? e.message : "Network error" };
  }
}

// --- Automatic session management -------------------------------------------
// Instead of the user pasting a JWT token that expires and needs manual
// refreshing, we hold a short-lived in-memory session per client code and
// transparently re-login (generating a fresh TOTP code ourselves) whenever
// it's missing or stale. This is scoped well under Angel One's own session
// validity ("active till 12 midnight") to stay safe.
interface AngelSession {
  jwtToken: string;
  refreshToken: string;
  fetchedAt: number;
}
const angelSessionCache = new Map<string, AngelSession>();
const ANGEL_SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function getAngelSession(
  credentials: BrokerCredentials
): Promise<{ status: "ok" | "invalid"; jwtToken?: string; error?: string }> {
  const a = credentials.angelone;
  if (!a?.apiKey || !a?.clientCode || !a?.mpin || !a?.totpSecret) {
    return { status: "invalid", error: "Missing Angel One credentials (API key, client code, MPIN, or TOTP secret)" };
  }
  const cacheKey = `${a.clientCode}:${a.apiKey}`;
  const cached = angelSessionCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < ANGEL_SESSION_TTL_MS) {
    return { status: "ok", jwtToken: cached.jwtToken };
  }
  let totp: string;
  try {
    totp = generateTotp(a.totpSecret);
    // TEMP DIAGNOSTIC — remove once the login issue is confirmed fixed.
    // Compare this against what a real authenticator app (e.g. Google
    // Authenticator, once you've added the same TOTP secret to it) shows at
    // the exact same moment — if they don't match, our generation has a bug;
    // if they DO match but Angel One still rejects it, the secret itself
    // (or client code / MPIN) is likely wrong on Angel One's side.
    logWarn("getAngelSession", `generated TOTP=${totp} at ${new Date().toISOString()} for clientCode=${a.clientCode}`);
  } catch {
    return { status: "invalid", error: "Invalid TOTP secret — check it was copied correctly from Angel One" };
  }
  const login = await angelLogin(a.apiKey, a.clientCode, a.mpin, totp);
  if (login.status !== "ok" || !login.jwtToken) {
    return { status: "invalid", error: login.error ?? "Angel One login failed" };
  }
  angelSessionCache.set(cacheKey, {
    jwtToken: login.jwtToken,
    refreshToken: login.refreshToken ?? "",
    fetchedAt: Date.now(),
  });
  return { status: "ok", jwtToken: login.jwtToken };
}

async function angelHeaders(credentials: BrokerCredentials): Promise<{ headers: Record<string, string>; error?: string } | null> {
  const session = await getAngelSession(credentials);
  if (session.status !== "ok" || !session.jwtToken) {
    logWarn("angelHeaders", session.error ?? "no session");
    return null;
  }
  const a = credentials.angelone;
  return {
    headers: {
      Authorization: `Bearer ${session.jwtToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientLocalIP": "127.0.0.1",
      "X-ClientPublicIP": "127.0.0.1",
      "X-MACAddress": "00:00:00:00:00:00",
      "X-PrivateKey": a?.apiKey ?? "",
    },
  };
}

export async function angelProfile(
  credentials: BrokerCredentials
): Promise<{ status: "ok" | "invalid"; user?: BrokerProfileUser; error?: string }> {
  const a = credentials.angelone;
  if (!a?.apiKey || !a?.clientCode || !a?.mpin || !a?.totpSecret) {
    return { status: "invalid", error: "Missing Angel One credentials" };
  }
  const h = await angelHeaders(credentials);
  if (!h) {
    const session = await getAngelSession(credentials);
    return { status: "invalid", error: session.error ?? "Could not establish Angel One session" };
  }
  try {
    const res = await angelFetch(
      `${ANGEL_BASE}/rest/secure/angelbroking/user/v1/getprofile`,
      { method: "GET", headers: h.headers, signal: AbortSignal.timeout(8000), cache: "no-store" },
      "profile"
    );
    if (!res.ok) {
      const text = await res.text();
      return { status: "invalid", error: `HTTP ${res.status} — ${text.slice(0, 200)}` };
    }
    const json = await res.json();
    if (json?.status === true || json?.data?.clientcode) {
      const data = json.data ?? json;
      return {
        status: "ok",
        user: {
          user_id: data.clientcode ?? a.clientCode,
          user_name: data.name ?? data.clientcode ?? a.clientCode,
          email: data.email ?? "",
        },
      };
    }
    return { status: "invalid", error: json?.message ?? "Angel One profile fetch failed" };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Network error";
    logWarn("angelProfile", err);
    return { status: "invalid", error: err };
  }
}

export const ANGEL_INTERVAL_MAP: Record<string, string> = {
  minute: "ONE_MINUTE",
  "3minute": "THREE_MINUTE",
  "5minute": "FIVE_MINUTE",
  "10minute": "TEN_MINUTE",
  "15minute": "FIFTEEN_MINUTE",
  "30minute": "THIRTY_MINUTE",
  "60minute": "ONE_HOUR",
  day: "ONE_DAY",
  week: "ONE_WEEK",
};

export const ANGEL_EXCHANGE_MAP: Record<string, string> = {
  NSE: "NSE",
  BSE: "BSE",
  NFO: "NFO",
};

function getAngelSymbolToken(symbol: string): string {
  const map: Record<string, string> = {
    RELIANCE: "2885", TCS: "11536", HDFCBANK: "341249", INFY: "1594",
    ICICIBANK: "4963", HINDUNILVR: "1394", ITC: "1660", SBIN: "3045",
    BHARTIARTL: "16675", KOTAKBANK: "4928", LT: "11491", AXISBANK: "5900",
    ASIANPAINT: "6051", MARUTI: "8770", SUNPHARMA: "8616",
    BAJFINANCE: "15131", HCLTECH: "7229", WIPRO: "3787",
    ULTRACEMCO: "11511", TITAN: "11723", NESTLEIND: "14307",
    POWERGRID: "10447", NTPC: "9606", M__amp__M: "2031",
    TATAMOTORS: "3456", TATASTEEL: "3499", ADANIENT: "21993",
    ADANIPORTS: "10655", JSWSTEEL: "11703", HINDALCO: "1353",
    COALINDIA: "10103", ONGC: "2475", BPCL: "1348", IOC: "8765",
    GRASIM: "6643", DRREDDY: "11133", CIPLA: "10029",
    DIVISLAB: "12241", APOLLOHOSP: "2816", BRITANNIA: "1313",
    EICHERMOT: "11867", HEROMOTOCO: "1403", BAJAJFINSV: "22155",
    INDUSINDBK: "8364", SBILIFE: "15341", HDFCLIFE: "133248",
    TECHM: "10798", SHRIRAMFIN: "3380", LTIM: "11493",
    TATACONSUM: "3453", BANKINDIA: "22965", PNB: "11921",
    CANBK: "3070", IDFCFIRSTB: "13152", FEDERALBNK: "10614",
    BANKBARODA: "4851", DLF: "10636", GAIL: "1785", VEDL: "3461",
    ZOMATO: "18207", PAYTM: "51295", NYKAA: "59567",
    IRCTC: "42982", LICI: "55571", PIDILITIND: "10147",
    DABUR: "950", GODREJCP: "986", MARICO: "6760",
    COLPAL: "10692", HAVELLS: "1629", VOLTAS: "3577",
    LUPIN: "11442", TORNTPHARM: "13709", AUROPHARMA: "11784",
    BIOCON: "12437", PEL: "10127", CHOLAFIN: "235",
    MUTHOOTFIN: "4076", RECLTD: "13634", PFC: "14358",
    LICHSGFIN: "5632", HDFCAMC: "133244", ICICIPRULI: "12330",
    ICICIGI: "12332", BERGEPAINT: "10669", SIEMENS: "3201",
    ABB: "52", CUMMINSIND: "915", HAL: "65735", BEL: "16",
    BHEL: "1901", SAIL: "11463", NMDC: "9525",
    JINDALSTEL: "4965", HINDPETRO: "1393", PETRONET: "13938",
    TATAPOWER: "3455", ADANIGREEN: "21994", ADANIPOWER: "21992",
    JSWENERGY: "11702", IGL: "14971", MGL: "2527",
    DMART: "23304", TRENT: "3183", JINDWORLD: "2676",
    PAGEIND: "10326", JIOFIN: "143138",
  };
  return map[symbol.toUpperCase()] ?? symbol;
}

export async function fetchAngelHistorical(
  credentials: BrokerCredentials,
  symbol: string,
  interval: string = "day",
  days: number = 180
): Promise<BrokerCandle[]> {
  const h = await angelHeaders(credentials);
  if (!h) return [];

  const angelInterval = ANGEL_INTERVAL_MAP[interval] ?? "ONE_DAY";
  const token = getAngelSymbolToken(symbol);
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);

  const params = new URLSearchParams({
    exchange: "NSE",
    symboltoken: token,
    interval: angelInterval,
    fromdate: from.toISOString().slice(0, 10) + " 09:15",
    todate: to.toISOString().slice(0, 10) + " 15:30",
  });

  try {
    const res = await angelFetch(
      `${ANGEL_HISTORICAL_BASE}/rest/secure/angelbroking/historical/v1.0?${params.toString()}`,
      { method: "GET", headers: h.headers, signal: AbortSignal.timeout(15000), cache: "no-store" },
      "historical"
    );
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return [];
      throw new Error(`Angel historical HTTP ${res.status}`);
    }
    const json = await res.json();
    const candles = Array.isArray(json?.data) ? json.data : [];
    const out: BrokerCandle[] = [];
    for (const raw of candles) {
      const date = raw?.timestamp;
      const open = parseFloat(raw?.open);
      const high = parseFloat(raw?.high);
      const low = parseFloat(raw?.low);
      const close = parseFloat(raw?.close);
      const volume = parseInt(raw?.volume, 10) || 0;
      if (!date || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue;
      out.push({ date: normalizeBrokerDate(date), open, high, low, close, volume });
    }
    return out;
  } catch (e) {
    logWarn("fetchAngelHistorical", e instanceof Error ? e.message : "Network error");
    return [];
  }
}

export async function fetchAngelQuote(
  credentials: BrokerCredentials,
  symbols: string[]
): Promise<Record<string, BrokerQuote>> {
  if (symbols.length === 0) return {};
  const h = await angelHeaders(credentials);
  if (!h) return {};

  const results: Record<string, BrokerQuote> = {};
  try {
    const res = await angelFetch(
      `${ANGEL_BASE}/rest/secure/angelbroking/quote/v1.0/`,
      {
        method: "POST",
        headers: h.headers,
        body: JSON.stringify({
          mode: "FULL",
          exchangeTokens: { NSE: symbols.map((s) => getAngelSymbolToken(s)) },
        }),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      },
      "quote"
    );
    if (!res.ok) throw new Error(`Angel quote HTTP ${res.status}`);
    const json = await res.json();
    if (json?.data?.fetched) {
      for (const q of json.data.fetched) {
        const sym = q?.tradingSymbol ?? "";
        const s = sym.replace(/-EQ$/i, "");
        if (!s) continue;
        const lastPrice = typeof q?.ltp === "number" ? q.ltp : 0;
        const prevClose = typeof q?.close === "number" ? q.close : 0;
        const changePct = prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
        results[s] = {
          lastPrice,
          changePct,
          volume: typeof q?.volume === "number" ? q.volume : 0,
          ohlc: {
            open: typeof q?.open === "number" ? q.open : 0,
            high: typeof q?.high === "number" ? q.high : 0,
            low: typeof q?.low === "number" ? q.low : 0,
            close: prevClose,
          },
        };
      }
    }
    return results;
  } catch (e) {
    logWarn("fetchAngelQuote", e instanceof Error ? e.message : "Network error");
    return {};
  }
}

let angelInstrumentCache: { fetchedAt: number; map: Map<string, { token: string; name: string }> } = {
  fetchedAt: 0,
  map: new Map(),
};

export async function fetchAngelInstruments(
  _credentials: BrokerCredentials
): Promise<Map<string, { token: string; name: string }>> {
  const now = Date.now();
  if (angelInstrumentCache.fetchedAt > 0 && now - angelInstrumentCache.fetchedAt < 24 * 60 * 60 * 1000 && angelInstrumentCache.map.size > 0) {
    return angelInstrumentCache.map;
  }
  const out = new Map<string, { token: string; name: string }>();
  try {
    const scripMapUrl = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";
    const res = await fetch(scripMapUrl, { signal: AbortSignal.timeout(30000), cache: "no-store" });
    if (!res.ok) return out;
    const data = await res.json();
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item?.exch_seg === "NSE" && item?.symbol?.endsWith("-EQ")) {
          const sym = item.symbol.replace(/-EQ$/i, "");
          out.set(sym, { token: item.token ?? "", name: item.name ?? "" });
        }
      }
    }
    angelInstrumentCache = { fetchedAt: Date.now(), map: out };
    return out;
  } catch (e) {
    logWarn("fetchAngelInstruments", e instanceof Error ? e.message : "Network error");
    return new Map();
  }
}

export async function getAngelInstrumentToken(
  credentials: BrokerCredentials,
  symbol: string
): Promise<string | null> {
  const entry = angelInstrumentCache.map.get(symbol.toUpperCase());
  if (entry) return entry.token;
  const map = await fetchAngelInstruments(credentials);
  const e = map.get(symbol.toUpperCase());
  return e ? e.token : getAngelSymbolToken(symbol);
}
