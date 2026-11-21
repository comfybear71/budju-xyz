"""`_hist_series` (api/database.py) caches daily rate/price series. database.py cannot be imported in tests (it connects to
Mongo at import), so the function is lifted out of the source and run against a fake collection."""
import ast
import os
from datetime import datetime, timedelta
from typing import Dict


def _load():
    path = os.path.join(os.path.dirname(__file__), "..", "api", "database.py")
    src = open(path).read()
    fn = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "_hist_series")

    class Coll:
        def __init__(self):
            self.d = {}

        def find_one(self, q):
            return self.d.get(q["_id"])

        def replace_one(self, q, doc, upsert=False):
            self.d[q["_id"]] = doc

    coll = Coll()
    ns = {"datetime": datetime, "timedelta": timedelta, "Dict": Dict, "price_history_cache_collection": coll, "_HIST_CACHE_TTL_H": 24}
    exec(ast.get_source_segment(src, fn), ns)
    return ns["_hist_series"], coll


def test_fetches_once_then_serves_from_cache_and_refetches_when_it_must_reach_further_back():
    h, _ = _load()
    calls = []

    def fetch():
        calls.append(1)
        return {"2026-03-02": 0.64}

    assert h("k", "2026-03-01", fetch) == {"2026-03-02": 0.64} and len(calls) == 1
    assert h("k", "2026-03-01", fetch) == {"2026-03-02": 0.64} and len(calls) == 1      # cached
    h("k", "2026-01-01", fetch)
    assert len(calls) == 2                                                               # needed an earlier start


def test_a_failing_source_never_raises_and_falls_back_to_the_last_series_or_nothing():
    h, coll = _load()

    def boom():
        raise RuntimeError("down")

    h("k", "2026-03-01", lambda: {"2026-03-02": 0.64})
    coll.d["k"]["at"] = datetime.utcnow() - timedelta(hours=30)                          # stale
    assert h("k", "2026-03-01", boom) == {"2026-03-02": 0.64}
    assert h("never-seen", "2026-03-01", boom) == {}
