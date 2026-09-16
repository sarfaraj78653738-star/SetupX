import { NextRequest, NextResponse } from "next/server";
import {
  fetchChartData,
  fetchNews,
  type Candle,
  type StockQuote,
  type NewsItem,
  universeFor,
} from "@/lib/marketData";
import { runScreen, type ScreenResult } from "@/lib/screener";
import { fetchFundamentalsFromScreener, toCrores } from "@/lib/fundamentals";
import { fetchNewsFromGoogle, filterRecent } from "@/lib/newsRss";
import {
  brokerProfile,
  brokerFetchHistorical,
  brokerGetInstrumentToken,
  brokerRequiresToken,
  getBrokerCredentialsFromHeaders,
} from "@/lib/broker";
import type { BrokerCredentials, BrokerCandle } from "@/lib/broker-types";
import {
  getClientIdentifier,
  globalLimiter,
  isSafeLimit,
  isSafeScope,
  isSafeSymbol,
  scanLimiter,
} from "@/lib/security";
import { TIMEFRAME_CONFIG, type TimeframeKey } from "@/lib/timeframes";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const NEWS_MAX_AGE_HOURS = 24;
// Small daily window used only for the pivot point (previous full trading day's H/L/C).
const DAILY_PIVOT_DAYS = 10;
const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};
const METADATA_TIMEOUT_MS = 2000;
const CHART_TIMEOUT_MS = 3000;

interface ScanBudget {
  startedAt: number;
  deadlineMs: number;
}

function serverLog(scope: string, msg: string) {
  if (typeof console !== "undefined") console.warn(`[bsr:screener] ${scope} — ${msg}`);
}

function gate(req: NextRequest): NextResponse | null {
  const ip = getClientIdentifier(req.headers);
  const g = globalLimiter.consume(ip);
  if (!g.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { ...HEADERS, "Retry-After": String(g.retryAfter) } }
    );
  }
  const s = scanLimiter.consume(ip);
  if (!s.allowed) {
    return NextResponse.json(
      { error: "Scan rate limit exceeded" },
      { status: 429, headers: { ...HEADERS, "Retry-After": String(s.retryAfter) } }
    );
  }
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    p.then((v) => {
      if (timer) clearTimeout(timer);
      return v;
    }).catch((err) => {
      if (timer) clearTimeout(timer);
      serverLog(`timeout:${label}`, err instanceof Error ? err.message : String(err));
      return null as T | null;
    }),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        serverLog(`timeout:${label}`, `exceeded ${ms}ms`);
        resolve(null);
      }, ms);
    }),
  ]) as Promise<T | null>;
}

function remainingBudget(b: ScanBudget, defaultMs: number): number {
  const remaining = b.deadlineMs - (Date.now() - b.startedAt);
  return Math.max(50, Math.min(defaultMs, remaining));
}

