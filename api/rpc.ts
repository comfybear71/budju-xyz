// ==========================================
// Solana RPC Proxy (Vercel Serverless Function)
// ==========================================
// Proxies Solana RPC calls through Helius so the API key
// stays server-side and never reaches the browser.

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST only" });

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

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error: any) {
    console.error("RPC proxy error:", error);
    return res.status(500).json({ error: error.message });
  }
}
