# ==========================================
# Signals — plain-English health verdict
# ==========================================
# The Signals page showed a leaderboard that stayed empty with no clue why
# (132 wallets tracked, 0 events, for days). This turns the raw pipeline
# counters into one honest sentence ("Helius has never contacted BUDJU") that
# every user can read. Pure function — facts in, verdict out — so it is
# testable; database.get_copytrade_status_facts() gathers the facts.
#
# Pipeline: Dune wallet list -> Helius webhook -> BUDJU receives swaps ->
# safety checks -> paper trade opened -> wallet graduates after 10 closed trades.

from datetime import datetime, timedelta

QUIET_AFTER = timedelta(hours=6)       # no deliveries for this long = something is wrong
REFRESH_STALE = timedelta(hours=3)     # the hourly wallet refresh has not run


def _ago(now, then):
    if not then:
        return "never"
    mins = int((now - then).total_seconds() // 60)
    if mins < 1:
        return "just now"
    if mins < 60:
        return f"{mins} min ago"
    hours = mins // 60
    return f"{hours} h ago" if hours < 48 else f"{hours // 24} days ago"


def compute_verdict(f: dict, now: datetime = None) -> dict:
    """f: facts (see database.get_copytrade_status_facts). ->
    {"level": "ok"|"warn"|"error", "headline": str, "detail": str}"""
    now = now or datetime.utcnow()
    pings_ok = f.get("pingsOk", 0)
    pings_fail = f.get("pingsAuthFail", 0)
    tracked = f.get("trackedWallets", 0)

    if tracked == 0:
        return {"level": "error", "headline": "No wallets are being followed yet",
                "detail": "The list of wallets to copy has not been loaded. It is refreshed hourly from Dune, "
                          "so this means the Dune connection (DUNE_API_KEY / query) isn't working."}

    if not f.get("webhookId"):
        return {"level": "error", "headline": "Not connected to Helius yet",
                "detail": f"{tracked} wallets are listed, but the Helius webhook that reports their swaps "
                          f"hasn't been created. It is set up within an hour of the keys being added "
                          f"(HELIUS_API_KEY, COPYTRADE_WEBHOOK_SECRET)."}

    if pings_ok == 0 and pings_fail == 0:
        return {"level": "error", "headline": "Helius has never contacted BUDJU",
                "detail": f"{tracked} wallets are registered with Helius, but not one delivery has ever arrived. "
                          f"That usually means Helius is posting to a web address that redirects or is wrong "
                          f"(registered: {f.get('webhookUrl') or 'unknown'}). The address is corrected "
                          f"and re-registered automatically within the hour."}

    if pings_ok == 0 and pings_fail > 0:
        return {"level": "error", "headline": "Helius is calling but being turned away",
                "detail": f"{pings_fail} deliveries arrived and were rejected: the shared secret "
                          f"(COPYTRADE_WEBHOOK_SECRET) doesn't match what Helius sends. Set the same value in "
                          f"Vercel and in the Helius webhook."}

    last_ping = f.get("lastPingAt")
    if last_ping and now - last_ping > QUIET_AFTER:
        return {"level": "warn", "headline": f"Quiet — last message from Helius {_ago(now, last_ping)}",
                "detail": "Deliveries worked before but have stopped. Could just be a slow market for these "
                          "wallets, or the webhook was paused on the Helius side."}

    if f.get("events24h", 0) == 0:
        return {"level": "warn", "headline": "Connected, but no swaps by tracked wallets in the last 24h",
                "detail": f"Helius is reaching BUDJU (last message {_ago(now, last_ping)}), but none of the "
                          f"{tracked} wallets made a buy or sell we could read yet."}

    if f.get("opened24h", 0) == 0 and f.get("openPositions", 0) == 0:
        return {"level": "warn", "headline": f"{f['events24h']} swaps seen, but no paper trade opened",
                "detail": "Every buy was skipped by the safety checks (rug-check, liquidity under the minimum, "
                          "or no price route). That is the filter doing its job."}

    return {"level": "ok", "headline": f"Working — {f['events24h']} swaps seen in the last 24h",
            "detail": f"{f.get('opened24h', 0)} paper trades opened and {f.get('closed24h', 0)} closed in the "
                      f"last 24h. A wallet joins the leaderboard after 10 closed paper trades."}
