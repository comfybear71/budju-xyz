# BUDJU Project — Full Handoff Context

> Copy-paste this entire file into a new Claude conversation to restore full project context.

---

## 1. What This Project Is

**BUDJU** is a Solana meme coin ecosystem with a website, automated trading platform, and Telegram community bot.

- **Live site:** https://budju.xyz
- **Token:** `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump` (1B supply, 6 decimals)
- **Created:** January 31, 2025
- **Codebase:** ~45,000 lines across ~110 TypeScript/Python files

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (React 19 SPA)                                │
│  Vite 6 • TypeScript • Tailwind CSS 4 • React Router    │
│  Deployed as static files on Vercel                     │
├─────────────────────────────────────────────────────────┤
│  SERVERLESS API (Vercel Functions)                      │
│  Python: index.py, database.py, auto-trade-cron.py      │
│  TypeScript: telegram.ts, telegram-cron.ts, proxy.ts,   │
│    jupiter.ts, rpc.ts, marketing.ts                     │
├─────────────────────────────────────────────────────────┤
│  DATABASE: MongoDB Atlas                                │
│  Collections: users, trades, deposits, withdrawals,     │
│    trader_state, pool_state                             │
├─────────────────────────────────────────────────────────┤
│  EXTERNAL INTEGRATIONS                                  │
│  Swyftx (exchange) • Jupiter (DEX) • Helius (RPC)       │
│  CoinGecko • DexScreener • GeckoTerminal                │
│  Telegram Bot API • Claude Haiku (AI Q&A)               │
│  Vercel Blob (marketing assets)                         │
└─────────────────────────────────────────────────────────┘
```

**This is NOT Next.js.** It's a Vite SPA with client-side routing via `react-router-dom`.

---

## 3. Key Directories

```
src/
├── App.tsx                  # Root component, routing, providers
├── main.tsx                 # Vite entry point with polyfills
├── features/                # Feature modules (one per page)
│   ├── home/                # Landing page (Hero, Ecosystem, Roadmap)
│   ├── trade/               # Trading platform + auto-trader
│   │   ├── components/      # AutoTraderView, Leaderboard, Portfolio, etc.
│   │   │   └── perps/       # HighRiskDashboard, PerpStrategyPanel, charts, etc.
│   │   ├── services/        # autoTrader.ts, tradeApi.ts, perpApi.ts
│   │   └── types/           # perps.ts (TypeScript types for perp system)
│   ├── bank/                # Bank of BUDJU (deposits, JLP)
│   ├── pool/                # Liquidity pool management
│   ├── swap/                # Token swap interface (Jupiter)
│   ├── nft/                 # NFT collection + marketplace
│   ├── shop/                # Merchandise shop
│   ├── tokenomics/          # Token info, DexScreener embed
│   ├── burn/                # Burn statistics
│   ├── balance/             # Wallet balance checker
│   ├── how-to-buy/          # Getting started guide
│   ├── marketing/           # Marketing materials (Vercel Blob)
│   └── not-found/           # 404 page
├── components/common/       # Layout (Navbar/Footer), WalletConnect, ErrorBoundary
├── hooks/                   # useWallet, useTrading, useTokenHolders, useQueries
├── lib/
│   ├── web3/connection.ts   # Solana wallet integration (Phantom, Solflare, etc.)
│   └── services/            # walletService, bankApi, chartApi, depositService, tokenRegistry
├── constants/               # config.ts, routes.ts, addresses.ts
├── context/                 # ThemeContext (dark/light mode)
├── types/                   # global.d.ts (wallet types), gtag.d.ts
└── styles/                  # globals.css

