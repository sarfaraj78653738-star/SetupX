import type { Candle, StockQuote } from "./marketData";
import {
  ema,
  findMajorSupport,
  findMajorResistance,
  ema9_15Cross,
  detectBullishPatternAt,
  detectBearishPattern,
  detectMultiWeekPattern,
  classicPivot,
  fibonacciRetracement,
  analyzeVolume,
  supertrend,
  atr,
  type BearishPattern,
  type SupertrendPoint,
} from "./technicals";
import { analyzeSentiment, evaluateFundamentals, type FundamentalsInput } from "./sentiment";
import type { NewsItem } from "./marketData";

export interface ScreenResult {
  symbol: string;
  name: string;
  sector: string;
  indices?: Array<"NIFTY50" | "NIFTYNEXT50" | "BROAD" | "BSESENSEX">;
  price: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  pe?: number;
  rating: 10 | 0;
  criteriaPassed: number;
  criteriaTotal: number;
  criteria: Array<{ name: string; passed: boolean; reason: string; informational?: boolean; eventTime?: string }>;
  bullishProbability: number;
  bullishDrivers: string[];
  bearishProbability: number;
  bearishDrivers: string[];
  details: {
    ema9: number;
    ema15: number;
    emaCrossUp: boolean;
    emaTier: 0 | 1 | 2 | 3;
    emaTierLabel: string;
    majorSupport: number;
    supportDistancePct: number;
    majorResistance: number;
    resistanceDistancePct: number;
    pivotAbove: boolean;
    pivotPoint: number;
    fib618Support: number;
    fibDistancePct: number;
    fibLevels: {
      fib0: number;
      fib236: number;
      fib382: number;
      fib5: number;
      fib618: number;
      fib786: number;
      fib100: number;
    };
    newsSentiment: "Positive" | "Neutral" | "Negative";
    newsPositive: number;
    newsNegative: number;
    newsRecentCount: number;
    fundamentalsOk: boolean;
    fundamentalsQuality: number;
    fundamentalsVerdict: "STRONG" | "GOOD" | "WATCH" | "POOR";
    fundamentalsPledgeRedFlag: boolean;
    fundamentalsSummary: string[];
    dayChangePct: number;
    bullishPattern: string;
    bearishPattern: string;
    multiWeekPattern: string;
    volumeRatio: number;
    volumeSurge: boolean;
    supertrendBullish: boolean;
    supertrendValue: number;
    atr: number;
  };
}

export interface ScreenInput {
  symbol: string;
  name: string;
  sector: string;
  candles: Candle[];
  quote: StockQuote;
  fundamentals: FundamentalsInput;
  news: NewsItem[];
  /**
   * Optional daily candles used ONLY for the pivot point calculation.
   * When scanning intraday resolutions the pivot must come from the previous
   * full trading day's daily H/L/C, never from the previous intraday candle.
   */
  dailyCandles?: Candle[];
  /**
   * Today's intraday (e.g. 5-min) candles. When scanning "1D", this is used
   * ONLY to find the real clock-time price-level criteria (Major Support,
   * Fibonacci 0.618, Above Pivot Point) first became true today — it never
   * affects pass/fail or the score. EMA Crossover / pattern / Supertrend /
   * Volume are inherently multi-day, day-level events with no single
   * intraday moment, so they're always labeled "Today" in 1D mode instead.
   */
  todayIntradayCandles?: Candle[];
  /** Scan resolution ("5m" | "15m" | "30m" | "1D") used for display timestamps. */
  timeframe?: string;
}

