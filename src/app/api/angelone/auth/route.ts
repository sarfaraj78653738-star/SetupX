import { NextRequest, NextResponse } from "next/server";
import { angelProfile } from "@/lib/angelone";
import { authLimiter, getClientIdentifier, safeOriginCheck, scrubSecrets } from "@/lib/security";

export const dynamic = "force-dynamic";

const HEADERS = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  if (!safeOriginCheck(req)) {
    return NextResponse.json({ status: "invalid", error: "Forbidden" }, { status: 403, headers: HEADERS });
  }
  const ip = getClientIdentifier(req.headers);
  const a = authLimiter.consume(ip);
  if (!a.allowed) {
    return NextResponse.json({ status: "invalid", error: "Too many authentication attempts" }, { status: 429, headers: { ...HEADERS, "Retry-After": String(a.retryAfter) } });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: "invalid", error: "Invalid JSON body" }, { status: 400, headers: HEADERS });
  }

  const { apiKey, clientCode, mpin, totpSecret } = body as Record<string, string>;
  if (!apiKey || !clientCode || !mpin || !totpSecret) {
    return NextResponse.json({ status: "invalid", error: "API key, client code, MPIN, and TOTP secret are all required" }, { status: 400, headers: HEADERS });
  }

  const result = await angelProfile({
    broker: "angelone",
    angelone: { apiKey, clientCode, mpin, totpSecret },
  });
  if (result.error) result.error = scrubSecrets(result.error);
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 401, headers: HEADERS });
}
