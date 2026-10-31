import os

ROOT = os.path.join(os.path.dirname(__file__), "..")


def _read(*p):
    return open(os.path.join(ROOT, *p)).read()


def test_selftest_wired():
    assert "/api/admin/copytrade-selftest" in _read("api", "index.py")
    web = _read("api", "copytrade-webhook.py")
    assert "X-Budju-Selftest" in web
    # the self-test shortcut must come AFTER the secret check
    assert web.index("X-Budju-Selftest") > web.index("COPYTRADE_WEBHOOK_SECRET or auth")
