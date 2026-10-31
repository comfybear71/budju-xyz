import os, sys
from datetime import datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from activity_rows import pool_trade_activity  # noqa: E402


def test_sells_included_and_deduped():
    docs = [
        {"coin": "HYPE", "type": "sell", "amount": 2, "price": 40, "timestamp": datetime(2026, 10, 31), "swyftxId": "a"},
        {"coin": "BTC", "type": "buy", "amount": 0.1, "price": 7, "timestamp": datetime(2026, 10, 1), "swyftxId": "b"},
        {"coin": "X", "type": "deposit", "amount": 5, "price": 1, "timestamp": datetime(2026, 10, 1)},
    ]
    rows = pool_trade_activity(docs, "ADM", "ADM", {"b"})
    assert [r["type"] for r in rows] == ["sell"]
    assert rows[0]["isAdmin"] and rows[0]["timestamp"].startswith("2026-10-31")