export function runScreen(input: ScreenInput): ScreenResult | null {
  const { candles, quote, fundamentals, news, symbol, name, sector } = input;
  if (candles.length < 35) return null;

  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const price = quote.price || last.close;
  const prev = candles[candles.length - 2];
  const cross = ema9_15Cross(closes);
  const patternAt = detectBullishPatternAt(candles);
  const pattern = patternAt.pattern;
  const bearPattern = detectBearishPattern(candles);
  const multiWeek = detectMultiWeekPattern(candles);
  const support = findMajorSupport(candles, 60, 0.02);
  const supportDistancePct = support > 0 ? ((price - support) / support) * 100 : 100;
  const resistance = findMajorResistance(candles, 60, 0.02);
  const resistanceDistancePct = resistance > 0 ? ((resistance - price) / price) * 100 : 100;
  const recent = candles.slice(-30);
  const high30 = Math.max(...recent.map((c) => c.high));
  const low30 = Math.min(...recent.map((c) => c.low));
  const fib = fibonacciRetracement(high30, low30);
  const fibDistancePct = fib.s618 > 0 ? ((price - fib.s618) / fib.s618) * 100 : 100;
  // Pivot is ALWAYS computed from the previous full trading day's daily H/L/C
  // (the daily candle before the most recent one). For "1D" scans the scan
  // candles themselves are daily so this is identical to the previous behaviour.
  const dailyCandles = input.dailyCandles;
  const pivotDay =
    dailyCandles && dailyCandles.length >= 2
      ? (() => {
          const d = dailyCandles[dailyCandles.length - 2];
          return d && d.high > 0 && d.low > 0 && d.close > 0 ? d : null;
        })()
      : null;
  const pivotLevels = classicPivot(
    pivotDay?.high ?? prev.high,
    pivotDay?.low ?? prev.low,
    pivotDay?.close ?? prev.close
  );
  const pivotAbove = price > pivotLevels.pivot;
  const sentiment = analyzeSentiment(news.map((n) => n.title));
  const fund = evaluateFundamentals(fundamentals);

  // --- Indicators used in scoring ---
  const vol = analyzeVolume(candles);
  const stResult = supertrend(candles);
  const latestSt = stResult.length > 0 ? stResult[stResult.length - 1] : null;
  const supertrendBullish = latestSt?.trend === "up";
  const atrVal = atr(candles);

  const criteria: Array<{ name: string; passed: boolean; reason: string; informational?: boolean; eventTime?: string }> = [];

  const timeframe = input.timeframe;
  const isDaily = !timeframe || timeframe === "1D";
  // The fetch that supplies todayIntradayCandles may span yesterday+today
  // (broker APIs often return a wider window than requested). Filter down
  // to ONLY today's actual calendar date (IST) before searching — otherwise
  // a touch found on yesterday's candle could get mislabeled as if it
  // happened today, sometimes showing an impossible "future" time (e.g. a
  // 3 PM label while it's currently only 10 AM).
  const todayCandles = (() => {
    const all = input.todayIntradayCandles;
    if (!all || all.length === 0) return all;
    const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
    const filtered = all.filter((c) => {
      const d = new Date(c.date);
      if (isNaN(d.getTime())) return false;
      return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === todayKey;
    });
    return filtered.length > 0 ? filtered : undefined;
  })();

  function todayTouchLabel(level: number): string {
    if (!todayCandles || todayCandles.length === 0) return "Today";
    const idx = findLevelTouchIndex(todayCandles, level);
    if (idx < 0) return "Today";
    const t = eventClockLabel(todayCandles[idx].date);
    return t ? `at ${t}` : "Today";
  }

  const emaCrossIdx = findEmaCrossIndex(closes);
  const supportTouchIdx = findLevelTouchIndex(candles, support);
  const resistanceTouchIdx = findLevelTouchIndex(candles, resistance);
  const fibTouchIdx = findLevelTouchIndex(candles, fib.s618);
  const surgeIdx = findVolumeSurgeIndex(candles);
  const stFlipIdx = findSupertrendFlipIndex(stResult);

  const supportPassed = supportDistancePct >= 0 && supportDistancePct <= 2.5;
  criteria.push({
    name: "Major Support",
    passed: supportPassed,
    reason: supportPassed
      ? `Within ${supportDistancePct.toFixed(2)}% of ₹${support.toFixed(2)} support`
      : `${supportDistancePct.toFixed(2)}% away from ₹${support.toFixed(2)} support`,
    eventTime: isDaily
      ? todayTouchLabel(support)
      : supportTouchIdx >= 0
        ? eventLabel(candles[supportTouchIdx].date, timeframe)
        : undefined,
  });

  // Informational only (like Supertrend/Volume Confirmation) — shown
  // alongside Major Support for a fuller picture (floor vs ceiling), but
  // doesn't affect the Qualified/bullish score, since being near a
  // resistance level isn't itself a bullish or bearish signal on its own.
  const nearResistance = resistanceDistancePct >= 0 && resistanceDistancePct <= 2.5;
  criteria.push({
    name: "Major Resistance",
    passed: nearResistance,
    informational: true,
    reason:
      resistance > 0
        ? nearResistance
          ? `Within ${resistanceDistancePct.toFixed(2)}% of ₹${resistance.toFixed(2)} resistance`
          : resistanceDistancePct < 0
            ? `Price already ${Math.abs(resistanceDistancePct).toFixed(2)}% above ₹${resistance.toFixed(2)} resistance`
            : `${resistanceDistancePct.toFixed(2)}% below ₹${resistance.toFixed(2)} resistance`
        : "No clear resistance level found in recent data",
    eventTime: isDaily
      ? todayTouchLabel(resistance)
      : resistanceTouchIdx >= 0
        ? eventLabel(candles[resistanceTouchIdx].date, timeframe)
        : undefined,
  });

  // EMA tiered power scoring: 3 = complete cross, 2 = almost crossed, 1 = about to intercept
  // We mark the criterion as passed if tier >= 2 (already crossed family).
  // Tier 1 is shown on the card but doesn't yet pass the strict criterion.
  const emaTier = cross.tier;
  const emaPassed = emaTier >= 2;
  criteria.push({
    name: "9/15 EMA Crossover",
    passed: emaPassed,
    reason:
      emaTier === 3
        ? `Tier 3 · ${cross.tierLabel} — 9 EMA ₹${cross.ema9.toFixed(2)} above 15 EMA ₹${cross.ema15.toFixed(2)}`
        : emaTier === 2
          ? `Tier 2 · ${cross.tierLabel} — 9 EMA ₹${cross.ema9.toFixed(2)} vs 15 EMA ₹${cross.ema15.toFixed(2)} (${cross.distancePct.toFixed(3)}% gap)`
          : emaTier === 1
            ? `Tier 1 · ${cross.tierLabel} — 9 EMA ₹${cross.ema9.toFixed(2)}, 15 EMA ₹${cross.ema15.toFixed(2)}`
            : `${cross.tierLabel} — 9 EMA ₹${cross.ema9.toFixed(2)}, 15 EMA ₹${cross.ema15.toFixed(2)}`,
    eventTime: isDaily
      ? "Today"
      : emaCrossIdx >= 0
        ? eventLabel(candles[emaCrossIdx].date, timeframe)
        : undefined,
  });

  const patternPassed = pattern !== "None";
  criteria.push({
    name: "Bullish Candlestick",
    passed: patternPassed,
    reason: patternPassed ? `Detected: ${pattern}` : "No bullish pattern on last candle",
    eventTime: isDaily
      ? patternPassed
        ? "Today"
        : undefined
      : patternPassed && patternAt.index >= 0
        ? eventLabel(candles[patternAt.index].date, timeframe)
        : undefined,
  });

  const pivotPassed = pivotAbove;
  criteria.push({
    name: "Above Pivot Point",
    passed: pivotPassed,
    reason: pivotPassed
      ? `Price ₹${price.toFixed(2)} above pivot ₹${pivotLevels.pivot.toFixed(2)}`
      : `Price ₹${price.toFixed(2)} below pivot ₹${pivotLevels.pivot.toFixed(2)}`,
    eventTime: pivotPassed && isDaily ? todayTouchLabel(pivotLevels.pivot) : undefined,
  });

  const fibPassed = fibDistancePct >= -1.5 && fibDistancePct <= 3;
  criteria.push({
    name: "Fibonacci 0.618 Support",
    passed: fibPassed,
    reason: fibPassed
      ? `Within ${fibDistancePct.toFixed(2)}% of 0.618 fib (₹${fib.s618.toFixed(2)})`
      : `${fibDistancePct.toFixed(2)}% away from 0.618 fib (₹${fib.s618.toFixed(2)})`,
    eventTime: isDaily
      ? todayTouchLabel(fib.s618)
      : fibTouchIdx >= 0
        ? eventLabel(candles[fibTouchIdx].date, timeframe)
        : undefined,
  });

  const newsPassed = sentiment.label === "Positive" || sentiment.label === "Neutral";
  criteria.push({
    name: "Positive News",
    passed: newsPassed,
    reason: newsPassed
      ? sentiment.label === "Positive"
        ? `${sentiment.positive} positive vs ${sentiment.negative} negative headlines`
        : "No major negative news flow"
      : `${sentiment.negative} negative vs ${sentiment.positive} positive headlines`,
  });

  // ----- Fundamentals: weighted majority + hard pledge veto -----
  // We treat "Good Fundamentals" as a strict binary criterion for the
  // 10/10 rating. It passes if (a) real data is available AND the quality
  // score is >= THRESHOLD; (b) data is missing but nothing is wrong; or
  // (c) the promoter pledge hard-redflag did NOT fire.
  const fundHasData =
    fundamentals.roe != null ||
    fundamentals.roce != null ||
    fundamentals.debtToEquity != null ||
    fundamentals.priceToBook != null ||
    fundamentals.pb != null ||
    fundamentals.promoterHolding != null;
  const fundQualityStrong = fund.qualityScore >= 50;
  const fundQualityAcceptable = fund.qualityScore >= 30;
  const fundCriteriaPassed = !fund.pledgeRedFlag && (fundHasData
    ? (typeof fundamentals.roe === "number" || typeof fundamentals.roce === "number")
      ? fundQualityStrong
      : fundQualityAcceptable
    : fund.positiveChange);
  const topReasons = fund.summary.slice(0, 4);
  let fundReason = topReasons.length
    ? topReasons.join(" · ")
    : "Fundamentals data unavailable";

  if (fund.pledgeRedFlag) {
    fundReason = `RED FLAG — ${fund.summary[0] ?? "high promoter pledge"}`;
  } else if (fund.verdict === "STRONG") {
    fundReason = `Q ${fund.qualityScore}/100 STRONG — ${topReasons.slice(0, 2).join(" · ")}`;
  } else if (fund.verdict === "GOOD") {
    fundReason = `Q ${fund.qualityScore}/100 · ${topReasons.slice(0, 3).join(" · ")}`;
  } else {
    fundReason = `Q ${fund.qualityScore}/100 · ${topReasons.slice(0, 3).join(" · ") || "weak fundamentals"}`;
  }

  criteria.push({
    name: "Good Fundamentals",
    passed: fundCriteriaPassed,
    reason: fundReason,
  });

  // Supertrend criterion — informational, shown in UI but does NOT count toward 10/10 rating
  criteria.push({
    name: "Supertrend Bullish",
    passed: supertrendBullish,
    informational: true,
    reason: supertrendBullish
      ? `Supertrend UP — trend confirmed (support ₹${(latestSt?.value ?? 0).toFixed(2)})`
      : "Supertrend DOWN — trend is bearish",
    eventTime: isDaily
      ? supertrendBullish
        ? "Today"
        : undefined
      : stFlipIdx >= 0
        ? eventLabel(candles[stFlipIdx].date, timeframe)
        : undefined,
  });

  // Volume criterion — informational, shown in UI but does NOT count toward 10/10 rating
  const volLabel = vol.volumeSurge
    ? `Volume surge ${vol.volumeRatio.toFixed(1)}x avg — strong confirmation`
    : vol.volumeRatio > 1.0
      ? `Volume ${vol.volumeRatio.toFixed(1)}x avg — adequate`
      : vol.latestVolume > 0
        ? `Low volume ${vol.volumeRatio.toFixed(1)}x avg — weak confirmation`
        : "Volume data unavailable";
  criteria.push({
    name: "Volume Confirmation",
    passed: vol.volumeSurge,
    informational: true,
    reason: volLabel,
    eventTime: isDaily
      ? vol.volumeSurge
        ? "Today"
        : undefined
      : surgeIdx >= 0
        ? eventLabel(candles[surgeIdx].date, timeframe)
        : undefined,
  });

  // Rating uses only core criteria (first 8), not informational ones
  const coreCriteria = criteria.filter((c) => !c.informational);
  const passed = coreCriteria.filter((c) => c.passed).length;
  const total = coreCriteria.length;

  const prob = computeBullishProbability({
    criteriaPassed: passed,
    criteriaTotal: total,
    supportDistancePct,
    emaBullish: cross.crossedUp,
    emaTier: cross.tier,
    emaSpread: Math.abs(cross.ema9 - cross.ema15) / Math.max(cross.ema15, 1),
    pattern: pattern !== "None",
    pivotAbove,
    fibPassed,
    sentimentLabel: sentiment.label,
    newsCount: news.length,
    dayChangePct: quote.changePercent,
    fundOk: !fund.pledgeRedFlag && fund.qualityScore >= 50,
    volumeSurge: vol.volumeSurge,
    volumeRatio: vol.volumeRatio,
    supertrendBullish,
  });
  const drivers = describeDrivers({
    criteriaPassed: passed,
    criteriaTotal: total,
    supportDistancePct,
    emaBullish: cross.crossedUp,
    emaTier: cross.tier,
    pattern: pattern !== "None",
    pivotAbove,
    fibPassed,
    sentimentLabel: sentiment.label,
    volumeSurge: vol.volumeSurge,
    volumeRatio: vol.volumeRatio,
    supertrendBullish,
  });

  const bearProb = computeBearishProbability({
    criteriaPassed: passed,
    criteriaTotal: total,
    supportDistancePct,
    emaBullish: cross.crossedUp,
    emaTier: cross.tier,
    pattern: pattern !== "None",
    pivotAbove,
    fibPassed,
    sentimentLabel: sentiment.label,
    newsCount: news.length,
    dayChangePct: quote.changePercent,
    fundOk: !fund.pledgeRedFlag && fund.qualityScore >= 50,
    volumeSurge: vol.volumeSurge,
    supertrendBullish,
  });

  const bearDrivers = describeBearishDrivers({
    criteriaPassed: passed,
    criteriaTotal: total,
    supportDistancePct,
    emaBullish: cross.crossedUp,
    pattern: pattern !== "None",
    pivotAbove,
    fibPassed,
    sentimentLabel: sentiment.label,
    volumeSurge: vol.volumeSurge,
    volumeRatio: vol.volumeRatio,
    supertrendBullish,
  });

  return {
    symbol,
    name,
    sector,
    price,
    changePercent: quote.changePercent,
    volume: quote.volume,
    marketCap: fundamentals.marketCap,
    pe: fundamentals.pe,
    rating: passed === total ? 10 : 0,
    criteriaPassed: passed,
    criteriaTotal: total,
    criteria,
    bullishProbability: adjustForBearishPattern(prob, bearPattern),
    bullishDrivers: [...drivers, ...(bearPattern !== "None" ? [`⚠ Bearish pattern: ${bearPattern}`] : [])],
    bearishProbability: bearProb,
    bearishDrivers: bearDrivers,
    details: {
      ema9: cross.ema9,
      ema15: cross.ema15,
      emaCrossUp: cross.crossedUp,
      emaTier: cross.tier,
      emaTierLabel: cross.tierLabel,
      majorSupport: support,
      supportDistancePct,
      majorResistance: resistance,
      resistanceDistancePct,
      bullishPattern: pattern,
      bearishPattern: bearPattern,
      multiWeekPattern: multiWeek,
      pivotAbove,
      pivotPoint: pivotLevels.pivot,
      fib618Support: fib.s618,
      fibDistancePct,
      fibLevels: {
        fib0: fib.fib0,
        fib236: fib.fib236,
        fib382: fib.fib382,
        fib5: fib.fib5,
        fib618: fib.fib618,
        fib786: fib.fib786,
        fib100: fib.fib100,
      },
      volumeRatio: vol.volumeRatio,
      volumeSurge: vol.volumeSurge,
      supertrendBullish,
      supertrendValue: latestSt?.value ?? 0,
      atr: atrVal,
      newsSentiment: sentiment.label,
      newsPositive: sentiment.positive,
      newsNegative: sentiment.negative,
      newsRecentCount: news.length,
      fundamentalsOk: !fund.pledgeRedFlag && fund.qualityScore >= 50,
      fundamentalsQuality: fund.qualityScore,
      fundamentalsVerdict: fund.verdict,
      fundamentalsPledgeRedFlag: fund.pledgeRedFlag,
      fundamentalsSummary: fund.summary,
      dayChangePct: quote.changePercent,
    },
  };
}

