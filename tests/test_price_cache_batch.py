"""Saving fresh prices is ONE database call, not one per coin (that was ~13s for 60 coins)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))


def test_store_fresh_prices_is_a_single_bulk_write():
    src = open(os.path.join(os.path.dirname(__file__), "..", "api", "database.py")).read()
    a = src.index("def _store_fresh_prices")
    b = src.index("def _coingecko_get")
    seg = src[a:b]
    assert "bulk_write(" in seg and "update_one(" not in seg
