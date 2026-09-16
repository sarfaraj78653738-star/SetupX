import type { NextConfig } from "next";

// Loader path from @ideavo/webpack-tagger - use direct resolve to get the actual file
const loaderPath = require.resolve('@ideavo/webpack-tagger');

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  allowedDevOrigins: ['*.e2b.app', '*.ideavo.app', '*.ideavo.ai', '*.monkeycode-ai.live'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  turbopack: {
    rules: {
      "*.{jsx,tsx}": {
        loaders: [loaderPath]
      }
    }
  },
  // The static, hashed JS/CSS chunks Next.js builds (_next/static/*) are
  // safe to cache forever — their filename changes on every new deploy. The
  // HTML document itself, though, was being cached by some browsers/proxies
  // without revalidating, so re-opening the site after a new deploy could
  // keep serving an OLD page that still referenced the OLD chart bundle
  // (only a hard history-clear forced a real refetch). This forces every
  // request for the page itself to always revalidate with the server.
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
} as NextConfig;

export default nextConfig;
