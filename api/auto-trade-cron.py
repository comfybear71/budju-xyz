# ==========================================
# Server-Side Auto-Trade Cron Job
# ==========================================
# Runs periodically via Vercel cron to check prices and execute trades
# even when the browser is closed.
#
# This mirrors the client-side AutoTrader logic:
#   - Reads tier settings, targets, cooldowns from MongoDB
#   - Fetches live prices from CoinGecko
#   - Fetches portfolio from Swyftx
#   - Executes market buy/sell orders when targets are hit
#   - Updates targets, cooldowns, and trade log in MongoDB
#   - Sends Telegram notifications for executed trades
# ==========================================

import os
import sys
import json
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import HTTPError

# Add current directory for sibling imports (database.py)
sys.path.insert(0, os.path.dirname(__file__))

from database import (
    get_trader_state,
    save_trader_state,
    record_trade,
    calculate_pool_allocations,
)

# ── Config ────────────────────────────────────────────────────

SWYFTX_BASE = "https://api.swyftx.com.au"
SWYFTX_API_KEY = os.getenv("SWYFTX_API_KEY", "")
COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = -1002398835975

# Trading constants (mirrors autoTrader.ts)
COOLDOWN_HOURS = 24
MIN_USDC_RESERVE = 100
MIN_ORDER_USDC = 8  # Floor for any trade (Swyftx minimum is $7)
SELL_RATIO = 0.833
HEARTBEAT_STALE_MS = 5 * 60 * 1000  # 5 minutes

# Dry-run mode: set DRY_RUN=true to simulate trades without executing
DRY_RUN = os.getenv("DRY_RUN", "false").lower() == "true"

# Circuit breakers (configurable via env vars)
MAX_SINGLE_TRADE_USDC = float(os.getenv("MAX_SINGLE_TRADE_USDC", "500"))   # Max USDC per trade
MAX_DAILY_TRADES = int(os.getenv("MAX_DAILY_TRADES", "20"))                 # Max trades per 24h
MAX_DAILY_LOSS_USDC = float(os.getenv("MAX_DAILY_LOSS_USDC", "2000"))       # Max total USDC sold per 24h

# Swyftx order types
MARKET_BUY = 1
MARKET_SELL = 2

# Asset code → CoinGecko ID (mirrors tradeApi.ts ASSET_CONFIG)
ASSET_CG_IDS = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana",
    "XRP": "ripple", "DOGE": "dogecoin", "ADA": "cardano",
    "SUI": "sui", "XAUT": "tether-gold", "AVAX": "avalanche-2",
    "DOT": "polkadot", "LINK": "chainlink", "POL": "polygon-ecosystem-token",
    "HBAR": "hedera-hashgraph", "UNI": "uniswap", "NEAR": "near",
    "NEO": "neo", "TRX": "tron", "BCH": "bitcoin-cash",
    "BNB": "binancecoin", "ENA": "ethena", "NEXO": "nexo",
    "HYPE": "hyperliquid", "RENDER": "render-token", "FET": "fetch-ai",
    "TAO": "bittensor", "PEPE": "pepe", "LUNA": "terra-luna-2",
}

# ── HTTP Helper ───────────────────────────────────────────────

def _http_json(url, method="GET", body=None, headers=None, retries=0, backoff=2):
    """Simple HTTP JSON request with optional retry + exponential backoff."""
    hdrs = dict(headers) if headers else {}
    data = json.dumps(body).encode() if body else None
    if data and "Content-Type" not in hdrs:
        hdrs["Content-Type"] = "application/json"
    hdrs.setdefault("User-Agent", "SwyftxTrader/1.0")
    last_error = None
    for attempt in range(1 + retries):
        try:
            req = Request(url, data=data, headers=hdrs, method=method)
            with urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            last_error = e
            if attempt < retries:
                wait = backoff ** attempt  # 1s, 2s, 4s...
                time.sleep(wait)
    raise last_error

