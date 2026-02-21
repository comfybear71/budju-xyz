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

    // PORTFOLIO ENDPOINT — auth + balance in one call
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

      const portfolioRes = await fetch(baseURL + "/user/balance/", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authData.accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": "SwyftxTrader/1.0",
        },
      });

      const portfolioData = await portfolioRes.json();

      const assets = portfolioData.map((item: any) => ({
        code: item.asset?.code || "UNKNOWN",
        name: item.asset?.name || "Unknown",
        balance: parseFloat(item.availableBalance || 0),
        aud_value: parseFloat(item.audValue || 0),
        change_24h: parseFloat(item.asset?.change24h || 0),
        asset_id: item.asset?.id,
      }));

      return res.status(200).json({ assets });
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

    // PIN check for trading endpoints
    const TRADING_ENDPOINTS = ["/orders/"];
    if (TRADING_ENDPOINTS.includes(endpoint) && method === "POST") {
      if (pin !== process.env.TRADE_PIN) {
        return res.status(403).json({ error: "Invalid PIN" });
      }
    }

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
