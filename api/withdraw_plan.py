# ==========================================
# Withdraw planner (pure — no database / network). It only PLANS: nothing is ever sold from here.
# ==========================================
# "I want to take $X out" -> which cash to use and which coins to sell to reach it, with the fees.
#
#   1. CASH FIRST. Cash already in the wanted currency is used before anything else (no fee); other cash (e.g. USDC when you want
#      AUD) is used next and costs one conversion trade.
#   2. Then COINS, WEAKEST FIRST:
#        - the shit list (Dip Report "Careful") before everything,
#        - then by size group: Smaller > Top 200 > Top 50 > Innovation > Top 10,
#        - inside a group, coins we are NOT accumulating first, then the weakest performer (or biggest loss first when asked),
#        - BTC / ETH / SOL are kept to the very end.
#   3. A coin is sold only as far as needed (the last one partially). Positions under Swyftx's minimum sale are never selected.
#   4. Fees: Swyftx's standard fee per trade (0.6%, lower with high volume) plus an estimated spread that is wider for small coins.
#      Getting AUD costs a second trade (USDC -> AUD) on everything that was not already AUD cash.
#
# These are ESTIMATES: the real fee tier and the spread on the day decide the exact figure.

from typing import Dict, Iterable, List, Optional

from buy_order import CORE_COINS, group_of, shit_list, GROUP_NAMES

TRADE_FEE = 0.006                                   # Swyftx's standard fee per trade
FX_SPREAD = 0.001                                   # estimated spread on the USDC <-> AUD conversion
# Estimated spread by Holdings group: Top 10, Innovation, Top 50, Top 200, Smaller (small coins are thinner and cost more to sell)
SPREAD_BY_GROUP = (0.001, 0.002, 0.002, 0.004, 0.008)
MIN_SELL = 30.0                                     # smallest sale Swyftx accepts here
CASH_CODES = ("USDC", "USDT", "USD", "AUD")


def _r(n: float) -> float:
    return round(float(n), 2)


