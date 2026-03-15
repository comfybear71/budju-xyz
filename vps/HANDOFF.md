# VPS Trading Bot — Handoff Notes

## Session: 2026-03-15

### Server Details

- **Provider:** DigitalOcean
- **Plan:** Ubuntu 24.04 (1 vCPU, 512MB RAM)
- **Hostname:** `ubuntu-s-1vcpu-512mb-10gb-syd1-01`
- **Service name:** `budju-trader`
- **Working directory:** `/home/budju/budju-xyz/vps`
- **Python:** System Python 3.12 + virtualenv at `/home/budju/budju-xyz/vps/venv`
- **API port:** 8420

---

### Issues Encountered & Fixes

#### 1. `ModuleNotFoundError: No module named 'dotenv'`

**Cause:** Dependencies were installed with `pip install` to system Python, but Ubuntu 24.04 uses externally-managed environments (PEP 668) which blocks system-wide pip installs.

**Fix:** Created a virtual environment and installed dependencies there:
```bash
python3 -m venv /home/budju/budju-xyz/vps/venv
source /home/budju/budju-xyz/vps/venv/bin/activate
pip install -r /home/budju/budju-xyz/vps/requirements.txt
```

Updated the systemd service to use the venv Python:
```
ExecStart=/home/budju/budju-xyz/vps/venv/bin/python main.py
```

#### 2. Stray character in systemd service file

**Cause:** Accidentally typed `y` on a line in the service file during nano editing, causing a `Missing '=', ignoring line` systemd warning.

**Fix:** Removed the stray `y` line from `/etc/systemd/system/budju-trader.service`.

#### 3. `NotImplementedError: Database objects do not implement truth value testing or bool()`

**Cause:** pymongo 4.16.0 no longer allows `if self.db:` on Database objects. It raises `NotImplementedError` and requires explicit `None` comparison.

**Fix:** Changed all instances in `vps/trader.py`:
```python
# Before (broken)
if self.db:

# After (fixed)
if self.db is not None:
```

Two occurrences at lines 69 and 342.

#### 4. Jupiter Price API returned 401 (Unauthorized)

**Cause:** Jupiter Price API now requires authentication via API key header.

**Fix:** Added `JUPITER_API_KEY` to `config.py` and passed `x-api-key` header in `price_monitor.py`:
```python
headers = {}
if JUPITER_API_KEY:
    headers["x-api-key"] = JUPITER_API_KEY
```

Also added `JUPITER_API_KEY=<key>` to `.env` (note: NOT `VITE_JUPITER_API_KEY` — that's the frontend key with the `VITE_` prefix).

#### 5. Jupiter Price API returned 404 (Not Found)

**Cause:** Jupiter deprecated Price API v2 (`https://api.jup.ag/price/v2`). It has been replaced by v3.

**Fix:** Updated URL in `price_monitor.py`:
```python
# Before
JUPITER_PRICE_URL = "https://api.jup.ag/price/v2"

# After
JUPITER_PRICE_URL = "https://api.jup.ag/price/v3"
```

Also removed `vsToken` param (v3 returns USD prices directly).

#### 6. Prices returning empty `{}`

**Cause:** Jupiter v3 response format changed. V2 wrapped results in `{"data": {...}}`, v3 returns token data at the top level directly.

**Fix:** Updated response parsing in `price_monitor.py`:
```python
# Before
prices_data = data.get("data", {})

# After
prices_data = data
```

Also changed price field from `"price"` to `"usdPrice"` to match v3 response format.

---

### Current systemd Service File

`/etc/systemd/system/budju-trader.service`:
```ini
[Unit]
Description=BUDJU VPS Trading Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/budju/budju-xyz/vps
ExecStart=/home/budju/budju-xyz/vps/venv/bin/python main.py
Restart=always
RestartSec=10
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

---

### Required .env Variables

File: `/home/budju/budju-xyz/vps/.env`

```
HELIUS_API_KEY=<your key>
MONGODB_URI=<your mongodb uri>
TELEGRAM_BOT_TOKEN=<your bot token>
TELEGRAM_CHAT_ID=<your chat id>
TRADING_WALLET_KEY=<base58 private key>
JUPITER_API_KEY=<your jupiter api key>
```

Optional:
```
DRY_RUN=true              # Set to false for live trading
TRADING_ENABLED=true
MAX_SINGLE_TRADE_USD=50
MAX_DAILY_TRADES=50
MAX_DAILY_LOSS_USD=200
API_SECRET=<your secret>
DB_NAME=flub
```

---

### Useful Commands

```bash
# View live logs (Ctrl+C to exit, does NOT stop the bot)
sudo journalctl -u budju-trader -f

# View last N log lines (non-blocking)
sudo journalctl -u budju-trader --no-pager -n 30

# Restart the bot
sudo systemctl restart budju-trader

# Stop the bot
sudo systemctl stop budju-trader

# Start the bot
sudo systemctl start budju-trader

# Check if running
sudo systemctl status budju-trader

# Reload service file after editing it
sudo systemctl daemon-reload

# Test API health
curl http://localhost:8420/api/health

# Test price feed
curl http://localhost:8420/api/prices

# Update code from git
cd /home/budju/budju-xyz && git pull origin master
sudo systemctl restart budju-trader

# Activate virtualenv (for manual pip installs)
source /home/budju/budju-xyz/vps/venv/bin/activate

# Install/update dependencies
source /home/budju/budju-xyz/vps/venv/bin/activate
pip install -r /home/budju/budju-xyz/vps/requirements.txt

# Go live (disable dry run)
# 1. Edit .env: change DRY_RUN=false
nano /home/budju/budju-xyz/vps/.env
# 2. Restart
sudo systemctl restart budju-trader
```

---

### Current Status (as of 2026-03-15 17:21 UTC)

- Bot is **running** in **dry run** mode
- All 15 assets streaming live prices from Jupiter v3
- Connected to MongoDB (database: `flub`)
- Trading wallet loaded: `BCXa...TLW7`
- API server active on port 8420
