# ==========================================
# "What would the bot buy if I add $X?" (pure — no database / network, places NO orders)
# ==========================================
# Replays the bot's buying rules on the live state: which signals are waiting, in the order the bot works through them,
# what each buy would cost, and where it stops. The rules mirror api/auto-trade-cron.py:
#   * a signal buys when its tier is on, it isn't paused, and the price is at or below its buy level
#   * each buy = tier's % of the CURRENT USDC (at least the $8 minimum)
#   * a single buy over MAX_SINGLE_TRADE_USDC is made AT that limit (capped, not skipped)
#   * the bot keeps a USDC reserve spare, and stops at the wallet's daily buying limit
#   * a run places orders for only ~150 seconds (about 18 buys), then carries on next run

from buy_order import order_pairs

MIN_ORDER = 8.0
RESERVE = 30.0
MAX_SINGLE = 250.0
BUYS_PER_RUN = 18


def simulate(usdc, pairs, prices, targets, cooldowns, tier_settings, now_ms, skip, spent24h=0.0, daily_limit=3000.0,
             reserve=RESERVE, max_single=MAX_SINGLE, min_order=MIN_ORDER, buys_per_run=BUYS_PER_RUN, order_fn=order_pairs, cap_fn=None, coin_cap_pct=0.0, recent_by_coin=None, group_fn=None):
    """-> dict: rows (in buying order), totals and the reasons signals would be left waiting.
    pairs: [(coin, tier)]. tier_settings: {tier: {"allocation": %, ...}}. skip: coins that never buy (paused/retired/denied)."""
    ordered = order_fn(pairs, prices, targets)
    cash = float(usdc)
    spent = float(spent24h)
    rows, waiting = [], []
    coin_spend = dict(recent_by_coin or {})
    day_money = float(usdc) + sum(coin_spend.values())
    from coin_cap import check_room, cap_amount
    flat_cap = cap_amount(day_money, coin_cap_pct) if coin_cap_pct and coin_cap_pct > 0 and not group_fn else None     # old flat rule (tests)
    for coin, tier in ordered:
        ck = f"{coin}:{tier}"
        price = prices.get(coin, 0)
        tgt = targets.get(ck) or {}
        buy = float(tgt.get("buy", 0) or 0)
        if coin in skip or not price or buy <= 0 or price > buy:
            continue
        cd = cooldowns.get(ck, 0)
        if isinstance(cd, (int, float)) and cd > now_ms:
            continue
        below = (buy - price) / buy * 100
        alloc = float(tier_settings.get(tier, {}).get("allocation", 5.0))
        amount = round(max(alloc / 100 * cash, min_order), 2)
        coin_cap = cap_fn(coin) if cap_fn else None
        if coin_cap:
            amount = round(max(min(amount, coin_cap), min_order), 2)     # shit-list coins never get a big buy
        if group_fn:
            room, why_not = check_room(coin, group_fn, coin_spend, day_money)
            if why_not or room < min_order:
                waiting.append({"coin": coin, "tier": tier, "why": why_not or "Coin/group limit: not enough room left", "below": round(below, 1)})
                continue
            amount = round(max(min(amount, room), min_order), 2)
        elif flat_cap:
            room = flat_cap - coin_spend.get(coin, 0.0)
            if room < min_order:
                waiting.append({"coin": coin, "tier": tier, "why": f"Coin limit: this coin already has its share (the most is ${flat_cap:,.0f} per coin per day)", "below": round(below, 1)})
                continue
            amount = round(max(min(amount, room), min_order), 2)
        capped = amount > max_single
        if capped:
            amount = round(max_single, 2)          # bought AT the single-buy limit, not skipped
        if cash - amount < reserve:
            waiting.append({"coin": coin, "tier": tier, "why": "Not enough cash left", "below": round(below, 1)})
            continue
        if spent + amount > daily_limit:
            waiting.append({"coin": coin, "tier": tier, "why": f"Would pass your ${daily_limit:,.0f} daily limit", "below": round(below, 1)})
            continue
        cash -= amount
        spent += amount
        coin_spend[coin] = coin_spend.get(coin, 0.0) + amount
        rows.append({"n": len(rows) + 1, "coin": coin, "tier": tier, "amount": amount, "price": price, "below": round(below, 1), "capped": capped})
    total = round(sum(r["amount"] for r in rows), 2)
    return {
        "rows": rows, "buys": len(rows), "total": total, "cashLeft": round(cash, 2),
        "runsNeeded": max(1, -(-len(rows) // buys_per_run)) if rows else 0,
        "waiting": waiting, "waitingCount": len(waiting), "startCash": float(usdc),
        "dailyLimit": daily_limit, "spentBefore": float(spent24h),
    }
