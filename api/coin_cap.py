# ==========================================
# How much of a top-up each GROUP and each COIN may take (pure — no database / network)
# ==========================================
# After a crash all three tiers of one coin can fire at once, and cheap small coins can eat the cash the big ones need.
# Two limits, both counted over a rolling 24 hours against the "day's money" (cash now + everything bought in the last 24h):
#
#   1. GROUP SHARE: each Holdings group may spend at most its share, and an unused share FLOWS DOWN to the groups below.
#        Top 10 50% > Innovation 20% > Top 50 15% > Top 200 10% > Smaller 5%
#      (cumulative: Top 10 up to 50%, Innovation up to 70%, Top 50 up to 85%, Top 200 up to 95%, Smaller up to 100%).
#   2. COIN LIMIT: one coin, all its tiers together, may take at most its group's % of the day's money:
#        Top 10 10% > Innovation 6% > Top 50 4% > Top 200 3% > Smaller 2%   (never less than $50 a day, so small wallets still work)
#
# Money a group does not use simply stays as cash for the next dip. Counting the last 24 hours (not just this run) stops
# the same coin's T2/T3 from topping it up again on the next run.

from datetime import datetime

GROUP_NAMES = ("Top 10", "Innovation", "Top 50", "Top 200", "Smaller")
GROUP_SHARES = (50.0, 20.0, 15.0, 10.0, 5.0)        # % of the day's money each group may use (unused share flows down)
GROUP_COIN_CAPS = (10.0, 6.0, 4.0, 3.0, 2.0)        # % of the day's money ONE coin may take, by group
COIN_CAP_FLOOR = 50.0                               # a coin can always take at least this much per day


def recent_buys(trade_log, now_ms, hours=24):
    """{coin: USD bought in the last `hours`} from a wallet's trade log."""
    cutoff = now_ms - hours * 3_600_000
    out = {}
    for e in trade_log or []:
        if str(e.get("side", "")).lower() != "buy":
            continue
        try:
            ms = datetime.fromisoformat(str(e.get("timestamp") or e.get("time") or "").replace("Z", "+00:00")).timestamp() * 1000
            usd = float(e.get("qty", e.get("quantity", 0)) or 0) * float(e.get("price", 0) or 0)
        except (ValueError, TypeError):
            continue
        if ms > cutoff:
            out[e.get("coin")] = out.get(e.get("coin"), 0.0) + usd
    return out


def day_budget(cash, recent):
    return float(cash) + sum(recent.values())


def cap_amount(budget, pct):
    """USD one coin may take per 24h at `pct` of the day's money, or None when pct is 0 (off)."""
    return max(budget * pct / 100.0, COIN_CAP_FLOOR) if pct and pct > 0 else None


def coin_cap_for(group, budget):
    return cap_amount(budget, GROUP_COIN_CAPS[group])


def group_allowance(group, budget):
    """Cumulative: this group's share PLUS the shares of every group above it (so an unused share flows down)."""
    return budget * sum(GROUP_SHARES[:group + 1]) / 100.0


def check_room(coin, group_of_coin, recent, budget):
    """-> (room, why). room = most that can still be bought of this coin; why = plain-English reason when there is none."""
    g = group_of_coin(coin)
    cap = coin_cap_for(g, budget)
    coin_room = cap - recent.get(coin, 0.0)
    if coin_room <= 0:
        return 0.0, f"Coin limit: {coin} already has its share (the most is ${cap:,.0f} a day for a {GROUP_NAMES[g]} coin)"
    spent_through = sum(v for c, v in recent.items() if group_of_coin(c) <= g)
    group_room = group_allowance(g, budget) - spent_through
    if group_room <= 0:
        return 0.0, f"Group limit: the {GROUP_NAMES[g]} group has used its share of the day's money (up to {sum(GROUP_SHARES[:g + 1]):.0f}% counting the groups above)"
    return min(coin_room, group_room), None
