# ==========================================
# Per-wallet daily buying limit (pure — no database / network)
# ==========================================
# The most one wallet may BUY in any rolling 24 hours (USDC). Each wallet (and the admin) can set its own number.
# Anything not set uses the default. A ceiling stops one setting from being absurd; only the code/server settings can raise it.

import os

DEFAULT_LIMIT = float(os.getenv("MAX_DAILY_SPEND_USDC", "3000") or 3000)
CEILING = float(os.getenv("MAX_DAILY_SPEND_CEILING_USDC", "10000") or 10000)
MINIMUM = 100.0


def clean_limit(value):
    """-> float within [MINIMUM, CEILING], or None if it isn't a usable number."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if v != v or v in (float("inf"), float("-inf")):
        return None
    return round(min(CEILING, max(MINIMUM, v)), 2)


def effective_limit(saved):
    """The limit that applies: the wallet's saved number if valid, otherwise the default."""
    v = clean_limit(saved)
    return v if v is not None else min(CEILING, DEFAULT_LIMIT)


def bot_rules(auto_tiers=None):
    """Every limit the bot works within, for the plain-English list on the Home card. The numbers come from the same
    settings the trading cron reads (keep the defaults in step with api/auto-trade-cron.py)."""
    def env(name, default):
        try:
            return float(os.getenv(name, default))
        except (TypeError, ValueError):
            return float(default)
    tiers = {}
    for t, (dev, alloc, hours) in {1: (5.0, 5.0, 12.0), 2: (8.5, 10.0, 12.0), 3: (15.0, 15.0, 24.0)}.items():
        cfg = (auto_tiers or {}).get(f"tier{t}", {}) if isinstance(auto_tiers, dict) else {}
        try:
            tiers[str(t)] = {"dip": float(cfg.get("deviation", dev)), "spend": float(cfg.get("allocation", alloc)),
                             "pauseHours": float(cfg.get("cooldownHours", hours))}
        except (TypeError, ValueError):
            tiers[str(t)] = {"dip": dev, "spend": alloc, "pauseHours": hours}
    return {
        "maxSingleBuy": env("MAX_SINGLE_TRADE_USDC", "250"),
        "minBuy": 8.0,
        "keepSpare": env("MIN_USDC_RESERVE", "30"),
        "minSell": env("SWYFTX_MIN_SELL_USDC", "30"),
        "buysPerRun": 18,
        "runMinutes": 5,
        "tiers": tiers,
    }
