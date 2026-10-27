# ==========================================
# Per-user auto-trade diagnostic — read-only
# ==========================================
# Mirrors user-trade-cron.py's run_user_auto_trade()/run_one_wallet()
# gating logic exactly, but NEVER places an order. Lets an admin answer
# "why isn't wallet X trading right now" for one specific wallet without
# needing server log access — every early-return below names the exact
# gate (key status, master switch, tier assignment, cooldown, reserve,
# live Swyftx auth) that user-trade-cron.py would also hit for this
# wallet on its next run.
# ==========================================

import os
import time
from typing import Dict

from database import (
    user_exchange_keys_collection,
    decrypt_secret,
    get_trader_state,
    get_user_trader_state,
    get_prices_for_coins,
    get_user_bot_position,
    ADMIN_WALLETS,
)
from swyftx_client import SwyftxClient, SwyftxAuthError
from trade_guards import is_permanently_buy_denied

CASH_CODES = {"USDC", "USD", "AUD", "USDT"}
# Mirrors user-trade-cron.py's own constants exactly — a diagnostic using
# different numbers than the real cron would just produce a confusing,
# wrong answer.
MIN_USDC_RESERVE = float(os.getenv("USER_MIN_USDC_RESERVE", "30"))
MIN_ORDER_USDC = 8
TARGET_STALE_MS = float(os.getenv("USER_TARGET_STALE_HOURS", "48")) * 3_600_000


def _tier_settings(auto_tiers: Dict, tier_num: int) -> Dict:
    key = f"tier{tier_num}"
    s = auto_tiers.get(key, {}) if isinstance(auto_tiers, dict) else {}
    default_dev = 1.0 if tier_num == 1 else 2.0
    return {
        "deviation": float(s.get("deviation", default_dev)),
        "sellDeviation": float(s.get("sellDeviation", default_dev * 2)),
        "allocation": float(s.get("allocation", 5.0)),
        "cooldownHours": float(s.get("cooldownHours", 24)),
    }


def _is_tier_active(tier_active: Dict, tier_num: int) -> bool:
    return bool(tier_active.get(str(tier_num)) or tier_active.get(tier_num))


def _tier_num(value) -> int:
    if value is None:
        return 0
    s = str(value).replace("tier", "")
    try:
        return int(s)
    except (TypeError, ValueError):
        return 0


