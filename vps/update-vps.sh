#!/bin/bash
# VPS Update Script — Run this on your VPS to apply all changes
# Usage: bash /home/budju/budju-xyz/vps/update-vps.sh

set -e
echo "=== Updating VPS Trading Bot ==="

cd /home/budju/budju-xyz/vps

# ── 1. Update config.py — add runtime dict ──
if grep -q "runtime" config.py; then
  echo "config.py: runtime already exists, skipping"
else
  cat >> config.py << 'EOF'

# Runtime-mutable state (changed via /api/config)
runtime = {
    "trading_enabled": TRADING_ENABLED,
    "dry_run": DRY_RUN,
}
EOF
  echo "config.py: added runtime dict"
fi

# ── 2. Update trader.py — use runtime instead of constants ──
# Replace import line
sed -i 's/TRADING_WALLET_KEY, TRADING_ENABLED, DRY_RUN,/TRADING_WALLET_KEY,/' trader.py
sed -i 's/MAX_SINGLE_TRADE_USD, MAX_DAILY_TRADES, MAX_DAILY_LOSS_USD,/MAX_SINGLE_TRADE_USD, MAX_DAILY_TRADES, MAX_DAILY_LOSS_USD,\n    DEFAULT_SLIPPAGE_BPS, runtime,/' trader.py
sed -i '/DEFAULT_SLIPPAGE_BPS,$/d' trader.py 2>/dev/null || true

# Fix: ensure the import block is correct
python3 -c "
content = open('trader.py').read()
# Fix imports
old_import = '''from config import (
    ASSETS, USDC_MINT, HELIUS_RPC,
    TRADING_WALLET_KEY,
    MAX_SINGLE_TRADE_USD, MAX_DAILY_TRADES, MAX_DAILY_LOSS_USD,
    DEFAULT_SLIPPAGE_BPS, runtime,
)'''
if 'runtime' not in content:
    content = content.replace(
        '''from config import (
    ASSETS, USDC_MINT, HELIUS_RPC,
    TRADING_WALLET_KEY, TRADING_ENABLED, DRY_RUN,
    MAX_SINGLE_TRADE_USD, MAX_DAILY_TRADES, MAX_DAILY_LOSS_USD,
    DEFAULT_SLIPPAGE_BPS,
)''',
        '''from config import (
    ASSETS, USDC_MINT, HELIUS_RPC,
    TRADING_WALLET_KEY,
    MAX_SINGLE_TRADE_USD, MAX_DAILY_TRADES, MAX_DAILY_LOSS_USD,
    DEFAULT_SLIPPAGE_BPS, runtime,
)''')
# Replace constant references with runtime dict
content = content.replace('TRADING_ENABLED, DRY_RUN, MAX_SINGLE_TRADE_USD', 'runtime[\"trading_enabled\"], runtime[\"dry_run\"], MAX_SINGLE_TRADE_USD')
content = content.replace('if not TRADING_ENABLED:', 'if not runtime[\"trading_enabled\"]:')
content = content.replace('if DRY_RUN:', 'if runtime[\"dry_run\"]:')
open('trader.py', 'w').write(content)
print('trader.py: updated to use runtime dict')
"

# ── 3. Update api_server.py — add /api/config endpoint + use runtime ──
python3 -c "
content = open('api_server.py').read()

# Fix import
content = content.replace(
    'from config import API_HOST, API_PORT, API_SECRET, ASSETS, DRY_RUN, TRADING_ENABLED',
    'from config import API_HOST, API_PORT, API_SECRET, ASSETS, runtime'
)

# Replace constant references
content = content.replace('\"trading_enabled\": TRADING_ENABLED,', '\"trading_enabled\": runtime[\"trading_enabled\"],')
content = content.replace('\"dry_run\": DRY_RUN,', '\"dry_run\": runtime[\"dry_run\"],')

# Add config routes if not present
if '/api/config' not in content:
    content = content.replace(
        'self.app.router.add_post(\"/api/sell\", self._sell)',
        '''self.app.router.add_post(\"/api/sell\", self._sell)
        self.app.router.add_post(\"/api/config\", self._update_config)
        self.app.router.add_get(\"/api/config\", self._get_config)'''
    )

# Add config handler methods if not present
if '_get_config' not in content:
    content = content.replace(
        '    async def start(self):',
        '''    async def _get_config(self, request: web.Request) -> web.Response:
        if not verify_auth(request):
            return json_response({\"error\": \"Unauthorized\"}, 401)
        return json_response({
            \"trading_enabled\": runtime[\"trading_enabled\"],
            \"dry_run\": runtime[\"dry_run\"],
        })

    async def _update_config(self, request: web.Request) -> web.Response:
        if not verify_auth(request):
            return json_response({\"error\": \"Unauthorized\"}, 401)
        try:
            body = await request.json()
        except Exception:
            return json_response({\"error\": \"Invalid JSON\"}, 400)
        changed = []
        if \"trading_enabled\" in body:
            runtime[\"trading_enabled\"] = bool(body[\"trading_enabled\"])
            changed.append(f\"trading_enabled={runtime[\'trading_enabled\']}\")
        if \"dry_run\" in body:
            runtime[\"dry_run\"] = bool(body[\"dry_run\"])
            changed.append(f\"dry_run={runtime[\'dry_run\']}\")
        if changed:
            logger.info(\"Config updated via API: %s\", \", \".join(changed))
        return json_response({
            \"trading_enabled\": runtime[\"trading_enabled\"],
            \"dry_run\": runtime[\"dry_run\"],
        })

    async def start(self):'''
    )

open('api_server.py', 'w').write(content)
print('api_server.py: updated with /api/config endpoint')
"

# ── 4. Update main.py — use runtime ──
sed -i 's/from config import MONGODB_URI, DB_NAME, DRY_RUN, TRADING_ENABLED/from config import MONGODB_URI, DB_NAME, runtime/' main.py
sed -i 's/TRADING_ENABLED, DRY_RUN/runtime["trading_enabled"], runtime["dry_run"]/' main.py
echo "main.py: updated to use runtime dict"

# ── 5. Restart the service ──
echo ""
echo "=== Restarting budju-trader service ==="
sudo systemctl restart budju-trader
sleep 2
sudo journalctl -u budju-trader --no-pager -n 10

echo ""
echo "=== Done! Test with: curl http://localhost:8420/api/config ==="
