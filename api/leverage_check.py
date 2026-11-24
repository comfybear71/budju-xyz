# ==========================================
# Leverage check from Hyperliquid's public data (pure — no database / network)
# ==========================================
# Hyperliquid's `metaAndAssetCtxs` (free, no key) lists, for every coin, the funding rate, open interest, mark price and the
# price a day ago. They show whether leveraged traders are crowded in or being flushed out:
#   funding   what longs pay shorts per hour (positive) or shorts pay longs (negative). Normal is about +11% a year.
#   open interest   the dollars riding on open leveraged bets. Falling fast = positions are being closed or liquidated.
# We read it for the core coins (BTC, ETH, SOL) only to ADD INFORMATION to the market mood chip. It never changes what the bot buys.
# Open interest has no history in the feed, so the caller keeps its own hourly snapshots and passes the one from about 24 hours ago.

from typing import Dict, List, Optional

CORE = ("BTC", "ETH", "SOL")
HOURS_PER_YEAR = 24 * 365
NORMAL_FUNDING_APR = 11.0           # Hyperliquid's default funding is 0.00125% an hour = about 11% a year
LOW_FUNDING_APR = 5.0               # at or below this, nobody is paying much to be long
HOT_FUNDING_APR = 30.0              # at or above this, longs are paying a lot to stay in: crowded
FLUSH_OI_PCT = -5.0                 # open interest down this much in a day = leverage is being cleared
BUILD_OI_PCT = 8.0                  # up this much = leverage is building
FALL_PCT = -5.0                     # a day's price fall this big counts as a real fall


def _f(x) -> Optional[float]:
    try:
        v = float(x)
        return v if v == v and abs(v) != float("inf") else None
    except (TypeError, ValueError):
        return None


def parse(payload) -> Dict[str, Dict[str, float]]:
    """metaAndAssetCtxs reply -> {coin: {funding (per hour), px, prevPx, oiUsd, volUsd}}. Anything unreadable is skipped."""
    out: Dict[str, Dict[str, float]] = {}
    try:
        meta, ctxs = payload[0], payload[1]
        names = [u.get("name") for u in meta.get("universe", [])]
    except (TypeError, IndexError, KeyError, AttributeError):
        return out
    for name, c in zip(names, ctxs if isinstance(ctxs, list) else []):
        if not name or not isinstance(c, dict):
            continue
        px, oi, funding = _f(c.get("markPx")), _f(c.get("openInterest")), _f(c.get("funding"))
        if px is None or oi is None or funding is None or px <= 0:
            continue
        out[name] = {"funding": funding, "px": px, "prevPx": _f(c.get("prevDayPx")) or 0.0, "oiUsd": oi * px, "volUsd": _f(c.get("dayNtlVlm")) or 0.0}
    return out


def _apr(hourly: float) -> float:
    return hourly * HOURS_PER_YEAR * 100.0


def _usd(n: float) -> str:
    return f"${n / 1e9:.1f}B" if n >= 1e9 else f"${n / 1e6:.0f}M"


def assess(now: Dict[str, Dict[str, float]], before: Optional[Dict[str, Dict[str, float]]] = None, coins=CORE) -> Dict:
    """-> {signal, label, lines, fundingAprPct, oiChangePct, priceChangePct, coins}. signal: washed_out | crowded | building | normal | unknown."""
    have = [c for c in coins if c in now]
    if not have:
        return {"signal": "unknown", "label": "Leverage check unavailable", "lines": [], "coins": {}}
    total_oi = sum(now[c]["oiUsd"] for c in have)
    funding_apr = sum(_apr(now[c]["funding"]) * now[c]["oiUsd"] for c in have) / total_oi if total_oi > 0 else _apr(now[have[0]]["funding"])

    oi_change = None
    if before:
        prev = [c for c in have if c in before and before[c].get("oiUsd", 0) > 0]
        base = sum(before[c]["oiUsd"] for c in prev)
        if prev and base > 0:
            oi_change = (sum(now[c]["oiUsd"] for c in prev) / base - 1) * 100.0

    prev_total = sum(now[c]["prevPx"] * now[c]["oiUsd"] / now[c]["px"] for c in have if now[c]["prevPx"] > 0)
    px_change = None
    if prev_total > 0:
        px_change = (sum(now[c]["oiUsd"] for c in have if now[c]["prevPx"] > 0) / prev_total - 1) * 100.0

    lines: List[str] = []
    per_coin = {}
    for c in have:
        apr = _apr(now[c]["funding"])
        per_coin[c] = {"fundingAprPct": round(apr, 1), "oiUsd": round(now[c]["oiUsd"])}
        word = ("negative: traders betting on a fall are paying those betting on a rise" if apr < 0
                else "low: little demand to be long" if apr <= LOW_FUNDING_APR
                else "normal" if apr < HOT_FUNDING_APR
                else "high: lots of leveraged longs, so a drop can snowball")
        lines.append(f"{c} funding is {word} ({apr:+.0f}% a year).")
    lines.append(f"Leveraged bets on BTC, ETH and SOL together: {_usd(total_oi)}.")
    if oi_change is not None:
        lines.append(f"That is {'down' if oi_change < 0 else 'up'} {abs(oi_change):.0f}% on a day ago"
                     + (": positions are being closed or liquidated." if oi_change <= FLUSH_OI_PCT else ": leverage is building." if oi_change >= BUILD_OI_PCT else "."))
    else:
        lines.append("The day-on-day change in leveraged bets will show once a day of readings has been kept.")

    washed = funding_apr <= LOW_FUNDING_APR and ((oi_change is not None and oi_change <= FLUSH_OI_PCT) or (px_change is not None and px_change <= FALL_PCT))
    if washed:
        signal, label = "washed_out", "Leverage looks washed out"
    elif funding_apr >= HOT_FUNDING_APR:
        signal, label = "crowded", "Leverage is crowded"
    elif oi_change is not None and oi_change >= BUILD_OI_PCT and funding_apr > NORMAL_FUNDING_APR:
        signal, label = "building", "Leverage is building"
    else:
        signal, label = "normal", "Leverage looks normal"
    return {"signal": signal, "label": label, "lines": lines, "fundingAprPct": round(funding_apr, 1),
            "oiChangePct": None if oi_change is None else round(oi_change, 1),
            "priceChangePct": None if px_change is None else round(px_change, 1), "coins": per_coin}
