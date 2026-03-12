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

// ── Strategy Endpoints ──────────────────────────────────────────────────

export interface StrategyStatus {
  auto_trading_enabled: boolean;
  strategies: Record<string, StrategyConfig>;
  global_settings: {
    max_total_positions: number;
    max_equity_risk_pct: number;
    cooldown_minutes: number;
    min_candles: number;
  };
  candle_counts: Record<string, number>;
  min_candles_required: number;
  recent_signals: StrategySignal[];
  strategy_positions: Record<string, { symbol: string; direction: string; pnl: number }[]>;
  trading_paused: boolean;
}

export interface StrategyConfig {
  enabled: boolean;
  leverage: number;
  max_positions: number;
  markets: string[];
  sl_atr_mult: number;
  tp_atr_mult: number;
  trailing_stop_pct: number;
  [key: string]: unknown;
}

export interface StrategySignal {
  strategy: string;
  symbol: string;
  direction: string;
  signal_type: string;
  indicators: Record<string, number>;
  acted: boolean;
  reason: string;
  timestamp: string;
}

export async function fetchStrategyStatus(wallet: string): Promise<StrategyStatus> {
  return fetchJson(`${API_BASE}/strategy/status?wallet=${wallet}`);
}

export async function fetchStrategySignals(
  wallet: string,
  limit = 50,
): Promise<{ signals: StrategySignal[]; count: number }> {
  return fetchJson(`${API_BASE}/strategy/signals?wallet=${wallet}&limit=${limit}`);
}

export async function toggleAutoTrading(
  enabled: boolean,
  adminWallet: string,
  adminSignature: number[],
  adminMessage: string,
): Promise<unknown> {
  return postJson(`${API_BASE}/strategy/toggle`, {
    enabled,
    adminWallet,
    adminSignature,
    adminMessage,
  });
}

export async function updateStrategyConfig(
  updates: Record<string, unknown>,
  adminWallet: string,
  adminSignature: number[],
  adminMessage: string,
): Promise<unknown> {
  return postJson(`${API_BASE}/strategy/config`, {
    updates,
    adminWallet,
    adminSignature,
    adminMessage,
  });
}
