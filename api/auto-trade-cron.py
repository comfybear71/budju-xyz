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

from coin_sizing import size_buy
from trailing import clean_config as _trail_cfg, decide_all as _trail_decide, sale_reason, arm_message
from coin_cap import recent_buys, day_budget, check_room
from t1_sell_reset import follows_buy as t1_follows_buy
from buy_order import order_pairs, underweight_buckets, shit_list, group_of, SHIT_LIST_MAX_BUY
from profit_plan import PLAN_VERSION, DEFAULT_PLAN, plan_for, size_sell, sane_sell

DEFAULT_ARMS = {str(t): DEFAULT_PLAN[t]["arm"] for t in (1, 2, 3)}
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
    _is_transient_swyftx_error,
    _mark_key_valid,
    get_daily_limits_for,
    get_coin_ranks,
    get_coin_priority,
)
from trade_guards import (
    DEFAULT_REBUY_BLOCKLIST,
    REBUY_LEGACY_EXPIRY,
    is_permanently_buy_denied,
    is_rebuy_blocked,
    sell_below_min,
)
from swyftx_client import SwyftxClient, SwyftxAuthError
from bot_status import record_cron_status
from trade_digest import format_digest, split_message

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
# Trade COUNT limit is off (0): one top-up can fire dozens of small buys. The dollar limit below is the daily protection.
MAX_DAILY_TRADES = 0
# How many recent trades each wallet keeps in its log. The daily buying limit is counted from this log, so it must be
# long enough to hold a whole big day (it used to be 50, which a single large top-up could overflow).
TRADE_LOG_KEEP = 500
# A run stops PLACING new orders after this many seconds, then saves, counts and reports what it did; whatever is left
# continues on the next 5-minute run. (A 22-buy run once ran past the server's time limit and was cut off before saving
# anything.) Orders take roughly 8 seconds each, so 150 seconds is about 18 buys per run.
RUN_BUDGET_SECONDS = float(os.getenv("CRON_TRADE_BUDGET_SECONDS", "150") or 150)
_RUN_STARTED = 0.0
# Most one wallet may BUY in any rolling 24 hours (USDC). Protects every wallet in a crash.
# Change it in Vercel (MAX_DAILY_SPEND_USDC); 0 switches the limit off.
MAX_DAILY_SPEND_USDC = float(os.getenv("MAX_DAILY_SPEND_USDC", "3000"))
MAX_DAILY_LOSS_USDC = float(os.getenv("MAX_DAILY_LOSS_USDC", "1000"))

# Targets are NEVER discarded because of age. A target only changes after a
# trade on that coin/tier, or when it is missing/invalid. (A 48h "stale"
# reset used to live here; after a bot outage it wiped every target that had
# already been crossed, so the buys/sells that were due never fired.)

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

def _over_budget():
    return _RUN_STARTED > 0 and (time.time() - _RUN_STARTED) > RUN_BUDGET_SECONDS


def _save_trade_log(ctx, trade_log):
    """Save this wallet's trade log right after an order, so a cut-off run never loses it (the daily limit counts from it)."""
    try:
        if ctx["isPool"]:
            save_trader_state({"autoTradeLog": trade_log})
        else:
            save_user_trader_state(ctx["wallet"], {"tradeLog": trade_log})
    except Exception as e:
        print(f"[cron] could not save trade log after an order: {type(e).__name__}: {e}", flush=True)


def _p(n):
    """Compact price text for the plain-English reasons shown on the coin cards."""
    n = float(n or 0)
    return f"${n:,.2f}" if n >= 1 else f"${n:.4f}"


