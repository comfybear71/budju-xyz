import os, sys
from datetime import datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from trade_export import rows_to_csv, normalise  # noqa: E402


def test_csv_for_user_and_admin_ledgers():
    user = [{"coin": "BTC", "side": "buy", "quantity": 0.001, "price": 70000.0, "orderId": "o1", "timestamp": datetime(2026, 10, 2, 3, 4, 5)},
            {"coin": "BTC", "side": "deposit", "quantity": 1, "price": 1, "timestamp": datetime(2026, 10, 1)}]
    csv_text = rows_to_csv(normalise(user))
    lines = csv_text.strip().splitlines()
    assert lines[0].startswith("date_utc,coin,side") and len(lines) == 2
    assert "2026-10-02 03:04:05,BTC,buy,0.001,70000,70.00,o1" in lines[1]
    admin = [{"coin": "ETH", "type": "sell", "amount": 2, "price": 2000.0, "swyftxId": "x", "timestamp": datetime(2026, 10, 3)}]
    assert "ETH,sell,2,2000,4000.00,x" in rows_to_csv(normalise(admin, admin_ledger=True))
