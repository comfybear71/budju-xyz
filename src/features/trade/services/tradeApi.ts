// ============================================================
// Trading API Service
// Connects to BUDJU's own Vercel backend:
//   /api/proxy   → Swyftx exchange (portfolio, auth, orders)
//   /api/*       → MongoDB (leaderboard, transactions, etc.)
//   CoinGecko    → Real-time USD prices
// ============================================================

import { getActivityLog } from "./activityLog";
import { getWalletProvider } from "@lib/web3/connection";
const alog = getActivityLog();

// ── Types ──────────────────────────────────────────────────

export interface PortfolioAsset {
  code: string;
  name: string;
  balance: number;
  audValue: number;
  usdValue: number;
  change24h: number;
  priceUsd: number;
  color: string;
  icon: string;
}

export interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  walletShort: string;
  currentValue: number;
  allocation: number;
  joinedDate: string | null;
  lastDeposit: string | null;
  totalDeposited: number;
}

export interface TradeTransaction {
  type: "deposit" | "withdrawal" | "buy" | "sell";
  coin?: string;
  amount: number;
  price?: number;
  currency?: string;
  wallet?: string;
  walletShort?: string;
  timestamp: string | null;
  txHash?: string;
  swyftxId?: string;
}

export interface AdminStats {
  userCount: number;
  totalUserDeposited: number;
  totalUserValue: number;
  poolValue: number;
  nav: number;
  totalShares: number;
  tradeCount: number;
  depositCount: number;
  pnlPercent: number;
}

export interface UserPosition {
  shares: number;
  nav: number;
  currentValue: number;
  allocation: number;
  totalDeposited: number;
}

export interface TraderState {
  enrichedOrders: any[];
  autoTierAssets: Record<string, { name?: string; deviation: number; allocation: number; active?: boolean; coins?: string[] }>;
  autoTierAssignments: Record<string, string>;
  autoBotActive: boolean;
  autoCooldowns: Record<string, number>;
  autoTradeLog: Array<{
    coin: string;
    side: string;
    qty: number;
    price: number;
    timestamp: string;
  }>;
  currentAutoTier?: string;
  /** Raw autoActive object from server for safe merging on save */
  _rawAutoActive?: any;
}

// ── Asset config ───────────────────────────────────────────

export const ASSET_CONFIG: Record<
  string,
  { color: string; icon: string; name: string; coingeckoId: string }
> = {
  BTC: { color: "#f97316", icon: "₿", name: "Bitcoin", coingeckoId: "bitcoin" },
  ETH: { color: "#6366f1", icon: "E", name: "Ethereum", coingeckoId: "ethereum" },
  SOL: { color: "#a855f7", icon: "S", name: "Solana", coingeckoId: "solana" },
  XRP: { color: "#06b6d4", icon: "X", name: "XRP", coingeckoId: "ripple" },
  DOGE: { color: "#eab308", icon: "Ð", name: "Dogecoin", coingeckoId: "dogecoin" },
  ADA: { color: "#3b82f6", icon: "A", name: "Cardano", coingeckoId: "cardano" },
  SUI: { color: "#4ade80", icon: "S", name: "Sui", coingeckoId: "sui" },
  XAUT: { color: "#f59e0b", icon: "Au", name: "Tether Gold", coingeckoId: "tether-gold" },
  AVAX: { color: "#e84142", icon: "A", name: "Avalanche", coingeckoId: "avalanche-2" },
  DOT: { color: "#e6007a", icon: "●", name: "Polkadot", coingeckoId: "polkadot" },
  LINK: { color: "#2a5ada", icon: "⬡", name: "Chainlink", coingeckoId: "chainlink" },
  POL: { color: "#8b5cf6", icon: "P", name: "Polygon", coingeckoId: "polygon-ecosystem-token" },
  HBAR: { color: "#00eab7", icon: "ℏ", name: "Hedera", coingeckoId: "hedera-hashgraph" },
  UNI: { color: "#ff007a", icon: "U", name: "Uniswap", coingeckoId: "uniswap" },
  NEAR: { color: "#00c08b", icon: "N", name: "NEAR", coingeckoId: "near" },
  NEO: { color: "#22c55e", icon: "N", name: "NEO", coingeckoId: "neo" },
  TRX: { color: "#ef4444", icon: "T", name: "TRON", coingeckoId: "tron" },
  BCH: { color: "#8b5cf6", icon: "B", name: "Bitcoin Cash", coingeckoId: "bitcoin-cash" },
  BNB: { color: "#eab308", icon: "B", name: "Binance Coin", coingeckoId: "binancecoin" },
  ENA: { color: "#6b7280", icon: "E", name: "Ethena", coingeckoId: "ethena" },
  NEXO: { color: "#1a56db", icon: "N", name: "Nexo", coingeckoId: "nexo" },
  HYPE: { color: "#00e5a0", icon: "H", name: "Hyperliquid", coingeckoId: "hyperliquid" },
  RENDER: { color: "#ff4f00", icon: "R", name: "Render", coingeckoId: "render-token" },
  FET: { color: "#1b0930", icon: "F", name: "Fetch.ai", coingeckoId: "fetch-ai" },
  TAO: { color: "#000000", icon: "τ", name: "Bittensor", coingeckoId: "bittensor" },
  PEPE: { color: "#00b84d", icon: "🐸", name: "Pepe", coingeckoId: "pepe" },
  LUNA: { color: "#5643c8", icon: "L", name: "Terra", coingeckoId: "terra-luna-2" },
  BONK: { color: "#f59e0b", icon: "🐕", name: "Bonk", coingeckoId: "bonk" },
  WIF: { color: "#a855f7", icon: "🐶", name: "dogwifhat", coingeckoId: "dogwifcoin" },
  JUP: { color: "#22d3ee", icon: "J", name: "Jupiter", coingeckoId: "jupiter-exchange-solana" },
  USDC: { color: "#22c55e", icon: "$", name: "USD Coin", coingeckoId: "usd-coin" },
  AUD: { color: "#f59e0b", icon: "A$", name: "Australian Dollar", coingeckoId: "" },
};

