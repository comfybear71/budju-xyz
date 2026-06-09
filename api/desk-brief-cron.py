# ==========================================
# BUDJU Desk — daily AI briefing cron
# ==========================================
# Runs once a day (06:00 AEST = 20:00 UTC). Gathers market data (CoinGecko),
# crypto news (free RSS), the admin's holdings (coin-stats) and recently
# captured notes, asks Claude to synthesise a structured brief, stores it, and
# posts a summary to Telegram. Read-only re: trading — produces ideas, never
# executes. Auth: CRON_SECRET (same as the other crons).
# ==========================================
import os
import sys
import json
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.parse import urlparse, parse_qs
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(__file__))

from database import (
    get_coin_stats,
    get_recent_desk_notes,
    save_desk_brief,
    is_admin,
)

CRON_SECRET = os.getenv("CRON_SECRET", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = int(os.getenv("TELEGRAM_CHAT_ID", "-1002398835975"))

# Coins we cover: perp markets + common spot holdings → CoinGecko ids
CG_IDS = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "DOGE": "dogecoin",
    "AVAX": "avalanche-2", "LINK": "chainlink", "SUI": "sui", "RENDER": "render-token",
    "JUP": "jupiter-exchange-solana", "WIF": "dogwifcoin", "ENA": "ethena",
    "LUNA": "terra-luna-2", "BCH": "bitcoin-cash", "HYPE": "hyperliquid", "PEPE": "pepe",
    "UNI": "uniswap", "NEAR": "near", "ADA": "cardano", "XRP": "ripple", "DOT": "polkadot",
    "POL": "polygon-ecosystem-token", "NEO": "neo", "HBAR": "hedera-hashgraph",
    "LUNC": "terra-luna", "BNB": "binancecoin", "NEXO": "nexo", "XAUT": "tether-gold",
}

RSS_FEEDS = [
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://cointelegraph.com/rss",
    "https://decrypt.co/feed",
]


def _http_get(url, headers=None, timeout=20):
    req = Request(url, headers=headers or {"User-Agent": "BudjuDesk/1.0"})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read()


def fetch_market(symbols):
    """CoinGecko markets for the given symbols → {SYM: {price, ch24, ch7d, mcap}}."""
    ids = ",".join(sorted({CG_IDS[s] for s in symbols if s in CG_IDS}))
    if not ids:
        return {}
    id_to_sym = {v: k for k, v in CG_IDS.items()}
    try:
        url = (
            "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd"
            f"&ids={ids}&price_change_percentage=24h,7d&per_page=250"
        )
        data = json.loads(_http_get(url))
        out = {}
        for c in data:
            sym = id_to_sym.get(c.get("id"))
            if not sym:
                continue
            out[sym] = {
                "price": c.get("current_price"),
                "ch24": c.get("price_change_percentage_24h"),
                "ch7d": c.get("price_change_percentage_7d_in_currency"),
                "mcap": c.get("market_cap"),
            }
        return out
    except Exception as e:
        print("market fetch error:", e)
        return {}


def fetch_news(limit=40):
    """Pull recent headlines from free crypto RSS feeds."""
    headlines = []
    for feed in RSS_FEEDS:
        try:
            xml = _http_get(feed)
            root = ET.fromstring(xml)
            for item in root.iter("item"):
                title = item.findtext("title") or ""
                pub = item.findtext("pubDate") or ""
                if title:
                    headlines.append({"title": title.strip(), "pub": pub.strip()})
                if len(headlines) >= limit:
                    break
        except Exception as e:
            print("rss error", feed, e)
    return headlines[:limit]


def call_claude(payload):
    """Ask Claude for a structured brief. Returns parsed dict or None."""
    if not ANTHROPIC_API_KEY:
        return None
    system = (
        "You are BUDJU Desk, a sober crypto research analyst for a solo trader. "
        "You produce a concise daily brief to GUIDE manual decisions — you never "
        "claim certainty and you always give an invalidation level. Be honest: if "
        "signals are weak or mixed, say so and lower confidence. News is largely "
        "priced in; do not overstate edge.\n\n"
        "Return ONLY valid minified JSON (no markdown, no prose) with this shape:\n"
        '{"marketContext":{"regime":"trending|ranging|volatile|mixed","riskTone":'
        '"risk-on|risk-off|neutral","summary":"2-3 sentences"},'
        '"ideas":[{"coin":"BTC","direction":"long|short|wait","entryZone":"text",'
        '"invalidation":"text","target":"text","leverage":"e.g. 2-3x","confidence":'
        '0-100,"rationale":"1-2 sentences"}],'
        '"contradictions":[{"coin":"X","alert":"why a held position may be at risk",'
        '"severity":"low|medium|high"}],'
        '"thesisOfWeek":"1-2 sentences"}\n'
        "Give 2-3 ideas max, only where there is a real setup (else direction "
        "'wait'). Contradictions only for coins the user actually holds."
    )
    try:
        body = json.dumps({
            "model": "claude-sonnet-4-6",
            "max_tokens": 1600,
            "system": system,
            "messages": [{"role": "user", "content": json.dumps(payload)}],
        }).encode()
        req = Request(
            "https://api.anthropic.com/v1/messages",
            data=body,
            headers={
                "Content-Type": "application/json",
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
            method="POST",
        )
        with urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
        text = (data.get("content") or [{}])[0].get("text", "")
        # Strip code fences if present
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
    except Exception as e:
        print("claude error:", e)
    return None


def send_telegram(text):
    if not TELEGRAM_BOT_TOKEN:
        return
    try:
        body = json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "HTML"}).encode()
        req = Request(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            data=body, headers={"Content-Type": "application/json"}, method="POST",
        )
        urlopen(req, timeout=20)
    except Exception as e:
        print("telegram error:", e)


