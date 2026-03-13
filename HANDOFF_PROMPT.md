# BUDJU Project — Full Handoff Context

> Copy-paste this entire file into a new Claude conversation to restore full project context.

---

## 1. What This Project Is

**BUDJU** is a Solana meme coin ecosystem with a website, automated trading platform, and Telegram community bot.

- **Live site:** https://budju.xyz
- **Token:** `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump` (1B supply, 6 decimals)
- **Created:** January 31, 2025
- **Codebase:** ~40,600 lines across ~100 TypeScript/Python files

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
│   │   └── services/        # autoTrader.ts, tradeApi.ts, activityLog.ts
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
├── index.py                 # Main API (user, deposit, trade, pool, admin endpoints)
├── database.py              # MongoDB + share-based pool accounting (NAV system)
├── auto-trade-cron.py       # Auto-trading cron (every 5 min)
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

### Auto-Trade Cron (api/auto-trade-cron.py) — Every 5 Minutes

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

**Circuit Breakers (env vars):**
- `MAX_SINGLE_TRADE_USDC` — default $500
- `MAX_DAILY_TRADES` — default 20/24h
- `MAX_DAILY_LOSS_USDC` — default $2000 sold/24h
- `TRADING_ENABLED` — kill switch
- `DRY_RUN` — simulate mode