// ── Admin Signature Helper ────────────────────────────────
// Signs a timestamped message with the connected wallet's Ed25519 key.
// Cached for AUTH_CACHE_MS so multiple saves within the same monitoring
// tick reuse one Phantom popup instead of spamming the user.
// The backend verifies this signature on all admin write endpoints.

interface AdminAuth {
  adminWallet: string;
  adminSignature: number[];
  adminMessage: string;
}

const AUTH_CACHE_MS = 5 * 60 * 1000; // 5 minutes
let _cachedAuth: AdminAuth | null = null;
let _cachedAuthTime = 0;
/** True when the user denied the last signature request — prevents retry loops */
let _signatureDenied = false;

function _getWalletProvider(): any {
  return getWalletProvider();
}

/**
 * Get admin auth fields (signature + message) for an admin API request.
 * Caches the signature for AUTH_CACHE_MS to avoid repeated Phantom popups
 * during the monitoring loop. If the user denies the signature, further
 * requests return null until clearAdminAuth() is called (e.g. on reconnect).
 */
export async function getAdminAuth(adminWallet: string): Promise<AdminAuth | null> {
  // If user denied signing, don't keep pestering them
  if (_signatureDenied) return null;

  // Return cached auth if still valid
  if (_cachedAuth && _cachedAuth.adminWallet === adminWallet && Date.now() - _cachedAuthTime < AUTH_CACHE_MS) {
    return _cachedAuth;
  }

  const provider = _getWalletProvider();
  if (!provider || typeof provider.signMessage !== "function") {
    console.warn("Wallet provider does not support signMessage");
    return null;
  }

  const timestamp = Date.now();
  const message = `BUDJU_ADMIN:${timestamp}`;
  const encoded = new TextEncoder().encode(message);

  try {
    const result = await provider.signMessage(encoded, "utf8");
    // Phantom returns { signature: Uint8Array }, other wallets may return raw Uint8Array
    const signatureBytes: Uint8Array = result instanceof Uint8Array
      ? result
      : (result?.signature ?? result);
    _cachedAuth = {
      adminWallet,
      adminSignature: Array.from(signatureBytes),
      adminMessage: message,
    };
    _cachedAuthTime = Date.now();
    _signatureDenied = false;
    return _cachedAuth;
  } catch (err) {
    console.error("Admin signature request denied:", err);
    _signatureDenied = true;
    _cachedAuth = null;
    return null;
  }
}

/** Clear cached auth (call on wallet disconnect/reconnect to reset denial state) */
export function clearAdminAuth() {
  _cachedAuth = null;
  _cachedAuthTime = 0;
  _signatureDenied = false;
}

// ── API helpers ────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 2,
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok && res.status === 429 && i < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("fetchWithRetry exhausted");
}

const cache: Record<string, { data: unknown; expiry: number }> = {};

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache[key];
  if (hit && Date.now() < hit.expiry) return Promise.resolve(hit.data as T);
  return fn().then((data) => {
    cache[key] = { data, expiry: Date.now() + ttlMs };
    return data;
  });
}

// Live AUD→USD rate derived from CoinGecko prices (updated each fetch cycle).
// Falls back to 0.708 if CoinGecko hasn't returned AUD data yet.
export let AUD_TO_USD = 0.708;

/** Update AUD_TO_USD from CoinGecko data that now includes both USD and AUD prices */
function updateAudToUsd(data: Record<string, any>) {
  // Use BTC as the reference (most liquid) to derive AUD→USD rate:
  // If BTC = $67,000 USD and BTC = A$94,648, then 1 AUD = 67000/94648 = 0.708 USD
  const ref = data.bitcoin || data.ethereum;
  if (ref && ref.usd > 0 && ref.aud > 0) {
    AUD_TO_USD = ref.usd / ref.aud;
  }
}

// ── Public API ─────────────────────────────────────────────

