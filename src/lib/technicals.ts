import type { Candle } from "./marketData";

export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (i === 0) {
      prev = v;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}

export interface MACDResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function macd(closes: number[], fast = 12, slow = 26, sig = 9): MACDResult {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = ema(macdLine, sig);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macd: macdLine, signal: signalLine, histogram };
}

export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = [];
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (i <= period) {
      if (diff >= 0) gains += diff;
      else losses -= diff;
      if (i === period) {
        const avgG = gains / period;
        const avgL = losses / period;
        const rs = avgL === 0 ? 100 : avgG / avgL;
        out.push(100 - 100 / (1 + rs));
      } else {
        out.push(NaN);
      }
    } else {
      const _prevG = out[out.length - 1] && !isNaN(out[out.length - 1]) ? 0 : 0;
      const avgG = (gains * (period - 1) + Math.max(diff, 0)) / period;
      const avgL = (losses * (period - 1) + Math.max(-diff, 0)) / period;
      gains = avgG;
      losses = avgL;
      const rs = avgL === 0 ? 100 : avgG / avgL;
      out.push(100 - 100 / (1 + rs));
    }
  }
  return out;
}

export function findMajorSupport(candles: Candle[], lookback = 60, tolerance = 0.02): number {
  if (candles.length < 10) return 0;
  const slice = candles.slice(-lookback);
  const lows = slice.map((c) => c.low);
  const candidates: number[] = [];
  for (let i = 2; i < slice.length - 2; i++) {
    const l = slice[i].low;
    if (
      l <= slice[i - 1].low &&
      l <= slice[i - 2].low &&
      l <= slice[i + 1].low &&
      l <= slice[i + 2].low
    ) {
      candidates.push(l);
    }
  }
  if (candidates.length === 0) return Math.min(...lows);
  const clusters: number[][] = [];
  for (const c of candidates.sort((a, b) => a - b)) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(last[0] - c) / last[0] < tolerance) {
      last.push(c);
    } else {
      clusters.push([c]);
    }
  }
  clusters.sort((a, b) => b.length - a.length);
  return clusters[0]?.reduce((s, v) => s + v, 0) / clusters[0].length;
}

/** Same idea as findMajorSupport but for local highs — the nearest well-tested ceiling above price. */
export function findMajorResistance(candles: Candle[], lookback = 60, tolerance = 0.02): number {
  if (candles.length < 10) return 0;
  const slice = candles.slice(-lookback);
  const highs = slice.map((c) => c.high);
  const candidates: number[] = [];
  for (let i = 2; i < slice.length - 2; i++) {
    const h = slice[i].high;
    if (
      h >= slice[i - 1].high &&
      h >= slice[i - 2].high &&
      h >= slice[i + 1].high &&
      h >= slice[i + 2].high
    ) {
      candidates.push(h);
    }
  }
  if (candidates.length === 0) return Math.max(...highs);
  const clusters: number[][] = [];
  for (const c of candidates.sort((a, b) => a - b)) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(last[0] - c) / last[0] < tolerance) {
      last.push(c);
    } else {
      clusters.push([c]);
    }
  }
  clusters.sort((a, b) => b.length - a.length);
  return clusters[0]?.reduce((s, v) => s + v, 0) / clusters[0].length;
}

export type CandlePattern =
  | "Bullish Engulfing"
  | "Hammer"
  | "Piercing Line"
  | "Morning Star"
  | "Bullish Marubozu"
  | "Three White Soldiers"
  | "Dragonfly Doji"
  | "None";

export type BearishPattern =
  | "Bearish Engulfing"
  | "Shooting Star"
  | "Evening Star"
  | "Hanging Man"
  | "Three Black Crows"
  | "Gravestone Doji"
  | "Dark Cloud Cover"
  | "None";

export type MultiWeekPattern =
  | "Cup & Handle"
  | "Double Bottom"
  | "52-Week High Breakout"
  | "None";

export interface BullishPatternResult {
  pattern: CandlePattern;
  /** Index of the candle where the pattern was last detected, or -1 when none. */
  index: number;
}

/**
 * Detects a bullish candlestick pattern scanning the last 3-5 candles.
 * Returns the most recent match found within the window together with the
 * candle index where it occurred (used to surface event timestamps).
 */
