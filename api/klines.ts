// ==========================================
// Chart Klines Proxy (Vercel Serverless Function)
// ==========================================
// Proxies public klines API with multiple fallback sources.
// Vercel runs from US (iad1) where Binance Global returns 451
// and Bybit returns 403. So we use: Binance.US → OKX → Binance Global.
//
// Endpoint at /api/klines (not /api/binance) because iPhone content
// blockers pattern-match on "binance" in URLs.

import type { VercelRequest, VercelResponse } from "@vercel/node";

// ── CORS ─────────────────────────────────────────────────────
const ALLOWED_ORIGINS = ["https://budju.xyz", "https://www.budju.xyz"];

function getCorsOrigin(req: VercelRequest): string {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin.startsWith("http://localhost:")) return origin;
  return ALLOWED_ORIGINS[0];
}

// ── Rate Limiting ────────────────────────────────────────────
const _rateLimits = new Map<string, number[]>();
const RATE_WINDOW = 60_000;
const RATE_MAX = 120;

function checkRateLimit(req: VercelRequest): boolean {
  const ip = (req.headers["x-forwarded-for"] as string || "0.0.0.0").split(",")[0].trim();
  const now = Date.now();
  const timestamps = (_rateLimits.get(ip) || []).filter(t => now - t < RATE_WINDOW);
  if (timestamps.length >= RATE_MAX) return false;
  timestamps.push(now);
  _rateLimits.set(ip, timestamps);
  return true;
}

// ── Allowed symbols ──────────────────────────────────────────
const ALLOWED_SYMBOLS = new Set([
  "SOLUSDT", "BTCUSDT", "ETHUSDT", "LINKUSDT", "SUIUSDT", "AVAXUSDT",
  "DOGEUSDT", "ADAUSDT", "XRPUSDT", "DOTUSDT", "MATICUSDT", "NEARUSDT",
]);

// OKX uses dash notation: BTCUSDT → BTC-USDT
function toOkxSymbol(symbol: string): string {
  return symbol.replace("USDT", "-USDT");
}

const ALLOWED_INTERVALS = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);

// OKX interval mapping
const OKX_INTERVALS: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1H", "4h": "4H", "1d": "1D",
};

// ── Fetch from Binance.US (verified working from US servers) ─
async function fetchBinanceUS(symbol: string, interval: string, limit: number): Promise<any[] | null> {
  try {
    const url = `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

// ── Fetch from OKX (verified working from US servers) ────────
async function fetchOKX(symbol: string, interval: string, limit: number): Promise<any[] | null> {
  try {
    const okxSymbol = toOkxSymbol(symbol);
    const okxInterval = OKX_INTERVALS[interval];
    if (!okxInterval) return null;
    const url = `https://www.okx.com/api/v5/market/candles?instId=${okxSymbol}&bar=${okxInterval}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.code !== "0" || !json.data || json.data.length === 0) return null;
    // OKX returns newest-first: [timestamp, open, high, low, close, volume, ...]
    // Convert to Binance kline format (oldest-first)
    return json.data
      .reverse()
      .map((k: string[]) => [
        parseInt(k[0]),    // open time (ms)
        k[1],              // open
        k[2],              // high
        k[3],              // low
        k[4],              // close
        k[5],              // volume
        parseInt(k[0]) + 59999, // close time (approx)
        k[7] || "0",       // quote volume
        0, "0", "0", "0",  // padding to match Binance format
      ]);
  } catch {
    return null;
  }
}

// ── Fetch from Binance Global (fails from US/AU, last resort) ─
async function fetchBinanceGlobal(symbol: string, interval: string, limit: number): Promise<any[] | null> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const corsOrigin = getCorsOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!checkRateLimit(req)) {
    return res.status(429).json({ error: "Rate limited" });
  }

  const symbol = (req.query.symbol as string || "").toUpperCase();
  const interval = (req.query.interval as string) || "1m";
  const limit = Math.min(parseInt(req.query.limit as string) || 60, 500);

  if (!symbol || !ALLOWED_SYMBOLS.has(symbol)) {
    return res.status(400).json({ error: "Invalid or unsupported symbol" });
  }
  if (!ALLOWED_INTERVALS.has(interval)) {
    return res.status(400).json({ error: "Invalid interval" });
  }

  // Cascade: Binance.US (works from US) → OKX (works from US) → Binance Global (last resort)
  const sources = [
    { name: "Binance.US", fn: () => fetchBinanceUS(symbol, interval, limit) },
    { name: "OKX", fn: () => fetchOKX(symbol, interval, limit) },
    { name: "Binance", fn: () => fetchBinanceGlobal(symbol, interval, limit) },
  ];

  for (const source of sources) {
    const data = await source.fn();
    if (data && data.length > 0) {
      res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
      res.setHeader("X-Data-Source", source.name);
      return res.status(200).json(data);
    }
  }

  return res.status(502).json({ error: "All data sources unavailable" });
}
