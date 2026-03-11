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
    verify_wallet_signature
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


# ── Admin Signature Verification ───────────────────────────────────────
# Nonce cache: prevents exact-replay of the same signed message within the
# validity window. Keyed by message string, value is expiry timestamp.
# Resets on cold start (acceptable for serverless — attacker would need a
# fresh instance AND a valid unexpired signature to replay).
_used_nonces: dict = {}  # {message: expiry_timestamp}
_ADMIN_MSG_WINDOW_MS = 5 * 60 * 1000  # 5 minutes (tightened from 60 min)

def _verify_admin(body: dict, handler) -> tuple:
    """Verify admin wallet address AND Ed25519 signature.
    Returns (is_valid: bool, error_message: str or None).
    Expects body to contain: adminWallet, adminSignature (list of ints), adminMessage (str).
    The adminMessage must contain a recent timestamp (within 5 minutes) to prevent replay attacks.
    """
    admin_wallet = body.get('adminWallet')
    if not admin_wallet or not is_admin(admin_wallet):
        return False, "Admin access required"

    signature = body.get('adminSignature')
    message = body.get('adminMessage')

    if not signature or not message:
        return False, "Admin signature and message required for write operations"

    # Verify the Ed25519 signature matches the admin wallet
    if not verify_wallet_signature(admin_wallet, message, signature):
        return False, "Invalid admin signature"

    # Verify the message contains a recent timestamp (anti-replay)
    try:
        # Message format expected: "BUDJU_ADMIN:<timestamp_ms>"
        parts = message.split(':')
        if len(parts) < 2:
            return False, "Invalid message format"
        msg_timestamp = int(parts[-1])
        now_ms = int(time.time() * 1000)
        if abs(now_ms - msg_timestamp) > _ADMIN_MSG_WINDOW_MS:
            return False, "Message timestamp expired (replay protection)"
    except (ValueError, IndexError):
        return False, "Invalid message timestamp"

    # Prevent exact replay of the same signed message (nonce check)
    _prune_expired_nonces(now_ms)
    if message in _used_nonces:
        return False, "Message already used (replay protection)"
    _used_nonces[message] = now_ms + _ADMIN_MSG_WINDOW_MS

    return True, None


def _prune_expired_nonces(now_ms: int):
    """Remove expired entries from the nonce cache."""
    expired = [k for k, v in _used_nonces.items() if v <= now_ms]
    for k in expired:
        del _used_nonces[k]


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
                admin_req = is_admin(wallet)
                txns = get_all_transactions(
                    wallet_address=wallet,
                    is_admin_request=admin_req
                )
                self._send_json(200, {"transactions": txns, "count": len(txns), "isAdmin": admin_req})

            elif path == '/api/debug':
                wallet = params.get('wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                debug_info = get_db_debug()
                self._send_json(200, debug_info)

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
                # Admin-only: requires cryptographic signature verification
                is_valid, error = _verify_admin(body, self)
                if not is_valid:
                    self._send_json(403, {"error": error})
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
