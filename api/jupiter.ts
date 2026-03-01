// ==========================================
// Jupiter Swap API Proxy (Vercel Serverless Function)
// ==========================================
// Proxies Jupiter swap API calls so the API key stays
// server-side. Falls back to the free lite-api endpoint
// when no JUPITER_API_KEY is configured.

import type { VercelRequest, VercelResponse } from "@vercel/node";

// ── CORS origin check ─────────────────────────────────────
const ALLOWED_ORIGINS = ["https://budju.xyz", "https://www.budju.xyz"];

function getCorsOrigin(req: VercelRequest): string {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin.startsWith("http://localhost:")) return origin;
  return ALLOWED_ORIGINS[0];
}

// ── Rate Limiting (in-memory, per warm instance) ──────────
const _rateLimits = new Map<string, number[]>();
const RATE_WINDOW = 60_000;
const RATE_MAX = 20;

function checkRateLimit(req: VercelRequest): boolean {
  const ip = (req.headers["x-forwarded-for"] as string || "0.0.0.0").split(",")[0].trim();
  const now = Date.now();
  const timestamps = (_rateLimits.get(ip) || []).filter(t => now - t < RATE_WINDOW);
  if (timestamps.length >= RATE_MAX) return false;
  timestamps.push(now);
  _rateLimits.set(ip, timestamps);
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers — restricted to allowed origins only
  const corsOrigin = getCorsOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (!checkRateLimit(req)) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const jupiterKey = process.env.JUPITER_API_KEY;

  // Use paid API if key is available, otherwise free lite-api
  const baseUrl = jupiterKey
    ? "https://api.jup.ag/swap/v1"
    : "https://lite-api.jup.ag/swap/v1";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (jupiterKey) {
    headers["x-api-key"] = jupiterKey;
  }

  try {
    // GET requests → forward to /quote
    if (req.method === "GET") {
      const queryString = new URLSearchParams(
        req.query as Record<string, string>,
      ).toString();
      const url = `${baseUrl}/quote?${queryString}`;

      const response = await fetch(url, { headers });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Jupiter quote error (${response.status}):`, errorText);
        return res.status(response.status).json({
          error: `Jupiter quote failed: ${errorText}`,
        });
      }

      const data = await response.json();
      return res.status(200).json(data);
    }

    // POST requests → forward to /swap
    if (req.method === "POST") {
      const url = `${baseUrl}/swap`;

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(req.body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Jupiter swap error (${response.status}):`, errorText);
        return res.status(response.status).json({
          error: `Jupiter swap failed: ${errorText}`,
        });
      }

      const data = await response.json();
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error: any) {
    console.error("Jupiter proxy error:", error);
    return res.status(500).json({ error: error.message });
  }
}
