# ==========================================
# Tier 1 sell levels follow the latest reference price (pure — no database / network)
# ==========================================
# Tier 1 is meant to "give a little early": it starts looking to sell 12.5% above the price it last bought at. After a buy the other
# tiers keep the HIGHER of the old and new sell level (so they keep accumulating); Tier 1 used to do the same, which left some T1
# levels far above that (BTC T1 sat at $92,593 when its reference was $56,808 and the plan level was $63,909).
#   * from now on a Tier 1 buy moves its sell level to the new plan level (see TIER_FOLLOWS_BUY in the cron), and
#   * this one-time reset puts every existing Tier 1 sell level back to (reference price) x (1 + arm%), where the reference price is the
#     level the buy target was set from: buy level / (1 - dip%).
# The "never sell below what you paid" rule and the trailing stop still apply on top of the level.

RESET_ID = "t1-sell-reset-2026-11-24"
ENABLED = True                      # tests switch this off so ordinary fixtures keep their sell levels


def apply_reset(targets, settings_for):
    """-> (new_targets, changed). Only keys ending in ':1'. `settings_for(1)` -> {"deviation", "sellDeviation"}. Inputs are not changed."""
    out = dict(targets)
    changed = []
    st = settings_for(1)
    dev, arm = float(st["deviation"]), float(st["sellDeviation"])
    if not 0 < dev < 100:
        return out, changed
    for ck, tgt in targets.items():
        if not str(ck).endswith(":1") or not isinstance(tgt, dict):
            continue
        try:
            buy, old = float(tgt.get("buy", 0) or 0), float(tgt.get("sell", 0) or 0)
        except (TypeError, ValueError):
            continue
        if buy <= 0:
            continue
        new = (buy / (1 - dev / 100.0)) * (1 + arm / 100.0)
        if abs(new - old) > 1e-9 * max(1.0, new):
            out[ck] = {**tgt, "sell": new}
            changed.append((ck, old, new))
    return out, changed


def follows_buy(ck: str) -> bool:
    """True for tiers whose sell level moves with each new buy instead of staying at the higher old level (Tier 1 only)."""
    return str(ck).endswith(":1")
