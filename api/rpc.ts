// ==========================================
// Solana RPC Proxy (Vercel Serverless Function)
// ==========================================
// Proxies Solana RPC calls through Helius so the API key
// stays server-side and never reaches the browser.

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
const RATE_MAX = 60; // RPC is polled frequently, allow more

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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST only" });

  if (!checkRateLimit(req)) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const heliusKey = process.env.HELIUS_API_KEY;
  const rpcUrl = heliusKey
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
    : "https://api.mainnet-beta.solana.com";

  // Only allow safe read-only RPC methods
  const ALLOWED_RPC_METHODS = new Set([
    "getAccountInfo",
    "getBalance",
    "getBlock",
    "getBlockHeight",
    "getBlockTime",
    "getConfirmedTransaction",
    "getEpochInfo",
    "getGenesisHash",
    "getLatestBlockhash",
    "getMinimumBalanceForRentExemption",
    "getMultipleAccounts",
    "getProgramAccounts",
    "getRecentBlockhash",
    "getSignaturesForAddress",
    "getSlot",
    "getTokenAccountBalance",
    "getTokenAccountsByOwner",
    "getTransaction",
    "getVersion",
  ]);

  const rpcMethod = req.body?.method;
  if (!rpcMethod || !ALLOWED_RPC_METHODS.has(rpcMethod)) {
    console.warn("Blocked RPC method:", rpcMethod);
    return res.status(403).json({ error: `RPC method not allowed: ${rpcMethod}` });
  }

  const FALLBACK_RPC = "https://api.mainnet-beta.solana.com";
  const payload = JSON.stringify(req.body);
  const headers = { "Content-Type": "application/json" };

  // Try primary RPC (Helius), fall back to public RPC on failure
  const endpoints = rpcUrl !== FALLBACK_RPC ? [rpcUrl, FALLBACK_RPC] : [FALLBACK_RPC];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: payload,
        signal: AbortSignal.timeout(15_000), // 15s timeout per attempt
      });

      const data = await response.json();

      // Check for RPC-level errors that warrant fallback
      if (data.error && endpoint !== FALLBACK_RPC) {
        console.warn(`Primary RPC error (${data.error.code}): ${data.error.message}, trying fallback`);
        continue;
      }

      return res.status(200).json(data);
    } catch (error: any) {
      console.warn(`RPC endpoint failed (${endpoint === rpcUrl ? "primary" : "fallback"}): ${error.message}`);
      if (endpoint === endpoints[endpoints.length - 1]) {
        // Last endpoint failed — return error
        return res.status(502).json({ error: `All RPC endpoints failed: ${error.message}` });
      }
      // Otherwise try next endpoint
    }
  }

  return res.status(502).json({ error: "All RPC endpoints failed" });
}
