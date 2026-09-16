export interface ScreenerData {
  /** Trailing P/E (TTM). */
  pe?: number;
  /** Book Value (P/B numerator) computed from current price / P/B if P/B absent. */
  bookValue?: number;
  /** Market cap in Crore INR. */
  marketCapCr?: number;
  /** Last close in INR. */
  currentPrice?: number;
  /** Return on Equity (%, latest period). */
  roe?: number;
  /** Return on Capital Employed (%). */
  roce?: number;
  /** Debt to equity (ratio, lower is healthier). */
  debtToEquity?: number;
  /** Dividend Yield %, optional (growth stocks may not pay). */
  dividendYield?: number;
  /** Price-to-Book ratio. */
  priceToBook?: number;
  /** Promoter holding %, latest quarter. */
  promoterHolding?: number;
  /** Promoter pledge as % of total promoter holding (Screener shows % of total holding). */
  promoterPledge?: number;
  /** Compounded Sales Growth %, typically 5Y CAGR. */
  salesGrowth?: number;
  /** Compounded Profit/EPS Growth %, typically 5Y CAGR. */
  epsGrowth?: number;
  /** Industry P/E for relative valuation. */
  industryPe?: number;
}

const SCREENER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function parseNumber(s: string): number {
  return parseFloat(s.replace(/,/g, "").replace(/[^\d.\-]/g, ""));
}

/**
 * Extract a numeric value that appears after a label and inside a
 * <span class="number">…</span>. Handles labels whose text spans multiple
 * nested <span>/<a>/<small> elements.
 */
function extractNumberNear(html: string, labels: string[]): number | undefined {
  for (const label of labels) {
    const re = new RegExp(`${label}[\\s\\S]*?<span[^>]*class="number"[^>]*>([^<]+)<`, "i");
    const m = html.match(re);
    if (m) {
      const v = parseNumber(m[1]);
      if (Number.isFinite(v)) return v;
    }
  }
  return undefined;
}

/**
 * Scrape values that may appear with a "%" sign (e.g. ROE 18%). Returning
 * the numeric side (18) regardless of whether the source had it.
 */
function extractPercent(html: string, labels: string[]): number | undefined {
  return extractNumberNear(html, labels);
}

/**
 * Capture the shareholding-panel table rows. Extracts the percentage beside
 * any label whose adjacent <small> says "%. Updated" or just the percent.
 */
function extractShareholding(html: string): {
  promoterHolding?: number;
  promoterPledge?: number;
} {
  const out: { promoterHolding?: number; promoterPledge?: number } = {};

  // Promoter holding is inside the shareholding section.
  const promoter = extractPercent(html, [
    "Promoter holding",
    "Promoter \\& Promoter Group.*holding",
    "Promoter holding \\(for the last filed quarter\\)",
  ]);
  if (typeof promoter === "number") out.promoterHolding = promoter;

  // Pledge is usually a separate row with the word "Pledged" in or near the label.
  const pledge = extractPercent(html, [
    "Pledged percentage",
    "Pledged",
    "Promoter.*Pledged",
  ]);
  if (typeof pledge === "number" && pledge >= 0) {
    out.promoterPledge = pledge;
  } else {
    // Look for explicit "x.xx %" beside the Pledged label inside <small>
    const re = /Pledged[\\s\\S]*?<small[^>]*>([\\d\\.]+)\\s*%/i;
    const m = html.match(re);
    if (m) {
      const v = parseNumber(m[1]);
      if (Number.isFinite(v)) out.promoterPledge = v;
    }
  }
  return out;
}

/**
 * Annual growth percentages from the "Growth" section (Sales / Profit CAGR).
 */
function extractGrowthSection(html: string): {
  salesGrowth?: number;
  epsGrowth?: number;
} {
  const out: { salesGrowth?: number; epsGrowth?: number } = {};
  const sectionRe = /(?:<h[23][^>]*>|id="(?:top-ratios|growth|profit-growth)")([\s\S]{0,20000}?)(?:<\/section>|<div><!-- end)/i;
  const section = html.match(sectionRe);
  if (!section) return out;

  const sales = extractPercent(section[1], [
    "Compounded Sales Growth",
    "Compounded Sales Growth \\(TTM\\)",
    "Sales Growth",
  ]);
  if (typeof sales === "number") out.salesGrowth = sales;

  const eps = extractPercent(section[1], [
    "Compounded Profit Growth",
    "Compounded EPS Growth",
    "EPS Growth",
    "Compounded Profit Growth \\(TTM\\)",
  ]);
  if (typeof eps === "number") out.epsGrowth = eps;
  return out;
}

