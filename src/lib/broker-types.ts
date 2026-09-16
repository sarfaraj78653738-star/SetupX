export interface BrokerCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BrokerQuote {
  lastPrice: number;
  changePct: number;
  volume: number;
  ohlc: { open: number; high: number; low: number; close: number };
}

export interface BrokerProfileUser {
  user_id: string;
  user_name: string;
  email: string;
}

export type BrokerType = "kite" | "fyers" | "angelone" | "groww";

export interface BrokerCredentials {
  broker: BrokerType;
  kite?: { apiKey: string; accessToken: string };
  fyers?: { appId: string; secretKey: string; accessToken: string };
  angelone?: { apiKey: string; clientCode: string; mpin: string; totpSecret: string };
  groww?: { apiKey: string; accessToken: string };
}

export interface BrokerConnector {
  type: BrokerType;
  profile(credentials: BrokerCredentials): Promise<{ status: "ok" | "invalid"; user?: BrokerProfileUser; error?: string }>;
  fetchHistorical(credentials: BrokerCredentials, symbol: string, interval: string, days: number): Promise<BrokerCandle[]>;
  fetchQuote(credentials: BrokerCredentials, symbols: string[]): Promise<Record<string, BrokerQuote>>;
  getInstrumentToken(credentials: BrokerCredentials, symbol: string): Promise<string | null>;
  fetchInstruments(credentials: BrokerCredentials): Promise<Map<string, { token: string; name: string }>>;
}

export function normalizeBrokerDate(raw: string): string {
  if (raw.endsWith("Z") || raw.includes("Z")) return raw;
  return raw.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
}
