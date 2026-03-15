"""
BUDJU VPS Trading Bot — Main entry point.

Runs three services in a single async process:
  1. Price Monitor  — fetches Jupiter prices every 5s
  2. Trader         — executes swaps, tracks positions
  3. API Server     — HTTP API for the dashboard (port 8420)

Usage:
  python main.py
"""

import asyncio
import signal
import logging
import sys
from typing import Optional

from config import MONGODB_URI, DB_NAME, DRY_RUN, TRADING_ENABLED
from price_monitor import PriceMonitor
from trader import Trader
from api_server import APIServer

# ── Logging ──────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("main")


# ── MongoDB ──────────────────────────────────────────────────

def get_db():
    """Connect to MongoDB, return database handle or None."""
    if not MONGODB_URI:
        logger.warning("No MONGODB_URI set — running without database")
        return None
    try:
        from pymongo import MongoClient
        client = MongoClient(MONGODB_URI)
        db = client[DB_NAME]
        # Test connection
        db.command("ping")
        logger.info("Connected to MongoDB: %s", DB_NAME)
        return db
    except Exception as e:
        logger.error("MongoDB connection failed: %s", e)
        return None


# ── Main ─────────────────────────────────────────────────────

async def main():
    logger.info("=" * 50)
    logger.info("BUDJU VPS Trading Bot starting...")
    logger.info("  Trading: %s | Dry Run: %s", TRADING_ENABLED, DRY_RUN)
    logger.info("=" * 50)

    # Connect to database
    db = get_db()

    # Initialize components
    price_monitor = PriceMonitor()
    trader = Trader(price_monitor, db)
    api_server = APIServer(price_monitor, trader)

    # Start all services
    await trader.start()
    await api_server.start()

    # Periodic position save
    async def save_loop():
        while True:
            await asyncio.sleep(60)
            await trader.save_positions()

    save_task = asyncio.create_task(save_loop())

    # Handle shutdown
    shutdown_event = asyncio.Event()

    def handle_signal():
        logger.info("Shutdown signal received")
        shutdown_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, handle_signal)

    # Run price monitor (this blocks until shutdown)
    monitor_task = asyncio.create_task(price_monitor.start())

    logger.info("All services running. Press Ctrl+C to stop.")

    # Wait for shutdown signal
    await shutdown_event.wait()

    # Clean shutdown
    logger.info("Shutting down...")
    await price_monitor.stop()
    await trader.save_positions()
    await trader.stop()
    save_task.cancel()
    logger.info("Goodbye!")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