api/
├── index.py                 # Main API (user, deposit, trade, pool, admin, perp endpoints)
├── database.py              # MongoDB + share-based pool accounting (NAV system)
├── auto-trade-cron.py       # Auto-trading cron (every 5 min) — spot/Swyftx
├── perp-cron.py             # Perp paper trading cron (every 1 min)
├── perp_engine.py           # Perp engine: positions, PnL, fees, liquidation, orders
├── perp_strategies.py       # Strategy engine: indicators, auto-trader runner, config
├── perp_ninja_strategy.py   # Ninja Ambush: confluence-based pending orders
├── perp_grid_strategy.py    # Grid Trading: ATR-based grid with smooth martingale
├── perp_keltner.py          # Keltner Channel: mean reversion + squeeze breakout
├── perp_bb_squeeze.py       # Bollinger Squeeze: volatility compression breakout
├── perp_zone_recovery.py    # Zone Recovery: hedge recovery with escalating lots
├── perp_hf_scalper.py       # HF Scalper: high-frequency small-profit trades
├── perp_backtest.py         # Backtesting engine
├── perp_exchange.py         # Drift Protocol integration (live trading, future)
├── telegram.ts              # Telegram bot webhook (commands, AI Q&A, moderation)
├── telegram-cron.ts         # Scheduled Telegram messages (4x daily + price updates)
├── proxy.ts                 # Swyftx exchange proxy (token auth, order placement)
├── jupiter.ts               # Jupiter DEX proxy (quote + swap)
├── rpc.ts                   # Solana RPC proxy (Helius + fallback)
└── marketing.ts             # Vercel Blob marketing assets
```

---

## 4. Build & Run

```bash
npm run dev          # Vite dev server on localhost:5173
npm run build        # Production build to dist/
npm run lint         # ESLint
npm run test         # Python tests (pytest)
```

---

## 5. Frontend Details

### Provider Stack (App.tsx)
```
<QueryClientProvider>         # TanStack React Query
  <BrowserRouter>             # React Router
    <ThemeProvider>            # Dark/light mode
      <WalletProvider>        # Solana wallet context
        <ErrorBoundary>       # Error catching
          <Suspense>          # Lazy loading
            <Layout>          # Navbar + Footer + page transitions
              <Routes>        # Client-side routes
