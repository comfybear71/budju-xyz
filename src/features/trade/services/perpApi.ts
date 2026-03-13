// ── Perpetual Paper Trading API Service ──────────────────────────────────

import type {
  PerpAccount,
  PerpPosition,
  PerpTrade,
  PerpMetrics,
  PerpMarket,
  PerpEquitySnapshot,
  PerpOrderRequest,
} from "../types/perps";

const API_BASE = "/api/perp";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── GET Endpoints ───────────────────────────────────────────────────────

export async function fetchPerpAccount(wallet: string): Promise<PerpAccount> {
  return fetchJson(`${API_BASE}/account?wallet=${wallet}`);
}

export async function fetchPerpPositions(wallet: string): Promise<{ positions: PerpPosition[]; count: number }> {
  return fetchJson(`${API_BASE}/positions?wallet=${wallet}`);
}

export async function fetchPerpTrades(
  wallet: string,
  limit = 50,
  symbol?: string,
): Promise<{ trades: PerpTrade[]; count: number }> {
  let url = `${API_BASE}/trades?wallet=${wallet}&limit=${limit}`;
  if (symbol) url += `&symbol=${symbol}`;
  return fetchJson(url);
}

export async function fetchPerpEquity(
  wallet: string,
  period = "all",
): Promise<{ equity: PerpEquitySnapshot[]; count: number }> {
  return fetchJson(`${API_BASE}/equity?wallet=${wallet}&period=${period}`);
}

export async function fetchPerpMarkets(): Promise<{ markets: PerpMarket[] }> {
  return fetchJson(`${API_BASE}/markets`);
}

// Public read-only data (no wallet needed) — returns admin paper trading data
export async function fetchPublicPerpData(): Promise<{
  account: PerpAccount;
  positions: PerpPosition[];
  trades: PerpTrade[];
  equity: PerpEquitySnapshot[];
  markets: PerpMarket[];
}> {
  return fetchJson(`${API_BASE}/public`);
}

export async function fetchPerpMetrics(wallet: string): Promise<PerpMetrics> {
  return fetchJson(`${API_BASE}/metrics?wallet=${wallet}`);
}

// ── POST Endpoints (admin wallet check only — paper trading) ─────────────

export async function placePerpOrder(
  order: PerpOrderRequest,
  wallet: string,
): Promise<PerpPosition> {
  return postJson(`${API_BASE}/order`, {
    ...order,
    wallet,
  });
}

export async function closePerpPosition(
  positionId: string,
  exitPrice: number,
  exitReason: string,
  wallet: string,
): Promise<PerpTrade> {
  return postJson(`${API_BASE}/close`, {
    positionId,
    exitPrice,
    exitReason,
    wallet,
  });
}

export async function modifyPerpPosition(
  positionId: string,
  mods: { stopLoss?: number; takeProfit?: number; trailingStopPct?: number },
  wallet: string,
): Promise<PerpPosition> {
  return postJson(`${API_BASE}/modify`, {
    positionId,
    ...mods,
    wallet,
  });
}

export async function resetPerpAccount(
  wallet: string,
): Promise<PerpAccount> {
  return postJson(`${API_BASE}/account/reset`, {
    wallet,
  });
}

// ── Strategy Types ───────────────────────────────────────────────────────

export interface StrategyConfig {
  enabled: boolean;
  leverage: number;
  sl_atr_mult: number;
  tp_atr_mult: number;
  trailing_stop_pct: number;
  max_positions: number;
  markets: string[];
}

export interface StrategySignal {
  strategy: string;
  symbol: string;
  direction: "long" | "short";
  acted: boolean;
  timestamp?: string;
}

export interface StrategyPosition {
  symbol: string;
  direction: "long" | "short";
  pnl: number;
}

export interface StrategyStatus {
  auto_trading_enabled: boolean;
  trading_paused: boolean;
  strategies: Record<string, StrategyConfig>;
  strategy_positions: Record<string, StrategyPosition[]>;
  recent_signals: StrategySignal[];
  candle_counts: Record<string, number>;
  min_candles_required: number;
}

// ── Strategy Endpoints ──────────────────────────────────────────────────

export async function fetchStrategyStatus(wallet: string): Promise<StrategyStatus> {
  return fetchJson(`${API_BASE}/strategy/status?wallet=${wallet}`);
}

export async function toggleAutoTrading(enabled: boolean, wallet: string): Promise<{ success: boolean }> {
  return postJson(`${API_BASE}/strategy/toggle`, { enabled, wallet });
}

export async function updateStrategyConfig(
  updates: Record<string, unknown>,
  wallet: string,
): Promise<{ success: boolean }> {
  return postJson(`${API_BASE}/strategy/config`, { updates, wallet });
}

// ── Trading Mode & Kill Switch ──────────────────────────────────────

export async function setTradingMode(
  wallet: string,
  mode: "paper" | "live",
): Promise<PerpAccount> {
  return postJson(`${API_BASE}/mode`, { wallet, mode });
}

export async function setKillSwitch(
  wallet: string,
  active: boolean,
): Promise<PerpAccount> {
  return postJson(`${API_BASE}/killswitch`, { wallet, active });
}

export interface LiveStatus {
  ready: boolean;
  testnet: boolean;
  account: string;
  balance: number;
  withdrawable: number;
  issues: string[];
  exchange_balance?: {
    account_value: number;
    total_margin_used: number;
    total_ntl_pos: number;
    withdrawable: number;
  };
  exchange_positions?: Array<{
    coin: string;
    size: number;
    entry_price: number;
    unrealized_pnl: number;
    direction: string;
  }>;
  reconciliation?: {
    synced: boolean;
    discrepancies: Array<{ type: string; symbol?: string; message?: string }>;
  };
}

export async function fetchLiveStatus(wallet: string): Promise<LiveStatus> {
  return postJson(`${API_BASE}/live/status`, { wallet });
}
