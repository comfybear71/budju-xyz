# ==========================================
# One-off restore of the admin wallet's T1 targets erased by the 48h
# stale-target reset on 2026-10-30 18:00 UTC.
# ==========================================
# Exact values only: read off the admin screen (and the 2026-10-24 cron
# log for BTC) BEFORE the reset. Every other coin/tier/wallet is left
# alone — its old target is not known exactly, so the cron sets it fresh.
#
# Two steps, both via GET /api/admin/restore-targets?admin_wallet=...
#   (default)   PREVIEW — writes nothing; shows what each coin would do
#               at today's price with these targets, using the cron's
#               real gates (cooldown, $30 reserve, sell-below-cost, ...).
#   &apply=1    APPLY   — writes the targets. The cron then acts on them
#               on its next 5-minute cycle.

import time

from database import get_trader_state, save_trader_state

# key -> (buy target, sell target)
RESTORE_TARGETS = {
    "BTC:1": (78189.5885, 92592.93375),
    "ETH:1": (2307.0, 2732.0),
    "SOL:1": (99.24, 117.52),
    "XRP:1": (1.27, 1.51),
    "SUI:1": (0.8976, 1.12),
    "HYPE:1": (74.80, 88.58),
    "NEAR:1": (4.29, 5.64),
}


def _restored_entries(now_ms):
    return {
        key: {"buy": buy, "sell": sell, "setAt": now_ms}
        for key, (buy, sell) in RESTORE_TARGETS.items()
    }


def preview_restore(admin_wallet):
    """Read-only: run the real cron gates for the admin wallet as if the
    restored targets were in place."""
    from user_trade_debug import diagnose_user_auto_trade

    now_ms = int(time.time() * 1000)
    result = diagnose_user_auto_trade(admin_wallet, targets_override=_restored_entries(now_ms))
    per_coin = [e for e in result.get("perCoin", []) if f"{e['coin']}:{e['tier']}" in RESTORE_TARGETS]
    return {
        "mode": "preview — nothing written",
        "reason": result.get("reason"),
        "liveUsdcBalance": result.get("liveUsdcBalance"),
        "wouldBuy": [e for e in per_coin if e.get("signal") == "BUY"
                     and not e.get("blockedByCooldown") and not e.get("blockedByReserve")],
        "wouldSell": [e for e in per_coin if e.get("signal") == "SELL"
                      and not e.get("blockedCooldown") and not e.get("blockedNoPosition")
                      and not e.get("blockedBelowAvgCost")],
        "allRestoredCoins": per_coin,
        "applyWith": "add &apply=1 to the same URL",
    }


def apply_restore(force=False):
    """Write the restored targets into the shared trader state. Refuses to
    run twice (a second run would undo targets that trades have since
    ratcheted) unless force=True. Skips any key that traded since (its
    cooldown is active) — that target is already newer than the old one."""
    state = get_trader_state()
    if state.get("autoTargetRestoredAt") and not force:
        return {"applied": False, "reason": "Already applied once; pass force=1 to repeat.",
                "restoredAt": state.get("autoTargetRestoredAt")}

    auto_active = state.get("autoActive") or {}
    cooldowns = state.get("autoCooldowns") or {}
    now_ms = int(time.time() * 1000)

    entries = {}
    skipped = []
    for key, entry in _restored_entries(now_ms).items():
        cd = cooldowns.get(key, 0)
        if isinstance(cd, (int, float)) and cd > now_ms:
            skipped.append(key)
        else:
            entries[key] = entry

    if entries:
        # save_trader_state() merges per key, so only these keys change.
        save_trader_state({
            "autoActive": {**auto_active, "targets": entries},
            "autoTargetRestoredAt": now_ms,
        })
    return {"applied": bool(entries), "restored": sorted(entries), "skippedOnCooldown": skipped}
