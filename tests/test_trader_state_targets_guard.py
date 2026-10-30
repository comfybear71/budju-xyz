"""Regression test for the "browser wipes cron targets" bug found 2026-10-30.

api/auto-trade-cron.py stamps every real buy/sell target with a "setAt"
timestamp and treats anything missing/older than TARGET_STALE_MS as stale
(see tests/test_stale_target_refresh.py). That fix alone wasn't enough:
the browser's AutoTrader class (src/features/trade/services/autoTrader.ts)
only ever keeps an optimistic, setAt-less *display* copy of targets, but
still persisted it to the server via save_trader_state({"autoActive": {...,
"targets": ...}}) on every tab close (beforeunload -> flushPendingSave) and
every Start/Stop-tier / Override-Cooldowns click. Since save_trader_state()
used a flat Mongo $set, that setAt-less copy wholesale-replaced the cron's
real targets — stripping "setAt" from every coin at once. The very next
cron cycle then saw every target as stale, regenerated all of them anchored
to the live price, and could never actually cross a freshly-regenerated
target — so the bot stopped trading even though the UI showed targets as
hit ("BUY IMMINENT" / "0.0% to buy").

Fix: save_trader_state() now merges autoActive.targets instead of
overwriting it — an incoming entry only replaces an existing one when it
carries its own valid "setAt" (i.e. it actually came from the cron).
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

_mock_pymongo = MagicMock()


@pytest.fixture
def db_module():
    with patch.dict("sys.modules", {
        "pymongo": _mock_pymongo,
        "pymongo.errors": MagicMock(),
        "base58": MagicMock(),
        "nacl": MagicMock(),
        "nacl.signing": MagicMock(),
        "nacl.exceptions": MagicMock(),
    }):
        if "database" in sys.modules:
            del sys.modules["database"]
        import database

        database.trader_state_collection = MagicMock()
        yield database


def _stub_existing(db_module, existing_doc):
    db_module.trader_state_collection.find_one.return_value = existing_doc
    captured = {}

    def record_update_one(_filter, update, **kwargs):
        captured["set"] = update["$set"]
        return MagicMock()

    db_module.trader_state_collection.update_one.side_effect = record_update_one
    return captured


class TestAutoActiveTargetsGuard:
    def test_setat_less_write_does_not_clobber_cron_targets(self, db_module):
        """The exact bug: browser saves {isActive, tierActive, targets}
        where targets has no 'setAt' at all — the cron's real, setAt'd
        targets for every coin must survive untouched."""
        existing_doc = {
            "_id": "admin_state",
            "autoActive": {
                "isActive": True,
                "tierActive": {"1": True},
                "targets": {
                    "ETH:1": {"buy": 2900.0, "sell": 3200.0, "setAt": 1000},
                    "SOL:1": {"buy": 140.0, "sell": 165.0, "setAt": 1000},
                },
            },
        }
        captured = _stub_existing(db_module, existing_doc)

        browser_payload = {
            "autoActive": {
                "isActive": False,  # legitimately toggled by the admin
                "tierActive": {"1": False},
                "targets": {
                    # Optimistic display copy — never carries setAt.
                    "ETH:1": {"buy": 2850.0, "sell": 3100.0},
                    "SOL:1": {"buy": 138.0, "sell": 160.0},
                },
            }
        }

        result = db_module.save_trader_state(browser_payload)

        assert result == {"success": True}
        saved_targets = captured["set"]["autoActive"]["targets"]
        # The cron's real, setAt-stamped targets must be preserved exactly —
        # not replaced by the browser's setAt-less optimistic copy.
        assert saved_targets["ETH:1"] == {"buy": 2900.0, "sell": 3200.0, "setAt": 1000}
        assert saved_targets["SOL:1"] == {"buy": 140.0, "sell": 165.0, "setAt": 1000}
        # Legitimate browser-owned fields (isActive/tierActive) still save.
        assert captured["set"]["autoActive"]["isActive"] is False
        assert captured["set"]["autoActive"]["tierActive"] == {"1": False}

    def test_cron_write_with_setat_does_replace(self, db_module):
        """The cron's own writes always include setAt and must still take
        effect normally (this is how real buys/sells/ratchets persist)."""
        existing_doc = {
            "_id": "admin_state",
            "autoActive": {
                "targets": {"ETH:1": {"buy": 2900.0, "sell": 3200.0, "setAt": 1000}},
            },
        }
        captured = _stub_existing(db_module, existing_doc)

        cron_payload = {
            "autoActive": {
                "isActive": True,
                "targets": {"ETH:1": {"buy": 2950.0, "sell": 3250.0, "setAt": 2000}},
            }
        }

        db_module.save_trader_state(cron_payload)

        saved_targets = captured["set"]["autoActive"]["targets"]
        assert saved_targets["ETH:1"] == {"buy": 2950.0, "sell": 3250.0, "setAt": 2000}

    def test_omitting_targets_entirely_still_preserves_existing(self, db_module):
        """A caller that sends autoActive without a 'targets' key at all
        (e.g. a hypothetical future write) must not silently erase targets
        via Mongo's flat $set replacing the whole autoActive sub-document."""
        existing_doc = {
            "_id": "admin_state",
            "autoActive": {
                "targets": {"ETH:1": {"buy": 2900.0, "sell": 3200.0, "setAt": 1000}},
            },
        }
        captured = _stub_existing(db_module, existing_doc)

        db_module.save_trader_state({"autoActive": {"isActive": True}})

        saved_targets = captured["set"]["autoActive"]["targets"]
        assert saved_targets == {"ETH:1": {"buy": 2900.0, "sell": 3200.0, "setAt": 1000}}

    def test_new_coin_with_no_existing_entry_is_accepted(self, db_module):
        """A brand-new coin with no prior cron-computed entry should still
        get an initial (setAt-less) value stored — same as pre-fix
        behavior for coins the cron has never touched yet."""
        existing_doc = {"_id": "admin_state", "autoActive": {"targets": {}}}
        captured = _stub_existing(db_module, existing_doc)

        db_module.save_trader_state({
            "autoActive": {"targets": {"NEWCOIN:1": {"buy": 1.0, "sell": 1.2}}}
        })

        saved_targets = captured["set"]["autoActive"]["targets"]
        assert saved_targets["NEWCOIN:1"] == {"buy": 1.0, "sell": 1.2}

    def test_no_existing_document_upserts_cleanly(self, db_module):
        """First-ever save (no prior admin_state doc) must not crash."""
        captured = _stub_existing(db_module, None)

        db_module.save_trader_state({
            "autoActive": {"isActive": True, "targets": {"BTC:1": {"buy": 1.0, "sell": 1.2}}}
        })

        saved_targets = captured["set"]["autoActive"]["targets"]
        assert saved_targets["BTC:1"] == {"buy": 1.0, "sell": 1.2}
