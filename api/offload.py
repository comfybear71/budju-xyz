# ==========================================
# Offload planning (pure — no database / network)
# ==========================================
# For ONE wallet: sell the same percentage of each "bad" coin it holds, then
# split the proceeds evenly across the "good" coins. Same percentage for every
# wallet; each wallet's money stays in that wallet.

from typing import Dict, List, Optional

FEE_ALLOWANCE = 0.99        # keep ~1% back for fees / spread
MIN_ORDER = 8.0             # smallest buy the bot places
MIN_SELL = 30.0             # smallest sell Swyftx accepts here (SWYFTX_MIN_SELL_USDC default)


def plan_wallet(holdings: Dict[str, float], prices: Dict[str, float], avg_cost: Dict[str, float],
                bad: List[str], targets: List[str], pct: float, cap_usd: float = 0.0,
                min_sell: float = MIN_SELL, min_order: float = MIN_ORDER) -> Dict:
    sells, skipped_sells = [], []
    for c in bad:
        qty = float(holdings.get(c, 0) or 0)
        price = float(prices.get(c, 0) or 0)
        if qty <= 0 or price <= 0:
            continue
        sell_qty = qty * pct / 100.0
        value = sell_qty * price
        held_usd = qty * price
        if value < min_sell:
            skipped_sells.append({"coin": c, "heldUsd": round(held_usd, 2), "sellUsd": round(value, 2)})
            continue
        ac = float(avg_cost.get(c, 0) or 0)
        sells.append({
            "coin": c, "heldUsd": round(held_usd, 2), "sellUsd": round(value, 2),
            "pnlUsd": round((price - ac) * sell_qty, 2) if ac > 0 else None,
        })
    sell_total = sum(s["sellUsd"] for s in sells)
    proceeds = sell_total * FEE_ALLOWANCE

    # how many coins can each get at least the minimum order?
    pool = [t for t in targets if t not in bad]
    n = min(len(pool), int(proceeds // min_order))
    buys, skipped_buys = [], []
    if n > 0:
        share = proceeds / n
        for t in pool[:n]:
            held_usd = float(holdings.get(t, 0) or 0) * float(prices.get(t, 0) or 0)
            amt = share
            if cap_usd and cap_usd > 0:
                room = cap_usd - held_usd
                if room < min_order:
                    skipped_buys.append({"coin": t, "why": "at the cap"})
                    continue
                amt = min(share, room)
            if amt < min_order:
                continue
            buys.append({"coin": t, "buyUsd": round(amt, 2)})
    spent = sum(b["buyUsd"] for b in buys)
    pnl_known = [s["pnlUsd"] for s in sells if s["pnlUsd"] is not None]
    return {
        "sells": sells, "skippedSells": skipped_sells,
        "sellTotal": round(sell_total, 2), "proceeds": round(proceeds, 2),
        "buys": buys, "skippedBuys": skipped_buys,
        "spent": round(spent, 2), "staysUsdc": round(proceeds - spent, 2),
        "pnlTotal": round(sum(pnl_known), 2) if pnl_known else None,
        "pnlCoinsUnknown": len(sells) - len(pnl_known),
    }
