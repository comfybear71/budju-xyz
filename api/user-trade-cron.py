# ==========================================
# Per-user auto-trade cron (Phase 2 — non-custodial)
# ==========================================
# Runs the SAME tier-based dip-buy/rally-sell strategy as the legacy pooled
# auto-trade-cron.py, but independently for every wallet that has connected
# its own Swyftx key AND explicitly opted in to auto-trading. Each user's
# bot only ever trades in that user's own account, with that user's own
# key, sized from that user's own USDC balance.
#
# Critical safety rule (see PersonalExchangeKeyPanel.tsx comment + CLAUDE.md
# non-custodial design discussion): a user's account may hold coins BUDJU
# never bought (personal trades, pre-existing holdings). The bot must never
# reason about or touch those. So SELL decisions are capped by
# get_user_bot_position() — BUDJU's own ledger of what IT bought for that
# wallet — never by the account's raw coin balance. The raw balance is only
# ever used to size new BUYS (how much USDC is actually available).
#
# One user's failure (revoked key, Swyftx error, insufficient balance) is
# caught and logged per-wallet — it never stops the loop for anyone else.
# ==========================================

import os
import sys
import json
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from urllib.request import urlopen

sys.path.insert(0, os.path.dirname(__file__))

from database import (
    user_exchange_keys_collection,
    decrypt_secret,
    get_user_trader_state,
    save_user_trader_state,
    record_user_trade,
    get_user_bot_position,
    get_prices_for_coins,
)
from swyftx_client import SwyftxClient, SwyftxAuthError
from asset_registry import PERMANENT_BUY_DENYLIST

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = -1002398835975

# Separate kill switch from the legacy pooled bot — disabling one must never
# silently disable (or re-enable) the other.
USER_TRADING_ENABLED = os.getenv("USER_TRADING_ENABLED", "true").lower() == "true"
USER_DRY_RUN = os.getenv("USER_DRY_RUN", "false").lower() == "true"

MIN_USDC_RESERVE = float(os.getenv("USER_MIN_USDC_RESERVE", "20"))
MIN_ORDER_USDC = 8  # Swyftx floor is $7; leave a dollar of headroom
SELL_RATIO = 0.833  # Sell slightly less than the raw allocation band to avoid dust re-buys
DEFAULT_COOLDOWN_HOURS = 24

MAX_SINGLE_TRADE_USDC = float(os.getenv("USER_MAX_SINGLE_TRADE_USDC", "250"))
MAX_DAILY_TRADES_PER_USER = int(os.getenv("USER_MAX_DAILY_TRADES", "10"))

CASH_CODES = {"USDC", "USD", "AUD", "USDT"}


def send_telegram(text):
    if not TELEGRAM_BOT_TOKEN:
        return
    try:
        from urllib.request import Request
        req = Request(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            data=json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "HTML"}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urlopen(req, timeout=10)
    except Exception:
        pass


def _tier_settings(auto_tiers, tier_num):
    key = f"tier{tier_num}"
    s = auto_tiers.get(key, {}) if isinstance(auto_tiers, dict) else {}
    default_dev = 1.0 if tier_num == 1 else 2.0
    return {
        "deviation": float(s.get("deviation", default_dev)),
        "sellDeviation": float(s.get("sellDeviation", default_dev * 2)),
        "allocation": float(s.get("allocation", 5.0)),
        "cooldownHours": float(s.get("cooldownHours", DEFAULT_COOLDOWN_HOURS)),
    }


def _is_tier_active(tier_active, tier_num):
    return bool(tier_active.get(str(tier_num)) or tier_active.get(tier_num))


