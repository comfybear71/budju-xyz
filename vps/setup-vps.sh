#!/bin/bash
# =============================================================
# BUDJU VPS Trading Bot — One-Paste Setup Script
# =============================================================
# Paste this entire script into the DigitalOcean web console.
# It will set up everything automatically.
# =============================================================

set -e

echo "========================================="
echo "  BUDJU VPS Trading Bot — Setup Starting"
echo "========================================="

# --- 1. Create budju user ---
echo ""
echo "[1/6] Creating 'budju' user..."
if id "budju" &>/dev/null; then
    echo "  User 'budju' already exists, skipping."
else
    adduser --disabled-password --gecos "BUDJU Bot" budju
    echo "budju:budju2026!" | chpasswd
    usermod -aG sudo budju
    echo "  User 'budju' created (password: budju2026! — change this later!)"
fi

# --- 2. Firewall ---
echo ""
echo "[2/6] Setting up firewall..."
ufw allow OpenSSH
ufw allow 8420/tcp
echo "y" | ufw enable
echo "  Firewall enabled: SSH + port 8420 open."

# --- 3. Install Python & dependencies ---
echo ""
echo "[3/6] Installing Python 3.12 and git..."
apt update -y
apt install -y python3.12 python3.12-venv python3-pip git
echo "  Python installed."

# --- 4. Clone repo and set up ---
echo ""
echo "[4/6] Cloning repo and installing Python packages..."
sudo -u budju bash -c '
cd /home/budju
if [ -d "budju-xyz" ]; then
    echo "  Repo already exists, pulling latest..."
    cd budju-xyz && git pull
else
    git clone https://github.com/comfybear71/budju-xyz.git
    cd budju-xyz
fi
cd vps
python3.12 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
echo "  Python packages installed."
'

# --- 5. Create .env from template ---
echo ""
echo "[5/6] Creating .env file..."
sudo -u budju bash -c '
cd /home/budju/budju-xyz/vps
if [ -f .env ]; then
    echo "  .env already exists, skipping."
else
    cp .env.example .env
    # Generate a random API secret
    API_SECRET=$(python3.12 -c "import secrets; print(secrets.token_urlsafe(32))")
    sed -i "s/generate_a_random_secret_here/$API_SECRET/" .env
    echo "  .env created with auto-generated API_SECRET."
    echo "  *** YOU STILL NEED TO FILL IN: ***"
    echo "    - HELIUS_API_KEY"
    echo "    - TRADING_WALLET_KEY"
    echo "    - MONGODB_URI"
    echo "    - TELEGRAM_BOT_TOKEN"
    echo "    - TELEGRAM_CHAT_ID"
fi
'

# --- 6. Create systemd service ---
echo ""
echo "[6/6] Creating systemd service..."
cat > /etc/systemd/system/budju-trader.service << 'EOF'
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
EOF

systemctl daemon-reload
systemctl enable budju-trader
echo "  Service created and enabled (will auto-start on boot)."

# --- Done! ---
echo ""
echo "========================================="
echo "  SETUP COMPLETE!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Edit the .env file with your keys:"
echo "     nano /home/budju/budju-xyz/vps/.env"
echo ""
echo "  2. Create a trading wallet (or use an existing one):"
echo "     See SETUP.md step 5"
echo ""
echo "  3. Start the bot:"
echo "     sudo systemctl start budju-trader"
echo ""
echo "  4. Check logs:"
echo "     sudo journalctl -u budju-trader -f"
echo ""
echo "  5. Change the budju user password:"
echo "     passwd budju"
echo ""
echo "  VPS IP: $(curl -s ifconfig.me)"
echo "  API will be at: http://$(curl -s ifconfig.me):8420"
echo ""