interface ProbabilityInput {
  criteriaPassed: number;
  criteriaTotal: number;
  supportDistancePct: number;
  emaBullish: boolean;
  emaTier: 0 | 1 | 2 | 3;
  emaSpread: number;
  pattern: boolean;
  pivotAbove: boolean;
  fibPassed: boolean;
  sentimentLabel: "Positive" | "Neutral" | "Negative";
  newsCount: number;
  dayChangePct: number;
  fundOk: boolean;
  volumeSurge: boolean;
  volumeRatio: number;
  supertrendBullish: boolean;
}

export function computeBullishProbability(p: ProbabilityInput): number {
  let score = 0;
  const { criteriaPassed, criteriaTotal } = p;
  score += (criteriaPassed / criteriaTotal) * 45;

  if (p.emaTier === 3) {
    score += 14;
    score += Math.min(p.emaSpread * 25, 4);
  } else if (p.emaTier === 2) {
    score += 10;
    score += Math.min(p.emaSpread * 20, 3);
  } else if (p.emaTier === 1) {
    score += 5;
    score += Math.min(p.emaSpread * 12, 2);
  } else {
    score += Math.max(0, -6 + p.emaSpread * 10);
  }

  if (p.pattern) score += 7;

  if (p.supportDistancePct >= 0 && p.supportDistancePct <= 2.5) {
    score += 6;
    score += Math.max(0, 4 - p.supportDistancePct);
  } else if (p.supportDistancePct > 2.5 && p.supportDistancePct <= 6) {
    score += 3;
  } else if (p.supportDistancePct < -1) {
    score -= 2;
  }

  if (p.pivotAbove) score += 3;
  if (p.fibPassed) score += 4;

  if (p.sentimentLabel === "Positive") {
    score += 5 + Math.min(p.newsCount, 3);
  } else if (p.sentimentLabel === "Neutral") {
    score += 1.5;
  } else {
    score -= 4;
  }

  if (p.dayChangePct > 0) score += Math.min(p.dayChangePct, 3);
  else score += Math.max(p.dayChangePct * 0.5, -3);

  if (p.fundOk) score += 5;

  if (p.volumeSurge) {
    score += 5;
    if (p.emaTier >= 2 || p.pattern) score += 3;
  } else if (p.volumeRatio > 0 && p.volumeRatio < 0.7) {
    score -= 2;
  }

  if (p.supertrendBullish) score += 3;

  return Math.max(0, Math.min(100, Math.round(score)));
}