# ── Swyftx Token Management ──────────────────────────────────

_swyftx_token = None
_swyftx_token_expiry = 0

def _get_swyftx_token():
    global _swyftx_token, _swyftx_token_expiry
    now = time.time() * 1000
    if _swyftx_token and now < _swyftx_token_expiry:
        return _swyftx_token
    data = _http_json(
        SWYFTX_BASE + "/auth/refresh/",
        method="POST",
        body={"apiKey": SWYFTX_API_KEY},
    )
    if not data.get("accessToken"):
        raise Exception("Swyftx auth failed")
    _swyftx_token = data["accessToken"]
    _swyftx_token_expiry = now + 50 * 60 * 1000
    return _swyftx_token

def _swyftx_headers():
    return {
        "Authorization": f"Bearer {_get_swyftx_token()}",
        "Content-Type": "application/json",
        "User-Agent": "SwyftxTrader/1.0",
    }

# ── Data Fetching ─────────────────────────────────────────────

def fetch_prices():
    """Fetch USD prices from CoinGecko for all tracked assets (with retry)."""
    ids = ",".join(ASSET_CG_IDS.values())
    url = f"{COINGECKO_URL}?ids={ids}&vs_currencies=usd,aud"
    data = _http_json(url, retries=2, backoff=2)  # Retry up to 2x with 1s, 2s backoff

    prices = {}
    for code, cg_id in ASSET_CG_IDS.items():
        entry = data.get(cg_id)
        if entry and entry.get("usd"):
            prices[code] = float(entry["usd"])
    return prices


def fetch_portfolio():
    """Fetch portfolio balances and USDC balance from Swyftx."""
    headers = _swyftx_headers()
    balances = _http_json(SWYFTX_BASE + "/user/balance/", headers=headers)
    assets_list = _http_json(SWYFTX_BASE + "/markets/assets/", headers=headers)

    # Build asset ID → code map — use String keys to avoid int/string mismatch
    asset_map = {}
    if isinstance(assets_list, list):
        for a in assets_list:
            if a.get("id") is not None:
                asset_map[str(a["id"])] = a.get("code", "")

    portfolio = {}
    usdc_balance = 0.0

    for item in (balances if isinstance(balances, list) else []):
        asset_id = item.get("assetId") or (item.get("asset", {}).get("id"))
        code = item.get("asset", {}).get("code") or (asset_map.get(str(asset_id), "") if asset_id is not None else "")
        balance = float(item.get("availableBalance", 0) or 0)

        if code == "USDC":
            usdc_balance = balance
        elif code and balance > 0:
            portfolio[code] = balance

    return portfolio, usdc_balance


def fetch_swyftx_asset_ids():
    """Build code → Swyftx numeric ID map."""
    headers = _swyftx_headers()
    assets_list = _http_json(SWYFTX_BASE + "/markets/assets/", headers=headers)
    code_to_id = {}
    if isinstance(assets_list, list):
        for a in assets_list:
            if a.get("code") and a.get("id") is not None:
                code_to_id[str(a["code"]).upper()] = str(a["id"])
    return code_to_id

# ── Trade Execution ───────────────────────────────────────────

def place_market_order(asset_code, side, amount_usdc, code_to_id):
    """Place a market order on Swyftx. Returns (success, order_id, error)."""
    if amount_usdc < 7:
        return False, None, "Below $7 minimum"

    usdc_id = code_to_id.get("USDC")
    asset_id = code_to_id.get(asset_code.upper())
    if not usdc_id or not asset_id:
        return False, None, f"Cannot resolve IDs for USDC/{asset_code}"

    payload = {
        "primary": usdc_id,
        "secondary": asset_id,
        "quantity": str(round(amount_usdc, 2)),
        "assetQuantity": usdc_id,
        "orderType": MARKET_BUY if side == "buy" else MARKET_SELL,
        "trigger": "",
    }

    try:
        data = _http_json(
            SWYFTX_BASE + "/orders/",
            method="POST",
            body=payload,
            headers=_swyftx_headers(),
        )
    except HTTPError as e:
        body_text = e.read().decode() if e.fp else ""
        return False, None, f"HTTP {e.code}: {body_text[:200]}"

    order_id = data.get("orderUuid") or data.get("orderId") or data.get("order_id")
    msg = str(data.get("message", "")).lower()
    has_error = data.get("error") or "error" in msg or "fail" in msg

    if order_id and not has_error:
        return True, order_id, None
    err = data.get("error") or data.get("message") or "No order confirmation"
    return False, None, str(err) if isinstance(err, str) else json.dumps(err)

