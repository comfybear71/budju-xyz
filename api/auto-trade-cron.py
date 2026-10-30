# ==========================================
# Unified Auto-Trade Cron — ONE bot, every wallet
# ==========================================
# 2026-10-29 consolidation: this used to be two separate trading engines —
# this file (the admin's own pooled Swyftx account, via a hardcoded
# SWYFTX_API_KEY) and api/user-trade-cron.py (every OTHER connected wallet,
# via its own key), PLUS a third copy running live in the browser
# (src/features/trade/services/autoTrader.ts). All three read the same
# shared tier settings/coin assignments, but ran on separate code paths,
# with separate circuit breakers, and sent separate Telegram messages —
# which is exactly what looked (and was) like "two different systems
# running" from the outside: different buy orders landing at different
# times for different wallets on the same signal, and two message formats
# in the same Telegram channel.
#
# Now there is exactly one engine, one 5-minute schedule, one safety rule
# set, and one Telegram digest per run — this loop simply repeats the
# same decision for every connected, auto-trading-enabled wallet
# (admin's pool account included), each sized from that wallet's own
# Swyftx balance. The browser never executes trades anymore (see
# autoTrader.ts) and api/user-trade-cron.py has been deleted.
#
# The one place admin's wallet still differs from everyone else: trade
# recording. Admin's Swyftx account is the legacy POOLED account that
# other depositors' shares/NAV are computed against (record_trade() ->
# calculate_pool_allocations(), see database.py's pool accounting
# docstring) — that bookkeeping has nothing to do with WHICH engine
# placed the trade, so it stays exactly as-is. Every other wallet's
# trades go into its own non-custodial per-user ledger
# (record_user_trade()) instead. Both still go through the identical
# target/signal/safety logic below.
# ==========================================

import os
import sys
import time
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
import json

sys.path.insert(0, os.path.dirname(__file__))

from database import (
    user_exchange_keys_collection,
    decrypt_secret,
    get_trader_state,
    save_trader_state,
    get_user_trader_state,
    save_user_trader_state,
    record_trade,
    record_user_trade,
    calculate_pool_allocations,
    get_coin_stats,
    get_user_bot_position,
    get_user_avg_cost,
    get_prices_for_coins,
    ADMIN_WALLETS,
)
from trade_guards import (
    DEFAULT_REBUY_BLOCKLIST,
    REBUY_LEGACY_EXPIRY,
    is_permanently_buy_denied,
    is_rebuy_blocked,
    sell_below_min,
)
from swyftx_client import SwyftxClient, SwyftxAuthError

# ── Config ────────────────────────────────────────────────────

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = -1002398835975

CASH_CODES = {"USDC", "USD", "AUD", "USDT"}

# Trading constants — one set, applied identically to every wallet.
DEFAULT_COOLDOWN_HOURS = 24
MIN_USDC_RESERVE = float(os.getenv("MIN_USDC_RESERVE", "30"))
MIN_ORDER_USDC = 8  # Floor for any trade (Swyftx minimum is $7)
SELL_RATIO = 0.833  # Sell 83% of the allocation band (accumulation bias)

# Emergency kill-switch + dry-run (single switch for every wallet now —
# there's only one bot to pause).
DRY_RUN = os.getenv("DRY_RUN", "false").lower() == "true"

# Circuit breakers (configurable via env vars) — same per-wallet ceiling
# for everyone, including the admin's pool account. Unifying onto the
# lower, per-user-tuned defaults (previously only applied to non-admin
# wallets) rather than the admin-only $500/$2000/20 ones: every wallet
# now ALSO gets the max-daily-sell-exposure breaker, which non-admin
# wallets never had before this merge.
MAX_SINGLE_TRADE_USDC = float(os.getenv("MAX_SINGLE_TRADE_USDC", "250"))
MAX_DAILY_TRADES = int(os.getenv("MAX_DAILY_TRADES", "10"))
MAX_DAILY_LOSS_USDC = float(os.getenv("MAX_DAILY_LOSS_USDC", "1000"))

# Stale-target refresh window — any target older than this is treated as
# missing and regenerated off the current price. See git history
# (2026-10-27) for the full incident writeup.
TARGET_STALE_MS = float(os.getenv("TARGET_STALE_HOURS", "48")) * 3_600_000

