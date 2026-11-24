import os
import sys
import time
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
import t1_sell_reset  # noqa: E402
from t1_sell_reset import apply_reset, follows_buy, RESET_ID  # noqa: E402
from tests.test_shared_targets import env, make_client, make_state  # noqa: E402,F401


@pytest.fixture(autouse=True)
def _on(monkeypatch):
    monkeypatch.setattr(t1_sell_reset, "ENABLED", True)           # the project-wide switch-off in conftest does not apply here


def st(tn):
    return {"deviation": 5.0, "sellDeviation": 12.5}


def test_reset_puts_each_t1_level_at_the_reference_price_times_the_arm_and_touches_nothing_else():
    targets = {"BTC:1": {"buy": 53967, "sell": 92593, "setAt": 1},
               "BTC:2": {"buy": 50000, "sell": 200000, "setAt": 1},
               "ETH:1": {"buy": 1497, "sell": 2732, "setAt": 1}}
    new, changed = apply_reset(targets, st)
    assert new["BTC:1"]["sell"] == pytest.approx(53967 / 0.95 * 1.125)         # about 63,908: the plan level from the $56,808 reference
    assert new["ETH:1"]["sell"] == pytest.approx(1497 / 0.95 * 1.125)
    assert new["BTC:2"] == targets["BTC:2"]                                    # T2 stays anchored high
    assert targets["BTC:1"]["sell"] == 92593                                   # input untouched
    assert {c[0] for c in changed} == {"BTC:1", "ETH:1"}
    assert apply_reset(new, st)[1] == []                                       # already at the plan level: nothing to change
    assert follows_buy("BTC:1") and not follows_buy("BTC:2") and not follows_buy("BTC:3")


def test_the_cron_resets_t1_once_and_only_once(env):
    cron, db = env
    state = make_state({"BTC:1": {"buy": 53967, "sell": 92593, "setAt": 1}})        # price 60000 is above the buy level: no buy
    db.get_trader_state.return_value = state
    clients = {"k-pool": make_client(0.0), "k-user": make_client(0.0)}
    cron.SwyftxClient = MagicMock(side_effect=lambda key: clients[key])
    cron.send_telegram = lambda t: None
    saved = {}
    db.save_trader_state.side_effect = lambda s: saved.update(s) or {"success": True}
    result = cron.run_auto_trade_check()
    assert saved["autoActive"]["targets"]["BTC:1"]["sell"] == pytest.approx(53967 / 0.95 * 1.125)
    assert RESET_ID in saved["autoRepairs"] and any("Tier 1 sell levels reset" in line for line in result["log"])
    # the next run (flag stored): a level that is high again is left alone
    state2 = make_state({"BTC:1": {"buy": 53967, "sell": 92593, "setAt": 1}})
    state2["autoRepairs"] = {RESET_ID: 1}
    db.get_trader_state.return_value = state2
    saved.clear()
    result2 = cron.run_auto_trade_check()
    assert saved["autoActive"]["targets"]["BTC:1"]["sell"] == 92593
    assert not any("Tier 1 sell levels reset" in line for line in result2["log"])


def _two_tier_state(t2_sell):
    st_ = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}, "BTC:2": {"buy": 65000, "sell": t2_sell, "setAt": 1}})
    st_["autoTierAssignments"] = {"BTC": [1, 2]}
    st_["autoActive"]["tierActive"] = {"1": True, "2": True}
    st_["autoTiers"] = {"tier1": {"deviation": 5, "sellDeviation": 12.5, "allocation": 5, "cooldownHours": 12},
                        "tier2": {"deviation": 8.5, "sellDeviation": 30, "allocation": 10, "cooldownHours": 12}}
    st_["autoRepairs"] = {RESET_ID: 1}                                            # reset already done: only the buy rule is under test
    return st_


def test_a_buy_moves_the_t1_sell_level_but_t2_keeps_the_higher_old_one(env):
    cron, db = env
    db.get_trader_state.return_value = _two_tier_state(200000)
    clients = {"k-pool": make_client(5000.0), "k-user": make_client(0.0)}
    cron.SwyftxClient = MagicMock(side_effect=lambda key: clients[key])
    cron.send_telegram = lambda t: None
    saved = {}
    db.save_trader_state.side_effect = lambda s: saved.update(s) or {"success": True}
    cron.run_auto_trade_check()
    t = saved["autoActive"]["targets"]
    assert t["BTC:1"]["sell"] == pytest.approx(60000 * 1.125)                      # T1 follows the buy
    assert t["BTC:2"]["sell"] == pytest.approx(200000)                             # T2 stays anchored high
    assert saved["autoCooldowns"]["BTC:1"] > time.time() * 1000 and saved["autoCooldowns"]["BTC:2"] > time.time() * 1000
