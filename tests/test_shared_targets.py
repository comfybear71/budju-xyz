"""Every wallet follows the SAME shared targets/cooldowns (admin Auto Trade
screen); a signal moves its shared target once; one-time catch-up buys."""

import importlib.util
import os
import sys
import time
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

POOL = "ADMINWALLETFAKE1111"
USER = "USERWALLETFAKE22222"
TIERS = {"tier1": {"deviation": 5, "sellDeviation": 12.5, "allocation": 5, "cooldownHours": 12}}


def make_state(targets, cooldowns=None, catchup=None):
    st = {
        "autoActive": {"isActive": True, "tierActive": {"1": True}, "targets": targets},
        "autoTierAssignments": {"BTC": [1]},
        "autoTiers": TIERS,
        "autoCooldowns": cooldowns or {},
        "autoTradeLog": [],
    }
    if catchup is not None:
        st["autoCatchUp"] = catchup
    return st


@pytest.fixture
def env():
    db = MagicMock()
    db.ADMIN_WALLETS = [POOL]
    db.decrypt_secret = lambda x: x
    db.get_prices_for_coins = MagicMock(return_value={"BTC": 60000.0})
    db.get_coin_stats = MagicMock(return_value={"coins": []})
    db.user_exchange_keys_collection.find.return_value = [
        {"walletAddress": POOL, "status": "active", "autoTradeEnabled": True, "encryptedApiKey": "k-pool"},
        {"walletAddress": USER, "status": "active", "autoTradeEnabled": True, "encryptedApiKey": "k-user"},
    ]
    # The user wallet's OWN private targets must be ignored.
    db.get_user_trader_state = MagicMock(return_value={
        "targets": {"BTC:1": {"buy": 1, "sell": 2, "setAt": 1}}, "cooldowns": {}, "tradeLog": []})
    with patch.dict("sys.modules", {"database": db}):
        spec = importlib.util.spec_from_file_location(
            "cron_shared_targets_test", os.path.join(os.path.dirname(__file__), "..", "api", "auto-trade-cron.py"))
        cron = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cron)
        yield cron, db


def make_client(usdc):
    c = MagicMock()
    c.get_holdings.return_value = {"USDC": usdc}
    c.get_code_to_id_map.return_value = {"USDC": "1", "BTC": "2"}
    c.place_market_order.return_value = (True, "order", None)
    c.last_fill = None
    return c


def run(env, state, pool_usdc=1000.0, user_usdc=500.0):
    cron, db = env
    db.get_trader_state.return_value = state
    clients = {"k-pool": make_client(pool_usdc), "k-user": make_client(user_usdc)}
    cron.SwyftxClient = MagicMock(side_effect=lambda key: clients[key])
    sent = []
    cron.send_telegram = lambda t: sent.append(t)
    saved = {}
    db.save_trader_state.side_effect = lambda s: saved.update(s) or {"success": True}
    result = cron.run_auto_trade_check()
    return result, clients, saved, sent


def test_every_wallet_buys_at_the_same_shared_target_and_it_ratchets_once(env):
    state = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})
    result, clients, saved, sent = run(env, state)

    assert clients["k-pool"].place_market_order.call_count == 1
    assert clients["k-user"].place_market_order.call_count == 1
    assert result["tradesExecuted"] == 2
    tgt = saved["autoActive"]["targets"]["BTC:1"]
    assert tgt["buy"] == pytest.approx(60000 * 0.95)          # moved once, off the price
    assert tgt["sell"] == pytest.approx(90000)                 # a buy keeps the higher sell
    assert saved["autoCooldowns"]["BTC:1"] > time.time() * 1000
    assert len(sent) == 1 and "2 trade(s) across 2 wallet(s)" in sent[0]


def test_wallet_that_cannot_afford_skips_but_others_trade(env):
    state = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})
    result, clients, saved, _ = run(env, state, user_usdc=20.0)

    assert clients["k-user"].place_market_order.call_count == 0
    assert clients["k-pool"].place_market_order.call_count == 1
    assert saved["autoActive"]["targets"]["BTC:1"]["buy"] == pytest.approx(60000 * 0.95)


