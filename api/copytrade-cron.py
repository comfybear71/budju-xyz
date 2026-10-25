# ==========================================
# Signals / Copy Trading — orchestrator cron
# ==========================================
# Runs every 5 minutes (vercel.json). Two jobs, split by cost:
#   1. EVERY run (cheap, DexScreener only): re-price every open paper
#      position, apply the paper-only stop-loss / max-hold safety net.
#   2. At most hourly (gated by copytrade_state.walletsRefreshedAt):
#      re-pull the Dune seed list, re-score every non-excluded wallet
#      through the wash-trade/sniper filter, and — only if the resulting
#      active-wallet set actually changed — push a Helius webhook
#      update (each webhook create/update call costs Helius credits, so
#      this is the one thing worth avoiding when nothing changed).
# ==========================================

import os
import sys
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(__file__))

from database import (
    get_copytrade_state,
    save_copytrade_state,
    get_open_copytrade_positions,
    update_copytrade_position_price,
    close_copytrade_position,
    get_copytrade_wallets_for_filtering,
    apply_copytrade_filter_result,
    get_active_copytrade_wallet_addresses,
    upsert_copytrade_wallets,
)
from copytrade_dune import fetch_dune_candidate_wallets
from copytrade_filters import score_wallet
from copytrade_helius import sync_helius_webhook, addresses_hash
from copytrade_engine import get_dexscreener_prices, COPYTRADE_STOP_LOSS_PCT, COPYTRADE_MAX_HOLD_HOURS

CRON_SECRET = os.getenv("CRON_SECRET", "")
WALLET_REFRESH_INTERVAL = timedelta(hours=1)


def _price_and_manage_open_positions() -> dict:
    open_positions = get_open_copytrade_positions()
    if not open_positions:
        return {"priced": 0, "closed": 0}

    mints = sorted({p["tokenMint"] for p in open_positions if p.get("tokenMint")})
    prices = get_dexscreener_prices(mints)
    now = datetime.utcnow()
    priced, closed = 0, 0

    for pos in open_positions:
        info = prices.get(pos.get("tokenMint"))
        if not info or not info.get("priceUsd"):
            continue  # try again next run rather than closing on a pricing gap
        current_price = info["priceUsd"]
        update_copytrade_position_price(pos["_id"], current_price)
        priced += 1

        entry_price = pos.get("entryPriceUsd") or 0
        pnl_pct = ((current_price - entry_price) / entry_price * 100) if entry_price else 0.0
        entry_at = pos.get("entryAt")
        hold_hours = (now - entry_at).total_seconds() / 3600 if entry_at else 0.0

        if pnl_pct <= COPYTRADE_STOP_LOSS_PCT:
            close_copytrade_position(pos, current_price, "stop_loss")
            closed += 1
        elif hold_hours >= COPYTRADE_MAX_HOLD_HOURS:
            close_copytrade_position(pos, current_price, "max_hold_timeout")
            closed += 1

    return {"priced": priced, "closed": closed}


def _refresh_wallets_if_due() -> dict:
    state = get_copytrade_state()
    refreshed_at = state.get("walletsRefreshedAt")
    now = datetime.utcnow()
    if refreshed_at and (now - refreshed_at) < WALLET_REFRESH_INTERVAL:
        return {"skipped": True}

    candidates = fetch_dune_candidate_wallets()
    seed_result = upsert_copytrade_wallets(candidates) if candidates else {"inserted": 0, "touched": 0}

    scored = 0
    for wallet_doc in get_copytrade_wallets_for_filtering():
        result = score_wallet(wallet_doc.get("stats", {}))
        if result["status"] != "pending":
            apply_copytrade_filter_result(wallet_doc["address"], result["flags"], result["status"], result["reason"])
            scored += 1

    active_addresses = get_active_copytrade_wallet_addresses()
    new_hash = addresses_hash(active_addresses) if active_addresses else None
    webhook_result = {"skipped": "no active wallets or unchanged"}
    if active_addresses and new_hash != state.get("heliusAddressesHash"):
        webhook_result = sync_helius_webhook(active_addresses, state.get("heliusWebhookId"))
        if webhook_result.get("ok"):
            save_copytrade_state({
                "heliusWebhookId": webhook_result["webhookId"],
                "heliusAddressesHash": new_hash,
                "walletsRefreshedAt": now,
            })
        else:
            # Don't hammer Dune/Helius again in 5 minutes just because the
            # webhook push failed (e.g. no HELIUS_API_KEY yet) — still mark
            # the wallet-list refresh itself as done.
            save_copytrade_state({"walletsRefreshedAt": now})
    else:
        save_copytrade_state({"walletsRefreshedAt": now})

    return {
        "skipped": False,
        "candidatesFound": len(candidates),
        "seedResult": seed_result,
        "walletsScored": scored,
        "activeWallets": len(active_addresses),
        "webhookResult": webhook_result,
    }


def run_copytrade_cron() -> dict:
    positions_result = _price_and_manage_open_positions()
    wallets_result = _refresh_wallets_if_due()
    return {
        "ok": True,
        "timestamp": datetime.utcnow().isoformat(),
        "positions": positions_result,
        "wallets": wallets_result,
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        import json
        auth = self.headers.get("Authorization", "")
        if CRON_SECRET and f"Bearer {CRON_SECRET}" != auth:
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Unauthorized"}).encode())
            return
        try:
            result = run_copytrade_cron()
            self.send_response(200)
        except Exception as e:
            result = {"ok": False, "error": str(e)}
            self.send_response(500)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())
