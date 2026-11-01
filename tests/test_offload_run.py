"""The offload runner against a fake database and fake Swyftx: no real orders."""
import copy
import importlib.util
import os
import sys
import time
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

ADMIN, USER = "ADMINW111", "USERW2222"


class FakeColl:
    def __init__(self):
        self.docs = {}

    def insert_one(self, d):
        self.docs[d["_id"]] = copy.deepcopy(d)

    def find_one(self, q):
        for d in self.docs.values():
            if all(d.get(k) == v for k, v in q.items()):
                return copy.deepcopy(d)
        return None

    def update_one(self, q, upd):
        d = self.docs[q["_id"]]
        for path, val in upd["$set"].items():
            cur = d
            parts = path.split(".")
            for p in parts[:-1]:
                cur = cur[int(p)] if isinstance(cur, list) else cur[p]
            last = parts[-1]
            if isinstance(cur, list):
                cur[int(last)] = val
            else:
                cur[last] = val


def make_client(holdings):
    c = MagicMock()
    c.get_holdings.return_value = dict(holdings)
    c.get_code_to_id_map.return_value = {"USDC": "1"}
    c.place_market_order.return_value = (True, "oid", None)
    c.last_fill = None
    return c


@pytest.fixture
def env():
    coll = FakeColl()
    db = MagicMock()
    db.ADMIN_WALLETS = [ADMIN]
    db.db = {"offload_jobs": coll}
    db.get_prices_for_coins = lambda codes: {c: {"ADA": 0.5, "DOT": 2.0, "GRASS": 1.0, "ZEC": 100.0}.get(c, 1.0) for c in codes}
    db.get_offload_preview.return_value = {
        "bad": ["ADA", "DOT"], "targets": ["GRASS", "ZEC"], "capUsd": 0.0,
        "wallets": [
            {"wallet": ADMIN, "short": "ADMI", "isAdmin": True, "scenarios": {"50": {"sells": [{"coin": "ADA", "sellUsd": 500.0}, {"coin": "DOT", "sellUsd": 200.0}]}, "75": {"sells": []}}},
            {"wallet": USER, "short": "USER", "isAdmin": False, "scenarios": {"50": {"sells": [{"coin": "ADA", "sellUsd": 100.0}]}, "75": {"sells": []}}},
        ],
    }
    clients = {ADMIN: make_client({"USDC": 100.0}), USER: make_client({"USDC": 50.0})}
    db._get_user_swyftx_client = lambda w: clients[w]
    with patch.dict("sys.modules", {"database": db}):
        spec = importlib.util.spec_from_file_location("offload_run_under_test", os.path.join(os.path.dirname(__file__), "..", "api", "offload_run.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        yield mod, db, clients, coll


def test_kill_switch_blocks(env, monkeypatch):
    mod, *_ = env
    monkeypatch.setenv("TRADING_ENABLED", "false")
    assert mod.start_job(50, None, None)["ok"] is False


def test_full_flow_and_no_double_orders(env):
    mod, db, clients, coll = env
    started = mod.start_job(50, None, None)
    assert started["ok"]
    jid = started["jobId"]

    mod.run_sells(jid)
    assert clients[ADMIN].place_market_order.call_count == 2          # ADA + DOT
    assert clients[USER].place_market_order.call_count == 1
    mod.run_sells(jid)                                                # a retry must not re-place anything
    assert clients[ADMIN].place_market_order.call_count == 2
    assert clients[USER].place_market_order.call_count == 1

    job = coll.docs[jid]
    assert job["wallets"][ADMIN]["status"] == "sold"
    assert job["wallets"][ADMIN]["proceeds"] == pytest.approx(700 * 0.99)
    assert len(job["wallets"][ADMIN]["buys"]) == 2                    # split evenly over GRASS and ZEC
    assert job["wallets"][USER]["buys"][0]["usd"] == pytest.approx(99.0 / 2, abs=0.01)

    # buys are held back until the settle wait is over
    mod.run_buys(jid)
    assert clients[ADMIN].place_market_order.call_count == 2
    for w in coll.docs[jid]["wallets"].values():
        w["buysReadyAt"] = time.time() - 1
    clients[ADMIN].get_holdings.return_value = {"USDC": 900.0}
    clients[USER].get_holdings.return_value = {"USDC": 200.0}
    mod.run_buys(jid)
    assert clients[ADMIN].place_market_order.call_count == 2 + 2
    mod.run_buys(jid)                                                 # again: nothing new
    assert clients[ADMIN].place_market_order.call_count == 2 + 2
    assert coll.docs[jid]["status"] == "finished"
    # every sell/buy was recorded in the right ledger
    assert db.record_trade.call_count >= 2 and db.record_user_trade.call_count >= 1


def test_big_sell_is_split_into_chunks(env):
    mod, db, clients, coll = env
    db.get_offload_preview.return_value["wallets"] = [
        {"wallet": USER, "short": "USER", "isAdmin": False, "scenarios": {"50": {"sells": [{"coin": "ADA", "sellUsd": 2500.0}]}, "75": {"sells": []}}}]
    jid = mod.start_job(50, None, None)["jobId"]
    mod.run_sells(jid)
    sizes = [c.args[2] for c in clients[USER].place_market_order.call_args_list]
    assert sizes == [1000.0, 1000.0, 500.0]
