import type { NewsItem } from "./marketData";

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

const COMPANY_NAME_BY_SYMBOL: Record<string, string> = {
  RELIANCE: "Reliance Industries",
  TCS: "Tata Consultancy Services",
  HDFCBANK: "HDFC Bank",
  INFY: "Infosys",
  ICICIBANK: "ICICI Bank",
  HINDUNILVR: "Hindustan Unilever",
  ITC: "ITC",
  SBIN: "State Bank of India",
  BHARTIARTL: "Bharti Airtel",
  KOTAKBANK: "Kotak Mahindra Bank",
  LT: "Larsen Toubro",
  AXISBANK: "Axis Bank",
  ASIANPAINT: "Asian Paints",
  MARUTI: "Maruti Suzuki",
  SUNPHARMA: "Sun Pharmaceutical",
  BAJFINANCE: "Bajaj Finance",
  HCLTECH: "HCL Technologies",
  WIPRO: "Wipro",
  ULTRACEMCO: "UltraTech Cement",
  TITAN: "Titan Company",
  NESTLEIND: "Nestle India",
  POWERGRID: "Power Grid",
  NTPC: "NTPC",
  "M&M": "Mahindra Mahindra",
  TATAMOTORS: "Tata Motors",
  TATASTEEL: "Tata Steel",
  ADANIENT: "Adani Enterprises",
  ADANIPORTS: "Adani Ports",
  JSWSTEEL: "JSW Steel",
  HINDALCO: "Hindalco",
  COALINDIA: "Coal India",
  ONGC: "Oil Natural Gas",
  BPCL: "Bharat Petroleum",
  IOC: "Indian Oil",
  GRASIM: "Grasim",
  DRREDDY: "Dr Reddys",
  CIPLA: "Cipla",
  DIVISLAB: "Divis Laboratories",
  APOLLOHOSP: "Apollo Hospitals",
  BRITANNIA: "Britannia",
  EICHERMOT: "Eicher Motors",
  HEROMOTOCO: "Hero MotoCorp",
  BAJAJFINSV: "Bajaj Finserv",
  "BAJAJ-AUTO": "Bajaj Auto",
  INDUSINDBK: "IndusInd Bank",
  SBILIFE: "SBI Life Insurance",
  HDFCLIFE: "HDFC Life Insurance",
  TECHM: "Tech Mahindra",
  SHRIRAMFIN: "Shriram Finance",
  LTIM: "LTIMindtree",
  TATACONSUM: "Tata Consumer Products",
  BANKINDIA: "Bank of India",
  PNB: "Punjab National Bank",
  CANBK: "Canara Bank",
  IDFCFIRSTB: "IDFC First Bank",
  FEDERALBNK: "Federal Bank",
  BANKBARODA: "Bank of Baroda",
  DLF: "DLF",
  GAIL: "GAIL India",
  VEDL: "Vedanta",
  ZOMATO: "Zomato",
  PAYTM: "Paytm",
  NYKAA: "Nykaa",
  IRCTC: "IRCTC",
  LICI: "LIC India",
  PIDILITIND: "Pidilite Industries",
  DABUR: "Dabur India",
  GODREJCP: "Godrej Consumer",
  MARICO: "Marico",
  COLPAL: "Colgate Palmolive India",
  HAVELLS: "Havells India",
  VOLTAS: "Voltas",
  LUPIN: "Lupin",
  TORNTPHARM: "Torrent Pharmaceuticals",
  AUROPHARMA: "Aurobindo Pharma",
  BIOCON: "Biocon",
  GLAND: "Gland Pharma",
  PEL: "Piramal Enterprises",
  CHOLAFIN: "Cholamandalam",
  MUTHOOTFIN: "Muthoot Finance",
  RECLTD: "REC Limited",
  PFC: "Power Finance",
  LICHSGFIN: "LIC Housing Finance",
  HDFCAMC: "HDFC Asset Management",
  ICICIPRULI: "ICICI Prudential Life",
  ICICIGI: "ICICI Lombard",
  BERGEPAINT: "Berger Paints",
  SIEMENS: "Siemens India",
  ABB: "ABB India",
  CUMMINSIND: "Cummins India",
  HAL: "Hindustan Aeronautics",
  BEL: "Bharat Electronics",
  BHEL: "Bharat Heavy Electricals",
  SAIL: "SAIL",
  NMDC: "NMDC",
  JINDALSTEL: "Jindal Steel Power",
  HINDPETRO: "Hindustan Petroleum",
  PETRONET: "Petronet LNG",
  TATAPOWER: "Tata Power",
  ADANIGREEN: "Adani Green Energy",
  ADANIPOWER: "Adani Power",
  JSWENERGY: "JSW Energy",
  IGL: "Indraprastha Gas",
  MGL: "Mahanagar Gas",
  DMART: "Avenue Supermarts",
  TRENT: "Trent",
  PAGEIND: "Page Industries",
};

function decodeXmlEntities(s: string): string {
  return s
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&/g, "&");
}

export async function fetchNewsFromGoogle(
  symbol: string,
  opts: { maxAgeHours?: number; limit?: number; timeoutMs?: number } = {}
): Promise<NewsItem[]> {
  const maxAgeHours = opts.maxAgeHours ?? 24;
  const limit = opts.limit ?? 10;
  const timeoutMs = opts.timeoutMs ?? 4000;
  const name = COMPANY_NAME_BY_SYMBOL[symbol] ?? symbol;
  const when = `when:1d`;
  const query = encodeURIComponent(`${name} stock ${when}`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
  try {
    const res = await fetch(url, {
      headers: YAHOO_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
    const out: NewsItem[] = [];
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    for (const item of items) {
      const titleM = item.match(/<title>([\s\S]*?)<\/title>/);
      const pubM = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const linkM = item.match(/<link>([\s\S]*?)<\/link>/);
      const srcM = item.match(/<source[^>]*>([\s\S]*?)<\/source>/);
      if (!titleM) continue;
      const iso = pubM ? new Date(pubM[1].trim()).toISOString() : new Date().toISOString();
      const age = now - new Date(iso).getTime();
      if (age > maxAgeMs) continue;
      out.push({
        title: decodeXmlEntities(titleM[1]).trim(),
        publisher: sourceFromItem(item) ?? (srcM ? decodeXmlEntities(srcM[1]).trim() : "Unknown"),
        link: linkM ? linkM[1].trim() : "#",
        publishedAt: iso,
        symbol,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function filterRecent(
  items: NewsItem[],
  maxAgeHours = 72
): NewsItem[] {
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  return items.filter((n) => now - new Date(n.publishedAt).getTime() <= maxAgeMs);
}

function sourceFromItem(item: string): string | null {
  const m = item.match(/<source[^>]*>([\s\S]*?)<\/source>/);
  return m ? decodeXmlEntities(m[1]).trim() : null;
}