def test_private_per_wallet_targets_are_ignored(env):
    state = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})
    _, clients, _, _ = run(env, state)
    assert clients["k-user"].place_market_order.call_count == 1


def test_shared_cooldown_blocks_every_wallet(env):
    state = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}},
                       cooldowns={"BTC:1": int(time.time() * 1000) + 3_600_000})
    _, clients, _, _ = run(env, state)
    assert clients["k-pool"].place_market_order.call_count == 0
    assert clients["k-user"].place_market_order.call_count == 0


class TestCatchUp:
    def catchup(self, limit=61000.0, done=None, expires_in=3_600_000):
        now = int(time.time() * 1000)
        return {"createdAt": now, "expiresAt": now + expires_in, "limits": {"BTC:1": limit}, "done": done or {}}

    def blocked_state(self, **kw):
        # shared target NOT crossed (buy 50000 < price 60000) and on cooldown
        return make_state({"BTC:1": {"buy": 50000, "sell": 90000, "setAt": 1}},
                          cooldowns={"BTC:1": int(time.time() * 1000) + 3_600_000},
                          catchup=self.catchup(**kw))

    def test_non_admin_wallet_buys_once_ignoring_cooldown_and_target_stays_put(self, env):
        _, clients, saved, _ = run(env, self.blocked_state())

        assert clients["k-user"].place_market_order.call_count == 1
        assert clients["k-pool"].place_market_order.call_count == 0     # admin already bought
        assert saved["autoCatchUp"]["done"][USER] == ["BTC:1"]
        assert saved["autoActive"]["targets"]["BTC:1"]["buy"] == 50000  # shared target NOT ratcheted

    def test_progress_is_saved_right_after_each_buy_not_only_at_cycle_end(self, env):
        """If the server is cut off mid-cycle, a buy already placed must
        already be remembered, or the next cycle would repeat it."""
        cron, db = env
        calls = []
        db.save_trader_state.side_effect = lambda s: calls.append(s) or {"success": True}
        db.get_trader_state.return_value = self.blocked_state()
        clients = {"k-pool": make_client(1000.0), "k-user": make_client(500.0)}
        cron.SwyftxClient = MagicMock(side_effect=lambda key: clients[key])
        cron.send_telegram = lambda t: None

        cron.run_auto_trade_check()

        first = next(c for c in calls if "autoCatchUp" in c)
        first_shared_save = next(i for i, c in enumerate(calls) if "autoActive" in c)
        assert first["autoCatchUp"]["done"][USER] == ["BTC:1"]
        assert calls.index(first) < first_shared_save           # saved BEFORE the end-of-cycle save
        shared_save = calls[first_shared_save]
        assert shared_save["autoCatchUp"]["done"][USER] == ["BTC:1"]  # end-of-cycle save agrees, no duplicates

    def test_not_repeated_once_done(self, env):
        _, clients, _, _ = run(env, self.blocked_state(done={USER: ["BTC:1"]}))
        assert clients["k-user"].place_market_order.call_count == 0

    def test_not_bought_if_price_above_original_target(self, env):
        _, clients, _, _ = run(env, self.blocked_state(limit=59000.0))  # price 60000 > 59000
        assert clients["k-user"].place_market_order.call_count == 0

    def test_expired_catchup_is_ignored(self, env):
        _, clients, _, _ = run(env, self.blocked_state(expires_in=-1000))
        assert clients["k-user"].place_market_order.call_count == 0


