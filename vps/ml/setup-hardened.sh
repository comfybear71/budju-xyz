#!/bin/bash
# =============================================================
# BUDJU ML Signal Classifier — Hardened One-Paste Setup
# =============================================================
# Security baseline applied before any code is deployed:
#   • SSH keys only, root login disabled
#   • UFW firewall, deny by default
#   • fail2ban auto-bans brute force
#   • Unattended security upgrades enabled
#   • Non-root service user (mlbot)
#   • Systemd service sandboxed (ProtectSystem, NoNewPrivileges, PrivateTmp)
#   • VPS_API_SECRET auto-generated
#   • ML API requires Bearer token on all endpoints except /ping
#
# Written after the masterhq-dev-syd1 compromise of April 2026.
# See: docs/vps/ML_DROPLET_RECOVERY.md
#
# Usage (as root on a fresh Ubuntu 24.04 droplet):
#   1. Add your SSH public key via DigitalOcean UI before running
#   2. Paste this entire script into the DO web console or run via SSH
#   3. The script aborts if no SSH key is present (prevents lockout)
# =============================================================

set -euo pipefail

BANNER() {
    echo ""
    echo "============================================================="
    echo "  $1"
    echo "============================================================="
}

BANNER "BUDJU ML Droplet — Hardened Setup"

# --- 0. Preflight: verify we have an SSH key so we don't lock ourselves out ---
BANNER "[0/9] Preflight: SSH key check"

SSH_KEY_FOUND=0
if [ -s /root/.ssh/authorized_keys ]; then
    SSH_KEY_FOUND=1
fi
# DigitalOcean sometimes uses /root/.ssh/authorized_keys2
if [ -s /root/.ssh/authorized_keys2 ]; then
    SSH_KEY_FOUND=1
fi

if [ "$SSH_KEY_FOUND" -eq 0 ]; then
    echo ""
    echo "ABORT: No SSH public key found in /root/.ssh/authorized_keys"
    echo ""
    echo "This script disables SSH password login. Without a key you would be"
    echo "permanently locked out of this droplet."
    echo ""
    echo "Fix: In the DigitalOcean UI, destroy this droplet and recreate it with"
    echo "an SSH key attached. Or add a key manually:"
    echo "   mkdir -p /root/.ssh"
    echo "   chmod 700 /root/.ssh"
    echo "   nano /root/.ssh/authorized_keys  # paste your public key"
    echo "   chmod 600 /root/.ssh/authorized_keys"
    echo ""
    echo "Then rerun this script."
    exit 1
fi
echo "  SSH key present — safe to proceed."

# --- 1. OS updates (apply everything pending) ---
BANNER "[1/9] Applying OS security updates"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get autoremove -y
echo "  All updates applied."

# --- 2. Install required packages ---
BANNER "[2/9] Installing packages"
apt-get install -y \
    python3.12 python3.12-venv python3-pip \
    git ufw fail2ban unattended-upgrades \
    curl ca-certificates
echo "  Packages installed."

# --- 3. SSH lockdown ---
BANNER "[3/9] Hardening SSH"
SSHD_CONFIG="/etc/ssh/sshd_config"

# Back up original once
if [ ! -f "${SSHD_CONFIG}.orig" ]; then
    cp "$SSHD_CONFIG" "${SSHD_CONFIG}.orig"
fi

# Apply each setting idempotently. Drop conflicting lines first, then append our block.
sed -i '/^PasswordAuthentication /d; /^PermitRootLogin /d; /^PermitEmptyPasswords /d; /^ChallengeResponseAuthentication /d; /^KbdInteractiveAuthentication /d; /^UsePAM /d; /^X11Forwarding /d; /^MaxAuthTries /d; /^ClientAliveInterval /d; /^ClientAliveCountMax /d' "$SSHD_CONFIG"

cat >> "$SSHD_CONFIG" << 'EOF'

