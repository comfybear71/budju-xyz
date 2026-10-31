# ==========================================
# Starter buys — a small first position ($10-20) in each coin the admin
# wallet does not hold yet.
# ==========================================
# Real money, so it is two-step: PLAN shows exactly what would be bought and
# whether the USDC covers it; EXECUTE places the orders in small batches
# (so no request runs long) and records each one like a normal bot buy.
# It never dips into the $30 USDC buffer and respects the TRADING_ENABLED
# kill switch.

import os
import time
from typing import Dict, List

MIN_USDC_RESERVE = float(os.getenv("MIN_USDC_RESERVE", "30"))
MIN_AMOUNT, MAX_AMOUNT = 10.0, 20.0
HELD_DUST_USD = 5.0           # already "has a balance" at or above this
BATCH_SECONDS = 35
CASH = {"USDC", "USD", "AUD", "USDT"}


def clamp_amount(x) -> float:
    try:
        v = float(x)
    except (TypeError, ValueError):
        v = 15.0
    return max(MIN_AMOUNT, min(MAX_AMOUNT, v))


def pick_coins(assigned: List[str], holdings: Dict[str, float], prices: Dict[str, float],
               denied, retired) -> List[str]:
    """Coins in the tiers that the wallet holds (almost) none of."""
    out = []
    for code in sorted(set(assigned)):
        if code in CASH or code in denied or code in retired:
            continue
        price = prices.get(code) or 0.0
        if price <= 0:
            continue                      # cannot size an order without a price
        if (holdings.get(code, 0.0) * price) >= HELD_DUST_USD:
            continue
        out.append(code)
    return out


def affordable(coins: List[str], usdc: float, amount: float) -> List[str]:
    """How many of these fit while keeping the USDC buffer."""
    n = int(max(0.0, usdc - MIN_USDC_RESERVE) // amount)
    return coins[:n]


def _context(admin_wallet):
    from database import (ASSET_CG_IDS, _get_user_swyftx_client, get_prices_for_coins,
                          get_trader_state, get_coin_config)
    from trade_guards import PERMANENT_BUY_DENYLIST
    client = _get_user_swyftx_client(admin_wallet)
    holdings = client.get_holdings()
    state = get_trader_state()
    assigned = [c for c, t in (state.get("autoTierAssignments") or {}).items() if t]
    prices = get_prices_for_coins(sorted(set(assigned)))
    cfg = get_coin_config()
    return client, holdings, assigned, prices, set(PERMANENT_BUY_DENYLIST), set(cfg.get("retired", []))


def plan(admin_wallet: str, amount) -> Dict:
    amount = clamp_amount(amount)
    client, holdings, assigned, prices, denied, retired = _context(admin_wallet)
    usdc = float(holdings.get("USDC", 0.0))
    want = pick_coins(assigned, holdings, prices, denied, retired)
    can = affordable(want, usdc, amount)
    return {
        "amountUsd": amount, "usdc": round(usdc, 2), "reserve": MIN_USDC_RESERVE,
        "wanted": want, "willBuy": can, "cannotAfford": [c for c in want if c not in can],
        "totalUsd": round(len(can) * amount, 2),
        "tradingEnabled": os.getenv("TRADING_ENABLED", "true").lower() != "false",
    }


def execute(admin_wallet: str, amount, coins: List[str]) -> Dict:
    if os.getenv("TRADING_ENABLED", "true").lower() == "false":
        return {"ok": False, "error": "Trading is switched off (TRADING_ENABLED=false)"}
    from database import calculate_pool_allocations, record_trade
    amount = clamp_amount(amount)
    client, holdings, assigned, prices, denied, retired = _context(admin_wallet)
    usdc = float(holdings.get("USDC", 0.0))
    allowed = set(pick_coins(assigned, holdings, prices, denied, retired))   # re-checked NOW
    code_map = client.get_code_to_id_map()
    started = time.time()
    placed, failed, skipped = [], [], []
    for code in coins:
        if time.time() - started > BATCH_SECONDS:
            break
        code = str(code).upper()
        if code not in allowed:
            skipped.append({"coin": code, "why": "already held, not in a tier, or no price"})
            continue
        if usdc - amount < MIN_USDC_RESERVE:
            skipped.append({"coin": code, "why": "would dip into the USDC buffer"})
            continue
        price = prices[code]
        est_qty = round(amount / price, 8)
        ok, order_id, err = client.place_market_order(code, "buy", amount, code_map, expected_qty=est_qty)
        if not ok:
            failed.append({"coin": code, "error": str(err)[:120]})
            continue
        fill = getattr(client, "last_fill", None)
        qty = round(float(fill["qty"]), 8) if isinstance(fill, dict) and fill.get("qty", 0) > 0 else est_qty
        eff_price = amount / qty if qty else price
        try:
            record_trade(code, "buy", qty, eff_price, calculate_pool_allocations(), swyftx_id=order_id)
        except Exception as e:
            print(f"[starter-buys] record error {code}: {e}")
        usdc -= amount
        placed.append({"coin": code, "usd": amount, "price": round(eff_price, 8), "qty": qty})
    return {"ok": True, "placed": placed, "failed": failed, "skipped": skipped,
            "usdcLeft": round(usdc, 2), "done": all(c.upper() in {p["coin"] for p in placed} | {s["coin"] for s in skipped} | {f["coin"] for f in failed} for c in coins)}