export function detectBullishPatternAt(candles: Candle[]): BullishPatternResult {
  if (candles.length < 3) return { pattern: "None", index: -1 };
  const windowEnd = candles.length;
  const windowStart = Math.max(3, windowEnd - 4);
  for (let i = windowEnd; i >= windowStart; i--) {
    const idx = i - 1;
    if (idx < 2) continue;
    const c0 = candles[idx];
    const c1 = candles[idx - 1];
    const c2 = candles[idx - 2];
    const body0 = c0.close - c0.open;
    const body1 = c1.close - c1.open;
    const body2 = c2.close - c2.open;
    const range0 = c0.high - c0.low;
    const lowerWick0 = Math.min(c0.open, c0.close) - c0.low;

    if (body1 < 0 && body0 > 0 && c0.close > c1.open && c0.open < c1.close) {
      return { pattern: "Bullish Engulfing", index: idx };
    }
    if (body0 > 0 && lowerWick0 > 2 * Math.abs(body0) && body0 < range0 * 0.4) {
      return { pattern: "Hammer", index: idx };
    }
    if (
      body1 < 0 &&
      body0 > 0 &&
      c0.open < c1.low &&
      c0.close > c1.open + (c1.close - c1.open) * -0.5 &&
      c0.close < c1.open
    ) {
      return { pattern: "Piercing Line", index: idx };
    }
    if (body2 < 0 && Math.abs(c1.close - c1.open) < Math.abs(body2) * 0.3 && body0 > 0 && c0.close > (c2.open + c2.close) / 2) {
      return { pattern: "Morning Star", index: idx };
    }
    if (body0 > 0 && body0 > range0 * 0.9 && c0.high - c0.close < range0 * 0.05 && c0.open - c0.low < range0 * 0.05) {
      return { pattern: "Bullish Marubozu", index: idx };
    }
    if (
      body0 > 0 &&
      body1 > 0 &&
      body2 > 0 &&
      c0.close > c1.close &&
      c1.close > c2.close
    ) {
      return { pattern: "Three White Soldiers", index: idx };
    }
    if (Math.abs(c0.close - c0.open) < range0 * 0.1 && lowerWick0 > range0 * 0.6) {
      return { pattern: "Dragonfly Doji", index: idx };
    }
  }
  return { pattern: "None", index: -1 };
}

/**
 * Detects a bullish candlestick pattern scanning the last 3-5 candles.
 * Returns the most recent match found within the window.
 */
export function detectBullishPattern(candles: Candle[]): CandlePattern {
  return detectBullishPatternAt(candles).pattern;
}

/**
 * Detects a bearish candlestick pattern scanning the last 3-5 candles.
 * Returns the most recent match found within the window.
 */
export function detectBearishPattern(candles: Candle[]): BearishPattern {
  if (candles.length < 3) return "None";
  const windowEnd = candles.length;
  const windowStart = Math.max(3, windowEnd - 4);
  for (let i = windowEnd; i >= windowStart; i--) {
    const idx = i - 1;
    if (idx < 2) continue;
    const c0 = candles[idx];
    const c1 = candles[idx - 1];
    const c2 = candles[idx - 2];
    const body0 = c0.close - c0.open;
    const body1 = c1.close - c1.open;
    const body2 = c2.close - c2.open;
    const range0 = c0.high - c0.low;
    const upperWick0 = c0.high - Math.max(c0.open, c0.close);

    // Bearish Engulfing: prev bullish body engulfed by bearish body
    if (body1 > 0 && body0 < 0 && c0.open > c1.close && c0.close < c1.open) {
      return "Bearish Engulfing";
    }
    // Shooting Star: small body near bottom, long upper wick
    if (body0 < 0 && upperWick0 > 2 * Math.abs(body0) && Math.abs(body0) < range0 * 0.4) {
      return "Shooting Star";
    }
    // Evening Star: bearish candle, small-bodied candle, bearish close below midpoint
    if (body2 > 0 && Math.abs(c1.close - c1.open) < Math.abs(body2) * 0.3 && body0 < 0 && c0.close < (c2.open + c2.close) / 2) {
      return "Evening Star";
    }
    // Hanging Man: small body at top, long lower wick in uptrend
    if (body0 > 0 && Math.min(c0.open, c0.close) - c0.low > 2 * Math.abs(body0) && Math.abs(body0) < range0 * 0.4) {
      return "Hanging Man";
    }
    // Three Black Crows: three consecutive bearish bodies, each closing lower
    if (
      body0 < 0 &&
      body1 < 0 &&
      body2 < 0 &&
      c0.close < c1.close &&
      c1.close < c2.close
    ) {
      return "Three Black Crows";
    }
    // Gravestone Doji: doji with long upper wick, no lower wick
    if (Math.abs(c0.close - c0.open) < range0 * 0.1 && upperWick0 > range0 * 0.6) {
      return "Gravestone Doji";
    }
    // Dark Cloud Cover: bullish candle followed by bearish opening above prev high, closing below midpoint
    if (
      body1 > 0 &&
      body0 < 0 &&
      c0.open > c1.high &&
      c0.close < (c1.open + c1.close) / 2 &&
      c0.close > c1.open
    ) {
      return "Dark Cloud Cover";
    }
  }
  return "None";
}

