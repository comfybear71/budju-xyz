# High Risk Perpetual Paper Trading — Implementation Plan

## Overview

Build a professional-grade **paper trading system** for Solana perpetual futures into the existing BUDJU trading platform's **High Risk** tab. Uses **Drift Protocol** as the price/data source with a fully simulated position engine in MongoDB.

**Starting balance:** $10,000 USDC per strategy
**Leverage range:** 2x–50x
**Goal:** Collect 200+ trades across market conditions before considering live execution

---

## Phase 1: Backend — Database & Core Engine

### 1A. New MongoDB Collections (in `api/database.py`)

Add 6 new collections with indexes:

```python
# New collections for perps paper trading
perp_accounts   = db["perp_accounts"]     # Paper trading accounts
perp_positions  = db["perp_positions"]     # Open positions
perp_orders     = db["perp_orders"]        # Order history
perp_trades     = db["perp_trades"]        # Closed trade records
perp_equity     = db["perp_equity"]        # Equity snapshots (time-series)
perp_funding    = db["perp_funding"]       # Funding rate events
```

**Schemas:**

`perp_accounts`:
```
{ wallet, strategy_id, initial_balance: 10000,
  balance, equity, unrealized_pnl, realized_pnl,
  total_funding_paid, total_fees_paid,
  total_trades, winning_trades, losing_trades,
  max_drawdown, peak_equity,
  sharpe_ratio, sortino_ratio, profit_factor,
  created_at, updated_at }
```

`perp_positions`:
```
{ account_id, symbol, direction (long/short),
  leverage, size_usd, quantity,
  entry_price, mark_price, liquidation_price,
  margin, maintenance_margin,
  unrealized_pnl, unrealized_pnl_pct,
  stop_loss, take_profit, trailing_stop_distance, trailing_stop_price,
  cumulative_funding, total_fees,
  max_favorable_excursion, max_adverse_excursion,
  opened_at, last_updated }
```

`perp_orders`:
```
{ account_id, symbol, side (buy/sell),
  order_type (market/limit/stop/stop_limit/trailing_stop),
  direction (long/short), leverage,
  quantity, price, trigger_price,
  size_usd, slippage_bps,
  status (pending/filled/cancelled/liquidated),
  filled_price, filled_at, fees,
  stop_loss, take_profit, trailing_stop,
  created_at }
```

`perp_trades` (closed position records):
```
{ account_id, position_id, symbol,
  direction, leverage,
  entry_price, exit_price, quantity, size_usd,
  entry_time, exit_time, holding_period_ms,
  exit_type (stop_loss/take_profit/manual/liquidation/trailing_stop),
  realized_pnl, realized_pnl_pct,
  total_funding_paid, total_fees, slippage_cost,
  max_favorable_excursion, max_adverse_excursion,
  planned_risk, actual_rr_ratio,
  market_condition, entry_reason, exit_reason, tags }
```

`perp_equity` (snapshots every cron run):
```
{ account_id, timestamp, balance, equity,
  unrealized_pnl, realized_pnl_cumulative,
  open_position_count, drawdown_from_peak }
```

`perp_funding`:
```
{ position_id, account_id, symbol, timestamp,
  funding_rate, payment_amount, direction (paid/received) }
```

### 1B. Core Engine Functions (new file: `api/perp_engine.py`)

Pure Python module with no HTTP — just business logic:

```python
# Position management
open_position(account_id, symbol, direction, leverage, size_usd, entry_price,
              stop_loss=None, take_profit=None, trailing_stop=None)
close_position(position_id, exit_price, exit_type="manual")
modify_position(position_id, stop_loss=None, take_profit=None, trailing_stop=None)

# Price simulation
calculate_liquidation_price(entry_price, leverage, direction, maintenance_margin_pct=0.05)
calculate_unrealized_pnl(entry_price, mark_price, size_usd, direction, leverage)
simulate_slippage(size_usd, direction)  # 0.05-0.15% based on size
calculate_fees(size_usd)  # 0.06% open + 0.06% close (mirrors Jupiter)

# Funding rate
apply_funding_rate(position, funding_rate)  # hourly, mirrors Drift model

# Risk checks
check_liquidation(position, mark_price) -> bool
check_stop_loss(position, mark_price) -> bool
check_take_profit(position, mark_price) -> bool
check_trailing_stop(position, mark_price) -> (bool, new_trailing_price)

# Metrics calculation
calculate_account_metrics(account_id) -> {
    sharpe_ratio, sortino_ratio, max_drawdown, win_rate,
    profit_factor, avg_rr_ratio, expectancy, kelly_criterion
}

# Equity tracking
snapshot_equity(account_id)
get_equity_curve(account_id, period="all") -> list
```

**Fee Model (mirrors Jupiter Perps):**
- Open/close: 0.06% of position size
- Borrow fee: hourly, based on utilization (simplified: 0.01%/hr base)
- Slippage simulation: 0.05% for <$1K, 0.1% for $1K-$10K, 0.15% for >$10K
- No funding rate (Jupiter uses borrow fees) — but track it for Drift comparison

**Liquidation Formula:**
```
Long:  liq_price = entry_price * (1 - 1/leverage + maintenance_margin)
Short: liq_price = entry_price * (1 + 1/leverage - maintenance_margin)
Maintenance margin: 5% (mirrors Jupiter's level)
```

**Metrics Formulas:**
```
Sharpe   = mean(daily_returns) / std(daily_returns) * sqrt(365)
Sortino  = mean(daily_returns) / downside_std(daily_returns) * sqrt(365)
Max DD   = max(peak - trough) / peak across equity curve
Win Rate = winning_trades / total_trades
PF       = sum(wins) / sum(losses)
Avg R:R  = avg(win_size) / avg(loss_size)
Expect   = (win_rate * avg_win) - (loss_rate * avg_loss)
Kelly    = win_rate - (loss_rate / avg_rr_ratio)
```

---

## Phase 2: Backend — API Endpoints & Cron

### 2A. New API Endpoints (add to `api/index.py`)

**Public GET:**
- `GET /api/perp/account?wallet=` — Paper trading account state + metrics
- `GET /api/perp/positions?wallet=` — Open positions with live P&L
- `GET /api/perp/trades?wallet=` — Closed trade history
- `GET /api/perp/equity?wallet=&period=` — Equity curve data
- `GET /api/perp/markets` — Available markets with current prices/funding
- `GET /api/perp/leaderboard` — Strategy performance rankings

**Admin POST (require signature):**
- `POST /api/perp/order` — Place paper trade order
- `POST /api/perp/close` — Close position
- `POST /api/perp/modify` — Modify SL/TP/trailing stop
- `POST /api/perp/account/reset` — Reset paper account to $10K
- `POST /api/perp/strategy` — Create/update strategy config

### 2B. New Cron Job: `api/perp-cron.py` (every 1 minute)

```
Flow:
1. Fetch live prices from CoinGecko (SOL, BTC, ETH + alts)
2. For each open position across all accounts:
   a. Update mark_price, unrealized_pnl, MFE/MAE
   b. Check liquidation → force close if triggered
   c. Check stop_loss → close if triggered
   d. Check take_profit → close if triggered
   e. Check trailing_stop → update or close
   f. Apply hourly borrow fees (if hour boundary crossed)
3. Snapshot equity for all active accounts
4. Run strategy engine (Phase 3) for auto-entry signals
5. Send Telegram alerts for liquidations/SL/TP hits
```

**Circuit Breakers:**
- Max 5 open positions per account
- Max position size: 50% of account equity
- Max leverage per market (configurable)
- Daily loss limit: 20% of starting equity → pause trading

### 2C. Vercel Config Updates

Add to `vercel.json`:
```json
{ "source": "/api/perp/:path*", "destination": "/api/index.py" },
{ "source": "/api/perp-cron", "destination": "/api/perp-cron.py" }
```