interface DriversInput {
  criteriaPassed: number;
  criteriaTotal: number;
  supportDistancePct: number;
  emaBullish: boolean;
  emaTier: 0 | 1 | 2 | 3;
  pattern: boolean;
  pivotAbove: boolean;
  fibPassed: boolean;
  sentimentLabel: "Positive" | "Neutral" | "Negative";
  volumeSurge: boolean;
  volumeRatio: number;
  supertrendBullish: boolean;
}

export function describeDrivers(d: DriversInput): string[] {
  const drivers: string[] = [];
  drivers.push(`${d.criteriaPassed}/${d.criteriaTotal} criteria met`);
  if (d.emaBullish) drivers.push("9/15 EMA bullish alignment");
  if (d.emaTier === 1 && !d.emaBullish) drivers.push("9/15 EMA about to intercept (tier 1)");
  if (d.pattern) drivers.push("Bullish candlestick on last candle");
  if (d.pivotAbove) drivers.push("Holding above daily pivot");
  if (d.fibPassed) drivers.push("Near Fibonacci 0.618 support");
  if (d.sentimentLabel === "Positive") drivers.push("Recent news flow positive");
  else if (d.sentimentLabel === "Negative") drivers.push("Recent news flow negative");
  if (d.supportDistancePct >= 0 && d.supportDistancePct <= 2.5) {
    drivers.push("Within 2.5% of major support");
  }
  if (d.volumeSurge) {
    drivers.push(`Volume surge ${d.volumeRatio.toFixed(1)}x avg`);
  } else if (d.volumeRatio > 0 && d.volumeRatio < 0.7) {
    drivers.push(`Low volume ${d.volumeRatio.toFixed(1)}x avg — weak confirmation`);
  }
  if (d.supertrendBullish) drivers.push("Supertrend UP — trend confirmed");
  else drivers.push("Supertrend DOWN");
  return drivers.slice(0, 12);
}

