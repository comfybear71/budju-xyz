import os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from wallet_finder import find_active_wallets  # noqa: E402

NOW = time.time()


def tr(addr, usd=150.0, age_h=1, anomalous=False):
    return {"tx_from_address": addr, "from_token_amount": "1", "price_from_in_usd": str(usd),
            "block_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(NOW - age_h * 3600)), "is_anomalous": anomalous}


def test_picks_wallets_active_in_several_pools_and_skips_the_rest():
    data = {
        "POOL1": [tr("GOOD"), tr("GOOD"), tr("ONEPOOL"), tr("ONEPOOL"), tr("OLD", age_h=50), tr("OLD", age_h=60)],
        "POOL2": [tr("GOOD"), tr("OLD", age_h=50), tr("TINY", usd=5), tr("ANOM", anomalous=True)],
        "POOL3": [tr("TINY", usd=5), tr("TINY", usd=5)] + [tr("BOT") for _ in range(45)],
    }
    data["POOL2"] += [tr("ANOM", anomalous=True), tr("ANOM", anomalous=True)]
    data["POOL1"] += [tr("BOT") for _ in range(5)]
    out = find_active_wallets(data, now_ts=NOW)
    assert [w["address"] for w in out] == ["GOOD"]          # not: one pool, old, tiny, anomalous, or a 50-trade bot
    assert out[0]["pools"] == 2 and out[0]["trades"] == 3 and out[0]["usd"] == 450.0


def test_known_wallets_and_pool_addresses_are_excluded():
    data = {"P1": [tr("KNOWN"), tr("KNOWN"), tr("P2"), tr("P2")], "P2": [tr("KNOWN"), tr("P2")]}
    assert find_active_wallets(data, exclude={"KNOWN"}, now_ts=NOW) == []
