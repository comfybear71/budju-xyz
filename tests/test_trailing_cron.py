"""Trailing take-profit through the real trading cron: OFF = unchanged; ON = wait while rising, sell on a pullback."""
import unittest.mock as um

import pytest

from tests.test_shared_targets import env, make_client, make_state  # noqa: F401


def _state(extra=None):
    st = make_state({"BTC:1": {"buy": 40000, "sell": 55000, "setAt": 1}})       # price 60000 is ABOVE the sell level
    st.update(extra or {})
    return st


def _run(env, state, holdings_btc=0.05):
    cron, db = env
    cron.MAX_DAILY_SPEND_USDC = 0.0
    clients = {"k-pool": make_client(1000.0), "k-user": make_client(500.0)}
    for c in clients.values():
        c.get_holdings.return_value = {"USDC": 500.0, "BTC": holdings_btc}
    cron.SwyftxClient = um.MagicMock(side_effect=lambda key: clients[key])
    cron.send_telegram = lambda t: None
    cron.get_user_bot_position = lambda w, c: holdings_btc
    cron.get_user_avg_cost = lambda w, c: 0.0
    saved = {}
    db.get_trader_state.return_value = state
    db.save_trader_state.side_effect = lambda s: saved.update(s) or {"success": True}
    cron.run_auto_trade_check()
    sells = sum(1 for c in clients.values() for call in c.place_market_order.call_args_list if call.args[1] == "sell")
    return sells, saved


def test_off_by_default_sells_at_the_level_as_before(env):
    sells, saved = _run(env, _state())
    assert sells == 2


def test_on_waits_while_rising_then_sells_on_the_pullback(env):
    cfg = {"autoTrailingConfig": {"enabled": True, "pullbackPct": 5, "capPct": 25}}
    sells, saved = _run(env, _state(cfg))
    assert sells == 0                                                   # reached the level: armed, not sold
    assert saved["autoTrail"]["BTC:1"]["high"] == 60000.0

    armed = _state({**cfg, "autoTrail": {"BTC:1": {"high": 70000.0, "at": 2_000_000_000_000}}})
    sells, saved = _run(env, armed)
    assert sells == 2                                                   # 60000 is 14% below the 70000 high: sell in every wallet
    assert "BTC:1" not in saved["autoTrail"]                            # and the signal resets