/** Fetch portfolio from Swyftx via /api/proxy */
export async function fetchPortfolio(): Promise<PortfolioAsset[]> {
  return cached("portfolio", 30_000, async () => {
    try {
      const res = await fetchWithRetry("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "/portfolio/" }),
      });

      if (!res.ok) throw new Error(`Portfolio: ${res.status}`);
      const data = await res.json();
      const rawAssets = data.assets || data || [];

      const result = rawAssets
        .filter((a: any) => {
          const bal = Number(a.balance) || 0;
          const code = a.code || "";
          return bal > 0 && code !== "USD" && code !== "AUD" && code !== "USDC";
        })
        .map((a: any) => {
          const code = a.code || "";
          const balance = Number(a.balance) || 0;
          const audValue = Number(a.aud_value) || 0;
          const cfg = ASSET_CONFIG[code] || {
            color: "#64748b",
            icon: code.charAt(0),
            name: a.name || code,
            coingeckoId: "",
          };
          return {
            code,
            name: cfg.name,
            balance,
            audValue,
            usdValue: audValue * AUD_TO_USD,
            change24h: Number(a.change_24h) || 0,
            priceUsd: balance > 0 ? (audValue * AUD_TO_USD) / balance : 0,
            color: cfg.color,
            icon: cfg.icon,
          };
        });
      alog.log(`Loaded ${result.length} assets from Swyftx`, "success");
      return result;
    } catch (err) {
      alog.log(`Portfolio fetch error: ${err}`, "error");
      return [];
    }
  });
}

/** Fetch raw CoinGecko data via our own proxy (avoids WebView CORS blocks).
 *  Deduplicates concurrent calls and caches the raw response so both
 *  fetchPrices() and fetchChanges() share a single API call. */
let _cgCache: { data: Record<string, any>; time: number } | null = null;
let _cgInflight: Promise<Record<string, any>> | null = null;
const CG_RAW_TTL = 25_000;

async function fetchCoinGeckoViaProxy(): Promise<Record<string, any>> {
  // Return cached raw data if still fresh
  if (_cgCache && Date.now() - _cgCache.time < CG_RAW_TTL) {
    return _cgCache.data;
  }
  // Deduplicate: if a request is already in-flight, piggy-back on it
  if (_cgInflight) return _cgInflight;

  _cgInflight = (async () => {
    try {
      const ids = Object.values(ASSET_CONFIG)
        .map((a) => a.coingeckoId)
        .filter(Boolean)
        .join(",");
      const res = await fetchWithRetry("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "/prices/", body: { ids } }),
      });
      if (!res.ok) return _cgCache?.data || {};
      const data = await res.json();
      _cgCache = { data, time: Date.now() };
      // Derive live AUD→USD rate from the CoinGecko response
      updateAudToUsd(data);
      return data;
    } finally {
      _cgInflight = null;
    }
  })();

  return _cgInflight;
}

/** Fetch live USD prices from CoinGecko (proxied server-side) */
export async function fetchPrices(): Promise<Record<string, number>> {
  return cached("prices", 30_000, async () => {
    try {
      const data = await fetchCoinGeckoViaProxy();
      const prices: Record<string, number> = {};
      let updated = 0;
      for (const [code, cfg] of Object.entries(ASSET_CONFIG)) {
        if (cfg.coingeckoId && data[cfg.coingeckoId]) {
          prices[code] = data[cfg.coingeckoId].usd || 0;
          updated++;
        }
      }
      alog.log(`CoinGecko: updated ${updated} coin prices in USD`, "success");
      return prices;
    } catch (err) {
      alog.log(`Price fetch error: ${err}`, "error");
      return {};
    }
  });
}

/** Fetch 24h changes from CoinGecko (proxied server-side) */
export async function fetchChanges(): Promise<Record<string, number>> {
  return cached("changes", 30_000, async () => {
    try {
      const data = await fetchCoinGeckoViaProxy();
      const changes: Record<string, number> = {};
      for (const [code, cfg] of Object.entries(ASSET_CONFIG)) {
        if (cfg.coingeckoId && data[cfg.coingeckoId]) {
          changes[code] = data[cfg.coingeckoId].usd_24h_change ?? 0;
        }
      }
      return changes;
    } catch (err) {
      console.error("fetchChanges error:", err);
      return {};
    }
  });
}

/** Get USDC and AUD balances from portfolio */
export async function fetchCashBalances(): Promise<{ usdc: number; aud: number }> {
  return cached("cash", 30_000, async () => {
    try {
      const res = await fetchWithRetry("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "/portfolio/" }),
      });
      if (!res.ok) return { usdc: 0, aud: 0 };
      const data = await res.json();
      const assets = data.assets || [];
      let usdc = 0;
      let aud = 0;
      for (const a of assets) {
        // USDC: use balance directly (1 USDC ≈ 1 USD), fallback to aud_value conversion
        if (a.code === "USDC") usdc = Number(a.balance) || (Number(a.aud_value) * AUD_TO_USD) || 0;
        // AUD: use balance directly (value in AUD)
        if (a.code === "AUD") aud = Number(a.balance) || Number(a.aud_value) || 0;
      }
      return { usdc, aud };
    } catch {
      return { usdc: 0, aud: 0 };
    }
  });
}

