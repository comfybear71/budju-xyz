"""Regression test for the stale per-coin $ target bug found 2026-10-27.

A wallet's buy/sell $ price targets are only refreshed when a trade
executes (ratchet) or when a coin-tier pair is evaluated for the very
first time. Before this fix, a target that was generated once — at
whatever price happened to be live back then — stayed frozen forever if
that coin never crossed it again. Confirmed live: a non-custodial wallet
with only one lifetime trade had buy-target distances scattered across
3.4%-15% for coins that all share the SAME admin-configured tier
deviation, proving those targets were set at different historical prices
rather than computed fresh off the current price. A frequently-trading
wallet's targets stay pinned near the live price because every trade
resets them — so the same shared rules produced wildly different
behavior per wallet, purely based on trade frequency.

That fix (a 48h "stale" reset) was REMOVED 2026-10-30: after a multi-day
outage it erased targets that had already been crossed, so the due buys
never fired. Targets now change only after a trade or when missing/invalid.

Since the 2026-10-29 bot consolidation, api/auto-trade-cron.py is the one
engine trading every wallet (admin's pool account included) — this test
exercises the admin/pool path through the unified cron, since that's the
one wallet whose targets/cooldowns/trade log are still persisted into the
shared trader_state document this test can inspect directly via
save_trader_state(). api/user_trade_debug.py carries the identical fix
for every other (per-user) wallet.
"""

import importlib
import os
import sys
import time
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

ADMIN_WALLET = "ADMIN_WALLET_FAKE"


@pytest.fixture
def mock_database():
    mock_db = MagicMock()
    mock_db.save_trader_state = MagicMock(return_value={"success": True})
    mock_db.record_trade = MagicMock()
    mock_db.record_user_trade = MagicMock()
    mock_db.calculate_pool_allocations = MagicMock(return_value={})
    mock_db.get_coin_stats = MagicMock(return_value={"coins": []})
    mock_db.get_user_bot_position = MagicMock(return_value=0)
    mock_db.get_user_avg_cost = MagicMock(return_value=0)
    mock_db.get_prices_for_coins = MagicMock(return_value={"BTC": 60000})
    mock_db.decrypt_secret = MagicMock(return_value="fake-api-key")
    mock_db.ADMIN_WALLETS = [ADMIN_WALLET]
    mock_db.user_exchange_keys_collection = MagicMock()
    mock_db.user_exchange_keys_collection.find.return_value = [
        {"walletAddress": ADMIN_WALLET, "status": "active", "autoTradeEnabled": True, "encryptedApiKey": "x"}
    ]
    with patch.dict("sys.modules", {"database": mock_db}):
        yield mock_db


