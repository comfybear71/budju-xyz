# ==========================================
# Coin report cron — runs every 30 min.
#  * refreshes the few stalest coin price histories (gentle on CoinGecko)
#  * once a day (23:00 UTC = 10am Sydney summer time) posts the daily report
# ==========================================
import json
import os
import sys
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(__file__))

REFRESH_PER_RUN = 4
REPORT_UTC_HOUR = 23


def run() -> dict:
    from database import (ASSET_CG_IDS, coin_config_collection, dip_report_cache_collection,
                          fetch_dip_series, get_dip_report, get_scout)
    from scout import daily_report_text
    import tg_notify

    # Every run: keep the leaderboard snapshot fresh so the app reads it instantly.
    leaderboard_ok = False
    try:
        from database import refresh_leaderboard_cache
        refresh_leaderboard_cache()
        leaderboard_ok = True
    except Exception as e:
        print(f"[coin-report-cron] leaderboard snapshot error: {e}")

    # The CoinGecko-heavy jobs below run about twice an hour, not every 10 minutes.
    if (datetime.utcnow().minute % 30) >= 10:
        return {"leaderboardSnapshot": leaderboard_ok, "heavyJobs": "skipped this run"}

    codes = set(ASSET_CG_IDS.keys()) | {d["code"] for d in coin_config_collection.find({"status": "custom"})}
    ages = {}
    for code in codes:
        d = dip_report_cache_collection.find_one({"_id": f"series:{code}"}, {"at": 1})
        ages[code] = d["at"] if d else datetime(2000, 1, 1)
    stale = sorted(codes, key=lambda c: ages[c])
    cutoff = datetime.utcnow() - timedelta(hours=20)
    refreshed = []
    for code in [c for c in stale if ages[c] < cutoff][:REFRESH_PER_RUN]:
        if fetch_dip_series(code, force=True).get("ok"):
            refreshed.append(code)

    # Refresh coin classes (market cap / volume) at most once a day.
    try:
        from database import refresh_coin_classes
        refresh_coin_classes()
    except Exception as e:
        print(f"[coin-report-cron] classes error: {e}")

    # Warm a couple of Scout candidates per run, so by tomorrow the whole wide list is tested.
    warmed = []
    try:
        from database import fetch_scout_series
        doc = dip_report_cache_collection.find_one({"_id": "scout:candidates"}) or {}
        have = {d["_id"] for d in dip_report_cache_collection.find(
            {"_id": {"$regex": "^series:cg:"}, "at": {"$gte": datetime.utcnow() - timedelta(hours=20)}}, {"_id": 1})}
        todo = [c["id"] for c in doc.get("cands", []) if f"series:cg:{c['id']}" not in have][:2]
        for cid in todo:
            if fetch_scout_series(cid).get("ok"):
                warmed.append(cid)
    except Exception as e:
        print(f"[coin-report-cron] scout warm error: {e}")

    now = datetime.utcnow()
    sent = False
    if now.hour == REPORT_UTC_HOUR and now.minute < 30:
        today = now.strftime("%Y-%m-%d")
        state = dip_report_cache_collection.find_one({"_id": "daily-report-state"}) or {}
        if state.get("lastSent") != today:
            report = get_dip_report()
            if len(report["coins"]) >= 10:
                try:
                    scout = get_scout()
                except Exception:
                    scout = {"review": {}, "results": []}
                text = daily_report_text(report["coins"], scout.get("review", {}), scout.get("results", []))
                sent = tg_notify.send(text)
                if sent:
                    dip_report_cache_collection.replace_one(
                        {"_id": "daily-report-state"}, {"_id": "daily-report-state", "lastSent": today}, upsert=True)
    return {"leaderboardSnapshot": leaderboard_ok, "refreshed": refreshed, "warmed": warmed, "reportSent": sent}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        secret = os.getenv("CRON_SECRET")
        if secret and self.headers.get("Authorization", "") != f"Bearer {secret}":
            self.send_response(401)
            self.end_headers()
            return
        try:
            result = run()
            code = 200
        except Exception as e:
            result, code = {"error": str(e)}, 500
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())
