# ==========================================
# Perpetual Paper Trading Position Monitor
# ==========================================
# Runs every minute via Vercel cron to:
#   1. Fetch live prices from CoinGecko
#   2. Update all open positions with mark prices
#   3. Check liquidation, SL, TP, trailing stops
#   4. Auto-close triggered positions
#   5. Snapshot equity for all active accounts
#   6. Send Telegram alerts for triggered events
# ==========================================

import os
import sys
import json
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import HTTPError

sys.path.insert(0, os.path.dirname(__file__))

from perp_engine import (
    perp_accounts,
    perp_positions,
    update_position_price,
    close_position,
    snapshot_equity,
    MARKETS,
    COINGECKO_IDS,
)

# ── Config ────────────────────────────────────────────────────────────

COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = -1002398835975
CRON_SECRET = os.getenv("CRON_SECRET", "")


def fetch_prices() -> dict:
    """Fetch live USD prices from CoinGecko for all perp markets."""
    url = f"{COINGECKO_URL}?ids={COINGECKO_IDS}&vs_currencies=usd"
    req = Request(url, headers={"Accept": "application/json"})
    try:
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            # Map coingecko_id → USD price
            prices = {}
            for symbol, info in MARKETS.items():
                cg_id = info["base"]
                if cg_id in data and "usd" in data[cg_id]:
                    prices[symbol] = data[cg_id]["usd"]
            return prices
    except Exception as e:
        print(f"[perp-cron] Price fetch error: {e}")
        return {}


def send_telegram(message: str):
    """Send a Telegram notification."""
    if not TELEGRAM_BOT_TOKEN:
        return
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = json.dumps({
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }).encode()
        req = Request(url, data=payload, headers={"Content-Type": "application/json"})
        urlopen(req, timeout=10)
    except Exception as e:
        print(f"[perp-cron] Telegram error: {e}")


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Verify cron secret
        auth = self.headers.get("Authorization", "")
        if CRON_SECRET and f"Bearer {CRON_SECRET}" != auth:
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Unauthorized"}).encode())
            return

        try:
            result = run_perp_monitor()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())


def run_perp_monitor() -> dict:
    """Main monitor loop — fetch prices, update positions, check triggers."""
    print(f"[perp-cron] Starting at {datetime.utcnow().isoformat()}")

    # 1. Fetch live prices
    prices = fetch_prices()
    if not prices:
        return {"status": "no_prices", "message": "Could not fetch prices"}

    print(f"[perp-cron] Got prices for {len(prices)} markets")

    # 2. Get all open positions
    open_positions = list(perp_positions.find({"status": "open"}))
    if not open_positions:
        return {"status": "ok", "positions": 0, "prices": len(prices)}

    print(f"[perp-cron] Monitoring {len(open_positions)} open positions")

    events = []
    positions_updated = 0
    positions_closed = 0

    # 3. Update each position
    for pos in open_positions:
        symbol = pos["symbol"]
        if symbol not in prices:
            continue

        mark_price = prices[symbol]
        result = update_position_price(pos, mark_price)
        positions_updated += 1

        action = result.get("action")
        if action:
            pos_id = str(pos["_id"])
            wallet_short = pos["account_id"][:4] + "..." + pos["account_id"][-4:]
            direction = pos["direction"].upper()
            leverage = pos["leverage"]

            try:
                trade = close_position(pos_id, mark_price, action)
                positions_closed += 1

                pnl = trade.get("realized_pnl", 0)
                pnl_sign = "+" if pnl >= 0 else ""

                event = {
                    "type": action,
                    "symbol": symbol,
                    "direction": direction,
                    "pnl": pnl,
                    "wallet": wallet_short,
                }
                events.append(event)

                # Telegram alert
                emoji = {"liquidation": "💀", "stop_loss": "🛑", "take_profit": "🎯", "trailing_stop": "📐"}.get(action, "📊")
                msg = (
                    f"{emoji} <b>PAPER {action.upper().replace('_', ' ')}</b>\n"
                    f"📍 {symbol} {direction} {leverage}x\n"
                    f"💰 P&L: <b>{pnl_sign}${pnl:.2f}</b>\n"
                    f"👤 {wallet_short}"
                )
                send_telegram(msg)

            except Exception as e:
                print(f"[perp-cron] Error closing {pos_id}: {e}")

    # 4. Snapshot equity for all active accounts
    active_wallets = set(p["account_id"] for p in open_positions)
    # Also include accounts that may have just had positions closed
    all_accounts = list(perp_accounts.find({}))
    for acc in all_accounts:
        try:
            snapshot_equity(acc["wallet"])
        except Exception as e:
            print(f"[perp-cron] Equity snapshot error for {acc['wallet'][:8]}: {e}")

    print(f"[perp-cron] Done: {positions_updated} updated, {positions_closed} closed, {len(events)} events")

    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "prices": {k: v for k, v in prices.items()},
        "positions_monitored": positions_updated,
        "positions_closed": positions_closed,
        "events": events,
        "accounts_snapshotted": len(all_accounts),
    }
