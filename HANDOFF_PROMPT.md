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

## 11. Recent Changes (as of March 2026)

- Added Vercel Analytics (`@vercel/analytics/react`)
- Added date/time stamps to trade log entries (fixed `timestamp` vs `time` field mismatch)
- Added Dependabot for automated dependency updates
- Added ErrorBoundary and TanStack Query caching
- Applied 5-phase cleanup workflow
- Added server-side auto-trade cron for 24/7 trading
- Enhanced Telegram bot with interactive menus, AI Q&A, and moderation
- Added circuit breakers (min $8 order floor, daily limits)

---

## 12. Known Tech Debt & Considerations

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

---

*This document was auto-generated from a thorough codebase investigation. Last updated: March 12, 2026.*
