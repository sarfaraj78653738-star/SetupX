import type { KiteInterval } from "./kite";

export const VALID_TIMEFRAMES = ["5m", "15m", "30m", "1D"] as const;
export type TimeframeKey = (typeof VALID_TIMEFRAMES)[number];

export interface TimeframeConfig {
  label: string;
  group: "Minutes" | "Days";
  kiteInterval: KiteInterval;
  kiteDays: number;
  yahooRange: string;
  yahooInterval: string;
  minCandles: number;
  chartKiteInterval: KiteInterval;
  chartKiteDays: number;
  chartYahooRange: string;
  chartYahooInterval: string;
  chartMinCandles: number;
}

export const TIMEFRAME_CONFIG: Record<TimeframeKey, TimeframeConfig> = {
  "5m": {
    label: "5 Min",
    group: "Minutes",
    kiteInterval: "5minute",
    kiteDays: 5,
    yahooRange: "5d",
    yahooInterval: "5m",
    minCandles: 30,
    chartKiteInterval: "5minute",
    chartKiteDays: 1,
    chartYahooRange: "1d",
    chartYahooInterval: "5m",
    chartMinCandles: 5,
  },
  "15m": {
    label: "15 Min",
    group: "Minutes",
    kiteInterval: "15minute",
    kiteDays: 10,
    yahooRange: "5d",
    yahooInterval: "15m",
    minCandles: 30,
    chartKiteInterval: "15minute",
    chartKiteDays: 1,
    chartYahooRange: "1d",
    chartYahooInterval: "15m",
    chartMinCandles: 3,
  },
  "30m": {
    label: "30 Min",
    group: "Minutes",
    kiteInterval: "30minute",
    kiteDays: 14,
    yahooRange: "1mo",
    yahooInterval: "30m",
    minCandles: 30,
    chartKiteInterval: "30minute",
    chartKiteDays: 2,
    chartYahooRange: "5d",
    chartYahooInterval: "30m",
    chartMinCandles: 3,
  },
  "1D": {
    label: "1 Day",
    group: "Days",
    kiteInterval: "day",
    kiteDays: 180,
    yahooRange: "6mo",
    yahooInterval: "1d",
    minCandles: 35,
    chartKiteInterval: "day",
    chartKiteDays: 180,
    chartYahooRange: "6mo",
    chartYahooInterval: "1d",
    chartMinCandles: 35,
  },
};
