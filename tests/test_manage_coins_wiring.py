import os

ROOT = os.path.join(os.path.dirname(__file__), "..")


def _read(*p):
    return open(os.path.join(ROOT, *p)).read()


def test_coin_routes_wired():
    idx = _read("api", "index.py")
    for needle in ("path == '/api/coins'", "path == '/api/admin/coins-search'", "path == '/api/admin/coins'"):
        assert needle in idx
    assert '"/api/coins"' in _read("vercel.json")
    db = _read("api", "database.py")
    assert "def manage_coin" in db and "def get_coin_config" in db
