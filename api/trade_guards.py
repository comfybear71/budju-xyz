"""Pure, dependency-free trading guards for the BUDJU auto-trader.

Extracted so they can be unit-tested without a live Swyftx or Mongo connection.
These are the July-2026 debt-payoff-sale safeguards:

- deployable-capital cap  (never treat parked capital as fully deployable)
- tax-loss rebuy blocklist with expiry  (ATO wash-sale protection)
- Swyftx minimum-order skip on sells  (avoid error loops on sliver positions)

Nothing here touches keys, wallets, order execution or tier trigger logic —
these are read-only decision helpers the cron consults before acting.
"""
from datetime import datetime

# Coins sold ~90% for tax-loss purposes (July 2026). Blocked from rebuy until
# 30 Aug 2026 to avoid ATO wash-sale risk. This is the seed default only —
# it is written to trader_state.autoRebuyBlocklist on first run and is
# admin-editable from there (change dates or remove coins in the DB).
DEFAULT_REBUY_BLOCKLIST = {
    coin: "2026-08-30T00:00:00Z"
    for coin in (
        "LUNA", "ENA", "SUI", "ADA", "BCH", "DOT", "PEPE",
        "XRP", "NEO", "DOGE", "AVAX", "HBAR", "RENDER", "XAUT",
    )
}


def deployable_amount(balance: float, max_deployable: float) -> float:
    """Capital the bot may size a buy from = min(balance, cap).

    The bot deploys USDC (AUD is converted to USDC before trading), so this
    caps how much USDC is treated as deployable. Parked capital above the cap
    (e.g. sale proceeds awaiting withdrawal) is never used to size buys.
    """
    try:
        b = float(balance)
        c = float(max_deployable)
    except (TypeError, ValueError):
        return 0.0
    if c < 0:
        c = 0.0
    return b if b < c else c


def _parse_iso(value):
    """Parse an ISO-8601 string to a naive UTC datetime, or None."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "").replace("+00:00", ""))
    except (ValueError, TypeError):
        return None


def is_rebuy_blocked(blocklist, code: str, now: datetime) -> bool:
    """True if ``code`` is on the rebuy blocklist and the block has not expired.

    Missing entries, malformed dates, or expired blocks all return False
    (i.e. buys are allowed). ``blocklist`` is {ASSET: blocked_until_iso}.
    """
    if not blocklist or not code:
        return False
    until = _parse_iso(blocklist.get(code))
    if until is None:
        return False
    return now < until


def sell_below_min(position_value_usd: float, min_order_usd: float) -> bool:
    """True if the whole position is worth less than the exchange minimum order.

    When True the caller should skip the sell cleanly (single log line, no
    order attempt) rather than place a sub-minimum order that the exchange
    rejects, which would error-loop every cycle.
    """
    try:
        return float(position_value_usd) < float(min_order_usd)
    except (TypeError, ValueError):
        # Unknown value → treat as below minimum (safer to skip than to error)
        return True