# ── Telegram Notifications ────────────────────────────────────

def send_telegram(text):
    """Send a Telegram message (best-effort, non-blocking)."""
    if not TELEGRAM_BOT_TOKEN:
        return
    try:
        _http_json(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            method="POST",
            body={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": text,
                "parse_mode": "HTML",
            },
        )
    except Exception:
        pass  # Non-critical

# ── Tier Helpers ──────────────────────────────────────────────

def _tier_num(value):
    """Convert tier value ('tier1', '1', 1, etc.) to int."""
    if value is None:
        return 0
    s = str(value).replace("tier", "")
    try:
        return int(s)
    except ValueError:
        return 0


def _tier_settings(tier_assets, tier_num):
    """Get deviation and allocation % for a tier from DB, with defaults.
    Defaults: T1: 1% dev / 5% alloc, T2+T3: 2% dev / 5% alloc."""
    key = f"tier{tier_num}"
    db_settings = tier_assets.get(key, {}) if isinstance(tier_assets, dict) else {}
    default_dev = 1.0 if tier_num == 1 else 2.0
    return {
        "deviation": float(db_settings.get("deviation", default_dev)),
        "allocation": float(db_settings.get("allocation", 5.0)),
    }


def _is_tier_active(tier_active, tier_num):
    """Check if a tier is active (handles both string and int keys)."""
    return bool(tier_active.get(str(tier_num)) or tier_active.get(tier_num))

# ── Circuit Breakers ─────────────────────────────────────────

def _check_circuit_breakers(trade_log, side, amount_usdc, code, log):
    """Check circuit breakers before executing a trade.
    Returns (allowed: bool, reason: str or None)."""
    # 1. Max single trade size
    if amount_usdc > MAX_SINGLE_TRADE_USDC:
        reason = f"Trade ${amount_usdc:.2f} exceeds MAX_SINGLE_TRADE_USDC (${MAX_SINGLE_TRADE_USDC:.2f})"
        log.append(f"{code}: BLOCKED — {reason}")
        return False, reason

    # 2. Count trades in last 24h from trade log
    now_iso = datetime.utcnow().isoformat()
    recent_trades = 0
    daily_sell_total = 0.0
    cutoff_ms = int(time.time() * 1000) - (24 * 3_600_000)

    for entry in trade_log:
        ts = entry.get("timestamp", "")
        # Parse ISO timestamp to compare
        try:
            entry_time = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            entry_ms = int(entry_time.timestamp() * 1000)
        except (ValueError, AttributeError):
            continue

        if entry_ms > cutoff_ms:
            recent_trades += 1
            if str(entry.get("side", "")).lower() == "sell":
                daily_sell_total += float(entry.get("qty", 0)) * float(entry.get("price", 0))

    # 3. Max daily trades
    if recent_trades >= MAX_DAILY_TRADES:
        reason = f"Hit MAX_DAILY_TRADES limit ({MAX_DAILY_TRADES} trades in 24h)"
        log.append(f"{code}: BLOCKED — {reason}")
        return False, reason

    # 4. Max daily sell exposure (only for sells)
    if side == "sell" and (daily_sell_total + amount_usdc) > MAX_DAILY_LOSS_USDC:
        reason = f"Daily sell total ${daily_sell_total + amount_usdc:.2f} would exceed MAX_DAILY_LOSS_USDC (${MAX_DAILY_LOSS_USDC:.2f})"
        log.append(f"{code}: BLOCKED — {reason}")
        return False, reason

    return True, None


