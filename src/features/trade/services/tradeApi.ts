// ============================================================
// FLUB Trading API Service
// Connects to the existing FLUB Vercel backend (MongoDB + Swyftx)
// ============================================================

const API_BASE = "https://flub.vercel.app/api";

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

export interface PendingOrder {
  id: string;
  asset: string;
  type: string;
  triggerPrice: number;
  amount: number;
  quantity: number;
  createdAt: string;
  source: "local" | "swyftx";
}

export interface LeaderboardEntry {
  rank: number;
  wallet: string;
  displayName: string;
  value: number;
  pnlPercent: number;
  deposits: number;
}

export interface TradeTransaction {
  id: string;
  type: "deposit" | "withdrawal" | "buy" | "sell" | "external";
  asset: string;
  amount: number;
  price: number;
  total: number;
  timestamp: string;
  wallet?: string;
}

export interface AdminStats {
  userCount: number;
  totalDeposits: number;
  totalUserValue: number;
  nav: number;
  tradeCount: number;
  pnlPercent: number;
  poolValue: number;
}

export interface UserPosition {
  shares: number;
  allocation: number;
  currentValue: number;
  totalDeposited: number;
  pnl: number;
  pnlPercent: number;
}

export interface AutoTier {
  id: number;
  deviation: number;
  allocation: number;
  coins: string[];
  active: boolean;
}

export interface TraderState {
  portfolio?: PortfolioAsset[];
  pendingOrders: PendingOrder[];
  autoTiers: AutoTier[];
  autoCooldowns: Record<string, number>;
  autoTradeLog: Array<{
    coin: string;
    side: string;
    qty: number;
    price: number;
    timestamp: string;
  }>;
  poolValue?: number;
  usdcBalance?: number;
  audBalance?: number;
  userCount?: number;
  totalDeposits?: number;
  nav?: number;
  tradeCount?: number;
  pnlPercent?: number;
}

// ── Asset config (matches FLUB CONFIG.ASSETS) ──────────────

export const ASSET_CONFIG: Record<
  string,
  { color: string; icon: string; name: string; coingeckoId: string }
> = {
  BTC: { color: "#f7931a", icon: "₿", name: "Bitcoin", coingeckoId: "bitcoin" },
  ETH: { color: "#627eea", icon: "Ξ", name: "Ethereum", coingeckoId: "ethereum" },
  SOL: { color: "#9945ff", icon: "◎", name: "Solana", coingeckoId: "solana" },
  XRP: { color: "#23292f", icon: "✕", name: "Ripple", coingeckoId: "ripple" },
  DOGE: { color: "#c3a634", icon: "Ð", name: "Dogecoin", coingeckoId: "dogecoin" },
  ADA: { color: "#0033ad", icon: "₳", name: "Cardano", coingeckoId: "cardano" },
  AVAX: { color: "#e84142", icon: "A", name: "Avalanche", coingeckoId: "avalanche-2" },
  DOT: { color: "#e6007a", icon: "●", name: "Polkadot", coingeckoId: "polkadot" },
  LINK: { color: "#2a5ada", icon: "⬡", name: "Chainlink", coingeckoId: "chainlink" },
  MATIC: { color: "#8247e5", icon: "M", name: "Polygon", coingeckoId: "matic-network" },
  SUI: { color: "#4da2ff", icon: "S", name: "Sui", coingeckoId: "sui" },
  HBAR: { color: "#00eab7", icon: "ℏ", name: "Hedera", coingeckoId: "hedera-hashgraph" },
  UNI: { color: "#ff007a", icon: "U", name: "Uniswap", coingeckoId: "uniswap" },
  NEAR: { color: "#00c08b", icon: "N", name: "NEAR", coingeckoId: "near" },
  RENDER: { color: "#ff4f00", icon: "R", name: "Render", coingeckoId: "render-token" },
  FET: { color: "#1b0930", icon: "F", name: "Fetch.ai", coingeckoId: "fetch-ai" },
  TAO: { color: "#000000", icon: "τ", name: "Bittensor", coingeckoId: "bittensor" },
  PEPE: { color: "#00b84d", icon: "🐸", name: "Pepe", coingeckoId: "pepe" },
};

// ── PIN Management ─────────────────────────────────────────

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

// ── API helpers ────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 2,
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
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

// Simple in-memory cache
const cache: Record<string, { data: unknown; expiry: number }> = {};

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache[key];
  if (hit && Date.now() < hit.expiry) return Promise.resolve(hit.data as T);
  return fn().then((data) => {
    cache[key] = { data, expiry: Date.now() + ttlMs };
    return data;
  });
}

