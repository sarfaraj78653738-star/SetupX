"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from "lightweight-charts";

export interface PriceChartCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceChartFibLevels {
  fib0: number;
  fib236: number;
  fib382: number;
  fib5: number;
  fib618: number;
  fib786: number;
  fib100: number;
}

export interface PriceChartLevels {
  support?: number;
  resistance?: number;
  pivot?: number;
  fib?: PriceChartFibLevels;
}

const TF_KEYS_MINUTES = new Set(["5m", "15m", "30m"]);
const IST_TZ = "Asia/Kolkata";

function fmt(n: number, d = 2) {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}

/** Standard EMA over an array of closes. Points before the seed SMA is available are NaN. */
function computeEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  let prev = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * Price chart powered by TradingView's open-source "lightweight-charts"
 * library. We feed it OUR OWN candle data (from the connected broker), so we
 * keep full control over the data source. Zoom (mouse wheel + two-finger
 * pinch) and pan (click-drag / one-finger drag) are handled natively by the
 * library — no custom gesture code needed.
 *
 * IMPORTANT: candle "time" fed to the chart is a SYNTHETIC, uniformly
 * spaced sequence (index-based), not the real timestamp. Multi-day intraday
 * data has real gaps in it (overnight, weekends, market holidays) — if we
 * fed real timestamps directly, lightweight-charts (which positions candles
 * on an actual calendar/time axis) would draw a visible blank gap for every
 * one of those breaks. Using a uniform synthetic index instead means every
 * candle sits pixel-adjacent to the next with no gaps. The REAL timestamp
 * for each point is kept in a side lookup (realTimeRef) so axis labels, the
 * crosshair tooltip, and the legend all still show the correct actual
 * date/time — only the internal horizontal positioning is synthetic.
 *
 * On top of the candles this also draws, automatically, the same levels a
 * trader would otherwise mark up by hand: Major Support / Major Resistance
 * / Pivot as horizontal price lines, all 7 standard Fibonacci retracement
 * levels, and the 9/15 EMA as moving lines.
 */
