# DigitalOcean VPS — Complete Reference

Everything about the existing BUDJU VPS droplet: how it was set up, what it runs, how it connects to the frontend, and how to spin up a new one.

---

## Current Droplet

| Field | Value |
|-------|-------|
| **Provider** | DigitalOcean |
| **Plan** | Basic — 1 vCPU, 512MB RAM, 10GB SSD |
| **Cost** | ~$4-5/month |
| **OS** | Ubuntu 24.04 LTS |
| **Region** | Sydney (syd1) |
| **Hostname** | `ubuntu-s-1vcpu-512mb-10gb-syd1-01` |
| **Purpose** | Solana trading bot — monitors 16 tokens, executes on-chain swaps via Jupiter DEX |
| **Port** | 8420 (HTTP API) |
| **Service** | `budju-trader` (systemd) |
| **User** | `budju` (non-root, sudo) |
| **Working dir** | `/home/budju/budju-xyz/vps` |
| **Python** | 3.12, virtualenv at `/home/budju/budju-xyz/vps/venv` |
| **Status** | Running in dry-run mode (as of March 2026) |
| **Trading wallet** | `BCXa...TLW7` |

---

## Architecture Overview

The VPS runs a **single Python async process** (`main.py`) that manages three concurrent services:

```
┌──────────────────────────────────────────────────┐
│  main.py (asyncio event loop)                    │
│                                                  │
│  ┌──────────────┐  ┌─────────┐  ┌────────────┐  │
│  │ PriceMonitor │  │ Trader  │  │ API Server │  │
│  │  (5s loop)   │  │ (swaps) │  │ (port 8420)│  │
│  └──────┬───────┘  └────┬────┘  └──────┬─────┘  │
│         │               │              │         │
│    Jupiter Price   Jupiter Swap    aiohttp web   │
│    API v3          API + Helius    server         │
│                    RPC                            │
└──────────────────────────────────────────────────┘
         │                │              │
    Prices every 5s   On-chain tx    Dashboard ←→ Vercel proxy
```

### Data Flow: Frontend to VPS

```
Browser (budju.xyz)
  → Vercel serverless function (api/vps-proxy.ts)
    → HTTP request to VPS IP:8420 with Bearer token
      → VPS api_server.py handles request
        → Returns JSON response back through the chain
```

The Vercel proxy (`api/vps-proxy.ts`) exists because the frontend is HTTPS and the VPS runs HTTP — browsers block mixed content. The proxy adds the `Authorization: Bearer <VPS_API_SECRET>` header server-side so the secret never reaches the browser.

---

## File Inventory

All bot code lives in the `vps/` directory (8 source files + 2 config files):

| File | Lines | Purpose |
|------|-------|---------|
| `main.py` | 115 | Entry point — starts all 3 services, handles graceful shutdown, saves positions every 60s |
| `config.py` | 142 | All configuration: 16 asset definitions (mint addresses, decimals, CoinGecko IDs), env vars, runtime-mutable state |
| `price_monitor.py` | 137 | Fetches prices from Jupiter Price API v3 every 5 seconds, tracks 1-hour price history for change calculations |
| `trader.py` | 412 | Trade execution: Jupiter quote → swap transaction → sign with Keypair → send via Helius RPC. Position tracking, PnL calculation, circuit breakers |
| `api_server.py` | 212 | aiohttp HTTP server on port 8420 with auth, CORS, 10 endpoints |
| `setup-vps.sh` | 134 | One-paste initial setup script (creates user, firewall, Python, repo clone, venv, systemd service) |
| `update-vps.sh` | 140 | Update script for applying runtime config changes |
| `requirements.txt` | 7 | Python dependencies |
| `.env.example` | 30 | Environment variable template |
| `.gitignore` | 4 | Ignores `.env`, `__pycache__/`, `*.pyc`, `venv/` |

Plus the Vercel proxy:

| File | Lines | Purpose |
|------|-------|---------|
| `api/vps-proxy.ts` | 109 | Vercel serverless proxy — HTTPS frontend to HTTP VPS, rate limiting, path allowlist |

---

## Monitored Assets (16 Tokens)

All Solana-native or wrapped tokens tradeable on Jupiter DEX:

| # | Symbol | Token | Decimals | CoinGecko ID |
|---|--------|-------|----------|---------------|
| 1 | SOL | Solana | 9 | solana |
| 2 | JUP | Jupiter | 6 | jupiter-exchange-solana |
| 3 | BONK | Bonk | 5 | bonk |
| 4 | WIF | dogwifhat | 6 | dogwifhat |
| 5 | RENDER | Render | 8 | render-token |
| 6 | HNT | Helium | 8 | helium |
| 7 | PYTH | Pyth Network | 6 | pyth-network |
| 8 | RAY | Raydium | 6 | raydium |
| 9 | ORCA | Orca | 6 | orca |
| 10 | PEPE | Pepe (wrapped) | 8 | pepe |
| 11 | JTO | Jito | 9 | jito-governance-token |
| 12 | W | Wormhole | 6 | wormhole |
| 13 | MOBILE | Helium Mobile | 6 | helium-mobile |
| 14 | MSOL | Marinade SOL | 9 | msol |
| 15 | JITOSOL | Jito Staked SOL | 9 | jito-staked-sol |
| 16 | JLP | Jupiter LP | 6 | jupiter-perpetuals-liquidity-provider-token |

