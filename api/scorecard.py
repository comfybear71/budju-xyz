# ==========================================
# Scorecard — is the bot actually beating "just buy and hold"? (pure — no database / network)
# ==========================================
# For each coin, from the trade ledger and today's price:
#   bot P&L   = what the bot has really made: cash received from sells + value still held - cash spent
#   hold P&L  = what the SAME total dollars would have made if put in at the price of the very first buy
#   edge      = bot P&L - hold P&L   (positive = the bot's timing beat holding)
# Prices in the ledger are the fills we recorded (older admin records are estimates, so treat small
# differences as noise). Fees are only included where the recorded fill price already contains them.

from typing import Dict, Iterable, List, Optional

FUNDING = {"USDC", "USD", "AUD", "AUDT", "USDT", "USDC.E"}


def coin_scorecard(rows: Iterable[Dict], prices: Dict[str, float]) -> Dict:
    """rows: [{"coin","side","qty","price","ts"}]. -> {"coins":[...], "totals":{...}}"""
    by_coin: Dict[str, List[Dict]] = {}
    for r in rows:
        c = r.get("coin")
        if not c or c in FUNDING or r.get("side") not in ("buy", "sell"):
            continue
        try:
            qty, price = float(r["qty"]), float(r["price"])
        except (TypeError, ValueError, KeyError):
            continue
        if qty <= 0 or price <= 0:
            continue
        by_coin.setdefault(c, []).append({"side": r["side"], "qty": qty, "price": price, "ts": r.get("ts")})

    coins = []
    for coin, trades in by_coin.items():
        trades.sort(key=lambda t: str(t["ts"] or ""))
        buys = [t for t in trades if t["side"] == "buy"]
        if not buys:
            continue
        spent = sum(t["qty"] * t["price"] for t in buys)
        qty_bought = sum(t["qty"] for t in buys)
        sells = [t for t in trades if t["side"] == "sell"]
        received = sum(t["qty"] * t["price"] for t in sells)
        qty_sold = min(sum(t["qty"] for t in sells), qty_bought)
        avg_cost = spent / qty_bought
        held = max(0.0, qty_bought - qty_sold)
        now = float(prices.get(coin) or 0)
        held_value = held * now
        realized = received - qty_sold * avg_cost
        unrealized = held * (now - avg_cost) if now else 0.0
        bot_pnl = realized + unrealized
        first_price = buys[0]["price"]
        hold_value = spent / first_price * now if now else spent
        hold_pnl = hold_value - spent
        coins.append({
            "coin": coin, "buys": len(buys), "sells": len(sells),
            "spent": round(spent, 2), "received": round(received, 2), "heldValue": round(held_value, 2),
            "avgCost": avg_cost, "price": now, "botPnl": round(bot_pnl, 2), "holdPnl": round(hold_pnl, 2),
            "edge": round(bot_pnl - hold_pnl, 2), "returnPct": round(100 * bot_pnl / spent, 1) if spent else 0.0,
            "holdReturnPct": round(100 * hold_pnl / spent, 1) if spent else 0.0, "priced": bool(now),
        })
    coins.sort(key=lambda c: -c["spent"])

    priced = [c for c in coins if c["priced"]]
    spent = sum(c["spent"] for c in priced)
    bot = sum(c["botPnl"] for c in priced)
    hold = sum(c["holdPnl"] for c in priced)
    beat = sum(1 for c in priced if c["edge"] > 0)
    totals = {
        "coins": len(priced), "spent": round(spent, 2), "received": round(sum(c["received"] for c in priced), 2),
        "heldValue": round(sum(c["heldValue"] for c in priced), 2),
        "botPnl": round(bot, 2), "holdPnl": round(hold, 2), "edge": round(bot - hold, 2),
        "botReturnPct": round(100 * bot / spent, 1) if spent else 0.0, "holdReturnPct": round(100 * hold / spent, 1) if spent else 0.0,
        "coinsBeatHold": beat, "coinsLosing": sum(1 for c in priced if c["botPnl"] < 0),
    }
    totals["verdict"] = verdict(totals)
    return {"coins": coins, "totals": totals}


def verdict(t: Dict) -> str:
    if not t.get("coins") or not t.get("spent"):
        return "Not enough trades yet to judge."
    edge, bot, hold = t["edge"], t["botReturnPct"], t["holdReturnPct"]
    if abs(edge) < 0.01 * t["spent"]:
        return f"About level with holding (bot {bot:+.1f}% vs hold {hold:+.1f}%) — no clear edge yet."
    if edge > 0:
        return f"Ahead of holding: bot {bot:+.1f}% vs hold {hold:+.1f}% on the same dollars (${edge:,.0f} better)."
    return f"Behind holding: bot {bot:+.1f}% vs hold {hold:+.1f}% on the same dollars (${-edge:,.0f} worse)."
