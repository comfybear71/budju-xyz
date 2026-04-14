# ML Droplet Recovery & Hardening Runbook

After the compromise of `masterhq-dev-syd1` in April 2026, any replacement ML
droplet must be built with this hardened baseline from minute one. Do not
install BUDJU code on a fresh droplet until it has been hardened.

## Background

**What went wrong (April 2026):**

The original ML droplet (170.64.133.9) was compromised and used in a DDoS
attack. Likely causes: default-configured Ubuntu with password SSH, no
firewall, no fail2ban, open ports, and long-lived `MONGODB_URI` in the
environment. When the box was owned, the attacker had full database access.

**Key architectural change:**

The new ML droplet holds **zero** MongoDB credentials. Training data is pulled
from Vercel via an authenticated HTTPS endpoint. If the droplet is ever
compromised again, blast radius is limited to the ML model itself.

## Prerequisites

Before creating the new droplet:

1. **SSH key ready** — public key in DigitalOcean → Settings → Security → SSH Keys
2. **Existing secrets rotated** — MongoDB, `VPS_API_SECRET` (if shared with old
   droplet), any DO API tokens
3. **Vercel env vars ready to add** — `ML_API_URL`, `ML_API_SECRET`,
   `BUDJU_TRAINING_API_SECRET` (all generated during setup)

## Step 1 — Create the droplet

DigitalOcean control panel:

- **Image:** Ubuntu 24.04 LTS
- **Plan:** Basic shared CPU, 1GB / 1vCPU / 25GB SSD (~$6/mo)
- **Region:** Same as old droplet (Sydney / SYD1) for Vercel round-trip latency
- **Authentication:** **SSH Key** (select your key — do NOT use password)
- **Hostname:** `budju-ml-syd1`
- **Monitoring:** Enabled (catches bandwidth spikes from DDoS use)

Do NOT add any "add-ons" like user data/cloud-init scripts at creation — we
run the hardening script ourselves after verifying the box is clean.

## Step 2 — Verify SSH key login works

From your laptop/iPad:

```bash
ssh root@<new-droplet-ip>
```

Should log in without prompting for a password. If it asks for a password,
stop — the key isn't installed. Fix that first via DigitalOcean UI.

## Step 3 — Run the hardening script

Still as root:

```bash
cd /tmp
curl -O https://raw.githubusercontent.com/comfybear71/budju-xyz/master/vps/ml/setup-hardened.sh
chmod +x setup-hardened.sh
./setup-hardened.sh
```

The script will:

- Verify an SSH key exists (aborts if not — prevents lockout)
- Apply all pending OS updates
- Install Python 3.12, git, UFW, fail2ban, unattended-upgrades
- Disable SSH password login, disable root password login
- Enable UFW: deny all inbound except SSH (22) + ML API (8421)
- Enable fail2ban (3 failed SSH → 1h ban)
- Enable unattended security upgrades with 04:00 reboot window
- Create `mlbot` user (no password, no sudo, no shell login)
- Clone `budju-xyz` repo to `/home/mlbot/`
- Create Python venv, install requirements
- Generate fresh `ML_API_SECRET` and `BUDJU_TRAINING_API_SECRET`
- Create sandboxed systemd service `budju-ml` (ProtectSystem=strict, NoNewPrivileges,
  PrivateTmp, SystemCallFilter, etc.)

At the end it prints three values you must copy into Vercel.

## Step 4 — Add secrets to Vercel

BUDJU project → Settings → Environment Variables. Add for **Production +
Preview + Development**:

| Name | Value |
|---|---|
| `ML_API_URL` | `http://<new-droplet-ip>:8421` |
| `ML_API_SECRET` | (the value the script printed) |
| `BUDJU_TRAINING_API_SECRET` | (the value the script printed) |

Then Deployments → latest → Redeploy (untick "use existing build cache").

## Step 5 — Start the ML service

Back on the droplet:

```bash
systemctl start budju-ml
systemctl status budju-ml
```

Should show `active (running)` in green. If not, check logs:

```bash
journalctl -u budju-ml -n 50 --no-pager
```

## Step 6 — Verify from your laptop

```bash
# Unauthenticated liveness — should return {"status":"ok"}
curl http://<droplet-ip>:8421/ping

# Authenticated health — should return model_loaded + meta
curl -H "Authorization: Bearer <ML_API_SECRET>" http://<droplet-ip>:8421/health

# Unauthenticated health — should return 401 (proves auth is enforced)
curl -v http://<droplet-ip>:8421/health
```

## Step 7 — Initial model training

The first deploy has no model yet. Once Vercel has finished redeploying (so
`/api/ml-training-data` is live), trigger a training run:

```bash
curl -X POST \
     -H "Authorization: Bearer <ML_API_SECRET>" \
     http://<droplet-ip>:8421/retrain
```

This calls `train.py`, which fetches trades from Vercel's training-data
endpoint and trains a fresh XGBoost model. Expected response:

```json
{
  "status": "ok",
  "retrained": true,
  "meta": { "samples": 228, "accuracy": 0.78, ... }
}
```

If you see `retrained: false` with "Insufficient training data", the bot
hasn't accumulated enough closed trades yet. Not an error — keep running.

## Step 8 — Confirm end-to-end

In a new `perp-cron` cycle, tail the Vercel logs. Every auto-trade should log
an ML score in the entry reason:

```
[trend_following] signal (ML:72%)
```

If scores appear, ML is filtering trades correctly. Done.

## Ongoing operational hygiene

- **Never put `MONGODB_URI` on this box.** It doesn't need it. If you find
  yourself about to add it, stop and read the architectural fix in
  `train.py` — it pulls via HTTPS instead.
- **Never run as root.** The systemd service runs as `mlbot`. Don't change this.
- **Don't relax UFW.** The only inbound ports are SSH (22) and ML (8421). If
  you need another service, reconsider whether it belongs on this box.
- **Monitor bandwidth weekly.** A compromise used for DDoS shows as a sustained
  bandwidth spike. DigitalOcean Monitoring graphs on the droplet page.
- **Rotate `ML_API_SECRET` every 6 months** — regenerate on the droplet, update
  Vercel, redeploy. Calendar reminder.
- **Keep the droplet patched.** unattended-upgrades handles this automatically,
  but verify monthly: `unattended-upgrade --dry-run -v`.

## If this droplet is ever compromised again

Blast radius is bounded:

- Attacker gets the ML model (a joblib file) and recent training data — mildly
  interesting, not catastrophic.
- **No MongoDB credentials on this box.** They cannot touch user wallets, pool
  state, or trading history.
- **Different secret than VPS trader.** The spot trading VPS keeps running.

Response: destroy the droplet, create a new one, run `setup-hardened.sh`,
rotate `ML_API_SECRET` + `BUDJU_TRAINING_API_SECRET`, update Vercel env vars,
redeploy. ~15 min end-to-end.