All prices fetched from Jupiter Price API v3 (`https://api.jup.ag/price/v3`) in a single batch request using mint addresses.

---

## API Endpoints

The VPS exposes 10 HTTP endpoints on port 8420:

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health` | No | Uptime, price count, trading status, wallet address |
| GET | `/api/prices` | No | All current prices with 1hr change % |
| GET | `/api/assets` | No | Tradeable assets list with current prices |
| GET | `/api/portfolio` | Yes | Holdings, values, PnL, daily stats |
| GET | `/api/trades` | Yes | Trade history (last N, default 50) |
| GET | `/api/status` | Yes | Full bot status (portfolio + prices + recent trades) |
| GET | `/api/config` | Yes | Current trading_enabled and dry_run state |
| POST | `/api/buy` | Yes | Buy token with USDC `{symbol, amount}` |
| POST | `/api/sell` | Yes | Sell token position `{symbol, pct}` |
| POST | `/api/config` | Yes | Update runtime config `{trading_enabled, dry_run}` |

**Auth** = `Authorization: Bearer <API_SECRET>` header. If no `API_SECRET` is set in `.env`, auth is disabled (dev mode).

The `/api/config` POST endpoint allows toggling `trading_enabled` and `dry_run` at runtime without restarting the service.

---

## Circuit Breakers & Safety

Built into `trader.py`:

| Protection | Default | Purpose |
|-----------|---------|---------|
| `MAX_SINGLE_TRADE_USD` | $50 | Max per-trade size |
| `MAX_DAILY_TRADES` | 50 | Max trades per day |
| `MAX_DAILY_LOSS_USD` | $200 | Stop trading if daily PnL exceeds this loss |
| `TRADING_ENABLED` | true | Global kill switch |
| `DRY_RUN` | true | Simulates trades (gets real quotes, skips signing/sending) |
| Price impact check | 2.0% | Rejects swaps with >2% price impact |

Daily counters reset at UTC midnight.

---

## Trade Execution Flow

When a buy or sell is triggered:

1. **Circuit breaker check** — is trading enabled? Within daily limits?
2. **Jupiter Quote** — `GET https://lite-api.jup.ag/swap/v1/quote` with mint addresses, amount, slippage (50 bps default)
3. **Price impact check** — reject if >2%
4. **If dry run** — log the quote, return simulated success
5. **Jupiter Swap** — `POST https://lite-api.jup.ag/swap/v1/swap` to get a serialized transaction
6. **Sign** — deserialize `VersionedTransaction`, sign with `Keypair` from `TRADING_WALLET_KEY`
7. **Send** — `POST` to Helius RPC `sendTransaction` with base64-encoded signed tx
8. **Record** — update in-memory positions, save to MongoDB (`vps_trades` and `vps_positions` collections)

---

## MongoDB Collections (VPS-specific)

| Collection | Purpose |
|-----------|---------|
| `vps_trades` | Individual trade records (buy/sell with tx hash, PnL) |
| `vps_positions` | Single document (`_id: "positions"`) with current holdings, upserted every 60 seconds |

Uses the same MongoDB Atlas cluster and `flub` database as the main platform.

---

## Environment Variables

**Required:**

| Variable | Description |
|----------|-------------|
| `HELIUS_API_KEY` | Solana RPC provider (shared with Vercel) |
| `TRADING_WALLET_KEY` | Base58-encoded private key for a dedicated hot wallet |
| `MONGODB_URI` | MongoDB Atlas connection string (shared with Vercel) |
| `API_SECRET` | Bearer token for API auth (auto-generated by setup script) |

**Optional:**

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot for trade notifications |
| `TELEGRAM_CHAT_ID` | — | Telegram chat to send to |
| `JUPITER_API_KEY` | — | Paid Jupiter API key (falls back to free tier) |
| `DB_NAME` | `flub` | MongoDB database name |
| `TRADING_ENABLED` | `true` | Global kill switch |
| `DRY_RUN` | `true` | Simulate trades without signing |
| `MAX_SINGLE_TRADE_USD` | `50` | Max USD per trade |
| `MAX_DAILY_TRADES` | `50` | Daily trade count limit |
| `MAX_DAILY_LOSS_USD` | `200` | Daily loss limit |
| `API_HOST` | `0.0.0.0` | API bind address |
| `API_PORT` | `8420` | API port |
| `DEFAULT_SLIPPAGE_BPS` | `50` | Slippage tolerance (0.5%) |
| `PRICE_CHECK_INTERVAL` | `5` | Seconds between price fetches |

