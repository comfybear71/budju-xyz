"""
Trading bot configuration — asset list, token mints, and defaults.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── Solana token mint addresses ──────────────────────────────
# These are the SPL token mints on Solana mainnet.
# Not all 25+ assets from Swyftx exist as SPL tokens.
# We trade the ones available on Jupiter (Solana DEX).

USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
SOL_MINT = "So11111111111111111111111111111111111111112"
JLP_MINT = "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4"

# Assets available on Jupiter (Solana-native or wrapped)
# Format: {symbol: {mint, decimals, coingecko_id}}
ASSETS = {
    "SOL": {
        "mint": SOL_MINT,
        "decimals": 9,
        "coingecko_id": "solana",
    },
    "JUP": {
        "mint": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        "decimals": 6,
        "coingecko_id": "jupiter-exchange-solana",
    },
    "BONK": {
        "mint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        "decimals": 5,
        "coingecko_id": "bonk",
    },
    "WIF": {
        "mint": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
        "decimals": 6,
        "coingecko_id": "dogwifhat",
    },
    "RENDER": {
        "mint": "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
        "decimals": 8,
        "coingecko_id": "render-token",
    },
    "HNT": {
        "mint": "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
        "decimals": 8,
        "coingecko_id": "helium",
    },
    "PYTH": {
        "mint": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
        "decimals": 6,
        "coingecko_id": "pyth-network",
    },
    "RAY": {
        "mint": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
        "decimals": 6,
        "coingecko_id": "raydium",
    },
    "ORCA": {
        "mint": "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
        "decimals": 6,
        "coingecko_id": "orca",
    },
    "PEPE": {
        "mint": "Fe6RBBfxFSjnknTg4UhafCYFMaAfYnqEsMkBCrLUbP9B",
        "decimals": 8,
        "coingecko_id": "pepe",
    },
    "JTO": {
        "mint": "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
        "decimals": 9,
        "coingecko_id": "jito-governance-token",
    },
    "W": {
        "mint": "85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ",
        "decimals": 6,
        "coingecko_id": "wormhole",
    },
    "MOBILE": {
        "mint": "mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6",
        "decimals": 6,
        "coingecko_id": "helium-mobile",
    },
    "MSOL": {
        "mint": "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
        "decimals": 9,
        "coingecko_id": "msol",
    },
    "JITOSOL": {
        "mint": "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
        "decimals": 9,
        "coingecko_id": "jito-staked-sol",
    },
    "JLP": {
        "mint": JLP_MINT,
        "decimals": 6,
        "coingecko_id": "jupiter-perpetuals-liquidity-provider-token",
    },
}

# ── Environment config ───────────────────────────────────────

HELIUS_API_KEY = os.getenv("HELIUS_API_KEY", "")
HELIUS_RPC = f"https://mainnet.helius-rpc.com/?api-key={HELIUS_API_KEY}"

MONGODB_URI = os.getenv("MONGODB_URI", "")
DB_NAME = os.getenv("DB_NAME", "flub")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

TRADING_WALLET_KEY = os.getenv("TRADING_WALLET_KEY", "")

TRADING_ENABLED = os.getenv("TRADING_ENABLED", "true").lower() == "true"
DRY_RUN = os.getenv("DRY_RUN", "true").lower() == "true"

MAX_SINGLE_TRADE_USD = float(os.getenv("MAX_SINGLE_TRADE_USD", "50"))
MAX_DAILY_TRADES = int(os.getenv("MAX_DAILY_TRADES", "50"))
MAX_DAILY_LOSS_USD = float(os.getenv("MAX_DAILY_LOSS_USD", "200"))

API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8420"))
API_SECRET = os.getenv("API_SECRET", "")
JUPITER_API_KEY = os.getenv("JUPITER_API_KEY", "")

# Price check interval in seconds
PRICE_CHECK_INTERVAL = 5

# Slippage tolerance in basis points (50 = 0.5%)
DEFAULT_SLIPPAGE_BPS = 50
