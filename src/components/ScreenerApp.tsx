"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { ScreenResult } from "@/lib/screener";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  Newspaper,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  X,
  XCircle,
  Radio,
} from "lucide-react";
import BrokerSettings, { BrokerStatusPill, type StoredBrokerCredentials, loadBrokerCreds } from "@/components/BrokerSettings";
import { getBrokerAuthHeaders, getBrokerLabel } from "@/lib/broker";
import type { BrokerType } from "@/lib/broker-types";
import PriceChart from "@/components/PriceChart";
import TradingCalculators from "@/components/TradingCalculators";
import AcknowledgmentModal from "@/components/AcknowledgmentModal";
import { TIMEFRAME_CONFIG, VALID_TIMEFRAMES } from "@/lib/timeframes";

interface ScreenerResponse {
  generatedAt: string;
  universeScanned: number;
  matches: ScreenResult[];
  close: ScreenResult[];
  totalEvaluated: number;
  dataSource?: "kite" | "yahoo";
  brokerType?: string;
  brokerUser?: string;
  timeframe?: string;
  kiteRequired?: boolean;
}

interface StockDetailResponse {
  result: ScreenResult;
   candles: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>;
  quote: { price: number; change: number; changePercent: number; prevClose: number; dayHigh: number; dayLow: number };
  news: Array<{ title: string; publisher: string; link: string; publishedAt: string; symbol: string }>;
  chartCandles?: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>;
  dataAsOf?: string;
  cached?: boolean;
  timeframe?: string;
  availableTimeframes?: string[];
  insufficientData?: boolean;
  error?: string;
}

function formatIN(n: number, digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

function formatVolume(v: number) {
  if (!v) return "—";
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)}L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toString();
}