/**
 * Detects multi-week chart patterns using a rolling window of 20-50 candles.
 * - Cup & Handle: U-shaped rounded bottom followed by small pullback
 * - Double Bottom: Two distinct lows at similar price level with a peak between
 * - 52-Week High Breakout: New 52W high with above-average volume
 */
export function detectMultiWeekPattern(candles: Candle[]): MultiWeekPattern {
  if (candles.length < 30) return "None";
  const recent = candles.slice(-50);
  const closes = recent.map((c) => c.close);
  const volumes = recent.map((c) => c.volume);

  // --- 52-Week High Breakout ---
  if (candles.length >= 220) {
    const lastYear = candles.slice(-252);
    const high52 = Math.max(...lastYear.slice(0, 251).map((c) => c.high));
    const lastCandle = candles[candles.length - 1];
    const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    if (
      lastCandle.close > high52 * 0.98 &&
      lastCandle.high >= high52 &&
      lastCandle.volume > avgVol20 * 1.5
    ) {
      return "52-Week High Breakout";
    }
  }

  // --- Double Bottom ---
  // Find two distinct swing lows with a peak between them
  const lows = recent.map((c) => c.low);
  const swingLows: Array<{ idx: number; val: number }> = [];
  for (let i = 2; i < lows.length - 2; i++) {
    if (
      lows[i] <= lows[i - 1] &&
      lows[i] <= lows[i - 2] &&
      lows[i] <= lows[i + 1] &&
      lows[i] <= lows[i + 2]
    ) {
      swingLows.push({ idx: i, val: lows[i] });
    }
  }
  if (swingLows.length >= 2) {
    const last = swingLows[swingLows.length - 1];
    const prev = swingLows[swingLows.length - 2];
    const peakBetween = Math.max(...closes.slice(prev.idx, last.idx));
    if (
      Math.abs(last.val - prev.val) / prev.val < 0.03 &&
      peakBetween > last.val * 1.05 &&
      last.idx - prev.idx >= 5
    ) {
      return "Double Bottom";
    }
  }

  // --- Cup & Handle ---
  // Rounded U-shape bottom: find a high, dip, gradual recovery to near-previous high
  const firstQuarter = closes.slice(0, Math.floor(closes.length * 0.25));
  const lastQuarter = closes.slice(-Math.floor(closes.length * 0.25));
  const startHigh = Math.max(...firstQuarter);
  const endHigh = Math.max(...lastQuarter);
  const midLow = Math.min(...closes.slice(Math.floor(closes.length * 0.35), Math.floor(closes.length * 0.65)));
  if (
    startHigh > midLow * 1.1 &&
    endHigh > midLow * 1.1 &&
    Math.abs(startHigh - endHigh) / startHigh < 0.08 &&
    midLow < startHigh * 0.9
  ) {
    // Check for small handle pullback at the end
    const handleSlice = closes.slice(-5);
    const handleHigh = Math.max(...handleSlice);
    const handleLow = Math.min(...handleSlice);
    if (handleHigh - handleLow < handleHigh * 0.05) {
      return "Cup & Handle";
    }
  }

  return "None";
}

