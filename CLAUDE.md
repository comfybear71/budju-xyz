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

## Gotchas

- The `vercel.json` has no-cache headers on all routes — intentional to ensure fresh deploys.
- The Telegram cron auto-re-registers the webhook at every run to prevent silent failures.
- Auto-trade cron uses a device heartbeat to prevent conflicts between browser-initiated and cron-initiated trades.
- Database name defaults to "flub" (legacy name from earlier project iteration).
- CORS is restricted to budju.xyz, www.budju.xyz, and localhost in production.