def format_telegram(brief):
    mc = brief.get("marketContext", {})
    lines = ["☀️ <b>BUDJU Desk — Daily Brief</b>"]
    if mc:
        lines.append(f"\n🌐 <b>Market:</b> {mc.get('regime','?')} · {mc.get('riskTone','?')}")
        if mc.get("summary"):
            lines.append(mc["summary"])
    ideas = brief.get("ideas", [])
    if ideas:
        lines.append("\n💡 <b>Ideas</b>")
        for i in ideas:
            arrow = "🟢" if i.get("direction") == "long" else "🔴" if i.get("direction") == "short" else "⚪️"
            lines.append(
                f"{arrow} <b>{i.get('coin')}</b> {i.get('direction','').upper()} "
                f"({i.get('confidence','?')}%)\n"
                f"   Entry {i.get('entryZone','?')} · Inval {i.get('invalidation','?')} · "
                f"Tgt {i.get('target','?')}\n   <i>{i.get('rationale','')}</i>"
            )
    cons = brief.get("contradictions", [])
    if cons:
        lines.append("\n⚠️ <b>Position watch</b>")
        for c in cons[:5]:
            lines.append(f"• <b>{c.get('coin')}</b> ({c.get('severity','?')}): {c.get('alert','')}")
    if brief.get("thesisOfWeek"):
        lines.append(f"\n🧭 <b>Thesis:</b> {brief['thesisOfWeek']}")
    lines.append("\n<i>Guidance only — not financial advice. Every idea has an invalidation; size accordingly.</i>")
    return "\n".join(lines)


def run_brief():
    # 1. Holdings (which coins we own + value) from coin-stats
    try:
        stats = get_coin_stats()
        held = [
            {"coin": c["coin"], "spent": c.get("spent"), "avgCost": c.get("avgCost"), "realizedPnL": c.get("realizedPnL")}
            for c in stats.get("coins", [])
        ]
    except Exception as e:
        print("coin-stats error:", e)
        held = []

    held_syms = {h["coin"] for h in held}
    perp = {"SOL", "BTC", "ETH", "DOGE", "AVAX", "LINK", "SUI", "RENDER", "JUP", "WIF"}
    symbols = sorted(held_syms | perp)

    market = fetch_market(symbols)
    news = fetch_news()
    notes = get_recent_desk_notes(days=5)

    payload = {
        "date": datetime.utcnow().strftime("%Y-%m-%d"),
        "perpMarkets": sorted(perp),
        "holdings": held,
        "market": market,
        "news": [n["title"] for n in news],
        "myNotes": [
            (n.get("transcript") or n.get("raw") or n.get("url") or "")
            for n in notes
        ],
    }

    brief = call_claude(payload)
    if not brief:
        return {"ok": False, "error": "synthesis failed"}

    brief["date"] = payload["date"]
    brief["notesConsidered"] = len(notes)
    save_desk_brief(brief)
    send_telegram(format_telegram(brief))
    return {"ok": True, "ideas": len(brief.get("ideas", [])), "notes": len(notes)}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Auth: CRON_SECRET bearer (scheduler) OR ?admin_wallet=<admin> (manual run)
        qs = parse_qs(urlparse(self.path).query)
        admin_wallet = (qs.get("admin_wallet") or [""])[0]
        auth = self.headers.get("Authorization", "")
        authorized = (bool(CRON_SECRET) and auth == f"Bearer {CRON_SECRET}") or (admin_wallet and is_admin(admin_wallet))
        if not authorized:
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b'{"error":"unauthorized"}')
            return
        try:
            result = run_brief()
        except Exception as e:
            result = {"ok": False, "error": str(e)}
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())