**Vercel-side (for the proxy):**

| Variable | Description |
|----------|-------------|
| `VPS_API_URL` | Full URL to VPS, e.g. `http://123.45.67.89:8420` |
| `VPS_API_SECRET` | Must match the VPS `API_SECRET` |

---

## Vercel Proxy Details

`api/vps-proxy.ts` acts as a secure bridge:

- **Path routing:** Frontend calls `/api/vps-proxy?path=/api/health` — the proxy forwards to `VPS_API_URL/api/health`
- **Auth injection:** Adds `Authorization: Bearer <VPS_API_SECRET>` server-side
- **Path allowlist:** Only 10 specific paths are forwarded (hardcoded in `ALLOWED_PATHS`)
- **Rate limiting:** 60 GET/min, 15 POST/min per IP
- **CORS:** Restricted to `budju.xyz`, `www.budju.xyz`, `localhost:*`

---

## Systemd Service

File: `/etc/systemd/system/budju-trader.service`

```ini
[Unit]
Description=BUDJU VPS Trading Bot
After=network.target

[Service]
Type=simple
User=budju
WorkingDirectory=/home/budju/budju-xyz/vps
ExecStart=/home/budju/budju-xyz/vps/venv/bin/python main.py
Restart=always
RestartSec=10
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

Key behaviors:
- **Auto-restart:** `Restart=always` with 10s delay — if the bot crashes, it comes back
- **Auto-start on boot:** `WantedBy=multi-user.target` + `systemctl enable` means it starts on reboot
- **Unbuffered output:** `PYTHONUNBUFFERED=1` ensures logs appear in journalctl immediately
- **Positions saved every 60s** to MongoDB (via the save loop in `main.py`), plus on graceful shutdown

---

## Firewall Rules

Set up via `ufw`:

```bash
ufw allow OpenSSH     # Port 22 — SSH access
ufw allow 8420/tcp    # Trading bot API
ufw enable
```

Only two ports are open. Everything else is blocked.

**Security hardening (optional):**
```bash
# Restrict API port to your IP only
ufw delete allow 8420/tcp
ufw allow from YOUR_IP to any port 8420
```

---

## Initial Setup (One-Paste Script)

The `setup-vps.sh` script does everything in 6 steps. Paste it into the DigitalOcean web console:

1. **Creates `budju` user** with sudo access (password: `budju2026!` — change immediately after)
2. **Configures firewall** — SSH + port 8420
3. **Installs Python 3.12** + venv + pip + git
4. **Clones the repo** to `/home/budju/budju-xyz` and creates virtualenv
5. **Creates `.env`** from template with auto-generated `API_SECRET`
6. **Creates systemd service** and enables it

After the script completes, you still need to:
1. Edit `.env` with your actual keys: `nano /home/budju/budju-xyz/vps/.env`
2. Fund the trading wallet with SOL (for fees) and USDC (for trading)
3. Start the service: `sudo systemctl start budju-trader`
4. Change the default password: `passwd budju`

---

## Python Dependencies

```
aiohttp>=3.9.0        # Async HTTP client/server (API server + Jupiter/Helius requests)
solana>=0.34.0         # Solana Python SDK
solders>=0.21.0        # Low-level Solana types (Keypair, VersionedTransaction)
base58>=2.1.0          # Base58 encoding for wallet keys
pymongo>=4.6.0         # MongoDB driver (sync, run in executor for async)
python-dotenv>=1.0.0   # Load .env files
```

---

## Common Operations

```bash
# SSH into the droplet
ssh budju@YOUR_VPS_IP

# View live logs (Ctrl+C to exit — does NOT stop the bot)
sudo journalctl -u budju-trader -f

# View last N log lines
sudo journalctl -u budju-trader --no-pager -n 50

# Service control
sudo systemctl start budju-trader
sudo systemctl stop budju-trader
sudo systemctl restart budju-trader
sudo systemctl status budju-trader

# Reload service file after editing
sudo systemctl daemon-reload

# Test API locally on the VPS
curl http://localhost:8420/api/health
curl http://localhost:8420/api/prices

# Update code from GitHub
cd /home/budju/budju-xyz && git pull origin master
sudo systemctl restart budju-trader

# Update Python dependencies
source /home/budju/budju-xyz/vps/venv/bin/activate
pip install -r /home/budju/budju-xyz/vps/requirements.txt

# Toggle dry run off (go live)
nano /home/budju/budju-xyz/vps/.env   # Change DRY_RUN=false
sudo systemctl restart budju-trader

