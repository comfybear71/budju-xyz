# ==========================================
# Perpetual Paper Trading Position Monitor
# ==========================================
# Runs every minute via Vercel cron to:
#   1. Fetch live prices from CoinGecko
#   2. Seed historical candles from Binance (cold-start elimination)
#   3. Store price history for indicator calculations
#   4. Update all open positions with mark prices
#   5. Check liquidation, SL, TP, trailing stops
#   6. Auto-close triggered positions
#   7. Run automated trading strategies
#   8. Snapshot equity for all active accounts
#   9. Send Telegram alerts for triggered events
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
    check_pending_orders,
    MARKETS,
    COINGECKO_IDS,
)
from perp_strategies import store_price, run_auto_trader, seed_all_markets

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

    # 0. Seed historical candles if needed (eliminates cold-start warmup)
    try:
        seed_all_markets()
    except Exception as e:
        print(f"[perp-cron] Seed error (non-fatal): {e}")

    # 1. Fetch live prices
    prices = fetch_prices()
    if not prices:
        return {"status": "no_prices", "message": "Could not fetch prices"}

    print(f"[perp-cron] Got prices for {len(prices)} markets")

    # 2. Store prices for strategy indicator calculations
    for symbol, price in prices.items():
        try:
            store_price(symbol, price)
        except Exception as e:
            print(f"[perp-cron] Price store error for {symbol}: {e}")

    # 3. Get all open positions (continue even if none — auto-trader may open new ones)
    open_positions = list(perp_positions.find({"status": "open"}))

    print(f"[perp-cron] Monitoring {len(open_positions)} open positions")

    events = []
    positions_updated = 0
    positions_closed = 0

    # 4. Update each position
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
                mode_label = "LIVE" if pos.get("trading_mode") == "live" else "PAPER"

                event = {
                    "type": action,
                    "symbol": symbol,
                    "direction": direction,
                    "pnl": pnl,
                    "wallet": wallet_short,
                    "mode": mode_label,
                }
                events.append(event)

                # Telegram alert for all closes (wins and losses)
                if pnl > 0:
                    emoji = {"take_profit": "🎯", "trailing_stop": "📐", "profit_protection": "🔒"}.get(action, "💰")
                    msg = (
                        f"{emoji} <b>{mode_label} WIN</b>\n"
                        f"📍 {symbol} {direction} {leverage}x\n"
                        f"💰 P&L: <b>+${pnl:.2f}</b>\n"
                        f"🔚 Exit: {action}"
                    )
                else:
                    emoji = {"stop_loss": "🛑", "liquidation": "💀", "trailing_stop": "📐", "profit_protection": "🔒"}.get(action, "📉")
                    msg = (
                        f"{emoji} <b>{mode_label} LOSS</b>\n"
                        f"📍 {symbol} {direction} {leverage}x\n"
                        f"💸 P&L: <b>-${abs(pnl):.2f}</b>\n"
                        f"🔚 Exit: {action}"
                    )
                send_telegram(msg)

            except Exception as e:
                print(f"[perp-cron] Error closing {pos_id}: {e}")

    # 5. Check pending orders for all accounts
    all_accounts = list(perp_accounts.find({}))
    pending_filled = 0
    for acc in all_accounts:
        try:
            triggered = check_pending_orders(acc["wallet"], prices)
            for t in triggered:
                pending_filled += 1
        except Exception as e:
            print(f"[perp-cron] Pending order check error for {acc['wallet'][:8]}: {e}")

    # 6. Run automated trading strategies
    auto_trade_actions = []
    for acc in all_accounts:
        # Skip auto-trading if kill switch is active
        if acc.get("kill_switch"):
            continue
        try:
            mode_label = "LIVE" if acc.get("trading_mode") == "live" else "PAPER"
            actions = run_auto_trader(acc["wallet"], prices)
            print(f"[perp-cron] Auto-trader for {acc['wallet'][:8]}: {len(actions)} actions")
            for action in actions:
                action_type = action.get("action", "unknown")
                if action_type == "opened":
                    auto_trade_actions.append(action)
                    # Telegram alert for trade opens
                    direction = action.get("direction", "").upper()
                    symbol = action.get("symbol", "")
                    strategy = action.get("strategy", "")
                    size = action.get("size_usd", 0)
                    leverage = action.get("leverage", 0)
                    entry = action.get("entry_price", 0)
                    sl = action.get("stop_loss", 0)
                    tp = action.get("take_profit", 0)
                    signal_txt = action.get("signal", "")
                    dir_emoji = "🟢" if direction == "LONG" else "🔴"
                    msg = (
                        f"{dir_emoji} <b>{mode_label} {direction}</b>\n"
                        f"📍 {symbol} · {strategy} · {leverage}x\n"
                        f"💵 ${size:,.0f} @ ${entry:,.2f}\n"
                        f"🛑 SL: ${sl:,.2f} · 🎯 TP: ${tp:,.2f}\n"
                        f"📝 {signal_txt}"
                    )
                    send_telegram(msg)
                else:
                    # Log all non-open actions for debugging
                    print(f"[perp-cron] {action.get('action')}: {action.get('strategy', '')} {action.get('symbol', '')} {action.get('reason', '')}")
        except Exception as e:
            print(f"[perp-cron] Auto-trader error for {acc['wallet'][:8]}: {e}")

    # 7. Snapshot equity for all active accounts
    for acc in all_accounts:
        try:
            snapshot_equity(acc["wallet"])
        except Exception as e:
            print(f"[perp-cron] Equity snapshot error for {acc['wallet'][:8]}: {e}")

    print(f"[perp-cron] Done: {positions_updated} updated, {positions_closed} closed, {len(events)} events, {len(auto_trade_actions)} auto-trades, {pending_filled} pending filled")

    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "prices": {k: v for k, v in prices.items()},
        "positions_monitored": positions_updated,
        "positions_closed": positions_closed,
        "events": events,
        "auto_trades": auto_trade_actions,
        "pending_orders_filled": pending_filled,
        "accounts_snapshotted": len(all_accounts),
    }
