import os, sys, importlib.util
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
import repair_unsaved_buys as rep  # noqa: E402

NOW = 1_800_000_000_000
SETTINGS = {1: {"deviation": 5, "sellDeviation": 12.5, "cooldownHours": 12},
            2: {"deviation": 8.5, "sellDeviation": 30, "cooldownHours": 12},
            3: {"deviation": 15, "sellDeviation": 75, "cooldownHours": 24}}


def test_marks_only_the_bought_tier_with_pause_and_lower_buy_level():
    targets = {"BTC:1": {"buy": 61106, "sell": 90000, "setAt": 1}, "BTC:2": {"buy": 58855, "sell": 200000, "setAt": 1}}
    t, cd, applied, skipped = rep.apply_repair([("BTC", 1, 56807.52)], targets, {}, lambda n: SETTINGS[n], NOW)
    assert applied == ["BTC:1"] and skipped == []
    assert t["BTC:1"]["buy"] == 56807.52 * 0.95
    assert t["BTC:1"]["sell"] == max(90000, 56807.52 * 1.125)
    assert cd["BTC:1"] == NOW + 12 * 3_600_000
    assert t["BTC:2"] == targets["BTC:2"] and "BTC:2" not in cd          # the other tiers still wait for their own turn
    assert targets["BTC:1"]["buy"] == 61106                                 # inputs untouched


def test_leaves_alone_signals_already_paused_or_not_set_up():
    targets = {"NEAR:1": {"buy": 2.7, "sell": 3.5, "setAt": 1}}
    t, cd, applied, skipped = rep.apply_repair([("NEAR", 1, 2.68), ("XYZ", 1, 1.0)], targets, {"NEAR:1": NOW + 5000}, lambda n: SETTINGS[n], NOW)
    assert applied == [] and {c for c, _ in skipped} == {"NEAR:1", "XYZ:1"}
    assert t == targets and cd == {"NEAR:1": NOW + 5000}


def test_the_list_matches_the_swyftx_history():
    assert len(rep.UNSAVED_BUYS) == 22
    assert sum(1 for _, tier, _ in rep.UNSAVED_BUYS if tier == 1) == 15
    assert sorted(c for c, tier, _ in rep.UNSAVED_BUYS if tier == 3) == ["ONDO", "SYRUP", "XRD"]
    assert sorted(c for c, tier, _ in rep.UNSAVED_BUYS if tier == 2) == ["CRV", "LDO", "PYTH", "ZRO"]
