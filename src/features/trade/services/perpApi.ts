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

// ── POST Endpoints (admin-signed) ───────────────────────────────────────

export async function placePerpOrder(
  order: PerpOrderRequest,
  adminWallet: string,
  adminSignature: number[],
  adminMessage: string,
): Promise<PerpPosition> {
  return postJson(`${API_BASE}/order`, {
    ...order,
    adminWallet,
    adminSignature,
    adminMessage,
  });
}

export async function closePerpPosition(
  positionId: string,
  exitPrice: number,
  exitReason: string,
  adminWallet: string,
  adminSignature: number[],
  adminMessage: string,
): Promise<PerpTrade> {
  return postJson(`${API_BASE}/close`, {
    positionId,
    exitPrice,
    exitReason,
    adminWallet,
    adminSignature,
    adminMessage,
  });
}

export async function modifyPerpPosition(
  positionId: string,
  mods: { stopLoss?: number; takeProfit?: number; trailingStopPct?: number },
  adminWallet: string,
  adminSignature: number[],
  adminMessage: string,
): Promise<PerpPosition> {
  return postJson(`${API_BASE}/modify`, {
    positionId,
    ...mods,
    adminWallet,
    adminSignature,
    adminMessage,
  });
}

export async function resetPerpAccount(
  adminWallet: string,
  adminSignature: number[],
  adminMessage: string,
): Promise<PerpAccount> {
  return postJson(`${API_BASE}/account/reset`, {
    adminWallet,
    adminSignature,
    adminMessage,
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