class TestCatchUpPreview:
    @pytest.fixture
    def mod(self):
        db = MagicMock()
        db.ADMIN_WALLETS = [POOL]
        db.decrypt_secret = lambda x: x
        db.get_prices_for_coins = MagicMock(return_value={"BTC": 76000.0, "ETH": 2200.0})
        db.get_user_trader_state = MagicMock(return_value={"tradeLog": []})
        db.get_trader_state = MagicMock(return_value={
            "autoActive": {"tierActive": {"1": True, "2": True}},
            "autoTierAssignments": {"BTC": [1, 2], "ETH": [1, 2]},
            "autoTiers": {"tier1": {"allocation": 5}, "tier2": {"allocation": 10}},
        })
        db.user_exchange_keys_collection.find.return_value = [
            {"walletAddress": POOL, "autoTradeEnabled": True, "encryptedApiKey": "a"},
            {"walletAddress": USER, "autoTradeEnabled": True, "encryptedApiKey": "u"},
        ]
        sw = MagicMock()
        client = MagicMock()
        client.get_holdings.return_value = {"USDC": 200.0}
        sw.SwyftxClient = MagicMock(return_value=client)
        with patch.dict("sys.modules", {"database": db, "swyftx_client": sw}):
            spec = importlib.util.spec_from_file_location(
                "catchup_under_test", os.path.join(os.path.dirname(__file__), "..", "api", "catchup_buys.py"))
            m = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(m)
            yield m, db

    def test_sizes_buys_sequentially_and_excludes_admin(self, mod):
        m, _ = mod
        out = m.preview_catchup(POOL)

        assert len(out["wallets"]) == 1                     # admin wallet excluded
        w = out["wallets"][0]
        buys = {b["signal"]: b["amountUsd"] for b in w["buys"]}
        assert "BTC:2" not in buys                          # not one of the 12 admin buys
        assert buys["BTC:1"] == pytest.approx(10.0)         # 5% of 200
        assert buys["ETH:1"] == pytest.approx(9.5)          # 5% of 190 (balance shrinks)
        assert buys["ETH:2"] == pytest.approx(18.05)        # 10% of 180.5
        assert w["usdcLeft"] >= 30

    def test_arm_is_refused_while_active_unless_forced(self, mod):
        m, db = mod
        db.get_trader_state.return_value = {"autoCatchUp": {"expiresAt": int(time.time() * 1000) + 100000}}
        assert m.arm_catchup()["armed"] is False
        assert m.arm_catchup(force=True)["armed"] is True
        assert "autoCatchUp" in db.save_trader_state.call_args[0][0]


def test_cards_get_a_plain_reason_when_a_waiting_buy_does_not_happen(env):
    # BTC is below its buy level but the admin account has too little USDC; ETH is still above its level in the bot's own price.
    cron, db = env
    cron.get_prices_for_coins = MagicMock(return_value={"BTC": 60000.0, "ETH": 3000.0})
    state = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}, "ETH:1": {"buy": 2800, "sell": 4000, "setAt": 1}})
    state["autoTierAssignments"] = {"BTC": [1], "ETH": [1]}
    result, clients, saved, sent = run(env, state, pool_usdc=20.0, user_usdc=20.0)
    items = saved["autoBuyStatus"]["items"]
    assert items["BTC:1"].startswith("Waiting for cash")
    assert "hasn't reached the buy price" in items["ETH:1"]


def test_a_signal_that_traded_has_no_reason(env):
    state = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})
    result, clients, saved, sent = run(env, state)
    assert "BTC:1" not in saved["autoBuyStatus"]["items"]


def test_each_buy_is_saved_immediately_so_a_cut_off_run_cannot_repeat_it(env):
    """The new buy level and pause must be written right after the order, not only at the end of the run."""
    cron, db = env
    state = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})
    db.get_trader_state.return_value = state
    clients = {"k-pool": make_client(1000.0), "k-user": make_client(500.0)}
    cron.SwyftxClient = MagicMock(side_effect=lambda key: clients[key])
    cron.send_telegram = lambda t: None
    saves = []

    def record(s):
        saves.append(dict(s))
        # a save made while the admin wallet is still working: stop the run right here (simulates a timeout)
        if "autoCooldowns" in s and "BTC:1" in s["autoCooldowns"] and len(saves) == 1:
            raise SystemExit("simulated cut-off after the first order")
        return {"success": True}

    db.save_trader_state.side_effect = record
    with pytest.raises(SystemExit):
        cron.run_auto_trade_check()
    first = saves[0]
    assert "BTC:1" in first["autoCooldowns"] and first["autoCooldowns"]["BTC:1"] > time.time() * 1000
    assert first["autoActive"]["targets"]["BTC:1"]["buy"] == pytest.approx(60000 * 0.95)


