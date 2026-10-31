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


def test_health_route_and_coins_not_rate_counted():
    idx = _read("api", "index.py")
    assert "path == '/api/admin/health'" in idx
    assert "!= '/api/coins' and not _check_rate_limit" in idx


def test_leaderboard_served_from_snapshot_and_warmed_by_cron():
    assert "get_live_leaderboard_cached(params.get('fresh') == '1')" in _read("api", "index.py")
    cron = _read("api", "coin-report-cron.py")
    assert "refresh_leaderboard_cache" in cron
    vj = _read("vercel.json")
    assert '"path": "/api/coin-report-cron",\n      "schedule": "*/10 * * * *"' in vj