function timeSince(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

class ScanHttpError extends Error {
  status: number;
  retryAfter?: number;
  kiteRequired?: boolean;
  constructor(status: number, message: string, retryAfter?: number, kiteRequired?: boolean) {
    super(message || `HTTP ${status}`);
    this.status = status;
    this.retryAfter = retryAfter;
    this.kiteRequired = kiteRequired;
  }
}

function parseRetryAfter(h: string | null): number | undefined {
  if (!h) return undefined;
  const n = parseInt(h, 10);
  if (Number.isFinite(n) && n >= 0) return n;
  const date = Date.parse(h);
  if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  return undefined;
}

function friendlyError(status: number, bodyMessage: string): string {
  const m = (bodyMessage || "").trim();
  switch (status) {
    case 429:
      return "Too many scans — please wait a moment and try again.";
    case 400:
      return m || "Invalid request.";
    case 401:
      return "Broker credentials look invalid. Re-connect from the broker settings.";
    case 502:
      return "Bad gateway — try again in a moment.";
    case 503:
      return "Service temporarily unavailable — try again in a moment.";
    case 504:
      return "Scan took too long — try a smaller universe (e.g. Nifty 50 instead of All NSE).";
    default:
      if (status >= 500) return "Server error. Try a smaller scope.";
      return m || `Request failed (HTTP ${status}).`;
  }
}

function buildDetail(status: number, bodyMessage: string, retryAfter?: number): string {
  return `${status}|${bodyMessage || ""}|${retryAfter ?? ""}`;
}

const TIMEFRAME_LABELS: Record<string, string> = Object.fromEntries(
  VALID_TIMEFRAMES.map((k) => [k, TIMEFRAME_CONFIG[k].label]),
) as Record<string, string>;

const SCAN_TIMEFRAMES = VALID_TIMEFRAMES.map((k) => ({
  key: k,
  label: TIMEFRAME_CONFIG[k].label,
}));

const DETAIL_TIMEFRAMES = SCAN_TIMEFRAMES;

export default function ScreenerApp() {
  const router = useRouter();
  const [data, setData] = useState<ScreenerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [detail, setDetail] = useState<StockDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<{ insufficientData?: boolean; message?: string } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [progress, setProgress] = useState(0);
  const [tab, setTab] = useState<"top" | "close" | "all">("close");
  const [scope, setScope] = useState<"all" | "nifty50" | "niftynext50" | "bse">("all");
  const [scanTimeframe, setScanTimeframe] = useState<string>("1D");
  const [brokerOpen, setBrokerOpen] = useState(false);
  const [brokerCreds, setBrokerCreds] = useState<StoredBrokerCredentials | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("1D");
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedTimeframeRef = useRef(selectedTimeframe);
  const detailLoadedRef = useRef(false);

  useEffect(() => {
    selectedTimeframeRef.current = selectedTimeframe;
  }, [selectedTimeframe]);

  const activeBroker: BrokerType | null = brokerCreds?.broker ?? null;

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    };
  }, []);

  function startRetryCountdown(seconds: number) {
    if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    const end = Date.now() + seconds * 1000;
    setRetryCountdown(Math.max(1, seconds));
    retryTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setRetryCountdown(remaining);
      if (remaining <= 0 && retryTimerRef.current) {
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    }, 1000);
  }

  useEffect(() => {
    setBrokerCreds(loadBrokerCreds());
  }, []);

  const buildHeaders = useCallback(() => {
    const headers: Record<string, string> = {};
    const creds = loadBrokerCreds();
    if (creds) {
      Object.assign(headers, getBrokerAuthHeaders(creds));
    }
    return headers;
  }, []);

  const runScan = useCallback(
    async (mode: "results" | "all" = "all") => {
      setLoading(true);
      setError(null);
      setErrorDetail(null);
      setRetryCountdown(null);
      setProgress(5);
      const interval = setInterval(() => setProgress((p) => Math.min(p + 9, 90)), 600);
      const clientTimeoutMs = 55_000;
      const clientCtl = new AbortController();
      const clientTimer = setTimeout(() => clientCtl.abort(), clientTimeoutMs);
      try {
        const limit = mode === "results" ? 120 : 50;
        const headers = buildHeaders();
        const params = new URLSearchParams({ limit: String(limit), scope, timeframe: scanTimeframe });
        const res = await fetch(`/api/screener?${params.toString()}`, {
          cache: "no-store",
          headers,
          signal: clientCtl.signal,
        });
        if (!res.ok) {
          let bodyMessage = "";
          let kiteRequired = false;
          try {
            const body = (await res.json()) as { error?: string; message?: string; kiteRequired?: boolean };
            bodyMessage = body.message ?? body.error ?? "";
            kiteRequired = body.kiteRequired ?? false;
          } catch {
            // ignore
          }
          const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
          throw new ScanHttpError(res.status, bodyMessage, retryAfter, kiteRequired);
        }
        const json = (await res.json()) as ScreenerResponse;
        setData(json);
        setProgress(100);
      } catch (e) {
        if (e instanceof ScanHttpError) {
          if (e.kiteRequired) {
            setError("Connect a broker for intraday scanning (5m / 15m / 30m). Daily view works without a broker.");
          } else {
            setError(friendlyError(e.status, e.message));
          }
          if (e.retryAfter) startRetryCountdown(e.retryAfter);
          setErrorDetail(buildDetail(e.status, e.message, e.retryAfter));
        } else if (e instanceof DOMException && e.name === "AbortError") {
          setError(
            "Scan timed out before the server responded. Try the Nifty 50 scope or check your network."
          );
          setErrorDetail("clientAbort");
        } else {
          setError(e instanceof Error ? e.message : "Unknown error");
          setErrorDetail("unknown");
        }
      } finally {
        clearTimeout(clientTimer);
        clearInterval(interval);
        setTimeout(() => {
          setLoading(false);
          setProgress(0);
        }, 400);
      }
    },
    [scope, scanTimeframe, buildHeaders]
  );

  useEffect(() => {
    setData(null);
    runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, scanTimeframe, brokerCreds]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      runScan("results");
    }, 300000);
    return () => clearInterval(t);
  }, [autoRefresh, runScan]);

