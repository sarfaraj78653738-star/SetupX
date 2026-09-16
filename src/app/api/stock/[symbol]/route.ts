import { NextRequest, NextResponse } from "next/server";
import { fetchChartData, fetchNews, type Candle, type StockQuote } from "@/lib/marketData";
import { runScreen } from "@/lib/screener";
import { INDIAN_UNIVERSE } from "@/lib/marketData";
import { fetchFundamentalsFromScreener, toCrores } from "@/lib/fundamentals";
import { fetchNewsFromGoogle } from "@/lib/newsRss";
import {
  brokerProfile,
  brokerFetchHistorical,
  brokerGetInstrumentToken,
  brokerRequiresToken,
  getBrokerCredentialsFromHeaders,
} from "@/lib/broker";
import type { BrokerCredentials } from "@/lib/broker-types";
import {
  getClientIdentifier,
  globalLimiter,
  isSafeSymbol,
  scanLimiter,
} from "@/lib/security";
import { TIMEFRAME_CONFIG, VALID_TIMEFRAMES, type TimeframeKey } from "@/lib/timeframes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NEWS_MAX_AGE_HOURS = 24;
const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

const AVAILABLE_TF_KEYS = [...VALID_TIMEFRAMES];

function gate(req: NextRequest): NextResponse | null {
  const ip = getClientIdentifier(req.headers);
  const g = globalLimiter.consume(ip);
  if (!g.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { ...HEADERS, "Retry-After": String(g.retryAfter) } });
  }
  const s = scanLimiter.consume(ip);
  if (!s.allowed) {
    return NextResponse.json({ error: "Scan rate limit exceeded" }, { status: 429, headers: { ...HEADERS, "Retry-After": String(s.retryAfter) } });
  }
  return null;
}

function getQuoteFromCandles(kc: Candle[], symbol: string, name: string): StockQuote | null {
  if (kc.length < 2) return null;
  const last = kc[kc.length - 1];
  const prev = kc[kc.length - 2];
  const change = last.close - prev.close;
  const changePercent = prev.close > 0 ? (change / prev.close) * 100 : 0;
  return { symbol, name, exchange: "NSE", price: last.close, change, changePercent, volume: last.volume, prevClose: prev.close, dayHigh: last.high, dayLow: last.low };
}

