# VPS Trading Bot — Setup Guide

## 1. Get a VPS

Sign up at [Hetzner](https://www.hetzner.com/cloud/) or [DigitalOcean](https://www.digitalocean.com/).

- **Plan:** Cheapest option ($4-5/month)
- **OS:** Ubuntu 24.04
- **Region:** Pick the closest to you (reduces latency to Solana RPCs)

## 2. Initial Server Setup

SSH into your new server:

```bash
ssh root@YOUR_SERVER_IP
```

Set up a non-root user and basic security:

```bash
# Create user
adduser budju
usermod -aG sudo budju

# Set up firewall
ufw allow OpenSSH
ufw allow 8420/tcp    # Trading bot API port
ufw enable

# Switch to new user
su - budju
```

## 3. Install Python

```bash
sudo apt update && sudo apt install -y python3.12 python3.12-venv python3-pip git
```

## 4. Clone and Set Up the Bot

```bash
# Clone your repo (or just copy the vps/ folder)
git clone https://github.com/YOUR_USER/budju-xyz.git
cd budju-xyz/vps

# Create virtual environment
python3.12 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## 5. Create a Trading Wallet

**IMPORTANT:** Create a NEW wallet for trading. Never use your main wallet.

```bash
# Generate a new Solana keypair
solana-keygen new --outfile ~/trading-wallet.json

# Get the public key (you'll fund this wallet)
solana-keygen pubkey ~/trading-wallet.json

# Get the private key in base58 for the .env file
python3 -c "
import json, base58
with open('$HOME/trading-wallet.json') as f:
    key_bytes = bytes(json.load(f))
print(base58.b58encode(key_bytes).decode())
"
```

Fund this wallet with:
- Some SOL for transaction fees (~0.1 SOL is plenty)
- USDC for trading ($1000 as planned)

You can send USDC to the wallet address from any Solana wallet (Phantom, etc).

## 6. Configure Environment

```bash
cp .env.example .env
nano .env
```

Fill in:
- `HELIUS_API_KEY` — from your existing Vercel deployment
- `TRADING_WALLET_KEY` — the base58 key from step 5
- `MONGODB_URI` — from your existing Vercel deployment
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` — for trade notifications
- `API_SECRET` — generate one: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`

**Start with `DRY_RUN=true`** to test without real trades.

## 7. Test It

```bash
source venv/bin/activate
python main.py
```

You should see:
```
BUDJU VPS Trading Bot starting...
  Trading: True | Dry Run: True
Connected to MongoDB: flub
Trading wallet loaded: XXXX...XXXX
Price monitor started — checking every 5s
API server started on http://0.0.0.0:8420
All services running. Press Ctrl+C to stop.
Prices updated: 16 assets, e.g. SOL=$150.32
```

Test the API:
```bash
curl http://localhost:8420/api/health
curl http://localhost:8420/api/prices
```

## 8. Run as a Service (Persistent)

Create a systemd service so the bot runs 24/7 and auto-restarts:

```bash
sudo nano /etc/systemd/system/budju-trader.service
```

Paste:
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

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable budju-trader
sudo systemctl start budju-trader

# Check status
sudo systemctl status budju-trader

# View logs
sudo journalctl -u budju-trader -f
```

## 9. Connect the Dashboard

On your local machine or in the Vercel environment, add:

```
VITE_VPS_API_URL=http://YOUR_SERVER_IP:8420
VITE_VPS_API_SECRET=your_api_secret_here
```

Then visit `https://budju.xyz/spot` to use the trading dashboard.

## 10. Go Live

Once you're happy with dry-run testing:

1. Edit `.env` on the VPS: change `DRY_RUN=false`
2. Restart: `sudo systemctl restart budju-trader`
3. The dashboard will show "Connected" without the "PAPER" badge

## Security Notes

- The API port (8420) is open but protected by `API_SECRET`
- For extra security, set up HTTPS with a reverse proxy (nginx + Let's Encrypt)
- Or restrict the firewall to only allow your IP: `ufw allow from YOUR_IP to any port 8420`
- The trading wallet should only hold what you're willing to risk
- Circuit breakers prevent runaway losses (configurable in `.env`)

## Useful Commands

```bash
# View live logs
sudo journalctl -u budju-trader -f

# Restart the bot
sudo systemctl restart budju-trader

# Stop the bot
sudo systemctl stop budju-trader

# Update code
cd ~/budju-xyz && git pull
sudo systemctl restart budju-trader
```