Add cron:
```json
{ "path": "/api/perp-cron", "schedule": "* * * * *" }
```

---

## Phase 3: Backend — Strategy Engine

### 3A. Strategy Framework (in `api/perp_engine.py`)

Each strategy is a function that receives market data and returns signals:

```python
class Signal:
    direction: str  # "long" or "short"
    symbol: str
    leverage: int
    size_pct: float  # % of account equity
    stop_loss_pct: float
    take_profit_pct: float
    trailing_stop_pct: float  # optional
    reason: str

def strategy_trend_following(prices, indicators) -> list[Signal]:
    """EMA crossover + RSI confirmation. 5x-10x leverage."""

def strategy_mean_reversion(prices, indicators) -> list[Signal]:
    """Bollinger band bounce. 3x-5x leverage. Tight stops."""

def strategy_momentum(prices, indicators) -> list[Signal]:
    """Breakout with volume confirmation. 10x-20x leverage."""

def strategy_funding_arb(prices, funding_rates) -> list[Signal]:
    """Collect positive funding on low-vol pairs. 2x leverage."""
```

**Technical Indicators (calculated from CoinGecko OHLCV):**
- EMA 9, 21, 50, 200
- RSI 14
- Bollinger Bands (20, 2σ)
- ATR 14 (for dynamic SL/TP)
- Volume profile
- MACD (12, 26, 9)

### 3B. Position Sizing (Kelly Criterion)

```python
def kelly_position_size(account, strategy_metrics):
    """Half-Kelly position sizing based on historical win rate and R:R."""
    if strategy_metrics.total_trades < 30:
        return 0.02  # Fixed 2% until enough data
    kelly = win_rate - (loss_rate / avg_rr)
    half_kelly = kelly / 2
    return max(0.01, min(half_kelly, 0.05))  # 1%-5% range
```

---

## Phase 4: Frontend — High Risk View

### 4A. New Components (in `src/features/trade/components/perps/`)

```
src/features/trade/components/perps/
├── HighRiskDashboard.tsx     # Main container (replaces placeholder)
├── PerpAccountSummary.tsx    # Balance, equity, P&L, metrics overview
├── PerpPositionsList.tsx     # Open positions with live updates
├── PerpOrderForm.tsx         # Place new paper trades
├── PerpTradeHistory.tsx      # Closed trades table with sort/filter
├── PerpEquityChart.tsx       # Equity curve over time
├── PerpMetricsPanel.tsx      # Sharpe, Sortino, drawdown, win rate etc.
├── PerpMarketSelector.tsx    # Market selection with prices
├── PerpPositionDetail.tsx    # Individual position detail/modify modal
└── PerpStrategyConfig.tsx    # Strategy parameters and toggles
```

### 4B. HighRiskDashboard Layout

```
┌──────────────────────────────────────────────────┐
│  🔥 HIGH RISK — PAPER TRADING                   │
│  Balance: $10,000  Equity: $10,243  P&L: +2.43% │
│  [Account Summary Bar]                           │
├────────────────────────┬─────────────────────────┤
│  📊 Open Positions     │  📈 Equity Curve        │
│  ┌──────────────────┐  │  [Interactive chart]    │
│  │ SOL-PERP 5x LONG │  │                         │
│  │ Entry: $142.50   │  │  Timeframe: 1D/1W/1M   │
│  │ P&L: +$52.30     │  │                         │
│  │ SL: $135 TP: $160│  │                         │
│  │ [Modify] [Close] │  │                         │
│  └──────────────────┘  │                         │
├────────────────────────┴─────────────────────────┤
│  New Order                                        │
│  Market: [SOL ▾] Direction: [Long] [Short]       │
│  Size: [$___] Leverage: [5x ▾]                   │
│  Stop Loss: [___] Take Profit: [___]             │
│  Trailing Stop: [___]                             │
│  [Place Paper Trade]                              │
├──────────────────────────────────────────────────┤
│  📊 Performance Metrics                          │
│  Win Rate: 62%  Sharpe: 1.8  Max DD: -8.2%      │
│  Profit Factor: 2.1  Avg R:R: 1.5:1             │
│  Expectancy: $32/trade  Kelly: 3.2%             │
├──────────────────────────────────────────────────┤
│  📋 Trade History                                │
│  [Table: symbol, dir, entry, exit, P&L, type]   │
│  [Sortable, filterable by date/symbol/strategy]  │
├──────────────────────────────────────────────────┤
│  ⚙️ Strategy Config                             │
│  [Toggle strategies on/off, set parameters]      │
│  [Reset Account] [Export Data CSV]               │
└──────────────────────────────────────────────────┘
```