interface BearishInput {
  criteriaPassed: number;
  criteriaTotal: number;
  supportDistancePct: number;
  emaBullish: boolean;
  emaTier: 0 | 1 | 2 | 3;
  pattern: boolean;
  pivotAbove: boolean;
  fibPassed: boolean;
  sentimentLabel: "Positive" | "Neutral" | "Negative";
  newsCount: number;
  dayChangePct: number;
  fundOk: boolean;
  volumeSurge: boolean;
  supertrendBullish: boolean;
}

export function computeBearishProbability(p: BearishInput): number {
  let score = 0;
  const failed = p.criteriaTotal - p.criteriaPassed;
  score += (failed / p.criteriaTotal) * 40;

  if (!p.emaBullish && p.emaTier === 0) {
    score += 12;
  } else if (p.emaTier === 1) {
    score += 4;
  } else if (p.emaTier >= 2) {
    score += Math.max(0, 3 - p.criteriaPassed);
  }

  if (!p.pattern) score += 3;
  if (!p.pivotAbove) score += 5;
  if (!p.fibPassed) score += 4;

  if (p.supportDistancePct > 8) {
    score += 6;
    score += Math.min((p.supportDistancePct - 8) * 0.6, 4);
  } else if (p.supportDistancePct < -2) {
    score += 4;
  }

  if (p.sentimentLabel === "Negative") {
    score += 10 + Math.min(p.newsCount, 3);
  } else if (p.sentimentLabel === "Neutral") {
    score += 2;
  } else {
    score += 0;
  }

  if (p.dayChangePct < 0) score += Math.min(Math.abs(p.dayChangePct), 5);
  if (p.dayChangePct > 3) score += 2;

  if (!p.fundOk) score += 5;

  if (p.volumeSurge && !p.emaBullish) score += 4;
  if (p.volumeSurge && p.supertrendBullish === false) score += 3;

  if (!p.supertrendBullish) score += 4;

  return Math.max(0, Math.min(100, Math.round(score)));
}

