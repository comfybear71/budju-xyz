// ============================================================
// FLUB Trading API Service
// Connects to the existing FLUB Vercel backend
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
  type: string; // 'LIMIT_BUY' | 'LIMIT_SELL' | 'STOP_LIMIT_BUY' | 'STOP_LIMIT_SELL'
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
}

// ── Asset config (matches FLUB CONFIG.ASSETS) ──────────────

export const ASSET_CONFIG: Record<
  string,
  { color: string; icon: string; name: string; coingeckoId: string }
> = {
  BTC: { color: "#f7931a", icon: "BTC", name: "Bitcoin", coingeckoId: "bitcoin" },
  ETH: { color: "#627eea", icon: "ETH", name: "Ethereum", coingeckoId: "ethereum" },
  SOL: { color: "#9945ff", icon: "SOL", name: "Solana", coingeckoId: "solana" },
  XRP: { color: "#23292f", icon: "XRP", name: "Ripple", coingeckoId: "ripple" },
  DOGE: { color: "#c3a634", icon: "DOGE", name: "Dogecoin", coingeckoId: "dogecoin" },
  ADA: { color: "#0033ad", icon: "ADA", name: "Cardano", coingeckoId: "cardano" },
  AVAX: { color: "#e84142", icon: "AVAX", name: "Avalanche", coingeckoId: "avalanche-2" },
  DOT: { color: "#e6007a", icon: "DOT", name: "Polkadot", coingeckoId: "polkadot" },
  LINK: { color: "#2a5ada", icon: "LINK", name: "Chainlink", coingeckoId: "chainlink" },
  MATIC: { color: "#8247e5", icon: "MATIC", name: "Polygon", coingeckoId: "matic-network" },
  SUI: { color: "#4da2ff", icon: "SUI", name: "Sui", coingeckoId: "sui" },
  HBAR: { color: "#00eab7", icon: "HBAR", name: "Hedera", coingeckoId: "hedera-hashgraph" },
  UNI: { color: "#ff007a", icon: "UNI", name: "Uniswap", coingeckoId: "uniswap" },
  NEAR: { color: "#00c08b", icon: "NEAR", name: "NEAR", coingeckoId: "near" },
  RENDER: { color: "#ff4f00", icon: "RENDER", name: "Render", coingeckoId: "render-token" },
  FET: { color: "#1b0930", icon: "FET", name: "Fetch.ai", coingeckoId: "fetch-ai" },
  TAO: { color: "#000000", icon: "TAO", name: "Bittensor", coingeckoId: "bittensor" },
  PEPE: { color: "#00b84d", icon: "PEPE", name: "Pepe", coingeckoId: "pepe" },
};

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

// ── Public API ─────────────────────────────────────────────

/** Fetch portfolio assets from FLUB backend */
export async function fetchPortfolio(): Promise<PortfolioAsset[]> {
  return cached("portfolio", 30_000, async () => {
    const res = await fetchWithRetry(`${API_BASE}/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "/portfolio/" }),
    });
    const data = await res.json();
    const assets: PortfolioAsset[] = (data.assets || data.data || [])
      .map((a: any) => {
        const cfg = ASSET_CONFIG[a.code] || {
          color: "#64748b",
          icon: a.code,
          name: a.name || a.code,
          coingeckoId: "",
        };
        return {
          code: a.code,
          name: cfg.name,
          balance: Number(a.balance) || 0,
          audValue: Number(a.audValue) || 0,
          usdValue: Number(a.usdValue) || Number(a.audValue) * 0.7 || 0,
          change24h: Number(a.change24h) || 0,
          priceUsd: 0,
          color: cfg.color,
          icon: cfg.icon,
        };
      })
      .filter(
        (a: PortfolioAsset) =>
          a.balance > 0 && a.code !== "AUD" && a.code !== "USDC",
      );
    return assets;
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

/** Fetch leaderboard */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  return cached("leaderboard", 60_000, async () => {
    const res = await fetchWithRetry(`${API_BASE}/database?action=get_leaderboard`);
    const data = await res.json();
    return (data.leaderboard || []).map((entry: any, i: number) => ({
      rank: i + 1,
      wallet: entry.wallet || "",
      displayName: entry.displayName || `User ${i + 1}`,
      value: Number(entry.currentValue) || 0,
      pnlPercent: Number(entry.pnlPercent) || 0,
      deposits: Number(entry.totalDeposited) || 0,
    }));
  });
}

/** Fetch transactions */
export async function fetchTransactions(
  wallet?: string,
): Promise<TradeTransaction[]> {
  const url = wallet
    ? `${API_BASE}/database?action=get_all_transactions&wallet=${wallet}`
    : `${API_BASE}/database?action=get_all_transactions`;
  return cached(`txns_${wallet || "all"}`, 30_000, async () => {
    const res = await fetchWithRetry(url);
    const data = await res.json();
    return (data.transactions || []).map((t: any) => ({
      id: t._id || t.id || "",
      type: t.type || "external",
      asset: t.asset || t.coin || "",
      amount: Number(t.amount) || 0,
      price: Number(t.price) || 0,
      total: Number(t.total) || Number(t.amount) * Number(t.price) || 0,
      timestamp: t.timestamp || t.createdAt || "",
      wallet: t.wallet,
    }));
  });
}

/** Fetch admin stats */
export async function fetchAdminStats(): Promise<AdminStats | null> {
  return cached("admin_stats", 60_000, async () => {
    try {
      const res = await fetchWithRetry(`${API_BASE}/database?action=get_admin_stats`);
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

/** Fetch user position */
export async function fetchUserPosition(
  wallet: string,
): Promise<UserPosition | null> {
  return cached(`position_${wallet}`, 30_000, async () => {
    try {
      const res = await fetchWithRetry(
        `${API_BASE}/database?action=get_user_position&wallet=${wallet}`,
      );
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

/** Fetch trader state (admin only) */
export async function fetchTraderState(
  wallet: string,
): Promise<TraderState | null> {
  try {
    const res = await fetchWithRetry(
      `${API_BASE}/state?wallet=${wallet}`,
    );
    const data = await res.json();
    return {
      pendingOrders: data.pendingOrders || [],
      autoTiers: data.autoTiers || [],
      autoCooldowns: data.autoCooldowns || {},
      autoTradeLog: data.autoTradeLog || [],
    };
  } catch {
    return null;
  }
}

/** Clear cached data */
export function clearCache() {
  for (const key of Object.keys(cache)) delete cache[key];
}