# Debt-payoff-sale guard (July 2026). See trade_guards.py. (The matching
# $500 "deployable capital" cap that used to live here was removed
# 2026-10-30 per explicit operator instruction — it was never lifted after
# the debt-payoff sale it was built for ended, and kept silently capping
# every wallet's buy sizing. Every wallet now sizes off its own real
# balance, uncapped, no exceptions.)
SWYFTX_MIN_SELL_USDC = float(os.getenv("SWYFTX_MIN_SELL_USDC", "30"))

# Best-effort de-dup so blocklist / min-order skips log once per warm
# instance (avoids spamming the activity log every 5-minute cycle).
_blocklist_logged = set()
_minsell_logged = set()

# ── Telegram ──────────────────────────────────────────────────

def send_telegram(text):
    """Send a Telegram message (best-effort, non-blocking)."""
    if not TELEGRAM_BOT_TOKEN:
        return
    try:
        req = Request(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            data=json.dumps({
                "chat_id": TELEGRAM_CHAT_ID,
                "text": text,
                "parse_mode": "HTML",
            }).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urlopen(req, timeout=10)
    except Exception:
        pass  # Non-critical


def _format_digest(all_trades):
    """One combined Telegram message for the whole run — every wallet
    that traded this cycle, buys then sells. Replaces the old two
    separate formats ("🤖 Auto-Trade" for the admin, "🔑 Personal
    Auto-Trade" for everyone else) with a single shared one."""
    buys = [t for t in all_trades if t["side"] == "BUY"]
    sells = [t for t in all_trades if t["side"] == "SELL"]
    lines = [f"🤖 <b>Auto-Trade</b> — {len(all_trades)} trade(s) across {len({t['wallet'] for t in all_trades})} wallet(s)"]

    def _wallet_label(t):
        w = t["wallet"]
        return "pool" if t.get("isPool") else f"{w[:4]}...{w[-4:]}"

    if buys:
        lines.append(f"\n🟢 <b>{len(buys)} BUY</b>")
        for t in buys[:25]:
            lines.append(f"🛒 {_wallet_label(t)}  {t['qty']:.4f} {t['coin']} @ ${t['price']:,.2f}  (${t['amount']:,.2f})")
    if sells:
        lines.append(f"\n🔴 <b>{len(sells)} SELL</b>")
        for t in sells[:25]:
            lines.append(f"💸 {_wallet_label(t)}  {t['qty']:.4f} {t['coin']} @ ${t['price']:,.2f}  (${t['amount']:,.2f})")
    return "\n".join(lines)

# ── Tier / Shared-Rule Helpers ───────────────────────────────

def _tier_num(value):
    """Convert tier value ('tier1', '1', 1, etc.) to int."""
    if value is None:
        return 0
    s = str(value).replace("tier", "")
    try:
        return int(s)
    except (TypeError, ValueError):
        return 0


def _tier_settings(tier_assets, tier_num):
    """Get deviation/sellDeviation/allocation/cooldown for a tier from the
    shared admin "Auto Trade" screen, with defaults."""
    key = f"tier{tier_num}"
    db_settings = tier_assets.get(key, {}) if isinstance(tier_assets, dict) else {}
    default_dev = 1.0 if tier_num == 1 else 2.0
    default_sell_dev = default_dev * 2
    return {
        "deviation": float(db_settings.get("deviation", default_dev)),
        "sellDeviation": float(db_settings.get("sellDeviation", default_sell_dev)),
        "allocation": float(db_settings.get("allocation", 5.0)),
        "cooldownHours": float(db_settings.get("cooldownHours", DEFAULT_COOLDOWN_HOURS)),
    }


def _is_tier_active(tier_active, tier_num):
    return bool(tier_active.get(str(tier_num)) or tier_active.get(tier_num))


def _build_active_pairs(tier_assignments, tier_active):
    """(coin, tier) pairs for every coin assigned to a currently-active
    tier — identical for every wallet, since the coin list/tier settings
    are the one shared rulebook, not a per-wallet choice."""
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
    return active_pairs


def _load_rebuy_blocklist(shared_state, log):
    """Tax-loss / wash-sale rebuy blocklist — shared across every wallet
    (a content-based decision like "don't rebuy ENA yet" should be
    uniform, not per-wallet). Only strips *legacy* July-2026 entries
    (expiry on/before 2026-08-30); newer admin blocks persist."""
    rebuy_blocklist = shared_state.get("autoRebuyBlocklist")
    seed_blocklist = False
    if rebuy_blocklist is None:
        rebuy_blocklist = dict(DEFAULT_REBUY_BLOCKLIST)
        seed_blocklist = True
    elif isinstance(rebuy_blocklist, dict):
        cleaned = {}
        dropped = []
        for code, until in rebuy_blocklist.items():
            try:
                until_dt = datetime.fromisoformat(str(until).replace("Z", "").replace("+00:00", ""))
            except (ValueError, TypeError):
                cleaned[code] = until
                continue
            if until_dt <= REBUY_LEGACY_EXPIRY:
                dropped.append(code)
            else:
                cleaned[code] = until
        if dropped:
            log.append(f"Dropped {len(dropped)} legacy tax-loss rebuy block(s): {', '.join(sorted(dropped))}")
            seed_blocklist = True
        rebuy_blocklist = cleaned
    else:
        rebuy_blocklist = {}
    return rebuy_blocklist, seed_blocklist

# ── Circuit Breakers ─────────────────────────────────────────

def _check_circuit_breakers(trade_log, side, amount_usdc, code, log):
    """Check circuit breakers before executing a trade, scoped to ONE
    wallet's own trade log. Returns (allowed: bool, reason: str or None)."""
    if amount_usdc > MAX_SINGLE_TRADE_USDC:
        reason = f"Trade ${amount_usdc:.2f} exceeds MAX_SINGLE_TRADE_USDC (${MAX_SINGLE_TRADE_USDC:.2f})"
        log.append(f"{code}: BLOCKED — {reason}")
        return False, reason

    cutoff_ms = int(time.time() * 1000) - (24 * 3_600_000)
    recent_trades = 0
    daily_sell_total = 0.0
    for entry in trade_log:
        ts = entry.get("timestamp") or entry.get("time") or ""
        try:
            entry_time = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            entry_ms = int(entry_time.timestamp() * 1000)
        except (ValueError, AttributeError, TypeError):
            continue
        if entry_ms > cutoff_ms:
            recent_trades += 1
            if str(entry.get("side", "")).lower() == "sell":
                daily_sell_total += float(entry.get("qty", entry.get("quantity", 0)) or 0) * float(entry.get("price", 0) or 0)

    if recent_trades >= MAX_DAILY_TRADES:
        reason = f"Hit MAX_DAILY_TRADES limit ({MAX_DAILY_TRADES} trades in 24h)"
        log.append(f"{code}: BLOCKED — {reason}")
        return False, reason

    if side == "sell" and (daily_sell_total + amount_usdc) > MAX_DAILY_LOSS_USDC:
        reason = f"Daily sell total ${daily_sell_total + amount_usdc:.2f} would exceed MAX_DAILY_LOSS_USDC (${MAX_DAILY_LOSS_USDC:.2f})"
        log.append(f"{code}: BLOCKED — {reason}")
        return False, reason

    return True, None

# ── Per-Wallet Avg Cost (sell-below-cost guard inputs) ──────

def _sell_guard_inputs(ctx, code, pool_avg_cost_map):
    """(avg_cost, position_cap) for the SELL path. The pool account's
    position is capped by its real Swyftx balance (same as this file's
    pre-merge behavior) since trades_collection isn't a per-coin ledger
    the way user_trades_collection is; every other wallet is capped by
    what BUDJU's own ledger says IT bought for that wallet — never the
    account's raw balance, so the bot can never touch coins a user holds
    that it didn't buy itself."""
    if ctx["isPool"]:
        return pool_avg_cost_map.get(code, 0.0), ctx["holdings"].get(code, 0.0)
    return get_user_avg_cost(ctx["wallet"], code), get_user_bot_position(ctx["wallet"], code)


def _record_trade_ledger(ctx, code, side, quantity, price, tier_num, order_id, log):
    """Admin's pool account records into the legacy shared pool ledger
    (feeds other depositors' share P&L); every other wallet records into
    its own non-custodial ledger. Both feed the exact same decision logic
    above — this is the one deliberate branch in the whole file."""
    if ctx["isPool"]:
        try:
            allocations = calculate_pool_allocations()
            record_trade(code, side, quantity, price, allocations, swyftx_id=order_id)
        except Exception as e:
            log.append(f"Pool trade record error: {e}")
    else:
        record_user_trade(ctx["wallet"], code, side, quantity, price, tier_num, order_id)

# ── Per-Wallet Trading Cycle ─────────────────────────────────

def _run_one_wallet(ctx, active_pairs, auto_tiers, prices, rebuy_blocklist, pool_avg_cost_map, now_ms, log, code_to_id_box):
    wallet = ctx["wallet"]
    short = "pool" if ctx["isPool"] else (wallet[:4] + "..." + wallet[-4:])
    holdings = ctx["holdings"]
    state = ctx["state"]

    usdc_balance = sum(v for k, v in holdings.items() if k in CASH_CODES)
    targets = state.get("targets", {})
    cooldowns = state.get("cooldowns", {})
    trade_log = state.get("tradeLog", [])

    # Settlement guard — let a just-executed trade's balance change settle
    # before this wallet trades again this cycle. Per-wallet now (each
    # account's own recent activity, not a shared/global check).
    if trade_log:
        last_ts = trade_log[0].get("timestamp") or trade_log[0].get("time")
        try:
            last_ms = datetime.fromisoformat(str(last_ts).replace("Z", "+00:00")).timestamp() * 1000
            if (now_ms - last_ms) < 120_000:
                log.append(f"{short}: settlement guard, skipping this cycle")
                return {"wallet": wallet, "isPool": ctx["isPool"], "skipped": "settlement_guard"}
        except Exception:
            pass

    trades_this_wallet = []

    for code, tier_num in active_pairs:
        try:
            ck = f"{code}:{tier_num}"
            cooldown_expiry = cooldowns.get(ck, cooldowns.get(code, 0))
            if isinstance(cooldown_expiry, (int, float)) and cooldown_expiry > now_ms:
                continue
            elif cooldown_expiry:
                cooldowns.pop(ck, None)
                cooldowns.pop(code, None)

            settings = _tier_settings(auto_tiers, tier_num)
            current_price = prices.get(code, 0)
            if current_price <= 0:
                continue

            tgt = targets.get(ck) or targets.get(code)
            set_at = tgt.get("setAt") if isinstance(tgt, dict) else None
            is_stale = not isinstance(set_at, (int, float)) or (now_ms - set_at) > TARGET_STALE_MS

            # A stale target can be ALREADY CROSSED -- e.g. after any outage
            # longer than TARGET_STALE_MS where price genuinely dipped/
            # rallied past the old trigger while nobody was watching.
            # Recalculating buy_target as current_price * (1 - dev%) is
            # ALWAYS below current_price by construction, so blindly
            # overwriting a stale target before checking it means that
            # earned crossing is erased and can NEVER fire -- not a fluke,
            # a guaranteed outcome of the formula, every single time. Only
            # discard the stale target when it ISN'T already crossed, so a
            # real dip/rally that happened during a gap still triggers the
            # trade it already earned instead of resetting to "0% away"
            # and waiting for an entirely new move.
            old_buy = float(tgt.get("buy", 0)) if isinstance(tgt, dict) else 0
            old_sell = float(tgt.get("sell", 0)) if isinstance(tgt, dict) else 0
            tgt_valid = isinstance(tgt, dict) and old_buy > 0 and old_sell > 0
            already_crossed = tgt_valid and (current_price <= old_buy or current_price >= old_sell)

            if not tgt_valid or (is_stale and not already_crossed):
                tgt = {
                    "buy": current_price * (1 - settings["deviation"] / 100),
                    "sell": current_price * (1 + settings["sellDeviation"] / 100),
                    "setAt": now_ms,
                }
                targets[ck] = tgt
                targets.pop(code, None)

            buy_target = float(tgt.get("buy", 0))
            sell_target = float(tgt.get("sell", 0))
            if buy_target <= 0 or sell_target <= 0:
                continue

            # ── BUY ──
            if current_price <= buy_target:
                if is_permanently_buy_denied(code):
                    if code not in _blocklist_logged:
                        log.append(f"{code}: BUY skipped — permanent buy denylist")
                        _blocklist_logged.add(code)
                    continue
                if is_rebuy_blocked(rebuy_blocklist, code, datetime.utcnow()):
                    if code not in _blocklist_logged:
                        log.append(f"{code}: BUY skipped — rebuy blocklist until {rebuy_blocklist.get(code)}")
                        _blocklist_logged.add(code)
                    continue

                # No deployable-capital cap — every wallet sizes off its own
                # real balance, uncapped, every wallet and every trade equal.
                trade_amount = max((settings["allocation"] / 100) * usdc_balance, MIN_ORDER_USDC)
                if usdc_balance - trade_amount < MIN_USDC_RESERVE:
                    continue

                cb_ok, cb_reason = _check_circuit_breakers(trade_log, "buy", trade_amount, code, log)
                if not cb_ok:
                    continue

                if DRY_RUN:
                    log.append(f"{short}: DRY RUN — would BUY {code} ${trade_amount:.2f}")
                    continue

                if code_to_id_box.get("map") is None:
                    try:
                        code_to_id_box["map"] = ctx["client"].get_code_to_id_map()
                    except Exception as e:
                        log.append(f"{short}: asset ID map failed — {e}")
                        break

                ok, order_id, err = ctx["client"].place_market_order(code, "buy", trade_amount, code_to_id_box["map"])
                if ok:
                    quantity = round(trade_amount / current_price, 8)
                    _record_trade_ledger(ctx, code, "buy", quantity, current_price, tier_num, order_id, log)

                    old_sell = targets.get(ck, {}).get("sell", sell_target)
                    new_buy = current_price * (1 - settings["deviation"] / 100)
                    new_sell = current_price * (1 + settings["sellDeviation"] / 100)
                    targets[ck] = {"buy": new_buy, "sell": max(old_sell, new_sell), "setAt": now_ms}
                    cooldowns[ck] = now_ms + settings["cooldownHours"] * 3_600_000

                    trade_log.insert(0, {
                        "coin": code, "side": "buy", "qty": quantity, "price": current_price,
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    })
                    trade_log = trade_log[:50]

                    usdc_balance -= trade_amount
                    log.append(f"{short}: BUY {code} ${trade_amount:.2f} @ ${current_price:.4f}")
                    trades_this_wallet.append({
                        "wallet": wallet, "isPool": ctx["isPool"], "coin": code, "side": "BUY",
                        "amount": round(trade_amount, 2), "price": round(current_price, 2), "qty": quantity,
                    })
                else:
                    log.append(f"{short}: BUY {code} failed — {err}")

            # ── SELL ──
            elif current_price >= sell_target:
                avg_cost, position_cap = _sell_guard_inputs(ctx, code, pool_avg_cost_map)
                if avg_cost > 0 and current_price < avg_cost:
                    log.append(f"{short}: {code} hit sell target but price ${current_price:.2f} < avg cost ${avg_cost:.2f} — SELL BLOCKED")
                    continue
                if position_cap <= 0:
                    continue

                sell_pct = settings["allocation"] * SELL_RATIO
                quantity = round(min((sell_pct / 100) * position_cap, position_cap), 8)
                if quantity <= 0:
                    continue
                sell_value = quantity * current_price

                if sell_below_min(sell_value, SWYFTX_MIN_SELL_USDC):
                    min_qty = SWYFTX_MIN_SELL_USDC / current_price
                    if min_qty <= position_cap:
                        quantity = round(min_qty, 8)
                        sell_value = quantity * current_price
                    else:
                        quantity = round(position_cap, 8)
                        sell_value = quantity * current_price
                        if sell_below_min(sell_value, SWYFTX_MIN_SELL_USDC):
                            if code not in _minsell_logged:
                                log.append(f"{code}: SELL skipped — position ${sell_value:.2f} below Swyftx min ${SWYFTX_MIN_SELL_USDC:.0f}")
                                _minsell_logged.add(code)
                            continue

                cb_ok, cb_reason = _check_circuit_breakers(trade_log, "sell", sell_value, code, log)
                if not cb_ok:
                    continue

                if DRY_RUN:
                    log.append(f"{short}: DRY RUN — would SELL {code} ${sell_value:.2f}")
                    continue

                if code_to_id_box.get("map") is None:
                    try:
                        code_to_id_box["map"] = ctx["client"].get_code_to_id_map()
                    except Exception as e:
                        log.append(f"{short}: asset ID map failed — {e}")
                        break

                ok, order_id, err = ctx["client"].place_market_order(code, "sell", sell_value, code_to_id_box["map"])
                if ok:
                    _record_trade_ledger(ctx, code, "sell", quantity, current_price, tier_num, order_id, log)

                    new_buy = current_price * (1 - settings["deviation"] / 100)
                    new_sell = current_price * (1 + settings["sellDeviation"] / 100)
                    targets[ck] = {"buy": new_buy, "sell": new_sell, "setAt": now_ms}
                    cooldowns[ck] = now_ms + settings["cooldownHours"] * 3_600_000

                    trade_log.insert(0, {
                        "coin": code, "side": "sell", "qty": quantity, "price": current_price,
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    })
                    trade_log = trade_log[:50]

                    log.append(f"{short}: SELL {code} ${sell_value:.2f} @ ${current_price:.4f}")
                    trades_this_wallet.append({
                        "wallet": wallet, "isPool": ctx["isPool"], "coin": code, "side": "SELL",
                        "amount": round(sell_value, 2), "price": round(current_price, 2), "qty": quantity,
                    })
                else:
                    log.append(f"{short}: SELL {code} failed — {err}")
        except Exception as e:
            # A single coin's unexpected failure here (bad API reply, timeout,
            # malformed response, etc.) must never cost every OTHER coin's
            # freshly-stamped target this cycle. Before this guard, ANY
            # uncaught error anywhere in this per-coin block propagated out of
            # the whole per-wallet loop and skipped save_trader_state()/
            # save_user_trader_state() at the bottom entirely -- silently
            # discarding every coin's fresh setAt stamp for the whole cycle.
            # That is why targets looked permanently "stale" cycle after
            # cycle and a buy never actually fired even once price had
            # already crossed the (just-destroyed) target.
            log.append(f"{code}: unexpected error this cycle -- {e}")
            continue

    # TEMPORARY diagnostic (2026-10-30) -- see matching comments above.
    # Confirms the save was actually attempted (and with what BTC:1 looks
    # like going in) regardless of whether it then succeeds or raises.
    print(f"[DIAG] {short}: reached save step, BTC:1 target about to be saved = {targets.get('BTC:1')}", flush=True)

    # Persist this wallet's own targets/cooldowns/trade log.
    if ctx["isPool"]:
        # Written back into the same shared document the frontend's
        # Auto Trade screen already polls (/api/state) — keeps the
        # admin's live monitoring panel working with zero frontend
        # changes, even though targets/cooldowns/tradeLog are now
        # computed by the exact same per-wallet function as everyone else.
        save_trader_state({
            "autoActive": {**ctx["sharedAutoActive"], "targets": targets},
            "autoCooldowns": cooldowns,
            "autoTradeLog": trade_log,
        })
    else:
        save_user_trader_state(wallet, {"targets": targets, "cooldowns": cooldowns, "tradeLog": trade_log})

    print(f"[DIAG] {short}: save_trader_state()/save_user_trader_state() returned without raising", flush=True)

    return {"wallet": wallet, "isPool": ctx["isPool"], "trades": trades_this_wallet}

# ── Main Entry Point ─────────────────────────────────────────

def run_auto_trade_check():
    """One cycle of the single unified bot — every connected,
    auto-trading-enabled wallet (admin's pool account included), same
    rules, same safety checks, one combined Telegram digest."""
    log = []
    print(f"[DIAG] run_auto_trade_check() started at {int(time.time()*1000)}", flush=True)

    if os.getenv("TRADING_ENABLED", "true").lower() == "false":
        # TEMPORARY diagnostic (2026-10-30) -- every early-return in this
        # function used to be silent (no print), so when the ONLY log line
        # that showed up was "started", we had no way to tell which of
        # these six gates was the actual stop. Printing the reason at
        # every one closes that blind spot for good.
        print("[DIAG] EXIT: TRADING_ENABLED env var is false", flush=True)
        return {"skipped": True, "reason": "Trading disabled via TRADING_ENABLED env var", "log": log}

    if DRY_RUN:
        log.append("DRY RUN MODE — trades will be simulated, not executed")

    shared_state = get_trader_state()
    auto_active = shared_state.get("autoActive", {})
    if not isinstance(auto_active, dict) or not auto_active.get("isActive"):
        print(f"[DIAG] EXIT: master switch off -- autoActive={auto_active!r}", flush=True)
        return {"skipped": True, "reason": "Auto-trading not active (master switch off)", "log": log}

    tier_active = auto_active.get("tierActive", {})
    if not any(_is_tier_active(tier_active, t) for t in (1, 2, 3)):
        print(f"[DIAG] EXIT: no tiers active -- tierActive={tier_active!r}", flush=True)
        return {"skipped": True, "reason": "No tiers active", "log": log}

    auto_tiers = shared_state.get("autoTiers", shared_state.get("autoTierAssets", {}))
    tier_assignments = shared_state.get("autoTierAssignments", {})
    active_pairs = _build_active_pairs(tier_assignments, tier_active)
    if not active_pairs:
        print(f"[DIAG] EXIT: no active pairs -- tier_assignments keys={list(tier_assignments.keys())}, tierActive={tier_active!r}", flush=True)
        return {"skipped": True, "reason": "No coins assigned to an active tier", "log": log}

    unique_coins = sorted(set(c for c, _ in active_pairs))
    log.append(f"Monitoring {len(active_pairs)} coin-tier combos ({len(unique_coins)} coins): {', '.join(unique_coins)}")
    print(f"[DIAG] {len(active_pairs)} active pairs, {len(unique_coins)} unique coins: {unique_coins}", flush=True)

    rebuy_blocklist, seed_blocklist = _load_rebuy_blocklist(shared_state, log)

    try:
        prices = get_prices_for_coins(unique_coins)
        log.append(f"Prices: {len(prices)} coins fetched")
        print(f"[DIAG] prices fetched for {len(prices)}/{len(unique_coins)} coins", flush=True)
    except Exception as e:
        print(f"[DIAG] EXIT: price fetch raised -- {type(e).__name__}: {e}", flush=True)
        return {"error": f"Price fetch failed: {e}", "log": log}

    # Pool-level avg cost (admin's account only) — same source this file
    # always used, since the pool's trades_collection isn't per-coin
    # ledgered the way user_trades_collection is for everyone else.
    pool_avg_cost_map = {}
    try:
        stats = get_coin_stats()
        for c in stats.get("coins", []) or []:
            coin = c.get("coin")
            avg = float(c.get("avgCost") or 0)
            if coin and avg > 0:
                pool_avg_cost_map[coin] = avg
    except Exception as e:
        log.append(f"Pool avg cost fetch failed (pool sells allowed without guard): {e}")

    # Every connected, auto-trading-enabled wallet — admin's pool account
    # included. (Pre-merge, api/user-trade-cron.py explicitly excluded
    # ADMIN_WALLETS here because this file separately traded that same
    # account with its own key/heartbeat; now there's only one engine, so
    # the exclusion is gone.)
    wallets = list(user_exchange_keys_collection.find({
        "status": "active",
        "autoTradeEnabled": True,
    }))
    print(f"[DIAG] {len(wallets)} wallet doc(s) matched status=active, autoTradeEnabled=True", flush=True)
    if not wallets:
        print("[DIAG] EXIT: no wallets have auto-trading enabled", flush=True)
        return {"skipped": True, "reason": "No wallets have auto-trading enabled", "log": log}

    wallet_contexts = []
    for doc in wallets:
        wallet = doc["walletAddress"]
        short = wallet[:4] + "..." + wallet[-4:]
        is_pool = wallet in ADMIN_WALLETS
        try:
            api_key = decrypt_secret(doc["encryptedApiKey"])
            client = SwyftxClient(api_key)
            holdings = client.get_holdings()
        except SwyftxAuthError as e:
            user_exchange_keys_collection.update_one(
                {"walletAddress": wallet},
                {"$set": {"status": "invalid", "lastError": str(e)}},
            )
            log.append(f"{short}: auth failed — {e}")
            # TEMPORARY diagnostic (2026-10-30): this log line never reaches
            # Vercel's own logs -- it only exists in the HTTP response body,
            # which nobody is reading per-cycle. Printing it too makes a
            # wallet silently dropping out of this cycle actually visible.
            # Remove once the live "why is admin's wallet not persisting
            # updated targets" investigation is closed.
            print(f"[DIAG] {short}: auth failed, excluded this cycle -- {e}", flush=True)
            continue
        except Exception as e:
            log.append(f"{short}: holdings fetch failed — {e}")
            print(f"[DIAG] {short}: holdings fetch failed, excluded this cycle -- {type(e).__name__}: {e}", flush=True)
            continue

        ctx = {"wallet": wallet, "isPool": is_pool, "client": client, "holdings": holdings}
        if is_pool:
            ctx["sharedAutoActive"] = auto_active
            ctx["state"] = {
                "targets": auto_active.get("targets", {}),
                "tradeLog": shared_state.get("autoTradeLog", []),
            }
            ctx["state"]["cooldowns"] = shared_state.get("autoCooldowns", {})
        else:
            ctx["state"] = get_user_trader_state(wallet)
        wallet_contexts.append(ctx)

    if not wallet_contexts:
        print(f"[DIAG] No wallet_contexts at all this cycle ({len(wallets)} opted-in wallet docs found)", flush=True)
        return {"skipped": True, "reason": "No wallet's holdings could be read this cycle", "log": log}

    print(f"[DIAG] wallet_contexts this cycle: {[c['wallet'][:8] for c in wallet_contexts]}", flush=True)

    now_ms = int(time.time() * 1000)
    code_to_id_box = {"map": None}
    results = []
    all_trades = []
    for ctx in wallet_contexts:
        try:
            result = _run_one_wallet(ctx, active_pairs, auto_tiers, prices, rebuy_blocklist, pool_avg_cost_map, now_ms, log, code_to_id_box)
        except Exception as e:
            # One wallet's unexpected failure never stops the rest.
            log.append(f"{ctx['wallet'][:8]}: unexpected error — {e}")
            # TEMPORARY diagnostic (2026-10-30) -- see matching comment
            # above. After the per-coin try/except fix, the ONLY thing
            # left inside _run_one_wallet that can still raise all the way
            # out here is the final save_trader_state()/
            # save_user_trader_state() call itself -- so if this prints,
            # that is almost certainly where it is failing.
            print(f"[DIAG] {ctx['wallet'][:8]} ({'pool' if ctx['isPool'] else 'user'}): "
                  f"unexpected error -- {type(e).__name__}: {e}", flush=True)
            print(f"[DIAG] {ctx['wallet'][:8]} traceback:\n{traceback.format_exc()}", flush=True)
            result = {"wallet": ctx["wallet"], "isPool": ctx["isPool"], "error": str(e)}
        results.append(result)
        all_trades.extend(result.get("trades", []))

    # Only write the blocklist when seeding the default the first time —
    # never on later runs, so admin edits in the DB are preserved.
    if seed_blocklist:
        save_trader_state({"autoRebuyBlocklist": rebuy_blocklist})

    if all_trades:
        send_telegram(_format_digest(all_trades))

    log.append(f"Done: {len(all_trades)} trade(s) across {len(wallet_contexts)} wallet(s)")

    return {
        "walletsProcessed": len(wallet_contexts),
        "walletsOptedIn": len(wallets),
        "tradesExecuted": len(all_trades),
        "dryRun": DRY_RUN,
        "results": results,
        "log": log,
    }

# ── Vercel Handler ────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        cron_secret = os.getenv("CRON_SECRET")
        if cron_secret:
            auth = self.headers.get("Authorization", "")
            if auth != f"Bearer {cron_secret}":
                self._send_json(401, {"error": "Unauthorized"})
                return

        try:
            result = run_auto_trade_check()
            self._send_json(200, result)
        except Exception as e:
            print(f"Auto-trade cron error: {e}")
            self._send_json(500, {"error": str(e)})

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode())

    def log_message(self, format, *args):
        # Suppress default access logs
        pass
