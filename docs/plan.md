# Trade Dashboard Redesign — Implementation Plan

## The Problem
The `/trade` page is a 1000+ line monolith with 15+ boolean `show*` state variables toggling panels on/off. Everything is hidden behind tabs. A trader can't see chart + positions + signals at the same time. It's not mobile-friendly and requires opening the website every time.

## The Solution
**Two interfaces for trading:**
1. **Mobile-first web dashboard** — single screen, everything visible, designed for phones first
2. **Telegram trading commands** — trade, check status, kill bot from Telegram without opening any website

---

## Part A: Mobile-First Web Dashboard

### Mobile Layout (primary — phones)

```
+------------------------------------------+
| [KILL] [PAPER/LIVE]  SOL $87.91  WS LIVE | ← sticky top bar
+------------------------------------------+
|                                          |
|    TradingChart (60vh, full width)       |
|    (swipe left/right to change market)   |
|                                          |
+------------------------------------------+
| SOL  JUP  BONK  WIF  RAY  PYTH ...      | ← horizontal scroll market pills
+------------------------------------------+
| Strategy Signals                    ↻    |
| ┌──────────────────────────────────────┐ |
| │ 🔥 SOL LONG — Trend Following       │ |
| │ EMA cross + RSI aligned, 73% hot     │ |
| │ Entry $87.50  SL $85.70  TP $93.20   │ |
| │              [TRADE]                  │ |
| ├──────────────────────────────────────┤ |
| │ 🟡 BTC SHORT — BB Squeeze           │ |
| │ Squeeze releasing bearish, 61% hot   │ |
| │ Entry $70,100  SL $71,500  TP $67,800│ |
| │              [TRADE]                  │ |
| └──────────────────────────────────────┘ |
+------------------------------------------+
| Positions (2)                       [-]  |
| SOL LONG  +$12.40 (+2.1%)    [Close]    |
| BTC SHORT -$3.20  (-0.4%)    [Close]    |
+------------------------------------------+

[TRADE] button → bottom sheet with:
  Size ($) input → [Execute Long/Short]
```

### Desktop Layout (>= 1280px)

```
+---------------------------------------------------------------+
| [KILL] [PAPER/LIVE] [BOT ON/OFF]  Equity $10,240  P&L +$240  |
+----------+-----------------------------------+----------------+
| Markets  |     TradingChart (main)           | Signal Feed    |
| SOL $87  |     (candle chart, big)           | (scrolling     |
| BTC $70k |                                   |  cards)        |
| ETH $3.8k|                                   |                |
| ...      |                                   | QuickTrade     |
+----------+-----------------------------------+----------------+
| Positions: SOL LONG +$12.40 | BTC SHORT -$3.20 | ...          |
+---------------------------------------------------------------+
```

### New Files

```
src/features/trade/
  TradeDashboard.tsx                    # Main page (~300 lines)
  hooks/
    useDashboardData.ts                 # Extracted data loading hook
  components/dashboard/
    BotControlBar.tsx                   # Sticky top: KILL/PAPER/LIVE + price + WS
    MarketPills.tsx                     # Horizontal scroll market selector
    SignalFeed.tsx                      # Scrolling strategy opportunity cards
    QuickTradeSheet.tsx                 # Bottom sheet order form (mobile)
    PositionsStrip.tsx                  # Compact positions list
  utils/
    strategyDetectors.ts               # Extracted from StrategySpotlight.tsx
```

### Reused Components (no changes)
- `TradingChart` — candle chart with WebSocket, position markers, SL/TP lines
- `PerpPositionsList` — position management (partial close, pyramid, flip)

### Implementation Phases

#### Phase 1: Data Hook
1. Create `hooks/useDashboardData.ts`
   - Extract state + effects from Trade.tsx + HighRiskDashboard
   - Merge perp data, VPS spot data, WebSocket prices into one hook
   - Return: positions, prices, markets, signals, equity, bot state, handlers

