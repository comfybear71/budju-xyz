import ast
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from profit_plan import sane_sell  # noqa: E402


def test_normal_and_legitimately_anchored_levels_are_left_alone():
    # T3: dip 15%, arm +75%. Open price = 57,098 / 0.85 = 67,174, so the plan's level is about 117,554.
    assert sane_sell(117_554, 58_000, 57_098, 15, 75) is None
    # anchored high after a later, lower buy (bought near 90K once, price fell): still plausible, kept
    assert sane_sell(157_000, 58_000, 55_000, 5, 75) is None
    # no price and no buy level known: cannot judge, leave it
    assert sane_sell(1e9, 0, 0, 15, 75) is None


def test_runaway_levels_are_corrected_to_the_plan_level():
    fixed = sane_sell(123_592_620, 58_193, 57_098, 15, 75)
    assert fixed is not None and abs(fixed - (57_098 / 0.85) * 1.75) < 1          # open price x (1 + arm)
    assert sane_sell(29_280, 1_654, 1_499, 8.5, 30) is not None                    # ETH T2 from the screenshot
    assert sane_sell("junk", 1, 1, 1, 1) is None and sane_sell(0, 1, 1, 1, 1) is None


def test_save_trader_state_keeps_the_plan_markers_when_a_browser_save_omits_them():
    """database.py cannot be imported in tests (it connects to Mongo), so the function is lifted out of the source."""
    src = open(os.path.join(os.path.dirname(__file__), "..", "api", "database.py")).read()
    fn = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "save_trader_state")

    class Coll:
        def __init__(self):
            self.doc = {"_id": "admin_state", "autoActive": {"isActive": True, "tierActive": {"1": True}, "planVersion": 1,
                                                              "planArms": {"1": 12.5, "2": 30.0, "3": 75.0},
                                                              "targets": {"BTC:3": {"buy": 1, "sell": 2, "setAt": 5}}}}
            self.set = None

        def find_one(self, q):
            return self.doc

        def update_one(self, q, update, upsert=False):
            self.set = update["$set"]

    coll = Coll()
    from typing import Dict
    ns = {"trader_state_collection": coll, "Dict": Dict}
    exec(ast.get_source_segment(src, fn), ns)
    # exactly what the browser sends when you close the tab or start/stop a tier
    ns["save_trader_state"]({"autoActive": {"isActive": True, "tierActive": {"1": True, "2": False}}})
    saved = coll.set["autoActive"]
    assert saved["planVersion"] == 1 and saved["planArms"]["3"] == 75.0              # markers survive
    assert saved["tierActive"] == {"1": True, "2": False}                            # what the browser changed does change
    assert saved["targets"]["BTC:3"]["sell"] == 2                                    # targets carried forward, as before
    # and when the caller does send them (the cron), they win
    ns["save_trader_state"]({"autoActive": {"isActive": True, "tierActive": {}, "planVersion": 2, "planArms": {"1": 1}}})
    assert coll.set["autoActive"]["planVersion"] == 2
