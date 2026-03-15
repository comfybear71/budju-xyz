"""
Trade execution via Jupiter Swap API.
Signs and submits Solana transactions using a local hot wallet.
"""

import asyncio
import time
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, List

import aiohttp
import base58
from solders.keypair import Keypair
from solders.transaction import VersionedTransaction

from config import (
    ASSETS, USDC_MINT, HELIUS_RPC,
    TRADING_WALLET_KEY, TRADING_ENABLED, DRY_RUN,
    MAX_SINGLE_TRADE_USD, MAX_DAILY_TRADES, MAX_DAILY_LOSS_USD,
    DEFAULT_SLIPPAGE_BPS,
)
from price_monitor import PriceMonitor

logger = logging.getLogger("trader")


class Trader:
    """Executes swaps on Jupiter and tracks positions."""

    JUPITER_QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote"
    JUPITER_SWAP_URL = "https://lite-api.jup.ag/swap/v1/swap"

    def __init__(self, price_monitor: PriceMonitor, db=None):
        self.price_monitor = price_monitor
        self.db = db
        self._session: Optional[aiohttp.ClientSession] = None
        self._keypair: Optional[Keypair] = None

        # Portfolio: symbol → {"amount": float, "avg_entry": float}
        self.positions: Dict[str, dict] = {}
        self.usdc_balance: float = 0.0

        # Daily circuit breakers
        self._daily_trades: List[dict] = []
        self._daily_pnl: float = 0.0
        self._day_start: str = ""

        # Trade history (in-memory, last 100)
        self.trade_history: List[dict] = []

    async def start(self):
        """Initialize the trader."""
        self._session = aiohttp.ClientSession()

        if TRADING_WALLET_KEY:
            try:
                key_bytes = base58.b58decode(TRADING_WALLET_KEY)
                self._keypair = Keypair.from_bytes(key_bytes)
                pubkey = str(self._keypair.pubkey())
                logger.info("Trading wallet loaded: %s...%s", pubkey[:4], pubkey[-4:])
            except Exception as e:
                logger.error("Failed to load trading wallet: %s", e)
                self._keypair = None
        else:
            logger.warning("No TRADING_WALLET_KEY set — dry run only")

        # Load positions from DB if available
        if self.db is not None:
            await self._load_positions()

        logger.info(
            "Trader started — enabled=%s, dry_run=%s, max_trade=$%.0f",
            TRADING_ENABLED, DRY_RUN, MAX_SINGLE_TRADE_USD,
        )

    async def stop(self):
        """Shut down the trader."""
        if self._session:
            await self._session.close()
            self._session = None
        logger.info("Trader stopped")

    def get_wallet_address(self) -> Optional[str]:
        """Return the public key of the trading wallet."""
        if self._keypair:
            return str(self._keypair.pubkey())
        return None

    # ── Circuit breakers ─────────────────────────────────────

    def _check_circuit_breakers(self, usd_amount: float) -> Optional[str]:
        """Check if a trade should be blocked. Returns reason or None."""
        if not TRADING_ENABLED:
            return "Trading is disabled (TRADING_ENABLED=false)"

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if today != self._day_start:
            self._daily_trades = []
            self._daily_pnl = 0.0
            self._day_start = today

        if usd_amount > MAX_SINGLE_TRADE_USD:
            return f"Trade ${usd_amount:.2f} exceeds max ${MAX_SINGLE_TRADE_USD:.2f}"

        if len(self._daily_trades) >= MAX_DAILY_TRADES:
            return f"Daily trade limit reached ({MAX_DAILY_TRADES})"

        if self._daily_pnl < -MAX_DAILY_LOSS_USD:
            return f"Daily loss limit reached (${abs(self._daily_pnl):.2f})"

        return None

    # ── Trade execution ──────────────────────────────────────

    async def buy(self, symbol: str, usd_amount: float, slippage_bps: int = DEFAULT_SLIPPAGE_BPS) -> dict:
        """Buy a token with USDC."""
        if symbol not in ASSETS:
            return {"success": False, "error": f"Unknown asset: {symbol}"}

        block_reason = self._check_circuit_breakers(usd_amount)
        if block_reason:
            return {"success": False, "error": block_reason}

        asset = ASSETS[symbol]
        # Convert USD to USDC lamports (6 decimals)
        usdc_lamports = int(usd_amount * 1_000_000)

        result = await self._execute_swap(
            input_mint=USDC_MINT,
            output_mint=asset["mint"],
            amount=usdc_lamports,
            slippage_bps=slippage_bps,
        )

        if result["success"]:
            # Calculate received amount
            out_amount = result.get("out_amount", 0)
            token_amount = out_amount / (10 ** asset["decimals"])
            price = self.price_monitor.get_price(symbol) or (usd_amount / token_amount if token_amount > 0 else 0)

            # Update position
            pos = self.positions.get(symbol, {"amount": 0, "avg_entry": 0, "total_cost": 0})
            pos["total_cost"] = pos.get("total_cost", pos["amount"] * pos["avg_entry"]) + usd_amount
            pos["amount"] += token_amount
            pos["avg_entry"] = pos["total_cost"] / pos["amount"] if pos["amount"] > 0 else 0
            self.positions[symbol] = pos

            trade = {
                "symbol": symbol,
                "side": "buy",
                "amount": token_amount,
                "price": price,
                "usd_value": usd_amount,
                "tx": result.get("tx_signature", "dry_run"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            self._record_trade(trade)
            logger.info("BUY %s: %.6f @ $%.4f ($%.2f) tx=%s", symbol, token_amount, price, usd_amount, trade["tx"])
            return {"success": True, "trade": trade}

        return result

    async def sell(self, symbol: str, pct: float = 100.0, slippage_bps: int = DEFAULT_SLIPPAGE_BPS) -> dict:
        """Sell a percentage of a token position for USDC."""
        if symbol not in ASSETS:
            return {"success": False, "error": f"Unknown asset: {symbol}"}

        pos = self.positions.get(symbol)
        if not pos or pos["amount"] <= 0:
            return {"success": False, "error": f"No position in {symbol}"}

        asset = ASSETS[symbol]
        sell_amount = pos["amount"] * (min(pct, 100) / 100)
        token_lamports = int(sell_amount * (10 ** asset["decimals"]))

        if token_lamports <= 0:
            return {"success": False, "error": "Amount too small to sell"}

        price = self.price_monitor.get_price(symbol) or 0
        usd_value = sell_amount * price

        block_reason = self._check_circuit_breakers(usd_value)
        if block_reason:
            return {"success": False, "error": block_reason}

        result = await self._execute_swap(
            input_mint=asset["mint"],
            output_mint=USDC_MINT,
            amount=token_lamports,
            slippage_bps=slippage_bps,
        )

        if result["success"]:
            out_amount = result.get("out_amount", 0)
            usdc_received = out_amount / 1_000_000  # USDC has 6 decimals

            # Calculate PnL
            cost_basis = pos.get("avg_entry", 0) * sell_amount
            pnl = usdc_received - cost_basis

            # Update position
            pos["amount"] -= sell_amount
            if pos["amount"] < 0.000001:
                del self.positions[symbol]

            self._daily_pnl += pnl

            trade = {
                "symbol": symbol,
                "side": "sell",
                "amount": sell_amount,
                "price": price,
                "usd_value": usdc_received,
                "pnl": round(pnl, 2),
                "tx": result.get("tx_signature", "dry_run"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            self._record_trade(trade)
            logger.info(
                "SELL %s: %.6f @ $%.4f ($%.2f, PnL: $%.2f) tx=%s",
                symbol, sell_amount, price, usdc_received, pnl, trade["tx"],
            )
            return {"success": True, "trade": trade}

        return result

    async def _execute_swap(self, input_mint: str, output_mint: str, amount: int, slippage_bps: int) -> dict:
        """Execute a Jupiter swap."""
        if not self._session:
            return {"success": False, "error": "Trader not started"}

        # Step 1: Get quote
        try:
            async with self._session.get(
                self.JUPITER_QUOTE_URL,
                params={
                    "inputMint": input_mint,
                    "outputMint": output_mint,
                    "amount": str(amount),
                    "slippageBps": str(slippage_bps),
                },
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    return {"success": False, "error": f"Quote failed ({resp.status}): {error_text}"}
                quote = await resp.json()
        except Exception as e:
            return {"success": False, "error": f"Quote request failed: {e}"}

        out_amount = int(quote.get("outAmount", 0))
        price_impact = quote.get("priceImpactPct", "0")

        # Safety: reject high price impact
        if float(price_impact) > 2.0:
            return {
                "success": False,
                "error": f"Price impact too high: {price_impact}%",
            }

        if DRY_RUN:
            logger.info(
                "DRY RUN: %s → %s, amount=%d, outAmount=%d, impact=%s%%",
                input_mint[:8], output_mint[:8], amount, out_amount, price_impact,
            )
            return {"success": True, "out_amount": out_amount, "tx_signature": "dry_run", "dry_run": True}

        if not self._keypair:
            return {"success": False, "error": "No trading wallet configured"}

        # Step 2: Get swap transaction
        try:
            wallet_pubkey = str(self._keypair.pubkey())
            async with self._session.post(
                self.JUPITER_SWAP_URL,
                json={
                    "quoteResponse": quote,
                    "userPublicKey": wallet_pubkey,
                    "wrapAndUnwrapSol": True,
                    "dynamicComputeUnitLimit": True,
                    "prioritizationFeeLamports": "auto",
                },
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    return {"success": False, "error": f"Swap request failed ({resp.status}): {error_text}"}
                swap_data = await resp.json()
        except Exception as e:
            return {"success": False, "error": f"Swap request failed: {e}"}

        # Step 3: Sign and send transaction
        try:
            swap_tx_b64 = swap_data.get("swapTransaction")
            if not swap_tx_b64:
                return {"success": False, "error": "No swapTransaction in response"}

            import base64
            tx_bytes = base64.b64decode(swap_tx_b64)
            tx = VersionedTransaction.from_bytes(tx_bytes)

            # Sign the transaction
            signed_tx = VersionedTransaction(tx.message, [self._keypair])
            signed_bytes = bytes(signed_tx)

            # Send via Helius RPC
            async with self._session.post(
                HELIUS_RPC,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "sendTransaction",
                    "params": [
                        base64.b64encode(signed_bytes).decode("utf-8"),
                        {"encoding": "base64", "skipPreflight": False, "maxRetries": 3},
                    ],
                },
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                rpc_result = await resp.json()

            if "error" in rpc_result:
                return {"success": False, "error": f"RPC error: {rpc_result['error']}"}

            tx_signature = rpc_result.get("result", "")
            logger.info("Transaction sent: %s", tx_signature)

            return {"success": True, "out_amount": out_amount, "tx_signature": tx_signature}

        except Exception as e:
            return {"success": False, "error": f"Transaction signing/sending failed: {e}"}

    def _record_trade(self, trade: dict):
        """Record a trade in memory and daily tracking."""
        self.trade_history.append(trade)
        if len(self.trade_history) > 100:
            self.trade_history = self.trade_history[-100:]
        self._daily_trades.append(trade)

        # Persist to DB if available
        if self.db is not None:
            asyncio.create_task(self._save_trade(trade))

    async def _save_trade(self, trade: dict):
        """Persist trade to MongoDB."""
        try:
            if self.db is not None:
                collection = self.db["vps_trades"]
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: collection.insert_one(trade.copy())
                )
        except Exception as e:
            logger.error("Failed to save trade to DB: %s", e)

    async def _load_positions(self):
        """Load positions from MongoDB."""
        try:
            if self.db is not None:
                collection = self.db["vps_positions"]
                doc = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: collection.find_one({"_id": "positions"})
                )
                if doc and "positions" in doc:
                    self.positions = doc["positions"]
                    logger.info("Loaded %d positions from DB", len(self.positions))
        except Exception as e:
            logger.error("Failed to load positions from DB: %s", e)

    async def save_positions(self):
        """Persist current positions to MongoDB."""
        try:
            if self.db is not None:
                collection = self.db["vps_positions"]
                await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: collection.replace_one(
                        {"_id": "positions"},
                        {"_id": "positions", "positions": self.positions},
                        upsert=True,
                    ),
                )
        except Exception as e:
            logger.error("Failed to save positions to DB: %s", e)

    def get_portfolio(self) -> dict:
        """Return current portfolio with live values."""
        holdings = {}
        total_value = 0.0

        for symbol, pos in self.positions.items():
            price = self.price_monitor.get_price(symbol) or 0
            value = pos["amount"] * price
            pnl = value - (pos.get("total_cost", pos["amount"] * pos.get("avg_entry", 0)))
            holdings[symbol] = {
                "amount": pos["amount"],
                "avg_entry": pos.get("avg_entry", 0),
                "current_price": price,
                "value": round(value, 2),
                "pnl": round(pnl, 2),
                "pnl_pct": round((pnl / pos.get("total_cost", 1)) * 100, 2) if pos.get("total_cost", 0) > 0 else 0,
            }
            total_value += value

        return {
            "holdings": holdings,
            "total_value": round(total_value, 2),
            "daily_pnl": round(self._daily_pnl, 2),
            "daily_trades": len(self._daily_trades),
            "wallet": self.get_wallet_address(),
        }
