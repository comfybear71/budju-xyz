"""Telegram digest: per-wallet breakdown + pool total (api/trade_digest.py)."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from trade_digest import format_digest, split_message  # noqa: E402

ADMIN = "AEWvE2xXaHSGdGCaCArb2PWdKS7K9RwoCRV7CT2CJTWq"
USER = "6qtFybGqanZzNMt6oDNYyzeNrwhVmj826Twkv7X5PQEv"


def t(wallet, coin, side, qty, price, amount, tier=1, pool=False):
    return {"wallet": wallet, "isPool": pool, "coin": coin, "side": side, "tier": tier,
            "qty": qty, "price": price, "amount": amount}


TRADES = [
    t(ADMIN, "BTC", "BUY", 0.000417, 76443.0, 31.92, 1, True),
    t(ADMIN, "ETH", "BUY", 0.0136, 2231.52, 30.32, 1, True),
    t(ADMIN, "ETH", "BUY", 0.0258, 2231.52, 57.61, 2, True),
    t(ADMIN, "HYPE", "SELL", 0.3323, 90.27, 30.0, 1, True),
    t(USER, "SUI", "BUY", 10.5, 0.882843, 9.27, 1),
]


def test_header_counts_trades_and_wallets():
    assert "5 trade(s) across 2 wallet(s)" in format_digest(TRADES).split("\n")[0]


def test_admin_block_comes_first_and_is_named_admin():
    text = format_digest(TRADES)
    assert text.index("<b>Admin</b>") < text.index("<b>Wallet</b>")
    assert "AEWv…JTWq" in text and "6qtF…PQEv" in text


def test_lines_show_tier_and_sub_dollar_price_precision():
    text = format_digest(TRADES)
    assert "🛒 T2 ETH 0.025800 @ $2,231.52 ($57.61)" in text
    assert "💸 T1 HYPE" in text
    assert "SUI 10.5000 @ $0.8828" in text


def test_per_wallet_totals():
    text = format_digest(TRADES)
    assert "Bought $119.85 · Sold $30.00" in text   # admin: 31.92+30.32+57.61, sold 30
    assert "Bought $9.27" in text                   # other wallet


def test_pool_total_adds_all_wallets_by_coin():
    text = format_digest(TRADES)
    assert "🏦 <b>Pool total</b> (all wallets) — Bought $129.12 · Sold $30.00" in text
    assert "ETH 0.039400 ($87.93)" in text           # both ETH buys combined
    assert "🔴 Sold: HYPE 0.332300 ($30.00)" in text


def test_split_keeps_short_message_whole():
    assert split_message("a\nb", 100) == ["a\nb"]


def test_split_breaks_only_at_line_boundaries_and_respects_limit():
    text = "\n".join(f"line {i:03d} " + "x" * 40 for i in range(200))
    chunks = split_message(text, 500)
    assert len(chunks) > 1
    assert all(len(c) <= 500 for c in chunks)
    assert "\n".join(chunks) == text