def run_one_wallet(ctx, prices, now_ms, summary_log):
    wallet = ctx["wallet"]
    wallet_short = wallet[:4] + "..." + wallet[-4:]
    client = ctx["client"]
    holdings = ctx["holdings"]
    state = ctx["state"]

    usdc_balance = sum(v for k, v in holdings.items() if k in CASH_CODES)

    auto_tiers = state.get("autoTiers", {})
    tier_active = state.get("tierActive", {})
    tier_assignments = state.get("tierAssignments", {})
    targets = state.get("targets", {})
    cooldowns = state.get("cooldowns", {})
    trade_log = state.get("tradeLog", [])

    # Settlement guard — let a just-executed trade's balance change settle
    # before this wallet trades again this cycle.
    if trade_log:
        last_ts = trade_log[0].get("timestamp")
        try:
            last_ms = datetime.fromisoformat(last_ts.replace("Z", "+00:00")).timestamp() * 1000
            if (now_ms - last_ms) < 120_000:
                summary_log.append(f"{wallet_short}: settlement guard, skipping this cycle")
                return {"wallet": wallet, "skipped": "settlement_guard"}
        except Exception:
            pass

    # No registry restriction here — any coin in tierAssignments (including
    # ones auto-discovered from this wallet's own holdings, see
    # run_user_auto_trade()'s pre-pass) is tradeable as long as it isn't
    # denylisted and we actually have a live price for it.
    active_pairs = []
    for coin, tiers in tier_assignments.items():
        if coin in PERMANENT_BUY_DENYLIST:
            continue
        tiers = tiers if isinstance(tiers, list) else [tiers]
        for t in tiers:
            try:
                t = int(t)
            except (TypeError, ValueError):
                continue
            if _is_tier_active(tier_active, t):
                active_pairs.append((coin, t))

    code_to_id = None
    trades_this_wallet = []
    daily_trade_count = sum(
        1 for e in trade_log
        if e.get("timestamp") and (now_ms - _safe_ms(e["timestamp"])) < 86_400_000
    )

    for code, tier_num in active_pairs:
        ck = f"{code}:{tier_num}"
        cooldown_expiry = cooldowns.get(ck, 0)
        if isinstance(cooldown_expiry, (int, float)) and cooldown_expiry > now_ms:
            continue

        settings = _tier_settings(auto_tiers, tier_num)
        current_price = prices.get(code, 0)
        if current_price <= 0:
            continue

        tgt = targets.get(ck)
        if not isinstance(tgt, dict):
            tgt = {
                "buy": current_price * (1 - settings["deviation"] / 100),
                "sell": current_price * (1 + settings["sellDeviation"] / 100),
            }
            targets[ck] = tgt

        buy_target = float(tgt.get("buy", 0))
        sell_target = float(tgt.get("sell", 0))
        if buy_target <= 0 or sell_target <= 0:
            continue

        if daily_trade_count >= MAX_DAILY_TRADES_PER_USER:
            continue

        # ── BUY ──
        if current_price <= buy_target:
            trade_amount = max((settings["allocation"] / 100) * usdc_balance, MIN_ORDER_USDC)
            trade_amount = min(trade_amount, MAX_SINGLE_TRADE_USDC)
            if usdc_balance - trade_amount < MIN_USDC_RESERVE:
                continue
            if USER_DRY_RUN:
                summary_log.append(f"{wallet_short}: DRY RUN would BUY {code} ${trade_amount:.2f}")
                continue

            if code_to_id is None:
                try:
                    code_to_id = client.get_code_to_id_map()
                except Exception as e:
                    summary_log.append(f"{wallet_short}: asset map failed — {e}")
                    break

            ok, order_id, err = client.place_market_order(code, "buy", trade_amount, code_to_id)
            if ok:
                quantity = round(trade_amount / current_price, 8)
                record_user_trade(wallet, code, "buy", quantity, current_price, tier_num, order_id)
                old_sell = targets.get(ck, {}).get("sell", sell_target)
                new_buy = current_price * (1 - settings["deviation"] / 100)
                new_sell = current_price * (1 + settings["sellDeviation"] / 100)
                targets[ck] = {"buy": new_buy, "sell": max(old_sell, new_sell)}
                cooldowns[ck] = now_ms + settings["cooldownHours"] * 3_600_000
                trade_log.insert(0, {"coin": code, "side": "buy", "qty": quantity, "price": current_price,
                                      "timestamp": datetime.utcnow().isoformat() + "Z"})
                trade_log = trade_log[:50]
                usdc_balance -= trade_amount
                daily_trade_count += 1
                trades_this_wallet.append({"coin": code, "side": "BUY", "amount": round(trade_amount, 2), "price": current_price})
                summary_log.append(f"{wallet_short}: BUY {code} ${trade_amount:.2f} @ ${current_price:.4f}")
            else:
                summary_log.append(f"{wallet_short}: BUY {code} failed — {err}")

        # ── SELL — capped by what the bot itself bought, never raw balance ──
        elif current_price >= sell_target:
            bot_owned = get_user_bot_position(wallet, code)
            if bot_owned <= 0:
                continue  # Bot never bought this for this user — never touch it

            sell_pct = settings["allocation"] * SELL_RATIO
            quantity = round(min((sell_pct / 100) * bot_owned, bot_owned), 8)
            sell_value = quantity * current_price
            if sell_value < MIN_ORDER_USDC:
                continue
            if USER_DRY_RUN:
                summary_log.append(f"{wallet_short}: DRY RUN would SELL {code} ${sell_value:.2f}")
                continue

            if code_to_id is None:
                try:
                    code_to_id = client.get_code_to_id_map()
                except Exception as e:
                    summary_log.append(f"{wallet_short}: asset map failed — {e}")
                    break

            ok, order_id, err = client.place_market_order(code, "sell", sell_value, code_to_id)
            if ok:
                record_user_trade(wallet, code, "sell", quantity, current_price, tier_num, order_id)
                new_buy = current_price * (1 - settings["deviation"] / 100)
                new_sell = current_price * (1 + settings["sellDeviation"] / 100)
                targets[ck] = {"buy": new_buy, "sell": new_sell}
                cooldowns[ck] = now_ms + settings["cooldownHours"] * 3_600_000
                trade_log.insert(0, {"coin": code, "side": "sell", "qty": quantity, "price": current_price,
                                      "timestamp": datetime.utcnow().isoformat() + "Z"})
                trade_log = trade_log[:50]
                daily_trade_count += 1
                trades_this_wallet.append({"coin": code, "side": "SELL", "amount": round(sell_value, 2), "price": current_price})
                summary_log.append(f"{wallet_short}: SELL {code} ${sell_value:.2f} @ ${current_price:.4f}")
            else:
                summary_log.append(f"{wallet_short}: SELL {code} failed — {err}")

    save_user_trader_state(wallet, {
        "autoTiers": auto_tiers, "tierActive": tier_active, "tierAssignments": tier_assignments,
        "targets": targets, "cooldowns": cooldowns, "tradeLog": trade_log,
    })

    return {"wallet": wallet, "trades": trades_this_wallet}


