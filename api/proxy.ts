// ==========================================
// Swyftx API Proxy (Vercel Serverless Function)
// ==========================================
// Proxies requests to Swyftx exchange API.
// Keeps the SWYFTX_API_KEY and access tokens server-side.
// Only allows specific, allowlisted Swyftx endpoints.

import type { VercelRequest, VercelResponse } from "@vercel/node";

const BASE_URL = "https://api.swyftx.com.au";

// ── Server-side Swyftx token cache ──────────────────────────
// Reused across warm Vercel function instances. On cold start,
// a fresh token is obtained automatically.
let _cachedToken: string | null = null;
let _tokenExpiry = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes

async function getServerToken(apiKey: string): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;

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
  _tokenExpiry = Date.now() + TOKEN_TTL_MS;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST only" });

  const apiKey = process.env.SWYFTX_API_KEY;
  if (!apiKey) {
    console.error("SWYFTX_API_KEY not set");
    return res.status(500).json({ error: "SWYFTX_API_KEY not set" });
  }

  try {
    const { endpoint, method, body } = req.body;

    console.log("Proxy request:", method, endpoint);

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

      // Build lookup: assetId → { code, name }
      const assetMap: Record<number, { code: string; name: string }> = {};
      if (Array.isArray(assetsData)) {
        for (const a of assetsData) {
          assetMap[a.id] = { code: a.code || "UNKNOWN", name: a.name || "Unknown" };
        }
      }

      const assets = (Array.isArray(portfolioData) ? portfolioData : []).map((item: any) => {
        const assetId = item.assetId ?? item.asset?.id;
        const info = assetMap[assetId] || {};
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
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,aud&include_24hr_change=true`,
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
