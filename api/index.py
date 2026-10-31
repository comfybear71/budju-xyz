# ==========================================
# API Routes - User, Deposit, Trade, Share Endpoints
# ==========================================
from http.server import BaseHTTPRequestHandler
import json
from datetime import datetime
import os
import sys
import time

# Add parent directory for imports
sys.path.insert(0, os.path.dirname(__file__))


def _send_telegram_message(text: str) -> None:
    """Best-effort Telegram notification — never raises, so a notification
    failure can't take down the request that triggered it (mirrors the
    inline try/except already used for perp close alerts below)."""
    try:
        tg_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        tg_chat = os.getenv("TELEGRAM_CHAT_ID", "-1002398835975")
        if not tg_token:
            return
        from urllib.request import Request, urlopen
        tg_url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
        tg_payload = json.dumps({
            "chat_id": tg_chat,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }).encode()
        tg_req = Request(tg_url, data=tg_payload, headers={"Content-Type": "application/json"})
        urlopen(tg_req, timeout=10)
    except Exception as tg_err:
        print(f"[telegram] notification error: {tg_err}")


from database import (
    register_user,
    get_user_portfolio,
    get_user_deposits,
    record_deposit,
    verify_onchain_usdc_deposit,
    record_withdrawal,
    correct_unrecorded_withdrawal,
    record_trade,
    get_coin_stats,
    get_coin_trades,
    get_coin_stats_scoped,
    get_coin_trades_scoped,
    is_budju_member,
    get_deposit_summary,
    void_deposit,
    reprice_deposit,
    get_latest_desk_brief,
    get_desk_briefs,
    get_recent_desk_notes,
    save_desk_note,
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
    get_pool_nav_timeline,
    get_db_debug,
    sync_deposits_from_client,
    sync_trades_from_swyftx,
    admin_import_user,
    recalibrate_pool,
    verify_wallet_signature,
    get_user_preferences,
    save_user_preferences,
    check_budju_gate,
    save_user_swyftx_key,
    get_user_swyftx_key_status,
    remove_user_swyftx_key,
    get_user_personal_holdings,
    get_user_priced_holdings,
    get_user_live_position,
    get_community_aggregate_holdings,
    get_user_auto_trade_status,
    set_user_auto_trade_enabled,
    get_user_trade_activity,
    get_all_users_trade_activity,
    get_live_leaderboard,
    link_admin_master_key,
    get_wallet_cash_flows,
    get_community_cash_flows,
    get_coin_price_history,
    get_copytrade_leaderboard,
    get_copytrade_signals,
    get_copytrade_activity,
    get_dip_report,
    fetch_dip_series,
    get_scout,
    fetch_scout_series,
    get_coin_config,
    search_coins,
    manage_coin,
    get_copytrade_overview,
    get_copytrade_status,
    get_copytrade_progress,
    get_copytrade_debug,
    reset_copytrade_helius_state,
    get_trackable_copytrade_wallet_addresses,
    save_copytrade_state,
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
import session_auth
from trade_guards import DEFAULT_REBUY_BLOCKLIST, evaluate_order
from perp_strategies import (
    get_strategy_status,
    toggle_auto_trading,
    update_strategy_config,
    start_strategy_test,
    stop_strategy_test,
)

# ── CORS origin check ──────────────────────────────────────────────────
ALLOWED_ORIGINS = ["https://budju.xyz", "https://www.budju.xyz"]


def _json_datetime_default(obj):
    """json.dumps(default=...) fallback: ISO-format any raw datetime that a
    handler forgot to convert, instead of 500ing the whole response."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


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
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def _auth_blocked(self, method, path, params, body):
        """Wallet-signature check (see session_auth.py). Returns True if the
        request was rejected and a response already sent."""
        d = session_auth.evaluate(method, path, params, body, self.headers.get('Authorization'), ADMIN_WALLETS,
                                  is_member=is_budju_member)
        if d["log"]:
            print(f"[auth] WOULD BLOCK ({d['status']}) {method} {path}: {d['reason']}", flush=True)
        if d["block"]:
            self._send_json(d["status"], {"error": d["reason"], "authRequired": True})
            return True
        return False

    def do_GET(self):
        # Rate limit check
        client_ip = _get_client_ip(self)
        if not _check_rate_limit(client_ip, is_write=False):
            self._send_json(429, {"error": "Too many requests. Please try again later."})
            return

        try:
            path = self.path.split('?')[0]
            params = self._parse_query_params()
            if self._auth_blocked('GET', path, params, {}):
                return

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

            elif path == '/api/coin-stats':
                # Per-coin trading analytics (cost-basis stats). No scope = the
                # admin account's own ledger (public, as always). scope=mine is
                # one wallet's bot trades; scope=everyone is every wallet combined.
                scope = params.get('scope')
                if scope in ('mine', 'everyone'):
                    self._send_json(200, get_coin_stats_scoped(scope, params.get('wallet')))
                else:
                    self._send_json(200, get_coin_stats())

            elif path == '/api/coin-trades':
                # Public, read-only individual buy/sell points for one coin (detail chart).
                coin = params.get('coin')
                if not coin:
                    self._send_json(400, {"error": "coin parameter required"})
                    return
                scope = params.get('scope')
                if scope in ('mine', 'everyone'):
                    self._send_json(200, get_coin_trades_scoped(coin, scope, params.get('wallet')))
                else:
                    self._send_json(200, get_coin_trades(coin))

            elif path == '/api/desk/brief':
                # Public-lite by default; full (with position contradictions) for admin
                wallet = params.get('admin_wallet')
                full = bool(wallet and is_admin(wallet))
                resp = {"brief": get_latest_desk_brief(full)}
                if params.get('history'):
                    resp["history"] = get_desk_briefs(14, full)
                self._send_json(200, resp)

            elif path == '/api/desk/notes':
                wallet = params.get('admin_wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                self._send_json(200, {"notes": get_recent_desk_notes(days=14)})

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
                try:
                    from bot_status import compute_bot_status
                    state["botStatus"] = compute_bot_status(state)
                except Exception as e:
                    state["botStatus"] = {"level": "warn", "messages": [f"Status check failed: {e}"], "lastRunAgo": None}
                self._send_json(200, state)

            elif path == '/api/pool/allocations':
                wallet = params.get('admin_wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                allocations = calculate_pool_allocations()
                self._send_json(200, {"allocations": allocations})

            elif path == '/api/pool/deposit-summary':
                # Admin-only: total capital deposited (non-voided) for the Pool Performance card
                wallet = params.get('admin_wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                # No wallet arg => sum across all admin wallets (the admin's own deposits),
                # robust to which admin wallet is connected.
                self._send_json(200, get_deposit_summary())

            elif path == '/api/admin/stats':
                pool_value = params.get('poolValue')
                if not pool_value:
                    self._send_json(400, {"error": "poolValue parameter required"})
                    return
                stats = get_admin_stats(float(pool_value))
                self._send_json(200, stats)

            elif path == '/api/pool/nav-history':
                # Public — same transparency tier as /api/admin/stats and
                # /api/leaderboard. Returns NAV-only timeline, no wallet/amount.
                points = get_pool_nav_timeline()
                self._send_json(200, {"points": points, "count": len(points)})

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

            # ── Non-custodial trading (per-user Swyftx keys) ─────────────
            elif path == '/api/user/budju-gate':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                try:
                    passes, balance = check_budju_gate(wallet)
                except ValueError as e:
                    self._send_json(502, {"error": str(e)})
                    return
                self._send_json(200, {"passes": passes, "budjuBalance": balance, "required": 10_000_000})

            elif path == '/api/user/swyftx-key':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                self._send_json(200, get_user_swyftx_key_status(wallet))

            elif path == '/api/user/personal-holdings':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                try:
                    self._send_json(200, get_user_personal_holdings(wallet))
                except ValueError as e:
                    self._send_json(400, {"error": str(e)})
                    return

            elif path == '/api/user/priced-holdings':
                # Per-coin breakdown of this wallet's OWN Swyftx holdings,
                # each priced in USD — what the Trade page's "Mine" Holdings
                # grid actually renders. Unlike /api/user/personal-holdings
                # (raw balances only), every coin here is already priced via
                # the same dynamic CoinGecko resolution the bot itself uses,
                # so coins outside BUDJU's ~30-coin registry (FLR, ARB, CC...)
                # show up correctly instead of being invisible/unpriced.
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                try:
                    self._send_json(200, get_user_priced_holdings(wallet))
                except ValueError as e:
                    self._send_json(400, {"error": str(e)})
                    return

            elif path == '/api/user/live-position':
                # Real cumulative cash + crypto balance for one wallet, read
                # from THEIR OWN Swyftx account. Replaces the old pooled
                # shares/NAV "Your Position" card entirely.
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                try:
                    self._send_json(200, get_user_live_position(wallet))
                except ValueError as e:
                    self._send_json(400, {"error": str(e)})
                    return

            elif path == '/api/community/aggregate-holdings':
                # Members only (10M BUDJU + a connected key; admins always) —
                # iterates every user's own Swyftx account via their own key.
                # The sign-in pass check (session_auth) already ran; this is
                # the belt-and-braces claim check for log/off modes.
                wallet = params.get('admin_wallet') or params.get('wallet')
                if not wallet or not is_budju_member(wallet):
                    self._send_json(403, {"error": "Members only — hold 10M BUDJU and connect a Swyftx key to see this"})
                    return
                self._send_json(200, get_community_aggregate_holdings())

            elif path == '/api/user/auto-trade':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                self._send_json(200, get_user_auto_trade_status(wallet))

            elif path == '/api/user/activity':
                # Own activity only, unless the requester is an admin viewing
                # someone else's connected wallet.
                requester = params.get('wallet')
                target = params.get('target') or requester
                if not requester:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                try:
                    self._send_json(200, {"activity": get_user_trade_activity(target, requester)})
                except ValueError as e:
                    self._send_json(403, {"error": str(e)})
                    return

            elif path == '/api/admin/all-user-activity':
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                try:
                    self._send_json(200, {"activity": get_all_users_trade_activity(wallet)})
                except ValueError as e:
                    self._send_json(403, {"error": str(e)})
                    return

            elif path == '/api/community/leaderboard':
                # Public — mirrors the old pool leaderboard's visibility.
                # Shows each connected wallet's own live holdings split
                # (%cash vs %crypto), never a pool share or NAV figure.
                self._send_json(200, get_live_leaderboard())

            elif path == '/api/coin-price-history':
                # Public — just a price chart, same CoinGecko data anyone
                # can see on CoinGecko itself. Powers the Holdings grid's
                # expandable coin card.
                code = params.get('code')
                if not code:
                    self._send_json(400, {"error": "code parameter required"})
                    return
                days = params.get('days', '7')
                try:
                    days_int = int(days)
                except (TypeError, ValueError):
                    days_int = 7
                self._send_json(200, get_coin_price_history(code, days_int))

            elif path == '/api/user/cash-flows':
                # Public, wallet-scoped — same transparency tier as
                # /api/user/live-position. Lifetime deposited/withdrawn
                # ledger an admin recorded for this wallet (in USD), used to
                # chart Net P&L against the wallet's live Swyftx value.
                wallet = params.get('wallet')
                if not wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                self._send_json(200, get_wallet_cash_flows(wallet))

            elif path == '/api/community/cash-flows':
                # Public — aggregate deposited/withdrawn across every wallet
                # with either a live Swyftx key or a manual override. Only
                # covers wallets that actually have readable data.
                self._send_json(200, get_community_cash_flows())

            # ── Signals / Copy Trading (Phase 1 — public, read-only) ──
            # Paper trading sandbox off an auto-sourced wallet list. No
            # login required to view — same visibility tier as the Pool
            # leaderboard and coin charts, so a prospective user can see
            # the whole system before ever connecting a wallet.
            elif path == '/api/copytrade/leaderboard':
                limit = params.get('limit', '50')
                try:
                    limit_int = max(1, min(int(limit), 200))
                except (TypeError, ValueError):
                    limit_int = 50
                self._send_json(200, get_copytrade_leaderboard(limit_int))

            elif path == '/api/copytrade/signals':
                limit = params.get('limit', '60')
                try:
                    limit_int = max(1, min(int(limit), 200))
                except (TypeError, ValueError):
                    limit_int = 60
                self._send_json(200, get_copytrade_signals(limit_int))

            elif path == '/api/copytrade/activity':
                try:
                    limit_int = max(1, min(int(params.get('limit', '80')), 200))
                except (TypeError, ValueError):
                    limit_int = 80
                self._send_json(200, get_copytrade_activity(limit_int))

            elif path == '/api/coins':
                self._send_json(200, get_coin_config())

            elif path == '/api/admin/coins-search':
                wallet = params.get('wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                self._send_json(200, search_coins(params.get('q', '')))

            elif path == '/api/copytrade/status':
                # Public — aggregate health of the Signals pipeline, in plain English.
                self._send_json(200, get_copytrade_status())

            elif path == '/api/copytrade/overview':
                self._send_json(200, get_copytrade_overview())

            elif path == '/api/copytrade/progress':
                limit = params.get('limit', '30')
                try:
                    limit_int = max(1, min(int(limit), 100))
                except (TypeError, ValueError):
                    limit_int = 30
                self._send_json(200, get_copytrade_progress(limit_int))

            elif path == '/api/admin/copytrade-debug':
                # Admin-only — shows BOTH sides of the Signals pipeline at
                # once: what the database thinks happened (wallet counts,
                # last refresh, event/position totals) and what Helius
                # itself has registered (live API call, not a cached
                # value) — the fastest way to tell whether the webhook
                # was ever actually created/pointed correctly without
                # needing server log access.
                wallet = params.get('wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                import copytrade_helius
                debug_info = get_copytrade_debug()
                debug_info["env"] = {
                    "hasHeliusKey": bool(os.getenv("HELIUS_API_KEY")),
                    "hasDuneKey": bool(os.getenv("DUNE_API_KEY")),
                    "hasWebhookSecret": bool(os.getenv("COPYTRADE_WEBHOOK_SECRET")),
                    "webhookUrl": copytrade_helius.COPYTRADE_WEBHOOK_URL,
                }
                debug_info["heliusWebhooksLive"] = copytrade_helius.list_helius_webhooks()
                # The LIST endpoint omits accountAddresses entirely (see
                # get_helius_webhook's docstring) — fetch our own webhook
                # by ID too, the only reliable source for that field.
                webhook_id = debug_info.get("heliusWebhookId")
                if webhook_id:
                    debug_info["ownWebhookDetail"] = copytrade_helius.get_helius_webhook(webhook_id)
                self._send_json(200, debug_info)

            elif path == '/api/admin/user-trade-debug':
                # Admin-only — answers "why isn't wallet X trading right
                # now" for the unified auto-trade cron (auto-trade-cron.py),
                # which trades every connected wallet including the admin's
                # own pool account. Walks the exact same gates that cron
                # applies for one wallet, read-only — never places an order.
                admin_wallet = params.get('admin_wallet')
                target_wallet = params.get('wallet')
                if not admin_wallet or not is_admin(admin_wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                if not target_wallet:
                    self._send_json(400, {"error": "wallet parameter required"})
                    return
                from user_trade_debug import diagnose_user_auto_trade
                self._send_json(200, diagnose_user_auto_trade(target_wallet))

            elif path == '/api/admin/restore-targets':
                # Admin-only, one-off — restores the admin wallet's T1
                # targets erased by the 2026-10-30 stale-target reset.
                # Default = read-only preview; &apply=1 writes them.
                admin_wallet = params.get('admin_wallet')
                if not admin_wallet or not is_admin(admin_wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                import restore_targets
                if params.get('apply') == '1':
                    self._send_json(200, restore_targets.apply_restore(force=params.get('force') == '1'))
                else:
                    self._send_json(200, restore_targets.preview_restore(admin_wallet))

            elif path == '/api/admin/catchup-buys':
                # Admin-only, one-off — lets the NON-admin wallets make the
                # same buys the admin wallet already made (see
                # catchup_buys.py). Default = read-only preview; &apply=1 arms.
                admin_wallet = params.get('admin_wallet')
                if not admin_wallet or not is_admin(admin_wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                import catchup_buys
                if params.get('apply') == '1':
                    self._send_json(200, catchup_buys.arm_catchup(force=params.get('force') == '1'))
                else:
                    self._send_json(200, catchup_buys.preview_catchup(admin_wallet))

            elif path == '/api/admin/order-shape':
                # Admin-only, read-only — shows Swyftx's raw reply for the
                # most recent recorded admin order (see order_shape.py).
                admin_wallet = params.get('admin_wallet')
                if not admin_wallet or not is_admin(admin_wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                import order_shape
                self._send_json(200, order_shape.inspect_last_order(admin_wallet))

            elif path == '/api/admin/reconcile-fills':
                # Admin-only, one-off — corrects past trade records to the
                # quantity Swyftx really filled (see reconcile_fills.py).
                # Default = read-only preview; &apply=1 writes (60 per call).
                admin_wallet = params.get('admin_wallet')
                if not admin_wallet or not is_admin(admin_wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                import reconcile_fills
                try:
                    lim = int(params.get('limit')) if params.get('limit') else None
                except ValueError:
                    lim = None
                self._send_json(200, reconcile_fills.run(admin_wallet, apply=params.get('apply') == '1', limit=lim))

            elif path == '/api/admin/scout':
                wallet = params.get('wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                if params.get('cg'):
                    self._send_json(200, fetch_scout_series(params.get('cg')))
                else:
                    self._send_json(200, get_scout())

            elif path == '/api/admin/dip-report':
                wallet = params.get('wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                if params.get('coin'):
                    self._send_json(200, fetch_dip_series(params.get('coin'), params.get('force') == '1'))
                else:
                    self._send_json(200, get_dip_report(params.get('force') == '1'))

            elif path == '/api/admin/copytrade-resync':
                # Admin-only, manual — force a fresh Helius webhook
                # create/update RIGHT NOW instead of waiting for the next
                # hourly-gated cron tick. Needed one-off after fixing
                # HELIUS_WEBHOOKS_BASE (api.helius.xyz -> api-mainnet.
                # helius-rpc.com, 2026-10-26): the stored copytrade_state
                # already "succeeded" against the old broken host, so the
                # cron's own "unchanged since last sync" check would
                # otherwise never re-trigger a sync on its own. Safe to
                # call again any time — always does a real sync against
                # the CURRENT trackable wallet set.
                wallet = params.get('wallet')
                if not wallet or not is_admin(wallet):
                    self._send_json(403, {"error": "Admin access required"})
                    return
                import copytrade_helius
                from datetime import datetime
                reset_copytrade_helius_state()
                addresses = get_trackable_copytrade_wallet_addresses()
                if not addresses:
                    self._send_json(200, {"ok": False, "error": "no trackable wallets"})
                    return
                result = copytrade_helius.sync_helius_webhook(addresses, None)
                if result.get("ok"):
                    save_copytrade_state({
                        "heliusWebhookId": result["webhookId"],
                        "heliusAddressesHash": copytrade_helius.addresses_hash(addresses),
                        "walletsRefreshedAt": datetime.utcnow(),
                    })
                result["addressCount"] = len(addresses)
                if result.get("ok"):
                    # The LIST endpoint omits accountAddresses entirely —
                    # confirm via the single-webhook GET instead, which is
                    # the only reliable ground truth for this field.
                    result["webhookDetail"] = copytrade_helius.get_helius_webhook(result["webhookId"])
                self._send_json(200, result)

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
            if self._auth_blocked('POST', path, self._parse_query_params(), body):
                return

            if path == '/api/auth/session':
                # Sign-in: the wallet signed a short message; return a 12h pass.
                try:
                    self._send_json(200, session_auth.create_session(
                        body.get('walletAddress'), body.get('message'), body.get('signature'),
                        verify_wallet_signature))
                except ValueError as e:
                    self._send_json(401, {"error": str(e)})

            elif path == '/api/user/register':
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

                # Confirm the transaction actually landed on-chain and moved the
                # claimed amount before issuing any shares. Without this, a
                # signature that was signed+broadcast but never confirmed (e.g.
                # expired blockhash) gets trusted blindly and mints phantom
                # shares for money that never arrived — see
                # verify_onchain_usdc_deposit's docstring for the 2026-10-22
                # incident this closes.
                is_valid, verify_error = verify_onchain_usdc_deposit(
                    tx_hash, wallet_address, float(amount)
                )
                if not is_valid:
                    self._send_json(400, {"error": verify_error})
                    return

                # The USDC went on-chain to POOL_WALLET, not to Swyftx, so any
                # pool value the client has does NOT include this deposit.
                result = record_deposit(
                    wallet_address, float(amount), tx_hash,
                    float(pool_value), 'USDC',
                    value_includes_deposit=False
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

            elif path == '/api/withdrawal':
                is_valid, error = _verify_admin(body, self)
                if not is_valid:
                    self._send_json(403, {"error": error})
                    return

                wallet_address = body.get('walletAddress')
                amount = body.get('amount')
                pool_value = body.get('totalPoolValue')
                currency = body.get('currency', 'USDC')

                if not all([wallet_address, amount, pool_value]):
                    self._send_json(400, {"error": "walletAddress, amount, and totalPoolValue required"})
                    return

                result = record_withdrawal(
                    wallet_address, float(amount), float(pool_value), currency
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

            elif path == '/api/trade/guard-check':
                # Server-side order guard (called by api/proxy.ts before every
                # Swyftx order). Returns allow/block/warn — no auth (decision
                # only, no sensitive data). Bot orders hard-block; manual warn.
                from datetime import datetime as _dtg
                state = get_trader_state()
                blocklist = state.get('autoRebuyBlocklist') or DEFAULT_REBUY_BLOCKLIST
                min_sell = float(os.getenv('SWYFTX_MIN_SELL_USDC', '30'))
                decision = evaluate_order(
                    body.get('coin'), body.get('side'), body.get('amountUsd'),
                    body.get('source'), bool(body.get('confirm', False)),
                    blocklist, _dtg.utcnow(), min_sell,
                )
                self._send_json(200, decision)

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

            elif path == '/api/admin/coins':
                is_valid, error = _verify_admin(body, self)
                if not is_valid:
                    self._send_json(403, {"error": error})
                    return
                result = manage_coin(body.get('action', ''), body.get('code', ''), body.get('cgId', ''), body.get('name', ''))
                self._send_json(400 if result.get('error') else 200, result)

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

            elif path == '/api/admin/correct-withdrawal':
                # Admin-only: one-off idempotent correction for an unrecorded
                # withdrawal. Defaults to DRY-RUN (writes nothing); pass
                # execute=true to apply (after out-of-band written confirmation).
                is_valid, error = _verify_admin(body, self)
                if not is_valid:
                    self._send_json(403, {"error": error})
                    return
                amount = body.get('amount')
                pool_value = body.get('totalPoolValue')
                if amount is None or pool_value is None:
                    self._send_json(400, {"error": "amount and totalPoolValue required"})
                    return
                try:
                    result = correct_unrecorded_withdrawal(
                        body.get('adminWallet'), float(amount), float(pool_value),
                        dry_run=not bool(body.get('execute', False)),
                    )
                except ValueError as e:
                    self._send_json(400, {"error": str(e)})
                    return
                self._send_json(200, result)

            elif path == '/api/admin/void-deposit':
                # Admin-only: void an accidental/duplicate deposit (reverses shares)
                is_valid, error = _verify_admin(body, self)
                if not is_valid:
                    self._send_json(403, {"error": error})
                    return
                tx_hash = body.get('txHash')
                if not tx_hash:
                    self._send_json(400, {"error": "txHash required"})
                    return
                try:
                    result = void_deposit(tx_hash)
                except ValueError as e:
                    self._send_json(400, {"error": str(e)})
                    return
                self._send_json(200, result)

            elif path == '/api/admin/reprice-deposit':
                # Admin-only: re-issue a deposit's shares at the correct NAV.
                # Repairs deposits minted at the wrong NAV (the old NAV $1.00
                # fallback). Defaults to a dry run — pass execute=true to apply.
                is_valid, error = _verify_admin(body, self)
                if not is_valid:
                    self._send_json(403, {"error": error})
                    return
                tx_hash = body.get('txHash')
                correct_nav = body.get('nav')
                if not tx_hash or correct_nav is None:
                    self._send_json(400, {"error": "txHash and nav required"})
                    return
                try:
                    result = reprice_deposit(
                        tx_hash, float(correct_nav),
                        dry_run=not bool(body.get('execute', False)),
                    )
                except ValueError as e:
                    self._send_json(400, {"error": str(e)})
                    return
                self._send_json(200, result)

            elif path == '/api/desk/note':
                # Server-to-server (Telegram bot) — auth via CRON_SECRET bearer token
                cron_secret = os.getenv('CRON_SECRET', '')
                auth = self.headers.get('Authorization', '')
                if not cron_secret or auth != f"Bearer {cron_secret}":
                    self._send_json(401, {"error": "unauthorized"})
                    return
                result = save_desk_note({
                    "type": body.get('type', 'text'),
                    "raw": body.get('raw', ''),
                    "transcript": body.get('transcript'),
                    "url": body.get('url'),
                    "source": body.get('source', 'telegram'),
                })
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
                keep_history = bool(body.get('keepHistory', True))
                result = reset_account(wallet, keep_history=keep_history)
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

            # ── Non-custodial trading (per-user Swyftx keys) ─────────────
            elif path == '/api/user/swyftx-key':
                wallet_address = body.get('walletAddress')
                api_key = body.get('apiKey')
                if not wallet_address or not api_key:
                    self._send_json(400, {"error": "walletAddress and apiKey required"})
                    return
                # Deliberately no try/except here beyond the outer handler —
                # ValueError (bad gate, bad key, Swyftx rejection) is caught
                # below and returned as a 400 with the specific reason, never
                # silently swallowed.
                result = save_user_swyftx_key(wallet_address, api_key)
                self._send_json(200, result)

            elif path == '/api/user/swyftx-key/remove':
                wallet_address = body.get('walletAddress')
                if not wallet_address:
                    self._send_json(400, {"error": "walletAddress required"})
                    return
                result = remove_user_swyftx_key(wallet_address)
                self._send_json(200, result)

            elif path == '/api/admin/link-master-key':
                # Admin-only: reuse the server's existing SWYFTX_API_KEY
                # (already configured for the legacy pooled bot) as this
                # wallet's own personal key, instead of re-pasting it.
                wallet_address = body.get('walletAddress')
                if not wallet_address:
                    self._send_json(400, {"error": "walletAddress required"})
                    return
                try:
                    result = link_admin_master_key(wallet_address)
                    self._send_json(200, result)
                except ValueError as e:
                    self._send_json(403, {"error": str(e)})
                    return

            elif path == '/api/user/auto-trade':
                # A wallet can toggle its own bot. An admin can ALSO toggle
                # any wallet's bot from their own session (e.g. the
                # Leaderboard's per-wallet admin controls) — requesterWallet
                # defaults to walletAddress so existing self-service callers
                # are unaffected.
                wallet_address = body.get('walletAddress')
                enabled = body.get('enabled')
                requester = body.get('requesterWallet') or wallet_address
                if not wallet_address or enabled is None:
                    self._send_json(400, {"error": "walletAddress and enabled required"})
                    return
                try:
                    result = set_user_auto_trade_enabled(wallet_address, bool(enabled), requester)
                    self._send_json(200, result)
                except ValueError as e:
                    self._send_json(403, {"error": str(e)})
                    return

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
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        # Some DB-returned dicts carry raw datetime fields that individual
        # handlers forget to isoformat() (e.g. pool_state's "initialized"/
        # "navUpdatedAt", or reprice_deposit's "repricedAt"). Fall back to a
        # generic datetime->ISO-string converter so one missed field doesn't
        # 500 the whole endpoint.
        self.wfile.write(json.dumps(data, default=_json_datetime_default).encode('utf-8'))

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
