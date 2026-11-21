import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from daily_limit import clean_limit, effective_limit, CEILING, MINIMUM  # noqa: E402


def test_clean_limit_clamps_and_rejects_junk():
    assert clean_limit(5000) == 5000
    assert clean_limit("2500.5") == 2500.5
    assert clean_limit(10**9) == CEILING
    assert clean_limit(1) == MINIMUM
    for bad in (None, "", "abc", float("nan"), float("inf")):
        assert clean_limit(bad) is None


def test_effective_limit_falls_back_to_default():
    assert effective_limit(None) == 3000
    assert effective_limit("junk") == 3000
    assert effective_limit(4200) == 4200


def test_bot_rules_use_defaults_and_the_saved_tier_settings():
    from daily_limit import bot_rules
    r = bot_rules({})
    assert r["maxSingleBuy"] == 250 and r["minBuy"] == 8 and r["keepSpare"] == 30
    assert r["tiers"]["1"] == {"dip": 5.0, "spend": 5.0, "pauseHours": 12.0}
    r2 = bot_rules({"tier2": {"deviation": 9, "allocation": 12, "cooldownHours": 6}, "tier3": {"allocation": "junk"}})
    assert r2["tiers"]["2"] == {"dip": 9.0, "spend": 12.0, "pauseHours": 6.0}
    assert r2["tiers"]["3"] == {"dip": 15.0, "spend": 15.0, "pauseHours": 24.0}       # bad value falls back to the default