export interface EMACrossResult {
  /** True if a fresh bullish 9/15 crossover is in effect (used for pass/fail criterion). */
  crossedUp: boolean;
  /** Tiered power score matching user specifications. */
  tier: 0 | 1 | 2 | 3;
  /** Short human-readable label for the tier (e.g. "Complete crossover", "About to intercept"). */
  tierLabel: string;
  /** True once 9/15 are stacked in bullish alignment (post-cross). */
  bullishAlignment: boolean;
  ema9: number;
  ema15: number;
  /** Signed gap: ema9 - ema15 (positive = 9 above 15). */
  distance: number;
  /** Percent gap: |ema9 - ema15| / ema15 * 100. */
  distancePct: number;
  /** How much the gap shrank over the last 3 candles (% of price). */
  convergencePct: number;
  /** True when today's close sits within closeInterceptBuff of 9 EMA — i.e. price "power-intercepts" 9 EMA. */
  closeIntercept: boolean;
}

/**
 * 9:15 EMA crossover with tiered power scoring.
 *   tier 3 → complete bullish crossover (9 just crossed above 15 within last 2 sessions)
 *   tier 2 → touching / almost crossed (gap < 0.10% post-cross, or crossing in last 3 sessions)
 *   tier 1 → about to intercept (9 still below 15 but converging fast, OR price close intercepts 9 EMA)
 *   tier 0 → bearish or flat / diverging
 */
export function ema9_15Cross(closes: number[]): EMACrossResult {
  const e9 = ema(closes, 9);
  const e15 = ema(closes, 15);
  const n = closes.length;
  const ema9 = e9[n - 1];
  const ema15 = e15[n - 1];
  const prev9 = e9[n - 2];
  const prev15 = e15[n - 2];
  const e9_3 = e9[n - 3];
  const e15_3 = e15[n - 3];
  const e9_5 = e9[n - 5];
  const e15_5 = e15[n - 5];

  const price = closes[n - 1];

  // Cross events
  const crossedToday = prev9 <= prev15 && ema9 > ema15;
  const crossedYesterday = e9_3 <= e15_3 && prev9 > prev15 && ema9 > ema15;
  const crossedThreeDaysAgo =
    e15_5 <= e15_3 && e9_5 < e15_5 && (e9_3 > e15_3 || prev9 > prev15) && ema9 > ema15;
  const recentCross = crossedToday || crossedYesterday || crossedThreeDaysAgo;

  const bullishAlignment =
    ema9 > ema15 && ema9 > e9[n - 5] && ema9 - ema15 > 0.15 * Math.abs(ema15) * 0.001;

  const _crossedUp = recentCross || bullishAlignment;

  // Tier scoring
  const distance = ema9 - ema15;
  const distancePct = ema15 !== 0 ? Math.abs(distance) / Math.abs(ema15) * 100 : 0;
  const pastGap =
    e9[n - 3] - e15[n - 3] === 0 ? 0 : Math.abs((e9[n - 3] - e15[n - 3]) / e15[n - 3]) * 100;
  const convergencePct = Math.max(0, pastGap - distancePct);

  const closeInterceptBuff = Math.max(0.05 * Math.abs(ema9) * 0.001, 0.05);
  const closeIntercept =
    Math.abs(price - ema9) <= closeInterceptBuff + 0.03 * Math.abs(ema9) * 0.001;

  // 3 — Complete crossover (just crossed or extremely tight post-cross run)
  if (crossedToday) {
    return {
      crossedUp: true,
      tier: 3,
      tierLabel: "Complete bullish crossover (just crossed today)",
      bullishAlignment,
      ema9,
      ema15,
      distance,
      distancePct,
      convergencePct,
      closeIntercept,
    };
  }
  if (crossedYesterday && distancePct < 0.5) {
    return {
      crossedUp: true,
      tier: 3,
      tierLabel: "Complete bullish crossover (yesterday)",
      bullishAlignment,
      ema9,
      ema15,
      distance,
      distancePct,
      convergencePct,
      closeIntercept,
    };
  }
  // 3 — Sustained post-crossover bullish alignment (9 EMA persistently above 15 EMA,
  //     above its own level 5 candles ago, in the "completed" regime, but not fresh within 1-2 days)
  if (bullishAlignment && ema9 > ema15) {
    return {
      crossedUp: true,
      tier: 3,
      tierLabel: "Bullish alignment in effect (9 EMA stacked above 15 EMA)",
      bullishAlignment,
      ema9,
      ema15,
      distance,
      distancePct,
      convergencePct,
      closeIntercept,
    };
  }

  // 2 — Touched / almost crossed (tight gap below 0.10% post-cross)
  if (recentCross && distancePct <= 0.1) {
    return {
      crossedUp: true,
      tier: 2,
      tierLabel: "9 EMA touched 15 EMA (almost crossed)",
      bullishAlignment: false,
      ema9,
      ema15,
      distance,
      distancePct,
      convergencePct,
      closeIntercept,
    };
  }
  // 2 — Recent cross within last 3 days but not yet aligned = "almost crossed"
  if (crossedThreeDaysAgo && !bullishAlignment) {
    return {
      crossedUp: true,
      tier: 2,
      tierLabel: "Within 3 sessions of post-cross",
      bullishAlignment: false,
      ema9,
      ema15,
      distance,
      distancePct,
      convergencePct,
      closeIntercept,
    };
  }

  // 1 — About to intercept (gap closing fast, or close price intercepts 9 EMA)
  // 1a. Convergence: 9 EMA still below 15 EMA but the gap shrank by ≥40% over last 3 candles
  if (ema9 <= ema15 && pastGap > 0 && convergencePct >= pastGap * 0.4) {
    return {
      crossedUp: false,
      tier: 1,
      tierLabel: `About to intercept (gap closing ${convergencePct.toFixed(2)}%)`,
      bullishAlignment: false,
      ema9,
      ema15,
      distance,
      distancePct,
      convergencePct,
      closeIntercept,
    };
  }
  // 1b. Power close intercept: today's price close is pressing on 9 EMA
  if (closeIntercept) {
    return {
      crossedUp: false,
      tier: 1,
      tierLabel: `Price close intercepting 9 EMA at ₹${price.toFixed(2)}`,
      bullishAlignment: false,
      ema9,
      ema15,
      distance,
      distancePct,
      convergencePct,
      closeIntercept: true,
    };
  }

  // 0 — bearish / diverging
  const label =
    ema9 < ema15
      ? "9 EMA below 15 EMA (bearish)"
      : "EMAs flat / diverging (no clear signal)";
  return {
    crossedUp: false,
    tier: 0,
    tierLabel: label,
    bullishAlignment: false,
    ema9,
    ema15,
    distance,
    distancePct,
    convergencePct,
    closeIntercept,
  };
}