### 4C. New Service File: `src/features/trade/services/perpApi.ts`

```typescript
// API calls to /api/perp/* endpoints
fetchPerpAccount(wallet: string)
fetchPerpPositions(wallet: string)
fetchPerpTrades(wallet: string, filters?)
fetchPerpEquity(wallet: string, period: string)
fetchPerpMarkets()
placePerpOrder(order: PerpOrder)
closePerpPosition(positionId: string)
modifyPerpPosition(positionId: string, mods: PositionMods)
resetPerpAccount(wallet: string)
```

### 4D. Types: `src/features/trade/types/perps.ts`

All TypeScript interfaces for PerpAccount, PerpPosition, PerpOrder, PerpTrade, PerpMetrics, PerpMarket, etc.

---

## Phase 5: Integration & Polish

### 5A. Wire Into Trade.tsx
- Replace the High Risk placeholder (lines 761-783) with `<HighRiskDashboard />`
- Auto-create paper account on first visit
- Live position updates via polling (30s interval, matching existing pattern)

### 5B. Telegram Notifications
- Add perp trade alerts to existing bot
- Liquidation warnings
- Daily P&L summary in telegram-cron

### 5C. Activity Log Integration
- Perp trades appear in the existing ActivityLog component
- Distinguish "PAPER" trades visually

---

## File Changes Summary

**New files (8):**
1. `api/perp_engine.py` — Core paper trading engine (~400 lines)
2. `api/perp-cron.py` — Position monitor cron (~250 lines)
3. `src/features/trade/components/perps/HighRiskDashboard.tsx`
4. `src/features/trade/components/perps/PerpAccountSummary.tsx`
5. `src/features/trade/components/perps/PerpPositionsList.tsx`
6. `src/features/trade/components/perps/PerpOrderForm.tsx`
7. `src/features/trade/components/perps/PerpTradeHistory.tsx`
8. `src/features/trade/components/perps/PerpEquityChart.tsx`
9. `src/features/trade/components/perps/PerpMetricsPanel.tsx`
10. `src/features/trade/components/perps/PerpMarketSelector.tsx`
11. `src/features/trade/components/perps/PerpPositionDetail.tsx`
12. `src/features/trade/components/perps/PerpStrategyConfig.tsx`
13. `src/features/trade/services/perpApi.ts`
14. `src/features/trade/types/perps.ts`

**Modified files (4):**
1. `api/database.py` — Add 6 new collections + indexes
2. `api/index.py` — Add /api/perp/* route handlers
3. `vercel.json` — Add perp routes + cron
4. `src/features/trade/Trade.tsx` — Replace placeholder with dashboard

---

## Implementation Order

1. **Phase 1A** — Database collections & indexes
2. **Phase 1B** — Core engine (perp_engine.py)
3. **Phase 2A** — API endpoints
4. **Phase 2B** — Cron job
5. **Phase 4D** — TypeScript types
6. **Phase 4C** — Frontend API service
7. **Phase 4A/B** — UI components (one at a time)
8. **Phase 5A** — Integration into Trade.tsx
9. **Phase 3** — Strategy engine (can run in parallel with UI work)
10. **Phase 5B/C** — Telegram + activity log integration

Estimated: 14 new files, 4 modified files, ~3,000 lines of new code.
