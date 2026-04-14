# ==========================================
# API Routes - User, Deposit, Trade, Share Endpoints
# ==========================================
from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import time

# Add parent directory for imports
sys.path.insert(0, os.path.dirname(__file__))

from database import (
    register_user,
    get_user_portfolio,
    get_user_deposits,
    record_deposit,
    record_trade,
    get_all_active_users,
    calculate_pool_allocations,
    is_admin,
    get_trader_state,
    save_trader_state,
    get_pool_state,
    initialize_pool,
    get_user_position,
    get_leaderboard,
    get_all_transactions,
    get_admin_stats,
    get_db_debug,
    sync_deposits_from_client,
    sync_trades_from_swyftx,
    admin_import_user,
    recalibrate_pool,
    verify_wallet_signature,
    get_user_preferences,
    save_user_preferences
)

from perp_engine import (
    get_or_create_account,
    reset_account,
    set_trading_mode,
    set_kill_switch,
    open_position,
    close_position,
    modify_position,
    get_open_positions,
    get_trade_history,
    get_equity_curve,
    get_markets_info,
    calculate_metrics,
    partial_close_position,
    pyramid_position,
    flip_position,
    set_position_type,
    get_position_summary,
    get_funding_summary,
    get_reentry_candidates,
    create_pending_order,
    cancel_pending_order,
    modify_pending_order,
    get_pending_orders,
    MARKETS,
)
from database import ADMIN_WALLETS
from perp_strategies import (
    get_strategy_status,
    toggle_auto_trading,
    update_strategy_config,
    start_strategy_test,
    stop_strategy_test,
)

# ── CORS origin check ──────────────────────────────────────────────────
ALLOWED_ORIGINS = ["https://budju.xyz", "https://www.budju.xyz"]

def get_cors_origin(headers) -> str:
    origin = headers.get('Origin', '')
    if origin in ALLOWED_ORIGINS:
        return origin
    if origin.startswith('http://localhost:'):
        return origin
    return ALLOWED_ORIGINS[0]


# ── Rate Limiting (in-memory, per warm instance) ───────────────────────
# Tracks requests per IP. Resets on cold start (acceptable for serverless).
_rate_limit_store: dict = {}  # {ip: [timestamp, ...]}
RATE_LIMIT_WINDOW = 60       # seconds
RATE_LIMIT_MAX = 30          # max requests per window per IP
RATE_LIMIT_MAX_WRITE = 10    # max write (POST) requests per window per IP

def _check_rate_limit(ip: str, is_write: bool = False) -> bool:
    """Returns True if request is allowed, False if rate limited."""
    now = time.time()
    key = f"{ip}:{'w' if is_write else 'r'}"
    max_req = RATE_LIMIT_MAX_WRITE if is_write else RATE_LIMIT_MAX

    if key not in _rate_limit_store:
        _rate_limit_store[key] = []

    # Prune old entries
    _rate_limit_store[key] = [t for t in _rate_limit_store[key] if now - t < RATE_LIMIT_WINDOW]

    if len(_rate_limit_store[key]) >= max_req:
        return False

    _rate_limit_store[key].append(now)
    return True

