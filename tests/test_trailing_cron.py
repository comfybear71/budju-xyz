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


def test_a_coin_that_fell_back_under_its_level_is_never_sold_below_it_it_waits(env):
    """Armed at 70000, level 65000: a 5% pullback is 66500 (above the level) -> sold; price 60000 is under the level -> held."""
    cfg = {"autoTrailingConfig": {"enabled": True, "pullbackPct": 5, "capPct": 25}}
    st = make_state({"BTC:1": {"buy": 40000, "sell": 65000, "setAt": 1}})
    st.update({**cfg, "autoTrail": {"BTC:1": {"high": 70000.0, "at": 2_000_000_000_000}}})
    sells, saved = _run(env, st)
    assert sells == 0                                   # price 60000 is under the 65000 level: hold, stay armed
    assert "BTC:1" in (saved.get("autoTrail") or {})
    # a coin below its level that was NEVER armed is not sold either
    st2 = make_state({"BTC:1": {"buy": 40000, "sell": 65000, "setAt": 1}})
    st2.update(cfg)
    assert _run(env, st2)[0] == 0


def test_the_sale_says_why_and_arming_is_announced(env):
    cron, db = env
    sent = []
    cfg = {"autoTrailingConfig": {"enabled": True, "pullbackPct": 5, "capPct": 25}}
    # run 1: price 60000 reaches the 55000 level -> armed -> a Telegram "armed" message, no sale
    _run(env, _state(cfg))
    # run 2: armed at 70000, now 60000 -> sold on the pullback, and the Telegram line says why
    armed = _state({**cfg, "autoTrail": {"BTC:1": {"high": 70000.0, "at": 2_000_000_000_000}}})
    clients = {"k-pool": make_client(1000.0), "k-user": make_client(500.0)}
    for c in clients.values():
        c.get_holdings.return_value = {"USDC": 500.0, "BTC": 0.05}
    cron.SwyftxClient = um.MagicMock(side_effect=lambda key: clients[key])
    cron.send_telegram = lambda t: sent.append(t)
    cron.get_user_bot_position = lambda w, c: 0.05
    cron.get_user_avg_cost = lambda w, c: 0.0
    db.get_trader_state.return_value = armed
    db.save_trader_state.side_effect = lambda s: {"success": True}
    cron.run_auto_trade_check()
    text = "\n".join(sent)
    assert "trailing stop: it ran up to $70,000.00, then fell 14.3%" in text and "the stop is 5%" in text

    sent.clear()
    db.get_trader_state.return_value = _state(cfg)                      # nothing armed yet, price above the level
    cron.run_auto_trade_check()
    assert any("Trailing stop armed" in t and "BTC T1" in t and "about $57,000.00" in t for t in sent)    # 5% below the 60000 high


def test_a_trailing_stop_sale_records_its_reason_in_the_trade_log(env):
    cfg = {"autoTrailingConfig": {"enabled": True, "pullbackPct": 5, "capPct": 25}}
    armed = _state({**cfg, "autoTrail": {"BTC:1": {"high": 70000.0, "at": 2_000_000_000_000}}})
    sells, saved = _run(env, armed)
    assert sells == 2
    entry = saved["autoTradeLog"][0]
    assert entry["side"] == "sell" and "trailing stop: it ran up to $70,000.00" in entry["why"]