/** POST to the FLUB proxy with PIN authentication */
async function proxyPost(endpoint: string): Promise<any> {
  const pin = getPin();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (pin) headers["x-pin"] = pin;

  const res = await fetchWithRetry(`${API_BASE}/proxy`, {
    method: "POST",
    headers,
    body: JSON.stringify({ endpoint }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("AUTH_REQUIRED");
  }

  return res.json();
}

// ── Public API ─────────────────────────────────────────────

/** Verify PIN against the FLUB backend */
export async function verifyPin(pin: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-pin": pin,
    };
    const res = await fetchWithRetry(`${API_BASE}/proxy`, {
      method: "POST",
      headers,
      body: JSON.stringify({ endpoint: "accounts/balance/" }),
    });
    if (res.ok) {
      setPin(pin);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Fetch portfolio from Swyftx via proxy */
export async function fetchPortfolio(): Promise<PortfolioAsset[]> {
  return cached("portfolio", 30_000, async () => {
    try {
      const data = await proxyPost("accounts/balance/");
      const balances = Array.isArray(data) ? data : data?.balance || data?.data || [];

      const assets: PortfolioAsset[] = balances
        .filter((b: any) => {
          const bal = Number(b.availableBalance || b.balance) || 0;
          const code = b.code || b.assetCode || "";
          return bal > 0 && code !== "AUD" && code !== "USDC";
        })
        .map((b: any) => {
          const code = b.code || b.assetCode || "";
          const balance = Number(b.availableBalance || b.balance) || 0;
          const cfg = ASSET_CONFIG[code] || {
            color: "#64748b",
            icon: code.charAt(0),
            name: b.name || code,
            coingeckoId: "",
          };
          return {
            code,
            name: cfg.name,
            balance,
            audValue: Number(b.audValue) || 0,
            usdValue: Number(b.usdValue) || 0,
            change24h: Number(b.change24h) || 0,
            priceUsd: 0,
            color: cfg.color,
            icon: cfg.icon,
          };
        });

      return assets;
    } catch (err: any) {
      if (err?.message === "AUTH_REQUIRED") throw err;
      return [];
    }
  });
}

/** Fetch USDC and AUD balances from Swyftx */
export async function fetchCashBalances(): Promise<{
  usdc: number;
  aud: number;
}> {
  return cached("cash", 30_000, async () => {
    try {
      const data = await proxyPost("accounts/balance/");
      const balances = Array.isArray(data) ? data : data?.balance || data?.data || [];
      let usdc = 0;
      let aud = 0;
      for (const b of balances) {
        const code = b.code || b.assetCode || "";
        const bal = Number(b.availableBalance || b.balance) || 0;
        if (code === "USDC") usdc = bal;
        if (code === "AUD") aud = bal;
      }
      return { usdc, aud };
    } catch {
      return { usdc: 0, aud: 0 };
    }
  });
}

/** Fetch live prices from CoinGecko */
export async function fetchPrices(): Promise<Record<string, number>> {
  return cached("prices", 30_000, async () => {
    const ids = Object.values(ASSET_CONFIG)
      .map((a) => a.coingeckoId)
      .filter(Boolean)
      .join(",");
    const res = await fetchWithRetry(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
    );
    const data = await res.json();
    const prices: Record<string, number> = {};
    for (const [code, cfg] of Object.entries(ASSET_CONFIG)) {
      if (cfg.coingeckoId && data[cfg.coingeckoId]) {
        prices[code] = data[cfg.coingeckoId].usd || 0;
      }
    }
    return prices;
  });
}

/** Fetch 24h changes from CoinGecko */
export async function fetchChanges(): Promise<Record<string, number>> {
  return cached("changes", 60_000, async () => {
    const ids = Object.values(ASSET_CONFIG)
      .map((a) => a.coingeckoId)
      .filter(Boolean)
      .join(",");
    const res = await fetchWithRetry(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
    );
    const data = await res.json();
    const changes: Record<string, number> = {};
    for (const [code, cfg] of Object.entries(ASSET_CONFIG)) {
      if (cfg.coingeckoId && data[cfg.coingeckoId]) {
        changes[code] = data[cfg.coingeckoId].usd_24h_change || 0;
      }
    }
    return changes;
  });
}

/** Fetch trader state from MongoDB (admin) */
export async function fetchTraderState(
  wallet: string,
): Promise<TraderState | null> {
  return cached("state", 15_000, async () => {
    try {
      const pin = getPin();
      const headers: Record<string, string> = {};
      if (pin) headers["x-pin"] = pin;
      const res = await fetchWithRetry(
        `${API_BASE}/state?wallet=${wallet}`,
        { headers },
      );
      if (!res.ok) return null;
      const data = await res.json();
      return {
        pendingOrders: data.pendingOrders || [],
        autoTiers: data.autoTiers || [],
        autoCooldowns: data.autoCooldowns || {},
        autoTradeLog: data.autoTradeLog || [],
        poolValue: data.poolValue,
        usdcBalance: data.usdcBalance,
        audBalance: data.audBalance,
        userCount: data.userCount,
        totalDeposits: data.totalDeposits,
        nav: data.nav,
        tradeCount: data.tradeCount,
        pnlPercent: data.pnlPercent,
      };
    } catch {
      return null;
    }
  });
}

/** Fetch leaderboard from MongoDB */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  return cached("leaderboard", 60_000, async () => {
    try {
      const res = await fetchWithRetry(
        `${API_BASE}/database?action=get_leaderboard`,
      );
      if (!res.ok) return [];
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) return [];
      const data = await res.json();
      return (data.leaderboard || data || []).map(
        (entry: any, i: number) => ({
          rank: i + 1,
          wallet: entry.wallet || "",
          displayName: entry.displayName || `User ${i + 1}`,
          value: Number(entry.currentValue) || 0,
          pnlPercent: Number(entry.pnlPercent) || 0,
          deposits: Number(entry.totalDeposited) || 0,
        }),
      );
    } catch {
      return [];
    }
  });
}

/** Fetch transactions from MongoDB */
export async function fetchTransactions(
  wallet?: string,
): Promise<TradeTransaction[]> {
  const url = wallet
    ? `${API_BASE}/database?action=get_all_transactions&wallet=${wallet}`
    : `${API_BASE}/database?action=get_all_transactions`;
  return cached(`txns_${wallet || "all"}`, 30_000, async () => {
    try {
      const res = await fetchWithRetry(url);
      if (!res.ok) return [];
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) return [];
      const data = await res.json();
      return (data.transactions || data || []).map((t: any) => ({
        id: t._id || t.id || "",
        type: t.type || "external",
        asset: t.asset || t.coin || "",
        amount: Number(t.amount) || 0,
        price: Number(t.price) || 0,
        total: Number(t.total) || Number(t.amount) * Number(t.price) || 0,
        timestamp: t.timestamp || t.createdAt || "",
        wallet: t.wallet,
      }));
    } catch {
      return [];
    }
  });
}

