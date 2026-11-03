import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from alerts import find_problems, select_new, stale_heartbeat, WINDOW_MS  # noqa: E402

LOG = [
    "AEWv...JTWq: BUY SUI failed — HTTP 400: nope",
    "2AnQ...wqAj: auth failed — 401 invalid key",
    "AEWv...JTWq: BUY SUI failed — HTTP 400: nope",          # duplicate within the run
    "AEWv...JTWq: BUY BTC $50.00 @ $70000",                  # fine, ignored
    "Done: 1 trade(s) across 2 wallet(s)",
]


def test_finds_and_dedupes_within_run():
    p = find_problems(LOG)
    assert len(p) == 2
    assert any("SUI failed" in t for _, t in p) and any("API key" in t for _, t in p)


def test_only_new_problems_within_window():
    p = find_problems(LOG)
    t1, sent = select_new(p, {}, 1_000)
    assert len(t1) == 2
    t2, sent = select_new(p, sent, 1_000 + 60_000)            # a minute later: nothing new
    assert t2 == []
    t3, _ = select_new(p, sent, 1_000 + WINDOW_MS + 1)        # after the window: again
    assert len(t3) == 2


def test_heartbeat():
    assert stale_heartbeat({}, 10) != ""
    assert stale_heartbeat({"ranAt": 1_000_000, "outcome": "ok"}, 1_000_000 + 60_000) == ""
    assert "hasn't run" in stale_heartbeat({"ranAt": 1_000_000, "outcome": "ok"}, 1_000_000 + 3_600_000)
    assert "failed" in stale_heartbeat({"ranAt": 1_000_000, "outcome": "error", "reason": "x"}, 1_000_000 + 1000)


def test_untradable_coin_gives_one_friendly_pause_message_not_a_scary_failure():
    log = [
        'pool: BUY DASH failed — HTTP 400: {"error":{"error":"AssetError","message":"Asset not presently tradable. Please try again later."}}',
        "DASH: paused for 6h — Swyftx says it is not tradable right now",
    ]
    p = find_problems(log)
    assert len(p) == 1 and "switched off on Swyftx" in p[0][1] and "DASH" in p[0][1] and "nothing to do" in p[0][1]