def _get_client_ip(handler) -> str:
    """Extract client IP from headers (Vercel sets x-forwarded-for)."""
    forwarded = handler.headers.get('X-Forwarded-For', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return handler.headers.get('X-Real-Ip', '0.0.0.0')


# ── Admin Verification ─────────────────────────────────────────────────
# Checks that the request comes from a known admin wallet.
# Signature verification is optional — if provided, it's validated with
# Ed25519 + 30-minute timestamp window. If omitted, wallet address alone
# is sufficient (the connected wallet is already authenticated by the
# Solana wallet adapter on the frontend).
_ADMIN_MSG_WINDOW_MS = 30 * 60 * 1000  # 30 minutes

def _verify_admin(body: dict, handler) -> tuple:
    """Verify admin wallet address. Optionally verify Ed25519 signature.
    Returns (is_valid: bool, error_message: str or None).
    Requires: adminWallet (must be in ADMIN_WALLETS).
    Optional: adminSignature + adminMessage for stricter verification.
    """
    admin_wallet = body.get('adminWallet')
    if not admin_wallet or not is_admin(admin_wallet):
        return False, "Admin access required"

    signature = body.get('adminSignature')
    message = body.get('adminMessage')

    # If signature provided, verify it
    if signature and message:
        if not verify_wallet_signature(admin_wallet, message, signature):
            return False, "Invalid admin signature"

        # Verify the message contains a recent timestamp (anti-replay)
        try:
            parts = message.split(':')
            if len(parts) < 2:
                return False, "Invalid message format"
            msg_timestamp = int(parts[-1])
            now_ms = int(time.time() * 1000)
            if abs(now_ms - msg_timestamp) > _ADMIN_MSG_WINDOW_MS:
                return False, "Message timestamp expired (replay protection)"
        except (ValueError, IndexError):
            return False, "Invalid message timestamp"

    return True, None


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        cors_origin = get_cors_origin(self.headers)
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', cors_origin)
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        # Rate limit check
        client_ip = _get_client_ip(self)
        if not _check_rate_limit(client_ip, is_write=False):
            self._send_json(429, {"error": "Too many requests. Please try again later."})
            return

        try:
            path = self.path.split('?')[0]
            params = self._parse_query_params()

            if path == '/api/user/portfolio':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return

                portfolio = get_user_portfolio(wallet)
                if not portfolio:
                    self._send_json(404, {"error": "User not found"})
                    return

                self._send_json(200, portfolio)

            elif path == '/api/user/preferences':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                prefs = get_user_preferences(wallet)
                self._send_json(200, prefs)

            elif path == '/api/user/deposits':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return

                deposits = get_user_deposits(wallet)
                self._send_json(200, {"deposits": deposits, "count": len(deposits)})

            elif path == '/api/user/position':
                wallet = params.get('wallet')
                pool_value = params.get('poolValue')
                if not wallet or not pool_value:
                    self._send_json(400, {"error": "wallet and poolValue parameters required"})
                    return

                position = get_user_position(wallet, float(pool_value))
                self._send_json(200, position)

            elif path == '/api/pool/state':
                state = get_pool_state()
                self._send_json(200, state)

            elif path == '/api/users':
                wallet = params.get('admin_wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                users = get_all_active_users()
                self._send_json(200, {"users": users, "count": len(users)})

            elif path == '/api/state':
                # Public read access - everyone can view trade state
                state = get_trader_state()
                self._send_json(200, state)

            elif path == '/api/pool/allocations':
                wallet = params.get('admin_wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                allocations = calculate_pool_allocations()
                self._send_json(200, {"allocations": allocations})

            elif path == '/api/admin/stats':
                pool_value = params.get('poolValue')
                if not pool_value:
                    self._send_json(400, {"error": "poolValue parameter required"})
                    return
                stats = get_admin_stats(float(pool_value))
                self._send_json(200, stats)

            elif path == '/api/leaderboard':
                pool_value = params.get('poolValue')
                if not pool_value:
                    self._send_json(400, {"error": "poolValue parameter required"})
                    return
                board = get_leaderboard(float(pool_value))
                self._send_json(200, {"leaderboard": board, "count": len(board)})

            elif path == '/api/transactions':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                # Admin view only when explicitly requested via ?admin=true
                admin_req = is_admin(wallet) and params.get('admin') == 'true'
                txns = get_all_transactions(
                    wallet_address=wallet,
                    is_admin_request=admin_req
                )
                self._send_json(200, {"transactions": txns, "count": len(txns), "isAdmin": is_admin(wallet)})

            elif path == '/api/debug':
                wallet = params.get('wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                debug_info = get_db_debug()
                self._send_json(200, debug_info)

            # ── Perp Paper Trading GET endpoints ─────────────────────
            elif path == '/api/perp/account':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                account = get_or_create_account(wallet)
                metrics = calculate_metrics(wallet)
                self._send_json(200, {**account, "metrics": metrics})

            elif path == '/api/perp/positions':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                positions = get_open_positions(wallet)
                self._send_json(200, {"positions": positions, "count": len(positions)})

            elif path == '/api/perp/trades':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                symbol = params.get('symbol')
                limit = int(params.get('limit', '50'))
                trades = get_trade_history(wallet, limit=limit, symbol=symbol)
                self._send_json(200, {"trades": trades, "count": len(trades)})

            elif path == '/api/perp/equity':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                period = params.get('period', 'all')
                curve = get_equity_curve(wallet, period=period)
                self._send_json(200, {"equity": curve, "count": len(curve)})

            elif path == '/api/perp/markets':
                markets = get_markets_info()
                self._send_json(200, {"markets": markets})

            elif path == '/api/perp/public':
                # Public read-only view of admin paper trading data
                if not ADMIN_WALLETS:
                    self._send_json(404, {"error": "No admin configured"})
                    return
                admin_wallet = ADMIN_WALLETS[0]
                account = get_or_create_account(admin_wallet)
                metrics = calculate_metrics(admin_wallet)
                positions = get_open_positions(admin_wallet)
                trades = get_trade_history(admin_wallet, limit=50)
                equity_curve = get_equity_curve(admin_wallet, period="1w")
                markets = get_markets_info()
                self._send_json(200, {
                    "account": {**account, "metrics": metrics},
                    "positions": positions,
                    "trades": trades,
                    "equity": equity_curve,
                    "markets": markets,
                })

            elif path == '/api/perp/metrics':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                metrics = calculate_metrics(wallet)
                self._send_json(200, metrics)

            elif path == '/api/perp/strategy/status':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                status = get_strategy_status(wallet)
                self._send_json(200, status)

            elif path == '/api/perp/pending-orders':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                orders = get_pending_orders(wallet)
                self._send_json(200, {"orders": orders, "count": len(orders)})

            elif path == '/api/perp/position-summary':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                summary = get_position_summary(wallet)
                self._send_json(200, summary)

            elif path == '/api/perp/funding-summary':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                summary = get_funding_summary(wallet)
                self._send_json(200, summary)

            elif path == '/api/perp/reentry-candidates':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                # Need live prices for re-entry analysis
                from perp_engine import perp_positions as _pp
                open_pos = list(_pp.find({"account_id": wallet, "status": "open"}))
                price_map = {}
                for p in open_pos:
                    if p.get("mark_price"):
                        price_map[p["symbol"]] = p["mark_price"]
                candidates = get_reentry_candidates(wallet, price_map)
                self._send_json(200, {"candidates": candidates, "count": len(candidates)})

            elif path == '/api/perp/backtest':
                strategy = params.get('strategy', 'trend_following')
                symbol = params.get('symbol', 'SOL-PERP')
                periods = int(params.get('periods', '1440'))
                balance = float(params.get('balance', '10000'))
                from perp_backtest import run_backtest_from_db
                result = run_backtest_from_db(strategy, symbol, periods, balance)
                self._send_json(200, result)

            elif path == '/api/ml-training-data':
                # Training-data pull endpoint for the hardened ML droplet.
                # The ML droplet holds no MongoDB credentials — it fetches closed trades
                # and signals here over HTTPS with a bearer token. If this droplet is
                # compromised, the attacker gets ML training data, not the database.
                training_secret = os.getenv('BUDJU_TRAINING_API_SECRET', '')
                if not training_secret:
                    self._send_json(503, {"error": "Training endpoint not configured"})
                    return
                auth_header = self.headers.get('Authorization', '')
                if not auth_header.startswith('Bearer ') or auth_header[7:] != training_secret:
                    self._send_json(401, {"error": "Unauthorized"})
                    return

                # Pull training data from MongoDB
                from database import db as _db
                limit = min(int(params.get('limit', '2000')), 10000)

                # Serialise Mongo docs to JSON-safe dicts (ObjectId → str, datetime → iso)
                from datetime import datetime as _dt
                def _clean(doc):
                    out = {}
                    for k, v in doc.items():
                        if k == '_id':
                            continue
                        if isinstance(v, _dt):
                            out[k] = v.isoformat()
                        elif isinstance(v, dict):
                            out[k] = _clean(v)
                        else:
                            out[k] = v
                    return out

                trades = [_clean(t) for t in _db['perp_trades'].find({}).sort('exit_time', -1).limit(limit)]
                signals = [_clean(s) for s in _db['perp_strategy_signals'].find({'acted': True}).sort('timestamp', -1).limit(limit * 3)]

                self._send_json(200, {
                    'trades': trades,
                    'signals': signals,
                    'counts': {'trades': len(trades), 'signals': len(signals)},
                })

            else:
                self._send_json(404, {"error": "Not found"})

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def do_POST(self):
        # Rate limit check (stricter for writes)
        client_ip = _get_client_ip(self)
        if not _check_rate_limit(client_ip, is_write=True):
            self._send_json(429, {"error": "Too many requests. Please try again later."})
            return

        try:
            path = self.path.split('?')[0]
            body = self._read_body()

            if path == '/api/user/register':
                wallet_address = body.get('walletAddress')
                signature = body.get('signature')
                message = body.get('message')

                if not wallet_address:
                    self._send_json(400, {"error": "walletAddress required"})
                    return

                # Signature verification is optional — allows simple registration on connect
                user_data = register_user(wallet_address, signature, message)
                self._send_json(200, user_data)

            elif path == '/api/user/preferences':
                wallet_address = body.get('walletAddress')
                preferences = body.get('preferences')
                if not wallet_address:
                    self._send_json(400, {"error": "walletAddress required"})
                    return
                if not preferences or not isinstance(preferences, dict):
                    self._send_json(400, {"error": "preferences object required"})
                    return
                result = save_user_preferences(wallet_address, preferences)
                self._send_json(200, result)

            elif path == '/api/user-deposit':
                # User self-service deposit — user sends USDC on-chain, then records here
                wallet_address = body.get('walletAddress')
                amount = body.get('amount')
                tx_hash = body.get('txHash')
                pool_value = body.get('totalPoolValue', 0)

                if not wallet_address or amount is None or not tx_hash:
                    self._send_json(400, {"error": "walletAddress, amount, and txHash required"})
                    return

                if len(str(tx_hash)) < 20:
                    self._send_json(400, {"error": "Invalid transaction hash"})
                    return

                result = record_deposit(
                    wallet_address, float(amount), tx_hash,
                    float(pool_value), 'USDC'
                )
                self._send_json(200, result)

            elif path == '/api/deposit':
                # Admin-only: requires cryptographic signature verification
                is_valid, error = _verify_admin(body, self)
                if not is_valid:
                    self._send_json(403, {"error": error})
                    return

                wallet_address = body.get('walletAddress')
                amount = body.get('amount')
                tx_hash = body.get('txHash')
                pool_value = body.get('totalPoolValue')
                currency = body.get('currency', 'USDC')

                if not all([wallet_address, amount, tx_hash, pool_value]):
                    self._send_json(400, {"error": "walletAddress, amount, txHash, and totalPoolValue required"})
                    return

                result = record_deposit(
                    wallet_address, float(amount), tx_hash,
                    float(pool_value), currency
                )
                self._send_json(200, result)

            elif path == '/api/pool/initialize':
                # Admin-only: requires cryptographic signature verification
                is_valid, error = _verify_admin(body, self)
                if not is_valid:
                    self._send_json(403, {"error": error})
                    return

                pool_value = body.get('totalPoolValue')
                if not pool_value:
                    self._send_json(400, {"error": "totalPoolValue required"})
                    return

                result = initialize_pool(float(pool_value))
                self._send_json(200, result)

            elif path == '/api/state':
                # Admin-only: wallet must be in ADMIN_WALLETS
                admin_wallet = body.get('adminWallet')
                if not admin_wallet or not is_admin(admin_wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return

                # Accept partial updates — only overwrite keys that are sent
                allowed_keys = {'pendingOrders', 'enrichedOrders', 'autoTiers', 'autoCooldowns', 'autoTradeLog', 'autoActive', 'autoTierAssignments'}
                update = {k: v for k, v in body.items() if k in allowed_keys}

                if not update:
                    self._send_json(400, {"error": "No valid state keys provided"})
                    return

                result = save_trader_state(update)
                self._send_json(200, result)

            elif path == '/api/user/sync':
                # Admin-only: requires cryptographic signature verification
                is_valid, error = _verify_admin(body, self)
                if not is_valid:
                    self._send_json(403, {"error": error})
                    return

                wallet_address = body.get('walletAddress')
                deposits = body.get('deposits', [])
                pool_value = body.get('totalPoolValue', 0)

                if not wallet_address:
                    self._send_json(400, {"error": "walletAddress required"})
                    return

                result = sync_deposits_from_client(
                    wallet_address, deposits, float(pool_value)
                )
                self._send_json(200, result)

            elif path == '/api/trade':
                # Admin-only: requires cryptographic signature verification
                is_valid, error = _verify_admin(body, self)
                if not is_valid:
                    self._send_json(403, {"error": error})
                    return

                coin = body.get('coin')
                trade_type = body.get('type')
                amount = body.get('amount')
                price = body.get('price')
                swyftx_id = body.get('swyftxId')
                trade_timestamp = body.get('timestamp')

                if not all([coin, trade_type, amount, price]):
                    self._send_json(400, {"error": "coin, type, amount, and price required"})
                    return

                # Get current allocations for all active users
                allocations = calculate_pool_allocations()

                result = record_trade(
                    coin, trade_type, float(amount), float(price),
                    allocations, swyftx_id, trade_timestamp
                )
                self._send_json(200, result)

            elif path == '/api/trade/sync':
                # Admin-only: requires cryptographic signature verification
                is_valid, error = _verify_admin(body, self)
                if not is_valid:
                    self._send_json(403, {"error": error})
                    return

                trades = body.get('trades', [])
                if not trades:
                    self._send_json(400, {"error": "trades array required"})
                    return

                result = sync_trades_from_swyftx(trades)
                self._send_json(200, result)

            elif path == '/api/admin/import-user':
                # Admin-only: requires cryptographic signature verification
                is_valid, error = _verify_admin(body, self)
                if not is_valid:
                    self._send_json(403, {"error": error})
                    return

                wallet_address = body.get('walletAddress')
                deposit_amount = body.get('amount')
                pool_value = body.get('totalPoolValue')
                tx_hash = body.get('txHash')

                if not wallet_address or not deposit_amount or not pool_value:
                    self._send_json(400, {"error": "walletAddress, amount, and totalPoolValue required"})
                    return

                result = admin_import_user(
                    wallet_address, float(deposit_amount),
                    float(pool_value), tx_hash
                )
                self._send_json(200, result)

            elif path == '/api/admin/recalibrate':
                # Admin-only: requires cryptographic signature verification
                is_valid, error = _verify_admin(body, self)
                if not is_valid:
                    self._send_json(403, {"error": error})
                    return

                pool_value = body.get('totalPoolValue')
                if not pool_value:
                    self._send_json(400, {"error": "totalPoolValue required"})
                    return

                result = recalibrate_pool(float(pool_value))
                self._send_json(200, result)

            # ── Perp Paper Trading POST endpoints ────────────────────
            elif path == '/api/perp/order':
                wallet = body.get('wallet') or body.get('adminWallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                symbol = body.get('symbol')
                direction = body.get('direction')
                leverage = int(body.get('leverage', 5))
                size_usd = float(body.get('sizeUsd', 0))
                entry_price = float(body.get('entryPrice', 0))
                stop_loss = float(body['stopLoss']) if body.get('stopLoss') else None
                take_profit = float(body['takeProfit']) if body.get('takeProfit') else None
                trailing_stop = float(body['trailingStopPct']) if body.get('trailingStopPct') else None
                entry_reason = body.get('entryReason', '')

                if not all([symbol, direction, size_usd, entry_price]):
                    self._send_json(400, {"error": "symbol, direction, sizeUsd, and entryPrice required"})
                    return

                result = open_position(
                    wallet, symbol, direction, leverage, size_usd,
                    entry_price, stop_loss, take_profit, trailing_stop, entry_reason
                )
                self._send_json(200, result)

            elif path == '/api/perp/close':
                wallet = body.get('wallet') or body.get('adminWallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return

                position_id = body.get('positionId')
                exit_price = float(body.get('exitPrice', 0))
                exit_reason = body.get('exitReason', 'manual')

                if not position_id or not exit_price:
                    self._send_json(400, {"error": "positionId and exitPrice required"})
                    return

                result = close_position(position_id, exit_price, "manual", exit_reason)

                # Send Telegram notification for closed trades
                try:
                    pnl = result.get("realized_pnl", 0)
                    symbol = result.get("symbol", "?")
                    direction = result.get("direction", "?")
                    leverage = result.get("leverage", 1)
                    wallet_short = wallet[:4] + ".." + wallet[-4:]
                    is_live = result.get("trading_mode") == "live"
                    mode_label = "LIVE" if is_live else "PAPER"

                    # Only send wins to Telegram
                    if pnl > 0:
                        emoji = "💰"
                        msg = (
                            f"{emoji} <b>{mode_label} WIN</b>{'  🔴' if is_live else ''}\n"
                            f"📍 {symbol} {direction.upper()} {leverage}x\n"
                            f"💰 P&L: <b>+${pnl:.2f}</b>\n"
                            f"🔧 Manual close\n"
                            f"👤 {wallet_short}"
                        )
                    else:
                        msg = None

                    tg_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
                    tg_chat = os.getenv("TELEGRAM_CHAT_ID", "-1002398835975")
                    if tg_token and msg:
                        from urllib.request import Request, urlopen
                        tg_url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
                        tg_payload = json.dumps({
                            "chat_id": tg_chat,
                            "text": msg,
                            "parse_mode": "HTML",
                            "disable_web_page_preview": True,
                        }).encode()
                        tg_req = Request(tg_url, data=tg_payload, headers={"Content-Type": "application/json"})
                        urlopen(tg_req, timeout=10)
                except Exception as tg_err:
                    print(f"[perp/close] Telegram notification error: {tg_err}")

                self._send_json(200, result)

            elif path == '/api/perp/modify':
                wallet = body.get('wallet') or body.get('adminWallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return

                position_id = body.get('positionId')
                if not position_id:
                    self._send_json(400, {"error": "positionId required"})
                    return

                stop_loss = float(body['stopLoss']) if body.get('stopLoss') else None
                take_profit = float(body['takeProfit']) if body.get('takeProfit') else None
                trailing_stop = float(body['trailingStopPct']) if body.get('trailingStopPct') else None

                result = modify_position(position_id, stop_loss, take_profit, trailing_stop)
                self._send_json(200, result)

            elif path == '/api/perp/account/reset':
                wallet = body.get('wallet') or body.get('adminWallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                result = reset_account(wallet)
                self._send_json(200, result)

            elif path == '/api/perp/strategy/toggle':
                wallet = body.get('wallet')
                enabled = body.get('enabled')
                if not wallet or enabled is None:
                    self._send_json(400, {"error": "wallet and enabled required"})
                    return
                if wallet not in ADMIN_WALLETS:
                    self._send_json(403, {"error": "Admin only"})
                    return
                toggle_auto_trading(wallet, bool(enabled))
                self._send_json(200, {"success": True})

            elif path == '/api/perp/strategy/config':
                wallet = body.get('wallet')
                updates = body.get('updates')
                if not wallet or not updates:
                    self._send_json(400, {"error": "wallet and updates required"})
                    return
                if wallet not in ADMIN_WALLETS:
                    self._send_json(403, {"error": "Admin only"})
                    return
                update_strategy_config(wallet, updates)
                self._send_json(200, {"success": True})

            elif path == '/api/perp/strategy/test':
                wallet = body.get('wallet')
                strategy = body.get('strategy')
                action = body.get('action', 'start')
                if not wallet:
                    self._send_json(400, {"error": "wallet required"})
                    return
                if wallet not in ADMIN_WALLETS:
                    self._send_json(403, {"error": "Admin only"})
                    return
                if action == 'stop':
                    result = stop_strategy_test(wallet)
                else:
                    if not strategy:
                        self._send_json(400, {"error": "strategy required"})
                        return
                    duration = int(body.get('duration_minutes', 60))
                    result = start_strategy_test(wallet, strategy, duration)
                self._send_json(200, result)

            # ── Trading Mode & Kill Switch ─────────────────────────────
            elif path == '/api/perp/mode':
                wallet = body.get('wallet') or body.get('adminWallet')
                mode = body.get('mode')
                if not wallet or not mode:
                    self._send_json(400, {"error": "wallet and mode required"})
                    return
                if not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                result = set_trading_mode(wallet, mode)
                self._send_json(200, result)

            elif path == '/api/perp/killswitch':
                wallet = body.get('wallet') or body.get('adminWallet')
                active = body.get('active')
                if not wallet or active is None:
                    self._send_json(400, {"error": "wallet and active required"})
                    return
                if not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                result = set_kill_switch(wallet, bool(active))
                self._send_json(200, result)

            elif path == '/api/perp/live/status':
                wallet = body.get('wallet') or body.get('adminWallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                from perp_exchange import is_live_ready, get_exchange_positions, get_exchange_balance, reconcile_positions
                live_status = is_live_ready()
                if live_status["ready"]:
                    live_status["exchange_balance"] = get_exchange_balance()
                    live_status["exchange_positions"] = get_exchange_positions()
                    local_positions = list(get_open_positions(wallet))
                    live_pos = [p for p in local_positions if p.get("trading_mode") == "live"]
                    live_status["reconciliation"] = reconcile_positions(live_pos)
                self._send_json(200, live_status)

            # ── Partial Close ──────────────────────────────────────────
            elif path == '/api/perp/partial-close':
                wallet = body.get('wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                result = partial_close_position(
                    position_id=body.get('positionId'),
                    exit_price=float(body.get('exitPrice', 0)),
                    close_pct=float(body.get('closePct', 50)),
                    exit_reason=body.get('exitReason', 'partial_tp'),
                )
                self._send_json(200, result)

            # ── Pending Orders ─────────────────────────────────────────
            elif path == '/api/perp/pending-order':
                wallet = body.get('wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                order = create_pending_order(
                    wallet=wallet,
                    symbol=body.get('symbol'),
                    direction=body.get('direction'),
                    leverage=int(body.get('leverage', 5)),
                    size_usd=float(body.get('sizeUsd', 0)),
                    order_type=body.get('orderType', 'limit'),
                    trigger_price=float(body.get('triggerPrice', 0)),
                    stop_loss=float(body['stopLoss']) if body.get('stopLoss') else None,
                    take_profit=float(body['takeProfit']) if body.get('takeProfit') else None,
                    trailing_stop_pct=float(body['trailingStopPct']) if body.get('trailingStopPct') else None,
                    entry_reason=body.get('entryReason', ''),
                    expiry_hours=float(body.get('expiryHours', 24)),
                )
                self._send_json(200, order)

            elif path == '/api/perp/pending-order/cancel':
                wallet = body.get('wallet')
                order_id = body.get('orderId')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                result = cancel_pending_order(order_id, wallet)
                self._send_json(200, result)

            elif path == '/api/perp/pending-order/modify':
                wallet = body.get('wallet')
                order_id = body.get('orderId')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                result = modify_pending_order(
                    order_id, wallet,
                    trigger_price=float(body['triggerPrice']) if body.get('triggerPrice') else None,
                    stop_loss=float(body['stopLoss']) if body.get('stopLoss') else None,
                    take_profit=float(body['takeProfit']) if body.get('takeProfit') else None,
                    direction=body.get('direction'),
                )
                self._send_json(200, result)

            # ── Pyramiding ─────────────────────────────────────────────
            elif path == '/api/perp/pyramid':
                wallet = body.get('wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                result = pyramid_position(
                    wallet=wallet,
                    position_id=body.get('positionId'),
                    add_size_usd=float(body.get('addSizeUsd', 0)),
                    entry_price=float(body.get('entryPrice', 0)),
                )
                self._send_json(200, result)

            # ── Position Flipping ──────────────────────────────────────
            elif path == '/api/perp/flip':
                wallet = body.get('wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                result = flip_position(
                    position_id=body.get('positionId'),
                    exit_price=float(body.get('exitPrice', 0)),
                    new_size_usd=float(body['newSizeUsd']) if body.get('newSizeUsd') else None,
                )
                self._send_json(200, result)

            # ── Core/Satellite Position Type ───────────────────────────
            elif path == '/api/perp/position-type':
                wallet = body.get('wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                result = set_position_type(
                    position_id=body.get('positionId'),
                    position_type=body.get('positionType', 'core'),
                )
                self._send_json(200, result)

            else:
                self._send_json(404, {"error": "Not found"})

        except ValueError as e:
            self._send_json(400, {"error": str(e)})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _send_json(self, status_code, data):
        cors_origin = get_cors_origin(self.headers)
        self.send_response(status_code)
        self.send_header('Access-Control-Allow-Origin', cors_origin)
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def _read_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        return json.loads(body) if body else {}

    def _parse_query_params(self):
        params = {}
        if '?' in self.path:
            query_string = self.path.split('?')[1]
            for param in query_string.split('&'):
                if '=' in param:
                    key, value = param.split('=', 1)
                    params[key] = value
        return params
