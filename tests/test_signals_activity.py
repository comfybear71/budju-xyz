import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))


def test_webhook_and_api_wired():
    web = open(os.path.join(os.path.dirname(__file__), "..", "api", "copytrade-webhook.py")).read()
    idx = open(os.path.join(os.path.dirname(__file__), "..", "api", "index.py")).read()
    assert web.count("set_copytrade_event_outcome(") >= 4
    assert "/api/copytrade/activity" in idx and "get_copytrade_activity" in idx
