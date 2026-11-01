# ==========================================
# Signals / Copy Trading — Helius webhook receiver
# ==========================================
# Delivery target for the Enhanced webhook api/copytrade_helius.py keeps in
# sync with the active tracked-wallet list (see api/copytrade-cron.py).
# Standalone handler, same shape as api/desk-brief-cron.py — not routed
# through api/index.py's CORS/rate-limit machinery since this is
# server-to-server (Helius -> BUDJU), not browser traffic.
#
# Fail-closed auth (see CLAUDE.md lesson 21): if COPYTRADE_WEBHOOK_SECRET
# isn't configured, EVERY delivery is rejected rather than accepted —
# accepting unauthenticated POSTs here would let anyone forge "this wallet
# made a winning trade" events straight onto the public leaderboard.
# ==========================================

import json
import os
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.dirname(__file__))

from copytrade_helius import COPYTRADE_WEBHOOK_SECRET

from copytrade_process import handle_delivery, send_telegram  # noqa: E402,F401  (shared with the backup puller)
from database import record_copytrade_webhook_ping  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        auth = self.headers.get("Authorization", "")
        if not COPYTRADE_WEBHOOK_SECRET or auth != COPYTRADE_WEBHOOK_SECRET:
            # Record even a rejected delivery -- this is the only way to
            # tell "Helius never called us" apart from "Helius called us
            # with a secret that doesn't match COPYTRADE_WEBHOOK_SECRET"
            # from the database side (see get_copytrade_debug()).
            try:
                record_copytrade_webhook_ping(False)
            except Exception as e:
                print(f"[copytrade-webhook] ping-record error: {e}")
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "unauthorized"}).encode())
            return

        if self.headers.get("X-Budju-Selftest") == "1":
            # Admin "test our address" check: proves this URL is reachable and
            # the secret matches, without counting as a Helius delivery.
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "selftest": True}).encode())
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            payload = json.loads(raw.decode() or "{}")
            item_count = len(payload) if isinstance(payload, list) else 1
            try:
                record_copytrade_webhook_ping(True, item_count)
            except Exception as e:
                print(f"[copytrade-webhook] ping-record error: {e}")
            result = handle_delivery(payload)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        except Exception as e:
            print(f"[copytrade-webhook] error: {e}")
            try:
                record_copytrade_webhook_ping(True, 0, error=str(e))
            except Exception:
                pass
            self.send_response(200)  # ack anyway — don't make Helius retry on our own bug
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode())

    def do_GET(self):
        # Liveness probe only — no data.
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok", "ts": datetime.utcnow().isoformat()}).encode())
