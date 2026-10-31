# Tiny Telegram sender shared by the coin announcements and the daily report.
import json
import os
from urllib.request import Request, urlopen

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "-1002398835975")


def send(text: str) -> bool:
    if not TELEGRAM_BOT_TOKEN:
        return False
    try:
        body = json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "HTML",
                           "disable_web_page_preview": True}).encode()
        req = Request(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                      data=body, headers={"Content-Type": "application/json"}, method="POST")
        urlopen(req, timeout=10)
        return True
    except Exception as e:
        print(f"[tg_notify] error: {e}")
        return False
