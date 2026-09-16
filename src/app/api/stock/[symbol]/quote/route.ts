import { NextRequest, NextResponse } from "next/server";
import { brokerFetchQuote, getBrokerCredentialsFromHeaders } from "@/lib/broker";
import { getClientIdentifier, globalLimiter, isSafeSymbol } from "@/lib/security";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

/**
 * Lightweight price-only check. This calls the broker's cheap /quotes
 * endpoint (a single current-price lookup), NOT the expensive historical
 * candles + criteria engine + news + fundamentals used by the main
 * /api/stock/[symbol] route. The frontend polls THIS endpoint frequently and
 * only calls the full endpoint when the price it returns has actually
 * changed, to cut down on unnecessary broker API calls and load.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const ip = getClientIdentifier(req.headers);
  const g = globalLimiter.consume(ip);
  if (!g.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { ...HEADERS, "Retry-After": String(g.retryAfter) } });
  }

  const { symbol: rawSymbol } = await params;
  const symbol = (rawSymbol || "").toUpperCase().trim();
  if (!isSafeSymbol(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400, headers: HEADERS });
  }

  const { creds: brokerCreds, error: headerErr } = getBrokerCredentialsFromHeaders(req.headers);
  if (headerErr) return headerErr;
  if (!brokerCreds) {
    return NextResponse.json({ error: "No broker connected" }, { status: 400, headers: { ...HEADERS, "Cache-Control": "no-store" } });
  }

  try {
    const quotes = await brokerFetchQuote(brokerCreds, [symbol]);
    const q = quotes[symbol];
    if (!q) {
      return NextResponse.json({ error: "No quote available" }, { status: 404, headers: { ...HEADERS, "Cache-Control": "no-store" } });
    }
    return NextResponse.json(
      { symbol, price: q.lastPrice, changePercent: q.changePct },
      { headers: { ...HEADERS, "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Quote fetch failed" }, { status: 502, headers: { ...HEADERS, "Cache-Control": "no-store" } });
  }
}