def test_run_stops_placing_orders_when_its_time_budget_is_used_up(env):
    cron, db = env
    cron.RUN_BUDGET_SECONDS = -1          # already over budget the moment the first signal is reached
    state = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})
    result, clients, saved, sent = run(env, state)
    assert clients["k-pool"].place_market_order.call_count == 0
    assert any("time limit" in line for line in result["log"])


def test_trade_log_is_saved_right_after_each_order(env):
    cron, db = env
    state = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})
    db.get_trader_state.return_value = state
    clients = {"k-pool": make_client(1000.0), "k-user": make_client(500.0)}
    cron.SwyftxClient = MagicMock(side_effect=lambda key: clients[key])
    cron.send_telegram = lambda t: None
    saves = []
    db.save_trader_state.side_effect = lambda s: saves.append(dict(s)) or {"success": True}
    cron.run_auto_trade_check()
    first_log_save = next(i for i, s in enumerate(saves) if "autoTradeLog" in s)
    assert saves[first_log_save]["autoTradeLog"][0]["coin"] == "BTC"


def test_one_time_repair_pauses_the_unsaved_buy_once_and_only_once(env, monkeypatch):
    import repair_unsaved_buys as rep
    cron, db = env
    monkeypatch.setattr(rep, "UNSAVED_BUYS", [("BTC", 1, 60000.0)])
    state = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})
    result, clients, saved, sent = run(env, state)
    assert clients["k-pool"].place_market_order.call_count == 0          # BTC:1 was marked bought, so it is paused
    assert "BTC:1" in saved["autoCooldowns"] and saved["autoRepairs"][rep.REPAIR_ID] > 0
    assert any("Repair" in line for line in result["log"])
    # a run that already has the flag does not touch anything
    state2 = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})
    state2["autoRepairs"] = {rep.REPAIR_ID: 1}
    result2, clients2, saved2, sent2 = run(env, state2)
    assert clients2["k-pool"].place_market_order.call_count == 1
    assert not any("Repair" in line for line in result2["log"])


def test_a_buy_over_the_single_buy_limit_is_made_at_the_limit_not_skipped(env):
    cron, db = env
    cron.MAX_SINGLE_TRADE_USDC = 250.0
    state = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})
    state["autoTiers"] = {"tier1": {"deviation": 5, "sellDeviation": 12.5, "allocation": 15, "cooldownHours": 12}}   # 15% of $5000 = $750
    result, clients, saved, sent = run(env, state, pool_usdc=5000.0, user_usdc=100.0)
    args = clients["k-pool"].place_market_order.call_args[0]
    assert args[1] == "buy" and args[2] == 250.0


