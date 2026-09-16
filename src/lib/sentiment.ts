const POSITIVE_WORDS = [
  "surge", "rally", "jump", "beats", "beat", "profit", "growth", "expansion", "record", "high",
  "strong", "upgrade", "buy", "outperform", "bullish", "gain", "gains", "rise", "rises", "soar",
  "soars", "win", "wins", "deal", "order", "approval", "dividend", "bonus", "acquisition", "launch",
  "breakthrough", "boom", "milestone", "recover", "rebound", "upswing", "rises", "advances",
  "advances", "hike", "hikes", "raise", "raises", "upbeat", "optimistic", "positive", "upgrade",
  "upgraded", "target raised", "strong earnings", "robust", "blockbuster", "stellar",
];

const NEGATIVE_WORDS = [
  "fall", "falls", "drop", "drops", "plunge", "plunges", "loss", "losses", "decline", "declines",
  "miss", "misses", "weak", "downgrade", "sell", "underperform", "bearish", "concern", "concerns",
  "probe", "investigation", "fraud", "scam", "penalty", "fine", "fines", "lawsuit", "debt", "default",
  "crash", "slump", "tumble", "tumbles", "warning", "warns", "cuts", "slash", "slashes", "lower",
  "negative", "pessimistic", "risk", "warning", "slowdown", "layoff", "layoffs", "resign",
];

export interface SentimentResult {
  score: number;
  positive: number;
  negative: number;
  total: number;
  label: "Positive" | "Neutral" | "Negative";
}

export function analyzeSentiment(headlines: string[]): SentimentResult {
  let positive = 0;
  let negative = 0;
  const text = headlines.join(" ").toLowerCase();
  for (const w of POSITIVE_WORDS) {
    const re = new RegExp(`\\b${w}\\b`, "g");
    const m = text.match(re);
    if (m) positive += m.length;
  }
  for (const w of NEGATIVE_WORDS) {
    const re = new RegExp(`\\b${w}\\b`, "g");
    const m = text.match(re);
    if (m) negative += m.length;
  }
  const total = positive + negative;
  const score = total === 0 ? 0 : (positive - negative) / Math.max(total, 1);
  let label: "Positive" | "Neutral" | "Negative" = "Neutral";
  if (positive > negative && positive >= 1) label = "Positive";
  else if (negative > positive && negative >= 1) label = "Negative";
  return { score, positive, negative, total, label };
}

export interface FundamentalsInput {
  pe?: number;
  pb?: number;
  marketCap?: number;
  changePercent?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  price?: number;
  /** Real on-screen fundamentals from screener.in (when available). */
  roe?: number;
  roce?: number;
  debtToEquity?: number;
  dividendYield?: number;
  priceToBook?: number;
  promoterHolding?: number;
  promoterPledge?: number;
  salesGrowth?: number;
  epsGrowth?: number;
  industryPe?: number;
}

export interface FundamentalScore {
  peOk: boolean;
  pbOk: boolean;
  marketCapOk: boolean;
  roeOk: boolean;
  roceOk: boolean;
  debtOk: boolean;
  dividendOk: boolean;
  promoterOk: boolean;
  pledgeOk: boolean;
  epsGrowthOk: boolean;
  salesGrowthOk: boolean;
  pegOk: boolean;
  positiveChange: boolean;
  /** Quality score 0–100 (higher = healthier). */
  qualityScore: number;
  /** Pledge hard-red-flag activated (>25% pledge). */
  pledgeRedFlag: boolean;
  summary: string[];
  /** Aggregate summary string for UI quick read. */
  verdict: "STRONG" | "GOOD" | "WATCH" | "POOR";
}

/** Thresholds — live-tested on Indian large caps. */
const THRESH = {
  roe: 15,
  roce: 15,
  debtToEquity: 1.0,
  dividendYield: 0.5,
  priceToBook: 8,
  epsGrowth: 10,
  salesGrowth: 10,
  pegCeil: 1.5,
  peCeil: 40,
  peSoft: 30,
  marketCapCr: 5000,
  promoterMin: 40,
  pledgeWarnAt: 5,
  pledgeFailAt: 10,
  pledgeRedFlagAt: 25,
};