# ── Main Auto-Trade Check ────────────────────────────────────

def run_auto_trade_check():
    """Core auto-trade logic. Returns a result dict with a log."""
    log = []

    # Emergency kill-switch: set TRADING_ENABLED=false in Vercel env to halt all trades
    if os.getenv("TRADING_ENABLED", "true").lower() == "false":
        return {"skipped": True, "reason": "Trading disabled via TRADING_ENABLED env var", "log": log}

    if DRY_RUN:
        log.append("DRY RUN MODE — trades will be simulated, not executed")

    if not SWYFTX_API_KEY:
        return {"error": "SWYFTX_API_KEY not set", "log": log}

    # 1. Read trader state from MongoDB
    state = get_trader_state()
    auto_active = state.get("autoActive", {})

    if not isinstance(auto_active, dict) or not auto_active.get("isActive"):
        return {"skipped": True, "reason": "Auto-trading not active", "log": log}

    tier_active = auto_active.get("tierActive", {})
    targets = auto_active.get("targets", {})

    if not any(_is_tier_active(tier_active, t) for t in (1, 2, 3)):
        return {"skipped": True, "reason": "No tiers active", "log": log}

    if not targets:
        return {"skipped": True, "reason": "No targets set", "log": log}

    # Check if a browser is actively trading (fresh heartbeat from non-cron device)
    now_ms = int(time.time() * 1000)
    bot_device = auto_active.get("botDeviceId", "")
    bot_heartbeat = auto_active.get("botHeartbeat", 0)
    browser_active = (
        bot_device
        and bot_device != "server-cron"
        and isinstance(bot_heartbeat, (int, float))
        and (now_ms - bot_heartbeat) < HEARTBEAT_STALE_MS
    )

    if browser_active:
        log.append(f"Browser active (device={bot_device}, heartbeat {(now_ms - bot_heartbeat) // 1000}s ago) — skipping")
        return {"skipped": True, "reason": "Browser is actively trading", "log": log}

    tier_assets = state.get("autoTiers", state.get("autoTierAssets", {}))
    tier_assignments = state.get("autoTierAssignments", {})
    cooldowns = state.get("autoCooldowns", {})
    trade_log = state.get("autoTradeLog", [])

    # Build active coins from tier assignments (not just targets) so coins
    # that lost their targets after cooldown are still included.
    active_coins = [
        c for c, t in tier_assignments.items()
        if _is_tier_active(tier_active, _tier_num(t))
    ]
    log.append(f"Monitoring {len(active_coins)} coins: {', '.join(sorted(active_coins))}")

    # 2. Fetch prices from CoinGecko
    try:
        prices = fetch_prices()
        log.append(f"Prices: {len(prices)} coins fetched")
    except Exception as e:
        log.append(f"Price fetch error: {e}")
        # Still save heartbeat so the cron doesn't lose ownership
        _save_heartbeat(auto_active, now_ms)
        return {"error": f"Price fetch failed: {e}", "log": log}

    # 3. Fetch portfolio from Swyftx
    try:
        portfolio, usdc_balance = fetch_portfolio()
        log.append(f"Portfolio: USDC ${usdc_balance:.2f}, {len(portfolio)} assets: {', '.join(f'{c}={b:.4f}' for c, b in sorted(portfolio.items()))}")
    except Exception as e:
        log.append(f"Portfolio fetch error: {e}")
        _save_heartbeat(auto_active, now_ms)
        return {"error": f"Portfolio fetch failed: {e}", "log": log}

    # 4. Check each coin's price targets
    code_to_id = None  # Lazy-loaded only if a trade is needed
    trades_executed = []
    decisions = []  # Structured log of every decision for debugging

    for code in active_coins:
        # Skip if on cooldown
        cooldown_expiry = cooldowns.get(code, 0)
        if isinstance(cooldown_expiry, (int, float)) and cooldown_expiry > now_ms:
            remaining_h = (cooldown_expiry - now_ms) / 3_600_000
            log.append(f"{code}: cooldown ({remaining_h:.1f}h left)")
            decisions.append({"coin": code, "action": "skip", "reason": "cooldown", "remaining_h": round(remaining_h, 1)})
            continue
        elif cooldown_expiry and isinstance(cooldown_expiry, (int, float)) and cooldown_expiry <= now_ms:
            del cooldowns[code]

        tier_num = _tier_num(tier_assignments.get(code))
        settings = _tier_settings(tier_assets, tier_num)
        current_price = prices.get(code, 0)

        # Regenerate target if missing (e.g. lost after cooldown expiry)
        tgt = targets.get(code)
        if (not isinstance(tgt, dict) or not tgt) and current_price > 0:
            dev = settings["deviation"]
            tgt = {
                "buy": current_price * (1 - dev / 100),
                "sell": current_price * (1 + dev / 100),
            }
            targets[code] = tgt
            log.append(f"{code}: regenerated targets — buy ${tgt['buy']:.4f}, sell ${tgt['sell']:.4f}")

        if not isinstance(tgt, dict):
            continue

        buy_target = float(tgt.get("buy", 0))
        sell_target = float(tgt.get("sell", 0))

        if current_price <= 0 or buy_target <= 0 or sell_target <= 0:
            continue

        pct_to_buy = (current_price - buy_target) / current_price * 100
        pct_to_sell = (sell_target - current_price) / current_price * 100

        # ── BUY: price dropped below buy target ──
        if current_price <= buy_target:
            trade_amount = (settings["allocation"] / 100) * usdc_balance
            trade_amount = max(trade_amount, MIN_ORDER_USDC)

            if usdc_balance - trade_amount < MIN_USDC_RESERVE:
                reason = f"BUY signal but USDC ${usdc_balance:.2f} too low (need ${MIN_USDC_RESERVE} reserve)"
                log.append(f"{code}: {reason}")
                decisions.append({"coin": code, "action": "BUY", "result": "blocked", "reason": reason, "error": reason})
                continue

            quantity = round(trade_amount / current_price, 8)
            log.append(f"{code}: BUY at ${current_price:.2f} (target ${buy_target:.2f}) — ${trade_amount:.2f}")

            # Circuit breaker check
            cb_ok, cb_reason = _check_circuit_breakers(trade_log, "buy", trade_amount, code, log)
            if not cb_ok:
                log.append(f"{code}: BUY BLOCKED — {cb_reason}")
                decisions.append({"coin": code, "action": "BUY", "result": "blocked", "reason": cb_reason, "error": cb_reason})
                continue

            # Dry-run: simulate without executing
            if DRY_RUN:
                log.append(f"{code}: DRY RUN — would BUY {quantity:.6f} @ ${current_price:.2f} (${trade_amount:.2f} USDC)")
                continue

            if code_to_id is None:
                try:
                    code_to_id = fetch_swyftx_asset_ids()
                    log.append(f"Asset ID map loaded: {len(code_to_id)} assets")
                except Exception as e:
                    log.append(f"Failed to load asset ID map: {e}")
                    code_to_id = {}

            ok, order_id, err = place_market_order(code, "buy", trade_amount, code_to_id)

            if ok:
                log.append(f"{code}: BUY executed (order {order_id})")
                decisions.append({
                    "coin": code, "action": "BUY", "result": "executed",
                    "price": current_price, "target": buy_target,
                    "amount_usdc": round(trade_amount, 2), "quantity": quantity,
                    "order_id": order_id, "dry_run": False,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                })

                # Reset BOTH targets from trade price so they stay within deviation %
                targets[code]["buy"] = current_price * (1 - settings["deviation"] / 100)
                targets[code]["sell"] = current_price * (1 + settings["deviation"] / 100)
                log.append(f"{code}: targets reset — buy ${targets[code]['buy']:.2f}, sell ${targets[code]['sell']:.2f}")

                # Set cooldown
                cooldowns[code] = now_ms + COOLDOWN_HOURS * 3_600_000

                # Trade log
                trade_log.insert(0, {
                    "coin": code, "side": "buy", "qty": quantity,
                    "price": current_price,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                })
                if len(trade_log) > 50:
                    trade_log = trade_log[:50]

                # Record in DB (pass order_id so sync can deduplicate)
                try:
                    allocations = calculate_pool_allocations()
                    record_trade(code, "buy", quantity, current_price, allocations, swyftx_id=order_id)
                except Exception as e:
                    log.append(f"DB record error: {e}")

                trades_executed.append({
                    "coin": code, "side": "BUY",
                    "amount": round(trade_amount, 2),
                    "price": round(current_price, 2),
                })

                usdc_balance -= trade_amount

                send_telegram(
                    f"🤖 <b>Auto BUY</b>\n"
                    f"🛒 {quantity:.6f} {code} @ ${current_price:,.2f}\n"
                    f"📦 ${trade_amount:,.2f} USDC\n"
                    f"🆔 {order_id}"
                )
            else:
                log.append(f"{code}: BUY failed — {err}")
                decisions.append({
                    "coin": code, "action": "BUY", "result": "failed",
                    "price": current_price, "target": buy_target,
                    "amount_usdc": round(trade_amount, 2), "error": err,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                })

        # ── SELL: price rose above sell target ──
        elif current_price >= sell_target:
            asset_balance = portfolio.get(code, 0)
            sell_pct = settings["allocation"] * SELL_RATIO
            quantity = round((sell_pct / 100) * asset_balance, 8)

            if quantity <= 0:
                reason = f"SELL signal but no balance on Swyftx ({code} = 0)"
                log.append(f"{code}: {reason}")
                decisions.append({"coin": code, "action": "SELL", "result": "blocked", "reason": reason, "error": reason})
                continue

            sell_value = quantity * current_price

            # If below minimum, sell enough to meet it (up to full balance)
            if sell_value < MIN_ORDER_USDC:
                min_qty = MIN_ORDER_USDC / current_price
                if min_qty <= asset_balance:
                    quantity = round(min_qty, 8)
                    sell_value = quantity * current_price
                else:
                    # Sell entire balance if it meets minimum
                    quantity = round(asset_balance, 8)
                    sell_value = quantity * current_price
                    if sell_value < MIN_ORDER_USDC:
                        reason = f"SELL signal but total holding (${sell_value:.2f}) below ${MIN_ORDER_USDC} minimum"
                        log.append(f"{code}: {reason}")
                        decisions.append({"coin": code, "action": "SELL", "result": "blocked", "reason": reason, "error": reason})
                        continue

            log.append(f"{code}: SELL at ${current_price:.2f} (target ${sell_target:.2f}) — {quantity:.8f} (${sell_value:.2f})")

            # Circuit breaker check
            cb_ok, cb_reason = _check_circuit_breakers(trade_log, "sell", sell_value, code, log)
            if not cb_ok:
                log.append(f"{code}: SELL BLOCKED — {cb_reason}")
                decisions.append({"coin": code, "action": "SELL", "result": "blocked", "reason": cb_reason, "error": cb_reason})
                continue

            # Dry-run: simulate without executing
            if DRY_RUN:
                log.append(f"{code}: DRY RUN — would SELL {quantity:.6f} @ ${current_price:.2f} (${sell_value:.2f} USDC)")
                continue

            if code_to_id is None:
                try:
                    code_to_id = fetch_swyftx_asset_ids()
                    log.append(f"Asset ID map loaded: {len(code_to_id)} assets")
                except Exception as e:
                    log.append(f"Failed to load asset ID map: {e}")
                    code_to_id = {}

            ok, order_id, err = place_market_order(code, "sell", sell_value, code_to_id)

            if ok:
                log.append(f"{code}: SELL executed (order {order_id})")
                decisions.append({
                    "coin": code, "action": "SELL", "result": "executed",
                    "price": current_price, "target": sell_target,
                    "amount_usdc": round(sell_value, 2), "quantity": quantity,
                    "order_id": order_id, "dry_run": False,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                })

                # Reset BOTH targets from trade price so they stay within deviation %
                targets[code]["buy"] = current_price * (1 - settings["deviation"] / 100)
                targets[code]["sell"] = current_price * (1 + settings["deviation"] / 100)
                log.append(f"{code}: targets reset — buy ${targets[code]['buy']:.2f}, sell ${targets[code]['sell']:.2f}")

                # Set cooldown
                cooldowns[code] = now_ms + COOLDOWN_HOURS * 3_600_000

                # Trade log
                trade_log.insert(0, {
                    "coin": code, "side": "sell", "qty": quantity,
                    "price": current_price,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                })
                if len(trade_log) > 50:
                    trade_log = trade_log[:50]

                # Record in DB (pass order_id so sync can deduplicate)
                try:
                    allocations = calculate_pool_allocations()
                    record_trade(code, "sell", quantity, current_price, allocations, swyftx_id=order_id)
                except Exception as e:
                    log.append(f"DB record error: {e}")

                trades_executed.append({
                    "coin": code, "side": "SELL",
                    "amount": round(sell_value, 2),
                    "price": round(current_price, 2),
                })

                send_telegram(
                    f"🤖 <b>Auto SELL</b>\n"
                    f"💸 {quantity:.6f} {code} @ ${current_price:,.2f}\n"
                    f"📦 ${sell_value:,.2f} USDC\n"
                    f"🆔 {order_id}"
                )
            else:
                log.append(f"{code}: SELL failed — {err}")
                decisions.append({
                    "coin": code, "action": "SELL", "result": "failed",
                    "price": current_price, "target": sell_target,
                    "amount_usdc": round(sell_value, 2), "error": err,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                })

        # ── No trigger ──
        else:
            log.append(
                f"{code}: ${current_price:.2f} — "
                f"{pct_to_buy:.1f}% to buy (${buy_target:.2f}), "
                f"{pct_to_sell:.1f}% to sell (${sell_target:.2f})"
            )
            decisions.append({
                "coin": code, "action": "hold", "price": current_price,
                "buy_target": buy_target, "sell_target": sell_target,
                "pct_to_buy": round(pct_to_buy, 2), "pct_to_sell": round(pct_to_sell, 2),
            })

    # 5. Save updated state to MongoDB
    auto_active["targets"] = targets
    auto_active["botDeviceId"] = "server-cron"
    auto_active["botHeartbeat"] = now_ms

    save_trader_state({
        "autoActive": auto_active,
        "autoCooldowns": cooldowns,
        "autoTradeLog": trade_log,
        "autoCronLog": {
            "decisions": decisions,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "tradesExecuted": len(trades_executed),
        },
    })

    log.append(f"Done: {len(trades_executed)} trade(s) executed")

    return {
        "tradesExecuted": len(trades_executed),
        "trades": trades_executed,
        "coinsMonitored": len(active_coins),
        "dryRun": DRY_RUN,
        "decisions": decisions,
        "log": log,
    }


def _save_heartbeat(auto_active, now_ms):
    """Save just the heartbeat (used on error paths to keep ownership)."""
    auto_active["botDeviceId"] = "server-cron"
    auto_active["botHeartbeat"] = now_ms
    try:
        save_trader_state({"autoActive": auto_active})
    except Exception:
        pass


# ── Vercel Handler ────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Verify cron secret if configured (Vercel sends Authorization header)
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