/** Fetch leaderboard from MongoDB */
export async function fetchLeaderboard(poolValue: number): Promise<LeaderboardEntry[]> {
  return cached("leaderboard", 30_000, async () => {
    try {
      const res = await fetchWithRetry(`/api/leaderboard?poolValue=${poolValue}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.leaderboard || [];
    } catch {
      return [];
    }
  });
}

/** Fetch transactions from MongoDB — throws on failure so callers can show errors */
export async function fetchTransactions(
  wallet: string,
): Promise<TradeTransaction[]> {
  // Bypass cache so we always get fresh data when the user opens Activity
  delete cache[`txns_${wallet}`];

  const res = await fetchWithRetry(`/api/transactions?wallet=${wallet}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `API error ${res.status}`);
  }
  const data = await res.json();
  return data.transactions || [];
}

/** Fetch pool stats from MongoDB (public - visible to all visitors) */
export async function fetchAdminStats(
  poolValue: number,
): Promise<AdminStats | null> {
  return cached("admin_stats", 30_000, async () => {
    try {
      const res = await fetchWithRetry(
        `/api/admin/stats?poolValue=${poolValue}`,
      );
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  });
}

/** Fetch user position from MongoDB */
export async function fetchUserPosition(
  wallet: string,
  poolValue: number,
): Promise<UserPosition | null> {
  return cached(`position_${wallet}`, 30_000, async () => {
    try {
      const res = await fetchWithRetry(
        `/api/user/position?wallet=${wallet}&poolValue=${poolValue}`,
      );
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  });
}

/** Register wallet with backend */
export async function registerWallet(walletAddress: string): Promise<any> {
  try {
    const res = await fetchWithRetry("/api/user/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Swyftx order type constants */
const SWYFTX_ORDER = {
  MARKET_BUY: 1,
  MARKET_SELL: 2,
  LIMIT_BUY: 3,    // triggers when price DROPS to target
  LIMIT_SELL: 4,   // triggers when price RISES to target
  STOP_BUY: 5,     // triggers when price RISES above target
  STOP_SELL: 6,    // triggers when price DROPS below target
} as const;

/** Minimum order sizes in USDC */
const MIN_MARKET_USDC = 7;
const MIN_LIMIT_USDC = 50;

/** Place a trade via Swyftx proxy (admin-wallet-only) */
export async function placeTrade(order: {
  assetCode: string;
  side: "buy" | "sell";
  amount: number;
  orderType: "market" | "limit" | "stop";
  triggerPrice?: number;
  currentPrice?: number;
  swyftxAudRate?: number;
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    // Validate minimum order size
    const minAmount = order.orderType === "market" ? MIN_MARKET_USDC : MIN_LIMIT_USDC;
    if (order.amount < minAmount) {
      return { success: false, error: `Minimum order is $${minAmount} USDC` };
    }

    // Determine the numeric Swyftx order type
    let swyftxOrderType: number;

    if (order.orderType === "market") {
      swyftxOrderType = order.side === "buy"
        ? SWYFTX_ORDER.MARKET_BUY
        : SWYFTX_ORDER.MARKET_SELL;
    } else {
      // Limit/trigger orders — determine direction from trigger vs current price
      const current = order.currentPrice || 0;
      const trigger = order.triggerPrice || 0;

      if (order.side === "buy") {
        // Buy Dip: trigger < current → LIMIT_BUY (waits for price to drop)
        // Buy Rise: trigger > current → STOP_BUY (triggers when price rises)
        swyftxOrderType = trigger < current
          ? SWYFTX_ORDER.LIMIT_BUY
          : SWYFTX_ORDER.STOP_BUY;
      } else {
        // Sell Rise: trigger > current → LIMIT_SELL (waits for price to rise)
        // Sell Dip: trigger < current → STOP_SELL (triggers when price drops)
        swyftxOrderType = trigger > current
          ? SWYFTX_ORDER.LIMIT_SELL
          : SWYFTX_ORDER.STOP_SELL;
      }
    }

    // Build the Swyftx order payload — matches working FLUB format
    // Swyftx is AUD-native: trigger prices are evaluated in AUD internally,
    // even when trading USDC pairs.  We must send the trigger in AUD.
    //
    // IMPORTANT: Use Swyftx's own AUD rate (from /portfolio/) to calculate
    // the AUD trigger.  CoinGecko's AUD↔USD rate can differ from Swyftx's
    // internal rate, which caused triggers to sit below the current Swyftx
    // AUD price and execute immediately.  By scaling the Swyftx AUD rate by
    // the same percentage offset the user chose, the trigger is always the
    // correct % above/below the Swyftx current price.
    let triggerAud = 0;
    if (
      order.swyftxAudRate && order.swyftxAudRate > 0 &&
      order.currentPrice && order.currentPrice > 0 &&
      order.triggerPrice && order.triggerPrice > 0
    ) {
      // Scale Swyftx AUD rate by the same ratio as USDC trigger / current USDC price
      triggerAud = order.swyftxAudRate * (order.triggerPrice / order.currentPrice);
      console.log(
        `[PlaceTrade] AUD trigger via Swyftx rate: audRate=${order.swyftxAudRate.toFixed(4)}, ` +
        `ratio=${(order.triggerPrice / order.currentPrice).toFixed(4)}, triggerAud=${triggerAud.toFixed(4)}`
      );
    } else if (order.triggerPrice && AUD_TO_USD > 0) {
      // Fallback: convert USDC trigger → AUD using CoinGecko-derived rate
      triggerAud = order.triggerPrice / AUD_TO_USD;
      console.log(
        `[PlaceTrade] AUD trigger via CoinGecko fallback: triggerUSD=${order.triggerPrice}, ` +
        `AUD_TO_USD=${AUD_TO_USD.toFixed(4)}, triggerAud=${triggerAud.toFixed(4)}`
      );
    }

    // Safety guard: NEVER send a limit/stop order with an empty trigger —
    // Swyftx would execute it as a market order (instant fill).
    if (order.orderType !== "market" && triggerAud <= 0) {
      alog.log(`Blocked ${order.side} ${order.assetCode}: trigger price resolved to 0 (AUD_TO_USD=${AUD_TO_USD}, swyftxAudRate=${order.swyftxAudRate})`, "error");
      return { success: false, error: "Trigger price could not be calculated — please try again" };
    }

    const swyftxPayload = {
      primary: "USDC",
      secondary: order.assetCode,
      quantity: String(order.amount),
      assetQuantity: "USDC",
      orderType: swyftxOrderType,
      trigger: triggerAud > 0 ? String(triggerAud) : "",
    };

    const res = await fetchWithRetry("/api/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "/orders/",
        method: "POST",
        body: swyftxPayload,
      }),
    });

    let data: any;
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    // Validate: HTTP must be OK AND response must contain an orderId/order confirmation
    // AND must not have error fields in the body (Swyftx can return 200 with errors)
    const msgLower = typeof data.message === "string" ? data.message.toLowerCase() : "";
    const hasError = data.error || msgLower.includes("error") || msgLower.includes("fail");
    const hasOrderId = !!(data.orderId || data.orderUuid || data.order_id);
    const isSuccess = res.ok && !hasError && hasOrderId;

    // Ensure error is always a string (Swyftx can return error objects that crash React)
    const rawErr = data.error || data.message || (!hasOrderId && res.ok ? "No order confirmation received from exchange" : undefined);
    const errStr = typeof rawErr === "string" ? rawErr : JSON.stringify(rawErr || data);

    // Prefer orderUuid (UUID format) — this matches how fetchSwyftxOrderHistory
    // identifies filled orders via swyftxId, ensuring pending↔filled ID matching works.
    const result = {
      success: isSuccess,
      orderId: data.orderUuid || data.order_uuid || data.orderId || data.order_id,
      error: isSuccess ? undefined : errStr,
    };

    if (isSuccess) {
      alog.log(`Trade executed: ${order.side} ${order.assetCode} — order ${result.orderId}`, "success");
    } else {
      alog.log(`Trade failed: ${order.side} ${order.assetCode} — ${result.error}`, "error");
    }

    return result;
  } catch (err: any) {
    alog.log(`Trade error: ${err.message || "Trade failed"}`, "error");
    return { success: false, error: err.message || "Trade failed" };
  }
}

/** Fetch trader state (public - pending orders, auto tiers, trade log) */
export async function fetchTraderState(): Promise<TraderState | null> {
  return cached("trader_state", 30_000, async () => {
    try {
      const res = await fetchWithRetry("/api/state");
      if (!res.ok) return null;
      const data = await res.json();

      // autoActive can be an object { isActive, tierActive, targets, ... } (FLUB format)
      // or a simple boolean. Extract properly.
      const autoActive = data.autoActive;
      const isActiveObj = typeof autoActive === "object" && autoActive !== null;
      const botActive = data.autoBotActive ?? (isActiveObj ? autoActive.isActive : autoActive) ?? false;
      const tierActiveMap: Record<string, boolean> = isActiveObj ? (autoActive.tierActive || {}) : {};

      // Merge tier active state from autoActive.tierActive into tier configs
      const rawTiers = data.autoTierAssets || data.autoTiers || {};
      const tierAssets: Record<string, any> = {};
      for (const [key, cfg] of Object.entries(rawTiers) as [string, any][]) {
        // tierActive uses numeric keys (1,2,3) while tier keys are "tier1","tier2","tier3"
        const tierNum = key.replace("tier", "");
        const activeFromMap = tierActiveMap[tierNum] ?? tierActiveMap[key];
        tierAssets[key] = {
          ...cfg,
          active: cfg.active ?? activeFromMap ?? false,
        };
      }

      // Normalize tier assignments — FLUB uses numeric tier values (1,2,3)
      // while BUDJU expects string keys ("tier1","tier2","tier3")
      const rawAssignments = data.autoTierAssignments || {};
      const assignments: Record<string, string> = {};
      for (const [coin, tier] of Object.entries(rawAssignments)) {
        const tierStr = String(tier);
        assignments[coin] = tierStr.startsWith("tier") ? tierStr : `tier${tierStr}`;
      }

      // Normalize trade log — FLUB uses { time, coin, side, quantity, price, amount }
      // while BUDJU expects { timestamp, coin, side, qty, price }
      const rawLog = data.autoTradeLog || [];
      const tradeLog = rawLog.map((e: any) => ({
        coin: e.coin || "",
        side: (e.side || "").toLowerCase(),
        qty: Number(e.qty ?? e.quantity) || 0,
        price: Number(e.price) || 0,
        timestamp: e.timestamp || e.time || "",
      }));

      const orderCount = (data.enrichedOrders || data.pendingOrders || []).length;
      alog.log(
        `ServerState: loaded (${orderCount} orders, ${tradeLog.length} trades, ${Object.keys(assignments).length} coins assigned)`,
        "info",
      );

      return {
        enrichedOrders: data.pendingOrders || data.enrichedOrders || [],
        autoTierAssets: tierAssets,
        autoTierAssignments: assignments,
        autoBotActive: !!botActive,
        autoCooldowns: data.autoCooldowns || {},
        autoTradeLog: tradeLog,
        currentAutoTier: data.currentAutoTier,
        _rawAutoActive: isActiveObj ? autoActive : undefined,
      };
    } catch (err) {
      alog.log(`ServerState: fetch error — ${err}`, "error");
      return null;
    }
  });
}

/** Save trader state (admin only — partial updates, requires Ed25519 signature) */
export async function saveTraderState(
  adminWallet: string,
  updates: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await getAdminAuth(adminWallet);
    if (!auth) return { success: false, error: "Admin signature required" };

    const res = await fetchWithRetry("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...auth, ...updates }),
    });
    const data = await res.json();
    // Invalidate cached trader state so next fetch gets fresh data
    delete cache["trader_state"];
    return { success: res.ok, error: res.ok ? undefined : (data.error || `Server error (${res.status})`) };
  } catch (err: any) {
    return { success: false, error: err.message || "Save failed" };
  }
}

/** Clear cached data */
export function clearCache() {
  for (const key of Object.keys(cache)) delete cache[key];
}

/** Clear specific cache keys (used by AutoTrader to force fresh fetches) */
export function clearCacheKeys(...keys: string[]) {
  for (const key of keys) delete cache[key];
}

/** Record an admin deposit (Swyftx bank transfer) in MongoDB for share issuance */
export async function recordDeposit(
  adminWallet: string,
  walletAddress: string,
  amountUsd: number,
  totalPoolValue: number,
  currency: string = "USDC",
): Promise<{ success: boolean; shares?: number; nav?: number; error?: string }> {
  try {
    const auth = await getAdminAuth(adminWallet);
    if (!auth) return { success: false, error: "Admin signature required" };

    const txHash = `admin_deposit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const res = await fetchWithRetry("/api/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...auth,
        walletAddress,
        amount: amountUsd,
        txHash,
        totalPoolValue,
        currency,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || "Deposit recording failed" };
    }

    // Invalidate cached stats and transactions so next fetch reflects new data
    delete cache["admin_stats"];
    delete cache[`position_${walletAddress}`];
    delete cache[`txns_${walletAddress}`];

    alog.log(`Deposit recorded: $${amountUsd.toFixed(2)} USD → ${data.shares?.toFixed(2)} shares at NAV $${data.nav?.toFixed(4)}`, "success");
    return { success: true, shares: data.shares, nav: data.nav };
  } catch (err: any) {
    alog.log(`Deposit error: ${err.message}`, "error");
    return { success: false, error: err.message || "Network error" };
  }
}

/** User self-service deposit: record on-chain USDC transfer in MongoDB */
export async function submitUserDeposit(
  walletAddress: string,
  amount: number,
  txHash: string,
  totalPoolValue: number,
): Promise<{ success: boolean; shares?: number; nav?: number; error?: string }> {
  try {
    const res = await fetchWithRetry("/api/user-deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, amount, txHash, totalPoolValue }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || "Deposit recording failed" };
    }

    // Invalidate cached stats and transactions
    delete cache["admin_stats"];
    delete cache[`position_${walletAddress}`];
    delete cache[`txns_${walletAddress}`];

    alog.log(`User deposit: $${amount.toFixed(2)} USDC → ${data.shares?.toFixed(2)} shares`, "success");
    return { success: true, shares: data.shares, nav: data.nav };
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" };
  }
}

// ── Additional API functions (ported from FLUB) ───────────

/** Record a trade to MongoDB (requires Ed25519 signature) */
export async function recordTradeInDB(
  adminWallet: string,
  coin: string,
  tradeType: "buy" | "sell",
  cryptoAmount: number,
  price: number,
): Promise<boolean> {
  try {
    const auth = await getAdminAuth(adminWallet);
    if (!auth) return false;

    const res = await fetch("/api/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...auth,
        coin,
        type: tradeType,
        amount: cryptoAmount,
        price,
      }),
    });
    if (res.ok) {
      // Invalidate transaction cache so Activity page shows new trade
      for (const key of Object.keys(cache)) {
        if (key.startsWith("txns_")) delete cache[key];
      }
    }
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetch Swyftx order history (filled orders) */
export async function fetchSwyftxOrderHistory(
  limit = 100,
): Promise<any[]> {
  try {
    // Fetch orders and asset list in parallel so we can resolve numeric IDs → codes
    // Auth is handled server-side by the proxy
    const [ordersRes, assetsRes] = await Promise.all([
      fetchWithRetry("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: `/orders/?limit=${limit}`,
          method: "GET",
        }),
      }),
      fetchWithRetry("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: "/markets/assets/",
          method: "GET",
        }),
      }),
    ]);

    if (!ordersRes.ok) return [];
    const data = await ordersRes.json();
    const raw = Array.isArray(data) ? data : (data.orders ?? []);

    // Build asset map: numeric Swyftx ID → string code (e.g. "3" → "BTC")
    const assetMap: Record<string, string> = {};
    if (assetsRes.ok) {
      const assetsData = await assetsRes.json();
      if (Array.isArray(assetsData)) {
        for (const a of assetsData) {
          assetMap[String(a.id)] = a.code || "";
        }
      }
    }

    // Only include filled orders (status 4)
    return raw
      .filter((o: any) => parseInt(o.status) === 4)
      .map((o: any) => {
        const ot = parseInt(o.order_type ?? o.orderType ?? 0);
        const isBuy = ot === 1 || ot === 3 || ot === 5;
        const coinCode = assetMap[String(o.secondary_asset)] || String(o.secondary_asset ?? "");
        return {
          swyftxId: o.orderUuid ?? o.id ?? "",
          // Also store numeric orderId (if different from UUID) so filled-order
          // matching works regardless of which ID format the pending order used.
          orderId: o.orderId || o.order_id || "",
          type: isBuy ? "buy" : "sell",
          coin: coinCode,
          quantity: parseFloat(o.quantity ?? 0),
          trigger: parseFloat(o.trigger ?? 0),
          amount: parseFloat(o.amount ?? o.total ?? o.quantity ?? 0),
          timestamp: o.updated_time ?? o.created_time ?? "",
          orderType: ot,
        };
      });
  } catch {
    return [];
  }
}

/** Sync Swyftx order history to MongoDB (deduplicates by swyftxId, requires signature) */
export async function syncSwyftxTradesToDB(
  adminWallet: string,
): Promise<{ imported: number; skipped: number; error?: string } | null> {
  try {
    const auth = await getAdminAuth(adminWallet);
    if (!auth) {
      console.error("[syncSwyftxTradesToDB] Admin auth failed");
      return { imported: 0, skipped: 0, error: "Auth failed" };
    }

    const swyftxOrders = await fetchSwyftxOrderHistory(200);
    if (swyftxOrders.length === 0) {
      console.warn("[syncSwyftxTradesToDB] No Swyftx orders returned");
      return { imported: 0, skipped: 0, error: "No orders from Swyftx" };
    }

    const res = await fetch("/api/trade/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...auth, trades: swyftxOrders }),
    });

    if (res.ok) return await res.json();
    const errText = await res.text().catch(() => "unknown");
    console.error(`[syncSwyftxTradesToDB] API returned ${res.status}: ${errText}`);
    return { imported: 0, skipped: 0, error: `API ${res.status}` };
  } catch (err) {
    console.error("[syncSwyftxTradesToDB] Error:", err);
    return { imported: 0, skipped: 0, error: String(err) };
  }
}

/** Re-enrich DB-stored orders with live prices */
function enrichDbOrders(dbOrders: any[], prices: Record<string, number>): any[] {
  return dbOrders
    .map((o: any) => {
      const asset = typeof o.asset === "object" ? o.asset?.code : o.asset || "";
      const trigger = parseFloat(o.trigger) || parseFloat(o.rate) || parseFloat(o.triggerPrice) || 0;
      const currentPrice = prices[asset] || 0;
      const proximity = currentPrice > 0 && trigger > 0
        ? Math.round(Math.abs(currentPrice - trigger) / currentPrice * 10000) / 100
        : o.proximity ?? 100;
      return { ...o, asset, currentPrice, proximity };
    })
    .filter((o: any) => o.asset && o.asset !== "" && o.asset !== "0")
    .sort((a: any, b: any) => a.proximity - b.proximity);
}

/** Fetch and enrich pending orders — tries Swyftx API first, falls back to MongoDB */
export async function fetchEnrichedPendingOrders(
  prices: Record<string, number>,
): Promise<any[]> {
  // 1. Try Swyftx /orders/open API (broken on demo, but may work on production)
  try {
    const res = await fetchWithRetry("/api/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "/orders/open", method: "GET" }),
    });

    if (res.ok) {
      const data = await res.json();
      if (!data.error) {
        const raw = Array.isArray(data) ? data : (data.orders ?? []);
        if (raw.length > 0) {
          const mapped = raw
            .map((o: any) => {
              const ot = parseInt(o.order_type ?? o.orderType ?? 0);
              const isBuy = ot === 1 || ot === 3 || ot === 5;
              const assetCode = o.asset?.code || o.secondary_asset || "";
              const trigger = parseFloat(o.trigger) || parseFloat(o.rate) || parseFloat(o.triggerPrice) || parseFloat(o.trigger_price) || 0;
              const rawAmount = parseFloat(o.amount) || parseFloat(o.total) || 0;
              const rawQty = parseFloat(o.quantity) || 0;
              const amount = rawAmount || (rawQty > 0 && trigger > 0 ? rawQty * trigger : 0);
              const currentPrice = prices[assetCode] || 0;
              const distance = currentPrice > 0 && trigger > 0
                ? (Math.abs(currentPrice - trigger) / currentPrice) * 100 : 100;
              const typeMap: Record<number, string> = {
                3: "LIMIT BUY", 4: "LIMIT SELL", 5: "STOP BUY", 6: "STOP SELL",
              };
              return {
                orderId: o.orderUuid ?? o.order_uuid ?? o.id ?? "",
                orderType: ot, type: typeMap[ot] || "ORDER", isBuy,
                asset: assetCode, trigger, amount, currentPrice,
                proximity: Math.round(distance * 100) / 100,
                created: o.created_time ?? "",
              };
            })
            .filter((o: any) => o.asset && o.asset !== "" && o.asset !== "0");
          if (mapped.length > 0) return mapped.sort((a: any, b: any) => a.proximity - b.proximity);
        }
      }
    }
  } catch { /* API unavailable — fall through to DB */ }

  // 2. Swyftx API returned nothing — fall back to MongoDB-stored pending orders
  //    Cross-reference with filled history to auto-remove completed orders
  try {
    const [state, filledHistory] = await Promise.all([
      fetchTraderState(),
      fetchSwyftxOrderHistory(50).catch(() => [] as any[]),
    ]);
    const dbOrders = state?.enrichedOrders || [];
    if (dbOrders.length === 0) return [];

    // Filter out orders that have been filled on Swyftx.
    // Include ALL possible IDs from filled orders (numeric orderId + UUID orderUuid)
    // so matching works regardless of which ID format the pending order stored.
    const filledIds = new Set<string>();
    for (const o of filledHistory) {
      if (o.swyftxId) filledIds.add(o.swyftxId);
      if (o.orderId) filledIds.add(o.orderId);
    }
    const isFilled = (o: any): boolean => {
      const ids = [o.orderId, o.orderUuid, o.id, o.swyftxId].filter(Boolean);
      return ids.some((id: string) => filledIds.has(id));
    };
    const active = dbOrders.filter((o: any) => !isFilled(o));

    return enrichDbOrders(active, prices);
  } catch { /* DB also unavailable */ }

  return [];
}

/** Recalibrate pool: reset NAV to $1 and user shares to their deposit totals (requires signature) */
export async function recalibratePool(
  adminWallet: string,
  totalPoolValue: number,
): Promise<{ success: boolean; adminCapital?: number; totalUserDeposits?: number; error?: string }> {
  try {
    const auth = await getAdminAuth(adminWallet);
    if (!auth) return { success: false, error: "Admin signature required" };

    const res = await fetchWithRetry("/api/admin/recalibrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...auth, totalPoolValue }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || `HTTP ${res.status}` };
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" };
  }
}

/** Cross-reference: fetch non-filled orders from order history.
 *  Swyftx /orders/open may lag, but recently placed orders appear
 *  in the full order history with their status. Status 1 = open,
 *  2 = partially filled, 3 = cancelled, 4 = filled. */
export async function fetchPendingFromHistory(
  prices: Record<string, number>,
): Promise<any[]> {
  try {
    const [ordersRes, assetsRes] = await Promise.all([
      fetchWithRetry("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "/orders/?limit=50", method: "GET" }),
      }),
      fetchWithRetry("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "/markets/assets/", method: "GET" }),
      }),
    ]);

    if (!ordersRes.ok) {
      console.warn(`[HistoryXRef] /orders/?limit=50 returned HTTP ${ordersRes.status}`);
      return [];
    }
    const data = await ordersRes.json();
    const raw = Array.isArray(data) ? data : (data.orders ?? []);

    // Log all order statuses and types for diagnostics
    const statusCounts: Record<string, number> = {};
    for (const o of raw) {
      const key = `status=${o.status},type=${o.order_type ?? o.orderType}`;
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    }
    console.log(`[HistoryXRef] ${raw.length} orders, breakdown:`, JSON.stringify(statusCounts));
    // Log first non-filled order for debugging
    const nonFilled = raw.filter((o: any) => parseInt(o.status ?? 0) !== 4);
    if (nonFilled.length > 0) {
      console.log(`[HistoryXRef] ${nonFilled.length} non-filled orders found, first:`, JSON.stringify(nonFilled[0]).slice(0, 300));
    }

    const assetMap: Record<string, string> = {};
    if (assetsRes.ok) {
      const assetsData = await assetsRes.json();
      if (Array.isArray(assetsData)) {
        for (const a of assetsData) assetMap[String(a.id)] = a.code || "";
      }
    }

    // Include open or partially-filled orders with limit/trigger types (3-6)
    return raw
      .filter((o: any) => {
        const status = parseInt(o.status ?? 0);
        const ot = parseInt(o.order_type ?? o.orderType ?? 0);
        // Accept status 0 (new/pending), 1 (open), 2 (partial) — exclude 3 (cancelled) and 4 (filled)
        return status >= 0 && status <= 2 && ot >= 3 && ot <= 6;
      })
      .map((o: any) => {
        const ot = parseInt(o.order_type ?? o.orderType ?? 0);
        const isBuy = ot === 3 || ot === 5;
        const coinCode = assetMap[String(o.secondary_asset)] || String(o.secondary_asset ?? "");
        const trigger = parseFloat(o.trigger) || parseFloat(o.rate) || 0;
        const rawAmount = parseFloat(o.amount) || parseFloat(o.total) || 0;
        const rawQty = parseFloat(o.quantity) || 0;
        const amount = rawAmount || (rawQty > 0 && trigger > 0 ? rawQty * trigger : 0);
        const currentPrice = prices[coinCode] || 0;
        const distance = currentPrice > 0 && trigger > 0
          ? (Math.abs(currentPrice - trigger) / currentPrice) * 100
          : 100;
        const typeMap: Record<number, string> = {
          3: "LIMIT BUY", 4: "LIMIT SELL", 5: "STOP BUY", 6: "STOP SELL",
        };
        return {
          orderId: o.orderUuid ?? o.order_uuid ?? o.id ?? "",
          orderType: ot,
          type: typeMap[ot] || "ORDER",
          isBuy,
          asset: coinCode,
          trigger,
          amount,
          currentPrice,
          proximity: Math.round(distance * 100) / 100,
          created: o.created_time ?? "",
          _fromHistory: true,
        };
      })
      .filter((o: any) => o.asset && o.asset !== "" && o.asset !== "0");
  } catch {
    return [];
  }
}

/** Cancel a pending order on Swyftx */
export async function cancelOrder(
  orderUuid: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Auth handled server-side by the proxy
    const res = await fetchWithRetry("/api/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: `/orders/${orderUuid}/`,
        method: "DELETE",
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || `HTTP ${res.status}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" };
  }
}