const SCOPE_LABELS: Record<string, string> = {
  all: "All NSE",
  nifty50: "Nifty 50",
  niftynext50: "Nifty Next 50",
  bse: "BSE Sensex",
};

  useEffect(() => {
    if (!selectedSymbol) {
      detailLoadedRef.current = false;
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    detailLoadedRef.current = false;
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    // Every freshly opened stock starts on 1 Day, regardless of what
    // timeframe was left selected on a previously viewed stock — otherwise
    // the new stock silently inherits a leftover intraday selection, and a
    // different chart can appear to "flash in" shortly after opening.
    setSelectedTimeframe("1D");
    const tf = "1D";
    const headers = buildHeaders();
    const params = new URLSearchParams({ timeframe: tf });
    const url = `/api/stock/${encodeURIComponent(selectedSymbol)}?${params.toString()}`;
    const c = new AbortController();
    fetch(url, { cache: "no-store", headers, signal: c.signal })
      .then((r) => r.json())
      .then((d: StockDetailResponse & { error?: string; insufficientData?: boolean }) => {
        if (d.insufficientData) {
          setDetail(null);
          setDetailError({ insufficientData: true, message: d.error || `Data not available for ${tf}` });
        } else if (d.error) {
          setDetail(null);
          setDetailError({ insufficientData: false, message: d.error });
        } else {
          detailLoadedRef.current = true;
          setDetail(d);
          setDetailError(null);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setDetail(null);
          setDetailError({ insufficientData: false, message: "Could not load data. Try again." });
        }
      })
      .finally(() => { if (!c.signal.aborted) setDetailLoading(false); });
    return () => c.abort();
  }, [selectedSymbol, brokerCreds, buildHeaders]);

  // Changing the detail timeframe re-runs everything for that resolution —
  // criteria checklist, chart candles, and Support/Resistance/Pivot lines
  // are all recomputed from THAT timeframe's own data (5m/15m/30m/1D each
  // scan and show independent numbers, exactly as originally agreed).
  // Previously this only swapped the chart candles while leaving the
  // criteria/levels frozen at whatever the first (1D) load had computed —
  // that's why Support/Resistance/Pivot looked identical across every tab.
  useEffect(() => {
    if (!selectedSymbol || !detailLoadedRef.current) return;
    const headers = buildHeaders();
    const params = new URLSearchParams({ timeframe: selectedTimeframe });
    const url = `/api/stock/${encodeURIComponent(selectedSymbol)}?${params.toString()}`;
    const c = new AbortController();
    fetch(url, { cache: "no-store", headers, signal: c.signal })
      .then((r) => r.json())
      .then((d: StockDetailResponse & { error?: string; insufficientData?: boolean }) => {
        if (d.insufficientData) {
          setDetailError({ insufficientData: true, message: d.error || `Data not available for ${selectedTimeframeRef.current}` });
        } else if (d.error) {
          setDetailError({ insufficientData: false, message: d.error });
        } else {
          setDetail(d);
          setDetailError(null);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setDetailError({ insufficientData: false, message: "Could not load data. Try again." });
        }
      });
    return () => c.abort();
  }, [selectedSymbol, selectedTimeframe, brokerCreds, buildHeaders]);

  const lastPolledPriceRef = useRef<number | null>(null);
  const lastFullRefreshAtRef = useRef<number>(0);

  useEffect(() => {
    if (!selectedSymbol) return;
    const headers = buildHeaders();
    // Quote checks are cheap (single current-price lookup), so they can run
    // often without adding real load — the expensive full fetch (candles +
    // criteria + news + fundamentals) only fires when price actually moves.
    const quoteIntervalMs = brokerCreds ? 4000 : 15000;
    // Safety net: even if price is perfectly flat, still refresh fully every
    // couple of minutes so news/criteria don't go stale indefinitely.
    const SAFETY_REFRESH_MS = 120000;
    const symbolAtMount = selectedSymbol;
    lastPolledPriceRef.current = null;
    lastFullRefreshAtRef.current = Date.now();

    const fullParams = () => new URLSearchParams({ timeframe: selectedTimeframeRef.current });
    const fullUrl = () => `/api/stock/${encodeURIComponent(symbolAtMount)}?${fullParams().toString()}`;
    const quoteUrl = `/api/stock/${encodeURIComponent(symbolAtMount)}/quote`;

    let active = true;

    const runFullFetch = () => {
      const c = new AbortController();
      fetch(fullUrl(), { cache: "no-store", headers, signal: c.signal })
        .then((r) => r.json())
        .then((d: StockDetailResponse & { error?: string; insufficientData?: boolean }) => {
          if (!active) return;
          if (d.insufficientData) {
            setDetail(null);
            setDetailError({ insufficientData: true, message: d.error || `Data not available for ${selectedTimeframeRef.current}` });
          } else if (d.error) {
            setDetail(null);
            setDetailError({ insufficientData: false, message: d.error });
          } else if (!d.insufficientData) {
            setDetail(d);
            setDetailError(null);
          }
          lastFullRefreshAtRef.current = Date.now();
        })
        .catch(() => { /* silent */ });
    };

    const poll = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const c = new AbortController();
      fetch(quoteUrl, { cache: "no-store", headers, signal: c.signal })
        .then((r) => r.json())
        .then((d: { price?: number; error?: string }) => {
          if (!active) return;
          const price = typeof d.price === "number" ? d.price : null;
          const priceChanged =
            price != null && (lastPolledPriceRef.current == null || price !== lastPolledPriceRef.current);
          const dueForSafetyRefresh = Date.now() - lastFullRefreshAtRef.current > SAFETY_REFRESH_MS;
          if (price != null) lastPolledPriceRef.current = price;
          if (priceChanged || dueForSafetyRefresh || price == null) {
            // price == null means the cheap quote failed (e.g. broker not
            // connected) — fall back to the full fetch so the view still
            // updates rather than silently freezing.
            runFullFetch();
          }
        })
        .catch(() => { /* silent */ });
    };

    const timer = setInterval(poll, quoteIntervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selectedSymbol, brokerCreds, buildHeaders]);

  const matches = data?.matches ?? [];
  const close = data?.close ?? [];
  const usingBroker = data?.dataSource === "kite" || !!data?.brokerType;

  const visible = useMemo(() => {
    if (tab === "top") return matches;
    if (tab === "close") return close;
    return [...matches, ...close].sort((a, b) => b.criteriaPassed - a.criteriaPassed);
  }, [tab, matches, close]);

  const homeResult = useMemo(() => {
    if (!selectedSymbol) return null;
    const all = [...(data?.matches ?? []), ...(data?.close ?? [])];
    return all.find((r) => r.symbol === selectedSymbol) ?? null;
  }, [data, selectedSymbol]);

  return (
    <div className="bsr-shell min-h-screen w-full">
      <Header
        loading={loading}
        progress={progress}
        autoRefresh={autoRefresh}
        setAutoRefresh={setAutoRefresh}
        onScan={() => runScan()}
        generatedAt={data?.generatedAt}
        evaluated={data?.totalEvaluated}
        matches={matches.length}
        usingBroker={usingBroker}
        brokerType={data?.brokerType}
        brokerUser={data?.brokerUser}
        onOpenBroker={() => setBrokerOpen(true)}
        brokerConnected={!!brokerCreds}
        activeBroker={activeBroker}
      />

      <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">
              {usingBroker ? "Live Broker Screener" : "SetupX Screener"}
            </h2>
            <p className="mt-0.5 text-sm text-gray-400">
              {data?.timeframe
                ? `Showing ${TIMEFRAME_LABELS[data.timeframe] ?? data.timeframe} setups — ${SCOPE_LABELS[scope] ?? scope}`
                : `A systematic, criteria-based screener for the Indian equity market — combining technical, fundamental, and sentiment signals into a single transparent rating.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Timeframe</span>
              <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5">
                {SCAN_TIMEFRAMES.map((tf) => {
                  const active = scanTimeframe === tf.key;
                  return (
                    <button
                      key={tf.key}
                      onClick={() => {
                        setScanTimeframe(tf.key);
                        setSelectedTimeframe(tf.key);
                      }}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? "bg-cyan-500/30 text-cyan-100"
                          : "text-gray-300 hover:bg-white/5 hover:text-white"
                      }`}
                      type="button"
                    >
                      {tf.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Universe</span>
              <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5">
              {(
                [
                  { id: "all", label: "All NSE" },
                  { id: "nifty50", label: "Nifty 50" },
                  { id: "niftynext50", label: "Nifty Next 50" },
                  { id: "bse", label: "BSE Sensex" },
                ] as const
              ).map((opt) => {
                const active = scope === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setScope(opt.id);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "bg-indigo-500/30 text-indigo-100"
                        : "text-gray-300 hover:bg-white/5 hover:text-white"
                    }`}
                    type="button"
                  >
                    {opt.label}
                  </button>
                );
              })}
              </div>
            </div>
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="bg-white/5">
              <TabsTrigger
                value="top"
                className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300 text-gray-200"
              >
                Qualified <span className="ml-1 text-xs opacity-70">({matches.length})</span>
              </TabsTrigger>
              <TabsTrigger
                value="close"
                className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300 text-gray-200"
              >
                Close <span className="ml-1 text-xs opacity-70">({close.length})</span>
              </TabsTrigger>
              <TabsTrigger
                value="all"
                className="data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-300 text-gray-200"
              >
                All <span className="ml-1 text-xs opacity-70">({matches.length + close.length})</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {error && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            <span className="flex items-center gap-2">
              <XCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </span>
            <div className="flex items-center gap-3">
              {retryCountdown != null && retryCountdown > 0 && (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                  retry in {retryCountdown}s
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => runScan()}
                className="border-rose-400/30 text-rose-200 hover:bg-rose-500/10"
              >
                <RefreshCw className="mr-1 h-3 w-3" /> Try again
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {loading && !data
            ? Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl bg-white/5" />
              ))
            : null}
          {!loading && visible.length === 0 && (
            <div className="col-span-full flex h-48 flex-col items-center justify-center rounded-xl border border-white/10 bg-white/5 text-center text-gray-400">
              <Search className="mb-2 h-7 w-7 text-gray-500" />
              <p className="text-sm">No stocks currently pass the strict criteria.</p>
              <p className="mt-1 text-xs text-gray-500">
                Try a fresh scan, or widen the universe via{" "}
                <code className="rounded bg-white/10 px-1">?symbols=...</code>.
              </p>
            </div>
          )}
          {visible.map((r) => (
            <StockRow
              key={r.symbol}
              result={r}
              active={selectedSymbol === r.symbol}
              onClick={() => setSelectedSymbol(r.symbol)}
            />
          ))}
        </div>
      </main>

      <AnimatePresence>
        {selectedSymbol && (
          <DetailDrawer
            symbol={selectedSymbol}
            detail={detail}
            homeResult={homeResult}
            detailError={detailError}
            loading={detailLoading}
            onClose={() => setSelectedSymbol(null)}
            selectedTimeframe={selectedTimeframe}
            onTimeframeChange={(tf) => setSelectedTimeframe(tf)}
          />
        )}
      </AnimatePresence>

      <BrokerSettings
        open={brokerOpen}
        onOpenChange={setBrokerOpen}
        onCredentialsChange={(c) => {
          setBrokerCreds(c);
          router.refresh();
        }}
      />
      <AcknowledgmentModal />
    </div>
  );
}

function Header({
  loading,
  progress,
  autoRefresh,
  setAutoRefresh,
  onScan,
  generatedAt,
  evaluated,
  matches,
  usingBroker,
  brokerType,
  brokerUser,
  onOpenBroker,
  brokerConnected,
  activeBroker,
}: {
  loading: boolean;
  progress: number;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  onScan: () => void;
  generatedAt?: string;
  evaluated?: number;
  matches: number;
  usingBroker: boolean;
  brokerType?: string;
  brokerUser?: string;
  onOpenBroker: () => void;
  brokerConnected: boolean;
  activeBroker: BrokerType | null;
}) {
  const brokerLabel = activeBroker ? getBrokerLabel(activeBroker) : undefined;
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b1020]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="SetupX" width={40} height={40} className="rounded-xl" />
          <div>
            <h1 className="text-lg font-bold text-white sm:text-xl">SetupX</h1>
            <p className="text-xs text-gray-400">
              Live NSE/BSE Screener
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-200">
            <Radio
              className={`h-3.5 w-3.5 ${usingBroker ? "text-emerald-400" : "text-amber-400"}`}
            />
            <span className="font-medium text-gray-100">
              {usingBroker ? `Live · ${brokerType ?? brokerLabel ?? "Broker"}${brokerUser ? ` (${brokerUser})` : ""}` : "Delay · 15 min"}
            </span>
          </div>
          <div className="hidden items-center gap-3 text-xs text-gray-300 sm:flex">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-indigo-300" />
              {evaluated ?? 0} scanned
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              {matches} perfect
            </span>
            {generatedAt && <span className="text-gray-400">{timeSince(generatedAt)}</span>}
          </div>

          <BrokerStatusPill connected={brokerConnected} brokerLabel={brokerLabel} onOpen={onOpenBroker} />

          <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-200">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-indigo-400"
            />
            Auto
          </label>

          <Button
            onClick={onScan}
            disabled={loading}
            size="sm"
            className="bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-400"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Scan
          </Button>
        </div>
      </div>
      {loading && (
        <div className="h-0.5 w-full">
          <Progress value={progress} className="h-0.5 rounded-none bg-white/5" />
        </div>
      )}
    </header>
  );
}

function StockRow({
  result,
  active,
  onClick,
}: {
  result: ScreenResult;
  active: boolean;
  onClick: () => void;
}) {
  const isPerfect = result.rating === 10;
  const coreCriteria = result.criteria.filter((c) => !c.informational);
  return (
    <button
      onClick={onClick}
      className={`bsr-card bsr-card-hover w-full p-4 text-left ${
        active ? "!border-indigo-400/60 shadow-lg shadow-indigo-500/10" : ""
      }`}
      style={{ cursor: "pointer" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 min-w-10 items-center justify-center rounded-lg px-2 text-sm font-bold ${
              isPerfect
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-white/10 text-indigo-200"
            }`}
          >
            {isPerfect ? "Qualified" : result.criteriaPassed}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-base font-semibold text-white">{result.symbol.replace("-", "")}</span>
              <EmaTierBadge tier={result.details?.emaTier ?? 0} />
              {result.details?.bullishPattern && result.details.bullishPattern !== "None" && (
                <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 border border-amber-500/20">
                  {result.details.bullishPattern}
                </span>
              )}
            </div>
            <div className="line-clamp-1 text-xs text-gray-400">
              {result.name} · {result.sector}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="bsr-mono text-base text-white">₹{formatIN(result.price)}</div>
          <div
            className={`bsr-mono text-xs font-medium ${
              result.changePercent >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {result.changePercent >= 0 ? "+" : ""}
            {result.changePercent.toFixed(2)}%
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {coreCriteria.map((c) => (
          <span
            key={c.name}
            className={`bsr-chip ${c.passed ? "bsr-pass" : "bsr-fail"}`}
            title={c.reason}
          >
            {c.passed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {c.name}
          </span>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ProbabilityBar label="Bullish" value={result.bullishProbability ?? 0} type="bull" />
        <ProbabilityBar label="Bearish" value={result.bearishProbability ?? 0} type="bear" />
      </div>
    </button>
  );
}

function EmaTierBadge({ tier }: { tier: 0 | 1 | 2 | 3 }) {
  if (tier === 3) {
    return (
      <span
        className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/40"
        title="Tier 3: 9 EMA completed bullish crossover of 15 EMA"
      >
        EMA · 3PTS
      </span>
    );
  }
  if (tier === 2) {
    return (
      <span
        className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30"
        title="Tier 2: 9 EMA touching / almost crossed 15 EMA"
      >
        EMA · 2PTS
      </span>
    );
  }
  if (tier === 1) {
    return (
      <span
        className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/40"
        title="Tier 1: 9 EMA about to intercept 15 EMA"
      >
        EMA · 1PT
      </span>
    );
  }
  return (
    <span
      className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30"
      title="Tier 0: no bullish EMA signal"
    >
      EMA · —
    </span>
  );
}

function TimeframeSelector({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (tf: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {DETAIL_TIMEFRAMES.map(({ key, label }) => {
        const active = selected === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
              active
                ? "bg-indigo-500 text-white shadow-sm"
                : "bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ProbabilityBar({
  label,
  value,
  type,
}: {
  label: string;
  value: number;
  type: "bull" | "bear";
}) {
  const isBull = type === "bull";
  const color = isBull ? "#34d399" : "#fb7185";
  const bg = isBull ? "bg-emerald-500/10" : "bg-rose-500/10";
  return (
    <div className={`rounded-md ${bg} p-2`}>
      <div className="flex items-center justify-between text-[10px] font-medium">
        <span className={isBull ? "text-emerald-200" : "text-rose-200"}>{label}</span>
        <span className="bsr-mono font-bold" style={{ color }}>
          {value}%
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function DetailDrawer({
  symbol,
  detail,
  homeResult,
  detailError,
  loading,
  onClose,
  selectedTimeframe,
  onTimeframeChange,
}: {
  symbol: string;
  detail: StockDetailResponse | null;
  homeResult: ScreenResult | null;
  detailError: { insufficientData?: boolean; message?: string } | null;
  loading: boolean;
  onClose: () => void;
  selectedTimeframe: string;
  onTimeframeChange: (tf: string) => void;
}) {
  // The recommendation always comes from the home-screen scan result, never from
  // re-scanning when the detail chart timeframe changes.
  const rec = homeResult ?? detail?.result ?? null;
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
      />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 220, damping: 30 }}
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-xl flex-col overflow-y-auto border-l border-white/15 bg-[#0d1428] shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0d1428]/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 min-w-10 items-center justify-center rounded-lg px-2 text-sm font-bold ${rec?.rating === 10 ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-indigo-200"}`}>
              {rec?.rating === 10 ? "Qualified" : rec?.criteriaPassed ?? "—"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{symbol}</h2>
                {rec?.rating === 10 && <span className="bsr-chip bsr-pass"><Sparkles className="h-3 w-3" /> Perfect Setup</span>}
              </div>
              <p className="text-xs text-gray-400">{rec?.name} · {rec?.sector}</p>
              <p className="mt-0.5 text-[10px] text-gray-500">
                {detail?.dataAsOf ? `Data as of ${timeSince(detail.dataAsOf)}` : ""}
                {detail?.cached ? " (from scan cache)" : ""}
              </p>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} className="text-gray-300 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-5 p-5">
          <Card className="border-white/10 bg-white/5">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm text-white">
                  <TrendingUp className="h-4 w-4 text-cyan-300" />
                  Price Chart
                </CardTitle>
                <div className="text-[10px] text-gray-500">{selectedTimeframe}</div>
              </div>
              <div className="mt-2">
                <TimeframeSelector
                  selected={selectedTimeframe}
                  onSelect={onTimeframeChange}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {loading && (
                <div className="flex h-48 items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-300" />
                </div>
              )}
              {!loading && detailError && detailError.insufficientData && (
                <div className="flex h-48 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
                  {detailError.message}
                </div>
              )}
              {!loading && detailError && !detailError.insufficientData && (
                <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200">
                  {detailError.message}
                  <button onClick={() => onTimeframeChange(selectedTimeframe)} className="mt-2 rounded-md bg-indigo-500/20 px-3 py-1 text-indigo-300 underline">Retry</button>
                </div>
              )}
              {!loading && detail && (
                <>
                  <PriceChart
                    candles={detail.chartCandles ?? detail.candles}
                    timeframe={selectedTimeframe}
                    levels={{
                      support: detail.result?.details?.majorSupport,
                      resistance: detail.result?.details?.majorResistance,
                      pivot: detail.result?.details?.pivotPoint,
                    }}
                  />

                  <div className="border-t border-white/10 pt-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Overview</p>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-400">LTP</div>
                        <div className="bsr-mono text-lg text-white">₹{formatIN(detail.quote.price)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Change</div>
                        <div className={`bsr-mono text-lg ${detail.quote.changePercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {detail.quote.changePercent >= 0 ? "+" : ""}{detail.quote.changePercent.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Volume</div>
                        <div className="bsr-mono text-lg text-white">{formatVolume(detail.candles[detail.candles.length - 1]?.volume ?? 0)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Key Levels</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between rounded bg-white/5 px-2 py-1">
                        <span className="text-gray-400">9 EMA</span>
                        <span className="bsr-mono">₹{formatIN(rec?.details?.ema9 ?? 0)}</span>
                      </div>
                      <div className="flex justify-between rounded bg-white/5 px-2 py-1">
                        <span className="text-gray-400">15 EMA</span>
                        <span className="bsr-mono">₹{formatIN(rec?.details?.ema15 ?? 0)}</span>
                      </div>
                      <div className="flex justify-between rounded bg-white/5 px-2 py-1">
                        <span className="text-gray-400">Pivot</span>
                        <span className="bsr-mono">₹{formatIN(rec?.details?.majorSupport ?? 0)}</span>
                      </div>
                      <div className="flex justify-between rounded bg-white/5 px-2 py-1">
                        <span className="text-gray-400">Fib 0.618</span>
                        <span className="bsr-mono">₹{formatIN(rec?.details?.fib618Support ?? 0)}</span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 text-xs">
                      <span className="text-cyan-200">9:15 EMA Power Tier</span>
                      <EmaTierBadge tier={rec?.details?.emaTier ?? 0} />
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Criteria Checklist</p>
                    <p className="mb-2 text-[10px] italic text-gray-500">Major Resistance, Supertrend, and Volume Confirmation are shown for reference and don&apos;t affect the Qualified status.</p>
                    <div className="space-y-1.5">
                      {(rec?.criteria ?? []).map((c) => (
                        <div key={c.name} className={`rounded-lg border p-2.5 ${c.passed ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5"}`}>
                          <div className="flex items-center gap-2">
                            {c.passed ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-rose-400" />}
                            <span className="text-sm font-medium text-gray-100">{c.name}</span>
                            {c.eventTime && (
                              <span className="ml-auto whitespace-nowrap rounded border border-cyan-500/20 bg-cyan-500/5 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300/90">
                                {c.eventTime}
                              </span>
                            )}
                          </div>
                          <div className="ml-6 mt-1 text-xs text-gray-400">{c.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Probability Outlook</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-emerald-200">Bullish</span>
                          <span className="bsr-mono font-bold text-emerald-300">{rec?.bullishProbability ?? 0}%</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-black/40">
                          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${rec?.bullishProbability ?? 0}%` }} />
                        </div>
                        <ul className="mt-1 space-y-0.5 text-[10px] text-emerald-200/80">
                          {(rec?.bullishDrivers ?? []).slice(0, 4).map((d, i) => <li key={i}>• {d}</li>)}
                        </ul>
                      </div>
                      <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-rose-200">Bearish</span>
                          <span className="bsr-mono font-bold text-rose-300">{rec?.bearishProbability ?? 0}%</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-black/40">
                          <div className="h-full rounded-full bg-rose-400" style={{ width: `${rec?.bearishProbability ?? 0}%` }} />
                        </div>
                        <ul className="mt-1 space-y-0.5 text-[10px] text-rose-200/80">
                          {(rec?.bearishDrivers ?? []).slice(0, 4).map((d, i) => <li key={i}>• {d}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Fundamentals</p>
                    {(rec?.details?.fundamentalsSummary?.length ?? 0) === 0 ? (
                      <div className="text-xs text-gray-500">No data available.</div>
                    ) : (
                      rec?.details?.fundamentalsSummary.slice(0, 8).map((s, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-md bg-white/5 p-1.5 text-xs text-gray-200">
                          <CircleDashed className="h-3 w-3 text-indigo-300" />
                          <span>{s}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"><Newspaper className="h-3.5 w-3.5" /> Latest News</p>
                    {(detail.news?.length ?? 0) === 0 ? (
                      <div className="text-xs text-gray-500">No recent news in the last 24 hours.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {detail.news.slice(0, 8).map((n, i) => (
                          <a key={i} href={n.link} target="_blank" rel="noopener noreferrer" className="block rounded-md bg-white/5 p-2 transition-colors hover:bg-white/10">
                            <div className="text-sm text-gray-100">{n.title}</div>
                            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-500">
                              <span>{n.publisher}</span>
                              <span>·</span>
                              <span>{timeSince(n.publishedAt)}</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <TradingCalculators
                    price={detail.quote.price}
                    atr={rec?.details?.atr}
                    majorSupport={rec?.details?.majorSupport}
                    ema9={rec?.details?.ema9}
                    ema15={rec?.details?.ema15}
                  />
                </>
              )}
              {!loading && !detail && !detailError && (
                <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-white/10 bg-white/5 text-center text-xs text-gray-400">
                  <TrendingUp className="mb-2 h-6 w-6 text-gray-500" />
                  Something went wrong loading this data.
                  <button onClick={() => onTimeframeChange(selectedTimeframe)} className="mt-2 rounded-md bg-indigo-500/20 px-3 py-1 text-indigo-300 underline">Retry</button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </motion.aside>
    </>
  );
}
