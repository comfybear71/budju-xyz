# ==========================================
# Signals — shared swap processing (used by the Helius webhook AND the backup wallet puller)
# ==========================================
import json
import os
import sys
import time
from datetime import datetime
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.dirname(__file__))

from database import (
    get_trackable_copytrade_wallet_addresses,
    get_copytrade_wallet,
    record_copytrade_event,
    set_copytrade_event_outcome,
    open_copytrade_position,
    get_open_copytrade_position,
    close_copytrade_position,
    count_copytrade_buyers,
    claim_convergence_alert,
    set_copytrade_event_convergence,
)
from copytrade_helius import parse_helius_swap
from copytrade_engine import evaluate_entry, get_dexscreener_prices, COPYTRADE_PAPER_SIZE_USD

CONVERGENCE_MIN_WALLETS = int(os.getenv("COPYTRADE_CONVERGENCE_MIN", "3"))
CONVERGENCE_WINDOW_HOURS = 6

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


def handle_delivery(payload, max_age_s=None) -> dict:
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

        late = bool(max_age_s and event.get("blockTime") and (time.time() - float(event["blockTime"])) > max_age_s)

        if event["side"] == "buy":
            _check_convergence(event, mint, label)
            if late:
                set_copytrade_event_outcome(event["signature"], "late", "seen too long after it happened to copy")
                continue
            decision = evaluate_entry(mint)
            if not decision["approved"]:
                print(f"[copytrade-webhook] skip buy {label} {mint}: {decision['reason']}")
                set_copytrade_event_outcome(event["signature"], "skipped", str(decision.get("reason") or ""), decision.get("symbol") or "")
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
            set_copytrade_event_outcome(event["signature"], "copied" if doc else "skipped",
                                        "" if doc else "already following", decision.get("symbol") or "")
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
                set_copytrade_event_outcome(event["signature"], "ignored", "we were not following this token")
                continue  # nothing BUDJU was paper-following on this token
            prices = get_dexscreener_prices([mint])
            exit_price = (prices.get(mint) or {}).get("priceUsd") or position.get("entryPriceUsd")
            result = close_copytrade_position(position, exit_price, "signal_sell")
            closed += 1
            pnl = result["pnlUsd"]
            set_copytrade_event_outcome(event["signature"], "closed", f"paper P&L {pnl:+.2f}", position.get("tokenSymbol") or "")
            emoji = "💰" if pnl >= 0 else "📉"
            send_telegram(
                f"{emoji} <b>Signals: paper SELL</b>\n"
                f"👛 {label} sold <b>{position.get('tokenSymbol') or mint[:6]}</b>\n"
                f"P&L: <b>{'+' if pnl >= 0 else ''}{pnl:.2f}</b> ({result['pnlPct']:+.1f}%)"
            )

    return {"ok": True, "received": len(txs), "opened": opened, "closed": closed, "ignored": ignored}




def _check_convergence(event: dict, mint: str, label: str) -> None:
    """Several different tracked wallets buying the same token close together is the strongest
    signal we can see for free. Mark the swap and tell Telegram (once per token per window)."""
    try:
        n = count_copytrade_buyers(mint, CONVERGENCE_WINDOW_HOURS)
        if n < CONVERGENCE_MIN_WALLETS:
            return
        set_copytrade_event_convergence(event["signature"], n)
        if claim_convergence_alert(mint, CONVERGENCE_WINDOW_HOURS):
            prices = get_dexscreener_prices([mint])
            sym = (prices.get(mint) or {}).get("symbol") or mint[:6]
            send_telegram(
                f"🔥 <b>Signals: convergence</b>\n"
                f"{n} different tracked wallets bought <b>{sym}</b> in the last {CONVERGENCE_WINDOW_HOURS}h.\n"
                f"📝 Watching only — paper trading, not advice. Tokens like this can be pumps; check before acting."
            )
    except Exception as e:
        print(f"[copytrade] convergence check error: {e}")
