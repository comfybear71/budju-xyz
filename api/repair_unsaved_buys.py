# ==========================================
# One-time repair: buys that were placed on Swyftx but never recorded (pure — no database / network)
# ==========================================
# On 21 Nov 2026 a big run placed 22 buys (02:20-02:23 PM) and was cut off by the server's time limit before it saved
# anything: no new buy levels, no pauses, no Telegram. This marks exactly those signals as "just bought", the same way a
# normal run would have, so the next top-up does not buy them a second time.
#
# The tier of each buy was read from the Swyftx history: the amount spent was exactly 5% / 10% / 15% of the USDC balance at
# that moment (T1 / T2 / T3). Price is the real fill price.
#
# Safe to run more than once: a signal that already has a live pause, or whose tier is not set up, is left alone.

REPAIR_ID = "unsaved-2026-11-21"

# (coin, tier, fill price in USDC)
UNSAVED_BUYS = [
    ("NEAR", 1, 2.682), ("GRASS", 1, 0.353), ("SUI", 1, 0.6149), ("LDO", 2, 0.2317), ("CRV", 2, 0.1711),
    ("UNI", 1, 4.322), ("WIF", 1, 0.1178), ("SPX", 1, 0.2584), ("ZRO", 1, 1.1), ("PUMP", 1, 0.002312),
    ("SYRUP", 3, 0.08715), ("XRD", 3, 0.0008586), ("ETH", 1, 1576.17), ("SYRUP", 1, 0.08705), ("PYTH", 2, 0.04632),
    ("BTC", 1, 56807.52), ("WLD", 1, 0.2182), ("STRK", 1, 0.02921), ("CAKE", 1, 1.424), ("ONDO", 3, 0.2671),
    ("ZRO", 2, 1.098), ("RAY", 1, 1.243),
]


def apply_repair(buys, targets, cooldowns, settings_for, now_ms):
    """Mark each buy's signal as just bought: new buy level below the fill price, sell level kept at least as high as before,
    and the tier's pause started. `settings_for(tier)` -> {"deviation", "sellDeviation", "cooldownHours"}.
    -> (targets, cooldowns, applied, skipped) — targets/cooldowns are NEW dicts; the inputs are not changed."""
    t, cd = dict(targets), dict(cooldowns)
    applied, skipped = [], []
    for coin, tier, price in buys:
        ck = f"{coin}:{tier}"
        if ck not in t:
            skipped.append((ck, "no target for this signal"))
            continue
        live = cd.get(ck, 0)
        if isinstance(live, (int, float)) and live > now_ms:
            skipped.append((ck, "already paused"))
            continue
        st = settings_for(tier)
        old_sell = float((t.get(ck) or {}).get("sell", 0) or 0)
        t[ck] = {"buy": price * (1 - st["deviation"] / 100), "sell": max(old_sell, price * (1 + st["sellDeviation"] / 100)), "setAt": now_ms}
        cd[ck] = now_ms + st["cooldownHours"] * 3_600_000
        applied.append(ck)
    return t, cd, applied, skipped
