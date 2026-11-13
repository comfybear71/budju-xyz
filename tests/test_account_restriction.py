"""A restricted / rate-limited Swyftx account: one failed order per cycle, not one per coin — and a pause so the next cycles don't hammer it."""
import unittest.mock as um

from tests.test_shared_targets import POOL, env, make_client, make_state  # noqa: F401

RESTRICTED = 'HTTP 403: {"error":{"error":"CannotBuyCrypto","message":"There are restrictions on your account that prevent trading."}}'
RATE = 'HTTP 429: {"error":{"error":"RateLimit","message":"You\'ve attempted that too many times, too quickly."}}'


def _state(extra=None):
    st = make_state({"BTC:1": {"buy": 65000, "sell": 90000, "setAt": 1}, "ETH:1": {"buy": 3500, "sell": 5000, "setAt": 1}})
    st["autoTierAssignments"] = {"BTC": [1], "ETH": [1]}
    st.update(extra or {})
    return st


def _run(env, state, error):
    cron, db = env
    db.get_prices_for_coins = um.MagicMock(return_value={"BTC": 60000.0, "ETH": 3000.0})
    clients = {"k-pool": make_client(1000.0), "k-user": make_client(500.0)}
    for c in clients.values():
        c.get_code_to_id_map.return_value = {"USDC": "1", "BTC": "2", "ETH": "3"}
        c.place_market_order.return_value = (False, None, error)
    cron.SwyftxClient = um.MagicMock(side_effect=lambda key: clients[key])
    cron.send_telegram = lambda t: None
    saved = {}
    db.get_trader_state.return_value = state
    db.save_trader_state.side_effect = lambda s: saved.update(s) or {"success": True}
    result = cron.run_auto_trade_check()
    return clients, saved, result


def test_restricted_account_gets_one_attempt_then_a_pause(env):
    clients, saved, result = _run(env, _state(), RESTRICTED)
    assert clients["k-pool"].place_market_order.call_count == 1          # BTC failed; ETH was NOT tried
    assert POOL in saved["autoBlockedWallets"]
    assert any("trading restrictions" in line for line in result["log"])


def test_wallet_on_hold_makes_no_buy_attempts(env):
    until = 4_000_000_000_000
    clients, saved, result = _run(env, _state({"autoBlockedWallets": {POOL: until}}), RESTRICTED)
    assert clients["k-pool"].place_market_order.call_count == 0
    assert clients["k-user"].place_market_order.call_count >= 1          # other wallets carry on


def test_rate_limit_stops_the_cycle_but_does_not_pause_the_wallet(env):
    clients, saved, result = _run(env, _state(), RATE)
    assert clients["k-pool"].place_market_order.call_count == 1
    assert "autoBlockedWallets" not in saved or POOL not in saved["autoBlockedWallets"]
