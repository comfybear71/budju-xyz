# ==========================================
# Signals / Copy Trading — wallet filter heuristics
# ==========================================
# Pure functions: given a tracked wallet's closed-trade stats, decide
# whether it looks like a genuine discretionary/swing trader (worth
# following) or a wash-trader/sniper bot (exclude from the public
# leaderboard). No DB access here — api/copytrade-cron.py reads wallets via
# database.py, scores them with this module, then writes the result back
# via database.py's apply_copytrade_filter_result().
#
# Deliberately NOT attempting insider/launch-sniper detection in Phase 1 —
# that needs the token's own launch/creation timestamp, which isn't
# ingested yet (Helius swap events don't carry it). Flagging that as a
# known gap rather than shipping a heuristic nobody has verified.
# ==========================================

from typing import Dict, List, Optional

# A wallet needs at least this many closed trades before it's scored at
# all — too little history means "wash trader" and "lucky one good trade"
# are indistinguishable. Below this, a wallet just stays "pending".
MIN_TRADES_TO_SCORE = 10

# Wash-trade suspicion: a very high win rate made of trades that barely
# move (small average P&L per trade relative to position size) looks like
# a bot round-tripping its own liquidity for volume/rewards, not genuine
# directional skill.
WASH_WIN_RATE_THRESHOLD = 92.0
WASH_AVG_PNL_PCT_THRESHOLD = 1.5  # |avg pnl %| below this, at a high win rate, is suspicious

# Sniper-bot suspicion: trades that open and close within seconds, every
# time, are a bot racing new listings — not something a paper-trading
# follower can realistically act on anyway (the window's gone by the time
# BUDJU's own signal fires).
SNIPER_AVG_HOLD_MINUTES_THRESHOLD = 0.2  # ~12 seconds


def score_wallet(stats: Dict, trade_pnls_pct: Optional[List[float]] = None) -> Dict:
    """Returns {"flags": {...}, "status": "active"|"excluded"|"pending",
    "reason": str|None}. `stats` is a wallet doc's `stats` sub-document;
    `trade_pnls_pct` (optional) is the list of individual closed trades'
    pnlPct, used for a slightly sharper average-move check when available."""
    trades = stats.get("trades", 0)
    if trades < MIN_TRADES_TO_SCORE:
        return {"flags": {}, "status": "pending", "reason": None}

    win_rate = stats.get("winRate", 0.0)
    avg_hold = stats.get("avgHoldMinutes", 0.0)

    if trade_pnls_pct:
        avg_abs_move = sum(abs(p) for p in trade_pnls_pct) / len(trade_pnls_pct)
    else:
        # Fallback: approximate "average move" from total P&L alone isn't
        # meaningful without position sizes, so just use win rate alone.
        avg_abs_move = None

    flags = {
        "washTradeSuspect": False,
        "sniperBotSuspect": False,
    }

    if win_rate >= WASH_WIN_RATE_THRESHOLD and (
        avg_abs_move is None or avg_abs_move < WASH_AVG_PNL_PCT_THRESHOLD
    ):
        flags["washTradeSuspect"] = True

    if 0 < avg_hold < SNIPER_AVG_HOLD_MINUTES_THRESHOLD:
        flags["sniperBotSuspect"] = True

    if flags["washTradeSuspect"] or flags["sniperBotSuspect"]:
        reasons = []
        if flags["washTradeSuspect"]:
            reasons.append("wash-trade pattern (high win rate, negligible average move)")
        if flags["sniperBotSuspect"]:
            reasons.append("sniper-bot pattern (sub-second average hold time)")
        return {"flags": flags, "status": "excluded", "reason": "; ".join(reasons)}

    return {"flags": flags, "status": "active", "reason": None}
