# ==========================================
# Signals / Copy Trading — paper trading entry/exit decisions
# ==========================================
# Pure decision logic: given a token mint, is it safe enough to open a
# *paper* position on, and (for the cron) what's its current price. No DB
# access — api/copytrade-webhook.py and api/copytrade-cron.py call these
# and persist the result via database.py.
#
# Safety-first throughout: anything that can't be verified (RugCheck
# unreachable, no Jupiter route, DexScreener has no pair) is treated as
# "don't open a paper position" rather than assumed safe. This fully
# controls what gets opened, so erring toward skipping a trade costs
# nothing — erring toward opening one on an unverifiable token defeats the
# entire point of a rug-check/liquidity filter.
# ==========================================

import json
import os
from typing import Dict, List, Optional
from urllib.request import Request, urlopen

# Fixed USD size for every paper trade — deliberately NOT the real
# trader's own position size (which this pipeline never learns from a
# Helius swap event anyway; see copytrade_helius.parse_helius_swap).
COPYTRADE_PAPER_SIZE_USD = float(os.getenv("COPYTRADE_PAPER_SIZE_USD", "50"))
COPYTRADE_MIN_LIQUIDITY_USD = float(os.getenv("COPYTRADE_MIN_LIQUIDITY_USD", "20000"))
COPYTRADE_MAX_PRICE_IMPACT_PCT = float(os.getenv("COPYTRADE_MAX_PRICE_IMPACT_PCT", "5"))
# Paper-only risk controls — memecoins are volatile enough that "wait for
# the trader's own sell signal" isn't a complete exit plan on its own.
COPYTRADE_STOP_LOSS_PCT = float(os.getenv("COPYTRADE_STOP_LOSS_PCT", "-60"))
COPYTRADE_MAX_HOLD_HOURS = float(os.getenv("COPYTRADE_MAX_HOLD_HOURS", "72"))

RUGCHECK_API_KEY = os.getenv("RUGCHECK_API_KEY", "")  # optional FluxRPC key, raises the 1/sec free limit to 3/sec
JUPITER_API_KEY = os.getenv("JUPITER_API_KEY", "")
USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
USDC_DECIMALS = 6


def _http_get_json(url: str, headers: Optional[Dict] = None, timeout: int = 10):
    req = Request(url, headers=headers or {"Accept": "application/json"})
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def get_dexscreener_prices(mints: List[str]) -> Dict[str, Dict]:
    """Batched DexScreener lookup (up to 30 mints/call, 300 req/min free,
    no key) -> {mint: {"priceUsd", "liquidityUsd", "symbol"}}. For each
    mint, picks the pair with the highest liquidity among any returned
    (a mint can have several pools)."""
    out: Dict[str, Dict] = {}
    for i in range(0, len(mints), 30):
        batch = mints[i:i + 30]
        if not batch:
            continue
        url = f"https://api.dexscreener.com/tokens/v1/solana/{','.join(batch)}"
        try:
            pairs = _http_get_json(url, timeout=10)
        except Exception as e:
            print(f"[copytrade_engine] dexscreener batch error: {e}")
            continue
        if not isinstance(pairs, list):
            continue
        for pair in pairs:
            base = (pair.get("baseToken") or {})
            mint = base.get("address")
            if not mint:
                continue
            liq = (pair.get("liquidity") or {}).get("usd") or 0
            try:
                price = float(pair.get("priceUsd") or 0)
            except (TypeError, ValueError):
                price = 0.0
            existing = out.get(mint)
            if not existing or liq > existing.get("liquidityUsd", 0):
                out[mint] = {"priceUsd": price, "liquidityUsd": liq, "symbol": base.get("symbol")}
    return out


def _rugcheck_summary(mint: str) -> Optional[Dict]:
    url = f"https://api.rugcheck.xyz/v1/tokens/{mint}/report/summary?cacheOnly=true"
    headers = {"Accept": "application/json"}
    if RUGCHECK_API_KEY:
        headers["X-API-KEY"] = RUGCHECK_API_KEY
    try:
        return _http_get_json(url, headers=headers, timeout=8)
    except Exception as e:
        print(f"[copytrade_engine] rugcheck error for {mint}: {e}")
        return None


