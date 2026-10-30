# ==========================================
# One-time catch-up buys for the NON-admin wallets
# ==========================================
# On 2026-10-31 the admin wallet bought 12 signals (below) at the restored
# targets while the other wallets, which then had private targets, did not.
# Now that every wallet follows the same shared targets, this lets each
# other wallet make those same buys ONCE, sized by its own balance.
#
# It does not place orders itself. Arming writes `autoCatchUp` into the shared
# trader state; the normal cron then lets each wallet buy each signal once,
# through the exact same guards (reserve, caps, daily limit, real-fill
# recording, Telegram) — and only while the price is still at/below the
# signal's ORIGINAL buy target, so nobody buys above the signal.
#
#   GET /api/admin/catchup-buys?admin_wallet=...            PREVIEW (writes nothing)
#   GET /api/admin/catchup-buys?admin_wallet=...&apply=1    ARM (cron buys next cycle)
#   add &force=1 to re-arm while one is still active.

import os
import time
from datetime import datetime

from database import (
    ADMIN_WALLETS,
    decrypt_secret,
    get_prices_for_coins,
    get_trader_state,
    get_user_trader_state,
    save_trader_state,
    user_exchange_keys_collection,
)
from restore_targets import RESTORE_TARGETS
from swyftx_client import SwyftxClient

# The 12 buys the admin wallet actually made (Telegram, 2026-10-31).
CATCHUP_KEYS = [
    "BTC:1", "ETH:1", "ETH:2", "SOL:1", "XRP:1", "SUI:1", "NEAR:1",
    "BNB:1", "NEXO:1", "NEXO:2", "RENDER:1", "RENDER:3",
]
CATCHUP_WINDOW_MS = 48 * 3_600_000  # unfulfilled signals lapse after 48h

CASH_CODES = {"USDC", "USD", "AUD", "USDT"}
MIN_USDC_RESERVE = float(os.getenv("MIN_USDC_RESERVE", "30"))
MIN_ORDER_USDC = 8
MAX_SINGLE_TRADE_USDC = float(os.getenv("MAX_SINGLE_TRADE_USDC", "250"))
MAX_DAILY_TRADES = int(os.getenv("MAX_DAILY_TRADES", "10"))


def catchup_limits():
    """signal -> the original buy target; a wallet may only buy at/below it."""
    return {k: RESTORE_TARGETS[k][0] for k in CATCHUP_KEYS}


def _recent_trades(trade_log, now_ms):
    n = 0
    for e in trade_log or []:
        ts = e.get("timestamp") or e.get("time") or ""
        try:
            ms = datetime.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp() * 1000
        except (ValueError, TypeError):
            continue
        if ms > now_ms - 24 * 3_600_000:
            n += 1
    return n


def _ordered_signals(state):
    """The catch-up signals in the same order the cron walks them."""
    tier_active = (state.get("autoActive") or {}).get("tierActive", {})
    limits = catchup_limits()
    out = []
    for coin, tiers in (state.get("autoTierAssignments") or {}).items():
        for t in (tiers if isinstance(tiers, list) else []):
            ck = f"{coin}:{t}"
            if ck in limits and (tier_active.get(str(t)) or tier_active.get(t)):
                out.append((coin, int(t), ck))
    return out


def preview_catchup(admin_wallet):
    state = get_trader_state()
    signals = _ordered_signals(state)
    tiers = state.get("autoTiers") or {}
    limits = catchup_limits()
    now_ms = int(time.time() * 1000)
    prices = get_prices_for_coins(sorted({c for c, _, _ in signals})) if signals else {}

    wallets = [
        d for d in user_exchange_keys_collection.find(
            {"status": {"$in": ["active", "invalid"]}, "autoTradeEnabled": True}
        )
        if d.get("walletAddress") not in ADMIN_WALLETS
    ]
    per_wallet = []
    for doc in wallets:
        wallet = doc["walletAddress"]
        entry = {"wallet": f"{wallet[:4]}…{wallet[-4:]}", "buys": [], "skipped": []}
        try:
            holdings = SwyftxClient(decrypt_secret(doc["encryptedApiKey"])).get_holdings()
        except Exception as e:
            entry["error"] = f"Could not read balance: {e}"
            per_wallet.append(entry)
            continue
        usdc = sum(v for k, v in holdings.items() if k in CASH_CODES)
        entry["startingUsdc"] = round(usdc, 2)
        trades_today = _recent_trades(get_user_trader_state(wallet).get("tradeLog", []), now_ms)
        for coin, tier, ck in signals:
            price = prices.get(coin, 0)
            if price <= 0 or price > limits[ck]:
                entry["skipped"].append({"signal": ck, "reason": f"price ${price:,.4f} is above the original target ${limits[ck]:,.4f}"})
                continue
            alloc = float((tiers.get(f"tier{tier}") or {}).get("allocation", 5.0))
            amount = max(alloc / 100 * usdc, MIN_ORDER_USDC)
            if usdc - amount < MIN_USDC_RESERVE:
                entry["skipped"].append({"signal": ck, "reason": "would dip into the $30 buffer"})
                continue
            if amount > MAX_SINGLE_TRADE_USDC:
                entry["skipped"].append({"signal": ck, "reason": f"over the ${MAX_SINGLE_TRADE_USDC:.0f} per-trade cap"})
                continue
            if trades_today + len(entry["buys"]) >= MAX_DAILY_TRADES:
                entry["skipped"].append({"signal": ck, "reason": "daily trade limit reached (stays queued 48h)"})
                continue
            entry["buys"].append({"signal": ck, "amountUsd": round(amount, 2), "price": price})
            usdc -= amount
        entry["totalUsd"] = round(sum(b["amountUsd"] for b in entry["buys"]), 2)
        entry["usdcLeft"] = round(usdc, 2)
        per_wallet.append(entry)

    return {
        "mode": "preview — nothing armed",
        "signals": [ck for _, _, ck in signals],
        "wallets": per_wallet,
        "applyWith": "add &apply=1 to the same URL",
    }


def arm_catchup(force=False):
    state = get_trader_state()
    existing = state.get("autoCatchUp")
    now_ms = int(time.time() * 1000)
    if isinstance(existing, dict) and now_ms < (existing.get("expiresAt") or 0) and not force:
        return {"armed": False, "reason": "A catch-up is already active; pass force=1 to re-arm.",
                "expiresAt": existing.get("expiresAt")}
    doc = {"createdAt": now_ms, "expiresAt": now_ms + CATCHUP_WINDOW_MS, "limits": catchup_limits(), "done": {}}
    save_trader_state({"autoCatchUp": doc})
    return {"armed": True, "signals": CATCHUP_KEYS, "expiresInHours": CATCHUP_WINDOW_MS // 3_600_000}
