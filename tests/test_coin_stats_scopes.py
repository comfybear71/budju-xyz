"""Coin stats for 'mine' (one wallet) and 'everyone' (api/coin_stats.py)."""

import os
import sys
from datetime import datetime

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from coin_stats import coin_stats_from_rows, ledger_rows  # noqa: E402

ADMIN = "ADMINWALLET"
ALICE = "ALICEWALLET"
BOB = "BOBWALLET"
FUNDING = {"USDC", "USD", "AUD", "AUDT", "USDT", "USDC.E"}

POOL = [  # admin account ledger: type / amount
    {"coin": "BTC", "type": "buy", "amount": 0.01, "price": 70000.0, "timestamp": datetime(2026, 10, 1)},
    {"coin": "BTC", "type": "sell", "amount": 0.005, "price": 80000.0, "timestamp": datetime(2026, 10, 10)},
]
USERS = [  # per-wallet ledger: side / quantity
    {"walletAddress": ALICE, "coin": "BTC", "side": "buy", "quantity": 0.001, "price": 76000.0, "timestamp": datetime(2026, 10, 31)},
    {"walletAddress": ALICE, "coin": "ETH", "side": "buy", "quantity": 0.5, "price": 2200.0, "timestamp": datetime(2026, 10, 31)},
    {"walletAddress": BOB, "coin": "BTC", "side": "buy", "quantity": 0.002, "price": 77000.0, "timestamp": datetime(2026, 10, 31)},
]


def find_pool():
    return POOL


def find_users(wallet):
    return [d for d in USERS if wallet is None or d["walletAddress"] == wallet]


def rows(scope, wallet=None):
    return ledger_rows(scope, wallet, [ADMIN], find_pool, find_users)


def stats(scope, wallet=None):
    return coin_stats_from_rows(rows(scope, wallet), FUNDING)


def coin(result, code):
    return next(c for c in result["coins"] if c["coin"] == code)


class TestWhichLedger:
    def test_admin_mine_is_the_pool_ledger(self):
        assert {r["coin"] for r in rows("mine", ADMIN)} == {"BTC"} and len(rows("mine", ADMIN)) == 2

    def test_a_user_sees_only_their_own_trades(self):
        r = rows("mine", ALICE)
        assert {x["coin"] for x in r} == {"BTC", "ETH"} and len(r) == 2

    def test_users_never_see_each_others_trades_in_mine(self):
        assert all(x["price"] != 77000.0 for x in rows("mine", ALICE))
        assert [x["price"] for x in rows("mine", BOB)] == [77000.0]

    def test_mine_without_a_wallet_is_empty(self):
        assert rows("mine", None) == []

    def test_everyone_is_both_ledgers(self):
        assert len(rows("everyone")) == len(POOL) + len(USERS)


class TestNumbers:
    def test_average_cost_realised_pnl_and_held(self):
        c = coin(stats("mine", ADMIN), "BTC")
        assert c["buys"] == 1 and c["sells"] == 1
        assert c["avgCost"] == pytest.approx(70000.0)
        assert c["realizedPnL"] == pytest.approx(0.005 * (80000 - 70000))   # 50
        assert c["qtyHeld"] == pytest.approx(0.005)

    def test_everyone_combines_the_cost_basis(self):
        c = coin(stats("everyone"), "BTC")
        spent = 0.01 * 70000 + 0.001 * 76000 + 0.002 * 77000
        qty = 0.01 + 0.001 + 0.002
        assert c["buys"] == 3 and c["sells"] == 1
        assert c["avgCost"] == pytest.approx(spent / qty)

    def test_funding_assets_are_split_out(self):
        extra = rows("mine", ALICE) + [{"coin": "USDC", "side": "buy", "qty": 100.0, "price": 1.0, "ts": datetime(2026, 10, 31)}]
        out = coin_stats_from_rows(extra, FUNDING)
        assert [f["coin"] for f in out["funding"]] == ["USDC"] and all(c["coin"] != "USDC" for c in out["coins"])

    def test_response_shape_matches_the_original_endpoint(self):
        out = stats("mine", ALICE)
        assert set(out) >= {"generatedAt", "totalTrades", "coinCount", "coins", "funding"}
        assert out["totalTrades"] == 2 and out["coinCount"] == 2
        assert {"coin", "buys", "sells", "qtyBought", "qtySold", "qtyHeld", "spent", "received", "avgCost",
                "realizedPnL", "tradesPerWeek", "costBasisPartial"} <= set(coin(out, "BTC"))

    def test_empty_ledger_is_fine(self):
        assert stats("mine", "NOBODY")["coins"] == []