export interface PivotLevels {
  r3: number;
  r2: number;
  r1: number;
  pivot: number;
  s1: number;
  s2: number;
  s3: number;
}

export function classicPivot(prevHigh: number, prevLow: number, prevClose: number): PivotLevels {
  const pivot = (prevHigh + prevLow + prevClose) / 3;
  return {
    pivot,
    r1: 2 * pivot - prevLow,
    r2: pivot + (prevHigh - prevLow),
    r3: prevHigh + 2 * (pivot - prevLow),
    s1: 2 * pivot - prevHigh,
    s2: pivot - (prevHigh - prevLow),
    s3: prevLow - 2 * (prevHigh - pivot),
  };
}

export interface FibLevels {
  r382: number;
  r618: number;
  pivot: number;
  s382: number;
  s618: number;
  fib0: number;
  fib236: number;
  fib382: number;
  fib5: number;
  fib618: number;
  fib786: number;
  fib100: number;
}

export function fibonacciRetracement(high: number, low: number): FibLevels {
  const diff = high - low;
  return {
    fib0: high,
    fib236: high - diff * 0.236,
    r382: high - diff * 0.382,
    fib382: high - diff * 0.382,
    fib5: high - diff * 0.5,
    pivot: (high + low) / 2,
    r618: high - diff * 0.618,
    s382: low + diff * 0.382,
    fib618: high - diff * 0.618,
    s618: low + diff * 0.618,
    fib786: high - diff * 0.786,
    fib100: low,
  };
}

