// ==========================================
// Binance Klines Proxy (Vercel Serverless Function)
// ==========================================
// Proxies Binance public klines API so mobile Safari (especially
// iPhone) can fetch chart data without being blocked by ITP,
// content blockers, or cross-origin restrictions.

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
const RATE_MAX = 120; // generous — charts poll frequently

function checkRateLimit(req: VercelRequest): boolean {
  const ip = (req.headers["x-forwarded-for"] as string || "0.0.0.0").split(",")[0].trim();
  const now = Date.now();
  const timestamps = (_rateLimits.get(ip) || []).filter(t => now - t < RATE_WINDOW);
  if (timestamps.length >= RATE_MAX) return false;
  timestamps.push(now);
  _rateLimits.set(ip, timestamps);
  return true;
}

// ── Allowed symbols (prevent abuse) ──────────────────────────
const ALLOWED_SYMBOLS = new Set([
  "SOLUSDT", "BTCUSDT", "ETHUSDT", "LINKUSDT", "SUIUSDT", "AVAXUSDT",
  "DOGEUSDT", "ADAUSDT", "XRPUSDT", "DOTUSDT", "MATICUSDT", "NEARUSDT",
]);

const ALLOWED_INTERVALS = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);

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

  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({ error: `Binance returned ${response.status}` });
    }

    const data = await response.json();

    // Cache for 30 seconds — klines don't change that fast
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json(data);
  } catch (err) {
    console.error("[binance-proxy] Error:", err);
    return res.status(502).json({ error: "Failed to fetch from Binance" });
  }
}