async function fetchCandles(symbol: string, usingBroker: boolean, brokerCreds: BrokerCredentials | null, kiteInterval: string, kiteDays: number, yahooRange: string, yahooInterval: string, minCandles: number, allowYahooFallback = true): Promise<Candle[] | null> {
  if (usingBroker && brokerCreds) {
    try {
      if (brokerRequiresToken(brokerCreds.broker)) {
        const token = await brokerGetInstrumentToken(brokerCreds, symbol);
        if (token != null) {
          const kc = await brokerFetchHistorical(brokerCreds, symbol, kiteInterval, kiteDays, token);
          if (kc.length >= minCandles) return kc;
        }
      } else {
        const kc = await brokerFetchHistorical(brokerCreds, symbol, kiteInterval, kiteDays);
        if (kc.length >= minCandles) return kc;
      }
    } catch { /* fallback */ }
  }
  if (!allowYahooFallback) return null;
  try {
    const yh = await fetchChartData(symbol, yahooRange, yahooInterval);
    if (yh.candles.length >= minCandles) return yh.candles;
  } catch { /* ignore */ }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const rate = gate(req);
  if (rate) return rate;

  const { symbol: rawSymbol } = await params;
  const symbol = (rawSymbol || "").toUpperCase().trim();
  if (!isSafeSymbol(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400, headers: HEADERS });
  }

  const url = new URL(req.url);
  const timeframe = (url.searchParams.get("timeframe") || "1D") as TimeframeKey;
  const tf = TIMEFRAME_CONFIG[timeframe];
  if (!tf) {
    return NextResponse.json({ error: `Unsupported timeframe "${timeframe}". Use: ${AVAILABLE_TF_KEYS.join(", ")}` }, { status: 400, headers: HEADERS });
  }

  const universeItem = INDIAN_UNIVERSE.find((u) => u.symbol === symbol);
  const { creds: brokerCreds, error: headerErr } = getBrokerCredentialsFromHeaders(req.headers);
  if (headerErr) return headerErr;

  let usingBroker = false;
  if (brokerCreds) {
    try {
      const profile = await brokerProfile(brokerCreds);
      if (profile.status === "ok") usingBroker = true;
    } catch { /* */ }
  }

  const dailyConfig = TIMEFRAME_CONFIG["1D"];
  const isDaily1D = timeframe === "1D";


  // All of these are independent of each other (none needs another's result
  // to start), so run them concurrently instead of one-by-one. Previously
  // this was ~5-6 sequential network round-trips stacked back to back,
  // which is what made opening a stock take so long.
  const [dailyCandles, resolutionCandles, chartOnlyIntraday, todayIntradayRaw, news, newsRss, screenerFundamentals] =
    await Promise.all([
      fetchCandles(symbol, usingBroker, brokerCreds, dailyConfig.kiteInterval, dailyConfig.kiteDays, dailyConfig.yahooRange, dailyConfig.yahooInterval, dailyConfig.minCandles),
      // For 1D, the chart now uses the exact same daily config as the
      // criteria engine (previously it fetched 5-minute candles here by
      // mistake, which is why the "1 Day" chart looked identical to the
      // "5 Min" chart) — so there's no separate fetch needed; dailyCandles
      // is reused directly below.
      isDaily1D
        ? Promise.resolve(null)
        : fetchCandles(symbol, usingBroker, brokerCreds, tf.kiteInterval, tf.kiteDays, tf.yahooRange, tf.yahooInterval, tf.minCandles, false),
      // Separate SHORT-range fetch used only for what's actually drawn on
      // the intraday chart (today/last session, e.g. tf.chartKiteDays = 1-2
      // days) — kept distinct from the wide multi-day fetch above (which the
      // criteria engine needs for EMA/support/etc history). Without this,
      // the chart was showing the same multi-day window the criteria engine
      // uses, making a "5 Min" chart look like several days concatenated
      // instead of just today's session.
      !isDaily1D
        ? fetchCandles(symbol, usingBroker, brokerCreds, tf.chartKiteInterval, tf.chartKiteDays, tf.chartYahooRange, tf.chartYahooInterval, tf.chartMinCandles, false)
        : Promise.resolve(null),
      isDaily1D && usingBroker
        ? fetchCandles(symbol, usingBroker, brokerCreds, "5minute", 1, "1d", "5m", 1, false).catch(() => null)
        : Promise.resolve(null),
      fetchNews(symbol, { maxAgeHours: NEWS_MAX_AGE_HOURS }),
      fetchNewsFromGoogle(symbol, { maxAgeHours: NEWS_MAX_AGE_HOURS, limit: 8 }),
      fetchFundamentalsFromScreener(symbol).catch(() => null),
    ]);

  if (!dailyCandles) {
    return NextResponse.json({ error: "Cannot fetch daily candle data for criteria engine." }, { status: 404, headers: HEADERS });
  }

  let quote = getQuoteFromCandles(dailyCandles, symbol, universeItem?.name ?? symbol);

  // The criteria engine uses the WIDE multi-day resolutionCandles (it needs
  // enough history for EMA/support/pattern detection). The chart, however,
  // should only show today's (or the last trading session's) candles — that
  // uses the separate short-range chartOnlyIntraday fetch above.
  let chartCandles: Candle[] = [];
  let criteriaCandles: Candle[] = dailyCandles;
  let todayIntradayCandles: Candle[] | undefined =
    todayIntradayRaw && todayIntradayRaw.length > 0 ? todayIntradayRaw : undefined;

  if (isDaily1D) {
    chartCandles = dailyCandles;
  } else {
    const cc = resolutionCandles;
    if (cc) {
      criteriaCandles = cc;
      chartCandles = chartOnlyIntraday && chartOnlyIntraday.length > 0 ? chartOnlyIntraday : cc;
      // Keep the "Overview" price in sync with what the chart is actually
      // showing (previously Overview always used the separately-fetched
      // DAILY candle's price, which can differ from the intraday chart's
      // last candle since the two are fetched independently — causing the
      // two numbers on screen to visibly disagree). change%/day change
      // still anchors to yesterday's close, which is the correct reference.
      if (quote && chartCandles.length > 0) {
        const lastIntraday = chartCandles[chartCandles.length - 1];
        const prevDayClose = quote.prevClose;
        const newChange = prevDayClose > 0 ? lastIntraday.close - prevDayClose : quote.change;
        const newChangePercent = prevDayClose > 0 ? (newChange / prevDayClose) * 100 : quote.changePercent;
        quote = {
          ...quote,
          price: lastIntraday.close,
          change: newChange,
          changePercent: newChangePercent,
          dayHigh: Math.max(quote.dayHigh, lastIntraday.high),
          dayLow: Math.min(quote.dayLow, lastIntraday.low),
        };
      }
    }
  }

  if (chartCandles.length === 0 && tf.group !== "Days") {
    return NextResponse.json(
      {
        error: usingBroker
          ? `Could not fetch ${timeframe} data right now. Try again.`
          : `Connect a broker (Kite, Fyers, Angel One, or Groww) to view ${TIMEFRAME_CONFIG[timeframe].label} intraday data.`,
        insufficientData: true,
      },
      { status: 404, headers: HEADERS }
    );
  }
  if (chartCandles.length === 0 && isDaily1D) {
    chartCandles = dailyCandles;
  }

  const allNews = [...newsRss, ...news].slice(0, 10);

  let fundamentals: Parameters<typeof runScreen>[0]["fundamentals"] = {
    pe: undefined, marketCap: undefined, changePercent: quote?.changePercent ?? 0,
    fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh, fiftyTwoWeekLow: quote?.fiftyTwoWeekLow, price: quote?.price ?? 0,
  };
  if (screenerFundamentals) {
    const sf = screenerFundamentals;
    fundamentals = {
      pe: sf.pe, marketCap: toCrores(sf.marketCapCr), changePercent: quote?.changePercent ?? 0,
      fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh, fiftyTwoWeekLow: quote?.fiftyTwoWeekLow, price: quote?.price ?? 0,
      roe: sf.roe, roce: sf.roce, debtToEquity: sf.debtToEquity, dividendYield: sf.dividendYield,
      priceToBook: sf.priceToBook, promoterHolding: sf.promoterHolding, promoterPledge: sf.promoterPledge,
      salesGrowth: sf.salesGrowth, epsGrowth: sf.epsGrowth, industryPe: sf.industryPe,
    };
  }

  const result = runScreen({
    symbol, name: universeItem?.name ?? symbol, sector: universeItem?.sector ?? "Unknown",
    candles: criteriaCandles, quote: quote!, fundamentals, news: allNews, timeframe, todayIntradayCandles,
  });

  return NextResponse.json({
    result, chartCandles, candles: dailyCandles, quote, news: allNews,
    dataSource: usingBroker ? "kite" : "yahoo", brokerType: brokerCreds?.broker,
    dataAsOf: new Date().toISOString(),
    timeframe, availableTimeframes: AVAILABLE_TF_KEYS, cached: false,
  }, { headers: { ...HEADERS, "Cache-Control": "no-store" } });
}
