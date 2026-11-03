# ==========================================
# Failure alerts (pure — no database / network)
# ==========================================
# The trading cron writes plain-English lines to its log. This turns the
# worrying ones into at most one Telegram message per problem every few hours,
# so a broken key or a failing order can never go unnoticed again.

import re
from typing import Dict, List, Tuple

WINDOW_MS = 6 * 3_600_000

_PATTERNS = [
    (re.compile(r"^(?P<w>\S+): auth failed — (?P<d>.*)$"), "key", "🔑 {w}: Swyftx rejected this wallet's API key — {d}"),
    (re.compile(r"^(?P<w>\S+): holdings fetch failed — (?P<d>.*)$"), "balance", "⚠️ {w}: couldn't read the balance — {d}"),
    (re.compile(r"^(?P<w>\S+): unexpected error — (?P<d>.*)$"), "crash", "⛔ {w}: unexpected error — {d}"),
    (re.compile(r"^(?P<c>[A-Z0-9]+): paused for (?P<h>\S+)h — Swyftx says it is not tradable right now$"), "paused",
     "⏸ {c} is switched off on Swyftx right now (\"not presently tradable\"). The bot has paused it for {h} hours and will try again automatically — nothing to do."),
    (re.compile(r"^(?P<w>\S+): (?P<s>BUY|SELL) (?P<c>[A-Z0-9]+) failed — .*(?:not presently tradable|AssetError).*$"), "untradable", None),
    (re.compile(r"^(?P<w>\S+): (?P<s>BUY|SELL) (?P<c>[A-Z0-9]+) failed — (?P<d>.*)$"), "order", "⛔ {w}: {s} {c} failed — {d}"),
    (re.compile(r"^(?P<w>\S+): asset ID map failed — (?P<d>.*)$"), "assets", "⚠️ {w}: Swyftx asset list failed — {d}"),
]


def find_problems(log_lines: List[str]) -> List[Tuple[str, str]]:
    """-> [(dedupe_key, human text)] for the log lines that need attention."""
    out, seen = [], set()
    for line in log_lines or []:
        line = str(line)
        for rx, kind, tmpl in _PATTERNS:
            m = rx.match(line)
            if not m:
                continue
            if tmpl is None:
                break                       # covered by the friendlier "paused" message
            g = m.groupdict()
            key = f"{g.get('w', '-')}:{kind}:{g.get('c', '')}"
            if key not in seen:
                seen.add(key)
                out.append((key, tmpl.format(**{k: (v or "") for k, v in g.items()})[:300]))
            break
    return out


def select_new(problems: List[Tuple[str, str]], sent: Dict[str, int], now_ms: int,
               window_ms: int = WINDOW_MS) -> Tuple[List[str], Dict[str, int]]:
    """Only problems not already reported within the window. -> (texts, updated sent map)."""
    fresh_sent = {k: v for k, v in (sent or {}).items() if now_ms - v < window_ms * 4}
    texts = []
    for key, text in problems:
        last = fresh_sent.get(key)
        if last is None or now_ms - last >= window_ms:
            texts.append(text)
            fresh_sent[key] = now_ms
    return texts, fresh_sent


def format_alert(texts: List[str]) -> str:
    return "🚨 <b>BUDJU bot needs attention</b>\n" + "\n".join(texts[:12])


def stale_heartbeat(status: Dict, now_ms: int, max_age_ms: int = 25 * 60_000) -> str:
    """A sentence if the trading cron has gone quiet or last errored, else ''."""
    if not status or not status.get("ranAt"):
        return "The trading cron has never reported in."
    age = now_ms - int(status["ranAt"])
    if age > max_age_ms:
        return f"The trading cron hasn't run for {age // 60000} minutes."
    if status.get("outcome") == "error":
        return f"The trading cron's last run failed: {str(status.get('reason', ''))[:120]}"
    return ""
