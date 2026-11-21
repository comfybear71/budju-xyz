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