def test_a_shit_list_coin_never_gets_a_big_buy_but_core_coins_do(env):
    cron, db = env
    cron.get_prices_for_coins = MagicMock(return_value={"LINK": 20.0, "BTC": 60000.0})
    cron.get_coin_priority = MagicMock(return_value={"careful": ["LINK", "BTC"], "focus": []})
    state = make_state({"LINK:1": {"buy": 25, "sell": 40, "setAt": 1}, "BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})
    state["autoTierAssignments"] = {"LINK": [1], "BTC": [1]}
    state["autoTiers"] = {"tier1": {"deviation": 5, "sellDeviation": 12.5, "allocation": 5, "cooldownHours": 12}}
    result, clients, saved, sent = run(env, state, pool_usdc=5000.0, user_usdc=100.0)      # 5% of $5000 would be $250
    amounts = {c[0][0]: c[0][2] for c in clients["k-pool"].place_market_order.call_args_list}
    assert amounts["LINK"] == 50.0                      # shit-list coin: capped at $50
    assert amounts["BTC"] > 100                         # core coin: never on the shit list, full size


def test_one_coin_cannot_take_more_than_the_per_coin_cap_across_its_tiers(env):
    cron, db = env
    cron.get_prices_for_coins = MagicMock(return_value={"LINK": 20.0})
    state = make_state({f"LINK:{t}": {"buy": 25, "sell": 40, "setAt": 1} for t in (1, 2, 3)})
    state["autoTierAssignments"] = {"LINK": [1, 2, 3]}
    state["autoActive"]["tierActive"] = {"1": True, "2": True, "3": True}
    state["autoTiers"] = {f"tier{t}": {"deviation": 5, "sellDeviation": 12.5, "allocation": a, "cooldownHours": 12} for t, a in ((1, 5), (2, 10), (3, 15))}
    result, clients, saved, sent = run(env, state, pool_usdc=5000.0, user_usdc=100.0)
    spent = sum(c[0][2] for c in clients["k-pool"].place_market_order.call_args_list)
    assert spent == 500.0              # 10% of $5000, though 15% + 10% + 5% of the cash left would have been far more


def test_group_shares_and_per_group_coin_limits_apply_in_the_real_bot(env):
    cron, db = env
    cron.get_prices_for_coins = MagicMock(return_value={"LINK": 20.0, "RAY": 1.0})
    cron.get_coin_ranks = MagicMock(return_value={"LINK": 8, "RAY": 300})            # LINK = Top 10 (10% limit), RAY = Smaller (2%)
    state = make_state({f"{c}:{t}": {"buy": 25 if c == "LINK" else 5, "sell": 90, "setAt": 1} for c in ("LINK", "RAY") for t in (1, 2, 3)})
    state["autoTierAssignments"] = {"LINK": [1, 2, 3], "RAY": [1, 2, 3]}
    state["autoActive"]["tierActive"] = {"1": True, "2": True, "3": True}
    state["autoTiers"] = {f"tier{t}": {"deviation": 5, "sellDeviation": 12.5, "allocation": a, "cooldownHours": 12} for t, a in ((1, 5), (2, 10), (3, 15))}
    result, clients, saved, sent = run(env, state, pool_usdc=5000.0, user_usdc=100.0)
    spent = {}
    for c in clients["k-pool"].place_market_order.call_args_list:
        spent[c[0][0]] = spent.get(c[0][0], 0.0) + c[0][2]
    assert spent["LINK"] == 500.0                    # Top 10 coin: 10% of $5000
    assert spent["RAY"] == 100.0                     # Smaller coin: 2% of $5000


def test_telegram_digest_refreshes_the_pool_snapshot_after_a_run_that_traded(env):
    cron, db = env
    state = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})
    run(env, state)
    assert db.digest_details.call_args.kwargs.get("fresh") is True



def _run_with_refused_orders(env, state):
    cron, db = env
    db.get_trader_state.return_value = state
    clients = {"k-pool": make_client(1000.0), "k-user": make_client(500.0)}
    for c in clients.values():
        c.place_market_order.return_value = (False, None, "AssetError: not presently tradable")
    cron.SwyftxClient = MagicMock(side_effect=lambda key: clients[key])
    cron.send_telegram = lambda t: None
    saved = {}
    db.save_trader_state.side_effect = lambda s: saved.update(s) or {"success": True}
    result = cron.run_auto_trade_check()
    return result, saved


def test_a_coin_swyftx_keeps_refusing_alerts_once_then_stays_quiet(env):
    from alerts import find_problems
    state = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})
    result, saved = _run_with_refused_orders(env, state)
    assert any("paused for 6h" in line for line in result["log"])                  # first time: the alert line
    assert find_problems(result["log"])
    assert saved["autoUntradableSeen"]["BTC"]["count"] == 1
    # the pause ran out and Swyftx still refuses it: paused longer, and NOT alerted again
    state2 = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}})
    state2["autoUntradableSeen"] = saved["autoUntradableSeen"]
    result2, saved2 = _run_with_refused_orders(env, state2)
    assert any("still switched off on Swyftx, paused another 24h" in line for line in result2["log"])
    assert not [p for p in find_problems(result2["log"]) if ":paused:" in p[0]]
    assert saved2["autoUntradableSeen"]["BTC"]["count"] == 2