interface BearishDriversInput {
  criteriaPassed: number;
  criteriaTotal: number;
  supportDistancePct: number;
  emaBullish: boolean;
  pattern: boolean;
  pivotAbove: boolean;
  fibPassed: boolean;
  sentimentLabel: "Positive" | "Neutral" | "Negative";
  volumeSurge: boolean;
  volumeRatio: number;
  supertrendBullish: boolean;
}

export function describeBearishDrivers(d: BearishDriversInput): string[] {
  const drivers: string[] = [];
  const failed = d.criteriaTotal - d.criteriaPassed;
  drivers.push(`${failed}/${d.criteriaTotal} criteria failed`);
  if (!d.emaBullish) drivers.push("9/15 EMA bearish / flat");
  if (!d.pattern) drivers.push("No bullish candlestick confirmation");
  if (!d.pivotAbove) drivers.push("Below daily pivot");
  if (!d.fibPassed) drivers.push("Away from Fibonacci 0.618");
  if (d.sentimentLabel === "Negative") drivers.push("Recent news flow negative");
  if (d.supportDistancePct > 8) drivers.push("Far from major support");
  if (d.volumeSurge && !d.emaBullish) drivers.push(`Volume surge ${d.volumeRatio.toFixed(1)}x confirms selling`);
  if (!d.supertrendBullish) drivers.push("Supertrend DOWN — bearish trend");
  return drivers.slice(0, 10);
}

