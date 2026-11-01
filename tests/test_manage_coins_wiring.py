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


def test_offload_planning_has_no_order_code_and_run_needs_confirmation():
    idx = _read("api", "index.py")
    assert "path == '/api/admin/offload-preview'" in idx
    off = _read("api", "offload.py")
    assert "place_market_order" not in off and "record_trade" not in off      # planning only
    db = _read("api", "database.py")
    seg = db[db.index("def get_offload_preview"):]
    assert "place_market_order" not in seg

    run_route = idx[idx.index("path == '/api/admin/offload-run'"):][:2500]
    assert 'f"OFFLOAD {pct}"' in run_route            # a typed confirmation is required to start


def test_api_typescript_relative_imports_have_js_extension():
    """package.json is "type": "module": a relative import without .js crashes the whole function at load (plain HTTP 500)."""
    import glob, re
    pkg = _read("package.json")
    assert '"type": "module"' in pkg
    for f in glob.glob(os.path.join(ROOT, "api", "*.ts")):
        for m in re.finditer(r'from "(\.[^"]+)"', open(f).read()):
            assert m.group(1).endswith(".js"), f"{os.path.basename(f)} imports {m.group(1)} without .js"


def test_coingecko_probe_is_admin_only_and_read_only():
    idx = _read("api", "index.py")
    seg = idx[idx.index("path == '/api/admin/coingecko-probe'"):][:500]
    assert "is_admin(wallet)" in seg
    db = _read("api", "database.py")
    probe = db[db.index("def _cg_probe"):db.index("def get_coingecko_probe")]
    assert "method=" not in probe          # GET only


def test_hyperliquid_probe_only_reads():
    db = _read("api", "database.py")
    seg = db[db.index("_HL_LEADERBOARD ="):]
    assert "/exchange" not in seg and "api.hyperliquid.xyz/info" in seg      # public read API only, never the trading endpoint
    idx = _read("api", "index.py")
    assert "is_admin(wallet)" in idx[idx.index("path == '/api/admin/hyperliquid-probe'"):][:400]


def test_scorecard_is_admin_only():
    idx = _read("api", "index.py")
    assert "is_admin(wallet)" in idx[idx.index("path == '/api/admin/scorecard'"):][:400]


def test_strategy_lab_is_admin_only_and_read_only():
    idx = _read("api", "index.py")
    assert "is_admin(wallet)" in idx[idx.index("path == '/api/admin/strategy-lab'"):][:400]
    lab = _read("api", "strategy_lab.py")
    assert "place_market_order" not in lab and "import database" not in lab and "from database" not in lab
