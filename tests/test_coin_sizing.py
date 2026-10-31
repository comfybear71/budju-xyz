import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from coin_sizing import classify, size_buy  # noqa: E402


def test_classes():
    assert classify(2e12, 5e10)["cls"] == "blue"
    assert classify(20e9, 1e9)["cls"] == "large"
    assert classify(3e9, 1e8)["cls"] == "mid"
    assert classify(5e8, 5e7)["cls"] == "small"


def test_careful_drops_one_class_and_never_below_small():
    assert classify(2e12, 5e10, careful=True)["cls"] == "large"
    assert classify(5e8, 5e7, careful=True)["cls"] == "small"


def test_thin_volume_shrinks():
    a = classify(3e9, 1e8)           # 3.3% of mcap -> not thin
    b = classify(3e9, 1e7)           # 0.3% -> thin
    assert b["thin"] and not a["thin"] and b["mult"] < a["mult"]


def test_size_buy_multiplier_and_cap():
    mid = classify(3e9, 1e8)         # mult 0.65
    amt, _ = size_buy(100.0, mid, held_usd=0, cap_usd=0, min_order=8)
    assert amt == 65.0
    amt, note = size_buy(100.0, mid, held_usd=95, cap_usd=100, min_order=8)
    assert amt == 0.0 and "cap" in note                    # only $5 room < $8 minimum
    amt, _ = size_buy(100.0, mid, held_usd=60, cap_usd=100, min_order=8)
    assert amt == 40.0                                     # trimmed to the room left
    amt, _ = size_buy(5.0, mid, held_usd=0, cap_usd=100, min_order=8)
    assert amt == 8.0                                      # still honours the minimum order


# ── Integration with the live trading cron (same harness as test_shared_targets) ──
import pytest  # noqa: E402
from tests.test_shared_targets import env, make_state, run  # noqa: E402,F401


def _state():
    return make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})


def test_cron_unchanged_when_sizing_is_off(env):
    cron, db = env
    db.get_sizing_runtime = lambda: None
    _, clients, _, _ = run(env, _state())
    # pool: 5% of $1000 = $50, user: 5% of $500 = $25 (the original behaviour)
    assert clients["k-pool"].place_market_order.call_args[0][2] == pytest.approx(50.0)
    assert clients["k-user"].place_market_order.call_args[0][2] == pytest.approx(25.0)


def test_cron_applies_class_multiplier_when_on(env):
    cron, db = env
    db.get_sizing_runtime = lambda: {"enabled": True, "capUsd": 0, "classes": {"BTC": {"mult": 0.5}}}
    _, clients, _, _ = run(env, _state())
    assert clients["k-pool"].place_market_order.call_args[0][2] == pytest.approx(25.0)
    assert clients["k-user"].place_market_order.call_args[0][2] == pytest.approx(12.5)


def test_cron_skips_buy_when_coin_is_at_cap(env):
    cron, db = env
    db.get_sizing_runtime = lambda: {"enabled": True, "capUsd": 100, "classes": {"BTC": {"mult": 1.0}}}
    cron_mod, _ = env
    # pool already holds $200 of BTC (> $100 cap): no buy for it, user (holds none) still buys
    import unittest.mock as um
    def _make(usdc):
        from tests.test_shared_targets import make_client
        c = make_client(usdc)
        return c
    clients = {"k-pool": _make(1000.0), "k-user": _make(500.0)}
    clients["k-pool"].get_holdings.return_value = {"USDC": 1000.0, "BTC": 200.0 / 60000.0}
    db.get_trader_state.return_value = _state()
    cron_mod.SwyftxClient = um.MagicMock(side_effect=lambda key: clients[key])
    cron_mod.send_telegram = lambda t: None
    db.save_trader_state.side_effect = lambda s: {"success": True}
    cron_mod.run_auto_trade_check()
    assert clients["k-pool"].place_market_order.call_count == 0
    assert clients["k-user"].place_market_order.call_count == 1