def _safe_ms(iso_ts):
    try:
        return datetime.fromisoformat(iso_ts.replace("Z", "+00:00")).timestamp() * 1000
    except Exception:
        return 0


def run_user_auto_trade():
    log = []
    if not USER_TRADING_ENABLED:
        return {"skipped": True, "reason": "USER_TRADING_ENABLED is false", "log": log}

    wallets = list(user_exchange_keys_collection.find({"status": "active", "autoTradeEnabled": True}))
    if not wallets:
        return {"skipped": True, "reason": "No wallets have auto-trading enabled", "log": log}

    # Pre-pass: fetch each wallet's holdings + trader state once, and
    # auto-enroll any coin the wallet actually holds that BUDJU doesn't
    # track yet. This is what makes "every coin a user has" tradeable —
    # not just the ~30 originally hand-picked ones — without touching the
    # legacy pooled bot's own registry at all.
    wallet_contexts = []
    all_codes = set()
    for doc in wallets:
        wallet = doc["walletAddress"]
        wallet_short = wallet[:4] + "..." + wallet[-4:]
        try:
            api_key = decrypt_secret(doc["encryptedApiKey"])
            client = SwyftxClient(api_key)
            holdings = client.get_holdings()
        except SwyftxAuthError as e:
            user_exchange_keys_collection.update_one(
                {"walletAddress": wallet},
                {"$set": {"status": "invalid", "lastError": str(e)}},
            )
            log.append(f"{wallet_short}: auth failed — {e}")
            continue
        except Exception as e:
            log.append(f"{wallet_short}: holdings fetch failed — {e}")
            continue

        state = get_user_trader_state(wallet)
        tier_assignments = state.get("tierAssignments", {})
        for code in holdings:
            if code in CASH_CODES or code in PERMANENT_BUY_DENYLIST:
                continue
            if code not in tier_assignments:
                tier_assignments[code] = [1, 2, 3]  # newly-seen coin — auto-enrolled at every tier
            all_codes.add(code)
        for code in tier_assignments:
            if code not in PERMANENT_BUY_DENYLIST:
                all_codes.add(code)
        state["tierAssignments"] = tier_assignments

        wallet_contexts.append({"wallet": wallet, "client": client, "holdings": holdings, "state": state})

    if not wallet_contexts:
        return {"skipped": True, "reason": "No wallet's holdings could be read this cycle", "log": log}

    try:
        prices = get_prices_for_coins(list(all_codes))
    except Exception as e:
        return {"error": f"Price fetch failed: {e}", "log": log}

    now_ms = int(time.time() * 1000)
    results = []
    for ctx in wallet_contexts:
        try:
            results.append(run_one_wallet(ctx, prices, now_ms, log))
        except Exception as e:
            # Never let one wallet's unexpected failure stop the rest.
            log.append(f"{ctx['wallet'][:8]}: unexpected error — {e}")
            results.append({"wallet": ctx["wallet"], "error": str(e)})

    total_trades = sum(len(r.get("trades", [])) for r in results)
    if total_trades > 0:
        lines = [f"🔑 <b>Personal Auto-Trade</b> — {total_trades} trade(s) across {len(wallet_contexts)} wallet(s)"]
        for r in results:
            for t in r.get("trades", []):
                side_icon = "🛒" if t["side"] == "BUY" else "💸"
                lines.append(f"{side_icon} {r['wallet'][:4]}...{r['wallet'][-4:]} {t['side']} {t['coin']} ${t['amount']:.2f}")
        send_telegram("\n".join(lines))

    # walletsProcessed reflects wallets whose holdings could actually be read
    # this cycle (wallet_contexts) — not the raw opted-in query count, which
    # may include wallets that failed auth/holdings fetch and were skipped.
    return {"walletsProcessed": len(wallet_contexts), "walletsOptedIn": len(wallets), "tradesExecuted": total_trades,
            "dryRun": USER_DRY_RUN, "results": results, "log": log}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        cron_secret = os.getenv("CRON_SECRET")
        if cron_secret:
            auth = self.headers.get("Authorization", "")
            if auth != f"Bearer {cron_secret}":
                self._send_json(401, {"error": "Unauthorized"})
                return
        try:
            result = run_user_auto_trade()
            self._send_json(200, result)
        except Exception as e:
            print(f"User auto-trade cron error: {e}")
            self._send_json(500, {"error": str(e)})

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode())

    def log_message(self, format, *args):
        pass