#### Phase 2: Mobile Components
2. `BotControlBar.tsx` — Sticky top bar: [KILL] [PAPER/LIVE] + selected market price + WS status. Compact, one row
3. `MarketPills.tsx` — Horizontal scroll row of market buttons (SOL, BTC, ETH...) with live price + signal dot. Tap to switch chart
4. `SignalFeed.tsx` — Vertical scroll of strategy opportunity cards. Each card: strategy name, market, direction, hotness, entry/SL/TP, [TRADE] button
5. `QuickTradeSheet.tsx` — Bottom sheet (slides up on [TRADE] tap). Pre-filled from signal. Just size input + [Execute] button. Confirmation dialog for LIVE mode
6. `PositionsStrip.tsx` — Compact collapsible list. Each position: symbol + direction + P&L + [Close]. Expandable for full details

#### Phase 3: Assemble + Route
7. Create `TradeDashboard.tsx` — mobile: stacked layout, desktop: CSS Grid 3-column
8. Update router: `/trade` → TradeDashboard, old Trade at `/trade/classic`

#### Phase 4: Polish
9. Swipe gestures on chart to change market
10. Pull-to-refresh on mobile
11. Haptic-style animations on trade execution

---

## Part B: Telegram Trading Commands

Add admin-only trading commands to the existing Telegram bot (`api/telegram.ts`). These call the VPS API through the Vercel proxy.

### New Commands

| Command | What it does |
|---------|-------------|
| `/status` | Bot status: PAPER/LIVE, positions, equity, P&L |
| `/kill` | Kill the trading bot instantly |
| `/start_bot` | Re-enable trading |
| `/paper` | Switch to paper trading mode |
| `/live` | Switch to live trading (with confirmation) |
| `/positions` | List all open positions with P&L |
| `/buy SOL 50` | Buy $50 of SOL |
| `/sell SOL` | Sell entire SOL position |
| `/sell SOL 50` | Sell 50% of SOL position |
| `/signals` | Show current top strategy signals |
| `/prices` | Show all 15 token prices |
| `/close all` | Close all positions |

### Security
- Only admin wallet's Telegram user ID can use trading commands
- Add `ADMIN_TELEGRAM_ID` to VPS .env
- `/live` requires typing "CONFIRM LIVE" in a follow-up message
- All trade actions send confirmation message back with details

### Implementation
- Add command handlers to existing `api/telegram.ts`
- Commands call VPS proxy endpoints (`/api/vps-proxy?path=/api/config`, `/api/vps-proxy?path=/api/buy`, etc.)
- Or call VPS directly from the serverless function using server-side `VPS_API_URL` + `VPS_API_SECRET`

### Example Telegram Interaction

```
You: /status
Bot: 🤖 BUDJU Spot Bot
     Mode: PAPER
     Trading: ON
     Positions: 2 open
     Equity: $10,240.50
     Unrealized P&L: +$240.30 (+2.4%)

You: /signals
Bot: 📊 Top Signals Right Now:
     🔥 SOL LONG — Trend Following (73%)
        Entry $87.50 | SL $85.70 | TP $93.20
     🟡 BTC SHORT — BB Squeeze (61%)
        Entry $70,100 | SL $71,500 | TP $67,800

     Reply /buy SOL 50 to trade

You: /buy SOL 50
Bot: ✅ Paper Buy: $50 SOL at $87.91
     Position: 0.569 SOL

You: /kill
Bot: 🛑 Bot KILLED. Trading stopped.
     Use /start_bot to re-enable.
```

---

## Priority Order
1. **Telegram commands** (fastest impact — trade from your phone immediately)
2. **Mobile dashboard** (replace the tab mess)
3. **Desktop layout** (nice-to-have, built on top of mobile)

## Key Decisions
- **Mobile-first** — designed for phones, scales up to desktop
- **Telegram = fastest trading** — no app to open, just type
- **Reuse TradingChart as-is** — no chart rewrites
- **Bottom sheet pattern** for mobile trading (like Robinhood/Coinbase)
- **Keep old Trade.tsx** at `/trade/classic` during transition
- **Single data hook** — one source of truth for all components