# --- BUDJU hardening ---
PasswordAuthentication no
PermitRootLogin prohibit-password
PermitEmptyPasswords no
ChallengeResponseAuthentication no
KbdInteractiveAuthentication no
UsePAM yes
X11Forwarding no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

# Also clear any sshd_config.d drop-ins that re-enable password auth (cloud-init default)
if [ -d /etc/ssh/sshd_config.d ]; then
    for f in /etc/ssh/sshd_config.d/*.conf; do
        [ -f "$f" ] || continue
        sed -i '/^PasswordAuthentication /d; /^PermitRootLogin /d' "$f"
    done
fi

sshd -t  # validate config
systemctl restart ssh || systemctl restart sshd
echo "  SSH locked down (keys only, root login key-only, MaxAuthTries=3)."

# --- 4. Firewall ---
BANNER "[4/9] Configuring UFW firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 8421/tcp comment "ML API (Bearer token required)"
ufw --force enable
ufw status verbose
echo "  Firewall active. Only SSH + ML API port open."
echo "  NOTE: You can later restrict 8421 to Vercel IP ranges via:"
echo "        ufw delete allow 8421/tcp"
echo "        ufw allow from <vercel_ip> to any port 8421"

# --- 5. fail2ban ---
BANNER "[5/9] Enabling fail2ban"
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = %(sshd_log)s
backend = %(sshd_backend)s
EOF
systemctl enable fail2ban
systemctl restart fail2ban
echo "  fail2ban active. 3 failed SSH attempts → 1 hour ban."

# --- 6. Unattended security upgrades ---
BANNER "[6/9] Enabling automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF

systemctl enable unattended-upgrades
systemctl restart unattended-upgrades
echo "  Auto-updates enabled. Reboots for kernel updates run at 04:00."

# --- 7. Create non-root service user ---
BANNER "[7/9] Creating service user 'mlbot'"
if id "mlbot" &>/dev/null; then
    echo "  User 'mlbot' already exists."
else
    # --disabled-password means no password login possible.
    # Home dir is created but no shell login is needed (service runs via systemd).
    adduser --disabled-password --gecos "BUDJU ML Service" mlbot
    echo "  User 'mlbot' created (no password, no sudo, no interactive login)."
fi

# --- 8. Clone repo, install Python deps, generate secret ---
BANNER "[8/9] Deploying ML service"
REPO_DIR="/home/mlbot/budju-xyz"
ML_DIR="$REPO_DIR/vps/ml"

sudo -u mlbot bash << EOF_USER
set -e
cd /home/mlbot
if [ -d "$REPO_DIR" ]; then
    echo "  Repo exists, pulling latest..."
    cd "$REPO_DIR" && git pull
else
    git clone https://github.com/comfybear71/budju-xyz.git
fi

cd "$ML_DIR"

# Create venv if missing
if [ ! -d venv ]; then
    python3.12 -m venv venv
fi

source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Generate fresh secrets if .env doesn't exist.
# ML_API_SECRET is used for predict/health/retrain auth (Vercel → ML).
# ML_TRAINING_SECRET is used for pulling training data (ML → Vercel).
# Both are distinct from VPS_API_SECRET (used by the spot VPS trader) so a compromise
# of this box does not leak credentials for the spot trader.
if [ ! -f .env ]; then
    ML_SECRET=\$(python3.12 -c "import secrets; print(secrets.token_urlsafe(32))")
    TRAIN_SECRET=\$(python3.12 -c "import secrets; print(secrets.token_urlsafe(32))")
    cat > .env << EOF2
# ML Signal Classifier — auto-generated by setup-hardened.sh
ML_API_SECRET=\$ML_SECRET
ML_API_PORT=8421
ML_API_HOST=0.0.0.0

# Training data is pulled from Vercel via /api/ml-training-data
# (no MongoDB credentials on this box)
BUDJU_TRAINING_API_URL=https://budju.xyz/api/ml-training-data
BUDJU_TRAINING_API_SECRET=\$TRAIN_SECRET
EOF2
    chmod 600 .env
    echo ""
    echo "  ====================================================="
    echo "  SECRETS TO ADD TO VERCEL (BUDJU project → Settings → Environment Variables)"
    echo "  ====================================================="
    echo ""
    echo "  Name:  ML_API_SECRET"
    echo "  Value: \$ML_SECRET"
    echo ""
    echo "  Name:  BUDJU_TRAINING_API_SECRET"
    echo "  Value: \$TRAIN_SECRET"
    echo ""
    echo "  Name:  ML_API_URL"
    echo "  Value: http://\$(curl -s ifconfig.me):8421"
    echo "  ====================================================="
    echo "  Save these NOW — they are only shown once."
    echo "  ====================================================="
fi
EOF_USER

chown -R mlbot:mlbot /home/mlbot/budju-xyz
echo "  ML service deployed to /home/mlbot/budju-xyz/vps/ml"

# --- 9. Sandboxed systemd service ---
BANNER "[9/9] Creating sandboxed systemd service"
cat > /etc/systemd/system/budju-ml.service << 'EOF'
[Unit]
Description=BUDJU ML Signal Classifier API
After=network.target
# If the service keeps crashing, give up rather than thrashing CPU
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=mlbot
Group=mlbot
WorkingDirectory=/home/mlbot/budju-xyz/vps/ml
EnvironmentFile=/home/mlbot/budju-xyz/vps/ml/.env
ExecStart=/home/mlbot/budju-xyz/vps/ml/venv/bin/python server.py
Restart=on-failure
RestartSec=10

# --- Sandboxing ---
# Process sees the real filesystem as mostly read-only. Only /home/mlbot writable.
ProtectSystem=strict
ReadWritePaths=/home/mlbot/budju-xyz/vps/ml
# Private /tmp and /var/tmp so a compromised process can't read other tenants' temp files
PrivateTmp=true
# Can't acquire new privileges via setuid binaries
NoNewPrivileges=true
# Can't access /home of other users
ProtectHome=true
# Can't modify kernel
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
# Restrict system calls to user-space only
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
# No setuid/setgid binaries
RestrictSUIDSGID=true
# Can only use IPv4/IPv6 sockets
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable budju-ml
# Do NOT auto-start — operator must fill BUDJU_TRAINING_API_URL/SECRET first
echo "  Service created and enabled (will auto-start on boot)."
echo "  NOT started yet — finish the post-install checklist below first."

# --- Summary ---
BANNER "HARDENED SETUP COMPLETE"
cat << 'EOF'

Your ML droplet is now hardened. Final steps (you do these):

  1. Add the three env vars printed above to Vercel:
       BUDJU project → Settings → Environment Variables (Production + Preview)
         ML_API_SECRET             (predict/health/retrain auth)
         BUDJU_TRAINING_API_SECRET (training-data pull auth)
         ML_API_URL                (this droplet's URL)
       Then redeploy Vercel (Deployments → Redeploy).

  2. Start the ML service:
       systemctl start budju-ml
       systemctl status budju-ml

  3. Verify liveness from your laptop:
       curl http://<droplet-ip>:8421/ping
       (should return {"status":"ok"})

  4. Verify auth works:
       curl -H "Authorization: Bearer <ML_API_SECRET>" http://<droplet-ip>:8421/health
       (should return model_loaded + meta)

  5. Retrain the model from Vercel training data:
       curl -X POST -H "Authorization: Bearer <ML_API_SECRET>" \
            http://<droplet-ip>:8421/retrain

Security checklist now in effect:
  [x] SSH keys only, root password disabled
  [x] UFW firewall, deny inbound except SSH + 8421
  [x] fail2ban: 3 failed SSH → 1h ban
  [x] Unattended security upgrades, auto-reboot at 04:00
  [x] Service runs as non-root 'mlbot' user
  [x] Systemd sandbox: ProtectSystem=strict, NoNewPrivileges, PrivateTmp, etc.
  [x] ML API bearer token required on all endpoints except /ping
  [x] No MongoDB credentials on this box (training via Vercel endpoint)

EOF
