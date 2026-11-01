"""MAX_DAILY_SPEND_USDC: a wallet may buy at most this much in any rolling 24h."""
import os, sys
from datetime import datetime
import pytest

from tests.test_shared_targets import env, make_state, run  # noqa: F401


def _state():
    return make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})


def test_buy_blocked_when_it_would_pass_the_daily_limit(env):
    cron, db = env
    cron.MAX_DAILY_SPEND_USDC = 60.0
    # the user wallet already bought $50 today; its next buy would be 5% of $500 = $25 -> $75 > $60
    cron.get_user_trader_state = lambda w: {"targets": {}, "cooldowns": {}, "tradeLog": [
        {"coin": "ETH", "side": "buy", "qty": 1.0, "price": 50.0, "timestamp": datetime.utcnow().isoformat() + "Z"}]}
    _, clients, _, _ = run(env, _state())
    assert clients["k-user"].place_market_order.call_count == 0
    assert clients["k-pool"].place_market_order.call_count == 1       # pool wallet unaffected


def test_zero_switches_the_limit_off_and_default_allows_normal_buys(env):
    cron, db = env
    cron.MAX_DAILY_SPEND_USDC = 0.0
    _, clients, _, _ = run(env, _state())
    assert clients["k-user"].place_market_order.call_count == 1