/**
 * Applies a penalty to the bullish probability when a bearish candlestick
 * pattern is detected. Doesn't block a stock from showing up but visibly
 * cools down the bullish score so the warning is impossible to miss.
 */
function adjustForBearishPattern(prob: number, bearPattern: BearishPattern): number {
  if (bearPattern === "None") return prob;
  const penalty: Record<Exclude<BearishPattern, "None">, number> = {
    "Bearish Engulfing": 12,
    "Shooting Star": 8,
    "Evening Star": 14,
    "Hanging Man": 6,
    "Three Black Crows": 18,
    "Gravestone Doji": 8,
    "Dark Cloud Cover": 10,
  };
  return Math.max(0, Math.min(100, prob - penalty[bearPattern]));
}

// ---------------------------------------------------------------------------
// Event timestamp helpers (display only — never influence pass/fail or scores)
// ---------------------------------------------------------------------------

function eventClockLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

/** "at 12:00 PM" for intraday resolutions, "on 12 Aug 2026" for the 1D resolution. */
function eventLabel(dateStr: string, timeframe?: string): string {
  if (timeframe && timeframe !== "1D") {
    const t = eventClockLabel(dateStr);
    return t ? `at ${t}` : "";
  }
  // 1D mode always reflects the day the scan itself ran on — no separate
  // date badge needed, since it's implicitly "today".
  void dateStr;
  return "";
}

