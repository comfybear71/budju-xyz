import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from profit_plan import DEFAULT_PLAN, plan_for, size_sell  # noqa: E402


def test_default_plan_is_staggered():
    assert [plan_for(t)["arm"] for t in (1, 2, 3)] == [12.5, 30.0, 75.0]
    assert [plan_for(t)["trail"] for t in (1, 2, 3)] == [5.0, 8.0, 12.0]
    assert [plan_for(t)["slice"] for t in (1, 2, 3)] == [5.0, 7.5, 10.0]


def test_overrides_are_applied_and_clamped():
    p = plan_for(2, {"2": {"arm": 40, "trail": 999, "slice": -5}})
    assert p == {"arm": 40.0, "trail": 30.0, "slice": 1.0}
    assert plan_for(1, {"1": "garbage"}) == DEFAULT_PLAN[1]


def test_slice_above_the_minimum_is_used_as_is():
    qty, note = size_sell(5.0, 100_000, 0.01, 30)          # slice 5,000 coins = $50 >= $30
    assert qty == 5_000 and note == ""


def test_small_slice_is_raised_to_the_minimum_only_if_that_is_a_small_share():
    qty, note = size_sell(5.0, 20_000, 0.01, 30)           # slice $10; position $200; min = 3,000 coins = 15% <= 25%
    assert qty == 3_000 and "minimum" in note


def test_xrd_case_raising_would_sell_too_much_so_it_is_skipped():
    qty, note = size_sell(5.0, 156_000, 0.0011, 30)        # position ~$172; $30 = 27,272.7 coins = 17.5% of it: within the 25% limit
    assert qty == 27_272.72727273 and "minimum" in note
    qty, note = size_sell(5.0, 100_000, 0.0011, 30)        # position $110; $30 is 27% of it -> skip
    assert qty is None and "25%" in note


def test_position_below_the_minimum_is_skipped():
    qty, note = size_sell(10.0, 1_000, 0.01, 30)           # whole position is $10
    assert qty is None and "below" in note