**Tier System:**
- Each tier has `deviation%` (how much to move targets after trade) and `allocation%` (trade size)
- Coins assigned to tiers via `autoTierAssignments`

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
  - Crons: auto-trade every 5min, telegram-cron 4x daily
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
7. **Trade log field naming:** Server-side uses `timestamp`, client-side autoTrader.ts uses `time`. The view (`AutoTraderView.tsx`) checks both `entry.timestamp || entry.time`.
8. **Share accounting is NAV-based** — deposits issue shares at current NAV, not 1:1 with USD amount.
9. **Swyftx token** is cached 50 minutes in proxy.ts warm instances.
10. **Admin wallet default:** `AEWvE2xXaHSGdGCaCArb2PWdKS7K9RwoCRV7CT2CJTWq` — excluded from leaderboards and allocations.

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
- **Referral links:** Swyftx, Coinbase, CoinSpot, Tokocrypto (defined in `src/constants/addresses.ts`)

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
│  Tabs: Chart, Positions, Orders, Trades, Strategy, AI   │
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
│  GET  /api/perp/positions — Open positions               │
│  GET  /api/perp/account — Account info + equity          │
│  GET  /api/perp/pending-orders — Pending orders          │
│  GET  /api/perp/position-summary — Core/satellite stats  │
│  GET  /api/perp/funding-summary — Funding rate analysis  │
│  GET  /api/perp/reentry-candidates — Re-entry signals    │
├─────────────────────────────────────────────────────────┤
│  ENGINE: api/perp_engine.py                              │
│  Position lifecycle, PnL, liquidation, fees, equity,     │
│  pending orders, pyramiding, partial close, flip,        │
│  position types, funding analysis, re-entry candidates   │
├─────────────────────────────────────────────────────────┤
│  CRON: api/perp-cron.py (every 1 minute)                │
│  Fetch CoinGecko prices → check pending orders →         │
│  update positions → check SL/TP/liquidation/trailing →   │
│  auto-close → run auto-trader strategies → equity snap   │
├─────────────────────────────────────────────────────────┤
│  STRATEGIES: api/perp_strategies.py                      │
│  4 strategies: Trend Following, Mean Reversion,          │
│  Momentum Breakout, Scalping (disabled by default)       │
│  ATR-based SL/TP, Kelly sizing, correlation guard,       │
│  drawdown protection, 2hr cooldown                       │
├─────────────────────────────────────────────────────────┤
│  ADVANCED STRATEGIES (standalone):                       │
│  api/perp_ninja_strategy.py — Ninja Ambush (confluence)  │
│  api/perp_grid_strategy.py — Grid Trading (ATR-based)    │
│  api/perp_backtest.py — Backtesting engine                │
├─────────────────────────────────────────────────────────┤
│  DB Collections: perp_accounts, perp_positions,          │
│  perp_orders, perp_trades, perp_equity, perp_funding,    │
│  perp_price_history, perp_strategy_config,               │
│  perp_strategy_signals, perp_pending_orders              │
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
OPEN_CLOSE_FEE_PCT = 0.0006     # 0.06%
BORROW_FEE_PCT_HR = 0.0001      # 0.01%/hr
MAINTENANCE_MARGIN_PCT = 0.05   # 5% base (scaled down for high leverage)
MAX_LEVERAGE = 50
MAX_OPEN_POSITIONS = 5
MAX_POSITION_PCT = 0.50          # Max 50% equity per position
DAILY_LOSS_LIMIT_PCT = 0.20     # 20% daily loss → pause trading
```

### Auto-Trader Strategies (perp_strategies.py)
| Strategy | Signal | Leverage | SL (ATR mult) | TP (ATR mult) | Trailing Stop | Default |
|----------|--------|----------|---------------|---------------|---------------|---------|
| Trend Following | EMA 9/21 crossover + RSI 30/70 | 3x | 2.0 | 8.0 | 1.5% | Enabled |
| Mean Reversion | Bollinger Band bounce + RSI 30/70 | 3x | 1.5 | 3.0 | 1.0% | Enabled |
| Momentum | Price breakout above/below range | 3x | 2.5 | 10.0 | 2.0% | Enabled |
| Scalping | RSI extremes + EMA slope | 3x | 1.5 | 2.5 | 0.8% | **Disabled** |

- ATR is 1-minute data scaled by `sqrt(60)` to approximate 1-hour ATR (wider stops that survive normal price noise)
- **50-period EMA trend filter** on trend following, momentum, scalping — longs require price above 50 EMA, shorts below. **Mean reversion has NO trend filter** (it contradicted the strategy by blocking buying dips).
- **Profit-activated trailing stops** — trail does NOT start from entry. It activates only after price moves favorably by the trailing %. E.g. 1.5% trail on a long activates at +1.5% profit, then ratchets up from there. Until activation, only the fixed SL protects the downside.
- Trend following and momentum use wide TP (8-10x ATR) so the trailing stop is the primary exit, letting winners run.
- Position sizing: 1.5% equity risk per trade, capped at 10% equity × leverage
- **Cooldown: 2 hours** per market between auto trades (was 30 min — overtrading was destroying returns)
- **Correlation guard:** Max 1 position across correlated group (BTC, ETH, SOL)
- **Drawdown protection:** Half-size at 5% drawdown, stop trading at 10% drawdown
- RSI thresholds tightened to 30/70 (was 35/65) to reduce false signals
- Historical candles seeded from Binance public API (eliminates cold-start)

### Advanced Position Management (perp_engine.py)
- **Partial Close** — Close 1-99% of a position; updates remaining size/margin, credits account
- **Pyramiding** — Add to winning positions (positive P&L required, max 3 levels, each level 50% of previous size)
- **Position Flipping** — Close position and immediately open opposite direction, mirroring SL/TP distances
- **Core/Satellite Tracking** — Tag positions as "core" (long-term conviction) or "satellite" (tactical), with separate P&L summary
- **Pending Orders** — Limit and stop orders with trigger price, SL/TP, optional expiry. Checked every minute by cron, executed automatically when trigger price is hit.
- **Funding Rate Analysis** — Per-position funding cost breakdown (hourly/daily, % of P&L)
- **Re-entry Candidates** — Finds recent profitable trailing stop exits with 0.5-3% pullback from exit price

### Advanced Strategy Files (standalone, not yet integrated into cron)
- **perp_ninja_strategy.py** — Ninja Ambush strategy: swing high/low detection, Bollinger Band extremes, session levels, round numbers, liquidity sweeps, confluence scoring
- **perp_grid_strategy.py** — Grid Trading: ATR-based grid spacing, optional martingale position sizing, auto-rebalancing
- **perp_backtest.py** — Backtesting engine: historical simulation with realistic fees, calculates Sharpe ratio, profit factor, max drawdown, win rate

### Trigger Execution (perp-cron.py → perp_engine.py)
Checked every minute in priority order (independent checks, not elif):
1. **Liquidation** — mark_price crosses liquidation price
2. **Stop Loss** — mark_price crosses SL level
3. **Take Profit** — mark_price crosses TP level
4. **Trailing Stop** — mark_price crosses trailing stop price (ratchets on favorable moves)

### Live Trading (FUTURE — not yet active)
- `perp_exchange.py` has Drift Protocol integration (Solana-native)
- All Drift imports are lazy (`if is_live:` guards) — won't crash without deps
- Drift deps (`driftpy`, `solana`, `solders`, `anchorpy`) removed from requirements.txt — they exceed Vercel's 500MB Lambda limit
- **When ready:** will need separate deployment strategy (e.g., dedicated VM, Railway, or Vercel split functions)
- Live mode has extra safety: kill switch, max $500 position, max 3 positions, exchange reconciliation

---

## 12. Recent Changes (as of March 13, 2026)

### Core Trading System (earlier)
- **Full perpetual paper trading system** — 10 markets, 4 auto-trading strategies, real-time Binance WebSocket charts
- **Critical bug fix: TP never triggered when SL was set** — `elif` chain in trigger checks meant a set-but-not-hit SL blocked TP evaluation entirely. Changed to independent `if not action` checks.
- **Critical bug fix: Liquidation formula broken for >20x leverage** — 5% maintenance margin exceeded initial margin at high leverage (e.g., 50x long had liq price ABOVE entry → immediate liquidation). Fixed with scaled maintenance margin: `min(5%, 50%/leverage)`.
- **SL/TP validation added** — `open_position()` and `modify_position()` now reject invalid SL/TP (e.g., long SL above entry, short TP above entry).
- **Daily loss limit now scales with equity** — was fixed at 20% of $10K regardless of account growth.
- **ATR scaling widened from sqrt(15) to sqrt(60)** — 1-min ATR was too small (~0.4% SL), causing every trade to stop out on normal noise. Now approximates 1-hour ATR for meaningful stop distances.
- **50-period EMA trend filter added** — All 4 strategies now check that trade direction aligns with the higher-timeframe trend. Prevents shorting into rallies and longing into dumps.
- **Profit-activated trailing stops** — Trailing stop no longer starts from entry (which made it a tighter SL than the ATR-based one). Now activates only after price moves favorably by the trailing %, then ratchets from the high-water mark. This lets winners run while locking in profit.
- **TP widened for trailing stop strategies** — Trend following TP: 4x→8x ATR. Momentum TP: 5x→10x ATR. The trailing stop is now the primary exit for these strategies, with TP as a distant backstop.
- **Mean reversion gets trailing stop** — Added 1.0% trailing to lock in Bollinger Band bounce profits.
- **Drift Protocol deps removed** from requirements.txt to fix Vercel deploy (661MB exceeded 500MB limit). Paper trading unaffected.
- Added Vercel Analytics (`@vercel/analytics/react`)
- Added date/time stamps to trade log entries
- Added Dependabot, ErrorBoundary, TanStack Query caching
- Enhanced Telegram bot with interactive menus, AI Q&A, and moderation

### Strategy Overhaul (latest session)
- **Cooldown increased to 2 hours** (was 30 min) — overtrading with no edge was destroying returns
- **Scalping disabled by default** — 1-min candle noise made it unprofitable
- **RSI thresholds tightened to 30/70** (was 35/65) — fewer but higher quality signals
- **Leverage reduced to 3x** across all strategies (was 5x) — lower risk
- **Trailing stop widened to 1.5%** on trend following (was 0.8%) — stop clipping winners
- **Mean reversion trend filter REMOVED** — it was blocking the strategy from buying dips below EMA (contradicted the whole point of mean reversion)
- **Correlation guard added** — max 1 position across BTC/ETH/SOL group to prevent correlated exposure
- **Drawdown protection** — half-size at 5% drawdown from equity peak, stop trading at 10% drawdown

### Advanced Position Management (latest session)
- **Partial close** — Close 1-99% of a position, updates remaining size/margin
- **Pyramiding** — Add to winning positions (max 3 levels, 50% size decrease per level)
- **Position flipping** — Close + reverse direction in one operation, mirrors SL/TP distances
- **Core/satellite position types** — Tag positions with type, get separate P&L summary
- **Pending orders (limit/stop)** — Full order system with trigger prices, SL/TP, expiry. Cron checks every minute. Full UI in PerpPendingOrders.tsx component.
- **Funding rate analysis** — Per-position funding cost breakdown
- **Re-entry candidates** — Detects recent profitable trailing stop exits with 0.5-3% pullback

### Mobile Charts Fix (latest session)
- **MobileAreaChart.tsx** — Pure SVG area chart for iOS Safari (lightweight-charts canvas fails on mobile due to height collapse + WebGL issues)
- **DashboardCharts.tsx** — Auto-detects mobile via user agent + viewport width, switches between TradingChart (desktop) and MobileAreaChart (mobile)
- **TradingChart.tsx** — Added explicit `height` + `minHeight` style to prevent iOS container collapse

### Strategy Documentation UI
- **PerpStrategyPanel.tsx** — Each strategy card has expandable "How?" section showing: how it works, entry signal, exit strategy, risk management, best market conditions

### Restored Strategy Files
- **perp_ninja_strategy.py** — Ninja Ambush strategy (confluence-based entries)
- **perp_grid_strategy.py** — ATR-based grid trading with optional martingale
- **perp_backtest.py** — Backtesting engine with Sharpe ratio, profit factor, max drawdown

---

## 13. Known Tech Debt & Considerations

1. **`executeDeposit` in useTrading.ts is a mock** — returns fake tx ID with `setTimeout`. Real deposits go through `depositService.ts`.
2. **Trade log field inconsistency** — `timestamp` (server/API) vs `time` (client autoTrader.ts). View now handles both but root cause should be unified.
3. **Bundle size warning** — Main chunk >500KB. Could benefit from more aggressive code splitting or `manualChunks` in Vite config.
4. **No automated tests for frontend** — Only Python tests exist (`npm run test` runs pytest).
5. **Legacy DB name "flub"** — Consider migrating to "budju" for clarity.
6. **Google Analytics + Vercel Analytics** — Both are now active. Consider consolidating to just Vercel Analytics.
7. **React 19 strict mode not enabled** — `main.tsx` uses `createRoot` without `<StrictMode>`.
8. **tokenService.ts (940 lines)** — Large utility file in `src/lib/utils/` that could be broken up.
9. **window.solana / window.solflare globals** — Direct wallet provider access alongside adapter pattern. Works but fragile.
10. **No TypeScript on Python API** — Python endpoints lack type hints in some handler functions.
11. **Drift Protocol live trading blocked by Vercel limits** — deps are 661MB vs 500MB limit. Needs separate infra (VM, Railway, or split Vercel functions).
12. **Cron-based trigger monitoring (1-min interval)** — Price can gap past SL/TP between ticks. Inherent limitation of polling architecture.
13. **No client-side SL/TP pre-validation** — Server rejects invalid values but frontend doesn't show inline errors before submission.
14. **Trailing stop activation stored as price level** — `trailing_stop_activation` field on position doc. Existing positions opened before this change won't have it (they'll have `trailing_stop_price` set from entry — old behavior still works, just not profit-gated).
15. **Ninja/Grid/Backtest strategies not integrated into cron** — Standalone files restored from previous branch but not yet wired into `perp-cron.py` or the strategy config UI. Need integration work to enable via the strategy panel.
16. **Pending orders UI lacks real-time price updates for all markets** — Uses Binance WebSocket for the selected symbol only. Other orders show stale distance calculations until their symbol is selected.

---

*Last updated: March 13, 2026.*
