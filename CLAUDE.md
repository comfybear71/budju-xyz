# CLAUDE.md — BUDJU Project Context

## What This Project Is

BUDJU is a Solana meme coin ecosystem with a website, automated trading platform, and Telegram community bot. Live at https://budju.xyz. Token: `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump`, 1B total supply, 6 decimals. Created January 31, 2025. ~63,000 lines of code across ~181 source files.

## Architecture

- **Frontend:** React 19 SPA built with Vite 6, TypeScript, Tailwind CSS 4. NOT Next.js — this is a Vite SPA with client-side routing via react-router-dom v7.
- **Backend:** Vercel serverless functions — Python (15 files: `api/index.py`, `api/database.py`, `api/auto-trade-cron.py`, `api/perp-cron.py`, `api/perp_engine.py`, `api/perp_strategies.py`, `api/perp_pending_orders.py`, `api/perp_exchange.py`, `api/perp_position_manager.py`, `api/perp_backtest.py`, `api/perp_bb_squeeze.py`, `api/perp_grid_strategy.py`, `api/perp_hf_scalper.py`, `api/perp_keltner.py`, `api/perp_ninja_strategy.py`, `api/perp_sr_reversal.py`, `api/perp_zone_recovery.py`) and TypeScript (10 files: `api/telegram.ts`, `api/telegram-cron.ts`, `api/proxy.ts`, `api/jupiter.ts`, `api/rpc.ts`, `api/marketing.ts`, `api/binance.ts`, `api/klines.ts`, `api/vps-proxy.ts`).
- **Database:** MongoDB Atlas (DB name: `flub` — legacy). 22 collections total (see below).
- **VPS Bot:** Standalone DigitalOcean VPS trading bot in `vps/` — monitors 16 Solana tokens via Jupiter Price API, executes on-chain via Jupiter DEX.
- **Deployment:** Vercel. Cron jobs defined in `vercel.json`.

## Key Directories

- `src/features/` — 14 feature modules: home, trade, bank, burn, swap, pool, nft, shop, tokenomics, balance, how-to-buy, marketing, spot, not-found
- `src/components/common/` — Shared components (Layout/Navbar/Footer, WalletConnect, Button, PriceChart, TokenStats, RecentTrades, CopyToClipboard, ScrollingBanner, Web3Background, ErrorBoundary)
- `src/hooks/` — useWallet, useTrading, useTokenHolders, useQueries, useLivePrices
- `src/lib/services/` — walletService, bankApi, chartApi, depositService, tokenRegistry, binanceWs, preferencesApi
- `src/lib/web3/` — connection.ts (Solana wallet integration)
- `src/lib/utils/` — tokenService.ts, animation.ts
- `src/constants/` — config.ts, routes.ts, addresses.ts
- `src/context/` — ThemeContext.tsx (dark/light mode)
- `src/types/` — global.d.ts, gtag.d.ts
- `api/` — All serverless functions (26 files)
- `vps/` — Standalone VPS trading bot (8 files)
- `tests/` — Python tests (test_auth.py, test_circuit_breakers.py, test_pool_math.py)

## Build & Run

```bash
npm run dev       # Vite dev server on localhost:5173
npm run build     # Production build to dist/
npm run lint      # ESLint
npm run test      # Python pytest tests/ -v
npm run test:quick # Python pytest tests/ -q
```

## MongoDB Collections (22 total)

### Core Platform
| Collection | Purpose |
|-----------|---------|
| `users` | User accounts, shares, allocations, holdings |
| `trades` | Pool trading history with user allocations |
| `deposits` | Deposits with share issuance |
| `withdrawals` | Withdrawals |
| `trader_state` | Auto-trade state (targets, cooldowns, tier settings) |
| `pool_state` | Global pool metadata (totalShares, initialized) |
| `user_preferences` | Per-wallet UI preferences (theme, cart) |

### Perpetual Trading
| Collection | Purpose |
|-----------|---------|
| `perp_accounts` | Account state, balance, equity, trading mode |
| `perp_positions` | Open/closed positions with entry/exit, PnL |
| `perp_orders` | Order history |
| `perp_trades` | Closed trades with P&L |
| `perp_equity` | Equity snapshots over time |
| `perp_funding` | Funding rate history |
| `perp_price_history` | 15-min candles for indicator calculations |
| `perp_strategy_config` | Per-wallet strategy settings |
| `perp_strategy_signals` | Signal history for debugging |
| `perp_pending_orders` | Pending limit/stop orders |
| `perp_position_mgmt` | Pyramiding/re-entry state |
| `perp_reentry_queue` | Positions waiting for re-entry |
| `perp_flip_log` | Position flip audit log |
| `perp_grid_state` | Grid strategy state |
| `perp_zone_state` | Zone recovery state |

