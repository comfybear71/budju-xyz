# Trade Dashboard Redesign — Implementation Plan

## The Problem
The `/trade` page is a 1000+ line monolith with 15+ boolean `show*` state variables toggling panels on/off. Everything is hidden behind tabs. A trader can't see chart + positions + signals at the same time.

## The Solution
A single-screen trading dashboard with CSS Grid layout. No tabs, no page switching — everything visible at once.

## Layout

```
Desktop (>= 1280px):
+---------------------------------------------------------------+
| BotControlBar  [KILL] [PAPER/LIVE] [BOT ON/OFF]  Equity  WS  |
+----------+-----------------------------------+----------------+
|          |                                   |                |
| Markets  |     TradingChart (main)           |  Signal Feed   |
| Sidebar  |     (candle chart, big)           |  (scrolling    |
| (live    |                                   |   strategy     |
|  prices, |                                   |   opportunity  |
|  signal  |                                   |   cards)       |
|  dots)   |                                   |                |
|          |                                   | QuickTrade     |
+----------+-----------------------------------+----------------+
|             Positions Panel (active positions, wide table)     |
+---------------------------------------------------------------+

Mobile: Stacked vertically with sticky top bar
```

## New Files

```
src/features/trade/
  TradeDashboard.tsx                    # Main page (~300 lines)
  hooks/
    useDashboardData.ts                 # Extracted data loading hook
  components/dashboard/
    BotControlBar.tsx                   # Top: KILL/PAPER/LIVE + equity + WS status
    MarketsSidebar.tsx                  # Left: 10 markets with live prices + signal dots
    SignalFeed.tsx                      # Right: scrolling strategy opportunity cards
    QuickTradePanel.tsx                 # Compact order form from signal click
    PositionsPanel.tsx                  # Bottom: wide positions table
  utils/
    strategyDetectors.ts               # Extracted from StrategySpotlight.tsx
```

## Existing Components Reused (no changes needed)
- `TradingChart` — candle chart with WebSocket, position markers, SL/TP lines
- `PerpPositionsList` — position management (partial close, pyramid, flip)
- `PerpOrderForm` — full order entry (accessed via "Advanced" from QuickTrade)

## Implementation Phases

### Phase 1: Extract Data Hook
1. Create `hooks/useDashboardData.ts`
   - Extract all state + effects from Trade.tsx (lines 49-296) and HighRiskDashboard (lines 50-227)
   - Merge perp data, spot data, VPS status, WebSocket prices into one hook
   - Return typed interface: positions, prices, markets, signals, equity, handlers

### Phase 2: Create Components
2. `BotControlBar.tsx` — Port from HighRiskDashboard kill switch + VPS PAPER/LIVE controls
3. `MarketsSidebar.tsx` — 10 perp markets with live prices, 24h change, signal dots, position count badges
4. `SignalFeed.tsx` — Extract detector functions from StrategySpotlight.tsx, render ALL opportunities as scrollable cards sorted by hotness
5. `QuickTradePanel.tsx` — Pre-populated from signal: symbol, direction, leverage, SL/TP. One field (size) + Execute button
6. `PositionsPanel.tsx` — Wide table layout wrapping PerpPositionsList: Symbol | Dir | Size | Entry | Mark | PnL | SL | TP | Actions

### Phase 3: Assemble Dashboard
7. Create `TradeDashboard.tsx` with CSS Grid layout
8. Update router: `/trade` → TradeDashboard, keep old Trade at `/trade/classic`

### Phase 4: Mobile + Polish
9. Responsive: Markets → horizontal strip, SignalFeed → carousel, QuickTrade → bottom drawer, Positions → collapsible
10. Extract strategy detectors to shared utility

## Key Decisions
- **Reuse TradingChart as-is** — it's feature-complete, just pass props
- **CSS Grid over flexbox** — rigid panel structure for fixed-width sidebars
- **No new dependencies** — all existing packages
- **Keep old Trade.tsx accessible** at `/trade/classic` during transition
- **Single WebSocket** — `getBinancePriceStream()` is already a singleton
