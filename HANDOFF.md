# HANDOFF.md — BUDJU Project State & Handoff

> Last updated: March 27, 2026

This document describes the full current state of the BUDJU project for handoff to external agents or platforms. Read alongside `CLAUDE.md` (architecture reference) and `docs/HANDOFF_PROMPT.md` (detailed session-by-session changelog).

---

## 1. Project Overview

**BUDJU** is a Solana meme coin ecosystem: website + automated trading platform + Telegram community bot.

- **Live:** https://budju.xyz
- **Token:** `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump` (1B supply, 6 decimals)
- **Created:** January 31, 2025
- **Codebase:** ~63,000 lines across ~181 source files (TypeScript + Python)
- **Repo:** GitHub, deployed via Vercel

---

## 2. Full Stack Summary

### Frontend
- **Framework:** React 19 SPA, Vite 6, TypeScript, Tailwind CSS 4
- **Routing:** react-router-dom v7 (client-side, NOT Next.js)
- **State:** React Query (@tanstack/react-query), custom context providers (Wallet, Theme)
- **Real-time:** Binance WebSocket (singleton, 3 fallback endpoints, 60+ assets)
- **Charts:** lightweight-charts v3.8 with Binance kline streams
- **Wallet:** Phantom, Solflare, Jupiter via @solana/wallet-adapter-react + @wallet-standard/app
- **14 page modules:** home, trade (largest), bank, pool, swap, spot, nft, shop, tokenomics, burn, balance, how-to-buy, marketing, not-found

### Backend (Vercel Serverless)
- **26 API files** (15 Python, 11 TypeScript)
- **Python:** Main REST API (`index.py`), MongoDB layer (`database.py`), spot auto-trader cron, perp trading engine + 10 strategy files + cron + backtest + exchange adapter
- **TypeScript:** Telegram bot + cron, Swyftx proxy, Jupiter proxy, Solana RPC proxy, Binance/klines proxy, marketing API, VPS proxy

### Database
- **MongoDB Atlas** (DB name: `flub` — legacy)
- **22 collections** covering user accounts, pool accounting, spot trades, perp trading (accounts, positions, orders, trades, equity, funding, price history, strategy config, signals, pending orders, position management, grid state, zone state)

### VPS Bot
- **DigitalOcean** ($4-5/mo, Ubuntu 24.04, systemd service `budju-trader`)
- **Port 8420**, monitors 16 Solana tokens via Jupiter Price API v3
- **Executes on-chain** via Jupiter DEX
- **Frontend proxy** via `api/vps-proxy.ts`

### Cron Jobs
| Job | File | Schedule | Purpose |
|-----|------|----------|---------|
| Perp monitor | `api/perp-cron.py` | Every 1 min | Update positions, check SL/TP/liquidation, run strategies |
| Spot auto-trade | `api/auto-trade-cron.py` | Every 5 min | CoinGecko prices → Swyftx orders |
| Telegram | `api/telegram-cron.ts` | 4x daily (0/6/12/18 UTC) | Promos, price updates, strategy opportunities |

---

## 3. Current State (as of March 24, 2026)

### What's Working
- Full website with 14 pages, responsive design, dark/light theme
- Spot auto-trader via Swyftx with tier-based settings (T1/T2/T3), circuit breakers, cooldowns
- Perpetual paper trading with $10K virtual balance, 10 markets, up to 50x leverage
- 10 automated perp strategies (3 enabled by default: trend following, mean reversion, momentum)
- Real-time Binance WebSocket price streaming with 3 fallback endpoints
- 6-chart dashboard grid with lazy loading (IntersectionObserver for iOS Safari)
- Inline SL/TP/trigger editing on chart position/order cards
- Pending limit/stop orders with 24h expiry
- Advanced position management: partial close, pyramiding, flipping, core/satellite tagging
- Telegram bot with AI Q&A (Claude Haiku), auto-moderation, interactive menus
- Share-based pool accounting (NAV system) for multi-user fund management
- VPS trading bot on DigitalOcean for on-chain Jupiter DEX trades
- Python test suite (auth, circuit breakers, pool math)

### What's Not Active / Future
- **Drift Protocol live perps** — Code exists in `perp_exchange.py` but deps exceed Vercel 500MB limit. Needs separate infra.
- **NFT minting** — UI exists but no live mint contract
- **Shop checkout** — Product catalog displayed but no payment integration
- **Frontend automated tests** — Only Python tests exist
- **`executeDeposit` in useTrading.ts** — Returns mock tx ID; real deposits use `depositService.ts`

