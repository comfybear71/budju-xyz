import worth_rebuild as wr

AM = {"1": "AUD", "2": "BTC", "3": "USDC"}
D = 86_400_000
T0 = wr.day_start_ms("2026-06-10")


def row(day_off, order_type, coin_qty, total, aud, sec="2", pri="1", status=4):
    return {"created": T0 + day_off * D + 3_600_000, "status": status, "order_type": order_type, "secondary_asset": sec,
            "primary_asset": pri, "amount": str(coin_qty), "total": str(total), "audValue": str(aud)}


def orders(rows):
    return wr.parse_orders(rows, AM, lambda r: r["created"])


def test_parse_keeps_only_filled_known_orders():
    o = orders([row(0, 1, 1, 100, 100), row(1, 1, 1, 100, 100, status=1), row(2, 3, 1, 100, 100), row(3, 1, 1, 100, 100, sec="99")])
    assert len(o) == 1 and o[0]["coin"] == "BTC" and o[0]["quote"] == "AUD" and o[0]["buy"]


def test_balances_are_unwound_from_today():
    # day0: bought 1 BTC for 100 AUD; day4: sold 0.5 BTC for 80 AUD; now holds 0.5 BTC and 130 AUD (50 + 80)
    o = orders([row(0, 1, 1, 100, 100), row(4, 2, 0.5, 80, 80)])
    b = wr.balances_by_day({"BTC": 0.5, "AUD": 130}, o, [], "2026-06-09", "2026-06-15")
    assert b["2026-06-15"]["BTC"] == 0.5 and b["2026-06-15"]["AUD"] == 130
    assert b["2026-06-12"]["BTC"] == 1 and round(b["2026-06-12"]["AUD"]) == 50       # before the sale
    assert b["2026-06-09"]["BTC"] == 0 and round(b["2026-06-09"]["AUD"]) == 150      # before the buy


def test_a_deposit_after_the_day_is_taken_back_out():
    t = [{"ts": T0 + 2 * D + 1000, "code": "AUD", "qty": 500.0}]
    b = wr.balances_by_day({"AUD": 700}, [], t, "2026-06-10", "2026-06-14")
    assert b["2026-06-14"]["AUD"] == 700 and b["2026-06-10"]["AUD"] == 200


def test_rebuild_prices_with_charts_then_falls_back_to_order_rates():
    o = orders([row(0, 1, 1, 100, 100)])
    fx = {"2026-06-10": 0.5}
    prices = {"BTC": {"2026-06-10": 120.0, "2026-06-11": 130.0}}
    r = wr.rebuild({"BTC": 1.0}, o, [], prices, fx, "2026-06-12")
    assert r["series"]["2026-06-11"] == 65.0                               # 1 BTC x 130 AUD x 0.5
    assert r["check"]["day"] == "2026-06-12"
    r2 = wr.rebuild({"BTC": 1.0}, o, [], {}, fx, "2026-06-12")             # no chart: the order's own price (100 AUD) is used
    assert r2["series"]["2026-06-11"] == 50.0 and r2["unpriced"] == []


def test_close_enough():
    assert wr.close_enough(95, 100) and not wr.close_enough(60, 100) and not wr.close_enough(None, 100)