def plan_withdrawal(amount: float, currency: str, holdings: Dict[str, float], prices: Dict[str, float],
                    avg_cost: Dict[str, float], ranks: Optional[Dict[str, int]], careful: Iterable[str], focus: Iterable[str],
                    aud_to_usd: float, prefer_losses: bool = False, exclude: Iterable[str] = (),
                    min_sell: float = MIN_SELL, trade_fee: float = TRADE_FEE) -> Dict:
    currency = (currency or "").upper()
    if currency not in ("AUD", "USDC"):
        return {"error": "Pick AUD or USDC"}
    try:
        amount = float(amount)
        aud = float(aud_to_usd)
    except (TypeError, ValueError):
        return {"error": "Enter an amount"}
    if not amount > 0 or not aud > 0:
        return {"error": "Enter an amount above zero"}

    ranks = ranks or {}
    careful = shit_list(careful)
    focus = set(focus or ())
    excluded = {c.upper() for c in (exclude or ())}
    to_usd = aud if currency == "AUD" else 1.0                  # 1 unit of the wanted currency in USD
    target_usd = amount * to_usd
    conv_cost = trade_fee + FX_SPREAD                           # one USDC <-> AUD trade

    # ---- 1. cash first ----
    cash_rows: List[Dict] = []
    remaining = target_usd                                      # NET USD still to get
    held = {c: float(holdings.get(c, 0) or 0) for c in CASH_CODES}

    def take_cash(code: str, convert: bool):
        nonlocal remaining
        have = held.get(code, 0.0)
        if have <= 0 or remaining <= 0.005:
            return
        usd_value = have * (aud if code == "AUD" else 1.0)
        net_rate = (1 - conv_cost) if convert else 1.0
        use_usd = min(usd_value, remaining / net_rate)          # gross USD taken from this cash
        fee = use_usd * conv_cost if convert else 0.0
        remaining -= use_usd - fee
        held[code] = have - use_usd / (aud if code == "AUD" else 1.0)
        cash_rows.append({"currency": code, "amount": _r(use_usd / (aud if code == "AUD" else 1.0)), "usd": _r(use_usd),
                          "feeUsd": _r(fee), "converted": convert})

    same = ["AUD"] if currency == "AUD" else ["USDC"]
    other = [c for c in (["USDC", "USDT", "USD"] if currency == "AUD" else ["USDT", "USD", "AUD"]) if c not in same]
    for c in same:
        take_cash(c, False)
    for c in other:
        take_cash(c, True)

    # ---- 2. coins, weakest first ----
    candidates, skipped, kept = [], [], []
    for code, qty in holdings.items():
        if code in CASH_CODES:
            continue
        qty = float(qty or 0)
        price = float(prices.get(code, 0) or 0)
        if qty <= 0 or price <= 0:
            continue
        value = qty * price
        if code.upper() in excluded:
            kept.append({"coin": code, "usd": _r(value), "why": "you chose to keep it"})
            continue
        if value < min_sell:
            skipped.append({"coin": code, "usd": _r(value), "why": f"under the ${min_sell:.0f} minimum Swyftx accepts for a sale"})
            continue
        avg = float(avg_cost.get(code, 0) or 0)
        pnl_pct = (price / avg - 1) * 100 if avg > 0 else None
        g = group_of(code, ranks.get(code))
        core = code.upper() in CORE_COINS
        is_careful = code in careful
        is_focus = code in focus
        loss_rank = (0 if (pnl_pct is not None and pnl_pct < 0) else 1) if prefer_losses else 0
        key = (1 if core else 0, 0 if is_careful else 1, -g, 1 if is_focus else 0, loss_rank, pnl_pct if pnl_pct is not None else 0.0, code)
        candidates.append((key, code, qty, price, value, avg, pnl_pct, g, core, is_careful, is_focus))
    candidates.sort(key=lambda x: x[0])

    rows: List[Dict] = []
    for _, code, qty, price, value, avg, pnl_pct, g, core, is_careful, is_focus in candidates:
        if remaining <= 0.005:
            kept.append({"coin": code, "usd": _r(value), "why": "not needed"})
            continue
        fee_rate = trade_fee + SPREAD_BY_GROUP[g]
        net_rate = (1 - fee_rate) * ((1 - conv_cost) if currency == "AUD" else 1.0)
        sell_usd = min(value, remaining / net_rate)
        tags = [GROUP_NAMES[g]]
        if is_careful:
            tags = ["Shit list (Careful)"]
        elif is_focus:
            tags.append("accumulate")
        if sell_usd < min_sell:
            sell_usd = min(value, min_sell)
            tags.append(f"raised to the ${min_sell:.0f} minimum")
        whole = sell_usd >= value * 0.999
        if whole:
            sell_usd = value
        sell_qty = qty if whole else sell_usd / price
        fee = sell_usd * fee_rate
        conv_fee = (sell_usd - fee) * conv_cost if currency == "AUD" else 0.0
        net = sell_usd - fee - conv_fee
        pnl_usd = (price - avg) * sell_qty if avg > 0 else None
        if pnl_pct is not None:
            tags.append("at a loss" if pnl_pct < 0 else "in profit")
        if core:
            tags.append("kept until last")
        rows.append({
            "coin": code, "qty": sell_qty, "sellUsd": _r(sell_usd), "feeUsd": _r(fee + conv_fee), "netUsd": _r(net),
            "pnlUsd": _r(pnl_usd) if pnl_usd is not None else None, "pnlPct": round(pnl_pct, 1) if pnl_pct is not None else None,
            "group": GROUP_NAMES[g], "tags": tags, "partial": not whole,
        })
        remaining -= net

    # ---- 3. totals ----
    coin_gross = sum(r["sellUsd"] for r in rows)
    fees = sum(r["feeUsd"] for r in rows) + sum(c["feeUsd"] for c in cash_rows)
    cash_net = sum(c["usd"] - c["feeUsd"] for c in cash_rows)
    net_usd = cash_net + sum(r["netUsd"] for r in rows)
    gains = sum(r["pnlUsd"] for r in rows if r["pnlUsd"] is not None and r["pnlUsd"] > 0)
    losses = sum(r["pnlUsd"] for r in rows if r["pnlUsd"] is not None and r["pnlUsd"] < 0)
    shortfall_usd = max(0.0, remaining)
    return {
        "currency": currency, "amount": _r(amount), "targetUsd": _r(target_usd), "audToUsd": aud,
        "cash": cash_rows, "rows": rows, "skipped": skipped, "kept": kept,
        "totals": {
            "cashUsedUsd": _r(sum(c["usd"] for c in cash_rows)), "coinsSoldUsd": _r(coin_gross), "feesUsd": _r(fees),
            "netUsd": _r(net_usd), "netInCurrency": _r(net_usd / to_usd), "coinCount": len(rows),
            "gainsUsd": _r(gains), "lossesUsd": _r(losses), "realisedUsd": _r(gains + losses),
            "shortfallUsd": _r(shortfall_usd), "shortfallInCurrency": _r(shortfall_usd / to_usd),
        },
        "assumptions": {"tradeFeePct": round(trade_fee * 100, 2), "fxSpreadPct": round(FX_SPREAD * 100, 2), "minSellUsd": min_sell,
                        "spreadPctByGroup": {GROUP_NAMES[i]: round(s * 100, 2) for i, s in enumerate(SPREAD_BY_GROUP)}},
    }
