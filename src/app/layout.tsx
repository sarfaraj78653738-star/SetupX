import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "SetupX · 10/10 Indian Stock Screener",
  description:
    "Live 3D animated screener for the Indian stock market. Finds NSE stocks hitting every technical and fundamental criterion: major support, 9/15 EMA crossover, bullish candlestick, MACD, pivot, fibonacci, positive news, strong fundamentals.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "SetupX · 10/10 Indian Stock Screener",
    description:
      "Live NSE/BSE screener combining technical, fundamental, and sentiment signals into a single transparent rating.",
    images: ["/icon-512.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">
            {children}
          </div>
          {/* Persistent disclaimer footer */}
          <div className="w-full border-t border-white/10 bg-[#0b1020]/90 px-4 py-3 text-center text-[10px] text-gray-500 backdrop-blur">
            SetupX is an analytics and calculation tool for informational and educational purposes only. It does not constitute investment advice, and we are not SEBI-registered investment advisers or research analysts. All calculations are based on data and inputs you provide. Please consult a qualified financial advisor and do your own research before making any investment decisions.
          </div>
        </div>
        {/* WARNING FOR AGENT: DO NOT REMOVE THIS SCRIPT */}
        <Script src="https://cdn.jsdelivr.net/gh/IdeavoAI/ideavo-scripts@latest/scripts/ideavo.min.js" />
      </body>
    </html>
  );
}
