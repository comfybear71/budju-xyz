# CLAUDE.md — BUDJU Project Context

## What This Project Is

BUDJU is a Solana meme coin ecosystem with a website, automated trading platform, and Telegram community bot. Live at https://budju.xyz. Token: `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump`, 1B total supply, 6 decimals.

## Architecture

- **Frontend:** React 19 SPA built with Vite 6, TypeScript, Tailwind CSS 4. NOT Next.js — this is a Vite SPA with client-side routing via react-router-dom.
- **Backend:** Vercel serverless functions — Python (`api/index.py`, `api/database.py`, `api/auto-trade-cron.py`) and TypeScript (`api/telegram.ts`, `api/telegram-cron.ts`, `api/proxy.ts`, `api/jupiter.ts`, `api/rpc.ts`, `api/marketing.ts`).
- **Database:** MongoDB Atlas. Collections: `users`, `trades`, `deposits`, `withdrawals`, `trader_state`, `pool_state`.
- **Deployment:** Vercel. Cron jobs defined in `vercel.json`.

## Key Directories

- `src/features/` — Each page is a feature module (home, trade, bank, burn, swap, pool, nft, shop, tokenomics, balance, how-to-buy, marketing)
- `src/components/common/` — Shared components (Layout/Navbar/Footer, WalletConnect, PriceChart, TokenStats, etc.)
- `src/hooks/` — useWallet (wallet context), useTrading, useTokenHolders
- `src/lib/` — web3 connection, services (walletService, bankApi, chartApi, depositService, tokenRegistry)
- `src/constants/` — config.ts (app config, social links, roadmap), routes.ts, addresses.ts
- `api/` — All serverless functions

## Build & Run

```bash
npm run dev     # Vite dev server on localhost:5173
npm run build   # Production build to dist/
npm run lint    # ESLint
```

## Important Patterns