def diagnose_user_auto_trade(wallet: str) -> Dict:
    """Walks the exact same gates user-trade-cron.py applies for this one
    wallet, read-only. Returns as soon as it finds the first gate that
    would currently exclude this wallet from trading — that's the answer
    to "why isn't it trading" — or, if every gate passes, a per-coin
    breakdown of current price vs. buy/sell target so a missing trade can
    be diagnosed as "no signal yet" rather than "broken"."""
    key_doc = user_exchange_keys_collection.find_one({"walletAddress": wallet})
    if not key_doc:
        return {"wallet": wallet, "reason": "No Swyftx key connected for this wallet at all."}

    out = {
        "wallet": wallet,
        "keyStatus": key_doc.get("status"),
        "autoTradeEnabled": bool(key_doc.get("autoTradeEnabled")),
        "lastKeyError": key_doc.get("lastError"),
    }

    if wallet in ADMIN_WALLETS:
        out["reason"] = (
            "This wallet is in ADMIN_WALLETS — user-trade-cron.py excludes it "
            "entirely (it's traded by the separate pooled admin bot instead, if at all)."
        )
        return out

    if key_doc.get("status") != "active":
        out["reason"] = (
            f"Key status is '{key_doc.get('status')}', not 'active' — "
            "user-trade-cron.py's wallet query excludes it entirely until re-validated."
        )
        return out

    if not key_doc.get("autoTradeEnabled"):
        out["reason"] = "autoTradeEnabled is false — excluded from the per-user cron's wallet query entirely."
        return out

    shared_state = get_trader_state()
    auto_active = shared_state.get("autoActive", {})
    if not isinstance(auto_active, dict) or not auto_active.get("isActive"):
        out["reason"] = "Master Auto-Trade switch is OFF (shared trader_state.autoActive.isActive)."
        return out

    tier_active = auto_active.get("tierActive", {})
    if not any(_is_tier_active(tier_active, t) for t in (1, 2, 3)):
        out["reason"] = "No tiers are active on the shared Auto Trade screen."
        return out

    auto_tiers = shared_state.get("autoTiers", {})
    tier_assignments = shared_state.get("autoTierAssignments", {})
    active_pairs = []
    for coin, tiers in tier_assignments.items():
        if is_permanently_buy_denied(coin):
            continue
        if isinstance(tiers, list):
            for t in tiers:
                try:
                    t = int(t)
                except (TypeError, ValueError):
                    continue
                if _is_tier_active(tier_active, t):
                    active_pairs.append((coin, t))
        else:
            tn = _tier_num(tiers)
            if 1 <= tn <= 3:
                for t in (1, 2, 3):
                    if _is_tier_active(tier_active, t):
                        active_pairs.append((coin, t))

    out["activeCoinTierPairs"] = len(active_pairs)
    if not active_pairs:
        out["reason"] = "No coins assigned to an active tier on the shared Auto Trade screen."
        return out

    try:
        api_key = decrypt_secret(key_doc["encryptedApiKey"])
        client = SwyftxClient(api_key)
        holdings = client.get_holdings()
    except SwyftxAuthError as e:
        out["reason"] = f"Live Swyftx auth/holdings fetch failed just now: {e}"
        return out
    except Exception as e:
        out["reason"] = f"Live Swyftx holdings fetch failed just now: {e}"
        return out

    usdc_balance = sum(v for k, v in holdings.items() if k in CASH_CODES)
    out["liveUsdcBalance"] = round(usdc_balance, 2)
    out["liveHoldings"] = {k: round(v, 8) for k, v in holdings.items() if v > 0}

    state = get_user_trader_state(wallet)
    targets = state.get("targets", {})
    cooldowns = state.get("cooldowns", {})
    trade_log = state.get("tradeLog", [])
    out["tradeLogCount"] = len(trade_log)
    out["lastTrades"] = trade_log[:5]

    # Same settlement guard the real cron applies — if it would currently
    # be skipping this wallet for this reason, say so explicitly rather
    # than letting it look like a "hold" on every coin below.
    if trade_log:
        last_ts = trade_log[0].get("timestamp")
        try:
            from datetime import datetime
            last_ms = datetime.fromisoformat(last_ts.replace("Z", "+00:00")).timestamp() * 1000
            now_ms = int(time.time() * 1000)
            if (now_ms - last_ms) < 120_000:
                out["reason"] = "Settlement guard — a trade for this wallet executed <2 minutes ago, next cron cycle will skip it."
                return out
        except Exception:
            pass

    all_codes = sorted(set(c for c, _ in active_pairs))
    try:
        prices = get_prices_for_coins(all_codes)
    except Exception as e:
        out["reason"] = f"Price fetch failed just now: {e}"
        return out

    now_ms = int(time.time() * 1000)
    per_coin = []
    for code, tier_num in active_pairs:
        ck = f"{code}:{tier_num}"
        settings = _tier_settings(auto_tiers, tier_num)
        current_price = prices.get(code, 0)
        cooldown_expiry = cooldowns.get(ck, 0)
        on_cooldown = isinstance(cooldown_expiry, (int, float)) and cooldown_expiry > now_ms

        tgt = targets.get(ck)
        set_at = tgt.get("setAt") if isinstance(tgt, dict) else None
        is_stale = not isinstance(set_at, (int, float)) or (now_ms - set_at) > TARGET_STALE_MS
        if (not isinstance(tgt, dict) or is_stale) and current_price > 0:
            # Not-yet-generated OR stale (2026-10-27 fix) — the real cron
            # would regenerate this from TODAY's price on its next run too.
            tgt = {
                "buy": current_price * (1 - settings["deviation"] / 100),
                "sell": current_price * (1 + settings["sellDeviation"] / 100),
            }

        entry = {
            "coin": code,
            "tier": tier_num,
            "currentPrice": current_price,
            "buyTarget": round(tgt["buy"], 6) if isinstance(tgt, dict) else None,
            "sellTarget": round(tgt["sell"], 6) if isinstance(tgt, dict) else None,
            "onCooldown": on_cooldown,
            "cooldownRemainingHours": round((cooldown_expiry - now_ms) / 3_600_000, 2) if on_cooldown else 0,
            "targetAgeHours": round((now_ms - set_at) / 3_600_000, 1) if isinstance(set_at, (int, float)) else None,
            "targetWasStale": is_stale,
            "signal": "hold",
        }

        if current_price > 0 and isinstance(tgt, dict):
            buy_target = float(tgt.get("buy", 0))
            sell_target = float(tgt.get("sell", 0))
            if buy_target > 0 and current_price <= buy_target:
                entry["signal"] = "BUY"
                trade_amount = max((settings["allocation"] / 100) * usdc_balance, MIN_ORDER_USDC)
                entry["wouldBuyAmountUsd"] = round(trade_amount, 2)
                entry["blockedByCooldown"] = on_cooldown
                entry["blockedByReserve"] = (usdc_balance - trade_amount) < MIN_USDC_RESERVE
            elif sell_target > 0 and current_price >= sell_target:
                bot_owned = get_user_bot_position(wallet, code)
                entry["signal"] = "SELL"
                entry["botOwnedQty"] = bot_owned
                entry["blockedByCooldown"] = on_cooldown
                entry["blockedNoBotPosition"] = bot_owned <= 0
        per_coin.append(entry)

    out["perCoin"] = per_coin
    out["coinsWithLiveBuySignal"] = [
        e["coin"] for e in per_coin
        if e.get("signal") == "BUY" and not e.get("blockedByCooldown") and not e.get("blockedByReserve")
    ]
    out["coinsWithLiveSellSignal"] = [
        e["coin"] for e in per_coin
        if e.get("signal") == "SELL" and not e.get("blockedByCooldown") and not e.get("blockedNoBotPosition")
    ]
    return out
