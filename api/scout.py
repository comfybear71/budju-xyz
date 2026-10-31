# ==========================================
# Coin scout — pure helpers (no database / network)
# ==========================================
from typing import Dict, Iterable, List, Optional, Set

STABLE_HINTS = ("usd", "eur", "gold", "tether", "stable", "dai")
WRAPPED_HINTS = ("wrapped", "staked", "bridged", "restaked", "liquid staking", "wbtc", "steth", "weth")
MIN_MCAP = 300_000_000
MIN_VOL_RATIO = 0.01     # 24h volume must be at least 1% of market cap
MAX_CANDIDATES = 60


def filter_candidates(markets: Iterable[Dict], tracked_codes: Set[str], tracked_cg_ids: Set[str],
                      swyftx_codes: Optional[Set[str]] = None) -> List[Dict]:
    """Coins worth testing: big enough, liquid, not a stablecoin/wrapped copy,
    not already tracked, and (when we could check) listed on Swyftx."""
    out: List[Dict] = []
    for m in markets:
        code = str(m.get("symbol", "")).upper()
        cg = m.get("id")
        name = (m.get("name") or "").lower()
        mcap = m.get("market_cap") or 0
        vol = m.get("total_volume") or 0
        if not code or not cg or code in tracked_codes or cg in tracked_cg_ids:
            continue
        if mcap < MIN_MCAP or vol < mcap * MIN_VOL_RATIO:
            continue
        if any(h in name for h in WRAPPED_HINTS) or any(h in name or h == code.lower() for h in STABLE_HINTS):
            continue
        price = m.get("current_price") or 0
        if 0.97 <= price <= 1.03 and abs(m.get("price_change_percentage_24h") or 0) < 0.5:
            continue  # looks pegged to a dollar
        if swyftx_codes is not None and code not in swyftx_codes:
            continue
        out.append({"id": cg, "code": code, "name": m.get("name"), "rank": m.get("market_cap_rank"),
                    "mcap": mcap})
        if len(out) >= MAX_CANDIDATES:
            break
    return out


def review_tracked(coins: List[Dict]) -> Dict:
    """Plain-English verdict on coins we already track, from Dip Report rows."""
    consider_removing, keep_strong, quiet = [], [], []
    for c in coins:
        if c.get("denied"):
            continue
        adv = c.get("advice", "")
        if adv.startswith("Careful"):
            consider_removing.append({"coin": c["coin"], "why": f"{c['perBuy']:+.1f}% per buy, 1y {c['change1y']:+.0f}%, {sum(t['open'] for t in c['tiers'].values())} lots still open"})
        elif adv.startswith("Quiet"):
            quiet.append({"coin": c["coin"], "why": "rarely dips — little to accumulate"})
        elif c.get("focus"):
            keep_strong.append({"coin": c["coin"], "why": f"{c['perBuy']:+.1f}% per buy over {c['buys']} dips"})
    return {"considerRemoving": consider_removing, "keepStrong": keep_strong, "quiet": quiet}


def daily_report_text(coins: List[Dict], review: Dict, opportunities: List[Dict]) -> str:
    """Public-friendly daily Telegram summary."""
    lines = ["📊 <b>BUDJU daily coin report</b>"]
    best = [c for c in coins if c.get("focus")][:5]
    if best:
        lines.append("⭐ <b>Best dip coins right now</b>")
        for c in best:
            lines.append(f"• {c['coin']} — {c['perBuy']:+.1f}% avg per dip bought ({c['buys']} dips in 1y)")
    watch = [n["coin"] for n in review.get("considerRemoving", [])]
    if watch:
        lines.append("👀 <b>Under review</b> (dips often don't recover): " + ", ".join(watch[:8]))
    if opportunities:
        lines.append("🔭 <b>New coins being watched</b>")
        for o in opportunities[:3]:
            lines.append(f"• {o.get('code')} ({o.get('name')}) — {o['perBuy']:+.1f}% avg per dip")
    lines.append("<i>Based on a year of daily prices. Paper analysis, not financial advice.</i>")
    return "\n".join(lines)
CASH_CODES = {"AUD", "USD", "USDC", "USDT"}
MIN_SUGGEST_USD = 20.0       # ignore dust
SMALL_CAP_USD = 100_000_000  # flagged "small" below this


def wallet_coin_suggestions(per_wallet: List[Dict], tracked: Set[str], prices: Dict[str, float],
                            mcaps: Optional[Dict[str, float]] = None) -> List[Dict]:
    """Coins held by connected wallets that the bot doesn't trade yet.
    per_wallet: [{"walletAddress", "holdings": {code: qty}}]."""
    held: Dict[str, Dict] = {}
    for w in per_wallet:
        for code, qty in (w.get("holdings") or {}).items():
            code = str(code).upper()
            if code in CASH_CODES or code in tracked or not qty or qty <= 0:
                continue
            h = held.setdefault(code, {"wallets": 0, "qty": 0.0})
            h["wallets"] += 1
            h["qty"] += float(qty)
    out = []
    for code, h in held.items():
        usd = h["qty"] * (prices.get(code) or 0.0)
        if usd < MIN_SUGGEST_USD:
            continue
        mc = (mcaps or {}).get(code)
        out.append({"code": code, "wallets": h["wallets"], "usdValue": round(usd, 2),
                    "small": bool(mc is not None and mc < SMALL_CAP_USD)})
    out.sort(key=lambda r: r["usdValue"], reverse=True)
    return out