@pytest.fixture
def cron_module(mock_database):
    mod_name = "auto_trade_cron_stale_target_test"
    spec = importlib.util.spec_from_file_location(
        mod_name,
        os.path.join(os.path.dirname(__file__), "..", "api", "auto-trade-cron.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _run_with_targets(cron_module, mock_database, targets):
    """Run one cron cycle with BTC priced so it neither buys nor sells
    (holds), and return the targets dict the cron would have saved for
    the admin/pool wallet."""
    mock_database.get_trader_state.return_value = {
        "autoActive": {
            "isActive": True,
            "tierActive": {"1": True},
            "targets": targets,
        },
        "autoTierAssignments": {"BTC": [1]},
        "autoTiers": {"tier1": {"deviation": 1, "sellDeviation": 2, "allocation": 5}},
        "autoCooldowns": {},
        "autoTradeLog": [],
    }

    fake_client = MagicMock()
    fake_client.get_holdings.return_value = {"USDC": 1000.0}
    cron_module.SwyftxClient = MagicMock(return_value=fake_client)

    saved = {}

    def record_save(state):
        saved.update(state)
        return {"success": True}

    mock_database.save_trader_state.side_effect = record_save

    cron_module.run_auto_trade_check()

    return saved["autoActive"]["targets"]["BTC:1"]


class TestTargetsNeverExpireByAge:
    """Targets change only after a trade, or when missing/invalid. Age and a
    missing "setAt" never cause a reset (a bot outage must not erase targets
    that were already crossed)."""

    def test_old_target_without_setat_is_kept(self, cron_module, mock_database):
        old_targets = {"BTC:1": {"buy": 50000, "sell": 200000}}  # no setAt

        new_tgt = _run_with_targets(cron_module, mock_database, old_targets)

        assert new_tgt["buy"] == 50000
        assert new_tgt["sell"] == 200000

    def test_target_older_than_48h_is_kept(self, cron_module, mock_database):
        now_ms = int(time.time() * 1000)
        old_set_at = now_ms - 10 * 24 * 3_600_000  # 10 days old
        old_targets = {"BTC:1": {"buy": 50000, "sell": 200000, "setAt": old_set_at}}

        new_tgt = _run_with_targets(cron_module, mock_database, old_targets)

        assert new_tgt["buy"] == 50000
        assert new_tgt["sell"] == 200000
        assert new_tgt["setAt"] == old_set_at

    def test_old_crossed_buy_target_still_fires(self, cron_module, mock_database):
        """The incident: price already below an old buy target after an
        outage. The buy must fire, not be reset away."""
        old_targets = {"BTC:1": {"buy": 65000, "sell": 90000}}  # price is 60000 < 65000
        mock_database.get_trader_state.return_value = {
            "autoActive": {"isActive": True, "tierActive": {"1": True}, "targets": old_targets},
            "autoTierAssignments": {"BTC": [1]},
            "autoTiers": {"tier1": {"deviation": 5, "sellDeviation": 12.5, "allocation": 5, "cooldownHours": 12}},
            "autoCooldowns": {},
            "autoTradeLog": [],
        }
        fake_client = MagicMock()
        fake_client.get_holdings.return_value = {"USDC": 1000.0}
        fake_client.get_code_to_id_map.return_value = {"USDC": "1", "BTC": "2"}
        fake_client.place_market_order.return_value = (True, "order-1", None)
        cron_module.SwyftxClient = MagicMock(return_value=fake_client)

        cron_module.run_auto_trade_check()

        fake_client.place_market_order.assert_called_once()
        assert fake_client.place_market_order.call_args[0][:2] == ("BTC", "buy")

    def test_missing_or_invalid_target_is_created_from_current_price(self, cron_module, mock_database):
        for bad in ({}, {"BTC:1": {"buy": 0, "sell": 0}}, {"BTC:1": "garbage"}):
            new_tgt = _run_with_targets(cron_module, mock_database, bad)
            assert new_tgt["buy"] == pytest.approx(60000 * 0.99, rel=1e-6)
            assert new_tgt["sell"] == pytest.approx(60000 * 1.02, rel=1e-6)
            assert isinstance(new_tgt.get("setAt"), (int, float))

    def test_one_coins_order_crash_does_not_skip_save_or_other_coins_setat(
        self, cron_module, mock_database
    ):
        """Regression test for the 2026-10-30 bug: BTC's buy target had not
        moved in 2+ days — even though its live price had already crossed
        the trigger — while this exact cron kept running successfully
        (200 OK) every 5 minutes the whole time.

        Root cause: place_market_order() only caught HTTPError. Any OTHER
        exception while actually placing an order (timeout, connection
        reset, malformed reply) propagated all the way out of the
        per-wallet loop in _run_one_wallet() and skipped
        save_trader_state() entirely for that cycle — discarding every
        OTHER coin's freshly regenerated "setAt" stamp too, not just the
        failing coin's. Next cycle, every target (including the one that
        already crossed) looked "stale" all over again, got silently
        re-anchored to whatever price was live AT THAT MOMENT, and the
        crash recurred — so no buy ever actually executed.

        This test forces BTC's order placement to raise, and asserts ETH
        (a second, unrelated coin processed in the same cycle) still gets
        its fresh "setAt" saved, and that save_trader_state() for
        autoActive is still called at all.
        """
        now_ms = int(time.time() * 1000)
        mock_database.get_trader_state.return_value = {
            "autoActive": {
                "isActive": True,
                "tierActive": {"1": True},
                "targets": {
                    # BTC: fresh target already crossed -> cron will try to BUY
                    "BTC:1": {"buy": 70000, "sell": 90000, "setAt": now_ms - 60_000},
                    # ETH: no target at all -> must be created this cycle
                },
            },
            "autoTierAssignments": {"BTC": [1], "ETH": [1]},
            "autoTiers": {
                "tier1": {"deviation": 1, "sellDeviation": 2, "allocation": 5, "cooldownHours": 24}
            },
            "autoCooldowns": {},
            "autoTradeLog": [],
        }
        mock_database.get_prices_for_coins.return_value = {"BTC": 60000, "ETH": 2000}

        fake_client = MagicMock()
        fake_client.get_holdings.return_value = {"USDC": 1000.0}
        fake_client.get_code_to_id_map.return_value = {"USDC": "1", "BTC": "2", "ETH": "3"}
        fake_client.place_market_order.side_effect = RuntimeError("Swyftx timed out")
        cron_module.SwyftxClient = MagicMock(return_value=fake_client)

        saved = {}

        def record_save(state):
            saved.update(state)
            return {"success": True}

        mock_database.save_trader_state.side_effect = record_save

        cron_module.run_auto_trade_check()

        assert "autoActive" in saved, (
            "save_trader_state() must still be called with autoActive this "
            "cycle even though BTC's order attempt raised an exception"
        )
        targets = saved["autoActive"]["targets"]
        assert isinstance(targets["ETH:1"].get("setAt"), (int, float)), (
            "ETH's freshly regenerated setAt must survive BTC's crash, not "
            "be discarded along with it"
        )
