import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from withdraw_plan import plan_withdrawal, TRADE_FEE, FX_SPREAD  # noqa: E402

AUD = 0.65
PRICES = {"BTC": 50_000.0, "ETH": 2_000.0, "AAVE": 100.0, "RAY": 1.0, "BAD": 2.0, "TINY": 1.0, "ACC": 10.0, "GRN": 1.0}
RANKS = {"BTC": 1, "ETH": 2, "AAVE": 40, "RAY": 300, "BAD": 25, "TINY": 400, "ACC": 150, "GRN": 400}


def plan(amount, currency="USDC", holdings=None, **kw):
    h = {"BTC": 0.1, "ETH": 1.0, "AAVE": 10.0, "RAY": 1000.0, "BAD": 500.0, "TINY": 10.0, "ACC": 100.0}
    h.update(holdings or {})
    base = dict(avg_cost={}, ranks=RANKS, careful=[], focus=[], aud_to_usd=AUD)
    base.update(kw)
    return plan_withdrawal(amount, currency, h, PRICES, **base)


def coins(p):
    return [r["coin"] for r in p["rows"]]


def test_cash_is_used_first_and_nothing_is_sold_when_it_covers_the_amount():
    p = plan(300, "USDC", {"USDC": 500.0})
    assert p["rows"] == [] and p["cash"][0]["currency"] == "USDC" and p["cash"][0]["feeUsd"] == 0
    assert p["totals"]["netInCurrency"] == 300 and p["totals"]["feesUsd"] == 0 and p["totals"]["shortfallUsd"] == 0


def test_cash_in_the_wanted_currency_comes_before_cash_that_needs_converting():
    p = plan(1000, "AUD", {"AUD": 400.0, "USDC": 1000.0})           # A$400 of AUD, then USDC converted at a cost
    assert [c["currency"] for c in p["cash"]] == ["AUD", "USDC"]
    assert p["cash"][0]["feeUsd"] == 0 and p["cash"][1]["converted"] and p["cash"][1]["feeUsd"] > 0
    assert abs(p["totals"]["netInCurrency"] - 1000) < 0.05 and p["rows"] == []


def test_weakest_coins_go_first_and_btc_eth_are_kept_to_the_end():
    p = plan(1500, "USDC", careful=["BAD"], focus=["ACC"])
    # shit list first (BAD), then Smaller group (RAY 300), then Top 200 non-accumulate... never BTC/ETH while others suffice
    assert coins(p)[0] == "BAD" and "RAY" in coins(p) and "BTC" not in coins(p) and "ETH" not in coins(p)
    assert p["rows"][0]["tags"][0] == "Shit list (Careful)"


def test_only_as_much_as_needed_is_sold_and_the_last_coin_is_partial():
    p = plan(800, "USDC", careful=["BAD"])
    assert p["totals"]["shortfallUsd"] == 0
    assert abs(p["totals"]["netUsd"] - 800) < 0.5                    # reaches the target, no big overshoot
    assert p["rows"][-1]["partial"] is True
    assert sum(r["sellUsd"] for r in p["rows"]) < 1000 + 600         # not the whole book


def test_positions_under_the_minimum_are_never_selected_and_say_why():
    p = plan(500, "USDC", {"TINY": 10.0})                            # TINY is $10: below the $30 minimum
    assert "TINY" not in coins(p) and any(s["coin"] == "TINY" and "minimum" in s["why"] for s in p["skipped"])


def test_a_small_remainder_is_raised_to_the_minimum_sale():
    p = plan(10, "USDC", {"BAD": 500.0}, careful=["BAD"])
    assert p["rows"][0]["sellUsd"] == 30.0 and any("minimum" in t for t in p["rows"][0]["tags"])


def test_fees_for_a_usdc_withdrawal_are_one_trade_and_for_aud_a_second_conversion_trade():
    usdc = plan(1000, "USDC", careful=["BAD"], holdings={"BAD": 2000.0})          # BAD is a Top 50 coin here: 0.6% + 0.2% spread
    aud = plan(1000 * 1 / AUD, "AUD", careful=["BAD"], holdings={"BAD": 2000.0})   # the same money wanted as AUD
    f_usdc = usdc["totals"]["feesUsd"] / usdc["totals"]["coinsSoldUsd"]
    f_aud = aud["totals"]["feesUsd"] / aud["totals"]["coinsSoldUsd"]
    assert 0.007 < f_usdc < 0.010                                                  # about 0.8%
    assert abs(f_aud - (f_usdc + (1 - f_usdc) * (TRADE_FEE + FX_SPREAD))) < 0.0005  # plus the USDC -> AUD trade
    assert abs(usdc["totals"]["netUsd"] - 1000) < 0.5 and abs(aud["totals"]["netInCurrency"] - 1000 / AUD) < 1


def test_prefer_losses_puts_the_biggest_loser_first_inside_a_group_and_gains_and_losses_are_totalled():
    holdings = {"RAY": 1000.0, "GRN": 1000.0}                                       # both Smaller, both $1000
    avg = {"RAY": 0.5, "GRN": 2.0}                                                  # RAY in profit (+100%), GRN at a loss (-50%)
    normal = plan(300, "USDC", holdings, avg_cost=avg)
    loss_first = plan(300, "USDC", holdings, avg_cost=avg, prefer_losses=True)
    assert coins(normal)[0] == "GRN"                                                # weakest performer first anyway
    assert coins(loss_first)[0] == "GRN"
    avg2 = {"RAY": 2.0, "GRN": 0.5}                                                 # now RAY is the loser
    assert coins(plan(300, "USDC", holdings, avg_cost=avg2, prefer_losses=True))[0] == "RAY"
    t = loss_first["totals"]
    assert t["lossesUsd"] < 0 and t["gainsUsd"] == 0 and t["realisedUsd"] == t["lossesUsd"]


def test_excluded_coins_are_kept_and_a_shortfall_is_reported_when_holdings_cannot_cover_it():
    p = plan(1_000_000, "USDC")
    assert p["totals"]["shortfallUsd"] > 0 and len(p["rows"]) >= 5
    q = plan(500, "USDC", exclude=["RAY", "bad"])
    assert "RAY" not in coins(q) and "BAD" not in coins(q) and any(k["coin"] == "RAY" and k["why"] == "you chose to keep it" for k in q["kept"])


def test_bad_input_gives_a_plain_error():
    assert plan(0)["error"] and plan(-5)["error"] and plan(100, "EUR")["error"] and plan("abc")["error"]