# Or toggle at runtime without restart
curl -X POST http://localhost:8420/api/config \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": false}'

# Create a new trading wallet
solana-keygen new --outfile ~/trading-wallet.json
solana-keygen pubkey ~/trading-wallet.json
python3 -c "
import json, base58
with open('$HOME/trading-wallet.json') as f:
    key_bytes = bytes(json.load(f))
print(base58.b58encode(key_bytes).decode())
"
```

---

## Known Issues & Gotchas

These were discovered during the initial setup (March 2026):

1. **Ubuntu 24.04 blocks system pip** (PEP 668) — must use a virtualenv, not `pip install` globally
2. **pymongo 4.16+ breaks `if db:`** — must use `if db is not None:` explicitly
3. **Jupiter Price API v2 is dead** — must use v3 (`/price/v3`), which has different response format (no `data` wrapper, `usdPrice` instead of `price`)
4. **Jupiter Price API requires auth** — needs `x-api-key` header (free tier available)
5. **Position persistence** — positions are saved to MongoDB every 60s. If the bot crashes between saves, up to 60s of position changes could be lost (trades are saved immediately)
6. **The systemd service file on the live server runs as `User=root`** (per HANDOFF.md) — the setup script creates it as `User=budju`. This discrepancy may have been changed manually
7. **Mixed content** — the VPS runs HTTP, frontend runs HTTPS. The Vercel proxy (`api/vps-proxy.ts`) is mandatory for browser access

---

## Spinning Up a New Droplet — Checklist

If you want to create a second droplet (e.g. for running a terminal/HQ):

### 1. Create the Droplet

- Go to DigitalOcean → Create → Droplets
- **Image:** Ubuntu 24.04 LTS
- **Plan:** Basic, Regular SSD
  - $4/mo: 1 vCPU, 512MB RAM, 10GB SSD (enough for a bot)
  - $6/mo: 1 vCPU, 1GB RAM, 25GB SSD (better for a terminal/HQ with more tools)
  - $12/mo: 1 vCPU, 2GB RAM, 50GB SSD (comfortable for development)
- **Region:** Sydney (syd1) or closest to you
- **Auth:** SSH keys (recommended) or password
- **Hostname:** Something descriptive like `budju-hq-syd1`

### 2. Initial Setup

SSH in and run the basics:
```bash
ssh root@NEW_DROPLET_IP

# Create your user
adduser budju
usermod -aG sudo budju

# Firewall
ufw allow OpenSSH
# Add any other ports you need (e.g. 8420 for another bot, 3000 for a dev server)
ufw enable

# Install essentials
apt update && apt install -y python3.12 python3.12-venv python3-pip git curl wget nano htop

# Switch to your user
su - budju
```

### 3. Clone the Repo

```bash
git clone https://github.com/comfybear71/budju-xyz.git
cd budju-xyz
```

### 4. If Running Another Bot Instance

```bash
cd vps
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
nano .env   # Fill in keys — use a DIFFERENT trading wallet!
```

Create the systemd service (same pattern, different service name if needed):
```bash
sudo nano /etc/systemd/system/budju-trader.service
# Paste the service config from the "Systemd Service" section above
sudo systemctl daemon-reload
sudo systemctl enable budju-trader
sudo systemctl start budju-trader
```

### 5. If Using as a Terminal/HQ

For a general-purpose development terminal, you'd also want:
```bash
# Node.js (for running the frontend or other tools)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# Optional: tmux for persistent sessions
sudo apt install -y tmux

# Optional: Docker
sudo apt install -y docker.io
sudo usermod -aG docker budju
```

### 6. Connect to the Existing Droplet

If the new droplet needs to communicate with the existing trading bot:
```bash
# From the new droplet, test connectivity
curl http://EXISTING_VPS_IP:8420/api/health

# Or restrict access: on the EXISTING droplet, allow only the new IP
sudo ufw allow from NEW_DROPLET_IP to any port 8420
```

### 7. Vercel Proxy (if needed)

If the new droplet also needs frontend access, add its URL as an additional env var in Vercel, or modify `api/vps-proxy.ts` to support multiple VPS targets.

---

## Cost Summary

| Droplet Tier | Monthly | Specs | Good For |
|-------------|---------|-------|----------|
| Basic $4 | $4/mo | 1 vCPU, 512MB, 10GB | Single bot (current setup) |
| Basic $6 | $6/mo | 1 vCPU, 1GB, 25GB | Bot + light terminal use |
| Basic $12 | $12/mo | 1 vCPU, 2GB, 50GB | Development environment |
| Basic $24 | $24/mo | 2 vCPU, 4GB, 80GB | Multiple bots + development |

The current trading bot uses minimal resources — 512MB is sufficient. For a terminal/HQ with tools like Node.js, git, and development work, 1-2GB is recommended.
