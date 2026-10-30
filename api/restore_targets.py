# ==========================================
# One-off restore of the admin wallet's targets erased by the 48h
# stale-target reset on 2026-10-30 18:00 UTC.
# ==========================================
# Only values known from before the reset (see RESTORE_TARGETS). Every
# other coin/tier/wallet is left alone — the cron sets it fresh.
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
#
# T1 values: read off the admin screen before the reset (exact).
# T2/T3 values: the 2026-10-24 cron log's per-coin decisions (listed in tier
# order; BTC's T1 there matches the screen exactly). Only coins with NO
# trade after that log are included, since a later trade would have moved
# their targets. Tiers that were on cooldown at the time are not in the log
# and are left out.
RESTORE_TARGETS = {
    # ── T1, from the screen ──
    "BTC:1": (78189.5885, 92592.93375),
    "ETH:1": (2307.0, 2732.0),
    "SOL:1": (99.24, 117.52),
    "XRP:1": (1.27, 1.51),
    "SUI:1": (0.8976, 1.12),
    "HYPE:1": (74.80, 88.58),
    "NEAR:1": (4.29, 5.64),
    # ── From the Oct 24 cron log ──
    "BTC:2": (72601.59, 91247.9),
    "BTC:3": (67445.188, 95216.736),
    "ETH:2": (2267.89155, 2850.3555),
    "ETH:3": (2106.6825, 2974.14),
    "XRP:2": (1.23525, 1.69786),
    "XRP:3": (1.0625, 1.7712),
    "HYPE:2": (71.8641, 107.939),
    "HYPE:3": (70.703, 117.528),
    "NEAR:3": (4.2585, 6.012),
    "BNB:1": (700.815, 829.9125),
    "BNB:2": (673.074, 926.1525),
    "BNB:3": (594.881, 839.832),
    "AVAX:2": (7.9056, 9.936),
    "AVAX:3": (7.6755, 10.836),
    "POL:2": (0.079344225, 0.144325),
    "POL:3": (0.0767006, 0.15066),
    "BCH:1": (262.96, 311.4),
    "BCH:2": (248.98065, 409.883),
    "BCH:3": (235.45, 391.332),
    "DOGE:2": (0.0728523, 0.12055795),
    "LINK:2": (10.78968, 17.71),
    "NEXO:1": (0.77433645, 0.916977375),
    "NEXO:2": (0.760442775, 0.95574775),
    "NEXO:3": (0.70642225, 0.997302),
    "RENDER:1": (1.653, 2.068875),
    "RENDER:3": (1.56315, 2.664),
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