def send_telegram(text):
    """Send a Telegram message (best-effort, non-blocking). Splits at line
    boundaries if it is over Telegram's length cap."""
    if not TELEGRAM_BOT_TOKEN:
        return
    for chunk in split_message(text):
        try:
            req = Request(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                data=json.dumps({
                    "chat_id": TELEGRAM_CHAT_ID,
                    "text": chunk,
                    "parse_mode": "HTML",
                }).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urlopen(req, timeout=10)
            time.sleep(1.1)        # Telegram allows about one message per second to a chat
        except Exception as e:
            # Non-critical for trading, but never silent: a dropped digest looked like "no trades" before.
            detail = ""
            try:
                detail = e.read().decode()[:200]
            except Exception:
                pass
            print(f"[telegram] digest piece NOT delivered: {type(e).__name__}: {e} {detail}", flush=True)
            if "429" in str(e):
                time.sleep(3)


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


_PLAN_OVERRIDE = None     # saved profit-plan overrides for the current run (see profit_plan.py)


def _tier_settings(tier_assets, tier_num):
    """Get deviation/allocation/cooldown for a tier from the shared admin "Auto Trade" screen, with defaults.
    The profit-taking side (arm level, trailing pullback, slice size) comes from the profit plan, not from the old
    sell-deviation slider."""
    key = f"tier{tier_num}"
    db_settings = tier_assets.get(key, {}) if isinstance(tier_assets, dict) else {}
    default_dev = 1.0 if tier_num == 1 else 2.0
    default_sell_dev = default_dev * 2
    plan = plan_for(tier_num, _PLAN_OVERRIDE)
    return {
        "deviation": float(db_settings.get("deviation", default_dev)),
        "sellDeviation": plan["arm"],
        "legacySellDeviation": float(db_settings.get("sellDeviation", default_sell_dev)),
        "trailPct": plan["trail"],
        "slicePct": plan["slice"],
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


def _target_is_valid(tgt):
    """A stored target is usable if it has positive numeric buy and sell
    prices. Age and a missing "setAt" are irrelevant."""
    if not isinstance(tgt, dict):
        return False
    try:
        return float(tgt.get("buy", 0)) > 0 and float(tgt.get("sell", 0)) > 0
    except (TypeError, ValueError):
        return False


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

PAUSE_UNTRADABLE_HOURS = float(os.getenv("PAUSE_UNTRADABLE_HOURS", "6"))


def _is_account_blocked(err) -> bool:
    """The whole Swyftx account is restricted from buying (e.g. after a password / API-key change) — every coin will fail the same way."""
    t = str(err or "").lower()
    return "cannotbuycrypto" in t or "restrictions on your account" in t


def _is_rate_limited(err) -> bool:
    t = str(err or "").lower()
    return "ratelimit" in t or "http 429" in t or "too many times" in t


ACCOUNT_BLOCK_HOURS = float(os.getenv("ACCOUNT_BLOCK_HOURS", "2"))


def _is_untradable(err) -> bool:
    """Swyftx says a coin is switched off right now (maintenance, network work, delisting review)."""
    t = str(err or "").lower()
    return "not presently tradable" in t or "asseterror" in t or "asset not tradable" in t


# ── Circuit Breakers ─────────────────────────────────────────

def _check_circuit_breakers(trade_log, side, amount_usdc, code, log, daily_spend_limit=None):
    """Check circuit breakers before executing a trade, scoped to ONE
    wallet's own trade log. Returns (allowed: bool, reason: str or None)."""
    if amount_usdc > MAX_SINGLE_TRADE_USDC:
        reason = f"Trade ${amount_usdc:.2f} exceeds MAX_SINGLE_TRADE_USDC (${MAX_SINGLE_TRADE_USDC:.2f})"
        log.append(f"{code}: BLOCKED — {reason}")
        return False, reason

    cutoff_ms = int(time.time() * 1000) - (24 * 3_600_000)
    recent_trades = 0
    daily_sell_total = 0.0
    daily_buy_total = 0.0
    for entry in trade_log:
        ts = entry.get("timestamp") or entry.get("time") or ""
        try:
            entry_time = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            entry_ms = int(entry_time.timestamp() * 1000)
        except (ValueError, AttributeError, TypeError):
            continue
        if entry_ms > cutoff_ms:
            recent_trades += 1
            value = float(entry.get("qty", entry.get("quantity", 0)) or 0) * float(entry.get("price", 0) or 0)
            if str(entry.get("side", "")).lower() == "sell":
                daily_sell_total += value
            elif str(entry.get("side", "")).lower() == "buy":
                daily_buy_total += value

    if MAX_DAILY_TRADES > 0 and recent_trades >= MAX_DAILY_TRADES:
        reason = f"Hit MAX_DAILY_TRADES limit ({MAX_DAILY_TRADES} trades in 24h)"
        log.append(f"{code}: BLOCKED — {reason}")
        return False, reason

    spend_limit = daily_spend_limit if daily_spend_limit else MAX_DAILY_SPEND_USDC
    if side == "buy" and spend_limit > 0 and (daily_buy_total + amount_usdc) > spend_limit:
        reason = (f"Daily buying limit: ${daily_buy_total:.0f} already bought in 24h, this ${amount_usdc:.0f} would pass "
                  f"this wallet's daily limit (${spend_limit:.0f})")
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

def _real_fill(client, est_qty, usdc_amount, est_price):
    """(qty, price) for the order just placed. Uses the quantity Swyftx
    actually filled when the client could read it (then price = USDC value
    / real qty, i.e. the true effective price incl. spread/fee); otherwise
    the estimate."""
    fill = getattr(client, "last_fill", None)
    if isinstance(fill, dict) and fill.get("qty", 0) > 0:
        qty = round(float(fill["qty"]), 8)
        return qty, usdc_amount / qty
    return est_qty, est_price


# ── Per-Wallet Trading Cycle ─────────────────────────────────

def _run_one_wallet(ctx, active_pairs, auto_tiers, prices, rebuy_blocklist, pool_avg_cost_map, now_ms, log, code_to_id_box):
    wallet = ctx["wallet"]
    short = "pool" if ctx["isPool"] else (wallet[:4] + "..." + wallet[-4:])
    holdings = ctx["holdings"]
    state = ctx["state"]
    sold_this_run = set()
    reasons = ctx.setdefault("reasons", {}) if ctx["isPool"] else {}     # why a waiting buy did NOT happen (shown on the coin cards)

    # Buys are paid from USDC only (swyftx_client.place_market_order), so the $30 reserve and the
    # buy sizing must look at USDC alone — AUD/USD/USDT can't fund an order.
    usdc_balance = float(holdings.get("USDC", 0.0) or 0.0)
    # ONE set of targets and cooldowns for every wallet — the ones on the
    # admin Auto Trade screen. Read-only here: a trade is recorded in
    # ctx["fired"] and the shared target is ratcheted ONCE after every wallet
    # has had its turn (see run_auto_trade_check), so wallets can't change
    # each other's price mid-cycle.
    targets = ctx["sharedTargets"]
    cooldowns = ctx["sharedCooldowns"]
    fired = ctx["fired"]
    catchup_limits = ctx.get("catchupLimits", {})
    catchup_done = []
    trade_log = state.get("tradeLog", [])
    # Group shares + per-coin limits (api/coin_cap.py), counted against the day's money: cash now + bought in the last 24h.
    day_money = day_budget(usdc_balance, recent_buys(trade_log, now_ms))
    _rank_map = ctx.get("ranks") if isinstance(ctx.get("ranks"), dict) else {}
    _group = lambda c: group_of(c, _rank_map.get(c))
    # Deepest discount first, so limited cash goes to the biggest bargains.
    try:
        _info = dict(ctx.get("priorityInfo") or {})
        _info["buckets"] = underweight_buckets(holdings, prices)
    except Exception as e:
        print(f"[order] could not weigh holdings, ordering without it: {e}", flush=True)
        _info = ctx.get("priorityInfo") or {}
    careful_coins = shit_list((ctx.get("priorityInfo") or {}).get("careful"))
    active_pairs = order_pairs(active_pairs, prices, targets, ctx.get("ranks"), _info)

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
        if _over_budget():
            ctx["budgetHit"] = True
            log.append(f"{short}: time limit for this run reached — the rest carries on next run")
            break
        if code in ctx.get("newPauses", ()):
            continue        # Swyftx just refused this coin: don't hit it again for its other tiers this cycle
        try:
            ck = f"{code}:{tier_num}"
            cooldown_expiry = cooldowns.get(ck, cooldowns.get(code, 0))
            on_cooldown = isinstance(cooldown_expiry, (int, float)) and cooldown_expiry > now_ms

            settings = _tier_settings(auto_tiers, tier_num)
            current_price = prices.get(code, 0)
            if current_price <= 0:
                continue

            # One-time catch-up (api/catchup_buys.py): this wallet missed a buy
            # the admin wallet already made at this signal. It may buy ONCE
            # more, but only while the price is still at/below that signal's
            # original target, and it ignores the (already running) shared
            # cooldown. It never moves the shared target.
            catchup_limit = catchup_limits.get(ck)
            catchup_buy = catchup_limit is not None and current_price <= catchup_limit

            if on_cooldown and not catchup_buy:
                continue

            tgt = targets.get(ck) or targets.get(code)
            if not _target_is_valid(tgt):
                continue  # created once, up front, by run_auto_trade_check

            buy_target = float(tgt.get("buy", 0))
            sell_target = float(tgt.get("sell", 0))
            normal_buy = (not on_cooldown) and current_price <= buy_target
            if not on_cooldown and current_price > buy_target and current_price <= buy_target * 1.15:
                reasons[ck] = f"Bot's price {_p(current_price)} hasn't reached the buy price {_p(buy_target)} yet"

            # ── BUY ──
            if (normal_buy or catchup_buy) and ctx.get("buysBlocked"):
                reasons[ck] = "Buys on hold: Swyftx restricted this account or is rate-limiting. It retries automatically"
                continue        # account restricted / rate limited: don't hammer Swyftx with more orders this cycle
            if normal_buy or catchup_buy:
                if is_permanently_buy_denied(code):
                    reasons[ck] = "On the permanent no-buy list"
                    if code not in _blocklist_logged:
                        log.append(f"{code}: BUY skipped — permanent buy denylist")
                        _blocklist_logged.add(code)
                    continue
                if is_rebuy_blocked(rebuy_blocklist, code, datetime.utcnow()):
                    reasons[ck] = f"Rebuy block until {rebuy_blocklist.get(code)}"
                    if code not in _blocklist_logged:
                        log.append(f"{code}: BUY skipped — rebuy blocklist until {rebuy_blocklist.get(code)}")
                        _blocklist_logged.add(code)
                    continue

                # No deployable-capital cap — every wallet sizes off its own
                # real balance, uncapped, every wallet and every trade equal.
                trade_amount = max((settings["allocation"] / 100) * usdc_balance, MIN_ORDER_USDC)
                sizing = ctx.get("sizing")
                if sizing:
                    held_usd = holdings.get(code, 0.0) * current_price
                    trade_amount, why = size_buy(
                        (settings["allocation"] / 100) * usdc_balance,
                        (sizing.get("classes") or {}).get(code), held_usd, sizing.get("capUsd", 0), MIN_ORDER_USDC,
                    )
                    if trade_amount <= 0:
                        reasons[ck] = f"Skipped: {why}"
                        note = f"{code}:{why}"
                        if note not in _blocklist_logged:
                            log.append(f"{short}: BUY {code} skipped — {why}")
                            _blocklist_logged.add(note)
                        continue
                if code in careful_coins:
                    trade_amount = round(max(min(trade_amount, SHIT_LIST_MAX_BUY), MIN_ORDER_USDC), 2)    # shit-list coin: small buys only
                if trade_amount > MAX_SINGLE_TRADE_USDC:
                    # A buy over the single-order limit is made AT the limit, not skipped.
                    trade_amount = round(MAX_SINGLE_TRADE_USDC, 2)
                if day_money > 0:
                    room, why_not = check_room(code, _group, recent_buys(trade_log, now_ms), day_money)
                    if why_not or room < MIN_ORDER_USDC:
                        reasons[ck] = why_not or f"Coin/group limit: only ${room:,.2f} of room left, below the ${MIN_ORDER_USDC} minimum buy"
                        continue
                    trade_amount = round(max(min(trade_amount, room), MIN_ORDER_USDC), 2)
                if usdc_balance - trade_amount < MIN_USDC_RESERVE:
                    reasons[ck] = f"Waiting for cash: USDC {_p(usdc_balance)}, this buy needs {_p(trade_amount)} and ${MIN_USDC_RESERVE:.0f} is kept spare"
                    note = f"{short}:lowusdc"
                    if note not in _blocklist_logged:
                        log.append(f"{short}: BUY {code} skipped — USDC ${usdc_balance:.2f} would drop below the ${MIN_USDC_RESERVE:.0f} reserve")
                        _blocklist_logged.add(note)
                    continue

                cb_ok, cb_reason = _check_circuit_breakers(trade_log, "buy", trade_amount, code, log, ctx.get("dailyLimit"))
                if not cb_ok:
                    reasons[ck] = f"Daily limit: {cb_reason}"
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

                est_qty = round(trade_amount / current_price, 8)
                ok, order_id, err = ctx["client"].place_market_order(code, "buy", trade_amount, code_to_id_box["map"], expected_qty=est_qty)
                if ok:
                    quantity, fill_price = _real_fill(ctx["client"], est_qty, trade_amount, current_price)
                    _record_trade_ledger(ctx, code, "buy", quantity, fill_price, tier_num, order_id, log)

                    if normal_buy:
                        _new_fire = ck not in fired
                        fired.setdefault(ck, {"side": "buy", "price": current_price, "settings": settings})
                        if _new_fire and ctx.get("persistFired"):
                            ctx["persistFired"]()
                    if catchup_buy:
                        catchup_done.append(ck)
                        # Remember it IMMEDIATELY (not at the end of the cycle),
                        # so a timeout mid-cycle can never repeat a placed buy.
                        on_catchup = ctx.get("onCatchupBuy")
                        if on_catchup:
                            on_catchup(wallet, ck)

                    trade_log.insert(0, {
                        "coin": code, "side": "buy", "qty": quantity, "price": fill_price,
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    })
                    trade_log = trade_log[:TRADE_LOG_KEEP]
                    _save_trade_log(ctx, trade_log)

                    usdc_balance -= trade_amount
                    holdings[code] = holdings.get(code, 0.0) + quantity   # keeps the position cap honest within this cycle
                    log.append(f"{short}: BUY {code} ${trade_amount:.2f} @ ${fill_price:.4f}")
                    trades_this_wallet.append({
                        "wallet": wallet, "isPool": ctx["isPool"], "coin": code, "side": "BUY", "tier": tier_num,
                        "amount": round(trade_amount, 2), "price": round(fill_price, 8), "qty": quantity,
                    })
                else:
                    log.append(f"{short}: BUY {code} failed — {err}")
                    reasons[ck] = f"Swyftx refused the order: {str(err)[:80]}"
                    if _is_untradable(err):
                        ctx.setdefault("newPauses", set()).add(code)
                    elif _is_account_blocked(err):
                        ctx["buysBlocked"] = True
                        ctx["newBlock"] = ACCOUNT_BLOCK_HOURS
                        log.append(f"{short}: buys paused for {ACCOUNT_BLOCK_HOURS:g}h — Swyftx says this account has trading restrictions")
                    elif _is_rate_limited(err):
                        ctx["buysBlocked"] = True
                        log.append(f"{short}: buys paused this cycle — Swyftx rate limit")

            # ── SELL ──
            elif current_price >= sell_target or ((ctx.get("trailDecisions") or {}).get(ck) == "sell"):
                # (the second condition: an armed signal that ran up and has now fallen back under its sell level is still
                # sold on the pullback — before, such a coin was never sold until it climbed above the level again)
                trail = ctx.get("trailDecisions")
                if trail is not None and trail.get(ck) != "sell":
                    continue        # trailing take-profit: past its sell level, letting it run until it pulls back
                avg_cost, position_cap = _sell_guard_inputs(ctx, code, pool_avg_cost_map)
                if avg_cost > 0 and current_price < avg_cost:
                    log.append(f"{short}: {code} hit sell target but price ${current_price:.2f} < avg cost ${avg_cost:.2f} — SELL BLOCKED")
                    continue
                if position_cap <= 0:
                    continue

                if code in sold_this_run:
                    continue        # one sale per coin per run: the other tiers get their turn on a later run

                quantity, note = size_sell(settings["slicePct"], position_cap, current_price, SWYFTX_MIN_SELL_USDC)
                if quantity is None or quantity <= 0:
                    if code not in _minsell_logged:
                        log.append(f"{code}: SELL skipped — {note}")
                        _minsell_logged.add(code)
                    continue
                sell_value = quantity * current_price

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

                ok, order_id, err = ctx["client"].place_market_order(code, "sell", sell_value, code_to_id_box["map"], expected_qty=quantity)
                if ok:
                    quantity, fill_price = _real_fill(ctx["client"], quantity, sell_value, current_price)
                    _record_trade_ledger(ctx, code, "sell", quantity, fill_price, tier_num, order_id, log)

                    _new_fire = ck not in fired
                    fired.setdefault(ck, {"side": "sell", "price": current_price, "settings": settings})
                    if _new_fire and ctx.get("persistFired"):
                        ctx["persistFired"]()
                    sold_this_run.add(code)
                    if ctx["isPool"]:
                        holdings[code] = max(0.0, holdings.get(code, 0.0) - quantity)   # later tiers this run see what is really left

                    try:
                        _why = sale_reason(ctx.get("trailMode", "off"), (ctx.get("trailInfo") or {}).get(ck),
                                           (ctx.get("trailPullbacks") or {}).get(ck, settings.get("trailPct", 5.0)), current_price, sell_target, note)
                    except Exception:
                        _why = ""
                    trade_log.insert(0, {
                        "coin": code, "side": "sell", "qty": quantity, "price": fill_price,
                        "timestamp": datetime.utcnow().isoformat() + "Z", "why": _why,
                    })
                    trade_log = trade_log[:TRADE_LOG_KEEP]
                    _save_trade_log(ctx, trade_log)

                    log.append(f"{short}: SELL {code} ${sell_value:.2f} @ ${fill_price:.4f}")
                    trades_this_wallet.append({
                        "wallet": wallet, "isPool": ctx["isPool"], "coin": code, "side": "SELL", "tier": tier_num,
                        "amount": round(sell_value, 2), "price": round(fill_price, 8), "qty": quantity, "why": _why,
                    })
                else:
                    log.append(f"{short}: SELL {code} failed — {err}")
                    if _is_untradable(err):
                        ctx.setdefault("newPauses", set()).add(code)
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
    print(f"[DIAG] {short}: reached save step", flush=True)

    # Persist this wallet's own trade log only. Targets and cooldowns are
    # shared and saved once per cycle by run_auto_trade_check().
    if ctx["isPool"]:
        save_trader_state({"autoTradeLog": trade_log})
    else:
        save_user_trader_state(wallet, {"tradeLog": trade_log})

    print(f"[DIAG] {short}: save_trader_state()/save_user_trader_state() returned without raising", flush=True)

    return {"wallet": wallet, "isPool": ctx["isPool"], "trades": trades_this_wallet, "catchupDone": catchup_done}

# ── Main Entry Point ─────────────────────────────────────────

def run_auto_trade_check():
    global _RUN_STARTED
    _RUN_STARTED = time.time()
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

    global _PLAN_OVERRIDE
    _PLAN_OVERRIDE = shared_state.get("autoProfitPlan")
    auto_tiers = shared_state.get("autoTiers", shared_state.get("autoTierAssets", {}))
    tier_assignments = shared_state.get("autoTierAssignments", {})
    active_pairs = _build_active_pairs(tier_assignments, tier_active)
    _now_ms = int(time.time() * 1000)
    paused = {c: u for c, u in (shared_state.get("autoPausedAssets") or {}).items() if isinstance(u, (int, float)) and u > _now_ms}
    skipped_reasons = {}
    if paused:
        for _c, _t in active_pairs:
            if _c in paused:
                skipped_reasons[f"{_c}:{_t}"] = "Paused: Swyftx says it isn't tradable right now. Retries automatically"
        active_pairs = [(c, t) for c, t in active_pairs if c not in paused]
        log.append(f"Paused (Swyftx says not tradable right now): {', '.join(sorted(paused))}")
    # Coins Swyftx doesn't list are never looked at: retire them (list is cached), then skip every retired coin.
    try:
        from database import retire_unlisted_coins, retired_coin_codes
        gone = retire_unlisted_coins()
        if gone:
            log.append(f"Switched off (not on Swyftx): {', '.join(gone)}")
        dead = retired_coin_codes()
        for _c, _t in active_pairs:
            if _c in dead:
                skipped_reasons[f"{_c}:{_t}"] = "Not listed on Swyftx"
        active_pairs = [(c, t) for c, t in active_pairs if c not in dead]
    except Exception as e:
        print(f"[cron] unlisted-coin purge error: {e}", flush=True)
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
        # "invalid" is included on purpose: this cron used to flip a wallet
        # to "invalid" on ANY Swyftx hiccup (429, 5xx, degraded asset list),
        # which then dropped it from this query forever. Retrying them
        # lets a wrongly-flagged wallet self-heal on its next good fetch.
        "status": {"$in": ["active", "invalid"]},
        "autoTradeEnabled": True,
    }))
    print(f"[DIAG] {len(wallets)} wallet doc(s) matched status=active, autoTradeEnabled=True", flush=True)
    if not wallets:
        print("[DIAG] EXIT: no wallets have auto-trading enabled", flush=True)
        return {"skipped": True, "reason": "No wallets have auto-trading enabled", "log": log}

    try:
        from daily_limit import effective_limit
        _saved_limits = {w: effective_limit(v) for w, v in get_daily_limits_for([d["walletAddress"] for d in wallets]).items()}
    except Exception as e:
        print(f"[daily-limit] could not load wallet limits, using the default: {e}", flush=True)
        _saved_limits = {}
    wallet_contexts = []
    for doc in wallets:
        wallet = doc["walletAddress"]
        short = wallet[:4] + "..." + wallet[-4:]
        is_pool = wallet in ADMIN_WALLETS
        try:
            api_key = decrypt_secret(doc["encryptedApiKey"])
            client = SwyftxClient(api_key)
            holdings = client.get_holdings()
            if doc.get("status") != "active":
                _mark_key_valid(wallet)
        except SwyftxAuthError as e:
            # Only a genuine 401/403 proves the key is bad. Rate limits,
            # 5xx and degraded replies just skip this wallet for one cycle.
            update = {"lastError": str(e)}
            if not _is_transient_swyftx_error(e):
                update["status"] = "invalid"
            user_exchange_keys_collection.update_one(
                {"walletAddress": wallet},
                {"$set": update},
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
        _blocked_until = (shared_state.get("autoBlockedWallets") or {}).get(wallet, 0)
        if isinstance(_blocked_until, (int, float)) and _blocked_until > time.time() * 1000:
            ctx["buysBlocked"] = True          # restricted earlier: no buy attempts until the pause ends (sells still run)
            log.append(f"{short}: buys on hold — Swyftx account restricted, retrying after {datetime.utcfromtimestamp(_blocked_until / 1000).strftime('%H:%M')} UTC")
        # Only each wallet's own TRADE LOG is per-wallet (daily-trade limit and
        # the "just traded" pause). Targets and cooldowns are shared by all.
        if is_pool:
            ctx["state"] = {"tradeLog": shared_state.get("autoTradeLog", [])}
        else:
            ctx["state"] = get_user_trader_state(wallet)
        ctx["dailyLimit"] = _saved_limits.get(wallet)
        wallet_contexts.append(ctx)

    if not wallet_contexts:
        print(f"[DIAG] No wallet_contexts at all this cycle ({len(wallets)} opted-in wallet docs found)", flush=True)
        return {"skipped": True, "reason": "No wallet's holdings could be read this cycle", "log": log}

    print(f"[DIAG] wallet_contexts this cycle: {[c['wallet'][:8] for c in wallet_contexts]}", flush=True)

    now_ms = int(time.time() * 1000)
    code_to_id_box = {"map": None}
    results = []
    all_trades = []

    # ── ONE set of targets/cooldowns for every wallet ──
    # Missing/invalid targets are created once, here, off the current price.
    shared_targets = dict(auto_active.get("targets") or {})
    shared_cooldowns = dict(shared_state.get("autoCooldowns") or {})
    for code, tier_num in active_pairs:
        ck = f"{code}:{tier_num}"
        price = prices.get(code, 0)
        if price > 0 and not _target_is_valid(shared_targets.get(ck) or shared_targets.get(code)):
            st = _tier_settings(auto_tiers, tier_num)
            shared_targets[ck] = {
                "buy": price * (1 - st["deviation"] / 100),
                "sell": price * (1 + st["sellDeviation"] / 100),
                "setAt": now_ms,
            }
            shared_targets.pop(code, None)
    # One-time move to the staggered profit plan: re-anchor every existing sell level from its old +% to the tier's new arm level
    # (same reference price, new distance), so the plan takes effect without anyone touching a slider.
    # (also remembered at the top level, outside autoActive, so no writer of autoActive can make the bot forget it already did this)
    plan_done = auto_active.get("planVersion") == PLAN_VERSION or shared_state.get("autoPlanVersion") == PLAN_VERSION
    if not plan_done:
        moved = 0
        for ck, tgt in list(shared_targets.items()):
            try:
                tier_num = int(str(ck).split(":")[1])
                st = _tier_settings(auto_tiers, tier_num)
                old_sell = float(tgt.get("sell", 0) or 0)
                if old_sell > 0 and st["legacySellDeviation"] > -100:
                    ref = old_sell / (1 + st["legacySellDeviation"] / 100)
                    shared_targets[ck] = {**tgt, "sell": ref * (1 + st["sellDeviation"] / 100)}
                    moved += 1
            except (IndexError, ValueError, TypeError):
                continue
        if moved:
            log.append(f"Profit plan v{PLAN_VERSION}: re-anchored {moved} sell levels (arm +12.5% / +30% / +75%)")
    # When an arm level is changed on the Tier screen, move that tier's existing sell levels the same way (same reference, new distance).
    applied_arms = auto_active.get("planArms") if isinstance(auto_active.get("planArms"), dict) else (shared_state.get("autoPlanArms") if isinstance(shared_state.get("autoPlanArms"), dict) else {})
    current_arms = {str(t): plan_for(t, _PLAN_OVERRIDE)["arm"] for t in (1, 2, 3)}
    changed = {t: (float(applied_arms.get(t, DEFAULT_ARMS[t])), current_arms[t]) for t in current_arms if abs(float(applied_arms.get(t, DEFAULT_ARMS[t])) - current_arms[t]) > 1e-9}
    if changed and plan_done:
        shifted = 0
        for ck, tgt in list(shared_targets.items()):
            try:
                t = str(ck).split(":")[1]
                if t in changed and float(tgt.get("sell", 0) or 0) > 0:
                    old_arm, new_arm = changed[t]
                    ref = float(tgt["sell"]) / (1 + old_arm / 100)
                    shared_targets[ck] = {**tgt, "sell": ref * (1 + new_arm / 100)}
                    shifted += 1
            except (IndexError, ValueError, TypeError):
                continue
        if shifted:
            log.append(f"Profit plan: arm level changed — moved {shifted} sell levels ({', '.join(f'T{t}: +{a:g}% → +{b:g}%' for t, (a, b) in sorted(changed.items()))})")
    # Safety net: a sell level far beyond anything the plan could produce is a corrupted value; put it back to a sensible one.
    try:
        _fixed = []
        for _ck, _tgt in list(shared_targets.items()):
            _coin, _, _tn = str(_ck).partition(":")
            if not _tn.isdigit() or not isinstance(_tgt, dict):
                continue
            _st = _tier_settings(auto_tiers, int(_tn))
            _fix = sane_sell(_tgt.get("sell", 0), prices.get(_coin, 0), _tgt.get("buy", 0), _st["deviation"], _st["sellDeviation"])
            if _fix:
                _fixed.append(f"{_ck} ${float(_tgt.get('sell', 0)):,.0f} -> ${_fix:,.2f}")
                shared_targets[_ck] = {**_tgt, "sell": _fix}
        if _fixed:
            log.append(f"Sell levels corrected ({len(_fixed)}): " + "; ".join(_fixed[:8]) + (" …" if len(_fixed) > 8 else ""))
    except Exception as e:
        print(f"[cron] sell-level check skipped: {type(e).__name__}: {e}", flush=True)
    fired = {}  # "BTC:1" -> {"side", "price", "settings"} — ratcheted once, after all wallets

    # One-time catch-up for wallets that missed buys the admin wallet already
    # made (see api/catchup_buys.py). Pool/admin wallet is never part of it.
    catchup = shared_state.get("autoCatchUp")
    catchup_active = isinstance(catchup, dict) and now_ms < (catchup.get("expiresAt") or 0)
    catchup_done_map = {w: list(v) for w, v in ((catchup or {}).get("done") or {}).items()} if catchup_active else {}

    def _persist_catchup(wallet, ck):
        catchup_done_map.setdefault(wallet, []).append(ck)
        try:
            save_trader_state({"autoCatchUp": {**catchup, "done": catchup_done_map}})
        except Exception as e:
            print(f"[catchup] could not save progress for {wallet[:8]} {ck}: {e}", flush=True)

    # Coin-class sizing + per-coin position cap (admin switch, ships OFF). Any
    # problem here simply means "no sizing" — the original behaviour.
    try:
        from database import get_sizing_runtime
        sizing = get_sizing_runtime()
    except Exception as e:
        sizing = None
        print(f"[sizing] unavailable: {e}", flush=True)

    # Trailing take-profit (admin switch, ships OFF): decided ONCE per cycle for each signal, shared by every wallet.
    trail_cfg = _trail_cfg(shared_state.get("autoTrailingConfig"))
    trail_decisions, trail_state_new = None, {}
    old_trail_state = dict(shared_state.get("autoTrail") or {})
    pullbacks = {}
    trail_mode = "on" if trail_cfg["enabled"] else "off"          # why a sale happened is reported from this
    if trail_cfg["enabled"]:
        try:
            pullbacks = {f"{c}:{t}": _tier_settings(auto_tiers, t)["trailPct"] for c, t in active_pairs}
            trail_decisions, trail_state_new = _trail_decide(active_pairs, prices, shared_targets, old_trail_state, trail_cfg, now_ms, pullbacks)
        except Exception as e:
            trail_decisions, trail_state_new = None, {}
            trail_mode = "error"
            print(f"[trailing] unavailable this cycle: {e}", flush=True)
    # Tell the group when a coin has just reached its sell level and the trailing stop starts watching it.
    try:
        _newly = [ck for ck in trail_state_new if ck not in old_trail_state]
        if _newly:
            send_telegram(arm_message(_newly, trail_state_new, pullbacks, trail_cfg["pullbackPct"]))
    except Exception as e:
        print(f"[trailing] arm message skipped: {e}", flush=True)

    repairs_done = dict(shared_state.get("autoRepairs") if isinstance(shared_state.get("autoRepairs"), dict) else {})
    # One-time repair: mark the buys that were placed but never recorded as "just bought" (see api/repair_unsaved_buys.py).
    try:
        from repair_unsaved_buys import REPAIR_ID, UNSAVED_BUYS, apply_repair
        _done = repairs_done
        if UNSAVED_BUYS and REPAIR_ID not in _done:
            _t, _cd, _applied, _skipped = apply_repair(UNSAVED_BUYS, shared_targets, shared_cooldowns,
                                                       lambda tn: _tier_settings(auto_tiers, tn), now_ms)
            shared_targets.clear(); shared_targets.update(_t)
            shared_cooldowns.clear(); shared_cooldowns.update(_cd)
            save_trader_state({"autoActive": {**auto_active, "targets": shared_targets, "planVersion": PLAN_VERSION, "planArms": current_arms},
                               "autoPlanVersion": PLAN_VERSION, "autoPlanArms": current_arms,
                               "autoCooldowns": shared_cooldowns, "autoRepairs": {**_done, REPAIR_ID: now_ms}})
            repairs_done[REPAIR_ID] = now_ms
            log.append(f"Repair {REPAIR_ID}: marked {len(_applied)} signal(s) as just bought"
                       + (f" ({len(_skipped)} left alone: {', '.join(c for c, _ in _skipped)})" if _skipped else ""))
    except Exception as e:
        print(f"[cron] repair step failed (trading continues): {type(e).__name__}: {e}", flush=True)

    # One-time: Tier 1 sell levels back to (reference price) x (1 + arm%), see api/t1_sell_reset.py
    try:
        import t1_sell_reset as _t1
        if _t1.ENABLED and _t1.RESET_ID not in repairs_done:
            _new_t, _changed = _t1.apply_reset(shared_targets, lambda tn: _tier_settings(auto_tiers, tn))
            shared_targets.clear(); shared_targets.update(_new_t)
            repairs_done[_t1.RESET_ID] = now_ms
            save_trader_state({"autoActive": {**auto_active, "targets": shared_targets, "planVersion": PLAN_VERSION, "planArms": current_arms},
                               "autoPlanVersion": PLAN_VERSION, "autoPlanArms": current_arms, "autoRepairs": dict(repairs_done)})
            log.append(f"Tier 1 sell levels reset to 12.5% above each reference price ({len(_changed)} changed)"
                       + (": " + "; ".join(f"{ck} {o:,.4g} -> {n:,.4g}" for ck, o, n in _changed[:6]) if _changed else ""))
    except Exception as e:
        print(f"[cron] Tier 1 reset skipped (trading continues): {type(e).__name__}: {e}", flush=True)

    try:
        _pri = get_coin_priority()
        _priority_info = {"careful": list(_pri.get("careful") or []), "focus": list(_pri.get("focus") or [])} if isinstance(_pri, dict) else {}
    except Exception as e:
        print(f"[priority] could not load the shit/accumulate lists: {e}", flush=True)
        _priority_info = {}
    try:
        _ranks = get_coin_ranks()
        if not isinstance(_ranks, dict):
            _ranks = {}
    except Exception as e:
        print(f"[ranks] could not load, using the built-in Top 10 list: {e}", flush=True)
        _ranks = {}

    def _persist_fired():
        """Save the new buy level + pause for every signal that has traded so far, RIGHT AFTER each order. Before, this
        happened once at the end of the run, so a run cut off part-way left the orders placed on Swyftx but the cards,
        pauses and buy levels unchanged, and the next run could buy the same signals again. Works on copies, so wallets
        still running this cycle keep seeing the same levels."""
        try:
            t, cd = dict(shared_targets), dict(shared_cooldowns)
            for _ck, _ev in fired.items():
                _st, _price = _ev["settings"], _ev["price"]
                _old_sell = float((t.get(_ck) or {}).get("sell", 0) or 0)
                _new_sell = _price * (1 + _st["sellDeviation"] / 100)
                t[_ck] = {"buy": _price * (1 - _st["deviation"] / 100),
                          "sell": max(_old_sell, _new_sell) if (_ev["side"] == "buy" and not t1_follows_buy(_ck)) else _new_sell, "setAt": now_ms}
                cd[_ck] = now_ms + _st["cooldownHours"] * 3_600_000
            save_trader_state({"autoActive": {**auto_active, "targets": t, "planVersion": PLAN_VERSION, "planArms": current_arms},
                               "autoPlanVersion": PLAN_VERSION, "autoPlanArms": current_arms, "autoCooldowns": cd})
        except Exception as e:
            print(f"[cron] could not save progress after an order: {type(e).__name__}: {e}", flush=True)

    for ctx in wallet_contexts:
        ctx["persistFired"] = _persist_fired
        ctx["ranks"] = _ranks
        ctx["priorityInfo"] = _priority_info
        ctx["trailDecisions"] = trail_decisions
        ctx["trailInfo"] = dict(trail_state_new)
        ctx["trailPullbacks"] = pullbacks
        ctx["trailMode"] = trail_mode
        ctx["sizing"] = sizing if isinstance(sizing, dict) and sizing.get("enabled") else None
        ctx["onCatchupBuy"] = _persist_catchup
        ctx["sharedTargets"] = shared_targets
        ctx["sharedCooldowns"] = shared_cooldowns
        ctx["fired"] = fired
        if catchup_active and not ctx["isPool"]:
            done = set(catchup_done_map.get(ctx["wallet"], []))
            ctx["catchupLimits"] = {k: float(v) for k, v in (catchup.get("limits") or {}).items() if k not in done}

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

    # Move each traded signal's shared target + start its shared cooldown ONCE,
    # no matter how many wallets traded it this cycle.
    for ck, ev in fired.items():
        st = ev["settings"]
        price = ev["price"]
        old_sell = float((shared_targets.get(ck) or {}).get("sell", 0) or 0)
        new_sell = price * (1 + st["sellDeviation"] / 100)
        shared_targets[ck] = {
            "buy": price * (1 - st["deviation"] / 100),
            "sell": max(old_sell, new_sell) if (ev["side"] == "buy" and not t1_follows_buy(ck)) else new_sell,
            "setAt": now_ms,
        }
        shared_cooldowns[ck] = now_ms + st["cooldownHours"] * 3_600_000
    shared_cooldowns = {k: v for k, v in shared_cooldowns.items()
                        if not (isinstance(v, (int, float)) and v <= now_ms)}

    for _ck in fired:
        trail_state_new.pop(_ck, None)
    trail_update = trail_state_new if (trail_cfg["enabled"] or old_trail_state) else None

    new_pauses = set()
    for _ctx in wallet_contexts:
        new_pauses |= set(_ctx.get("newPauses") or ())
    pauses_update = None
    seen_update = None
    if new_pauses or len(paused) != len(shared_state.get("autoPausedAssets") or {}):
        pauses_update = dict(paused)
        try:
            from untradable_memory import next_pause, initial_seen
            seen = shared_state.get("autoUntradableSeen") if isinstance(shared_state.get("autoUntradableSeen"), dict) else initial_seen(now_ms)
            for c in sorted(new_pauses):
                hours, alert, seen = next_pause(seen, c, now_ms, first_hours=PAUSE_UNTRADABLE_HOURS)
                pauses_update[c] = now_ms + int(hours * 3_600_000)
                if alert:
                    log.append(f"{c}: paused for {hours:g}h — Swyftx says it is not tradable right now")        # this exact line raises the Telegram alert
                else:
                    log.append(f"{c}: still switched off on Swyftx, paused another {hours:g}h (already reported, no new alert)")
            seen_update = seen
        except Exception as e:
            print(f"[cron] untradable memory failed, using the plain pause: {type(e).__name__}: {e}", flush=True)
            for c in new_pauses:
                pauses_update[c] = now_ms + int(PAUSE_UNTRADABLE_HOURS * 3_600_000)
                log.append(f"{c}: paused for {PAUSE_UNTRADABLE_HOURS:g}h — Swyftx says it is not tradable right now")

    blocked_update = None
    _old_blocks = {w: u for w, u in (shared_state.get("autoBlockedWallets") or {}).items() if isinstance(u, (int, float)) and u > now_ms}
    _new_blocks = {c["wallet"]: now_ms + int(c["newBlock"] * 3_600_000) for c in wallet_contexts if c.get("newBlock")}
    if _new_blocks or len(_old_blocks) != len(shared_state.get("autoBlockedWallets") or {}):
        blocked_update = {**_old_blocks, **_new_blocks}

    save_update = {
        "autoActive": {**auto_active, "targets": shared_targets, "planVersion": PLAN_VERSION, "planArms": current_arms},
        "autoPlanVersion": PLAN_VERSION, "autoPlanArms": current_arms,
        "autoCooldowns": shared_cooldowns,
        # The prices the bot itself used this run (it has one for every coin it watches). The screen falls back on these for coins
        # its own live feed does not carry, which used to show as $0.00.
        "autoBotPrices": {"at": now_ms, "prices": {c: p for c, p in prices.items() if isinstance(p, (int, float)) and p > 0}},
    }
    try:
        _items = dict(skipped_reasons)
        for _ctx in wallet_contexts:
            if _ctx.get("isPool"):
                _items.update(_ctx.get("reasons") or {})
        # a signal that traded this run needs no reason
        for _ck in fired:
            _items.pop(_ck, None)
        save_update["autoBuyStatus"] = {"at": now_ms, "items": _items}
    except Exception as e:
        print(f"[cron] could not build buy reasons: {e}", flush=True)
    if trail_update is not None:
        save_update["autoTrail"] = trail_update
    if pauses_update is not None:
        save_update["autoPausedAssets"] = pauses_update
    if seen_update is not None:
        save_update["autoUntradableSeen"] = seen_update
    if blocked_update is not None:
        save_update["autoBlockedWallets"] = blocked_update
    if catchup_active:
        save_update["autoCatchUp"] = {**catchup, "done": catchup_done_map}
    save_trader_state(save_update)

    # Only write the blocklist when seeding the default the first time —
    # never on later runs, so admin edits in the DB are preserved.
    if seed_blocklist:
        save_trader_state({"autoRebuyBlocklist": rebuy_blocklist})

    if all_trades:
        details = None
        try:
            from database import digest_details
            pool_h = next((c["holdings"] for c in wallet_contexts if c.get("isPool")), {})
            # Refresh the pool snapshot first so "Pool balance" and "Pool holds" include the buys just made, but only when
            # there is plenty of time left in this run (it re-reads every wallet from Swyftx).
            _fresh = (time.time() - _RUN_STARTED) < (RUN_BUDGET_SECONDS + 40)
            details = digest_details(sorted({t["coin"] for t in all_trades}), pool_h, [c["holdings"] for c in wallet_contexts], prices, fresh=_fresh)
        except Exception as e:
            print(f"[cron] digest details error: {e}", flush=True)     # the plain digest still goes out
        if not isinstance(details, dict):
            details = None
        try:
            message = format_digest(all_trades, details)
        except Exception as e:
            print(f"[cron] digest details format error: {e}", flush=True)
            message = format_digest(all_trades)
        if any(c.get("budgetHit") for c in wallet_contexts):
            message += "\n\n⏱ Time limit for this run reached — the remaining buys continue on the next run."
        send_telegram(message)

    try:
        if (time.time() - _RUN_STARTED) < RUN_BUDGET_SECONDS:
            from database import refresh_coin_priority
            refresh_coin_priority()        # no-op unless the stored lists are over 24 hours old
    except Exception as e:
        print(f"[priority] refresh skipped: {e}", flush=True)

    log.append(f"Done: {len(all_trades)} trade(s) across {len(wallet_contexts)} wallet(s)")

    return {
        "walletsProcessed": len(wallet_contexts),
        "walletsOptedIn": len(wallets),
        "tradesExecuted": len(all_trades),
        "dryRun": DRY_RUN,
        "results": results,
        "log": log,
    }

def _send_failure_alerts(log_lines):
    """One Telegram message per NEW problem (not repeated for 6 hours). Never raises."""
    try:
        from alerts import find_problems, select_new, format_alert
        problems = find_problems(log_lines or [])
        if not problems:
            return
        state = get_trader_state()
        now_ms = int(time.time() * 1000)
        texts, sent = select_new(problems, state.get("autoAlertsSent") or {}, now_ms)
        if texts:
            save_trader_state({"autoAlertsSent": sent})
            send_telegram(format_alert(texts))
    except Exception as e:
        print(f"[alerts] could not send: {e}", flush=True)


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
            record_cron_status(save_trader_state, result)
            _send_failure_alerts(result.get("log") if isinstance(result, dict) else None)
            self._send_json(200, result)
        except Exception as e:
            print(f"Auto-trade cron error: {e}")
            record_cron_status(save_trader_state, {"error": str(e)})
            _send_failure_alerts([f"cron: unexpected error — {str(e)[:150]}"])
            self._send_json(500, {"error": str(e)})

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode())

    def log_message(self, format, *args):
        # Suppress default access logs
        pass