def _rugcheck_is_risky(summary: Dict) -> bool:
    """RugCheck's exact summary field names aren't verified against a live
    key in this environment, so this reads several plausible shapes
    defensively (a normalised 0-100+ score, or a risks[] list with
    severity levels) rather than assuming one. An unrecognised shape is
    treated as risky (see module docstring: unverifiable -> skip)."""
    score = summary.get("score_normalised", summary.get("score"))
    if isinstance(score, (int, float)):
        return score >= 50
    risks = summary.get("risks")
    if isinstance(risks, list):
        return any(str(r.get("level", "")).lower() in ("high", "critical", "danger") for r in risks if isinstance(r, dict))
    return True  # unrecognised shape — can't confirm it's safe


def _jupiter_price_impact_ok(mint: str) -> Optional[float]:
    """USDC -> mint quote for the paper trade's own size; returns
    priceImpactPct (float) or None if no route / request failed."""
    amount_units = int(COPYTRADE_PAPER_SIZE_USD * (10 ** USDC_DECIMALS))
    url = (
        f"https://lite-api.jup.ag/swap/v1/quote?inputMint={USDC_MINT}&outputMint={mint}"
        f"&amount={amount_units}&slippageBps=100"
    )
    headers = {"Accept": "application/json"}
    if JUPITER_API_KEY:
        headers["x-api-key"] = JUPITER_API_KEY
    try:
        data = _http_get_json(url, headers=headers, timeout=10)
        impact = data.get("priceImpactPct")
        return float(impact) * 100 if impact is not None else None
    except Exception as e:
        print(f"[copytrade_engine] jupiter quote error for {mint}: {e}")
        return None


def evaluate_entry(mint: str) -> Dict:
    """Full safety pipeline for opening a NEW paper position on `mint`.
    Returns {"approved", "reason", "priceUsd", "symbol", "liquidityUsd"}.
    Order: price/liquidity (cheap, free) -> rug check -> price impact —
    cheapest/most-likely-to-reject checks first, same "fail fast" shape as
    the perp strategy signal-filter pipeline."""
    prices = get_dexscreener_prices([mint])
    info = prices.get(mint)
    if not info or not info.get("priceUsd"):
        return {"approved": False, "reason": "no DexScreener price/pair found", "priceUsd": None, "symbol": None, "liquidityUsd": 0}

    if info.get("liquidityUsd", 0) < COPYTRADE_MIN_LIQUIDITY_USD:
        return {
            "approved": False, "reason": f"liquidity ${info.get('liquidityUsd', 0):,.0f} below ${COPYTRADE_MIN_LIQUIDITY_USD:,.0f} minimum",
            "priceUsd": info["priceUsd"], "symbol": info.get("symbol"), "liquidityUsd": info.get("liquidityUsd", 0),
        }

    summary = _rugcheck_summary(mint)
    if summary is None or _rugcheck_is_risky(summary):
        return {
            "approved": False, "reason": "RugCheck flagged this token (or no cached report available)",
            "priceUsd": info["priceUsd"], "symbol": info.get("symbol"), "liquidityUsd": info.get("liquidityUsd", 0),
        }

    impact = _jupiter_price_impact_ok(mint)
    if impact is None:
        return {
            "approved": False, "reason": "no Jupiter swap route found",
            "priceUsd": info["priceUsd"], "symbol": info.get("symbol"), "liquidityUsd": info.get("liquidityUsd", 0),
        }
    if impact > COPYTRADE_MAX_PRICE_IMPACT_PCT:
        return {
            "approved": False, "reason": f"price impact {impact:.1f}% exceeds {COPYTRADE_MAX_PRICE_IMPACT_PCT:.1f}% max",
            "priceUsd": info["priceUsd"], "symbol": info.get("symbol"), "liquidityUsd": info.get("liquidityUsd", 0),
        }

    return {
        "approved": True, "reason": "passed liquidity, rug-check and price-impact filters",
        "priceUsd": info["priceUsd"], "symbol": info.get("symbol"), "liquidityUsd": info.get("liquidityUsd", 0),
    }
