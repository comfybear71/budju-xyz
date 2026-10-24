# ==========================================
# Shared asset registry (Phase 2 — per-user auto-trade)
# ==========================================
# Deliberately a standalone copy of the coin list already used by
# auto-trade-cron.py (ASSET_CG_IDS) rather than importing from it — the
# pooled cron is live and battle-tested; it stays untouched so this new,
# separate per-user cron can't accidentally break it. Keep the two lists in
# sync by hand if a coin is added/removed from either.

# Asset code -> CoinGecko ID
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
    "JUP": "jupiter-exchange-solana", "LUNC": "terra-luna",
    "SKY": "sky", "SYRUP": "syrup", "LDO": "lido-dao",
}

# Coins the auto-trader must never buy (operator permanent denylist) —
# mirrors PERMANENT_BUY_DENYLIST in tradeApi.ts.
PERMANENT_BUY_DENYLIST = {"ENA", "PEPE", "LUNA", "LUNC"}

# Default universe a newly-enabled personal bot monitors: every tracked
# asset minus the permanent denylist.
DEFAULT_MONITORED_ASSETS = sorted(set(ASSET_CG_IDS.keys()) - PERMANENT_BUY_DENYLIST)