function extractFromHtml(html: string): ScreenerData {
  const data: ScreenerData = {};

  data.pe = extractNumberNear(html, ["Stock P\\/E", "P\\/E", "Stock PE"]);
  data.marketCapCr = extractNumberNear(html, ["Market Cap"]);
  data.currentPrice = extractNumberNear(html, ["Current Price", "Last Price"]);
  data.bookValue = extractNumberNear(html, ["Book Value"]);
  data.priceToBook = extractNumberNear(html, ["Price to book value", "Price\\/Book"]);
  data.roe = extractPercent(html, [
    "ROE",
    "Return On Equity",
    "RONW",
  ]);
  data.roce = extractPercent(html, ["ROCE", "Return On Capital Employed"]);
  data.debtToEquity = extractNumberNear(html, [
    "Debt to equity",
    "Debt\\/Equity",
    "Debt / Equity",
  ]);
  data.dividendYield = extractPercent(html, [
    "Dividend Yield",
    "Dividend yield",
    "Dividend %",
  ]);
  data.industryPe = extractNumberNear(html, ["Industry P\\/E", "Sector P\\/E"]);

  const sh = extractShareholding(html);
  if (typeof sh.promoterHolding === "number") data.promoterHolding = sh.promoterHolding;
  if (typeof sh.promoterPledge === "number") data.promoterPledge = sh.promoterPledge;

  // Fallback to whole-document regex if the per-section extractor missed.
  const grow = extractGrowthSection(html);
  if (typeof grow.salesGrowth === "number") data.salesGrowth = grow.salesGrowth;
  if (typeof grow.epsGrowth === "number") data.epsGrowth = grow.epsGrowth;
  if (data.salesGrowth == null) {
    const m = html.match(/Compounded Sales Growth[\s\S]{0,2000}?([\d]+(?:\.[\d]+)?)/i);
    if (m) {
      const v = parseNumber(m[1]);
      if (Number.isFinite(v)) data.salesGrowth = v;
    }
  }
  if (data.epsGrowth == null) {
    const m = html.match(/Compounded Profit Growth[\s\S]{0,2000}?([\d]+(?:\.[\d]+)?)/i);
    if (m) {
      const v = parseNumber(m[1]);
      if (Number.isFinite(v)) data.epsGrowth = v;
    }
  }

  return data;
}

/** Internal: fetch from screener.in only. */
async function _fetchFromScreenerIn(
  slug: string,
  opts: { timeoutMs?: number } = {}
): Promise<ScreenerData | null> {
  const timeout = opts.timeoutMs ?? 3500;
  const serverWarn = (msg: string) => { if (typeof console !== "undefined") console.warn(`[bsr:fundamentals] ${slug} — ${msg}`); };
  for (const suffix of ["", "/consolidated/"]) {
    const url = `https://www.screener.in/company/${slug}${suffix}`;
    try {
      const res = await fetch(url, {
        headers: SCREENER_HEADERS,
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) { serverWarn(`HTTP ${res.status} from ${url}`); continue; }
      const html = await res.text();
      if (html.includes("404") && html.includes("Page Not Found")) { serverWarn("page not found (404 body)"); continue; }
      const data = extractFromHtml(html);
      if (data.pe == null && data.currentPrice == null && data.roe == null) {
        serverWarn("extracted no fields (pe/price/roe all null)");
        continue;
      }
      return data;
    } catch (e) {
      serverWarn(e instanceof Error ? e.message : "unknown network error");
      continue;
    }
  }
  return null;
}

/** Yahoo quoteSummary fallback for P/E and market cap. */
async function fetchYahooFundamentals(slug: string): Promise<{ pe?: number; marketCapCr?: number } | null> {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(slug)}.NS?modules=summaryDetail,defaultKeyStatistics`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const q = json?.quoteSummary?.result?.[0];
    if (!q) return null;
    const sd = q.summaryDetail;
    const dk = q.defaultKeyStatistics;
    const pe = sd?.trailingPE?.raw ?? sd?.forwardPE?.raw;
    const mc = sd?.marketCap?.raw ?? dk?.marketCap?.raw;
    const out: { pe?: number; marketCapCr?: number } = {};
    if (typeof pe === "number" && pe > 0) out.pe = pe;
    if (typeof mc === "number" && mc > 0) out.marketCapCr = mc / 1e7;
    return out;
  } catch {
    return null;
  }
}

/** Fetch fundamentals from screener.in, falling back to Yahoo Finance. */
export async function fetchFundamentalsFromScreener(
  slug: string,
  opts: { timeoutMs?: number } = {}
): Promise<ScreenerData | null> {
  const primary = await _fetchFromScreenerIn(slug, opts);
  if (primary && (primary.pe != null || primary.marketCapCr != null)) return primary;
  const yahoo = await fetchYahooFundamentals(slug);
  if (yahoo && (yahoo.pe != null || yahoo.marketCapCr != null)) {
    if (typeof console !== "undefined") console.warn(`[bsr:fundamentals] ${slug} — got P/E=${yahoo.pe} from Yahoo fallback`);
    return { ...(primary ?? {}), ...yahoo } as ScreenerData;
  }
  return primary;
}

export function toCrores(screenerMarketCap: number | undefined): number | undefined {
  if (screenerMarketCap == null) return undefined;
  return screenerMarketCap * 1e7;
}