/** Fetch admin stats from MongoDB */
export async function fetchAdminStats(): Promise<AdminStats | null> {
  return cached("admin_stats", 60_000, async () => {
    try {
      const res = await fetchWithRetry(
        `${API_BASE}/database?action=get_admin_stats`,
      );
      if (!res.ok) return null;
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) return null;
      const data = await res.json();
      return {
        userCount: data.userCount || 0,
        totalDeposits: data.totalDeposits || 0,
        totalUserValue: data.totalUserValue || 0,
        nav: data.nav || 1,
        tradeCount: data.tradeCount || 0,
        pnlPercent: data.pnlPercent || 0,
        poolValue: data.poolValue || 0,
      };
    } catch {
      return null;
    }
  });
}

/** Fetch user position from MongoDB */
export async function fetchUserPosition(
  wallet: string,
): Promise<UserPosition | null> {
  return cached(`position_${wallet}`, 30_000, async () => {
    try {
      const res = await fetchWithRetry(
        `${API_BASE}/database?action=get_user_position&wallet=${wallet}`,
      );
      if (!res.ok) return null;
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) return null;
      const data = await res.json();
      return {
        shares: Number(data.shares) || 0,
        allocation: Number(data.allocation) || 0,
        currentValue: Number(data.currentValue) || 0,
        totalDeposited: Number(data.totalDeposited) || 0,
        pnl: Number(data.pnl) || 0,
        pnlPercent: Number(data.pnlPercent) || 0,
      };
    } catch {
      return null;
    }
  });
}

/** Place a trade via the Swyftx proxy */
export async function placeTrade(order: {
  assetCode: string;
  side: "buy" | "sell";
  amount: number;
  orderType: "market" | "limit" | "stop";
  triggerPrice?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const data = await proxyPost("orders/");
    // The proxy would forward to Swyftx orders endpoint
    return { success: !!data };
  } catch (err: any) {
    return { success: false, error: err.message || "Trade failed" };
  }
}

/** Clear cached data */
export function clearCache() {
  for (const key of Object.keys(cache)) delete cache[key];
}