export function evaluateFundamentals(input: FundamentalsInput): FundamentalScore {
  const summary: string[] = [];

  // ===== Hard red flag (pledge) =====
  const pledgeOk =
    input.promoterPledge == null || input.promoterPledge < THRESH.pledgeFailAt;
  const pledgeRedFlag =
    input.promoterPledge != null && input.promoterPledge > THRESH.pledgeRedFlagAt;
  if (input.promoterPledge != null) {
    if (input.promoterPledge === 0) summary.push("No promoter pledge ✓");
    else if (input.promoterPledge <= THRESH.pledgeWarnAt)
      summary.push(`Low pledge ${input.promoterPledge.toFixed(1)}%`);
    else if (input.promoterPledge <= THRESH.pledgeFailAt)
      summary.push(`Moderate pledge ${input.promoterPledge.toFixed(1)}%`);
    else if (input.promoterPledge <= THRESH.pledgeRedFlagAt)
      summary.push(`High pledge ${input.promoterPledge.toFixed(1)}%`);
    else
      summary.push(`RED FLAG: Promoter pledge ${input.promoterPledge.toFixed(1)}%`);
  }

  // ===== Per-field checks =====
  const peOk = input.pe != null && input.pe > 0 && input.pe < THRESH.peCeil;
  if (input.pe != null) {
    if (peOk && input.pe <= THRESH.peSoft)
      summary.push(`P/E ${input.pe.toFixed(1)} (reasonable)`);
    else if (peOk) summary.push(`P/E ${input.pe.toFixed(1)} (acceptable)`);
    else summary.push(`P/E ${input.pe.toFixed(1)} outside range`);
  } else summary.push("P/E unavailable");

  const pbOk =
    input.pb != null ? input.pb > 0 && input.pb < THRESH.priceToBook : input.priceToBook != null
      ? input.priceToBook > 0 && input.priceToBook < THRESH.priceToBook
      : false;
  const pbDisplay = input.priceToBook ?? input.pb;
  if (pbDisplay != null && pbDisplay > 0) {
    summary.push(pbOk ? `P/B ${pbDisplay.toFixed(2)} (OK)` : `P/B ${pbDisplay.toFixed(2)} (high)`);
  }

  const mcOk =
    input.marketCap != null && input.marketCap > THRESH.marketCapCr * 1e7;
  if (input.marketCap != null && mcOk)
    summary.push(`Large cap (₹${(input.marketCap / 1e9).toFixed(0)}Cr)`);
  else if (input.marketCap == null || input.marketCap === 0)
    summary.push("Market cap unavailable");

  const roeOk = input.roe != null && input.roe >= THRESH.roe;
  if (input.roe != null)
    summary.push(
      input.roe >= 20
        ? `ROE ${input.roe.toFixed(1)}% (strong)`
        : roeOk
          ? `ROE ${input.roe.toFixed(1)}%`
          : `ROE ${input.roe.toFixed(1)}% (weak)`
    );

  const roceOk = input.roce != null && input.roce >= THRESH.roce;
  if (input.roce != null)
    summary.push(
      input.roce >= 20
        ? `ROCE ${input.roce.toFixed(1)}% (strong)`
        : roceOk
          ? `ROCE ${input.roce.toFixed(1)}%`
          : `ROCE ${input.roce.toFixed(1)}% (weak)`
    );

  const debtOk = input.debtToEquity != null && input.debtToEquity < THRESH.debtToEquity;
  if (input.debtToEquity != null)
    summary.push(
      debtOk
        ? `Debt/Equity ${input.debtToEquity.toFixed(2)} (healthy)`
        : `Debt/Equity ${input.debtToEquity.toFixed(2)} (leveraged)`
    );

  const dividendOk =
    input.dividendYield != null && input.dividendYield >= THRESH.dividendYield;
  if (input.dividendYield != null) {
    if (input.dividendYield === 0)
      summary.push("No dividend (growth phase)");
    else if (dividendOk)
      summary.push(`Dividend yield ${input.dividendYield.toFixed(2)}%`);
    else summary.push(`Low dividend yield ${input.dividendYield.toFixed(2)}%`);
  }

  const promoterOk =
    input.promoterHolding == null || input.promoterHolding >= THRESH.promoterMin;
  if (input.promoterHolding != null) {
    summary.push(
      promoterOk
        ? `Promoter holding ${input.promoterHolding.toFixed(1)}% (stable)`
        : `Promoter holding ${input.promoterHolding.toFixed(1)}% (low)`
    );
  }

  const epsGrowthOk = input.epsGrowth != null && input.epsGrowth > THRESH.epsGrowth;
  if (input.epsGrowth != null)
    summary.push(
      input.epsGrowth > 25
        ? `EPS growth +${input.epsGrowth.toFixed(1)}%/yr (strong)`
        : epsGrowthOk
          ? `EPS growth +${input.epsGrowth.toFixed(1)}%/yr`
          : `EPS growth ${input.epsGrowth.toFixed(1)}%/yr (slow)`
    );

  const salesGrowthOk =
    input.salesGrowth != null && input.salesGrowth > THRESH.salesGrowth;
  if (input.salesGrowth != null)
    summary.push(
      input.salesGrowth > 25
        ? `Sales growth +${input.salesGrowth.toFixed(1)}%/yr (strong)`
        : salesGrowthOk
          ? `Sales growth +${input.salesGrowth.toFixed(1)}%/yr`
          : `Sales growth ${input.salesGrowth.toFixed(1)}%/yr (slow)`
    );

  // PEG ratio (only meaningful if both pe and epsGrowth available & positive)
  let pegOk = false;
  let peg: number | undefined;
  if (
    typeof input.pe === "number" &&
    input.pe > 0 &&
    typeof input.epsGrowth === "number" &&
    input.epsGrowth > 0
  ) {
    peg = input.pe / input.epsGrowth;
    pegOk = peg > 0 && peg < THRESH.pegCeil;
    if (pegOk)
      summary.push(
        peg < 1
          ? `PEG ${peg.toFixed(2)} (great value)`
          : `PEG ${peg.toFixed(2)} (value)`
      );
    else if (peg >= THRESH.pegCeil)
      summary.push(`PEG ${peg.toFixed(2)} (expensive for growth)`);
  }

  const positiveChange = (input.changePercent ?? 0) > 0;
  if (positiveChange)
    summary.push(`Today's change +${(input.changePercent ?? 0).toFixed(2)}%`);

  // ===== Weighted quality score =====
  // Categories: core (heavy), growth (medium), safety (medium), momentum (light)
  let core = 0,
    coreN = 0;
  let growth = 0,
    growthN = 0;
  let safety = 0,
    safetyN = 0;
  let momentum = 0,
    momentumN = 0;

  const tests: Array<[boolean, "core" | "growth" | "safety" | "momentum"]> = [
    [peOk, "core"],
    [pbOk, "core"],
    [mcOk, "core"],
    [roeOk, "growth"],
    [roceOk, "growth"],
    [epsGrowthOk, "growth"],
    [salesGrowthOk, "growth"],
    [pegOk, "growth"],
    [debtOk, "safety"],
    [pledgeOk, "safety"],
    [promoterOk, "safety"],
    [dividendOk, "safety"],
    [positiveChange, "momentum"],
  ];
  for (const [ok, group] of tests) {
    if (!group) continue;
    if (group === "core") {
      if (ok !== null) coreN++;
      if (ok) core++;
    } else if (group === "growth") {
      growthN++;
      if (ok) growth++;
    } else if (group === "safety") {
      safetyN++;
      if (ok) safety++;
    } else if (group === "momentum") {
      momentumN++;
      if (ok) momentum++;
    }
  }
  const coreScore = coreN > 0 ? (core / coreN) * 35 : 0;
  const growthScore = growthN > 0 ? (growth / growthN) * 25 : 0;
  const safetyScore = safetyN > 0 ? (safety / safetyN) * 25 : 0;
  const momentumScore = momentumN > 0 ? (momentum / momentumN) * 15 : 0;
  let qualityScore = coreScore + growthScore + safetyScore + momentumScore;

  if (pledgeRedFlag) {
    qualityScore = Math.min(qualityScore, 35);
  }
  qualityScore = Math.max(0, Math.min(100, Math.round(qualityScore)));

  let verdict: FundamentalScore["verdict"] = "WATCH";
  if (pledgeRedFlag) verdict = "POOR";
  else if (qualityScore >= 70) verdict = "STRONG";
  else if (qualityScore >= 50) verdict = "GOOD";
  else if (qualityScore < 30) verdict = "POOR";

  return {
    peOk,
    pbOk,
    marketCapOk: mcOk,
    roeOk,
    roceOk,
    debtOk,
    dividendOk,
    promoterOk,
    pledgeOk,
    epsGrowthOk,
    salesGrowthOk,
    pegOk,
    positiveChange,
    qualityScore,
    pledgeRedFlag,
    summary,
    verdict,
  };
}
