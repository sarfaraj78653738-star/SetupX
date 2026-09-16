import { NextRequest, NextResponse } from "next/server";
import { fetchIntradayIndicators } from "@/lib/intraday";
import {
  getClientIdentifier,
  globalLimiter,
  isSafeSymbol,
  scanLimiter,
} from "@/lib/security";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
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

  const { symbol: rawSymbol } = await params;
  const symbol = (rawSymbol || "").toUpperCase().trim();
  if (!isSafeSymbol(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400, headers: HEADERS });
  }

  try {
    const indicators = await fetchIntradayIndicators(symbol);
    if (indicators.length === 0) {
      return NextResponse.json(
        { error: "No intraday data available" },
        { status: 404, headers: HEADERS }
      );
    }
    return NextResponse.json(
      { symbol, indicators, generatedAt: new Date().toISOString() },
      { headers: { ...HEADERS, "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch intraday indicators" },
      { status: 500, headers: HEADERS }
    );
  }
}
