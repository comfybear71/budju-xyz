// ==========================================
// Chart Klines Proxy (Vercel Serverless Function)
// ==========================================
// Proxies public klines API with multiple fallback sources.
// Binance returns HTTP 451 from certain Vercel regions (geo-block),
// so we cascade: Binance.US → Bybit → Binance Global.
//
// IMPORTANT: Endpoint at /api/klines (not /api/binance) because
// iPhone content blockers pattern-match on "binance" in URLs.

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

const ALLOWED_INTERVALS = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);

// ── Bybit interval mapping ──────────────────────────────────
const BYBIT_INTERVALS: Record<string, string> = {
  "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D",
};

// ── Fetch from Binance.US (no geo-block) ────────────────────
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

// ── Fetch from Bybit (no geo-block, free public API) ────────
async function fetchBybit(symbol: string, interval: string, limit: number): Promise<any[] | null> {
  try {
    const bybitInterval = BYBIT_INTERVALS[interval];
    if (!bybitInterval) return null;
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${bybitInterval}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.retCode !== 0 || !json.result?.list) return null;
    // Bybit returns newest-first, and format: [timestamp, open, high, low, close, volume, turnover]
    // Convert to Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
    return json.result.list
      .reverse() // oldest first
      .map((k: string[]) => [
        parseInt(k[0]),    // open time (ms)
        k[1],              // open
        k[2],              // high
        k[3],              // low
        k[4],              // close
        k[5],              // volume
        parseInt(k[0]) + 59999, // close time (approx)
        k[6],              // turnover
        0, "0", "0", "0",  // padding to match Binance format
      ]);
  } catch {
    return null;
  }
}

// ── Fetch from Binance Global (may 451 from some regions) ───
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

  // Try sources in order — Binance.US first (no geo-block), then Bybit, then Binance Global
  const sources = [
    { name: "Binance.US", fn: () => fetchBinanceUS(symbol, interval, limit) },
    { name: "Bybit", fn: () => fetchBybit(symbol, interval, limit) },
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
