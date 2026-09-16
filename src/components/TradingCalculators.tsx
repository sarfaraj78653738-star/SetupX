"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Calculator } from "lucide-react";

interface CalculatorProps {
  price?: number;
  atr?: number;
  majorSupport?: number;
  ema9?: number;
  ema15?: number;
  ema20?: number;
  ema50?: number;
  candles?: Array<{ high: number; low: number; close: number }>;
}

// ─── Helpers ──────────────────────────────────────────
function fmt(n: number, d = 2): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}

const DISCLAIMER_CALC = "This is a mathematical calculator based on your own inputs and standard technical formulas. It is not a trade recommendation.";

// ─── 1. POSITION SIZE CALCULATOR ──────────────────────
interface PositionResult {
  positionSize: number; capitalRequired: number; pctOfAccount: number; riskAmount: number; riskDistance: number;
  atrPositionSize?: number; atrCapital?: number; atrDistance?: number;
}
function PositionSizeCalculator(_props: CalculatorProps) {
  const [accountSize, setAccountSize] = useState(0);
  const [riskPct, setRiskPct] = useState(0);
  const [entryPrice, setEntryPrice] = useState(0);
  const [stopPrice, setStopPrice] = useState(0);
  const [atrVal, setAtrVal] = useState(0);

  const result = useMemo(() => {
    if (entryPrice <= 0 || stopPrice <= 0 || stopPrice >= entryPrice || accountSize <= 0 || riskPct <= 0) return null;
    const riskAmount = accountSize * (riskPct / 100);
    const riskDistance = entryPrice - stopPrice;
    const positionSize = riskAmount / riskDistance;
    const capitalRequired = positionSize * entryPrice;
    const pctOfAccount = (capitalRequired / accountSize) * 100;
    const base: PositionResult = { positionSize, capitalRequired, pctOfAccount, riskAmount, riskDistance };

    const atrDist = atrVal > 0 ? entryPrice - atrVal * 1.5 : 0;
    if (atrDist > 0 && atrDist < entryPrice) {
      const atrPositionSize = riskAmount / atrDist;
      const atrCapital = atrPositionSize * entryPrice;
      return { ...base, atrPositionSize, atrCapital, atrDistance: atrDist };
    }
    return base;
  }, [accountSize, riskPct, entryPrice, stopPrice, atrVal]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div>
          <label className="block text-gray-500">Account Size (₹)</label>
          <input type="number" value={accountSize || ""} onChange={(e) => setAccountSize(Number(e.target.value))} placeholder="e.g. 100000" className="mt-0.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-white placeholder:text-gray-600" />
        </div>
        <div>
          <label className="block text-gray-500">Risk per Trade (%)</label>
          <input type="number" step="0.1" min="0.1" max="10" value={riskPct || ""} onChange={(e) => setRiskPct(Number(e.target.value))} placeholder="e.g. 1" className="mt-0.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-white placeholder:text-gray-600" />
        </div>
        <div>
          <label className="block text-gray-500">Entry Price (₹)</label>
          <input type="number" step="0.05" value={entryPrice || ""} onChange={(e) => setEntryPrice(Number(e.target.value))} placeholder="e.g. 1250" className="mt-0.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-white placeholder:text-gray-600" />
        </div>
        <div>
          <label className="block text-gray-500">Stop-Loss (₹)</label>
          <input type="number" step="0.05" value={stopPrice || ""} onChange={(e) => setStopPrice(Number(e.target.value))} placeholder="e.g. 1200" className="mt-0.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-white placeholder:text-gray-600" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500">ATR (optional, for ATR-based variant)</label>
        <input type="number" step="0.01" value={atrVal || ""} onChange={(e) => setAtrVal(Number(e.target.value))} placeholder="e.g. 25" className="mt-0.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-white placeholder:text-gray-600" />
      </div>
      {result && (
        <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
          <p className="font-medium text-emerald-200">Fixed Fractional Method</p>
          <div className="grid grid-cols-2 gap-1 text-gray-200">
            <span>Position size:</span><span className="bsr-mono text-right">{fmt(result.positionSize)} shares</span>
            <span>Capital required:</span><span className="bsr-mono text-right">₹{fmt(result.capitalRequired)}</span>
            <span>% of account:</span><span className="bsr-mono text-right">{fmt(result.pctOfAccount, 1)}%</span>
            <span>Risk amount:</span><span className="bsr-mono text-right">₹{fmt(result.riskAmount)}</span>
          </div>
          {result.atrPositionSize != null && (
            <>
              <Separator className="bg-white/10" />
              <p className="font-medium text-cyan-200">ATR-based Variant (1.5×ATR as example distance)</p>
              <div className="grid grid-cols-2 gap-1 text-gray-200">
                <span>Position size:</span><span className="bsr-mono text-right">{fmt(result.atrPositionSize)} shares</span>
                <span>Capital required:</span><span className="bsr-mono text-right">₹{fmt(result.atrCapital!)}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 2. STOP-LOSS CALCULATOR ──────────────────────────
function StopLossCalculator({ atr, majorSupport, ema9, ema15, ema20, ema50 }: CalculatorProps) {
  const [entryPrice, setEntryPrice] = useState(0);
  const [atrMul, setAtrMul] = useState(0);
  const [pctMul, setPctMul] = useState(0);

  const levels = useMemo(() => {
    if (entryPrice <= 0) return null;
    if (atrMul === 0 && pctMul === 0) return null;
    const atrBased = atr && atr > 0 && atrMul > 0 ? entryPrice - atr * atrMul : null;
    const structBased = majorSupport && majorSupport < entryPrice ? majorSupport : null;
    const pctBased = pctMul > 0 ? entryPrice * (1 - pctMul / 100) : null;
    const emas = [ema9, ema15, ema20, ema50].filter((e): e is number => e != null && e < entryPrice);
    const maBased = emas.length > 0 ? Math.max(...emas) : null;
    return { atrBased, structBased, pctBased, maBased };
  }, [entryPrice, atr, atrMul, majorSupport, pctMul, ema9, ema15, ema20, ema50]);

  return (
    <div className="space-y-3">
      <p className="text-[10px] italic text-amber-200/70">Reference stop-loss levels — these are common calculation methods, not a recommendation. Choose based on your own strategy and risk tolerance.</p>
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div>
          <label className="block text-gray-500">Entry Price (₹)</label>
          <input type="number" step="0.05" value={entryPrice || ""} onChange={(e) => setEntryPrice(Number(e.target.value))} placeholder="e.g. 1250" className="mt-0.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-white placeholder:text-gray-600" />
        </div>
        <div>
          <label className="block text-gray-500">ATR Multiplier</label>
          <input type="range" min="0" max="4" step="0.1" value={atrMul} onChange={(e) => setAtrMul(Number(e.target.value))} className="mt-1 w-full accent-indigo-400" />
          {atrMul > 0 && <span className="text-gray-400">{atrMul}×</span>}
        </div>
      </div>
      <div className="text-xs">
        <label className="text-gray-500">Percentage distance</label>
        <input type="range" min="0" max="10" step="0.5" value={pctMul} onChange={(e) => setPctMul(Number(e.target.value))} className="mt-1 w-full accent-indigo-400" />
        {pctMul > 0 && <span className="text-gray-400">{pctMul}%</span>}
      </div>
      {levels && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-white/10 bg-white/5 p-2">
            <div className="text-gray-500">ATR-based</div>
            <div className="bsr-mono text-white">{levels.atrBased ? `₹${fmt(levels.atrBased)}` : "—"}</div>
          </div>
          <div className="rounded border border-white/10 bg-white/5 p-2">
            <div className="text-gray-500">Structure-based</div>
            <div className="bsr-mono text-white">{levels.structBased ? `₹${fmt(levels.structBased)}` : "—"}</div>
          </div>
          <div className="rounded border border-white/10 bg-white/5 p-2">
            <div className="text-gray-500">Percentage-based</div>
            <div className="bsr-mono text-white">{levels.pctBased ? `₹${fmt(levels.pctBased)}` : "—"}</div>
          </div>
          <div className="rounded border border-white/10 bg-white/5 p-2">
            <div className="text-gray-500">MA-based (nearest)</div>
            <div className="bsr-mono text-white">{levels.maBased ? `₹${fmt(levels.maBased)}` : "—"}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 3. TRAILING STOP CALCULATOR ──────────────────────
function TrailingStopCalculator({ atr, majorSupport, ema9, ema20, ema50 }: CalculatorProps) {
  const [entryPrice, setEntryPrice] = useState(0);
  const [currPrice, setCurrPrice] = useState(0);
  const [atrMul, setAtrMul] = useState(0);
  const [method, setMethod] = useState<"atr" | "chandelier" | "structure" | "ma">("atr");

  const highestHigh = currPrice;

  const result = useMemo(() => {
    if (currPrice <= 0 || entryPrice <= 0) return null;
    switch (method) {
      case "atr": {
        if (!atr || atr <= 0 || atrMul <= 0) return null;
        return { label: "ATR Trail", value: currPrice - atr * atrMul };
      }
      case "chandelier": {
        if (!atr || atr <= 0 || atrMul <= 0) return null;
        return { label: "Chandelier Exit", value: Math.max(entryPrice, highestHigh) - atr * atrMul };
      }
      case "structure": {
        if (!majorSupport || majorSupport <= 0) return null;
        return { label: "Structure Trail", value: majorSupport };
      }
      case "ma": {
        const emas = [ema9, ema20, ema50].filter((e): e is number => e != null && e < currPrice);
        if (emas.length === 0) return null;
        const best = emas.reduce((a, b) => (b > a ? b : a));
        return { label: "Trail", value: best };
      }
    }
  }, [method, currPrice, atr, atrMul, entryPrice, highestHigh, majorSupport, ema9, ema20, ema50]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div>
          <label className="block text-gray-500">Entry Price (₹)</label>
          <input type="number" step="0.05" value={entryPrice || ""} onChange={(e) => setEntryPrice(Number(e.target.value))} placeholder="e.g. 1250" className="mt-0.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-white placeholder:text-gray-600" />
        </div>
        <div>
          <label className="block text-gray-500">Current Price (₹)</label>
          <input type="number" step="0.05" value={currPrice || ""} onChange={(e) => setCurrPrice(Number(e.target.value))} placeholder="e.g. 1300" className="mt-0.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-white placeholder:text-gray-600" />
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <label className="text-gray-500">Method:</label>
        <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-white">
          <option value="atr" className="bg-[#0d1428] text-white">ATR Trail</option>
          <option value="chandelier" className="bg-[#0d1428] text-white">Chandelier Exit</option>
          <option value="structure" className="bg-[#0d1428] text-white">Structure Trail</option>
          <option value="ma" className="bg-[#0d1428] text-white">MA Trail</option>
        </select>
      </div>
      {(method === "atr" || method === "chandelier") && (
        <div className="text-xs">
          <label className="text-gray-500">ATR Multiplier</label>
          <input type="range" min="0" max="4" step="0.1" value={atrMul} onChange={(e) => setAtrMul(Number(e.target.value))} className="mt-1 w-full accent-indigo-400" />
          {atrMul > 0 && <span className="text-gray-400">{atrMul}×</span>}
        </div>
      )}
      {result ? (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs">
          <p className="text-cyan-200">{result.label}</p>
          <p className="bsr-mono mt-1 text-lg text-white">₹{fmt(result.value)}</p>
        </div>
      ) : (
        currPrice > 0 && entryPrice > 0 && (
          <p className="text-xs text-gray-500">Adjust the ATR multiplier or change method to see a calculated value.</p>
        )
      )}
    </div>
  );
}

// ─── 4. RISK-REWARD CALCULATOR ────────────────────────
function RiskRewardCalculator(_props: CalculatorProps) {
  const [entryPrice, setEntryPrice] = useState(0);
  const [stopPrice, setStopPrice] = useState(0);
  const [targetPrice, setTargetPrice] = useState(0);
  const [minRR, setMinRR] = useState(0);

  const result = useMemo(() => {
    if (entryPrice <= 0 || stopPrice <= 0 || targetPrice <= 0 || minRR <= 0) return null;
    if (targetPrice <= entryPrice || stopPrice >= entryPrice) return null;
    const riskPerShare = entryPrice - stopPrice;
    const rewardPerShare = targetPrice - entryPrice;
    const ratio = rewardPerShare / riskPerShare;
    const meetsThreshold = ratio >= minRR;
    return { ratio, riskAmount: riskPerShare, rewardAmount: rewardPerShare, meetsThreshold };
  }, [entryPrice, stopPrice, targetPrice, minRR]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div>
          <label className="block text-gray-500">Entry Price (₹)</label>
          <input type="number" step="0.05" value={entryPrice || ""} onChange={(e) => setEntryPrice(Number(e.target.value))} placeholder="e.g. 1250" className="mt-0.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-white placeholder:text-gray-600" />
        </div>
        <div>
          <label className="block text-gray-500">Stop-Loss (₹)</label>
          <input type="number" step="0.05" value={stopPrice || ""} onChange={(e) => setStopPrice(Number(e.target.value))} placeholder="e.g. 1200" className="mt-0.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-white placeholder:text-gray-600" />
        </div>
        <div>
          <label className="block text-gray-500">Target Price (₹)</label>
          <input type="number" step="0.05" value={targetPrice || ""} onChange={(e) => setTargetPrice(Number(e.target.value))} placeholder="e.g. 1350" className="mt-0.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-white placeholder:text-gray-600" />
        </div>
        <div>
          <label className="block text-gray-500">Min R:R Threshold</label>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">1:</span>
            <input type="number" step="0.1" min="0" value={minRR || ""} onChange={(e) => setMinRR(Number(e.target.value))} placeholder="e.g. 2" className="mt-0.5 flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-white placeholder:text-gray-600" />
          </div>
        </div>
      </div>
      {result && (
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 text-xs">
          <div className="grid grid-cols-2 gap-1 text-gray-200">
            <span>R:R Ratio:</span><span className="bsr-mono text-right font-bold text-white">1:{fmt(result.ratio, 1)}</span>
            <span>Potential loss (per share):</span><span className="bsr-mono text-right text-rose-300">₹{fmt(result.riskAmount)}</span>
            <span>Potential gain (per share):</span><span className="bsr-mono text-right text-emerald-300">₹{fmt(result.rewardAmount)}</span>
          </div>
          <Separator className="my-2 bg-white/10" />
          <p className={`text-center text-xs ${result.meetsThreshold ? "text-emerald-200" : "text-amber-200"}`}>
            Your R:R of 1:{fmt(result.ratio, 1)} {result.meetsThreshold ? "meets" : "does not meet"} your stated minimum of 1:{fmt(minRR, 1)}.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── TAB CONTAINER ─────────────────────────────────────
export default function TradingCalculators(props: CalculatorProps) {
  const [activeTab, setActiveTab] = useState<"position" | "stoploss" | "trailing" | "riskreward">("position");

  return (
    <Card className="border-white/10 bg-white/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm text-white">
            <Calculator className="h-4 w-4 text-cyan-300" />
            Trading Calculators
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
          {[
            { id: "position", label: "Pos. Size" },
            { id: "stoploss", label: "Stop-Loss" },
            { id: "trailing", label: "Trail Stop" },
            { id: "riskreward", label: "Risk-Reward" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                activeTab === tab.id ? "bg-indigo-500 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <p className="text-[10px] italic text-amber-200/70">{DISCLAIMER_CALC}</p>

        {activeTab === "position" && <PositionSizeCalculator {...props} />}
        {activeTab === "stoploss" && <StopLossCalculator {...props} />}
        {activeTab === "trailing" && <TrailingStopCalculator {...props} />}
        {activeTab === "riskreward" && <RiskRewardCalculator {...props} />}
      </CardContent>
    </Card>
  );
}
