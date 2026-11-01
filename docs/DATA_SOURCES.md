# Data sources we tested (Nov 2026)

What we learned from the admin test cards, kept here so the cards could be removed.

## CoinGecko (API Basic plan, ~$29/month)
Works with our key (header `x-cg-pro-api-key`, base `pro-api.coingecko.com`):
- On-chain Solana pools: trending, newest, top (20 items each, <0.5s).
- Recent trades in a pool: last 300 trades **with the trader's wallet address**, size and time.
Locked (HTTP 401 "Analyst plan or above"):
- Top holders of a token, top traders of a token.
Used by: the Signals active-wallet finder (`api/wallet_finder.py`, `api/copytrade_finder.py`).

## Hyperliquid (public, no key)
- Leaderboard JSON: `stats-data.hyperliquid.xyz/Mainnet/leaderboard` (~48k traders) and `api.hyperliquid.xyz/info`
  (`clearinghouseState`, `userFills`). Reachable and fast.
- The top of the profit leaderboard is dominated by market makers / hedged books: 100% win rates, all-short books,
  $10M–$130M accounts. Not copyable, and Swyftx has no shorts or leverage. **Parked.**

## Strategy Lab result (daily prices, 1 year, 51 coins)
Current sell levels vs trailing / wider / hold-winners / volatility-scaled: top three within ~1.5 points (noise);
no clear winner in both halves. Coin selection matters more than the sell rule.
