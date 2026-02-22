// ============================================================
// Trading API Service
// Connects to BUDJU's own Vercel backend:
//   /api/proxy   → Swyftx exchange (portfolio, auth, orders)
//   /api/*       → MongoDB (leaderboard, transactions, etc.)
//   CoinGecko    → Real-time USD prices
// ============================================================

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
  USDC: { color: "#22c55e", icon: "$", name: "USD Coin", coingeckoId: "usd-coin" },
  AUD: { color: "#f59e0b", icon: "A$", name: "Australian Dollar", coingeckoId: "" },
};

// ── PIN Management (for placing trades only) ───────────────

let _pin: string | null = null;

export function setPin(pin: string) {
  _pin = pin;
  localStorage.setItem("budju_trade_pin", pin);
}

export function getPin(): string | null {
  if (_pin) return _pin;
  _pin = localStorage.getItem("budju_trade_pin");
  return _pin;
}

export function clearPin() {
  _pin = null;
  localStorage.removeItem("budju_trade_pin");
}

export function hasPin(): boolean {
  return !!getPin();
}

// ── JWT token management ───────────────────────────────────

let _jwtToken: string | null = null;
let _jwtExpiry = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000;

async function ensureToken(): Promise<string> {
  if (_jwtToken && Date.now() < _jwtExpiry) return _jwtToken;

  const res = await fetchWithRetry("/api/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: "/auth/refresh/", method: "POST" }),
  });

  if (!res.ok) throw new Error(`Auth failed: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.accessToken) throw new Error("No access token in response");

  _jwtToken = data.accessToken;
  _jwtExpiry = Date.now() + TOKEN_TTL_MS;
  return _jwtToken;
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

export const AUD_TO_USD = 0.70;

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

      return rawAssets
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
    } catch (err) {
      console.error("fetchPortfolio error:", err);
      return [];
    }
  });
}

/** Fetch raw CoinGecko data via our own proxy (avoids WebView CORS blocks) */
async function fetchCoinGeckoViaProxy(): Promise<Record<string, any>> {
  const ids = Object.values(ASSET_CONFIG)
    .map((a) => a.coingeckoId)
    .filter(Boolean)
    .join(",");
  const res = await fetchWithRetry("/api/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: "/prices/", body: { ids } }),
  });
  if (!res.ok) return {};
  return await res.json();
}

/** Fetch live USD prices from CoinGecko (proxied server-side) */
export async function fetchPrices(): Promise<Record<string, number>> {
  return cached("prices", 30_000, async () => {
    try {
      const data = await fetchCoinGeckoViaProxy();
      const prices: Record<string, number> = {};
      for (const [code, cfg] of Object.entries(ASSET_CONFIG)) {
        if (cfg.coingeckoId && data[cfg.coingeckoId]) {
          prices[code] = data[cfg.coingeckoId].usd || 0;
        }
      }
      return prices;
    } catch (err) {
      console.error("fetchPrices error:", err);
      return {};
    }
  });
}

/** Fetch 24h changes from CoinGecko (proxied server-side) */
export async function fetchChanges(): Promise<Record<string, number>> {
  return cached("changes", 60_000, async () => {
    try {
      const data = await fetchCoinGeckoViaProxy();
      const changes: Record<string, number> = {};
      for (const [code, cfg] of Object.entries(ASSET_CONFIG)) {
        if (cfg.coingeckoId && data[cfg.coingeckoId]) {
          changes[code] = data[cfg.coingeckoId].usd_24h_change || 0;
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

/** Fetch transactions from MongoDB */
export async function fetchTransactions(
  wallet: string,
): Promise<TradeTransaction[]> {
  return cached(`txns_${wallet}`, 30_000, async () => {
    try {
      const res = await fetchWithRetry(`/api/transactions?wallet=${wallet}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.transactions || [];
    } catch {
      return [];
    }
  });
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
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    // Validate minimum order size
    const minAmount = order.orderType === "market" ? MIN_MARKET_USDC : MIN_LIMIT_USDC;
    if (order.amount < minAmount) {
      return { success: false, error: `Minimum order is $${minAmount} USDC` };
    }

    const token = await ensureToken();

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
    const swyftxPayload = {
      primary: "USDC",
      secondary: order.assetCode,
      quantity: String(order.amount),
      assetQuantity: "USDC",
      orderType: swyftxOrderType,
      trigger: order.triggerPrice ? String(order.triggerPrice) : "",
    };

    const res = await fetchWithRetry("/api/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "/orders/",
        method: "POST",
        body: swyftxPayload,
        authToken: token,
      }),
    });

    const data = await res.json();
    return {
      success: res.ok,
      orderId: data.orderId,
      error: res.ok ? undefined : (data.error || data.message || JSON.stringify(data)),
    };
  } catch (err: any) {
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

      return {
        enrichedOrders: data.enrichedOrders || data.pendingOrders || [],
        autoTierAssets: tierAssets,
        autoTierAssignments: assignments,
        autoBotActive: !!botActive,
        autoCooldowns: data.autoCooldowns || {},
        autoTradeLog: tradeLog,
        currentAutoTier: data.currentAutoTier,
        _rawAutoActive: isActiveObj ? autoActive : undefined,
      };
    } catch {
      return null;
    }
  });
}

/** Save trader state (admin only — partial updates) */
export async function saveTraderState(
  adminWallet: string,
  updates: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetchWithRetry("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminWallet, ...updates }),
    });
    const data = await res.json();
    // Invalidate cached trader state so next fetch gets fresh data
    delete cache["trader_state"];
    return { success: res.ok, error: res.ok ? undefined : data.error };
  } catch (err: any) {
    return { success: false, error: err.message || "Save failed" };
  }
}

/** Clear cached data */
export function clearCache() {
  for (const key of Object.keys(cache)) delete cache[key];
}