- **Wallet integration:** Uses @solana/wallet-adapter-react. The `useWallet` hook in `src/hooks/useWallet.tsx` provides wallet context.
- **TypeScript path aliases:** `@/*` maps to `src/*`, plus `@components/*`, `@features/*`, `@hooks/*`, `@lib/*`, `@styles/*`, `@constants/*`, `@types/*` (configured in tsconfig.app.json).
- **Theme:** Custom BUDJU colors — `budju-pink` (#FF69B4), `budju-blue` (#87CEFA), `budju-yellow` (#FFD700). Custom border radius `budju: 15px`. Configured in tailwind.config.ts.
- **SPA routing:** All routes handled client-side via react-router-dom. The vercel.json catch-all rewrite `/(.*) → /index.html` enables this.
- **API authentication:** Admin endpoints use Ed25519 signature verification. Rate limiting: 30 req/min read, 10 req/min write.
- **Auto-trader:** Server-side cron (`api/auto-trade-cron.py`) runs every 5 min, monitors 25+ assets via CoinGecko, executes on Swyftx. Client-side component in `src/features/trade/services/autoTrader.ts`.
- **Telegram bot:** Webhook handler in `api/telegram.ts`, scheduled messages in `api/telegram-cron.ts`. Bot has AI Q&A via Claude Haiku, auto-moderation, interactive menus.
- **Share-based pool accounting:** NAV = totalPoolValue / totalShares. Users get shares proportional to deposits.

## Environment Variables

Critical ones: `TELEGRAM_BOT_TOKEN`, `HELIUS_API_KEY`, `MONGODB_URI`, `DB_NAME`, `ADMIN_WALLETS`, `SWYFTX_API_KEY`, `ANTHROPIC_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`. Frontend uses `VITE_` prefix vars.

## Perps Trading System

- **Engine:** `api/perp_engine.py` — position lifecycle, PnL, liquidation, fees
- **Strategies:** `api/perp_strategies.py` — 4 strategies (trend following, mean reversion, momentum, scalping)
- **Cron:** `api/perp-cron.py` — runs every 1 minute, updates positions, checks SL/TP/liquidation/trailing, runs auto-trader
- **Pending Orders:** `api/perp_pending_orders.py` — limit/stop order system (limit_buy, limit_sell, buy_stop, sell_stop)
- **Charts:** `src/features/trade/components/perps/TradingChart.tsx` — lightweight-charts with Binance WebSocket
- **Dashboard:** `src/features/trade/components/perps/DashboardCharts.tsx` — 6-chart grid view

## Lessons Learned (Trading Strategy)

These were discovered through live paper trading (March 13-14, 2026). Critical for anyone working on the strategies:

1. **1-minute candles are pure noise for indicators.** EMA crossovers, RSI, and BB on 1-min data fire constantly with no predictive edge. The "50-period EMA trend filter" was only 50 MINUTES — not a real trend. Indicators should use 15m or 1h data.
2. **Trailing stop activation must be wider than trail distance.** If both are 0.8%, the trail activates and immediately the stop is at breakeven. Winners exit for $0 minus fees. Fix: activate at 3-4%, trail at 2-2.5%.
3. **Mean reversion must NOT use trend filter.** It's designed to buy dips (price below EMA) and sell rallies (price above EMA). The trend filter blocks the exact entries it needs. Removed.
4. **Scalping on 1-min data = fee bleed.** 6 loose entry signals × 0.3% round-trip fee = guaranteed slow equity drain. Disabled. If re-enabled, need extreme RSI thresholds (25/75) and only 2 entry signals.
5. **Correlated exposure kills.** BTC/ETH/SOL move together. 3 long positions = 3x the same bet. One dump = triple stop-out. Added correlation groups with max 1 position per group.
6. **15-minute cooldown is death spiral.** Stop out, re-enter same chop 15 min later, stop again. Changed to 2 hours.
7. **Drawdown protection is essential.** Half position size at 5% drawdown, stop trading at 10%. Without this, the system keeps bleeding at full speed.
8. **"Relaxed" entry conditions = random entry + fees.** Every "relaxation" (don't require crossover, RSI ±10 tolerance, 20% BB tolerance) destroyed the signal quality. Tighter is better.
9. **Leverage kills more than it helps.** 5x leverage means a 0.8% adverse move = 4% loss on margin. Reduced to 2-3x across all strategies.
10. **Pre-placed limit orders > reactive market orders.** Market orders chase price. Limit orders at key levels (support, BB bands, order blocks) catch moves with better entries and maker rebates.

## Lessons Learned (Frontend/Charts)

1. **iOS Safari: canvas containers collapse to 0 height.** Lightweight-charts uses absolute positioning inside its container. Must set explicit height/minHeight on a wrapper div. Also `clientWidth` can be 0 before layout — need fallback chain.
2. **iOS Safari WebSocket limit: ~6 concurrent.** The 6-chart grid view hits this limit. Added lazy loading with IntersectionObserver and capped mobile to 4 charts.
3. **Chart axis labels clutter.** Hide `axisLabelVisible` on position lines (SL/TP/liquidation). Only show current price and prediction price on the axis. Position info is already on the lines themselves.
4. **AI entry zone lines should always be visible.** Both LONG and SHORT target lines stay bright and bold regardless of ready/blocked state — the AI knows where it plans to trade ahead of time.

## Gotchas

- The `vercel.json` has no-cache headers on all routes — intentional to ensure fresh deploys.
- The Telegram cron auto-re-registers the webhook at every run to prevent silent failures.
- Auto-trade cron uses a device heartbeat to prevent conflicts between browser-initiated and cron-initiated trades.
- Database name defaults to "flub" (legacy name from earlier project iteration).
- CORS is restricted to budju.xyz, www.budju.xyz, and localhost in production.
- Trailing stop has separate `trailing_activation_pct` and `trailing_stop_pct` — activation must be wider.
- Strategy config stored per-wallet in `perp_strategy_config` collection. Changing DEFAULT_STRATEGIES only affects new accounts.
