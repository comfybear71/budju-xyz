"""Pure NAV / withdrawal reconstruction maths — no DB, fully unit-testable.

Used by:
- the one-off correction for the July-16 unrecorded $13,260.17 withdrawal
- the record_withdrawal fix (snapshot the PRE-withdrawal NAV, not the
  collapsed post-withdrawal live NAV)

Key identity (proven in tests): if you burn `amount / pre_nav` shares while
`amount` of value has left the pool, NAV is invariant — it returns to the
pre-withdrawal level, so every remaining holder's dollar value
(shares x NAV) is restored to the cent.
"""


def pre_withdrawal_nav(current_pool_value: float, total_shares: float, amount: float) -> float:
    """Reconstruct the NAV that applied *before* the withdrawal.

    `current_pool_value` is the live (post-withdrawal) pool value — the money
    has already left — so the pre-withdrawal value was (current + amount).
    """
    if total_shares <= 0:
        return 1.0
    return (current_pool_value + amount) / total_shares


def shares_to_burn(amount: float, pre_nav: float, admin_shares: float) -> float:
    """Shares to burn for a withdrawal, at the pre-withdrawal NAV, capped at
    the admin's holding (never burn more than the admin owns)."""
    if pre_nav <= 0:
        return 0.0
    burn = amount / pre_nav
    return burn if burn <= admin_shares else admin_shares


def reconstruct(current_pool_value: float, total_shares: float, amount: float,
                admin_shares: float) -> dict:
    """Full reconstruction for correcting an unrecorded withdrawal.

    Returns the collapsed (current) NAV, the restored NAV, the shares to burn,
    and the new total shares. After burning `burn` admin shares the NAV returns
    to `pre_nav`, restoring every non-admin holder's dollar value.
    """
    current_nav = (current_pool_value / total_shares) if total_shares > 0 else 1.0
    pre_nav = pre_withdrawal_nav(current_pool_value, total_shares, amount)
    burn = shares_to_burn(amount, pre_nav, admin_shares)
    new_total_shares = total_shares - burn
    new_nav = (current_pool_value / new_total_shares) if new_total_shares > 0 else 1.0
    return {
        "currentNav": current_nav,
        "preWithdrawalNav": pre_nav,
        "restoredNav": new_nav,
        "sharesToBurn": burn,
        "newTotalShares": new_total_shares,
    }