```
Plus `<Analytics />` from `@vercel/analytics/react`.

### TypeScript Path Aliases (tsconfig.app.json)
- `@/*` → `src/*`
- `@components/*` → `src/components/*`
- `@features/*` → `src/features/*`
- `@hooks/*` → `src/hooks/*`
- `@lib/*` → `src/lib/*`
- `@styles/*` → `src/styles/*`
- `@constants/*` → `src/constants/*`
- `@types/*` → `src/types/*`

### Theme Colors (tailwind.config.ts)
- `budju-pink`: #FF69B4
- `budju-blue`: #87CEFA
- `budju-yellow`: #FFD700
- Border radius `budju`: 15px

### Wallet Integration
- Uses raw Solana wallet adapter (NOT `@solana/wallet-adapter-react-ui` for connection — custom `WalletConnect` component)
- `useWallet` hook (`src/hooks/useWallet.tsx`) provides connection state, balance tracking, transaction signing
- Supports Phantom, Solflare, Jupiter wallets
- Mobile detection with auto-reconnection

### Key Frontend Services
- **walletService.ts** — Balance fetching via `/api/rpc` proxy
- **bankApi.ts** — SPL token deposits to Bank wallet
- **chartApi.ts** — OHLCV candle data from GeckoTerminal (2-min cache)
- **depositService.ts** — USDC deposits to pool wallet
- **tokenRegistry.ts** — Token lookup from Solana token list CDN
- **perpApi.ts** — Full perp trading API client (positions, orders, strategies, backtest)

---

## 6. Backend Details

### Python API (api/index.py + api/database.py)

#### Authentication
- **Admin endpoints** require Ed25519 signature verification
- Message format: `BUDJU Admin Action: <timestamp>` (5-min window)
- Nonce cache prevents replay attacks
- Admin wallets defined in `ADMIN_WALLETS` env var

#### Share-Based Pool Accounting (NAV System)
```
NAV per share = totalPoolValue / totalShares
On deposit:   sharesIssued = depositAmount / currentNAV
User value:   userShares × currentNAV
Allocation %: (userShares / totalShares) × 100
```

#### Key API Endpoints

**Public GET:**
- `/api/user/portfolio?wallet=` — User portfolio
- `/api/user/deposits?wallet=` — Deposit history
- `/api/user/position?wallet=&poolValue=` — Current position + NAV
- `/api/pool/state` — Total shares
- `/api/state` — Trader state (tiers, targets, trade log)
- `/api/admin/stats?poolValue=` — Pool stats
- `/api/leaderboard?poolValue=` — Ranked users
- `/api/transactions?wallet=` — Transaction history

**Public POST:**
- `/api/user/register` — Register user
- `/api/user-deposit` — Self-service deposit (issues shares)

**Admin POST (require signature):**
- `/api/deposit` — Record admin deposit
- `/api/pool/initialize` — Initialize pool
- `/api/state` — Update trader state
- `/api/trade` — Record trade
- `/api/trade/sync` — Bulk sync trades from Swyftx
- `/api/admin/import-user` — Import user
- `/api/admin/recalibrate` — Snapshot/reset pool P&L

**Perp Trading API:**
- See Section 11 for full perp endpoint list

### Auto-Trade Cron (api/auto-trade-cron.py) — Every 5 Minutes (Spot)

**Flow:**
1. Check trading enabled & bot active in trader_state
2. Verify no browser device has fresh heartbeat (5-min stale)
3. Fetch live prices from CoinGecko
4. Fetch Swyftx portfolio & USDC balance
5. For each coin with active tier + target:
   - BUY if price ≤ buy target (min $8, keep $100 USDC reserve)
   - SELL if price ≥ sell target (83.3% of allocation × balance)
6. Record trades, update targets, set 24h cooldowns
7. Send Telegram notifications

### Telegram Bot (api/telegram.ts)

**Commands:** /start, /help, /menu, /price, /chart, /info, /tokenomics, /roadmap, /socials, /bot, /bank, /burn, /nft, /shop, /pool, /buy, /contract, /website, /promo

**Features:**
- Claude Haiku AI Q&A (responds to questions about BUDJU)
- Auto-moderation with profanity filter (5-min restrict)
- New member welcome with inline keyboard
- DexScreener → GeckoTerminal → Jupiter price fallback
- Marketing image listing from Vercel Blob

### Telegram Cron (api/telegram-cron.ts) — 4x Daily (0/6/12/18 UTC)
- Alternates: promo with marketing image ↔ price update
- Auto re-registers webhook at every run

### Proxy Endpoints
- **proxy.ts** — Swyftx exchange (token-cached 50min, order placement, portfolio)
- **jupiter.ts** — Jupiter DEX (quote GET, swap POST)
- **rpc.ts** — Solana RPC (Helius primary, public fallback, 19 allowed methods)
- **marketing.ts** — Vercel Blob listing

---

## 7. Environment Variables

```
# Database
MONGODB_URI=                  # MongoDB Atlas connection string
DB_NAME=flub                  # Database name (legacy "flub")

# Admin
ADMIN_WALLETS=                # Comma-separated admin wallet addresses

# Trading (Swyftx)
SWYFTX_API_KEY=               # Exchange API key
TRADING_ENABLED=true          # Kill switch
DRY_RUN=false                 # Simulate mode
MAX_SINGLE_TRADE_USDC=500
MAX_DAILY_TRADES=20
MAX_DAILY_LOSS_USDC=2000

# Solana
HELIUS_API_KEY=               # RPC provider

# Telegram
TELEGRAM_BOT_TOKEN=           # Bot token

# AI
ANTHROPIC_API_KEY=            # Claude Haiku for bot Q&A

# Vercel
BLOB_READ_WRITE_TOKEN=        # Marketing assets
CRON_SECRET=                  # Cron job auth

# Frontend (VITE_ prefix)
VITE_ENVIRONMENT=development
VITE_PUBLIC_URL=http://localhost:5173
VITE_ANALYTICS_ID=            # Google Analytics
```

---

## 8. Deployment (Vercel)

- **vercel.json** defines:
  - No-cache headers on all routes (fresh deploys)
  - Rewrites: API routes → serverless functions, SPA catch-all → `/index.html`
  - Crons: perp-cron every 1 min, auto-trade every 5 min, telegram-cron 4x daily
- **Python runtime:** api/*.py files auto-detected
- **TypeScript runtime:** api/*.ts files auto-detected
- **Static:** dist/ from Vite build
- **Dependabot:** Weekly npm + pip updates (.github/dependabot.yml)

---

## 9. Key Gotchas & Patterns

1. **Database name is "flub"** — Legacy from earlier project iteration. Set via `DB_NAME` env var.
2. **No-cache headers on all routes** — Intentional for fresh deploys.
3. **Telegram cron re-registers webhook** every run to prevent silent failures.
4. **Device heartbeat** in auto-trade prevents conflicts between browser and cron trades.
5. **CORS** restricted to budju.xyz, www.budju.xyz, localhost in production.
6. **Rate limiting:** 30/min GET, 10/min POST on main API; 60/min on RPC; 20/min on Jupiter.
7. **Trade log field naming:** Server-side uses `timestamp`, client-side autoTrader.ts uses `time`. The view checks both.
8. **Share accounting is NAV-based** — deposits issue shares at current NAV, not 1:1 with USD amount.
9. **Swyftx token** is cached 50 minutes in proxy.ts warm instances.
10. **Admin wallet default:** `AEWvE2xXaHSGdGCaCArb2PWdKS7K9RwoCRV7CT2CJTWq` — excluded from leaderboards and allocations.
11. **Strategy config merge** — `get_strategy_config()` auto-merges new strategies into existing accounts so old configs get new strategies on next load.

---

## 10. Key Addresses & Links

- **Token:** `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump`
- **Burn address:** `1nc1nerator11111111111111111111111111111111`
- **Bank address:** `5b1FfWsJR3pJzWbXDVGfZkRqCvp6njcCPDfZnWy9jH8u`
- **Pool wallet:** `AEWvE2xXaHSGdGCaCArb2PWdKS7K9RwoCRV7CT2CJTWq`
- **USDC mint:** `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **JLP mint:** `27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4`
- **Raydium AMM pool:** `FxHfhKyXkLRCRGqhasqW2fU1iPJ8Cs1DSAUEmcx3dLmN`
- **DEX link:** https://dexscreener.com/solana/fxhfhkyxklrcrgqhasqw2fu1ipj8cs1dsauemcx3dlmn
- **Social links:** Facebook, Telegram, Instagram, Twitter, TikTok, Pump.fun (defined in `src/constants/config.ts`)

---

## 11. Perpetual Paper Trading System (High Risk Dashboard)

### Overview
Full perpetual futures paper trading system at `/trade`. Users trade with $10K virtual USDC balance. Supports 10 markets (SOL, BTC, ETH, DOGE, AVAX, LINK, SUI, JUP, WIF, BONK) with up to 50x leverage.

### Architecture
```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND: HighRiskDashboard                            │
│  Real-time Binance WebSocket prices                     │
│  Desktop: TradingView (lightweight-charts)              │
│  Mobile: SVG MobileAreaChart (iOS Safari compatible)    │
│  Tabs: Chart, Bot, Positions, Orders, Trades, AI        │
│  Strategy toggles: slide switches with live status      │
├─────────────────────────────────────────────────────────┤
│  API: api/index.py (perp endpoints)                     │
│  POST /api/perp/order — Open position                   │
│  POST /api/perp/close — Close position                  │
│  POST /api/perp/modify — Modify SL/TP/trailing          │
│  POST /api/perp/partial-close — Partial close (1-99%)   │
│  POST /api/perp/pyramid — Add to winning position       │
│  POST /api/perp/flip — Close + reverse direction        │
│  POST /api/perp/position-type — Set core/satellite      │
│  POST /api/perp/pending-order — Create limit/stop order │
│  POST /api/perp/pending-order/cancel — Cancel order     │
│  POST /api/perp/strategy/toggle — Enable/disable bot    │
│  POST /api/perp/strategy/config — Update strategy cfg   │
│  GET  /api/perp/strategy/status — Strategy status + pos │
│  GET  /api/perp/backtest — Run strategy backtest        │
│  GET  /api/perp/positions — Open positions               │
│  GET  /api/perp/account — Account info + equity          │
│  GET  /api/perp/pending-orders — Pending orders          │
│  GET  /api/perp/metrics — Trading metrics                │
│  GET  /api/perp/public — Public read-only data           │
├─────────────────────────────────────────────────────────┤
│  ENGINE: api/perp_engine.py                              │
│  Position lifecycle, PnL, liquidation, fees, equity,     │
│  pending orders, pyramiding, partial close, flip,        │
│  position types, funding analysis, re-entry candidates   │
│  Position limits: 5 per side per symbol (5L + 5S each)   │
│  Pending order limit: 30 max                             │
├─────────────────────────────────────────────────────────┤
│  CRON: api/perp-cron.py (every 1 minute)                │
│  Fetch CoinGecko prices → store price history →          │
│  check pending orders → update positions → check         │
│  SL/TP/liquidation/trailing → auto-close → run           │
│  auto-trader strategies → equity snapshot                 │
├─────────────────────────────────────────────────────────┤
│  STRATEGY ENGINE: api/perp_strategies.py                 │
│  10 strategies (6 in main loop, 4 separate runners)      │
│  Equity curve meta-filter, ATR-based sizing,             │
│  drawdown protection, Binance historical seeding         │
├─────────────────────────────────────────────────────────┤
│  STRATEGY FILES:                                         │
│  perp_strategies.py — Core 6: trend, mean_rev, momentum, │
│    scalping, keltner, bb_squeeze                         │
│  perp_ninja_strategy.py — Ninja Ambush (confluence)      │
│  perp_grid_strategy.py — Grid (ATR + smooth martingale)  │
│  perp_zone_recovery.py — Zone Recovery (hedge recovery)  │
│  perp_hf_scalper.py — HF Scalper (high-frequency)        │
│  perp_keltner.py — Keltner Channel indicators            │
│  perp_bb_squeeze.py — BB Squeeze detection               │
│  perp_backtest.py — Backtesting engine                    │
├─────────────────────────────────────────────────────────┤
│  DB Collections: perp_accounts, perp_positions,          │
│  perp_orders, perp_trades, perp_equity, perp_funding,    │
│  perp_price_history, perp_strategy_config,               │
│  perp_strategy_signals, perp_pending_orders,             │
│  perp_grid_state, perp_zone_state, perp_equity_curve     │
└─────────────────────────────────────────────────────────┘
```

### Paper Trading Fee Model (mirrors Jupiter Perps)
- **Open/close fee:** 0.06% of position size
- **Borrow fee:** 0.01%/hr (charged hourly by cron)
- **Slippage:** 0.05–0.15% simulated based on size
- **Liquidation:** Scaled maintenance margin: `min(5%, 50%/leverage)`

### Key Engine Constants (perp_engine.py)
```python
INITIAL_BALANCE = 10_000.0       # $10K USDC starting balance
MAX_LEVERAGE = 50
MAX_POSITIONS_PER_SIDE = 5       # Max 5 longs + 5 shorts per symbol
MAX_OPEN_POSITIONS = 50          # Soft global cap (10 symbols × 5 per side)
MAX_POSITION_PCT = 0.50          # Max 50% equity per position
DAILY_LOSS_LIMIT_PCT = 0.20     # 20% daily loss → pause trading
MAX_PENDING_ORDERS = 30          # Pending order capacity
```

### All 10 Auto-Trading Strategies

| # | Strategy | Type | Signal | Lev | SL | TP | Trail | Cooldown | Default |
|---|----------|------|--------|-----|----|----|-------|----------|---------|
| 1 | Trend Following | Main loop | EMA 9/21 cross + RSI | 5x | 2.0x | 8.0x | 1.5% | 2hr | ON |
| 2 | Mean Reversion | Main loop | BB bounce + RSI 30/70 | 3x | 1.5x | 3.0x | 1.0% | 2hr | ON |
| 3 | Momentum | Main loop | Breakout + range expansion | 5x | 2.5x | 10.0x | 2.0% | 2hr | ON |
| 4 | Scalping | Main loop | RSI 5 + EMA slope | 3x | 1.5x | 2.5x | 1.5% | 2hr | OFF |
| 5 | Keltner Channel | Main loop | KC bounce / squeeze breakout | 3x | 1.5x | 3-5x | 1-2% | 2hr | OFF |
| 6 | BB Squeeze | Main loop | Squeeze release + momentum | 4x | 2.0x | 8.0x | 2.5% | 2hr | OFF |
| 7 | Ninja Ambush | Separate | Confluence pending orders | 2x | 2.5x | 6.0x | 2.0% | N/A | OFF |
| 8 | Grid Trading | Separate | ATR-based grid levels | 2x | 3.0x | 1.0x | — | 1hr | OFF |
| 9 | Zone Recovery | Separate | Hedge + escalating lots | 3x | 2.0x | 3.0x | — | 2hr | OFF |
| 10 | HF Scalper | Separate | 4 fast signals, all markets | 5x | 0.5x | 1.0x | 0.5% | **5min** | OFF |

**SL/TP values are ATR multipliers.** ATR is 1-minute data scaled by `sqrt(60)` to approximate 1-hour ATR.

### Meta-Features
- **Equity Curve Trading** — Monitors EMA of equity curve. If equity falls below its EMA, reduces position sizing (0.5x at -3%, 0.25x at deeper drawdown). Applied to all strategies automatically.
- **50-period EMA Trend Filter** — Trend following, momentum, scalping require trade direction aligned with 50 EMA. Mean reversion exempted (it fades overextensions by design).
- **Drawdown Protection** — Half-size at 5% drawdown from equity peak, stop trading at 10% drawdown.
- **Correlation Guard** — Max 1 position across BTC/ETH/SOL group (not applied to HF Scalper).
- **Historical Seeding** — Price history auto-seeded from Binance public API to eliminate cold-start.

### Strategy Flow (how it all connects)
```
1. UI: PerpStrategyPanel.tsx — slide toggle switches
   ↓ POST /api/perp/strategy/config {strategies.{name}.enabled: true}
2. Backend: update_strategy_config() → MongoDB perp_strategy_config
3. Cron: perp-cron.py runs every 1 minute
   ↓ calls run_auto_trader(wallet, prices)
4. Auto-trader: perp_strategies.py
   ↓ Checks each enabled strategy for signals
   ↓ Applies equity curve filter, drawdown protection
   ↓ Calculates position size, SL/TP from ATR
5. Execution: open_position() in perp_engine.py
   ↓ Creates position document in MongoDB
6. Monitoring: perp-cron.py checks SL/TP/liquidation every minute
   ↓ Auto-closes positions when triggered
```

### Advanced Position Management
- **Partial Close** — Close 1-99% of a position; updates remaining size/margin
- **Pyramiding** — Add to winning positions (max 3 levels, 50% size decrease per level)
- **Position Flipping** — Close + reverse direction in one operation
- **Core/Satellite Tracking** — Tag positions, get separate P&L summary
- **Pending Orders** — Limit/stop orders with trigger price, SL/TP, optional expiry
- **Funding Rate Analysis** — Per-position funding cost breakdown
- **Re-entry Candidates** — Detects recent profitable exits with pullback from exit price

### Live Trading (FUTURE — not yet active)
- `perp_exchange.py` has Drift Protocol integration (Solana-native)
- All Drift imports are lazy (`if is_live:` guards) — won't crash without deps
- Drift deps exceed Vercel's 500MB Lambda limit — needs separate infra
- Live mode has extra safety: kill switch, max $500 position, max 3 positions

---

## 12. Recent Changes (as of March 14, 2026)

### Critical Bug Fixes (latest session — March 14, 2026)
- **CRITICAL: Take Profit exits losing money** — TP/SL exits in paper mode used `mark_price - slippage` as fill price. This meant a TP trigger at $110 could fill at $109.89 after slippage, then fees pushed P&L negative. Fix: TP exits now fill at the TP target price (like a real limit order), SL exits at SL target price. Market/manual/trailing exits still apply slippage.
- **Settings persistence bug** — Partial tier updates (e.g., changing tier1 deviation) used MongoDB `$set` which overwrote the entire `autoTiers` field, deleting tier2/tier3. Fix: `save_trader_state()` now deep-merges autoTiers; `get_trader_state()` merges defaults for missing keys.
- **iPhone charts failing to load** — Content blockers on iPhone Safari pattern-match on "binance" in URLs, blocking both `api.binance.com` AND our `/api/binance` proxy. Fix: Renamed proxy to `/api/klines` (neutral name), all chart components now use `/api/klines`. Added staggered loading (300ms between charts on mobile) to prevent 6 simultaneous fetches overwhelming the connection.
- **Trade history refresh** — Added manual refresh button to PerpTradeHistory, kill_switch exit type label, and amber warning flag on TP exits with negative P&L.

### EA-Inspired Strategies (latest session)
- **Keltner Channel strategy** (`perp_keltner.py`) — ATR-based channels with auto mode switching: mean reversion (bounce off channel) when normal, breakout mode when BB Squeeze detected
- **Bollinger Squeeze strategy** (`perp_bb_squeeze.py`) — Detects volatility compression (BB inside Keltner Channel), trades the explosive breakout with momentum + RSI + range expansion confirmation
- **Zone Recovery strategy** (`perp_zone_recovery.py`) — Forex EA-inspired hedge recovery. Opens opposing trades with escalating lot sizes (smooth martingale 1.3x, D'Alembert, or Fibonacci sizing modes). Max 5 recovery levels per zone, 2 active zones max.
- **HF Scalper strategy** (`perp_hf_scalper.py`) — High-frequency trading across all 10 markets. 5-minute cooldown, no correlation guard, 4 signal types (micro EMA cross, RSI snap, wick rejection, momentum burst). Tight 0.5x ATR SL / 1.0x ATR TP for quick $1-3 profits.
- **Equity Curve Trading meta-filter** — Monitors EMA of strategy equity curve, auto-reduces sizing during cold streaks
- **Smooth martingale** option added to grid strategy (1.3x vs classic 2x doubling)
- **Strategy config auto-merge** — `get_strategy_config()` now merges new strategies into existing account configs so old accounts see new strategies
- **UI toggle switches** — Converted ON/OFF buttons to proper slide toggle switches for clearer visual feedback
- **Removed unimplemented UI cards** — Removed swing_trading, grid_bot, funding_arb cards that had no backend

### Strategy Integration (previous session)
- **Ninja Ambush** and **Grid Trading** integrated into cron runner with lazy imports
- **Backtest API endpoint** added: `GET /api/perp/backtest?strategy=&symbol=&periods=&balance=`
- **Position limits changed** to 5 per side per currency (5 longs + 5 shorts per symbol)
- **Pending order limit** increased to 30 (ninja + grid need room)
- **Position action buttons** added to position cards: partial close, pyramid, flip, core/satellite

### Chart System (March 14, 2026 — IMPORTANT)

**What works:**
- **DashboardCharts.tsx** — ALWAYS uses TradingChart (candle charts) for ALL devices. Uses `LazyChart` wrapper with IntersectionObserver to defer WebSocket connections until chart scrolls into view (prevents iOS Safari WebSocket limit). Mobile gets 4 charts in grid, desktop gets 6. Grid and focus chart cards flash green/red borders + glow shadow on real-time price changes.
- **TradingChart.tsx** — TradingView `lightweight-charts` candle chart with live Binance WebSocket streaming, AI prediction line, signal badges, position overlays (SL/TP/Liq lines), strategy labels. Default interval is 1h (was 15m). Toggle buttons (Vol/Trades/Positions/AI/Strats, Candle/Line, signal badge) have `stopPropagation()` to prevent accidental view switching in grid mode. New "Strats" button shows a strategy popup with active strategies per market.
- **MobileAreaChart.tsx** — Exists as a standalone SVG chart component but is NOT used by DashboardCharts. Can be used for other contexts if needed.
- **api/klines.ts** — Proxy at `/api/klines` with cascade: Binance.US -> OKX -> Binance Global. Works from any location.
- **TradingChart data source** — Tries `/api/klines` proxy first (works from any VPN/location), then falls back to direct `api.binance.com` (faster when not geo-blocked).
- **binanceWs.ts** — WebSocket streams cycle through 3 fallback endpoints (`stream.binance.com` → `data-stream.binance.com` → `stream.binance.us`) on disconnect. Fixes geo-blocking in AU/US.

**What went wrong (DO NOT REPEAT):**
1. Added MobileAreaChart as a conditional replacement for TradingChart in DashboardCharts based on screen width detection. This caused desktop to show area charts instead of candles through 5+ broken iterations.
2. Multiple `isMobile()` detection functions all failed — they matched Mac Safari as mobile (due to `ontouchend`, `maxTouchPoints`, etc).
3. Even `window.innerWidth < 768` should have worked but the real issue was never confirmed — possibly TradingChart was crashing silently when fetching from geo-blocked Binance API (user had US VPN on), making the chart appear blank.
4. **Root cause:** DashboardCharts should NEVER conditionally swap TradingChart for MobileAreaChart. The working version (from branch `claude/apply-cleanup-workflow-changes-NfvoU`) always uses TradingChart. Period.
5. **Geo-blocking:** Binance Global (`api.binance.com`) returns HTTP 451 from US IPs. This affects both Vercel servers (US region) AND users with US VPN. Solution: TradingChart now tries proxy first.
6. **Content blockers:** iPhone content blockers block URLs containing "binance" — both `api.binance.com` AND paths like `/api/binance`. Solution: proxy renamed to `/api/klines`.

### Live Charts & Trading UX Improvements (March 14, 2026 — Session 2)

Changes made:

1. **WebSocket fallback endpoints** — `binanceWs.ts` now cycles through 3 WebSocket endpoints (`stream.binance.com` → `data-stream.binance.com` → `stream.binance.us`) on disconnect. Both `BinancePriceStream` and `BinanceKlineStream` use this fallback logic. Fixes geo-blocking in AU/US.

2. **WS LIVE badge always visible** — The WS badge in Trade.tsx header now always shows: amber "WS ..." while connecting, green "WS LIVE (count)" when connected. Previously hidden when disconnected.

3. **Live price border colors on chart cards** — DashboardCharts grid and focus chart cards flash green/red borders + glow shadow on real-time price changes (3-second duration). Uses `prevPricesRef` to track price direction per market.

4. **Signal badge repositioned** — In TradingChart, the signal badge (e.g. "SCALP SHORT 21%") moved from cramped header row to its own line below the currency label (BTC/USDT). Works in both compact (grid) and full (focus) mode. Compact mode now shows full text badge instead of just a colored dot.

5. **Default chart interval changed to 1h** — Both `fetchHistoricalKlines` and `BinanceKlineStream` in TradingChart now use "1h" interval instead of "15m".

6. **Toggle button click fix** — Added `stopPropagation()` to Vol/Trades/Positions/AI toggle buttons, Candle/Line buttons, and signal badge in TradingChart. Previously clicking these in grid view would bubble up to the parent card's onClick and switch to focus mode.

7. **Pages scroll to top on cold start** — Added `window.history.scrollRestoration = "manual"` in Layout component to prevent browser overriding the manual `scrollTo(0,0)` on route change.

8. **Hover effects on all buttons** — Added hover effects to all buttons missing them:
   - Trade page: Orders, Auto Trader, Live Charts cards → `hover:scale-[1.02] hover:brightness-125`
   - FAQ section: background highlight on hover
   - NFT detail: like button scale on hover
   - Carousel dots (NFTShowcase + ShopOfBudjusPreview): scale up + brighten on hover

9. **Brighter chart text** — All chart overlay text brightened: `slate-600` → `slate-400`, `slate-500` → `slate-300` across strategy breakdown panel, position info, recent trades, and toggle button off-states.

10. **Default toggle states** — Trades & Positions buttons now default OFF on cold start. Vol & AI remain ON.

11. **Strategy popup menu on charts** — New "Strats" button next to AI in the chart toggle bar:
    - Purple themed with green badge showing count of active strategies on that market
    - Slide-up popup panel shows each active strategy: icon, name, ACTIVE badge, leverage, max positions
    - Coin row with SOL/BTC/ETH/SUI/AVAX/LINK badges — GREEN if strategy trades that coin, highlighted if current chart's market
    - Shows active positions with direction + P&L for each strategy on the market
    - Footer: "X strategies enabled total · Y on {coin}"
    - DashboardCharts fetches `fetchStrategyStatus(wallet)` every 30s and passes to all TradingChart instances
    - New `STRATEGY_META` constant maps strategy keys to display names and icons
    - New `slideUp` CSS keyframe animation in globals.css

### Core System (earlier sessions)
- Full perpetual paper trading system with 10 markets, real-time Binance WebSocket charts
- Critical bug fixes: TP trigger chain, liquidation formula, ATR scaling
- Advanced position management: partial close, pyramiding, flipping, core/satellite
- Pending orders with limit/stop types, trigger execution, expiry
- Trailing stops profit-activated (not from entry)

---

## 13. Known Tech Debt & Considerations

1. **Drift Protocol live trading blocked by Vercel limits** — deps are 661MB vs 500MB limit. Needs separate infra.
2. **Cron-based trigger monitoring (1-min interval)** — Price can gap past SL/TP between ticks.
3. **Bundle size warning** — Main chunk >500KB. Could benefit from code splitting.
4. **No automated tests for frontend** — Only Python tests exist.
5. **Legacy DB name "flub"** — Consider migrating to "budju" for clarity.
6. **`executeDeposit` in useTrading.ts is a mock** — returns fake tx ID. Real deposits use depositService.ts.
7. **No client-side SL/TP pre-validation** — Server rejects invalid values but frontend doesn't show inline errors.
8. **Pending orders UI lacks real-time price for all markets** — Uses Binance WS for selected symbol only.
9. **HF Scalper can generate many positions** — Max 15 concurrent, but monitor account balance consumption.
10. **Zone Recovery can accumulate exposure** — 15% equity cap per zone, but monitor if multiple zones stress the balance.
11. **Equity curve requires ~20 cron ticks of data** — New accounts trade at full size until enough snapshots accumulate.

---

## 14. Session Issues Log (March 14, 2026)

### Issues Caused by This Session

1. **Desktop candle charts replaced with area charts (5 failed fix attempts)**
   - **Root cause:** Added conditional `MobileAreaChart` swap in DashboardCharts based on screen width detection
   - **Why it kept failing:** Multiple `isMobile()` implementations all incorrectly matched Mac Safari as mobile
   - **Real fix:** Restored DashboardCharts to always use TradingChart (as the working branch had it)
   - **Lesson:** Never conditionally swap chart components. The LazyChart + TradingChart pattern works on all devices.

2. **Chart data fetch failures from US VPN**
   - **Root cause:** TradingChart fetched directly from `api.binance.com` which returns 451 from US IPs
   - **Fix:** TradingChart now tries `/api/klines` proxy first, then direct Binance
   - **Lesson:** Always use the proxy for initial data fetch. WebSocket streaming still goes direct to Binance (not geo-blocked for WS).

3. **Klines proxy server-side failures**
   - **Root cause:** Original proxy used Bybit as fallback, but Bybit returns 403 from Vercel US servers
   - **Fix:** Replaced Bybit with OKX (verified working from US). Cascade: Binance.US -> OKX -> Binance Global.

4. **Incorrectly told user to merge to master**
   - **Root cause:** Assumed Vercel only deploys from main/master branch
   - **Reality:** User's Vercel IS configured to deploy from the feature branch
   - **Lesson:** Ask the user about their Vercel deployment config before making assumptions.

### Bugs Fixed This Session (confirmed working)

1. **TP exits losing money** — Fixed in `perp_engine.py`: TP exits now fill at TP target price, SL at SL target price (no slippage on limit-like exits)
2. **Settings overwritten on partial update** — Fixed in `database.py`: deep-merge for autoTiers instead of `$set` overwrite
3. **Auto-trader crash (`actions` NameError)** — Fixed in `perp_strategies.py`: moved `actions = []` above equity curve filter
4. **Strategy labels on positions** — Added regex extraction of `[STRATEGY]` from `entry_reason` in PerpPositionsList and TradingChart
5. **AI prediction dots on mobile** — Added to MobileAreaChart with tappable info popup

---

*Last updated: March 14, 2026.*