/** Index of the most recent candle where the 9 EMA crossed above the 15 EMA. */
function findEmaCrossIndex(closes: number[]): number {
  if (closes.length < 2) return -1;
  const e9 = ema(closes, 9);
  const e15 = ema(closes, 15);
  for (let i = closes.length - 1; i >= 1; i--) {
    if (e9[i] > e15[i] && e9[i - 1] <= e15[i - 1]) return i;
  }
  return -1;
}

/** Index of the most recent candle whose low touched a price level (within 1%). */
function findLevelTouchIndex(candles: Candle[], level: number): number {
  if (!level || level <= 0) return -1;
  const tol = level * 0.01;
  for (let i = candles.length - 1; i >= 0; i--) {
    const low = candles[i].low;
    if (low >= level - tol && low <= level + tol) return i;
  }
  return -1;
}

/** Index of the most recent candle whose volume exceeded 1.5x its trailing average. */
function findVolumeSurgeIndex(candles: Candle[]): number {
  if (candles.length < 5) return -1;
  const lookback = Math.min(20, candles.length - 1);
  for (let i = candles.length - 1; i >= 1; i--) {
    const start = Math.max(0, i - lookback);
    const avgSlice = candles.slice(start, i);
    if (avgSlice.length === 0) continue;
    const avg = avgSlice.reduce((s, c) => s + c.volume, 0) / avgSlice.length;
    if (avg > 0 && candles[i].volume > avg * 1.5) return i;
  }
  return -1;
}

/** Index of the most recent candle where Supertrend flipped from down to up. */
function findSupertrendFlipIndex(st: SupertrendPoint[]): number {
  for (let i = st.length - 1; i >= 1; i--) {
    if (st[i].trend === "up" && st[i - 1].trend === "down") return i;
  }
  return -1;
}

