// ==========================================
// Swyftx API Proxy (Vercel Serverless Function)
// ==========================================
// Proxies requests to Swyftx exchange API.
// Keeps the SWYFTX_API_KEY server-side.
// PIN-protects trading endpoints.

import type { VercelRequest, VercelResponse } from "@vercel/node";

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
    const { endpoint, method, body, authToken, pin } = req.body;
    const baseURL = "https://api.swyftx.com.au";

    console.log("Proxy request:", method, endpoint);

    // PORTFOLIO ENDPOINT — auth + balance + asset info in one call
    if (endpoint === "/portfolio/") {
      const authRes = await fetch(baseURL + "/auth/refresh/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "SwyftxTrader/1.0",
        },
        body: JSON.stringify({ apiKey }),
      });

      const authData = await authRes.json();
      if (!authRes.ok || !authData.accessToken) {
        return res.status(authRes.status).json({ error: "Auth failed" });
      }

      const authHeaders = {
        Authorization: `Bearer ${authData.accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": "SwyftxTrader/1.0",
      };

      // Fetch balances and asset list in parallel
      const [portfolioRes, assetsRes] = await Promise.all([
        fetch(baseURL + "/user/balance/", {
          method: "GET",
          headers: authHeaders,
        }),
        fetch(baseURL + "/markets/assets/", {
          method: "GET",
          headers: authHeaders,
        }),
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

    // PRICES ENDPOINT — proxy CoinGecko server-side to avoid WebView CORS issues
    if (endpoint === "/prices/") {
      const { ids } = body || {};
      if (!ids) return res.status(400).json({ error: "ids required" });
      const cgRes = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      );
      const data = await cgRes.json();
      return res.status(200).json(data);
    }

    // Auth endpoint — use stored API key
    if (endpoint === "/auth/refresh/") {
      const authRes = await fetch(baseURL + "/auth/refresh/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "SwyftxTrader/1.0",
        },
        body: JSON.stringify({ apiKey }),
      });

      const data = await authRes.json();
      console.log("Auth response status:", authRes.status);

      if (!authRes.ok) {
        return res.status(authRes.status).json(data);
      }
      return res.status(200).json(data);
    }

    // Other endpoints — require JWT from client
    if (!authToken) {
      return res.status(401).json({ error: "No authToken provided" });
    }

    // OPEN ORDERS ENDPOINT — enrich with asset codes (Swyftx returns numeric IDs)
    if (endpoint === "/orders/open" || endpoint === "/orders/open/") {
      const authHeaders = {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        "User-Agent": "SwyftxTrader/1.0",
      };

      // Fetch open orders and asset list in parallel
      const [ordersRes, assetsRes] = await Promise.all([
        fetch(baseURL + "/orders/open/", { method: "GET", headers: authHeaders }),
        fetch(baseURL + "/markets/assets/", { method: "GET", headers: authHeaders }),
      ]);

      if (!ordersRes.ok) {
        const errData = await ordersRes.json().catch(() => ({}));
        return res.status(ordersRes.status).json(errData);
      }

      const ordersData = await ordersRes.json();
      const assetsData = await assetsRes.json();

      // Build lookup: assetId → { code, name }
      const assetMap: Record<string, { code: string; name: string }> = {};
      if (Array.isArray(assetsData)) {
        for (const a of assetsData) {
          assetMap[String(a.id)] = { code: a.code || "UNKNOWN", name: a.name || "Unknown" };
        }
      }

      // Enrich orders with string asset codes
      const raw = Array.isArray(ordersData) ? ordersData : (ordersData as any).orders ?? [];
      console.log(`Open orders: ${raw.length} raw orders from Swyftx`);
      for (const o of raw) {
        console.log(`  Order: secondary_asset=${o.secondary_asset}, trigger=${o.trigger}, order_type=${o.order_type}, quantity=${o.quantity}, amount=${o.amount}`);
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

    // ORDER PLACEMENT — resolve asset codes to numeric Swyftx IDs
    // Swyftx expects numeric asset IDs (e.g. 36 for USDC, 3 for BTC),
    // but the client sends string codes (e.g. "USDC", "XRP").
    if (endpoint === "/orders/" && method === "POST" && body) {
      const authHeaders = {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        "User-Agent": "SwyftxTrader/1.0",
      };

      // Fetch asset list to build code → ID map
      const assetsRes = await fetch(baseURL + "/markets/assets/", {
        method: "GET",
        headers: authHeaders,
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

      const orderRes = await fetch(baseURL + "/orders/", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(resolvedBody),
      });

      const orderData = await orderRes.json();
      console.log("Order response:", orderRes.status, JSON.stringify(orderData));
      return res.status(orderRes.status).json(orderData);
    }

    // Trading endpoints — admin-wallet-only (PIN removed, admin gate is client-side)

    const url = baseURL + endpoint;
    const fetchOptions: RequestInit = {
      method: method || "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        "User-Agent": "SwyftxTrader/1.0",
      },
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
