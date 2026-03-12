// ── Perpetual Paper Trading Types ────────────────────────────────────────

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
  created_at: string;
  updated_at: string;
  metrics: PerpMetrics;
}

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
  status: "open" | "closed";
  opened_at: string;
  last_updated: string;
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
  exit_type: "stop_loss" | "take_profit" | "manual" | "liquidation" | "trailing_stop";
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
