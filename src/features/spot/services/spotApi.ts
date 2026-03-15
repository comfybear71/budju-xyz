/**
 * Spot Trading API — communicates with the VPS trading bot.
 *
 * In dev, the VPS runs on localhost:8420.
 * In production, set VITE_VPS_API_URL to your VPS address.
 */

const VPS_API_URL =
  import.meta.env.VITE_VPS_API_URL || "http://localhost:8420";

const VPS_API_SECRET = import.meta.env.VITE_VPS_API_SECRET || "";

function headers(): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  if (VPS_API_SECRET) {
    h["Authorization"] = `Bearer ${VPS_API_SECRET}`;
  }
  return h;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${VPS_API_URL}${path}`, { headers: headers() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${VPS_API_URL}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `API error ${res.status}`);
  }
  return data as T;
}

// ── Types ────────────────────────────────────────────────

export interface SpotAsset {
  symbol: string;
  mint: string;
  decimals: number;
  price: number | null;
  change_pct: number;
}

export interface SpotHolding {
  amount: number;
  avg_entry: number;
  current_price: number;
  value: number;
  pnl: number;
  pnl_pct: number;
}

export interface SpotPortfolio {
  holdings: Record<string, SpotHolding>;
  total_value: number;
  daily_pnl: number;
  daily_trades: number;
  wallet: string | null;
}

export interface SpotTrade {
  symbol: string;
  side: "buy" | "sell";
  amount: number;
  price: number;
  usd_value: number;
  pnl?: number;
  tx: string;
  timestamp: string;
}

export interface SpotStatus {
  trading_enabled: boolean;
  dry_run: boolean;
  wallet: string | null;
  portfolio: SpotPortfolio;
  prices_count: number;
  last_price_update: number;
  recent_trades: SpotTrade[];
}

export interface PriceData {
  price: number;
  change_pct: number;
  mint: string;
}

// ── API calls ────────────────────────────────────────────

export async function fetchHealth() {
  return get<{ status: string; dry_run: boolean; trading_enabled: boolean; wallet: string | null }>("/api/health");
}

export async function fetchSpotPrices() {
  return get<{ prices: Record<string, PriceData>; last_update: number }>("/api/prices");
}

export async function fetchSpotAssets() {
  return get<{ assets: SpotAsset[] }>("/api/assets");
}

export async function fetchSpotPortfolio() {
  return get<SpotPortfolio>("/api/portfolio");
}

export async function fetchSpotTrades(limit = 50) {
  return get<{ trades: SpotTrade[] }>(`/api/trades?limit=${limit}`);
}

export async function fetchSpotStatus() {
  return get<SpotStatus>("/api/status");
}

export async function executeBuy(symbol: string, amount: number) {
  return post<{ success: boolean; trade?: SpotTrade; error?: string }>("/api/buy", { symbol, amount });
}

export async function executeSell(symbol: string, pct: number = 100) {
  return post<{ success: boolean; trade?: SpotTrade; error?: string }>("/api/sell", { symbol, pct });
}
