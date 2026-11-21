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
