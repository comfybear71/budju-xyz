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


def test_untradable_coin_is_paused_and_not_retried(env):
    cron, db = env
    cron.MAX_DAILY_SPEND_USDC = 0.0
    msg = 'HTTP 400: {"error":{"error":"AssetError","message":"Asset not presently tradable. Please try again later."}}'

    def fresh():
        from tests.test_shared_targets import make_client
        return {"k-pool": make_client(1000.0), "k-user": make_client(500.0)}

    import unittest.mock as um
    clients = fresh()
    for c in clients.values():
        c.place_market_order.return_value = (False, None, msg)
    saved = {}
    db.get_trader_state.return_value = _state()
    cron.SwyftxClient = um.MagicMock(side_effect=lambda key: clients[key])
    cron.send_telegram = lambda t: None
    db.save_trader_state.side_effect = lambda s: saved.update(s) or {"success": True}
    result = cron.run_auto_trade_check()
    assert "BTC" in saved["autoPausedAssets"] and saved["autoPausedAssets"]["BTC"] > 0
    assert any("paused for" in l for l in result["log"])

    # next cycle: the pause is in the saved state, so no order is attempted at all
    state2 = _state()
    state2["autoPausedAssets"] = saved["autoPausedAssets"]
    clients2 = fresh()
    db.get_trader_state.return_value = state2
    cron.SwyftxClient = um.MagicMock(side_effect=lambda key: clients2[key])
    cron.run_auto_trade_check()
    assert clients2["k-pool"].place_market_order.call_count == 0 and clients2["k-user"].place_market_order.call_count == 0
