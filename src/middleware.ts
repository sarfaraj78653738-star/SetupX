import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  // Public routes — no auth required
  const publicRoutes = ["/login", "/register"];
  const isPublicRoute = publicRoutes.some((r) => request.nextUrl.pathname.startsWith(r));

  // Protected routes — require login
  const protectedRoutes = ["/dashboard", "/settings", "/profile", "/subscription"];
  const isProtectedRoute = protectedRoutes.some((r) => request.nextUrl.pathname.startsWith(r));

  // If accessing a protected route without being logged in, redirect to login
  if (isProtectedRoute && !isLoggedIn) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If accessing login/register while logged in, redirect to home
  if (isPublicRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // API routes — check auth for protected APIs
  if (request.nextUrl.pathname.startsWith("/api/")) {
    // Public APIs (no auth required)
    const publicApis = [
      "/api/auth/",
      "/api/auth/callback/",
      "/api/payments/create-checkout",
      "/api/payments/register",
    ];
    const isPublicApi = publicApis.some((r) => request.nextUrl.pathname.startsWith(r));

    if (!isPublicApi && !isLoggedIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // For subscription-gated endpoints, check tier
    if (request.nextUrl.pathname.startsWith("/api/screener") || request.nextUrl.pathname.startsWith("/api/stock/")) {
      if (isLoggedIn) {
        const tier = session?.user?.subscriptionTier;
        const status = session?.user?.subscriptionStatus;
        const endsAt = session?.user?.subscriptionEndsAt;

        // Allow if: pro/premium with active subscription, OR free user (limited access)
        const isSubscriber =
          (tier === "pro" || tier === "premium") &&
          status === "active" &&
          endsAt &&
          new Date(endsAt) > new Date();

        const isFreeUser = tier === "free";

        if (!isSubscriber && !isFreeUser) {
          return NextResponse.json(
            { error: "Subscription required. Please subscribe to access this feature." },
            { status: 403 }
          );
        }
      } else {
        // Not logged in — can still access free tier features (screener with Yahoo data)
        // But broker features require login
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - API routes (handled separately in the middleware logic)
     * - Static files (_next/static, _next/image, favicon.ico)
     * - Public routes that don't need protection
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
