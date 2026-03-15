"""
Persistent price monitor — fetches prices from Jupiter Price API.
Runs continuously, updating prices every few seconds.
"""

import asyncio
import time
import logging
from typing import Dict, Optional

import aiohttp

from config import ASSETS, USDC_MINT, PRICE_CHECK_INTERVAL, JUPITER_API_KEY

logger = logging.getLogger("price_monitor")


class PriceMonitor:
    """Continuously monitors token prices via Jupiter Price API."""

    JUPITER_PRICE_URL = "https://api.jup.ag/price/v2"

    def __init__(self):
        self.prices: Dict[str, float] = {}          # symbol → USD price
        self.price_changes: Dict[str, float] = {}   # symbol → 24h % change
        self.last_update: float = 0
        self._running = False
        self._session: Optional[aiohttp.ClientSession] = None
        # Track price history for basic change calculation
        self._price_history: Dict[str, list] = {}    # symbol → [(timestamp, price)]
        self._history_window = 3600  # 1 hour of history

    async def start(self):
        """Start the price monitoring loop."""
        self._running = True
        self._session = aiohttp.ClientSession()
        logger.info("Price monitor started — checking every %ds", PRICE_CHECK_INTERVAL)

        while self._running:
            try:
                await self._fetch_prices()
            except Exception as e:
                logger.error("Price fetch error: %s", e)

            await asyncio.sleep(PRICE_CHECK_INTERVAL)

    async def stop(self):
        """Stop the price monitoring loop."""
        self._running = False
        if self._session:
            await self._session.close()
            self._session = None
        logger.info("Price monitor stopped")

    async def _fetch_prices(self):
        """Fetch current prices from Jupiter Price API."""
        if not self._session:
            return

        # Build comma-separated mint list
        mint_ids = ",".join(asset["mint"] for asset in ASSETS.values())

        try:
            headers = {}
            if JUPITER_API_KEY:
                headers["x-api-key"] = JUPITER_API_KEY

            async with self._session.get(
                self.JUPITER_PRICE_URL,
                params={"ids": mint_ids, "vsToken": USDC_MINT},
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status != 200:
                    logger.warning("Jupiter price API returned %d", resp.status)
                    return

                data = await resp.json()
                prices_data = data.get("data", {})

                now = time.time()
                for symbol, asset in ASSETS.items():
                    mint = asset["mint"]
                    if mint in prices_data and prices_data[mint].get("price"):
                        price = float(prices_data[mint]["price"])
                        old_price = self.prices.get(symbol)
                        self.prices[symbol] = price

                        # Track history
                        if symbol not in self._price_history:
                            self._price_history[symbol] = []
                        self._price_history[symbol].append((now, price))

                        # Trim old history
                        cutoff = now - self._history_window
                        self._price_history[symbol] = [
                            (t, p) for t, p in self._price_history[symbol] if t > cutoff
                        ]

                        # Calculate change from oldest price in history
                        history = self._price_history[symbol]
                        if len(history) > 1:
                            oldest_price = history[0][1]
                            if oldest_price > 0:
                                self.price_changes[symbol] = (
                                    (price - oldest_price) / oldest_price * 100
                                )

                self.last_update = now
                logger.debug(
                    "Prices updated: %d assets, e.g. SOL=$%.2f",
                    len(self.prices),
                    self.prices.get("SOL", 0),
                )

        except asyncio.TimeoutError:
            logger.warning("Jupiter price API timeout")
        except aiohttp.ClientError as e:
            logger.warning("Jupiter price API connection error: %s", e)

    def get_price(self, symbol: str) -> Optional[float]:
        """Get current price for a symbol."""
        return self.prices.get(symbol)

    def get_all_prices(self) -> Dict[str, dict]:
        """Get all prices with metadata."""
        result = {}
        for symbol in ASSETS:
            price = self.prices.get(symbol)
            if price is not None:
                result[symbol] = {
                    "price": price,
                    "change_pct": round(self.price_changes.get(symbol, 0), 2),
                    "mint": ASSETS[symbol]["mint"],
                }
        return result