## Important Patterns

- **Wallet integration:** Uses @solana/wallet-adapter-react + @wallet-standard/app. Custom `WalletConnect` component (not wallet-adapter-react-ui). The `useWallet` hook in `src/hooks/useWallet.tsx` provides wallet context. Supports Phantom, Solflare, Jupiter wallets.
- **TypeScript path aliases:** `@/*` maps to `src/*`, plus `@components/*`, `@features/*`, `@hooks/*`, `@lib/*`, `@styles/*`, `@assets/*`, `@constants/*`, `@types/*` (configured in tsconfig.app.json).
- **Theme:** Custom BUDJU colors — `budju-pink` (#FF69B4), `budju-blue` (#87CEFA), `budju-yellow` (#FFD700). Custom border radius `budju: 15px`, `budju-lg: 25px`. Fonts: Poppins (sans), Montserrat (display), Roboto Mono (mono). Configured in tailwind.config.ts.
- **SPA routing:** All routes handled client-side via react-router-dom. The vercel.json catch-all rewrite `/(.*) → /index.html` enables this. All page routes are lazy-loaded with Suspense.
- **Provider stack:** QueryClientProvider > BrowserRouter > ThemeProvider > WalletProvider > ErrorBoundary > Suspense > Layout > Routes. Plus Vercel Analytics.
- **API authentication:** Admin endpoints previously used Ed25519 signature verification — this was removed in March 2026 to simplify. Rate limiting: 30 req/min read, 10 req/min write on main API; 60 req/min on RPC; 20 req/min on Jupiter.
- **Auto-trader (Spot):** Server-side cron (`api/auto-trade-cron.py`) runs every 5 min, monitors 25+ assets via CoinGecko, executes on Swyftx. Client-side component in `src/features/trade/services/autoTrader.ts`. Tier-based settings (T1, T2, T3) with per-coin buy/sell targets.
- **Telegram bot:** Webhook handler in `api/telegram.ts`, scheduled messages in `api/telegram-cron.ts` (4x daily at 0/6/12/18 UTC). Bot has AI Q&A via Claude Haiku, auto-moderation, interactive menus. Auto re-registers webhook every cron run.
- **Share-based pool accounting:** NAV = totalPoolValue / totalShares. Users get shares proportional to deposits.
- **Real-time prices:** Binance WebSocket singleton (`binanceWs.ts`) with 3 fallback endpoints (stream.binance.com → data-stream.binance.com → stream.binance.us). 60+ assets tracked.
- **Chart data:** `/api/klines` proxy with cascade: Binance.US → OKX → Binance Global. Named `/api/klines` (not `/api/binance`) to avoid iPhone content blocker pattern-matching.

## Environment Variables

```
# Database
MONGODB_URI          # MongoDB Atlas connection string
DB_NAME=flub         # Database name (legacy "flub")

# Admin
ADMIN_WALLETS        # Comma-separated admin wallet addresses

# Trading (Swyftx - spot)
SWYFTX_API_KEY       # Exchange API key
TRADING_ENABLED      # Kill switch (default: true)
DRY_RUN              # Simulate mode (default: false)
MAX_SINGLE_TRADE_USDC
MAX_DAILY_TRADES
MAX_DAILY_LOSS_USDC

# Solana
HELIUS_API_KEY       # RPC provider

# Telegram
TELEGRAM_BOT_TOKEN   # Bot token

# AI
ANTHROPIC_API_KEY    # Claude Haiku for bot Q&A

# Vercel
BLOB_READ_WRITE_TOKEN # Marketing assets
CRON_SECRET          # Cron job auth

# Jupiter
JUPITER_API_KEY      # Paid Jupiter API (optional, falls back to free)

# Drift Protocol (live perps - future)
DRIFT_PRIVATE_KEY    # Base58 wallet key
DRIFT_RPC_URL        # Or uses HELIUS_API_KEY
DRIFT_SUBACCOUNT     # Default: 0
DRIFT_DEVNET         # true for devnet

# VPS Bot
VPS_API_URL          # VPS API base URL
VPS_API_SECRET       # Bearer token for VPS API

# Frontend (VITE_ prefix)
VITE_ENVIRONMENT
VITE_PUBLIC_URL
VITE_ANALYTICS_ID    # Google Analytics
```

## Perps Trading System

Paper trading perpetual futures with $10K virtual USDC. Supports 10 markets (SOL, BTC, ETH, DOGE, AVAX, LINK, SUI, RENDER, JUP, WIF) with up to 50x leverage.

### Core Files
- **Engine:** `api/perp_engine.py` — position lifecycle, PnL, liquidation, fees, partial close, pyramiding, flipping, core/satellite, pending orders
- **Strategies:** `api/perp_strategies.py` — 10 strategies total (6 in main loop + 4 separate runners)
- **Cron:** `api/perp-cron.py` — runs every 1 minute, fetches CoinGecko prices, seeds Binance historical candles, updates positions, checks SL/TP/liquidation/trailing, runs auto-trader strategies, snapshots equity, sends Telegram alerts
- **Pending Orders:** `api/perp_pending_orders.py` — limit/stop order system (limit_buy, limit_sell, buy_stop, sell_stop), 24h expiry
- **Position Manager:** `api/perp_position_manager.py` — pyramiding, re-entry, funding analysis, position flipping, core/satellite
- **Exchange Adapter:** `api/perp_exchange.py` — Drift Protocol integration for future live trading (lazy imports, not active)
- **Backtest:** `api/perp_backtest.py` — backtesting engine using same strategy functions as live

### Strategy Files
- `api/perp_strategies.py` — Core 6: trend following, mean reversion, momentum, scalping, keltner, bb_squeeze
- `api/perp_ninja_strategy.py` — Ninja Ambush (confluence-based pending orders at key levels)
- `api/perp_grid_strategy.py` — Grid Trading (ATR-based grid with smooth martingale)
- `api/perp_zone_recovery.py` — Zone Recovery (hedge recovery with escalating lots)
- `api/perp_hf_scalper.py` — HF Scalper (high-frequency across all markets)
- `api/perp_keltner.py` — Keltner Channel indicator calculations
- `api/perp_bb_squeeze.py` — BB Squeeze detection
- `api/perp_sr_reversal.py` — Support/Resistance reversal

### All 10 Strategies

| # | Strategy | Default | Leverage | Cooldown | Notes |
|---|----------|---------|----------|----------|-------|
| 1 | Trend Following | ON | 5x | 2hr | EMA 9/21 cross + RSI |
| 2 | Mean Reversion | ON | 3x | 2hr | BB bounce + RSI 30/70 (no trend filter) |
| 3 | Momentum | ON | 5x | 2hr | Breakout + range expansion |
| 4 | Scalping | OFF | 3x | 2hr | RSI(5) + EMA slope (noisy on 1-min) |
| 5 | Keltner Channel | OFF | 3x | 2hr | MR + squeeze breakout auto-mode |
| 6 | BB Squeeze | OFF | 4x | 2hr | Squeeze release + momentum |
| 7 | Ninja Ambush | OFF | 2x | N/A | Confluence pending orders |
| 8 | Grid Trading | OFF | 2x | 1hr | ATR grid + smooth martingale |
| 9 | Zone Recovery | OFF | 3x | 2hr | Hedge recovery + escalating lots |
| 10 | HF Scalper | OFF | 5x | 5min | 4 fast signals, all markets |

### Charts Frontend
- **TradingChart.tsx** — lightweight-charts with Binance WebSocket, AI predictions, position overlays, strategy labels
- **DashboardCharts.tsx** — 6-chart grid (desktop) / 4-chart (mobile), LazyChart with IntersectionObserver
- **MobileAreaChart.tsx** — standalone SVG chart (exists but not used by dashboard)

### Key Engine Constants
```python
INITIAL_BALANCE = 10_000.0      # $10K USDC starting
MAX_LEVERAGE = 50
MAX_POSITIONS_PER_SIDE = 5      # 5 longs + 5 shorts per symbol
MAX_OPEN_POSITIONS = 50         # Soft global cap
MAX_POSITION_PCT = 0.50         # 50% equity per position max
DAILY_LOSS_LIMIT_PCT = 0.20     # 20% daily loss → pause
MAX_PENDING_ORDERS = 30
```

### Fee Model (mirrors Jupiter Perps)
- Open/close: 0.06% of position size
- Borrow fee: 0.01%/hr
- Slippage: 0.05-0.15% simulated based on size
- Liquidation: scaled MM = min(5%, 50%/leverage)

### Meta-Features
- **Equity Curve Trading** — EMA of equity curve; reduces sizing during cold streaks
- **50-period EMA Trend Filter** — Applied to trend/momentum/scalping (mean reversion exempted)
- **Drawdown Protection** — Half-size at 5% drawdown, stop at 10%
- **Correlation Guard** — Max 1 position across BTC/ETH/SOL group (HF Scalper exempted)
- **Historical Seeding** — Price history auto-seeded from Binance to eliminate cold-start

## Cron Jobs (vercel.json)

| Cron | File | Schedule |
|------|------|----------|
| Perp monitor | `api/perp-cron.py` | `* * * * *` (every 1 min) |
| Auto-trade (spot) | `api/auto-trade-cron.py` | `*/5 * * * *` (every 5 min) |
| Telegram messages | `api/telegram-cron.ts` | `0 0,6,12,18 * * *` (4x daily) |

## External Integrations

| Service | Files | Purpose |
|---------|-------|---------|
| Swyftx | proxy.ts, auto-trade-cron.py | Spot portfolio & orders |
| CoinGecko | auto-trade-cron.py, perp-cron.py | Asset prices |
| Binance | binance.ts, klines.ts, binanceWs.ts | Historical klines + WebSocket prices |
| OKX | klines.ts | Klines fallback |
| Jupiter | jupiter.ts | Swap quotes & execution |
| Helius | rpc.ts | Solana RPC |
| DexScreener | telegram.ts | Token price data |
| GeckoTerminal | telegram.ts, chartApi.ts | Token price + OHLCV |
| Drift Protocol | perp_exchange.py | Live perps (future, not active) |
| Telegram Bot API | telegram.ts, telegram-cron.ts, perp-cron.py | Messaging |
| Anthropic Claude | telegram.ts | AI Q&A in bot |
| Vercel Blob | marketing.ts, telegram.ts | Marketing assets |

## VPS Trading Bot

Standalone bot on DigitalOcean ($4-5/mo, Ubuntu 24.04). Monitors 16 Solana tokens via Jupiter Price API v3, executes on-chain via Jupiter DEX. Runs as `budju-trader` systemd service on port 8420.

Files in `vps/`: main.py, config.py, price_monitor.py, trader.py, api_server.py, requirements.txt, setup-vps.sh.

Frontend communicates via `api/vps-proxy.ts` which forwards HTTPS requests to VPS HTTP API.

## Lessons Learned (Trading Strategy)

Discovered through live paper trading (March 13-14, 2026). Critical for strategy work:

1. **1-minute candles are pure noise for indicators.** EMA crossovers, RSI, and BB on 1-min data fire constantly with no predictive edge. The "50-period EMA trend filter" was only 50 MINUTES — not a real trend. Indicators should use 15m or 1h data.
2. **Trailing stop activation must be wider than trail distance.** If both are 0.8%, the trail activates and immediately the stop is at breakeven. Winners exit for $0 minus fees. Fix: activate at 3-4%, trail at 2-2.5%.
3. **Mean reversion must NOT use trend filter.** It's designed to buy dips (price below EMA) and sell rallies (price above EMA). The trend filter blocks the exact entries it needs. Removed.
4. **Scalping on 1-min data = fee bleed.** 6 loose entry signals x 0.3% round-trip fee = guaranteed slow equity drain. Disabled. If re-enabled, need extreme RSI thresholds (25/75) and only 2 entry signals.
5. **Correlated exposure kills.** BTC/ETH/SOL move together. 3 long positions = 3x the same bet. One dump = triple stop-out. Added correlation groups with max 1 position per group.
6. **15-minute cooldown is death spiral.** Stop out, re-enter same chop 15 min later, stop again. Changed to 2 hours.
7. **Drawdown protection is essential.** Half position size at 5% drawdown, stop trading at 10%. Without this, the system keeps bleeding at full speed.
8. **"Relaxed" entry conditions = random entry + fees.** Every "relaxation" (don't require crossover, RSI +/-10 tolerance, 20% BB tolerance) destroyed the signal quality. Tighter is better.
9. **Leverage kills more than it helps.** 5x leverage means a 0.8% adverse move = 4% loss on margin. Reduced to 2-3x across all strategies.
10. **Pre-placed limit orders > reactive market orders.** Market orders chase price. Limit orders at key levels (support, BB bands, order blocks) catch moves with better entries and maker rebates.

## Lessons Learned (Frontend/Charts)

1. **iOS Safari: canvas containers collapse to 0 height.** Lightweight-charts uses absolute positioning inside its container. Must set explicit height/minHeight on a wrapper div. Also `clientWidth` can be 0 before layout — need fallback chain.
2. **iOS Safari WebSocket limit: ~6 concurrent.** The 6-chart grid view hits this limit. Added lazy loading with IntersectionObserver and capped mobile to 4 charts.
3. **Chart axis labels clutter.** Hide `axisLabelVisible` on position lines (SL/TP/liquidation). Only show current price and prediction price on the axis. Position info is already on the lines themselves.
4. **AI entry zone lines should always be visible.** Both LONG and SHORT target lines stay bright and bold regardless of ready/blocked state — the AI knows where it plans to trade ahead of time.
5. **Never conditionally swap TradingChart for MobileAreaChart in DashboardCharts.** Multiple attempts to do this broke desktop charts. The LazyChart + TradingChart pattern works on all devices. Period.
6. **iPhone content blockers block URLs containing "binance".** Both `api.binance.com` AND paths like `/api/binance` get blocked. Solution: proxy renamed to `/api/klines`.
7. **Binance Global returns HTTP 451 from US IPs.** Affects Vercel servers (US region) and users with US VPN. TradingChart tries `/api/klines` proxy first, then direct Binance as fallback.

## Lessons Learned (Failed Features)

1. **Accumulation sparkline charts on holdings cards — FAILED & REVERTED (March 25, 2026).** 7 commits, all reverted. The MongoDB `trades` collection is EMPTY — trades are done directly on Swyftx, not recorded in MongoDB. The `/api/accumulation` endpoint returns `{}`. Do NOT attempt to build charts from this endpoint. Trade history IS available via `fetchSwyftxOrderHistory()` in `tradeApi.ts` (hits Swyftx API), but any chart implementation needs: (a) verify data exists FIRST before building UI, (b) proper sizing/design — 20px was too small, 40px was too dominant, absolute-positioned background overlays are invisible, (c) don't make 7 incremental "let me try this" commits.
2. **The `trades` collection in MongoDB is empty.** All spot trading was done directly on Swyftx. Holdings data comes from Swyftx `/user/balance/` API via the `/portfolio/` proxy handler in `proxy.ts`. If you need trade history, use `fetchSwyftxOrderHistory()` which calls Swyftx `/orders/?limit=N` and filters for filled orders (status=4).

## Gotchas

- The `vercel.json` has no-cache headers on all routes — intentional to ensure fresh deploys.
- The Telegram cron auto-re-registers the webhook at every run to prevent silent failures.
- Auto-trade cron uses a device heartbeat to prevent conflicts between browser-initiated and cron-initiated trades.
- Database name defaults to "flub" (legacy name from earlier project iteration).
- CORS is restricted to budju.xyz, www.budju.xyz, and localhost in production.
- Trailing stop has separate `trailing_activation_pct` and `trailing_stop_pct` — activation must be wider.
- Strategy config stored per-wallet in `perp_strategy_config` collection. Changing DEFAULT_STRATEGIES only affects new accounts. `get_strategy_config()` auto-merges new strategies into existing configs.
- Admin wallet default: `AEWvE2xXaHSGdGCaCArb2PWdKS7K9RwoCRV7CT2CJTWq` — excluded from leaderboards and allocations.
- Trade log field naming: server-side uses `timestamp`, client-side autoTrader.ts uses `time`. Views check both.
- Swyftx token is cached 50 minutes in proxy.ts warm instances.
- `executeDeposit` in useTrading.ts is a mock — returns fake tx ID. Real deposits use depositService.ts.
- TP exits fill at TP target price (like limit order), SL exits at SL target price. Only market/manual/trailing exits apply slippage.
- Drift Protocol live trading deps exceed Vercel 500MB Lambda limit — needs separate infra if activated.
- Perp cron-based monitoring has 1-min intervals — price can gap past SL/TP between ticks.