// ---------------------------------------------------------------------------
// 1. VOLUME ANALYSIS
// ---------------------------------------------------------------------------

export interface VolumeAnalysis {
  avgVolume20: number;
  latestVolume: number;
  volumeRatio: number;
  volumeSurge: boolean;
}

export function analyzeVolume(candles: Candle[]): VolumeAnalysis {
  const defaultReturn: VolumeAnalysis = {
    avgVolume20: 0,
    latestVolume: 0,
    volumeRatio: 0,
    volumeSurge: false,
  };
  if (candles.length < 5) return defaultReturn;
  const lookback = Math.min(20, candles.length - 1);
  const recent = candles.slice(-lookback - 1, -1);
  if (recent.length === 0) return defaultReturn;
  const avgVolume20 = recent.reduce((s, c) => s + c.volume, 0) / recent.length;
  const latestVolume = candles[candles.length - 1].volume;
  const volumeRatio = avgVolume20 > 0 ? latestVolume / avgVolume20 : 0;
  return {
    avgVolume20,
    latestVolume,
    volumeRatio,
    volumeSurge: volumeRatio > 1.5,
  };
}

// ---------------------------------------------------------------------------
// 2. BOLLINGER BANDS
// ---------------------------------------------------------------------------

export interface BollingerResult {
  upper: number[];
  middle: number[];
  lower: number[];
  bandwidth: number[];
  squeeze: boolean;
  nearUpper: boolean;
  nearLower: boolean;
}

export function bollingerBands(
  closes: number[],
  period = 20,
  stdDevMultiplier = 2
): BollingerResult {
  const n = closes.length;
  const upper: number[] = [];
  const middle: number[] = [];
  const lower: number[] = [];
  const bandwidth: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      middle.push(NaN);
      lower.push(NaN);
      bandwidth.push(NaN);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    const mean = sum / period;
    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j++) varianceSum += (closes[j] - mean) ** 2;
    const stdDev = Math.sqrt(varianceSum / period);
    const u = mean + stdDevMultiplier * stdDev;
    const l = mean - stdDevMultiplier * stdDev;
    upper.push(u);
    middle.push(mean);
    lower.push(l);
    bandwidth.push(mean > 0 ? (u - l) / mean : 0);
  }
  // Squeeze detection: current bandwidth is in lowest 20% of last 60 candles
  const recentBw = bandwidth.slice(-60).filter((v) => !isNaN(v));
  const sorted = [...recentBw].sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
  const currentBw = bandwidth[n - 1];
  const squeeze = !isNaN(currentBw) && currentBw <= threshold && recentBw.length >= 10;
  const lastClose = closes[n - 1] ?? 0;
  const lastUpper = upper[n - 1];
  const lastLower = lower[n - 1];
  const nearUpper =
    !isNaN(lastUpper) && lastUpper > 0 && lastClose > lastUpper * 0.98;
  const nearLower =
    !isNaN(lastLower) && lastLower > 0 && lastClose < lastLower * 1.02;
  return { upper, middle, lower, bandwidth, squeeze, nearUpper, nearLower };
}

// ---------------------------------------------------------------------------
// 3. ADX (Average Directional Index)
// ---------------------------------------------------------------------------

export interface ADXResult {
  adx: number;
  plusDI: number;
  minusDI: number;
}

