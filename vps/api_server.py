"""
HTTP API server — exposes the trading bot to the frontend dashboard.
Runs alongside the price monitor and trader in the same process.
"""

import json
import logging
import hashlib
import hmac
import time
from typing import Optional

from aiohttp import web

from config import API_HOST, API_PORT, API_SECRET, ASSETS, DRY_RUN, TRADING_ENABLED
from price_monitor import PriceMonitor
from trader import Trader

logger = logging.getLogger("api_server")


def verify_auth(request: web.Request) -> bool:
    """Verify the API secret from the Authorization header."""
    if not API_SECRET:
        return True  # No secret = open (dev mode)

    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        # Simple token check, or HMAC-based
        return hmac.compare_digest(token, API_SECRET)
    return False


def json_response(data: dict, status: int = 200) -> web.Response:
    """Return a JSON response with CORS headers."""
    return web.Response(
        text=json.dumps(data),
        status=status,
        content_type="application/json",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
    )


class APIServer:
    """HTTP API for the trading dashboard."""

    def __init__(self, price_monitor: PriceMonitor, trader: Trader):
        self.price_monitor = price_monitor
        self.trader = trader
        self.app = web.Application()
        self._setup_routes()

    def _setup_routes(self):
        self.app.router.add_route("OPTIONS", "/{path:.*}", self._handle_options)
        self.app.router.add_get("/api/health", self._health)
        self.app.router.add_get("/api/prices", self._get_prices)
        self.app.router.add_get("/api/portfolio", self._get_portfolio)
        self.app.router.add_get("/api/trades", self._get_trades)
        self.app.router.add_get("/api/assets", self._get_assets)
        self.app.router.add_get("/api/status", self._get_status)
        self.app.router.add_post("/api/buy", self._buy)
        self.app.router.add_post("/api/sell", self._sell)

    async def _handle_options(self, request: web.Request) -> web.Response:
        return json_response({})

    async def _health(self, request: web.Request) -> web.Response:
        return json_response({
            "status": "ok",
            "uptime": time.time(),
            "prices_count": len(self.price_monitor.prices),
            "last_price_update": self.price_monitor.last_update,
            "trading_enabled": TRADING_ENABLED,
            "dry_run": DRY_RUN,
            "wallet": self.trader.get_wallet_address(),
        })

    async def _get_prices(self, request: web.Request) -> web.Response:
        return json_response({
            "prices": self.price_monitor.get_all_prices(),
            "last_update": self.price_monitor.last_update,
        })

    async def _get_portfolio(self, request: web.Request) -> web.Response:
        if not verify_auth(request):
            return json_response({"error": "Unauthorized"}, 401)
        return json_response(self.trader.get_portfolio())

    async def _get_trades(self, request: web.Request) -> web.Response:
        if not verify_auth(request):
            return json_response({"error": "Unauthorized"}, 401)

        limit = int(request.query.get("limit", "50"))
        trades = self.trader.trade_history[-limit:]
        trades.reverse()  # Most recent first
        return json_response({"trades": trades})

    async def _get_assets(self, request: web.Request) -> web.Response:
        """Return list of tradeable assets with current prices."""
        assets = []
        for symbol, info in ASSETS.items():
            price = self.price_monitor.get_price(symbol)
            assets.append({
                "symbol": symbol,
                "mint": info["mint"],
                "decimals": info["decimals"],
                "price": price,
                "change_pct": self.price_monitor.price_changes.get(symbol, 0),
            })
        # Sort by symbol
        assets.sort(key=lambda a: a["symbol"])
        return json_response({"assets": assets})

    async def _get_status(self, request: web.Request) -> web.Response:
        """Full bot status for the dashboard."""
        portfolio = self.trader.get_portfolio()
        return json_response({
            "trading_enabled": TRADING_ENABLED,
            "dry_run": DRY_RUN,
            "wallet": self.trader.get_wallet_address(),
            "portfolio": portfolio,
            "prices_count": len(self.price_monitor.prices),
            "last_price_update": self.price_monitor.last_update,
            "recent_trades": self.trader.trade_history[-10:][::-1],
        })

    async def _buy(self, request: web.Request) -> web.Response:
        if not verify_auth(request):
            return json_response({"error": "Unauthorized"}, 401)

        try:
            body = await request.json()
        except Exception:
            return json_response({"error": "Invalid JSON"}, 400)

        symbol = body.get("symbol", "").upper()
        amount = float(body.get("amount", 0))

        if not symbol or amount <= 0:
            return json_response({"error": "symbol and amount (USD) required"}, 400)

        result = await self.trader.buy(symbol, amount)
        status = 200 if result["success"] else 400
        return json_response(result, status)

    async def _sell(self, request: web.Request) -> web.Response:
        if not verify_auth(request):
            return json_response({"error": "Unauthorized"}, 401)

        try:
            body = await request.json()
        except Exception:
            return json_response({"error": "Invalid JSON"}, 400)

        symbol = body.get("symbol", "").upper()
        pct = float(body.get("pct", 100))

        if not symbol:
            return json_response({"error": "symbol required"}, 400)

        result = await self.trader.sell(symbol, pct)
        status = 200 if result["success"] else 400
        return json_response(result, status)

    async def start(self):
        """Start the API server."""
        runner = web.AppRunner(self.app)
        await runner.setup()
        site = web.TCPSite(runner, API_HOST, API_PORT)
        await site.start()
        logger.info("API server started on http://%s:%d", API_HOST, API_PORT)
