import { fetchChartData, type Candle } from "./marketData";
import { ema, detectBullishPattern, classicPivot, vwap } from "./technicals";

export type TradeSignal = "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";
export type Trend = "Uptrend" | "Downtrend" | "Sideways";

export interface IntradayIndicator {
  interval: "5m" | "10m" | "15m";
  label: string;
  lastPrice: number;
  change: number;
  changePct: number;
  ema9: number;
  ema15: number;
  ema20: number;
  ema50: number;
  emaCrossBullish: boolean;
  pivot: number;
  pivotAbove: boolean;
  support: number;
  resistance: number;
  pattern: string;
  trend: Trend;
  signal: TradeSignal;
  signalScore: number;
  vwap: number;
  vwapAbove: boolean;
  notes: string[];
}

const INTERVAL_MAP: Record<"5m" | "10m" | "15m", { range: string; interval: string }> = {
  "5m": { range: "1d", interval: "5m" },
  "10m": { range: "5d", interval: "10m" },
  "15m": { range: "5d", interval: "15m" },
};

export async function fetchIntradayIndicators(symbol: string): Promise<IntradayIndicator[]> {
  const out: IntradayIndicator[] = [];
  const results = await Promise.all(
    (Object.keys(INTERVAL_MAP) as Array<"5m" | "10m" | "15m">).map(async (k) => {
      try {
        const cfg = INTERVAL_MAP[k];
        const { candles, quote } = await fetchChartData(symbol, cfg.range, cfg.interval);
        if (!quote || candles.length < 30) return null;
        const ind = computeIntradayIndicator(symbol, k, candles, quote.price, quote.changePercent);
        return ind;
      } catch {
        return null;
      }
    })
  );
  for (const r of results) if (r) out.push(r);
  return out.sort((a, b) => (a.interval < b.interval ? -1 : 1));
}

export function computeIntradayIndicator(
  symbol: string,
  interval: "5m" | "10m" | "15m",
  candles: Candle[],
  price: number,
  changePct: number
): IntradayIndicator | null {
  if (candles.length < 30) return null;
  const closes = candles.map((c) => c.close);
  const n = closes.length;

  const ema9Arr = ema(closes, 9);
  const ema15Arr = ema(closes, 15);
  const ema20Arr = ema(closes, 20);
  const ema50Arr = ema(closes, Math.min(50, n - 5));
  const ema9 = ema9Arr[n - 1];
  const ema15 = ema15Arr[n - 1];
  const ema20 = ema20Arr[n - 1];
  const ema50 = ema50Arr[n - 1];

  const emaCrossUp = ema9Arr[n - 2] <= ema15Arr[n - 2] && ema9 > ema15;
  const emaCrossBullish = emaCrossUp || (ema9 > ema15 && ema9 > ema15Arr[n - 5]);

  const pattern = detectBullishPattern(candles);

  const prev = candles[n - 2];
  const pivotLevels = classicPivot(prev.high, prev.low, prev.close);
  const pivot = pivotLevels.pivot;
  const support = pivotLevels.s1;
  const resistance = pivotLevels.r1;
  const pivotAbove = price > pivot;
  const change = price - closes[n - 2];

  let trend: Trend = "Sideways";
  if (ema9 > ema15 && ema15 > ema20 && price > ema20) trend = "Uptrend";
  else if (ema9 < ema15 && ema15 < ema20 && price < ema20) trend = "Downtrend";

  let score = 0;
  const notes: string[] = [];
  if (emaCrossBullish && ema9 > ema15) {
    score += 2;
    notes.push(`9 EMA above 15 EMA (bullish)`);
  } else if (ema9 < ema15) {
    score -= 2;
    notes.push(`9 EMA below 15 EMA (bearish)`);
  } else {
    notes.push(`EMAs flattening`);
  }
  if (price > ema20) {
    score += 1;
    notes.push("Above 20 EMA");
  } else {
    score -= 1;
    notes.push("Below 20 EMA");
  }
  if (price > ema50) {
    score += 1;
    notes.push("Above 50 EMA");
  } else {
    score -= 1;
    notes.push("Below 50 EMA");
  }
  if (pivotAbove) {
    score += 1;
    notes.push("Above pivot (intraday bullish)");
  } else {
    score -= 1;
    notes.push("Below pivot (intraday bearish)");
  }
  if (pattern !== "None") {
    score += 1;
    notes.push(`${pattern} on last candle`);
  }

  // VWAP
  const vwapVal = vwap(candles);
  const aboveVwap = price > vwapVal;
  if (aboveVwap) {
    score += 1;
    notes.push(`Above VWAP ₹${vwapVal.toFixed(2)} (bullish)`);
  } else {
    score -= 1;
    notes.push(`Below VWAP ₹${vwapVal.toFixed(2)} (bearish)`);
  }

  let signal: TradeSignal = "HOLD";
  if (score >= 5) signal = "STRONG BUY";
  else if (score >= 2) signal = "BUY";
  else if (score <= -5) signal = "STRONG SELL";
  else if (score <= -2) signal = "SELL";

  return {
    interval,
    label: interval === "5m" ? "5 Min" : interval === "10m" ? "10 Min" : "15 Min",
    lastPrice: price,
    change,
    changePct,
    ema9,
    ema15,
    ema20,
    ema50,
    emaCrossBullish,
    pivot,
    pivotAbove,
    support,
    resistance,
    pattern,
    trend,
    signal,
    signalScore: score,
    vwap: vwap(candles),
    vwapAbove: price > vwap(candles),
    notes: notes.slice(0, 6),
  };
}