export async function GET(req: NextRequest) {
  const rate = gate(req);
  if (rate) return rate;

  const { creds: brokerCreds, error: headerErr } = getBrokerCredentialsFromHeaders(req.headers);
  if (headerErr) return headerErr;

  const url = new URL(req.url);
  const symbolsParam = url.searchParams.get("symbols")?.slice(0, 4000) ?? "";
  const scopeParam = isSafeScope(url.searchParams.get("scope"));
  const requestedLimit = isSafeLimit(url.searchParams.get("limit"));
  const timeframeParam = url.searchParams.get("timeframe") || "1D";
  const tf = TIMEFRAME_CONFIG[timeframeParam as TimeframeKey];
  if (!tf) {
    return NextResponse.json(
      { error: `Unsupported timeframe "${timeframeParam}". Use: 5m, 15m, 30m, 1D` },
      { status: 400, headers: HEADERS }
    );
  }
  const isIntraday = timeframeParam !== "1D";

  let usingBroker = false;
  let brokerUser: string | undefined;
  let creds: BrokerCredentials | null = null;
  if (brokerCreds) {
    const profile = await brokerProfile(brokerCreds);
    if (profile.status === "ok") {
      usingBroker = true;
      brokerUser = profile.user?.user_name ?? profile.user?.user_id;
      creds = brokerCreds;
    }
  }

  if (isIntraday && !usingBroker) {
    return NextResponse.json(
      { error: "Connect a broker for intraday scanning. Daily view works without a broker.", timeframe: timeframeParam, kiteRequired: true },
      { status: 400, headers: HEADERS }
    );
  }

  const master = universeFor("all");
  const universe = symbolsParam
    ? symbolsParam
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0 && isSafeSymbol(s))
        .slice(0, 40)
        .map((sym) => {
          const found = master.find((u) => u.symbol === sym);
          return {
            symbol: sym,
            name: found?.name ?? sym,
            sector: found?.sector ?? "Unknown",
            indices: found?.indices ?? (["BROAD"] as const),
          };
        })
    : universeFor(scopeParam).slice(0, requestedLimit).map((u) => ({ ...u }));

  const MAX_DEADLINE_MS = 8_000;
  const budget: ScanBudget = {
    startedAt: Date.now(),
    deadlineMs: MAX_DEADLINE_MS,
  };

  const targetHorizonMs =
    universe.length <= 25 ? Math.max(8_000, universe.length * 800) : MAX_DEADLINE_MS;
  const perStockBudgetMs = Math.max(
    2_500,
    Math.min(12_000, Math.floor(targetHorizonMs / Math.max(2, Math.ceil(universe.length / 6))))
  );
  const CONCURRENCY = Math.max(
    4,
    Math.min(
      usingBroker ? 4 : 6,
      Math.ceil(universe.length / Math.max(1, Math.floor(targetHorizonMs / perStockBudgetMs)))
    )
  );

  const results: ScreenResult[] = [];
  const skipped: Array<{ symbol: string; reason: string }> = [];
  let cursor = 0;

  async function worker() {
    while (cursor < universe.length) {
      if (Date.now() - budget.startedAt > budget.deadlineMs * 0.9) break;
      const idx = cursor++;
      const item = universe[idx];
      try {
        let itemCandles: Candle[] = [];
        let itemDailyCandles: Candle[] | null = null;
        let itemTodayIntraday: Candle[] | null = null;
        let itemQuote: StockQuote | null = null;

        if (creds) {
          const interval = tf ? tf.kiteInterval : "day";
          const days = tf ? tf.kiteDays : 180;
          let kc: BrokerCandle[] | null = null;
          let dailyKc: BrokerCandle[] | null = null;
          let todayKc: BrokerCandle[] | null = null;
          let token: string | null = null;
          if (brokerRequiresToken(creds.broker)) {
            token = await withTimeout(
              brokerGetInstrumentToken(creds, item.symbol).catch(() => null),
              Math.min(3_000, remainingBudget(budget, 3_000)),
              "brokerInstrumentLookup"
            );
          }
          if (!brokerRequiresToken(creds.broker) || token != null) {
            const histArgs = brokerRequiresToken(creds.broker)
              ? ([token as string] as const)
              : ([] as const);
            const [kcRes, dailyRes, todayRes] = await Promise.all([
              withTimeout(
                brokerFetchHistorical(creds, item.symbol, interval, days, ...histArgs),
                remainingBudget(budget, CHART_TIMEOUT_MS),
                "brokerHistorical"
              ),
              isIntraday
                ? withTimeout(
                    brokerFetchHistorical(creds, item.symbol, "day", DAILY_PIVOT_DAYS, ...histArgs),
                    remainingBudget(budget, CHART_TIMEOUT_MS),
                    "brokerDailyPivot"
                  )
                : Promise.resolve(null),
              // Only fetched for 1D scans — gives real today-clock-times for
              // Pivot/Support/Fibonacci criteria (display only, never affects
              // pass/fail). Kept to just 1 day back to minimize added load.
              !isIntraday
                ? withTimeout(
                    brokerFetchHistorical(creds, item.symbol, TIMEFRAME_CONFIG["5m"].kiteInterval, 1, ...histArgs),
                    remainingBudget(budget, CHART_TIMEOUT_MS),
                    "brokerTodayIntraday"
                  ).catch(() => null)
                : Promise.resolve(null),
            ]);
            kc = kcRes;
            dailyKc = dailyRes;
            todayKc = todayRes;
          }
          if (kc && kc.length >= (tf ? tf.minCandles : 35)) {
            const last = kc[kc.length - 1];
            const prev = kc[kc.length - 2];
            const change = last.close - prev.close;
            const changePercent = (change / prev.close) * 100;
            itemQuote = {
              symbol: item.symbol,
              name: item.name,
              exchange: "NSE",
              price: last.close,
              change,
              changePercent,
              volume: last.volume,
              prevClose: prev.close,
              dayHigh: last.high,
              dayLow: last.low,
            };
            itemCandles = kc;
            itemDailyCandles = dailyKc;
            itemTodayIntraday = todayKc && todayKc.length > 0 ? todayKc : null;
          }
        }

        if (!itemQuote || itemCandles.length < (tf ? tf.minCandles : 35)) {
          if (isIntraday) {
            skipped.push({ symbol: item.symbol, reason: "broker_intraday_failed" });
            continue;
          }
          const yh = await withTimeout(
            fetchChartData(item.symbol, tf?.yahooRange ?? "6mo", tf?.yahooInterval ?? "1d"),
            remainingBudget(budget, CHART_TIMEOUT_MS),
            `yahooChart:${item.symbol}`
          );
          if (yh) {
            itemCandles = yh.candles;
            itemQuote = yh.quote;
          }
        }
        if (!itemQuote || itemCandles.length < 35) {
          skipped.push({ symbol: item.symbol, reason: "chart_fetch_failed" });
          continue;
        }

        const metaBudget = remainingBudget(budget, METADATA_TIMEOUT_MS);
        const [news, newsRss, sf] = await Promise.all([
          withTimeout(fetchNews(item.symbol, { maxAgeHours: NEWS_MAX_AGE_HOURS }), metaBudget, `yahooNews:${item.symbol}`),
          withTimeout(
            fetchNewsFromGoogle(item.symbol, {
              maxAgeHours: NEWS_MAX_AGE_HOURS,
              limit: 8,
              timeoutMs: Math.min(4_000, metaBudget - 200),
            }),
            metaBudget,
            `googleNews:${item.symbol}`
          ),
          withTimeout(
            fetchFundamentalsFromScreener(item.symbol, { timeoutMs: Math.max(2500, Math.min(3_500, metaBudget - 200)) }),
            metaBudget,
            `fundamentals:${item.symbol}`
          ),
        ]);

        const newsData = filterRecent(
          [
            ...coerceArr<NewsItem>(newsRss),
            ...coerceArr<NewsItem>(news),
          ].slice(0, 12),
          NEWS_MAX_AGE_HOURS
        );
        const fundamentals = sf
          ? {
              pe: sf.pe,
              marketCap: toCrores(sf.marketCapCr),
              changePercent: itemQuote.changePercent,
              fiftyTwoWeekHigh: itemQuote.fiftyTwoWeekHigh,
              fiftyTwoWeekLow: itemQuote.fiftyTwoWeekLow,
              price: itemQuote.price,
              roe: sf.roe,
              roce: sf.roce,
              debtToEquity: sf.debtToEquity,
              dividendYield: sf.dividendYield,
              priceToBook: sf.priceToBook,
              promoterHolding: sf.promoterHolding,
              promoterPledge: sf.promoterPledge,
              salesGrowth: sf.salesGrowth,
              epsGrowth: sf.epsGrowth,
              industryPe: sf.industryPe,
            }
          : {
              pe: undefined,
              marketCap: undefined,
              changePercent: itemQuote.changePercent,
              fiftyTwoWeekHigh: itemQuote.fiftyTwoWeekHigh,
              fiftyTwoWeekLow: itemQuote.fiftyTwoWeekLow,
              price: itemQuote.price,
            };

        const r = runScreen({
          symbol: item.symbol,
          name: item.name,
          sector: item.sector,
          candles: itemCandles,
          dailyCandles:
            isIntraday && itemDailyCandles && itemDailyCandles.length >= 2
              ? itemDailyCandles
              : undefined,
          todayIntradayCandles:
            !isIntraday && itemTodayIntraday && itemTodayIntraday.length > 0
              ? itemTodayIntraday
              : undefined,
          timeframe: timeframeParam,
          quote: itemQuote,
          fundamentals,
          news: newsData,
        });
        if (r) {
          results.push({ ...r, indices: item.indices });
        }
      } catch (err) {
        skipped.push({
          symbol: item.symbol,
          reason: err instanceof Error ? err.message : "unknown",
        });
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const elapsedMs = Date.now() - budget.startedAt;
  if (results.length === 0 && universe.length > 0) {
    serverLog(
      "scan-empty",
      `universe=${universe.length} elapsedMs=${elapsedMs} skipped=${skipped.length}`
    );
  } else if (elapsedMs > 45_000) {
    serverLog(
      "scan-slow",
      `universe=${universe.length} elapsedMs=${elapsedMs} results=${results.length}`
    );
  }

  const matches = results
    .filter((r) => r.rating === 10)
    .sort((a, b) => b.bullishProbability - a.bullishProbability);
  const close = results
    .filter((r) => r.criteriaPassed >= 5 && r.rating !== 10)
    .sort((a, b) => b.bullishProbability - a.bullishProbability);

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      universeScanned: universe.length,
      matches,
      close: close.slice(0, 30),
      totalEvaluated: results.length,
      dataSource: usingBroker ? "kite" : "yahoo",
      brokerType: creds?.broker,
      brokerUser,
      elapsedMs,
      timeframe: timeframeParam,
      scanRequested: universe.length,
      message:
        matches.length === 0 && close.length === 0
          ? "No stocks met the criteria in the selected universe. Try a wider universe or wait for market conditions to align."
          : undefined,
    },
    { headers: { ...HEADERS, "Cache-Control": "no-store" } }
  );
}

function coerceArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
