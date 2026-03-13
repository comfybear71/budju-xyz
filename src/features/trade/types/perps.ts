// ── Perpetual Trading Types (Paper + Live) ──────────────────────────────

export type TradingMode = "paper" | "live";

export interface PerpAccount {
  wallet: string;
  balance: number;
  equity: number;
  unrealized_pnl: number;
  realized_pnl: number;
  total_funding_paid: number;
  total_fees_paid: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  max_drawdown: number;
  peak_equity: number;
  daily_pnl: number;
  trading_paused: boolean;
  trading_mode: TradingMode;
  kill_switch: boolean;
  live_max_exposure?: number;
  live_max_position?: number;
  created_at: string;
  updated_at: string;
  metrics: PerpMetrics;
}

export type PositionType = "core" | "satellite";

export interface PerpPosition {
  _id: string;
  account_id: string;
  symbol: string;
  direction: "long" | "short";
  leverage: number;
  size_usd: number;
  quantity: number;
  entry_price: number;
  mark_price: number;
  liquidation_price: number;
  margin: number;
  maintenance_margin: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  stop_loss: number | null;
  take_profit: number | null;
  trailing_stop_distance: number | null;
  trailing_stop_price: number | null;
  cumulative_funding: number;
  total_fees: number;
  max_favorable_excursion: number;
  max_adverse_excursion: number;
  entry_reason: string;
  trading_mode: TradingMode;
  exchange_oid?: string | number;
  status: "open" | "closed";
  opened_at: string;
  last_updated: string;
  // Pyramiding
  parent_position_id?: string;
  pyramid_level?: number;
  // Core/Satellite
  position_type?: PositionType;
}

export interface PerpTrade {
  position_id: string;
  account_id: string;
  symbol: string;
  direction: "long" | "short";
  leverage: number;
  entry_price: number;
  exit_price: number;
  quantity: number;
  size_usd: number;
  entry_time: string;
  exit_time: string;
  holding_period_ms: number;
  exit_type: "stop_loss" | "take_profit" | "manual" | "liquidation" | "trailing_stop" | "kill_switch";
  realized_pnl: number;
  realized_pnl_pct: number;
  total_funding_paid: number;
  total_fees: number;
  slippage_cost: number;
  max_favorable_excursion: number;
  max_adverse_excursion: number;
  entry_reason: string;
  exit_reason: string;
}

export interface PerpMetrics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  profit_factor: number;
  avg_rr_ratio: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;
  expectancy: number;
  kelly_criterion: number;
  avg_holding_period: string;
  total_pnl: number;
  total_fees: number;
  total_funding: number;
  best_trade: number;
  worst_trade: number;
  avg_win: number;
  avg_loss: number;
  consecutive_wins: number;
  consecutive_losses: number;
}

export interface PerpMarket {
  symbol: string;
  base_asset: string;
  max_leverage: number;
  tick_size: number;
  coingecko_id: string;
}

export interface PerpEquitySnapshot {
  account_id: string;
  timestamp: string;
  balance: number;
  equity: number;
  unrealized_pnl: number;
  realized_pnl_cumulative: number;
  open_position_count: number;
  drawdown_from_peak: number;
}

export interface PerpOrderRequest {
  symbol: string;
  direction: "long" | "short";
  leverage: number;
  sizeUsd: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  trailingStopPct?: number;
  entryReason?: string;
}

// ── Pending Orders ──────────────────────────────────────────────────────

export interface PerpPendingOrder {
  _id: string;
  account_id: string;
  symbol: string;
  direction: "long" | "short";
  leverage: number;
  size_usd: number;
  order_type: "limit" | "stop";
  trigger_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  trailing_stop_pct: number | null;
  entry_reason: string;
  status: "pending" | "filled" | "cancelled" | "expired" | "failed";
  expires_at: string;
  created_at: string;
  filled_at?: string;
  filled_price?: number;
}

// ── Re-entry Candidate ─────────────────────────────────────────────────

export interface ReentryCandidate {
  symbol: string;
  direction: "long" | "short";
  original_entry: number;
  exit_price: number;
  current_price: number;
  pullback_pct: number;
  original_pnl: number;
  original_strategy: string;
  exit_time: string;
  suggested_size_usd: number;
  leverage: number;
}

// ── Funding Summary ────────────────────────────────────────────────────

export interface FundingSummary {
  total_funding_paid: number;
  borrow_rate_per_hour: number;
  positions: {
    position_id: string;
    symbol: string;
    direction: "long" | "short";
    size_usd: number;
    cumulative_funding: number;
    hours_open: number;
    hourly_cost: number;
    daily_cost: number;
    funding_pct_of_pnl: number;
  }[];
}

// ── Position Summary (Core/Satellite) ──────────────────────────────────

export interface PositionSummary {
  core: {
    count: number;
    total_size_usd: number;
    unrealized_pnl: number;
    positions: PerpPosition[];
  };
  satellite: {
    count: number;
    total_size_usd: number;
    unrealized_pnl: number;
    positions: PerpPosition[];
  };
}
