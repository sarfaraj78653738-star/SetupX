export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockQuote {
  symbol: string;
  name: string;
  exchange: "NSE" | "BSE";
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  pe?: number;
  sector?: string;
  prevClose: number;
  dayHigh: number;
  dayLow: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

const NSE_SUFFIX = ".NS";
const BSE_SUFFIX = ".BO";

export type Exchange = "NSE" | "BSE";

export function yahooSymbolFor(symbol: string, exchange: Exchange = "NSE"): string {
  const s = symbol.toUpperCase();
  const tail = s.slice(-3);
  if (tail === ".NS" || tail === ".BO") return s;
  return `${s}${exchange === "BSE" ? BSE_SUFFIX : NSE_SUFFIX}`;
}

export const INDIAN_UNIVERSE: Array<{ symbol: string; name: string; sector: string }> = [
  { symbol: "RELIANCE", name: "Reliance Industries Ltd", sector: "Energy" },
  { symbol: "TCS", name: "Tata Consultancy Services Ltd", sector: "IT" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", sector: "Banking" },
  { symbol: "INFY", name: "Infosys Ltd", sector: "IT" },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd", sector: "Banking" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever Ltd", sector: "FMCG" },
  { symbol: "ITC", name: "ITC Ltd", sector: "FMCG" },
  { symbol: "SBIN", name: "State Bank of India", sector: "Banking" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", sector: "Telecom" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd", sector: "Banking" },
  { symbol: "LT", name: "Larsen & Toubro Ltd", sector: "Infrastructure" },
  { symbol: "AXISBANK", name: "Axis Bank Ltd", sector: "Banking" },
  { symbol: "ASIANPAINT", name: "Asian Paints Ltd", sector: "Consumer" },
  { symbol: "MARUTI", name: "Maruti Suzuki India Ltd", sector: "Auto" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries Ltd", sector: "Pharma" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", sector: "Finance" },
  { symbol: "HCLTECH", name: "HCL Technologies Ltd", sector: "IT" },
  { symbol: "WIPRO", name: "Wipro Ltd", sector: "IT" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement Ltd", sector: "Cement" },
  { symbol: "TITAN", name: "Titan Company Ltd", sector: "Consumer" },
  { symbol: "NESTLEIND", name: "Nestle India Ltd", sector: "FMCG" },
  { symbol: "POWERGRID", name: "Power Grid Corporation of India Ltd", sector: "Power" },
  { symbol: "NTPC", name: "NTPC Ltd", sector: "Power" },
  { symbol: "M&M", name: "Mahindra & Mahindra Ltd", sector: "Auto" },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd", sector: "Auto" },
  { symbol: "TATASTEEL", name: "Tata Steel Ltd", sector: "Metals" },
  { symbol: "ADANIENT", name: "Adani Enterprises Ltd", sector: "Conglomerate" },
  { symbol: "ADANIPORTS", name: "Adani Ports & SEZ Ltd", sector: "Infrastructure" },
  { symbol: "JSWSTEEL", name: "JSW Steel Ltd", sector: "Metals" },
  { symbol: "HINDALCO", name: "Hindalco Industries Ltd", sector: "Metals" },
  { symbol: "COALINDIA", name: "Coal India Ltd", sector: "Mining" },
  { symbol: "ONGC", name: "Oil and Natural Gas Corporation Ltd", sector: "Energy" },
  { symbol: "BPCL", name: "Bharat Petroleum Corporation Ltd", sector: "Energy" },
  { symbol: "IOC", name: "Indian Oil Corporation Ltd", sector: "Energy" },
  { symbol: "GRASIM", name: "Grasim Industries Ltd", sector: "Cement" },
  { symbol: "DRREDDY", name: "Dr Reddys Laboratories Ltd", sector: "Pharma" },
  { symbol: "CIPLA", name: "Cipla Ltd", sector: "Pharma" },
  { symbol: "DIVISLAB", name: "Divis Laboratories Ltd", sector: "Pharma" },
  { symbol: "APOLLOHOSP", name: "Apollo Hospitals Enterprise Ltd", sector: "Healthcare" },
  { symbol: "BRITANNIA", name: "Britannia Industries Ltd", sector: "FMCG" },
  { symbol: "EICHERMOT", name: "Eicher Motors Ltd", sector: "Auto" },
  { symbol: "HEROMOTOCO", name: "Hero MotoCorp Ltd", sector: "Auto" },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv Ltd", sector: "Finance" },
  { symbol: "BAJAJ-AUTO", name: "Bajaj Auto Ltd", sector: "Auto" },
  { symbol: "INDUSINDBK", name: "IndusInd Bank Ltd", sector: "Banking" },
  { symbol: "SBILIFE", name: "SBI Life Insurance Company Ltd", sector: "Insurance" },
  { symbol: "HDFCLIFE", name: "HDFC Life Insurance Company Ltd", sector: "Insurance" },
  { symbol: "TECHM", name: "Tech Mahindra Ltd", sector: "IT" },
  { symbol: "SHRIRAMFIN", name: "Shriram Finance Ltd", sector: "Finance" },
  { symbol: "LTIM", name: "LTIMindtree Ltd", sector: "IT" },
  { symbol: "TATACONSUM", name: "Tata Consumer Products Ltd", sector: "FMCG" },
  { symbol: "BANKINDIA", name: "Bank of India", sector: "Banking" },
  { symbol: "PNB", name: "Punjab National Bank", sector: "Banking" },
  { symbol: "CANBK", name: "Canara Bank", sector: "Banking" },
  { symbol: "IDFCFIRSTB", name: "IDFC First Bank Ltd", sector: "Banking" },
  { symbol: "FEDERALBNK", name: "Federal Bank Ltd", sector: "Banking" },
  { symbol: "BANKBARODA", name: "Bank of Baroda", sector: "Banking" },
  { symbol: "DLF", name: "DLF Ltd", sector: "Realty" },
  { symbol: "GAIL", name: "GAIL (India) Ltd", sector: "Energy" },
  { symbol: "VEDL", name: "Vedanta Ltd", sector: "Metals" },
  { symbol: "ZOMATO", name: "Zomato Ltd", sector: "Internet" },
  { symbol: "PAYTM", name: "One 97 Communications Ltd", sector: "Fintech" },
  { symbol: "NYKAA", name: "FSN E-Commerce Ventures Ltd", sector: "Internet" },
  { symbol: "IRCTC", name: "Indian Railway Catering & Tourism Corp", sector: "Services" },
  { symbol: "LICI", name: "Life Insurance Corporation of India", sector: "Insurance" },
  { symbol: "PIDILITIND", name: "Pidilite Industries Ltd", sector: "Chemicals" },
  { symbol: "DABUR", name: "Dabur India Ltd", sector: "FMCG" },
  { symbol: "GODREJCP", name: "Godrej Consumer Products Ltd", sector: "FMCG" },
  { symbol: "MARICO", name: "Marico Ltd", sector: "FMCG" },
  { symbol: "COLPAL", name: "Colgate-Palmolive (India) Ltd", sector: "FMCG" },
  { symbol: "HAVELLS", name: "Havells India Ltd", sector: "Consumer Durables" },
  { symbol: "VOLTAS", name: "Voltas Ltd", sector: "Consumer Durables" },
  { symbol: "LUPIN", name: "Lupin Ltd", sector: "Pharma" },
  { symbol: "TORNTPHARM", name: "Torrent Pharmaceuticals Ltd", sector: "Pharma" },
  { symbol: "AUROPHARMA", name: "Aurobindo Pharma Ltd", sector: "Pharma" },
  { symbol: "BIOCON", name: "Biocon Ltd", sector: "Pharma" },
  { symbol: "GLAND", name: "Gland Pharma Ltd", sector: "Pharma" },
  { symbol: "PEL", name: "Piramal Enterprises Ltd", sector: "Finance" },
  { symbol: "CHOLAFIN", name: "Cholamandalam Investment & Finance", sector: "Finance" },
  { symbol: "MUTHOOTFIN", name: "Muthoot Finance Ltd", sector: "Finance" },
  { symbol: "RECLTD", name: "REC Ltd", sector: "Finance" },
  { symbol: "PFC", name: "Power Finance Corporation Ltd", sector: "Finance" },
  { symbol: "LICHSGFIN", name: "LIC Housing Finance Ltd", sector: "Finance" },
  { symbol: "HDFCAMC", name: "HDFC Asset Management Company Ltd", sector: "Finance" },
  { symbol: "ICICIPRULI", name: "ICICI Prudential Life Insurance", sector: "Insurance" },
  { symbol: "ICICIGI", name: "ICICI Lombard General Insurance", sector: "Insurance" },
  { symbol: "BERGEPAINT", name: "Berger Paints India Ltd", sector: "Consumer" },
  { symbol: "SIEMENS", name: "Siemens Ltd", sector: "Capital Goods" },
  { symbol: "ABB", name: "ABB India Ltd", sector: "Capital Goods" },
  { symbol: "CUMMINSIND", name: "Cummins India Ltd", sector: "Capital Goods" },
  { symbol: "HAL", name: "Hindustan Aeronautics Ltd", sector: "Defence" },
  { symbol: "BEL", name: "Bharat Electronics Ltd", sector: "Defence" },
  { symbol: "BHEL", name: "Bharat Heavy Electricals Ltd", sector: "Capital Goods" },
  { symbol: "SAIL", name: "Steel Authority of India Ltd", sector: "Metals" },
  { symbol: "NMDC", name: "NMDC Ltd", sector: "Mining" },
  { symbol: "JINDALSTEL", name: "Jindal Steel & Power Ltd", sector: "Metals" },
  { symbol: "HINDPETRO", name: "Hindustan Petroleum Corporation Ltd", sector: "Energy" },
  { symbol: "PETRONET", name: "Petronet LNG Ltd", sector: "Energy" },
  { symbol: "TATAPOWER", name: "Tata Power Company Ltd", sector: "Power" },
  { symbol: "ADANIGREEN", name: "Adani Green Energy Ltd", sector: "Power" },
  { symbol: "ADANIPOWER", name: "Adani Power Ltd", sector: "Power" },
  { symbol: "JSWENERGY", name: "JSW Energy Ltd", sector: "Power" },
  { symbol: "IGL", name: "Indraprastha Gas Ltd", sector: "Energy" },
  { symbol: "MGL", name: "Mahanagar Gas Ltd", sector: "Energy" },
  { symbol: "DMART", name: "Avenue Supermarts Ltd", sector: "Retail" },
  { symbol: "TRENT", name: "Trent Ltd", sector: "Retail" },
  { symbol: "JINDWORLD", name: "Jindal Worldwide Ltd", sector: "Consumer" },
  { symbol: "PAGEIND", name: "Page Industries Ltd", sector: "Consumer" },
  { symbol: "JIOFIN", name: "Jio Financial Services Ltd", sector: "Finance" },
];

export const NIFTY50_INDEX: { symbol: string; name: string; sector: string }[] = [
  { symbol: "RELIANCE", name: "Reliance Industries Ltd", sector: "Energy" },
  { symbol: "TCS", name: "Tata Consultancy Services Ltd", sector: "IT" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", sector: "Banking" },
  { symbol: "INFY", name: "Infosys Ltd", sector: "IT" },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd", sector: "Banking" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever Ltd", sector: "FMCG" },
  { symbol: "ITC", name: "ITC Ltd", sector: "FMCG" },
  { symbol: "SBIN", name: "State Bank of India", sector: "Banking" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", sector: "Telecom" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd", sector: "Banking" },
  { symbol: "LT", name: "Larsen & Toubro Ltd", sector: "Infrastructure" },
  { symbol: "AXISBANK", name: "Axis Bank Ltd", sector: "Banking" },
  { symbol: "ASIANPAINT", name: "Asian Paints Ltd", sector: "Consumer" },
  { symbol: "MARUTI", name: "Maruti Suzuki India Ltd", sector: "Auto" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries Ltd", sector: "Pharma" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", sector: "Finance" },
  { symbol: "HCLTECH", name: "HCL Technologies Ltd", sector: "IT" },
  { symbol: "WIPRO", name: "Wipro Ltd", sector: "IT" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement Ltd", sector: "Cement" },
  { symbol: "TITAN", name: "Titan Company Ltd", sector: "Consumer" },
  { symbol: "NESTLEIND", name: "Nestle India Ltd", sector: "FMCG" },
  { symbol: "POWERGRID", name: "Power Grid Corporation of India Ltd", sector: "Power" },
  { symbol: "NTPC", name: "NTPC Ltd", sector: "Power" },
  { symbol: "M&M", name: "Mahindra & Mahindra Ltd", sector: "Auto" },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd", sector: "Auto" },
  { symbol: "TATASTEEL", name: "Tata Steel Ltd", sector: "Metals" },
  { symbol: "ADANIENT", name: "Adani Enterprises Ltd", sector: "Conglomerate" },
  { symbol: "ADANIPORTS", name: "Adani Ports & SEZ Ltd", sector: "Infrastructure" },
  { symbol: "JSWSTEEL", name: "JSW Steel Ltd", sector: "Metals" },
  { symbol: "HINDALCO", name: "Hindalco Industries Ltd", sector: "Metals" },
  { symbol: "COALINDIA", name: "Coal India Ltd", sector: "Mining" },
  { symbol: "ONGC", name: "Oil and Natural Gas Corporation Ltd", sector: "Energy" },
  { symbol: "BPCL", name: "Bharat Petroleum Corporation Ltd", sector: "Energy" },
  { symbol: "IOC", name: "Indian Oil Corporation Ltd", sector: "Energy" },
  { symbol: "GRASIM", name: "Grasim Industries Ltd", sector: "Cement" },
  { symbol: "DRREDDY", name: "Dr Reddys Laboratories Ltd", sector: "Pharma" },
  { symbol: "CIPLA", name: "Cipla Ltd", sector: "Pharma" },
  { symbol: "DIVISLAB", name: "Divis Laboratories Ltd", sector: "Pharma" },
  { symbol: "APOLLOHOSP", name: "Apollo Hospitals Enterprise Ltd", sector: "Healthcare" },
  { symbol: "BRITANNIA", name: "Britannia Industries Ltd", sector: "FMCG" },
  { symbol: "EICHERMOT", name: "Eicher Motors Ltd", sector: "Auto" },
  { symbol: "HEROMOTOCO", name: "Hero MotoCorp Ltd", sector: "Auto" },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv Ltd", sector: "Finance" },
  { symbol: "BAJAJ-AUTO", name: "Bajaj Auto Ltd", sector: "Auto" },
  { symbol: "INDUSINDBK", name: "IndusInd Bank Ltd", sector: "Banking" },
  { symbol: "SBILIFE", name: "SBI Life Insurance Company Ltd", sector: "Insurance" },
  { symbol: "HDFCLIFE", name: "HDFC Life Insurance Company Ltd", sector: "Insurance" },
  { symbol: "TECHM", name: "Tech Mahindra Ltd", sector: "IT" },
  { symbol: "SHRIRAMFIN", name: "Shriram Finance Ltd", sector: "Finance" },
  { symbol: "LTIM", name: "LTIMindtree Ltd", sector: "IT" },
  { symbol: "TATACONSUM", name: "Tata Consumer Products Ltd", sector: "FMCG" },
  { symbol: "TRENT", name: "Trent Ltd", sector: "Retail" },
  { symbol: "JIOFIN", name: "Jio Financial Services Ltd", sector: "Finance" },
  { symbol: "BEL", name: "Bharat Electronics Ltd", sector: "Defence" },
  { symbol: "HAL", name: "Hindustan Aeronautics Ltd", sector: "Defence" },
  { symbol: "DLF", name: "DLF Ltd", sector: "Realty" },
  { symbol: "PIDILITIND", name: "Pidilite Industries Ltd", sector: "Chemicals" },
];

export const NIFTY_NEXT50_INDEX: { symbol: string; name: string; sector: string }[] = [
  { symbol: "ADANIPOWER", name: "Adani Power Ltd", sector: "Power" },
  { symbol: "ADANIGREEN", name: "Adani Green Energy Ltd", sector: "Power" },
  { symbol: "ADANIENSOL", name: "Adani Energy Solutions Ltd", sector: "Power" },
  { symbol: "ABB", name: "ABB India Ltd", sector: "Capital Goods" },
  { symbol: "SIEMENS", name: "Siemens Ltd", sector: "Capital Goods" },
  { symbol: "CUMMINSIND", name: "Cummins India Ltd", sector: "Capital Goods" },
  { symbol: "BHEL", name: "Bharat Heavy Electricals Ltd", sector: "Capital Goods" },
  { symbol: "SAIL", name: "Steel Authority of India Ltd", sector: "Metals" },
  { symbol: "NMDC", name: "NMDC Ltd", sector: "Mining" },
  { symbol: "JINDALSTEL", name: "Jindal Steel & Power Ltd", sector: "Metals" },
  { symbol: "VEDL", name: "Vedanta Ltd", sector: "Metals" },
  { symbol: "GAIL", name: "GAIL (India) Ltd", sector: "Energy" },
  { symbol: "HINDPETRO", name: "Hindustan Petroleum Corporation Ltd", sector: "Energy" },
  { symbol: "PETRONET", name: "Petronet LNG Ltd", sector: "Energy" },
  { symbol: "TATAPOWER", name: "Tata Power Company Ltd", sector: "Power" },
  { symbol: "JSWENERGY", name: "JSW Energy Ltd", sector: "Power" },
  { symbol: "IGL", name: "Indraprastha Gas Ltd", sector: "Energy" },
  { symbol: "DMART", name: "Avenue Supermarts Ltd", sector: "Retail" },
  { symbol: "ZOMATO", name: "Zomato Ltd", sector: "Internet" },
  { symbol: "PAYTM", name: "One 97 Communications Ltd", sector: "Fintech" },
  { symbol: "IRCTC", name: "Indian Railway Catering & Tourism Corp", sector: "Services" },
  { symbol: "LICI", name: "Life Insurance Corporation of India", sector: "Insurance" },
  { symbol: "DABUR", name: "Dabur India Ltd", sector: "FMCG" },
  { symbol: "GODREJCP", name: "Godrej Consumer Products Ltd", sector: "FMCG" },
  { symbol: "MARICO", name: "Marico Ltd", sector: "FMCG" },
  { symbol: "COLPAL", name: "Colgate-Palmolive (India) Ltd", sector: "FMCG" },
  { symbol: "HAVELLS", name: "Havells India Ltd", sector: "Consumer Durables" },
  { symbol: "VOLTAS", name: "Voltas Ltd", sector: "Consumer Durables" },
  { symbol: "LUPIN", name: "Lupin Ltd", sector: "Pharma" },
  { symbol: "TORNTPHARM", name: "Torrent Pharmaceuticals Ltd", sector: "Pharma" },
  { symbol: "AUROPHARMA", name: "Aurobindo Pharma Ltd", sector: "Pharma" },
  { symbol: "BIOCON", name: "Biocon Ltd", sector: "Pharma" },
  { symbol: "PEL", name: "Piramal Enterprises Ltd", sector: "Finance" },
  { symbol: "CHOLAFIN", name: "Cholamandalam Investment & Finance", sector: "Finance" },
  { symbol: "MUTHOOTFIN", name: "Muthoot Finance Ltd", sector: "Finance" },
  { symbol: "RECLTD", name: "REC Ltd", sector: "Finance" },
  { symbol: "PFC", name: "Power Finance Corporation Ltd", sector: "Finance" },
  { symbol: "LICHSGFIN", name: "LIC Housing Finance Ltd", sector: "Finance" },
  { symbol: "HDFCAMC", name: "HDFC Asset Management Company Ltd", sector: "Finance" },
  { symbol: "ICICIPRULI", name: "ICICI Prudential Life Insurance", sector: "Insurance" },
  { symbol: "ICICIGI", name: "ICICI Lombard General Insurance", sector: "Insurance" },
  { symbol: "BERGEPAINT", name: "Berger Paints India Ltd", sector: "Consumer" },
  { symbol: "PAGEIND", name: "Page Industries Ltd", sector: "Consumer" },
  { symbol: "BANKBARODA", name: "Bank of Baroda", sector: "Banking" },
  { symbol: "PNB", name: "Punjab National Bank", sector: "Banking" },
  { symbol: "IDFCFIRSTB", name: "IDFC First Bank Ltd", sector: "Banking" },
  { symbol: "FEDERALBNK", name: "Federal Bank Ltd", sector: "Banking" },
  { symbol: "BANKINDIA", name: "Bank of India", sector: "Banking" },
  { symbol: "CANBK", name: "Canara Bank", sector: "Banking" },
];

/**
 * BSE Sensex 30 constituents — listed on the BSE (.BO suffix on Yahoo).
 * These are the 30 heavyweights of the Bombay Stock Exchange.
 * Note: many are dual-listed so Yahoo Finance returns identical candles for the .BO and .NS pair;
 *       passing `exchange="BSE"` will fall back to NSE for the symbols Yahoo doesn't expose on BSE.
 */
export const BSE_SENSEX_INDEX: { symbol: string; name: string; sector: string }[] = [
  { symbol: "RELIANCE", name: "Reliance Industries Ltd (BSE)", sector: "Energy" },
  { symbol: "TCS", name: "Tata Consultancy Services Ltd (BSE)", sector: "IT" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd (BSE)", sector: "Banking" },
  { symbol: "INFY", name: "Infosys Ltd (BSE)", sector: "IT" },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd (BSE)", sector: "Banking" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever Ltd (BSE)", sector: "FMCG" },
  { symbol: "ITC", name: "ITC Ltd (BSE)", sector: "FMCG" },
  { symbol: "SBIN", name: "State Bank of India (BSE)", sector: "Banking" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd (BSE)", sector: "Telecom" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd (BSE)", sector: "Banking" },
  { symbol: "LT", name: "Larsen & Toubro Ltd (BSE)", sector: "Infrastructure" },
  { symbol: "AXISBANK", name: "Axis Bank Ltd (BSE)", sector: "Banking" },
  { symbol: "ASIANPAINT", name: "Asian Paints Ltd (BSE)", sector: "Consumer" },
  { symbol: "MARUTI", name: "Maruti Suzuki India Ltd (BSE)", sector: "Auto" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries Ltd (BSE)", sector: "Pharma" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd (BSE)", sector: "Finance" },
  { symbol: "HCLTECH", name: "HCL Technologies Ltd (BSE)", sector: "IT" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement Ltd (BSE)", sector: "Cement" },
  { symbol: "TITAN", name: "Titan Company Ltd (BSE)", sector: "Consumer" },
  { symbol: "NESTLEIND", name: "Nestle India Ltd (BSE)", sector: "FMCG" },
  { symbol: "POWERGRID", name: "Power Grid Corporation (BSE)", sector: "Power" },
  { symbol: "NTPC", name: "NTPC Ltd (BSE)", sector: "Power" },
  { symbol: "M&M", name: "Mahindra & Mahindra Ltd (BSE)", sector: "Auto" },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd (BSE)", sector: "Auto" },
  { symbol: "TATASTEEL", name: "Tata Steel Ltd (BSE)", sector: "Metals" },
  { symbol: "JSWSTEEL", name: "JSW Steel Ltd (BSE)", sector: "Metals" },
  { symbol: "HINDALCO", name: "Hindalco Industries Ltd (BSE)", sector: "Metals" },
  { symbol: "ZOMATO", name: "Zomato Ltd (BSE)", sector: "Internet" },
  { symbol: "INDUSINDBK", name: "IndusInd Bank Ltd (BSE)", sector: "Banking" },
  { symbol: "TECHM", name: "Tech Mahindra Ltd (BSE)", sector: "IT" },
];

export interface UniverseEntry {
  symbol: string;
  name: string;
  sector: string;
  indices: Array<"NIFTY50" | "NIFTYNEXT50" | "BROAD" | "BSESENSEX">;
}

function dedupeWithIndex(
  base: Array<{ symbol: string; name: string; sector: string }>,
  named: Array<{ symbol: string; name: string; sector: string }>,
  indexLabel: "NIFTY50" | "NIFTYNEXT50" | "BROAD" | "BSESENSEX"
): UniverseEntry[] {
  const map = new Map<string, UniverseEntry>();
  for (const s of base) {
    map.set(s.symbol, { ...s, indices: ["BROAD"] });
  }
  for (const s of named) {
    const existing = map.get(s.symbol);
    if (existing) {
      if (!existing.indices.includes(indexLabel)) existing.indices.push(indexLabel);
    } else {
      map.set(s.symbol, { ...s, indices: [indexLabel] });
    }
  }
  return Array.from(map.values());
}

function mergeIndexInto(
  existing: UniverseEntry[],
  named: Array<{ symbol: string; name: string; sector: string }>,
  indexLabel: "NIFTY50" | "NIFTYNEXT50" | "BROAD" | "BSESENSEX"
): UniverseEntry[] {
  // Unlike dedupeWithIndex, this does NOT reset indices on existing entries —
  // it only adds the new tag to matches and appends brand-new entries for
  // symbols that aren't already present. Chaining dedupeWithIndex directly
  // would wipe out indices already assigned by a previous pass.
  const map = new Map<string, UniverseEntry>();
  for (const e of existing) map.set(e.symbol, e);
  for (const s of named) {
    const found = map.get(s.symbol);
    if (found) {
      if (!found.indices.includes(indexLabel)) found.indices.push(indexLabel);
    } else {
      map.set(s.symbol, { ...s, indices: [indexLabel] });
    }
  }
  return Array.from(map.values());
}

export const MASTER_UNIVERSE: UniverseEntry[] = mergeIndexInto(
  dedupeWithIndex(INDIAN_UNIVERSE, NIFTY50_INDEX, "NIFTY50"),
  NIFTY_NEXT50_INDEX,
  "NIFTYNEXT50"
);

export const BSE_UNIVERSE: UniverseEntry[] = dedupeWithIndex(
  INDIAN_UNIVERSE,
  BSE_SENSEX_INDEX,
  "BSESENSEX"
);

export type Scope = "all" | "nifty50" | "niftynext50" | "broad" | "bse";

export function universeFor(scope: Scope = "all"): UniverseEntry[] {
  if (scope === "all") {
    const union = [
      ...MASTER_UNIVERSE,
      ...BSE_UNIVERSE.filter((b) => !MASTER_UNIVERSE.some((m) => m.symbol === b.symbol)),
    ];
    const nifty = union.filter((u) => u.indices.includes("NIFTY50"));
    const rest = union.filter((u) => !u.indices.includes("NIFTY50"));
    const interleaved: UniverseEntry[] = [];
    const max = Math.max(nifty.length, rest.length);
    for (let i = 0; i < max; i++) {
      if (i < rest.length) interleaved.push(rest[i]);
      if (i < nifty.length) interleaved.push(nifty[i]);
    }
    return interleaved;
  }
  if (scope === "bse") {
    return BSE_UNIVERSE.filter((u) => u.indices.includes("BSESENSEX"));
  }
  const key: "NIFTY50" | "NIFTYNEXT50" | "BROAD" =
    scope === "nifty50" ? "NIFTY50" : scope === "niftynext50" ? "NIFTYNEXT50" : "BROAD";
  const filtered = MASTER_UNIVERSE.filter((u) => u.indices.includes(key));
  if (filtered.length === 0) {
    return MASTER_UNIVERSE.filter((u) => u.indices.some((i) => i !== "BROAD"));
  }
  return filtered;
}


const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

interface YChartResult {
  chart: {
    result: Array<{
      meta: {
        symbol: string;
        regularMarketPrice: number;
        previousClose: number;
        regularMarketDayHigh: number;
        regularMarketDayLow: number;
        regularMarketVolume: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
        currency?: string;
      };
      timestamp?: number[];
      indicators: {
        quote: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error: string | null;
  };
}

export async function fetchChartData(
  symbol: string,
  range: string = "6mo",
  interval: string = "1d",
  exchange: Exchange = "NSE"
): Promise<{ candles: Candle[]; quote: StockQuote | null; exchange: Exchange }> {
  const symNoSuffix = symbol.replace(/\.(NS|BO)$/i, "");
  const primary = yahooSymbolFor(symNoSuffix, exchange);
  const altExchange: Exchange = exchange === "NSE" ? "BSE" : "NSE";

  const attempt = async (yahooSymbol: string, ex: Exchange) => {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=${interval}`,
        { headers: YAHOO_HEADERS, cache: "no-store", signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) return null;
      const data: YChartResult = await res.json();
      if (data.chart.error || !data.chart.result?.[0]) return null;
      const result = data.chart.result[0];
      const meta = result.meta;
      const ts = result.timestamp ?? [];
      const q = result.indicators.quote[0];
      const opens = q.open ?? [];
      const highs = q.high ?? [];
      const lows = q.low ?? [];
      const closes = q.close ?? [];
      const volumes = q.volume ?? [];

      const candles: Candle[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = opens[i];
        const h = highs[i];
        const l = lows[i];
        const c = closes[i];
        const v = volumes[i];
        if (o == null || h == null || l == null || c == null || v == null) continue;
        const d = new Date(ts[i] * 1000);
        candles.push({
          date: d.toISOString(),
          open: o,
          high: h,
          low: l,
          close: c,
          volume: v,
        });
      }

      const last = candles[candles.length - 1];
      const prevClose = meta.previousClose ?? candles[candles.length - 2]?.close ?? last?.close ?? 0;
      const price = meta.regularMarketPrice ?? last?.close ?? 0;
      const change = price - prevClose;
      const changePercent = prevClose ? (change / prevClose) * 100 : 0;

      const quote: StockQuote = {
        symbol,
        name: symbol,
        exchange: ex,
        price,
        change,
        changePercent,
        volume: meta.regularMarketVolume ?? last?.volume ?? 0,
        prevClose,
        dayHigh: meta.regularMarketDayHigh ?? last?.high ?? 0,
        dayLow: meta.regularMarketDayLow ?? last?.low ?? 0,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      };
      return { candles, quote, exchange: ex };
    } catch {
      return null;
    }
  };

  const primaryResult = await attempt(primary, exchange);
  if (primaryResult) return primaryResult;
  const altYahoo = yahooSymbolFor(symNoSuffix, altExchange);
  const altResult = await attempt(altYahoo, altExchange);
  if (altResult) return altResult;
  return { candles: [], quote: null, exchange };
}

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
  symbol: string;
}

export async function fetchNews(
  symbol: string,
  opts: { maxAgeHours?: number } = {}
): Promise<NewsItem[]> {
  const maxAgeHours = opts.maxAgeHours ?? 72;
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const yahooSymbol = `${symbol}${NSE_SUFFIX}`;
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    yahooSymbol
  )}&newsCount=15&quotesCount=0`;
  try {
    const res = await fetch(url, {
      headers: YAHOO_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data: { news?: Array<{ title: string; publisher: string; link: string; providerPublishTime: number }> } = await res.json();
    const now = Date.now();
    return (data.news ?? [])
      .filter((n) => now - n.providerPublishTime * 1000 <= maxAgeMs)
      .map((n) => ({
        title: n.title,
        publisher: n.publisher,
        link: n.link,
        publishedAt: new Date(n.providerPublishTime * 1000).toISOString(),
        symbol,
      }));
  } catch {
    return [];
  }
}
