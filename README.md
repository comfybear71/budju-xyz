# BUDJU

**BUDJU Coin — it's a lifestyle**

A Solana meme coin project with a full website ecosystem, automated trading platform, and Telegram community bot.

**Live:** [budju.xyz](https://budju.xyz) | **Token:** `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump` | **Supply:** 1,000,000,000 BUDJU

## Tech Stack

- **Frontend:** React 19, TypeScript 5.7, Vite 6, Tailwind CSS 4
- **Backend:** Python & TypeScript serverless functions (Vercel)
- **Database:** MongoDB Atlas
- **Blockchain:** Solana (via @solana/web3.js, @solana/spl-token, wallet adapters)
- **Exchange:** Swyftx API (auto-trading), Jupiter (swaps), Raydium (liquidity)
- **Deployment:** Vercel (static hosting + serverless + cron jobs)

## Project Structure

```
BUDJU/
├── src/                          # React frontend (Vite SPA)
│   ├── components/common/        # Shared UI (Navbar, Footer, WalletConnect, etc.)
│   ├── features/                 # Feature modules (pages)
│   │   ├── home/                 # Landing page
│   │   ├── trade/                # Trading platform (core feature)
│   │   ├── bank/                 # Bank of BUDJU (treasury/savings)
│   │   ├── burn/                 # Token burn tracker
│   │   ├── swap/                 # Token swap interface
│   │   ├── pool/                 # Raydium liquidity pool info
│   │   ├── nft/                  # NFT collection & marketplace
│   │   ├── shop/                 # Merchandise store
│   │   ├── tokenomics/           # Token info & charts
│   │   ├── balance/              # Balance checker
│   │   ├── how-to-buy/           # Purchase guide
│   │   └── marketing/            # Marketing materials
│   ├── hooks/                    # useWallet, useTrading, useTokenHolders
│   ├── lib/                      # Services & utilities
│   │   ├── web3/connection.ts    # Solana connection setup
│   │   └── services/             # walletService, bankApi, chartApi, etc.
│   ├── constants/                # config, routes, addresses
│   ├── context/                  # ThemeContext (dark/light)
│   └── styles/                   # Global CSS
├── api/                          # Backend serverless functions
│   ├── index.py                  # Main REST API (users, deposits, trades, pool)
│   ├── database.py               # MongoDB operations
│   ├── telegram.ts               # Telegram bot webhook handler
│   ├── telegram-cron.ts          # Scheduled Telegram updates (every 6 hours)
│   ├── auto-trade-cron.py        # Auto-trading engine (every 5 minutes)
│   ├── proxy.ts                  # Swyftx API proxy
│   ├── jupiter.ts                # Jupiter DEX integration
│   ├── rpc.ts                    # Solana RPC proxy
│   └── marketing.ts              # Marketing image endpoints
├── public/                       # Static assets
├── vercel.json                   # Deployment config, rewrites, cron schedules
├── vite.config.ts                # Build config (React + SWC, SVGR, Tailwind)
└── tailwind.config.ts            # Custom BUDJU theme (pink, blue, yellow)
```

## Website Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Landing page with hero, about, roadmap, tokenomics, community |
| `/trade` | Trade | Core trading platform — portfolio, auto-trading, leaderboard, activity |
| `/bank` | Bank of BUDJU | Treasury/savings with deposit and withdrawal |
| `/burn` | Burn | Token burn portal with live burn counter |
| `/swap` | Swap | Token swap interface via Jupiter |
| `/pool` | Pool | Raydium liquidity pool information |
| `/nft` | NFT | NFT collection showcase & marketplace |
| `/shop` | Shop | Merchandise store |
| `/tokenomics` | Tokenomics | Token info, supply charts, distribution |
| `/balance` | Balance | BUDJU balance checker |
| `/how-to-buy` | How To Buy | Step-by-step purchase guide |
| `/marketing` | Marketing | Marketing materials management |

## API Endpoints

### Main API (`api/index.py`)

**Authentication:** Ed25519 signature-based for admin operations. Rate limited: 30 req/min (read), 10 req/min (write).

**GET:**
- `/api/user/portfolio?wallet=` — User portfolio
- `/api/user/deposits?wallet=` — User deposit history
- `/api/user/position?wallet=&poolValue=` — User share position
- `/api/pool/state` — Pool state (NAV, total shares)
- `/api/state` — Trader state (public)
- `/api/leaderboard?poolValue=` — User leaderboard
- `/api/transactions?wallet=` — Transaction history
- `/api/users?admin_wallet=` — All active users (admin)
- `/api/admin/stats?poolValue=` — Pool statistics (admin)

**POST:**
- `/api/user/register` — Register wallet
- `/api/user-deposit` — Record self-service deposit
- `/api/deposit` — Admin deposit recording
- `/api/pool/initialize` — Initialize pool value
- `/api/state` — Update trader state (admin)
- `/api/trade` — Record trade execution
- `/api/trade/sync` — Sync trades from Swyftx
- `/api/admin/import-user` — Import user with deposit (admin)
- `/api/admin/recalibrate` — Recalibrate pool NAV (admin)

### Other API Routes

- `/api/telegram` — Telegram bot webhook (POST from Telegram)
- `/api/telegram-cron` — Scheduled Telegram messages (Vercel cron)
- `/api/auto-trade-cron` — Auto-trading engine (Vercel cron, every 5 min)
- `/api/proxy` — Swyftx API proxy
- `/api/jupiter` — Jupiter DEX proxy
- `/api/rpc` — Solana RPC proxy (Helius)
- `/api/marketing` — Marketing image management

## Auto-Trading System

The trading platform features a tiered auto-trading bot:

- **Tier 1 (Blue Chips):** BTC, ETH, SOL, BNB, XRP — 1-15% deviation, 1-25% allocation
- **Tier 2 (Alts):** Mid-cap altcoins — 2-20% deviation, 1-20% allocation
- **Tier 3 (Speculative):** Small-cap tokens — 3-30% deviation, 1-15% allocation

**How it works:**
- Server-side cron (`auto-trade-cron.py`) runs every 5 minutes
- Monitors 25+ assets via CoinGecko price feeds
- Executes market orders on Swyftx when price deviates from target
- BUY on dip below target, SELL on rise above target
- 24-hour cooldown per asset after each trade
- $100 USDC minimum reserve maintained
- Sends Telegram notifications on trade execution
- Share-based pool accounting (NAV = totalPoolValue / totalShares)

## Telegram Bot

**Group:** [@budjucoingroup](https://t.me/budjucoingroup) (Chat ID: `-1002398835975`)

**Commands:**
`/menu` `/price` `/buy` `/info` `/contract` `/tokenomics` `/roadmap` `/socials` `/website` `/bot` `/bank` `/burn` `/nft` `/shop` `/pool` `/promo` `/help`

**Features:**
- Interactive button menus with callback queries
- Live price data from DexScreener/GeckoTerminal/Jupiter
- AI-powered Q&A using Claude Haiku
- Auto-moderation with profanity filtering (auto-mute 5 min)
- Scheduled promo messages & price updates (every 6 hours)
- Random marketing images from Vercel Blob storage
- Welcome messages for new members
- Automatic webhook health check and re-registration

## Cron Jobs (vercel.json)

| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| `0 0,6,12,18 * * *` | `/api/telegram-cron` | Telegram promos (0:00, 12:00) & price updates (6:00, 18:00) |
| `*/5 * * * *` | `/api/auto-trade-cron` | Auto-trading engine |

## Development

```bash
# Install dependencies
npm install

# Start dev server (localhost:5173)
npm run dev

# Build for production
npm run build

# Lint
npm run lint
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_TOKEN_ADDRESS` | BUDJU token contract address |
| `VITE_BURN_ADDRESS` | Token burn destination address |
| `VITE_BANK_ADDRESS` | Bank treasury address |
| `VITE_ENVIRONMENT` | Environment (dev/prod) |
| `HELIUS_API_KEY` | Solana RPC endpoint (Helius) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `DB_NAME` | Database name |
| `ADMIN_WALLETS` | Admin wallet addresses (comma-separated) |
| `SWYFTX_API_KEY` | Swyftx exchange API key |
| `TELEGRAM_BOT_TOKEN` | Telegram bot API token |
| `ANTHROPIC_API_KEY` | Claude AI for bot Q&A |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage token |
| `CRON_SECRET` | Cron job authentication |

## Social Links

- [Telegram](https://t.me/budjucoingroup)
- [Twitter/X](https://x.com/budjucoin)
- [Instagram](https://www.instagram.com/budjucoin)
- [TikTok](https://www.tiktok.com/@budjucoin)
- [Facebook](https://www.facebook.com/share/g/167RuPUSM1/)
- [Pump.fun](https://pump.fun/coin/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump)