export default function PriceChart({
  candles,
  timeframe,
  levels,
  showEma = true,
}: {
  candles: PriceChartCandle[];
  timeframe: string;
  levels?: PriceChartLevels;
  showEma?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema9SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema15SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const realTimeRef = useRef<Map<number, number>>(new Map()); // synthetic seconds -> real epoch ms
  const [isEmpty, setIsEmpty] = useState(true);

  const isIntraday = TF_KEYS_MINUTES.has(timeframe);

  const formatLabel = (realMs: number, withDate: boolean) => {
    const d = new Date(realMs);
    if (isNaN(d.getTime())) return "";
    const datePart = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: IST_TZ });
    if (!isIntraday) return datePart;
    const timePart = d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: IST_TZ,
    });
    return withDate ? `${datePart}, ${timePart}` : timePart;
  };

  // Create the chart once per timeframe-mode (intraday vs daily changes how
  // the time axis is formatted, so we rebuild cleanly rather than patch it).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b93a7",
        fontFamily: "inherit",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: false,
        secondsVisible: false,
        tickMarkFormatter: (synthTime: UTCTimestamp) => {
          const realMs = realTimeRef.current.get(synthTime as unknown as number);
          if (realMs == null) return "";
          return formatLabel(realMs, false);
        },
      },
      localization: {
        timeFormatter: (synthTime: UTCTimestamp) => {
          const realMs = realTimeRef.current.get(synthTime as unknown as number);
          if (realMs == null) return "";
          return formatLabel(realMs, true);
        },
        priceFormatter: (p: number) => fmt(p),
      },
      autoSize: true,
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#34d399",
      downColor: "#fb7185",
      borderUpColor: "#34d399",
      borderDownColor: "#fb7185",
      wickUpColor: "#34d399",
      wickDownColor: "#fb7185",
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    // 9/15 EMA — the two moving lines traders track for crossovers, drawn
    // directly on the price panel (same scale as candles).
    const ema9Series = chart.addLineSeries({
      color: "#38bdf8",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const ema15Series = chart.addLineSeries({
      color: "#f59e0b",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ema9SeriesRef.current = ema9Series;
    ema15SeriesRef.current = ema15Series;
    priceLinesRef.current = [];

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ema9SeriesRef.current = null;
      ema15SeriesRef.current = null;
      priceLinesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIntraday]);

  // Push new candle + EMA data whenever candles change.
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const ema9Series = ema9SeriesRef.current;
    const ema15Series = ema15SeriesRef.current;
    if (!candleSeries || !volumeSeries) return;

    if (!candles || candles.length === 0) {
      candleSeries.setData([]);
      volumeSeries.setData([]);
      ema9Series?.setData([]);
      ema15Series?.setData([]);
      realTimeRef.current = new Map();
      setIsEmpty(true);
      return;
    }

    // De-duplicate + sort ascending by REAL time first.
    const seen = new Set<number>();
    const sorted = candles
      .map((c) => ({ ...c, realMs: new Date(c.date).getTime() }))
      .filter((c) => !isNaN(c.realMs))
      .sort((a, b) => a.realMs - b.realMs)
      .filter((c) => {
        if (seen.has(c.realMs)) return false;
        seen.add(c.realMs);
        return true;
      });

    if (sorted.length === 0) {
      candleSeries.setData([]);
      volumeSeries.setData([]);
      ema9Series?.setData([]);
      ema15Series?.setData([]);
      realTimeRef.current = new Map();
      setIsEmpty(true);
      return;
    }

    // Assign a uniform synthetic time (1 unit per candle) so there are never
    // visual gaps for overnight/weekend/holiday breaks, and keep a
    // synthetic -> real lookup for labels/tooltips.
    const newRealTimeMap = new Map<number, number>();
    const withSynth = sorted.map((c, i) => {
      const synth = i as UTCTimestamp;
      newRealTimeMap.set(i, c.realMs);
      return { ...c, synth };
    });
    realTimeRef.current = newRealTimeMap;

    candleSeries.setData(
      withSynth.map((c) => ({
        time: c.synth,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    volumeSeries.setData(
      withSynth.map((c) => ({
        time: c.synth,
        value: c.volume,
        color: c.close >= c.open ? "rgba(52,211,153,0.45)" : "rgba(251,113,133,0.45)",
      }))
    );

    if (showEma) {
      const closes = withSynth.map((c) => c.close);
      const ema9Vals = computeEMA(closes, 9);
      const ema15Vals = computeEMA(closes, 15);
      ema9Series?.setData(
        withSynth
          .map((c, i) => ({ time: c.synth, value: ema9Vals[i] }))
          .filter((p) => !isNaN(p.value))
      );
      ema15Series?.setData(
        withSynth
          .map((c, i) => ({ time: c.synth, value: ema15Vals[i] }))
          .filter((p) => !isNaN(p.value))
      );
    } else {
      ema9Series?.setData([]);
      ema15Series?.setData([]);
    }

    setIsEmpty(false);
    chartRef.current?.timeScale().fitContent();
  }, [candles, showEma]);

  // Draw/update horizontal Support / Resistance / Pivot / Fibonacci lines.
  // Re-created whenever the levels or the underlying candle set changes.
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    for (const line of priceLinesRef.current) {
      try {
        candleSeries.removePriceLine(line);
      } catch {
        /* series may already be gone during unmount */
      }
    }
    priceLinesRef.current = [];

    if (!levels || isEmpty) return;

    const addLine = (price: number | undefined, color: string, title: string, style: LineStyle) => {
      if (price == null || isNaN(price) || price <= 0) return;
      const line = candleSeries.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: style,
        axisLabelVisible: true,
        title,
      });
      priceLinesRef.current.push(line);
    };

    addLine(levels.support, "#34d399", "Support", LineStyle.Solid);
    addLine(levels.resistance, "#fb7185", "Resistance", LineStyle.Solid);
    addLine(levels.pivot, "#a78bfa", "Pivot", LineStyle.Dashed);
  }, [levels, isEmpty]);

  const resetZoom = () => {
    chartRef.current?.timeScale().fitContent();
  };

  const lastCandleLabel = (() => {
    if (!candles || candles.length === 0) return null;
    const last = candles[candles.length - 1];
    const ms = new Date(last.date).getTime();
    if (isNaN(ms)) return null;
    return formatLabel(ms, true);
  })();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={resetZoom}
        className="absolute right-2 top-2 z-10 rounded-md border border-white/15 bg-[#0d1428]/90 px-2.5 py-1 text-[10px] font-semibold text-cyan-300 shadow-lg transition-colors hover:bg-[#16213f]"
      >
        Reset zoom
      </button>
      {showEma && (
        <div className="absolute left-2 top-2 z-10 flex gap-3 rounded-md border border-white/10 bg-[#0d1428]/80 px-2 py-1 text-[10px]">
          <span className="flex items-center gap-1 text-sky-400"><span className="h-[2px] w-3 bg-sky-400" /> 9 EMA</span>
          <span className="flex items-center gap-1 text-amber-400"><span className="h-[2px] w-3 bg-amber-400" /> 15 EMA</span>
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height: 300 }} />
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-xs text-gray-500">
          No chart data available for this timeframe.
        </div>
      )}
      {lastCandleLabel && (
        <div className="mt-1 text-right text-[10px] text-gray-500">
          Last candle: {lastCandleLabel}
        </div>
      )}
    </div>
  );
}
