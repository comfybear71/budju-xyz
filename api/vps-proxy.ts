/**
 * VPS Trading Bot Proxy — forwards requests from the HTTPS frontend
 * to the HTTP VPS API, avoiding mixed-content browser blocks.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const VPS_API_URL = process.env.VPS_API_URL || "";
const VPS_API_SECRET = process.env.VPS_API_SECRET || "";

// ── CORS ─────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://budju.xyz",
  "https://www.budju.xyz",
];

function getCorsOrigin(req: VercelRequest): string {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin.startsWith("http://localhost:")) return origin;
  return ALLOWED_ORIGINS[0];
}

// ── Rate Limiting ────────────────────────────────────────
const _rateLimits = new Map<string, number[]>();
const RATE_WINDOW = 60_000;
const RATE_MAX_GET = 60;
const RATE_MAX_POST = 15;

function checkRateLimit(req: VercelRequest): boolean {
  const ip = (req.headers["x-forwarded-for"] as string || "0.0.0.0").split(",")[0].trim();
  const max = req.method === "POST" ? RATE_MAX_POST : RATE_MAX_GET;
  const now = Date.now();
  const timestamps = (_rateLimits.get(ip) || []).filter(t => now - t < RATE_WINDOW);
  if (timestamps.length >= max) return false;
  timestamps.push(now);
  _rateLimits.set(ip, timestamps);
  return true;
}

// ── Allowed VPS paths ────────────────────────────────────
const ALLOWED_PATHS = [
  "/api/health",
  "/api/prices",
  "/api/assets",
  "/api/portfolio",
  "/api/trades",
  "/api/status",
  "/api/buy",
  "/api/sell",
  "/api/config",
];

function isAllowedPath(path: string): boolean {
  // Strip query string for matching
  const clean = path.split("?")[0];
  return ALLOWED_PATHS.includes(clean);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const corsOrigin = getCorsOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (!checkRateLimit(req)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  if (!VPS_API_URL) {
    return res.status(503).json({ error: "VPS not configured" });
  }

  // Path comes from query param: /api/vps-proxy?path=/api/health
  const vpsPath = (req.query.path as string) || "";
  if (!vpsPath || !isAllowedPath(vpsPath)) {
    return res.status(403).json({ error: "Path not allowed" });
  }

  try {
    const url = `${VPS_API_URL}${vpsPath}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (VPS_API_SECRET) {
      headers["Authorization"] = `Bearer ${VPS_API_SECRET}`;
    }

    const fetchOptions: RequestInit = {
      method: req.method || "GET",
      headers,
    };

    if (req.method === "POST" && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, fetchOptions);
    const data = await response.json();

    return res.status(response.status).json(data);
  } catch (error: any) {
    console.error("VPS proxy error:", error.message);
    return res.status(502).json({ error: "Cannot reach VPS" });
  }
}
