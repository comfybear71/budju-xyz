// ==========================================
// Swyftx API Proxy (Vercel Serverless Function)
// ==========================================
// Proxies requests to Swyftx exchange API.
// Keeps the SWYFTX_API_KEY and access tokens server-side.
// Only allows specific, allowlisted Swyftx endpoints.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { MongoClient } from "mongodb";
import { authMode, verifySession, bearerToken, adminWallets } from "./_session";

const BASE_URL = "https://api.swyftx.com.au";
const SITE_URL = "https://www.budju.xyz";
const MONGODB_URI = process.env.MONGODB_URI || "";
const DB_NAME = process.env.DB_NAME || "flub";

// Paid CoinGecko plan (any tier) serves from pro-api.coingecko.com with an
// x-cg-pro-api-key header — falls back to the free public API if unset.
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || "";
const COINGECKO_BASE_URL = COINGECKO_API_KEY
  ? "https://pro-api.coingecko.com/api/v3"
  : "https://api.coingecko.com/api/v3";

// Server-side order guard — the single choke-point for the rebuy blocklist,
// deployable cap and min-sell guard. Consults the Python /api/trade/guard-check
// (which reads the blocklist from trader_state). Bot orders hard-block; manual
// warn-but-allow. Fails CLOSED for bot orders (safer to skip a bot cycle than
// to let the unguarded bot buy a blocklisted coin), fails open for manual.
async function checkOrderGuard(guard: any): Promise<any> {
  if (!guard || !guard.coin) return { allow: true };
  const isBot = guard.source !== "manual";
  const failClosed = {
    allow: false, block: true, reason: "guard_unavailable",
    message: "Order guard unavailable — bot order blocked",
  };
  try {
    const r = await fetch(`${SITE_URL}/api/trade/guard-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guard),
    });
    if (!r.ok) return isBot ? failClosed : { allow: true };
    return await r.json();
  } catch (e) {
    console.error("guard-check error:", e);
    return isBot ? failClosed : { allow: true };
  }
}

// ── Server-side Swyftx token cache ──────────────────────────
// Reused across warm Vercel function instances (fast path). On a cold
// start / cache miss, checks a tiny shared MongoDB collection before
// hitting Swyftx — the SAME collection api/swyftx_client.py's
// get_cached_token() reads/writes. Without this, this proxy, the Python
// auto-trade-cron.py cron, and index.py's SwyftxClient instances each
// independently refresh a token for what can be the EXACT SAME physical
// SWYFTX_API_KEY (the admin's non-custodial key entry can be "linked" to
// this very key — see link_admin_master_key in database.py), and Swyftx's
// /auth/refresh/ rate limit 429s once too many of those collide — confirmed
// live 2026-10-24. Any Mongo failure here just falls back to a fresh
// Swyftx auth call; it never blocks a real request.
let _cachedToken: string | null = null;
let _tokenExpiry = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes

let _mongoClient: MongoClient | null = null;
async function getTokenCacheCollection() {
  if (!MONGODB_URI) return null;
  try {
    if (!_mongoClient) {
      _mongoClient = new MongoClient(MONGODB_URI);
      await _mongoClient.connect();
    }
    return _mongoClient.db(DB_NAME).collection("swyftx_token_cache");
  } catch {
    return null;
  }
}

async function getServerToken(apiKey: string): Promise<string> {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiry) return _cachedToken;

  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  const coll = await getTokenCacheCollection();
  if (coll) {
    try {
      const doc = await coll.findOne({ _id: keyHash as any });
      if (doc && doc.token && doc.expiresAt > now) {
        _cachedToken = doc.token;
        _tokenExpiry = doc.expiresAt;
        return _cachedToken as string;
      }
    } catch {
      // Shared cache unavailable — fall through to a fresh auth call
    }
  }

  const authRes = await fetch(BASE_URL + "/auth/refresh/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "SwyftxTrader/1.0",
    },
    body: JSON.stringify({ apiKey }),
  });

  const data = await authRes.json();
  if (!authRes.ok || !data.accessToken) {
    throw new Error("Swyftx auth failed");
  }

  _cachedToken = data.accessToken;
  _tokenExpiry = now + TOKEN_TTL_MS;
  if (coll) {
    try {
      await coll.updateOne(
        { _id: keyHash as any },
        { $set: { token: _cachedToken, expiresAt: _tokenExpiry } },
        { upsert: true },
      );
    } catch {
      // Shared cache write failing never blocks the caller
    }
  }
  return _cachedToken;
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "SwyftxTrader/1.0",
  };
}

// ── Endpoint allowlist ──────────────────────────────────────
// Only these patterns can be forwarded to Swyftx via the
// generic handler. All other requests are rejected.
const ALLOWED_PATTERNS: RegExp[] = [
  /^\/orders\/\?limit=\d+$/,               // Order history (GET)
  /^\/orders\/\d+\/?$/,                     // Orders for asset ID (GET) e.g. /orders/36/
  /^\/markets\/assets\/?$/,                 // Asset list (GET)
  /^\/orders\/[a-zA-Z0-9_-]{10,60}\/?$/,   // Specific order by UUID or ord_ ID (GET/DELETE)
];

function isAllowedEndpoint(endpoint: string): boolean {
  return ALLOWED_PATTERNS.some((p) => p.test(endpoint));
}

// ── CORS origin check ─────────────────────────────────────
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

// ── Rate Limiting (in-memory, per warm instance) ──────────
const _rateLimits = new Map<string, number[]>();
const RATE_WINDOW = 60_000; // 60 seconds
const RATE_MAX = 30;        // max requests per window per IP

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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST only" });

  // Rate limit check
  if (!checkRateLimit(req)) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const apiKey = process.env.SWYFTX_API_KEY;
  if (!apiKey) {
    console.error("SWYFTX_API_KEY not set");
    return res.status(500).json({ error: "SWYFTX_API_KEY not set" });
  }

  try {
    const { endpoint, method, body, guard } = req.body;

    console.log("Proxy request:", method, endpoint);

    // ── Who may WRITE through the server's master Swyftx key ──
    // Reads (portfolio, prices, open orders, history) stay public. Anything
    // that can change the admin's Swyftx account — placing/cancelling orders
    // or any non-GET call — needs a wallet-signed admin pass (api/_session.ts).
    const isWrite = (method || "GET").toUpperCase() !== "GET";
    if (isWrite) {
      const mode = authMode();
      if (mode !== "off") {
        const wallet = verifySession(bearerToken(req.headers.authorization));
        const ok = !!wallet && adminWallets().includes(wallet);
        if (!ok) {
          if (mode === "on") {
            return res.status(401).json({ error: "Sign in with your admin wallet to place or change orders", authRequired: true });
          }
          console.warn(`[auth] WOULD BLOCK proxy write ${method} ${endpoint}: no valid admin pass`);
        }
      }
    }

    // ── PORTFOLIO — auth + balance + asset info in one call ──
    if (endpoint === "/portfolio/") {
      const token = await getServerToken(apiKey);
      const headers = authHeaders(token);

      // Fetch balances and asset list in parallel
      const [portfolioRes, assetsRes] = await Promise.all([
        fetch(BASE_URL + "/user/balance/", { method: "GET", headers }),
        fetch(BASE_URL + "/markets/assets/", { method: "GET", headers }),
      ]);

      const portfolioData = await portfolioRes.json();
      const assetsData = await assetsRes.json();

      // Build lookup: assetId → { code, name } — use String keys to avoid int/string mismatch
      const assetMap: Record<string, { code: string; name: string }> = {};
      if (Array.isArray(assetsData)) {
        for (const a of assetsData) {
          if (a.id != null) {
            assetMap[String(a.id)] = { code: a.code || "UNKNOWN", name: a.name || "Unknown" };
          }
        }
      }

      const assets = (Array.isArray(portfolioData) ? portfolioData : []).map((item: any) => {
        const assetId = item.assetId ?? item.asset?.id;
        const info = (assetId != null ? assetMap[String(assetId)] : undefined) || {};
        return {
          code: item.asset?.code || info.code || "UNKNOWN",
          name: item.asset?.name || info.name || "Unknown",
          balance: parseFloat(item.availableBalance || 0),
          aud_value: parseFloat(item.audValue || 0),
          change_24h: parseFloat(item.asset?.change24h || 0),
          asset_id: assetId,
        };
      });

      return res.status(200).json({ assets });
    }

    // ── PRICES — proxy CoinGecko server-side to avoid CORS ──
    if (endpoint === "/prices/") {
      const { ids } = body || {};
      if (!ids) return res.status(400).json({ error: "ids required" });
      // Fetch both USD and AUD prices to derive a live AUD→USD exchange rate
      const cgRes = await fetch(
        `${COINGECKO_BASE_URL}/simple/price?ids=${ids}&vs_currencies=usd,aud&include_24hr_change=true`,
        COINGECKO_API_KEY ? { headers: { "x-cg-pro-api-key": COINGECKO_API_KEY } } : undefined,
      );
      const data = await cgRes.json();
      return res.status(200).json(data);
    }

    // ── OPEN ORDERS — enrich with asset codes ──
    if (endpoint === "/orders/open" || endpoint === "/orders/open/") {
      const token = await getServerToken(apiKey);
      const headers = authHeaders(token);

      // Try without trailing slash first (matches FLUB), fall back to with slash
      let ordersRes = await fetch(BASE_URL + "/orders/open", { method: "GET", headers });
      if (!ordersRes.ok) {
        console.log("Swyftx /orders/open returned", ordersRes.status, "— trying with trailing slash");
        ordersRes = await fetch(BASE_URL + "/orders/open/", { method: "GET", headers });
      }

      const assetsRes = await fetch(BASE_URL + "/markets/assets/", { method: "GET", headers });

      if (!ordersRes.ok) {
        const errData = await ordersRes.json().catch(() => ({}));
        console.error("Open orders failed:", ordersRes.status, JSON.stringify(errData));
        return res.status(ordersRes.status).json(errData);
      }

      const ordersData = await ordersRes.json();
      const assetsData = await assetsRes.json();

      // Log raw response for diagnostics
      const dataKeys = ordersData ? Object.keys(ordersData) : [];
      const isArray = Array.isArray(ordersData);
      console.log(`Open orders raw: isArray=${isArray}, keys=${JSON.stringify(dataKeys)}, type=${typeof ordersData}`);
      if (!isArray && typeof ordersData === "object") {
        // Log all possible nested array fields
        for (const k of dataKeys) {
          if (Array.isArray(ordersData[k])) {
            console.log(`  ordersData.${k}: array of ${ordersData[k].length} items`);
          }
        }
      }

      const assetMap: Record<string, { code: string; name: string }> = {};
      if (Array.isArray(assetsData)) {
        for (const a of assetsData) {
          assetMap[String(a.id)] = { code: a.code || "UNKNOWN", name: a.name || "Unknown" };
        }
      }

      // Parse orders from all possible response formats
      let raw: any[];
      if (Array.isArray(ordersData)) {
        raw = ordersData;
      } else if (ordersData?.orders && Array.isArray(ordersData.orders)) {
        raw = ordersData.orders;
      } else if (ordersData?.data && Array.isArray(ordersData.data)) {
        raw = ordersData.data;
      } else {
        // Last resort: find any array in the response
        raw = [];
        for (const k of dataKeys) {
          if (Array.isArray(ordersData[k]) && ordersData[k].length > 0) {
            raw = ordersData[k];
            console.log(`Open orders: using ordersData.${k} (${raw.length} items)`);
            break;
          }
        }
      }

      console.log(`Open orders: ${raw.length} orders found`);
      if (raw.length > 0) {
        console.log("First order sample:", JSON.stringify(raw[0]).slice(0, 300));
      }

      const enriched = raw.map((o: any) => {
        const primaryId = String(o.primary_asset ?? o.primaryAsset ?? "");
        const secondaryId = String(o.secondary_asset ?? o.secondaryAsset ?? "");
        return {
          ...o,
          primary_asset: primaryId,
          secondary_asset: secondaryId,
          asset: {
            code: assetMap[secondaryId]?.code || o.asset?.code || secondaryId,
            name: assetMap[secondaryId]?.name || o.asset?.name || "Unknown",
          },
          primaryAssetCode: assetMap[primaryId]?.code || primaryId,
        };
      });

      return res.status(200).json({ orders: enriched });
    }

    // ── ORDER PLACEMENT — resolve asset codes to numeric IDs ──
    if (endpoint === "/orders/" && method === "POST" && body) {
      // ── Trade guard choke-point ──────────────────────────────
      // Every real order (bot or manual) passes through here. Bot orders
      // that hit a guard are hard-blocked; manual orders warn-but-allow
      // (and require an explicit confirm to override). Runs BEFORE any
      // Swyftx token is fetched or order is forwarded.
      const decision = await checkOrderGuard(guard);
      if (decision && decision.allow === false) {
        console.warn("Order blocked by guard:", JSON.stringify(decision));
        return res.status(200).json({
          success: false,
          blocked: !!decision.block,
          requiresConfirm: !!decision.requiresConfirm,
          warning: decision.warning || null,
          reason: decision.reason,
          error: decision.message || "Order blocked by trade guard",
        });
      }

      const token = await getServerToken(apiKey);
      const headers = authHeaders(token);

      // Fetch asset list to build code → ID map
      const assetsRes = await fetch(BASE_URL + "/markets/assets/", {
        method: "GET",
        headers,
      });
      const assetsData = await assetsRes.json();

      const codeToId: Record<string, string> = {};
      if (Array.isArray(assetsData)) {
        for (const a of assetsData) {
          if (a.code && a.id != null) {
            codeToId[String(a.code).toUpperCase()] = String(a.id);
          }
        }
      }

      // Resolve string codes to numeric IDs
      const resolvedBody = { ...body };

      if (resolvedBody.primary && isNaN(Number(resolvedBody.primary))) {
        const id = codeToId[String(resolvedBody.primary).toUpperCase()];
        if (id) {
          console.log(`Order: resolved primary "${resolvedBody.primary}" → ID ${id}`);
          resolvedBody.primary = id;
        } else {
          console.warn(`Order: could not resolve primary "${resolvedBody.primary}"`);
        }
      }

      if (resolvedBody.secondary && isNaN(Number(resolvedBody.secondary))) {
        const id = codeToId[String(resolvedBody.secondary).toUpperCase()];
        if (id) {
          console.log(`Order: resolved secondary "${resolvedBody.secondary}" → ID ${id}`);
          resolvedBody.secondary = id;
        } else {
          console.warn(`Order: could not resolve secondary "${resolvedBody.secondary}"`);
        }
      }

      if (resolvedBody.assetQuantity && isNaN(Number(resolvedBody.assetQuantity))) {
        const id = codeToId[String(resolvedBody.assetQuantity).toUpperCase()];
        if (id) {
          resolvedBody.assetQuantity = id;
        }
      }

      console.log("Order placement payload:", JSON.stringify(resolvedBody));

      const orderRes = await fetch(BASE_URL + "/orders/", {
        method: "POST",
        headers,
        body: JSON.stringify(resolvedBody),
      });

      const orderData = await orderRes.json();
      console.log("Order response:", orderRes.status, JSON.stringify(orderData));
      // Surface a manual-override warning alongside a successful order so the
      // UI can show "placed despite guard" without a second round-trip.
      if (decision && decision.warning && orderRes.ok && orderData && typeof orderData === "object") {
        orderData.guardWarning = decision.warning;
      }
      return res.status(orderRes.status).json(orderData);
    }

    // ── ALLOWLISTED ENDPOINTS — generic forwarder ──
    // Only endpoints matching the strict allowlist can pass through.
    if (!isAllowedEndpoint(endpoint)) {
      console.warn("Blocked endpoint:", endpoint);
      return res.status(403).json({ error: "Endpoint not allowed" });
    }

    const token = await getServerToken(apiKey);
    const url = BASE_URL + endpoint;
    const fetchOptions: RequestInit = {
      method: method || "GET",
      headers: authHeaders(token),
    };

    if (body && ["POST", "PUT", "PATCH"].includes(method)) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    const data = await response.json();

    return res.status(response.status).json(data);
  } catch (error: any) {
    console.error("Proxy error:", error);
    return res.status(500).json({ error: error.message });
  }
}
