import time
import worth_rebuild as wr
import worth_rebuild_run as run


class FakeClient:
    def __init__(self):
        self.calls = []

    def _headers(self):
        return {}

    def _http_json(self, url, headers=None, timeout=10):
        self.calls.append(url)
        if "NOCHART" in url:
            raise RuntimeError("404")
        return [{"time": wr.day_start_ms("2026-06-10"), "close": 12.5}, {"time": wr.day_start_ms("2026-06-11"), "close": 0}]


class FakeCache:
    def __init__(self):
        self.docs = {}

    def find_one(self, q):
        return self.docs.get(q["_id"])

    def replace_one(self, q, doc, upsert=False):
        self.docs[q["_id"]] = doc


def test_chart_series_reads_daily_closes_and_skips_zero():
    out = run.chart_series(FakeClient(), "INJ", wr.day_start_ms("2026-06-01"), wr.day_start_ms("2026-06-20"))
    assert out == {"2026-06-10": 12.5}


def test_collect_prices_caches_and_stops_at_the_deadline():
    cache, c = FakeCache(), FakeClient()
    a, b = wr.day_start_ms("2026-06-01"), wr.day_start_ms("2026-06-20")
    assert run.collect_prices(c, ["INJ", "NOCHART"], a, b, cache, time.time() + 60) is True
    assert cache.docs["INJ"]["days"] and cache.docs["NOCHART"]["days"] == {}      # a coin with no chart is remembered as empty
    n = len(c.calls)
    assert run.collect_prices(c, ["INJ", "NOCHART"], a, b, cache, time.time() + 60) is True and len(c.calls) == n   # cached: no new calls
    assert run.collect_prices(FakeClient(), ["AAA"], a, b, FakeCache(), time.time() - 1) is False                     # out of time: try next run