export function adx(candles: Candle[], period = 14): ADXResult {
  const defaultReturn: ADXResult = { adx: 0, plusDI: 0, minusDI: 0 };
  if (candles.length < period + 2) return defaultReturn;

  const trueRanges: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Wilder smoothing
  let atrVal = 0;
  let plusDMsmooth = 0;
  let minusDMsmooth = 0;
  for (let i = 0; i < period; i++) {
    atrVal += trueRanges[i];
    plusDMsmooth += plusDMs[i];
    minusDMsmooth += minusDMs[i];
  }
  atrVal /= period;
  plusDMsmooth /= period;
  minusDMsmooth /= period;

  const dxValues: number[] = [];
  let lastPlusDI = 0;
  let lastMinusDI = 0;

  for (let i = period; i < trueRanges.length; i++) {
    atrVal = (atrVal * (period - 1) + trueRanges[i]) / period;
    plusDMsmooth = (plusDMsmooth * (period - 1) + plusDMs[i]) / period;
    minusDMsmooth = (minusDMsmooth * (period - 1) + minusDMs[i]) / period;
    const plusDI = atrVal > 0 ? (plusDMsmooth / atrVal) * 100 : 0;
    const minusDI = atrVal > 0 ? (minusDMsmooth / atrVal) * 100 : 0;
    lastPlusDI = plusDI;
    lastMinusDI = minusDI;
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
    dxValues.push(dx);
  }

  if (dxValues.length < period) {
    const avg = dxValues.length > 0
      ? dxValues.reduce((a, b) => a + b, 0) / dxValues.length
      : 0;
    return { adx: avg, plusDI: lastPlusDI, minusDI: lastMinusDI };
  }

  let adxVal = 0;
  for (let i = 0; i < period; i++) adxVal += dxValues[i];
  adxVal /= period;
  for (let i = period; i < dxValues.length; i++) {
    adxVal = (adxVal * (period - 1) + dxValues[i]) / period;
  }
  return { adx: adxVal, plusDI: lastPlusDI, minusDI: lastMinusDI };
}

// ---------------------------------------------------------------------------
// 4. SUPERTREND
// ---------------------------------------------------------------------------

export interface SupertrendPoint {
  value: number;
  trend: "up" | "down";
}

export function supertrend(
  candles: Candle[],
  period = 10,
  multiplier = 3
): SupertrendPoint[] {
  const n = candles.length;
  if (n < period) return [];

  // Recompute ATR per candle for Supertrend
  const trueRanges: number[] = [];
  for (let i = 1; i < n; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trueRanges.push(tr);
  }
  const atrSeries: number[] = [0];
  let atrSma = 0;
  for (let i = 0; i < trueRanges.length; i++) {
    if (i < period) {
      atrSma += trueRanges[i];
      atrSeries.push(i === period - 1 ? atrSma / period : 0);
    } else {
      atrSma = (atrSma * (period - 1) + trueRanges[i]) / period;
      atrSeries.push(atrSma);
    }
  }

  const upperBand: number[] = [];
  const lowerBand: number[] = [];
  const result: SupertrendPoint[] = [];

  let prevTrend: "up" | "down" = "up";

  for (let i = 0; i < n; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const atr = atrSeries[i] ?? 0;
    const u = hl2 + multiplier * atr;
    const l = hl2 - multiplier * atr;

    const newUpper = i > 0 && u < (upperBand[i - 1] ?? u) && candles[i - 1].close <= (upperBand[i - 1] ?? u)
      ? upperBand[i - 1] ?? u
      : u;
    const newLower = i > 0 && l > (lowerBand[i - 1] ?? l) && candles[i - 1].close >= (lowerBand[i - 1] ?? l)
      ? lowerBand[i - 1] ?? l
      : l;

    upperBand.push(newUpper);
    lowerBand.push(newLower);

    let trend: "up" | "down" = prevTrend;
    if (prevTrend === "down" && candles[i].close > (upperBand[i - 1] ?? newUpper)) {
      trend = "up";
    } else if (prevTrend === "up" && candles[i].close < (lowerBand[i - 1] ?? newLower)) {
      trend = "down";
    }

    const value = trend === "up" ? newLower : newUpper;
    result.push({ value, trend });
    prevTrend = trend;
  }
  return result;
}

// ---------------------------------------------------------------------------
// 5. VWAP (for intraday use)
// ---------------------------------------------------------------------------

export function vwap(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  let cumTypicalVolume = 0;
  let cumVolume = 0;
  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumTypicalVolume += typicalPrice * c.volume;
    cumVolume += c.volume;
  }
  return cumVolume > 0 ? cumTypicalVolume / cumVolume : 0;
}

// ---------------------------------------------------------------------------
// 6. ATR (Average True Range)
// ---------------------------------------------------------------------------

export function atr(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trueRanges.push(tr);
  }
  if (trueRanges.length < period) return 0;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trueRanges[i];
  let avg = sum / period;
  for (let i = period; i < trueRanges.length; i++) {
    avg = (avg * (period - 1) + trueRanges[i]) / period;
  }
  return avg;
}
