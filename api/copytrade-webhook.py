# ==========================================
# Signals / Copy Trading — Helius webhook receiver
# ==========================================
# Delivery target for the Enhanced webhook api/copytrade_helius.py keeps in
# sync with the active tracked-wallet list (see api/copytrade-cron.py).
# Standalone handler, same shape as api/desk-brief-cron.py — not routed
# through api/index.py's CORS/rate-limit machinery since this is
# server-to-server (Helius -> BUDJU), not browser traffic.
#
# Fail-closed auth (see CLAUDE.md lesson 21): if COPYTRADE_WEBHOOK_SECRET
# isn't configured, EVERY delivery is rejected rather than accepted —
# accepting unauthenticated POSTs here would let anyone forge "this wallet
# made a winning trade" events straight onto the public leaderboard.
# ==========================================

import json
import os
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.dirname(__file__))

from database import (
    get_trackable_copytrade_wallet_addresses,
    get_copytrade_wallet,
    record_copytrade_event,
    open_copytrade_position,
    get_open_copytrade_position,
    close_copytrade_position,
)
from copytrade_helius import parse_helius_swap, COPYTRADE_WEBHOOK_SECRET
from copytrade_engine import evaluate_entry, get_dexscreener_prices, COPYTRADE_PAPER_SIZE_USD

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "-1002398835975")
COPYTRADE_TELEGRAM_ALERTS = os.getenv("COPYTRADE_TELEGRAM_ALERTS", "true").lower() != "false"


def send_telegram(text: str) -> None:
    if not TELEGRAM_BOT_TOKEN or not COPYTRADE_TELEGRAM_ALERTS:
        return
    try:
        body = json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}).encode()
        req = Request(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            data=body, headers={"Content-Type": "application/json"}, method="POST",
        )
        urlopen(req, timeout=10)
    except Exception as e:
        print(f"[copytrade-webhook] telegram error: {e}")


def _short(addr: str) -> str:
    return f"{addr[:4]}...{addr[-4:]}" if addr and len(addr) > 8 else (addr or "?")


def handle_delivery(payload) -> dict:
    txs = payload if isinstance(payload, list) else [payload]
    # "pending" wallets must be included here too — see
    # get_trackable_copytrade_wallet_addresses()'s docstring.
    tracked = set(get_trackable_copytrade_wallet_addresses())
    opened, closed, ignored = 0, 0, 0

    for tx in txs:
        if not isinstance(tx, dict):
            continue
        event = parse_helius_swap(tx, tracked)
        if not event:
            ignored += 1
            continue

        is_new = record_copytrade_event(event)
        if not is_new:
            continue  # already processed this signature (Helius retry)

        wallet = event["walletAddress"]
        mint = event["tokenMint"]
        wallet_doc = get_copytrade_wallet(wallet) or {}
        label = wallet_doc.get("label") or _short(wallet)

        if event["side"] == "buy":
            decision = evaluate_entry(mint)
            if not decision["approved"]:
                print(f"[copytrade-webhook] skip buy {label} {mint}: {decision['reason']}")
                continue
            entry_price = decision["priceUsd"]
            doc = open_copytrade_position({
                "walletAddress": wallet,
                "walletLabel": label,
                "tokenMint": mint,
                "tokenSymbol": decision.get("symbol") or "?",
                "entryPriceUsd": entry_price,
                "entryAmountUsd": COPYTRADE_PAPER_SIZE_USD,
                "entrySignature": event["signature"],
                "liquidityUsd": decision.get("liquidityUsd", 0),
            })
            if doc:
                opened += 1
                send_telegram(
                    f"🟢 <b>Signals: paper BUY</b>\n"
                    f"👛 {label} bought <b>{decision.get('symbol') or mint[:6]}</b>\n"
                    f"💵 Paper size ${COPYTRADE_PAPER_SIZE_USD:,.0f} @ ${entry_price:.6g}\n"
                    f"📝 Followed automatically — paper trade only, no real funds."
                )
        elif event["side"] == "sell":
            position = get_open_copytrade_position(wallet, mint)
            if not position:
                continue  # nothing BUDJU was paper-following on this token
            prices = get_dexscreener_prices([mint])
            exit_price = (prices.get(mint) or {}).get("priceUsd") or position.get("entryPriceUsd")
            result = close_copytrade_position(position, exit_price, "signal_sell")
            closed += 1
            pnl = result["pnlUsd"]
            emoji = "💰" if pnl >= 0 else "📉"
            send_telegram(
                f"{emoji} <b>Signals: paper SELL</b>\n"
                f"👛 {label} sold <b>{position.get('tokenSymbol') or mint[:6]}</b>\n"
                f"P&L: <b>{'+' if pnl >= 0 else ''}{pnl:.2f}</b> ({result['pnlPct']:+.1f}%)"
            )

    return {"ok": True, "received": len(txs), "opened": opened, "closed": closed, "ignored": ignored}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        auth = self.headers.get("Authorization", "")
        if not COPYTRADE_WEBHOOK_SECRET or auth != COPYTRADE_WEBHOOK_SECRET:
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "unauthorized"}).encode())
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            payload = json.loads(raw.decode() or "{}")
            result = handle_delivery(payload)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        except Exception as e:
            print(f"[copytrade-webhook] error: {e}")
            self.send_response(200)  # ack anyway — don't make Helius retry on our own bug
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode())

    def do_GET(self):
        # Liveness probe only — no data.
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok", "ts": datetime.utcnow().isoformat()}).encode())
