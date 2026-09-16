import type { BrokerCredentials, BrokerCandle, BrokerQuote, BrokerProfileUser, BrokerType } from "./broker-types";
import {
  kiteProfile,
  fetchKiteHistorical,
  fetchKiteQuote,
  getNseInstrumentToken,
  fetchKiteInstruments,
} from "./kite";
import {
  fyersProfile,
  fetchFyersHistorical,
  fetchFyersQuote,
  getFyersInstrumentToken,
  fetchFyersInstruments,
} from "./fyers";
import {
  angelProfile,
  fetchAngelHistorical,
  fetchAngelQuote,
  getAngelInstrumentToken,
  fetchAngelInstruments,
} from "./angelone";
import {
  growwProfile,
  fetchGrowwHistorical,
  fetchGrowwQuote,
  getGrowwInstrumentToken,
  fetchGrowwInstruments,
} from "./groww";
import type { KiteInterval } from "./kite";

export type { BrokerCredentials, BrokerCandle, BrokerQuote, BrokerProfileUser, BrokerType };

export function getBrokerCredentialsFromHeaders(
  headers: Headers
): { creds: BrokerCredentials | null; error: Response | null } {
  const b = headers.get("x-broker-type") || "";
  const isKite = !b || b === "kite";

  if (isKite) {
    const k = headers.get("x-kite-api-key");
    const t = headers.get("x-kite-access-token");
    if (!k || !t) return { creds: null, error: null };
    return {
      creds: { broker: "kite", kite: { apiKey: k, accessToken: t } },
      error: null,
    };
  }

  if (b === "fyers") {
    const t = headers.get("x-fyers-access-token");
    const a = headers.get("x-fyers-app-id");
    const s = headers.get("x-fyers-secret-key");
    if (!t) return { creds: null, error: null };
    return {
      creds: { broker: "fyers", fyers: { appId: a ?? "", secretKey: s ?? "", accessToken: t } },
      error: null,
    };
  }

  if (b === "angelone") {
    const m = headers.get("x-angel-mpin");
    const c = headers.get("x-angel-client-code");
    const k = headers.get("x-angel-api-key");
    const ts = headers.get("x-angel-totp-secret");
    if (!m || !c || !k || !ts) return { creds: null, error: null };
    return {
      creds: { broker: "angelone", angelone: { apiKey: k, clientCode: c, mpin: m, totpSecret: ts } },
      error: null,
    };
  }

  if (b === "groww") {
    const t = headers.get("x-groww-access-token");
    const k = headers.get("x-groww-api-key");
    if (!t) return { creds: null, error: null };
    return {
      creds: { broker: "groww", groww: { apiKey: k ?? "", accessToken: t } },
      error: null,
    };
  }

  return { creds: null, error: null };
}

export function getBrokerAuthHeaders(creds: BrokerCredentials): Record<string, string> {
  const headers: Record<string, string> = { "x-broker-type": creds.broker };
  if (creds.kite) {
    headers["x-kite-api-key"] = creds.kite.apiKey;
    headers["x-kite-access-token"] = creds.kite.accessToken;
  } else if (creds.fyers) {
    headers["x-fyers-access-token"] = creds.fyers.accessToken;
    headers["x-fyers-app-id"] = creds.fyers.appId;
  } else if (creds.angelone) {
    headers["x-angel-mpin"] = creds.angelone.mpin;
    headers["x-angel-client-code"] = creds.angelone.clientCode;
    headers["x-angel-api-key"] = creds.angelone.apiKey;
    headers["x-angel-totp-secret"] = creds.angelone.totpSecret;
  } else if (creds.groww) {
    headers["x-groww-access-token"] = creds.groww.accessToken;
    headers["x-groww-api-key"] = creds.groww.apiKey;
  }
  return headers;
}

export async function brokerProfile(
  credentials: BrokerCredentials
): Promise<{ status: "ok" | "invalid"; user?: BrokerProfileUser; error?: string }> {
  switch (credentials.broker) {
    case "kite":
      return kiteProfile(credentials.kite!);
    case "fyers":
      return fyersProfile(credentials);
    case "angelone":
      return angelProfile(credentials);
    case "groww":
      return growwProfile(credentials);
    default:
      return { status: "invalid", error: `Unknown broker: ${credentials.broker}` };
  }
}

export async function brokerFetchHistorical(
  credentials: BrokerCredentials,
  symbol: string,
  interval: string = "day",
  days: number = 180,
  resolvedToken?: string | null
): Promise<BrokerCandle[]> {
  switch (credentials.broker) {
    case "kite": {
      const token =
        resolvedToken ??
        (await getNseInstrumentToken(credentials.kite!, symbol).then((t) =>
          t != null ? String(t) : null
        ));
      if (!token) return [];
      return fetchKiteHistorical(credentials.kite!, Number(token), interval as KiteInterval, days);
    }
    case "fyers":
      return fetchFyersHistorical(credentials, symbol, interval, days);
    case "angelone":
      return fetchAngelHistorical(credentials, symbol, interval, days);
    case "groww":
      return fetchGrowwHistorical(credentials, symbol, interval, days);
    default:
      return [];
  }
}

export async function brokerFetchQuote(
  credentials: BrokerCredentials,
  symbols: string[]
): Promise<Record<string, BrokerQuote>> {
  switch (credentials.broker) {
    case "kite":
      return fetchKiteQuote(credentials.kite!, symbols);
    case "fyers":
      return fetchFyersQuote(credentials, symbols);
    case "angelone":
      return fetchAngelQuote(credentials, symbols);
    case "groww":
      return fetchGrowwQuote(credentials, symbols);
    default:
      return {};
  }
}

export async function brokerFetchInstruments(
  credentials: BrokerCredentials
): Promise<Map<string, { token: string; name: string }>> {
  switch (credentials.broker) {
    case "kite": {
      const map = await fetchKiteInstruments(credentials.kite!);
      const out = new Map<string, { token: string; name: string }>();
      for (const [k, v] of map) out.set(k, { token: String(v.token), name: v.name });
      return out;
    }
    case "fyers":
      return fetchFyersInstruments(credentials);
    case "angelone":
      return fetchAngelInstruments(credentials);
    case "groww":
      return fetchGrowwInstruments(credentials);
    default:
      return new Map();
  }
}

export async function brokerGetInstrumentToken(
  credentials: BrokerCredentials,
  symbol: string
): Promise<string | null> {
  switch (credentials.broker) {
    case "kite": {
      const token = await getNseInstrumentToken(credentials.kite!, symbol);
      return token ? String(token) : null;
    }
    case "fyers":
      return getFyersInstrumentToken(credentials, symbol);
    case "angelone":
      return getAngelInstrumentToken(credentials, symbol);
    case "groww":
      return getGrowwInstrumentToken(credentials, symbol);
    default:
      return null;
  }
}

export function brokerRequiresToken(broker: BrokerType): boolean {
  return broker === "kite";
}

export function getBrokerDisplayName(broker: BrokerType): string {
  switch (broker) {
    case "kite": return "Zerodha Kite";
    case "fyers": return "Fyers";
    case "angelone": return "Angel One";
    case "groww": return "Groww";
    default: return broker;
  }
}

export function getBrokerLabel(broker: BrokerType): string {
  switch (broker) {
    case "kite": return "Zerodha Kite";
    case "fyers": return "Fyers";
    case "angelone": return "Angel One SmartAPI";
    case "groww": return "Groww";
    default: return broker;
  }
}
