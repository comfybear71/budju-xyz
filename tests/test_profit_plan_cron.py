"""The profit plan through the real cron: one sale per coin per run, no cap, staggered arm levels, one-time re-anchor."""
import unittest.mock as um

from tests.test_shared_targets import env, make_client, make_state  # noqa: F401


def _state(targets, trailing=None, plan_version=1, tiers=(1, 2, 3)):
    st = make_state(targets)
    st["autoActive"]["tierActive"] = {str(t): True for t in tiers}
    st["autoActive"]["planVersion"] = plan_version
    st["autoTierAssignments"] = {"BTC": list(tiers)}
    st["autoTiers"] = {f"tier{t}": {"deviation": 5, "sellDeviation": [12.5, 15, 20][t - 1], "allocation": [5, 10, 15][t - 1], "cooldownHours": 12} for t in tiers}
    if trailing:
        st["autoTrailingConfig"] = trailing
    return st


def _run(env, state, btc=0.05, price=60000.0):
    cron, db = env
    cron.MAX_DAILY_SPEND_USDC = 0.0
    db.get_prices_for_coins = um.MagicMock(return_value={"BTC": price})
    clients = {"k-pool": make_client(1000.0), "k-user": make_client(500.0)}
    for c in clients.values():
        c.get_holdings.return_value = {"USDC": 500.0, "BTC": btc}
    cron.SwyftxClient = um.MagicMock(side_effect=lambda key: clients[key])
    cron.send_telegram = lambda t: None
    cron.get_user_bot_position = lambda w, c: btc
    cron.get_user_avg_cost = lambda w, c: 0.0
    saved = {}
    db.get_trader_state.return_value = state
    db.save_trader_state.side_effect = lambda s: saved.update(s) or {"success": True}
    result = cron.run_auto_trade_check()
    sells = {k: [call for call in c.place_market_order.call_args_list if call.args[1] == "sell"] for k, c in clients.items()}
    return sells, saved, result


def test_three_tiers_crossing_together_sell_only_once_per_coin_per_run(env):
    targets = {f"BTC:{t}": {"buy": 40000, "sell": 55000, "setAt": 1} for t in (1, 2, 3)}
    sells, saved, _ = _run(env, _state(targets))
    assert all(len(v) == 1 for v in sells.values())                    # Tier 1 only; Tiers 2 and 3 wait for a later run


def test_slice_is_the_tiers_own_small_share_not_the_buy_allocation(env):
    targets = {"BTC:1": {"buy": 40000, "sell": 55000, "setAt": 1}}
    sells, _, _ = _run(env, _state(targets, tiers=(1,)), btc=0.05)
    amount = sells["k-pool"][0].args[2]                                 # USDC value sold
    assert abs(amount - 0.05 * 0.05 * 60000) < 1.0                      # 5% of 0.05 BTC at $60k = $150


def test_tiny_position_is_not_raised_to_the_minimum_when_that_sells_too_much(env):
    targets = {"BTC:1": {"buy": 40000, "sell": 55000, "setAt": 1}}
    sells, _, result = _run(env, _state(targets, tiers=(1,)), btc=0.0007)   # position $42; $30 min would be 71% of it
    assert all(len(v) == 0 for v in sells.values())
    assert any("SELL skipped" in line for line in result["log"])


def test_no_cap_a_huge_run_is_left_to_run_with_trailing_on(env):
    targets = {"BTC:1": {"buy": 40000, "sell": 100, "setAt": 1}}          # price is 600x past the level
    sells, saved, _ = _run(env, _state(targets, trailing={"enabled": True, "pullbackPct": 5, "capPct": 25}, tiers=(1,)))
    assert all(len(v) == 0 for v in sells.values())
    assert saved["autoTrail"]["BTC:1"]["high"] == 60000.0


def test_one_time_plan_move_re_anchors_old_sell_levels(env):
    # old Tier 2 level was +15% over a 100,000 reference (115,000); the plan moves it to +30% (130,000). Price is below both.
    targets = {"BTC:2": {"buy": 40000, "sell": 115000, "setAt": 1}}
    sells, saved, result = _run(env, _state(targets, plan_version=0, tiers=(2,)), price=60000.0)
    assert abs(saved["autoActive"]["targets"]["BTC:2"]["sell"] - 130000.0) < 1.0
    assert saved["autoActive"]["planVersion"] == 1
    assert any("Profit plan v1" in line for line in result["log"])