---

## 4. Recent Changes & Fixes (March 14-27, 2026)

### Housekeeping & Docs Reorganisation (March 27) — MOST RECENT
- Moved all project .md files (except README.md, CLAUDE.md, HANDOFF.md) into `docs/` folder
- Created comprehensive DigitalOcean VPS reference doc (`docs/DIGITALOCEAN_VPS.md`)
- Cleaned up stale Git branches: deleted merged Claude branches, closed unused Dependabot PRs (#3, #5)
- **Git workflow rule:** Development happens on feature branches → merged to `master` via PR → branch deleted after merge. Only `master` and active working branches should exist.
- **File organisation rule:** Only README.md, CLAUDE.md, HANDOFF.md in root. All other docs go in `docs/`.

### Auto-Trader Sell Execution Fixes (March 23-24)
- Fixed client-side auto-trader failing for minimum order sizes
- Fixed asset ID type mismatches causing coins to silently fail
- Fixed sells not executing after cooldown expires (all tiers)
- Added per-coin diagnostics for failed sells
- Added HYPE to WebSocket and fixed stale price overrides
- Execute trades immediately on price crosses instead of waiting for 3-min interval
- WebSocket prices were being overwritten by stale CoinGecko prices — fixed ordering
- Enabled Telegram notifications for auto-trader BUY orders

### Admin Authentication Overhaul (March 18-20)
- Removed Phantom wallet signing requirement for admin operations
- Removed Ed25519 signature verification from `/api/state`
- Fixed admin signature retry loops and caching issues
- Removed all localStorage usage — everything persists to MongoDB now
- Made tier settings independent with explicit Save buttons per tier

### Live P&L Fix + Strategy Filtering (March 16)
- Fixed unrealized P&L mismatch between account summary and position cards
- Account summary now uses live WebSocket prices (same formula as position cards)
- StrategyMarquee filters out symbols with open positions

### Inline Editing + Critical Fixes (March 14)
- Inline editable trigger/SL/TP on chart cards (click to edit, Enter/Escape/blur to save)
- Fixed TP exits losing money (now fill at TP target price, not mark - slippage)
- Fixed settings persistence (deep-merge for autoTiers instead of $set overwrite)
- Fixed iPhone charts (renamed proxy to `/api/klines`, added staggered loading)
- Fixed chart geo-blocking (Binance.US → OKX → Binance Global cascade)

### EA-Inspired Strategies (March 14)
- Added Keltner Channel, BB Squeeze, Zone Recovery, HF Scalper strategies
- Equity Curve Trading meta-filter
- Smooth martingale option for grid strategy
- Strategy config auto-merge for existing accounts
- UI toggle switches (replaced ON/OFF buttons)

### Failed: Accumulation Sparkline Charts on Holdings Cards (March 24-25) — REVERTED
- **Attempt:** Add sparkline area charts to each holdings card showing coin accumulation over time (e.g. BTC going from 0 → 0.0147)
- **All changes reverted** — 7 commits made, all undone. Zero net change to codebase.
- **Root cause of failure:** The `/api/accumulation` endpoint returns empty because the MongoDB `trades` collection has no data. Trades were done directly on Swyftx, never synced to MongoDB via `/api/trade/sync`.
- **Mistakes made (do NOT repeat these):**
  1. Created an AccumulationSparkline component and wired it up before verifying the API had data — should have checked data availability FIRST
  2. Placed the sparkline as an invisible absolute-positioned background overlay behind card content — completely invisible to the user
  3. Attempted a "live price buffer" approach using WebSocket prices — user wanted accumulation history, not live price charts
  4. When finally using Swyftx order history (which had data), the charts rendered but looked bad — too large, too dominant, wrong visual style
  5. Made 7 incremental commits trying different approaches instead of getting it right once
  6. Did not ask the user to clarify what they wanted when "can't see shit" could have meant many things
- **What would actually work:** Fetch Swyftx order history via `fetchSwyftxOrderHistory()` in tradeApi.ts (this function exists and returns filled orders with coin codes matching ASSET_CONFIG keys). Build running balance client-side. But the chart design/sizing needs to be done carefully — a subtle 20px sparkline looked bad, a 40px one was too dominant. Needs proper UI design consideration.
- **Key data facts:** The `trades` collection in MongoDB is empty. Holdings come from Swyftx `/user/balance/` API (via `/portfolio/` proxy handler). Trade history is available via `fetchSwyftxOrderHistory()` which hits Swyftx `/orders/?limit=N` and filters for status=4 (filled).

---

## 5. Known Issues & Tech Debt

1. **Drift Protocol live trading blocked** — Deps are 661MB vs Vercel's 500MB limit. Needs separate infra (VPS or dedicated server).
2. **Cron-based trigger monitoring (1-min interval)** — Price can gap past SL/TP between ticks. Real-time WebSocket monitoring would be more reliable but complex.
3. **Bundle size warning** — Main chunk >500KB. Could benefit from more aggressive code splitting.
4. **No frontend automated tests** — Only Python tests exist (auth, circuit breakers, pool math).
5. **Legacy DB name "flub"** — Should be migrated to "budju" for clarity.
6. **No client-side SL/TP pre-validation** — Server rejects invalid values but frontend doesn't show inline errors before submission.
7. **Pending orders UI** — Lacks real-time price display for all markets simultaneously.
8. **HF Scalper position accumulation** — Can generate up to 15 concurrent positions; monitor balance consumption.
9. **Zone Recovery exposure** — 15% equity cap per zone but multiple zones can stress balance.
10. **Equity curve filter cold start** — Needs ~20 cron ticks of data before it activates; new accounts trade at full size initially.
11. **Mock deposit function** — `executeDeposit` in `useTrading.ts` returns fake tx ID.

---

## 6. Key Addresses & Links

| Item | Value |
|------|-------|
| Token mint | `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump` |
| Burn address | `1nc1nerator11111111111111111111111111111111` |
| Bank address | `5b1FfWsJR3pJzWbXDVGfZkRqCvp6njcCPDfZnWy9jH8u` |
| Pool wallet | `AEWvE2xXaHSGdGCaCArb2PWdKS7K9RwoCRV7CT2CJTWq` |
| USDC mint | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| JLP mint | `27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4` |
| Raydium AMM pool | `FxHfhKyXkLRCRGqhasqW2fU1iPJ8Cs1DSAUEmcx3dLmN` |
| DEX link | https://dexscreener.com/solana/fxhfhkyxklrcrgqhasqw2fu1ipj8cs1dsauemcx3dlmn |
| Website | https://budju.xyz |

---

## 7. API Endpoint Reference

### Main API (api/index.py)

**Public GET:**
- `GET /api/user/portfolio?wallet=` — User portfolio
- `GET /api/user/deposits?wallet=` — Deposit history
- `GET /api/user/position?wallet=&poolValue=` — Current position + NAV
- `GET /api/user/preferences?wallet=` — User preferences
- `GET /api/pool/state` — Total shares
- `GET /api/state` — Trader state (tiers, targets, trade log)
- `GET /api/admin/stats?poolValue=` — Pool stats
- `GET /api/leaderboard?poolValue=` — Ranked users
- `GET /api/transactions?wallet=` — Transaction history

**Public POST:**
- `POST /api/user/register` — Register user
- `POST /api/user-deposit` — Self-service deposit (issues shares)
- `POST /api/user/preferences` — Save preferences

**Admin POST:**
- `POST /api/deposit` — Record admin deposit
- `POST /api/pool/initialize` — Initialize pool
- `POST /api/state` — Update trader state
- `POST /api/trade` — Record trade
- `POST /api/trade/sync` — Bulk sync from Swyftx
- `POST /api/admin/import-user` — Import user
- `POST /api/admin/recalibrate` — Snapshot/reset pool P&L

### Perp Trading API (api/index.py)

**GET:**
- `GET /api/perp/account?wallet=` — Account info + equity
- `GET /api/perp/positions?wallet=` — Open positions
- `GET /api/perp/pending-orders?wallet=` — Pending orders
- `GET /api/perp/metrics?wallet=` — Trading metrics
- `GET /api/perp/markets` — Available markets
- `GET /api/perp/strategy/status?wallet=` — Strategy status + positions
- `GET /api/perp/backtest?strategy=&symbol=&periods=&balance=` — Run backtest
- `GET /api/perp/public` — Public read-only data

**POST:**
- `POST /api/perp/order` — Open position
- `POST /api/perp/close` — Close position
- `POST /api/perp/modify` — Modify SL/TP/trailing
- `POST /api/perp/partial-close` — Partial close (1-99%)
- `POST /api/perp/pyramid` — Add to winning position
- `POST /api/perp/flip` — Close + reverse direction
- `POST /api/perp/position-type` — Set core/satellite
- `POST /api/perp/pending-order` — Create limit/stop order
- `POST /api/perp/pending-order/cancel` — Cancel order
- `POST /api/perp/strategy/toggle` — Enable/disable bot
- `POST /api/perp/strategy/config` — Update strategy config

### Proxy Endpoints
- `api/proxy.ts` — Swyftx exchange proxy (keeps API key server-side)
- `api/jupiter.ts` — Jupiter DEX proxy (quote GET, swap POST)
- `api/rpc.ts` — Solana RPC proxy (Helius primary, public fallback, 19 allowed methods)
- `api/klines.ts` — Multi-source klines (Binance.US → OKX → Binance Global)
- `api/binance.ts` — Direct Binance klines proxy (whitelisted symbols/intervals)
- `api/marketing.ts` — Vercel Blob marketing assets
- `api/vps-proxy.ts` — VPS trading bot proxy (whitelisted paths)

---

## 8. Frontend Routes

| Path | Page | Feature Module |
|------|------|----------------|
| `/` | Home | Landing page with ecosystem overview, roadmap |
| `/trade` | Trade | Main trading platform (perps, auto-trader, dashboard) |
| `/spot` | Spot | Spot trading interface |
| `/swap` | Swap | Jupiter token swap |
| `/bank` | Bank | Staking, JLP, deposits |
| `/pool` | Pool | Raydium liquidity pool info |
| `/tokenomics` | Tokenomics | Token info, supply, DexScreener embed |
| `/nft` | NFT | NFT collection + marketplace |
| `/shop` | Shop | Merchandise catalog |
| `/how-to-buy` | How to Buy | Getting started guide |
| `/burn` | Burn | Token burn tracking |
| `/balance` | Balance | Wallet balance checker |
| `/marketing` | Marketing | Marketing materials from Vercel Blob |

---

## 9. Testing

```bash
npm run test        # pytest tests/ -v
npm run test:quick  # pytest tests/ -q
```

Test files:
- `tests/test_auth.py` — Admin authentication & signature verification
- `tests/test_circuit_breakers.py` — Trading circuit breaker limits
- `tests/test_pool_math.py` — NAV/share pool accounting math

No frontend tests exist. Linting via `npm run lint` (ESLint 9 flat config + Prettier).

---

## 10. Deployment

- **Platform:** Vercel
- **Build:** `npm run build` → `dist/`
- **Python runtime:** Auto-detected from `api/*.py` + `requirements.txt` (pymongo, base58, PyNaCl)
- **TypeScript runtime:** Auto-detected from `api/*.ts`
- **Headers:** No-cache on all routes (intentional for fresh deploys)
- **SPA catch-all:** `/((?!assets/).*)` → `/index.html`
- **Crons:** Defined in `vercel.json` (see section 2)
- **VPS:** Separate DigitalOcean instance, systemd service, manual deploys via `git pull + systemctl restart`

---

## 11. Next Steps / Roadmap Considerations

1. **Live perpetual trading** — Drift Protocol integration exists but needs non-Vercel infra due to dependency size limits
2. **Frontend tests** — No coverage currently; critical paths (trading, wallet connection) should be tested
3. **Bundle optimization** — Code splitting for the trade module which is the largest
4. **Client-side validation** — SL/TP/trigger values validated server-side only
5. **DB migration** — Rename from "flub" to "budju"
6. **NFT mint launch** — UI ready, needs smart contract
7. **Shop payments** — Product catalog exists, needs payment integration
8. **WebSocket-based position monitoring** — Replace 1-min cron polling for more responsive SL/TP/liquidation
9. **Auto-trader reliability** — Recent fixes (March 23-24) improved sell execution; monitor for regressions
10. **Strategy backtesting UI** — Backend endpoint exists (`/api/perp/backtest`), could add frontend visualization

---

## 12. Other Documentation

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Architecture reference, patterns, gotchas |
| `HANDOFF_PROMPT.md` | Detailed session-by-session changelog with code-level detail |
| `PLAN.md` | Original perp trading system implementation plan |
| `TRADING_MANUAL.md` | User-facing trading system manual (strategies, UI guide) |
| `SECURITY.md` | Security policy and reporting |
| `README.md` | Basic project readme |
| `vps/HANDOFF.md` | VPS bot setup issues and session log |
| `vps/SETUP.md` | VPS setup guide |
