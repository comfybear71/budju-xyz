# BUDJU Perpetual Trading System — User Manual

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Dashboard Overview](#2-dashboard-overview)
3. [Manual Trading](#3-manual-trading)
4. [Auto-Trading Bot](#4-auto-trading-bot)
5. [Strategy Guide](#5-strategy-guide)
6. [Position Management](#6-position-management)
7. [Risk Management](#7-risk-management)
8. [Tips & Best Practices](#8-tips--best-practices)

---

## 1. Getting Started

### What Is This?
The BUDJU Perpetual Trading System is a **paper trading simulator** that lets you practice trading perpetual futures with a virtual $10,000 USDC balance. No real money is at risk.

### How to Access
1. Go to https://budju.xyz
2. Connect your Solana wallet (Phantom, Solflare, or Jupiter)
3. Navigate to the **Trade** page
4. Open the **High Risk Dashboard** (the perps section)

### Your Starting Balance
- **$10,000 virtual USDC**
- Can be reset at any time via the dashboard header
- Tracks equity (balance + unrealized P&L), peak equity, and drawdown

### Supported Markets (10 Pairs)

| Symbol | Asset | Max Leverage |
|--------|-------|-------------|
| SOL-PERP | Solana | 50x |
| BTC-PERP | Bitcoin | 50x |
| ETH-PERP | Ethereum | 50x |
| DOGE-PERP | Dogecoin | 20x |
| AVAX-PERP | Avalanche | 20x |
| LINK-PERP | Chainlink | 20x |
| SUI-PERP | Sui | 20x |
| JUP-PERP | Jupiter | 20x |
| WIF-PERP | dogwifhat | 20x |
| BONK-PERP | Bonk | 20x |

---

## 2. Dashboard Overview

The dashboard has **9 tabs** accessible from the horizontal tab bar:

| Tab | Icon | What It Shows |
|-----|------|---------------|
| Charts | 📈 | Real-time price charts for all markets |
| Bot | ⚡ | Auto-trading strategies with on/off switches |
| Positions | 📍 | Your open positions with P&L |
| New Order | 📝 | Manual order form |
| Orders | 📋 | Pending limit/stop orders |
| Equity | 💹 | Equity curve over time |
| Metrics | 📊 | Win rate, Sharpe ratio, profit factor, etc. |
| History | 📋 | Closed trade history |
| AI | 🤖 | AI analysis of your trading |

### Header Information
- **Balance:** Your available USDC (excluding margin in use)
- **Equity:** Balance + unrealized P&L of all open positions
- **Open Positions:** Count of currently open trades
- **Unrealized P&L:** Total floating profit/loss

---

## 3. Manual Trading

### Placing a Trade
1. Go to the **New Order** tab
2. Select a market (e.g., SOL-PERP)
3. Choose direction: **Long** (betting price goes up) or **Short** (betting price goes down)
4. Set leverage (2x to 50x)
5. Enter position size in USD
6. Optionally set Stop Loss, Take Profit, and Trailing Stop
7. Click **Place Order**

### Understanding Leverage
- **2x leverage:** $100 position requires $50 margin. If price moves 1%, you profit/lose 2%.
- **10x leverage:** $100 position requires $10 margin. 1% price move = 10% gain/loss.
- **50x leverage:** $100 position requires $2 margin. 1% price move = 50% gain/loss.
- Higher leverage = higher risk of liquidation.

### Pending Orders (Limit & Stop)
Instead of entering at the current price, you can place orders that trigger at a specific price:

- **Limit Order:** Buy below current price / Sell above current price (catching dips/peaks)
- **Stop Order:** Buy above current price / Sell below current price (riding breakouts)

Go to **Orders** tab to see, manage, and cancel pending orders.

### Fees (Simulated)
- **Open/Close:** 0.06% of position size (matches Jupiter Perps)
- **Borrow Fee:** 0.01% per hour while position is open
- **Slippage:** 0.05-0.15% simulated based on position size

---

## 4. Auto-Trading Bot

### How to Enable
1. Go to the **Bot** tab (⚡ icon)
2. Toggle **individual strategies** ON using the slide switches
3. Toggle the **master Auto-Trading switch** ON at the top

### How It Works
- The bot runs **every minute** via a server-side cron job
- It fetches live prices from CoinGecko for all 10 markets
- Each enabled strategy scans for entry signals
- When conditions are met, the bot **automatically opens positions** with calculated size, stop loss, take profit, and trailing stop
- Positions are **automatically monitored** — SL/TP/liquidation/trailing checked every minute
- The bot also auto-closes positions when exit conditions trigger

### Price Data Collection
When you first enable the bot, it needs to collect price data before strategies can fire. You'll see progress bars showing candle count per market. Historical data is auto-seeded from Binance, so strategies activate almost immediately.

### What Each Toggle Controls
- **Individual strategy switches:** Enable/disable that specific strategy's signal detection
- **Master Auto-Trading switch:** Must be ON for ANY strategy to trade. Think of it as the global on/off.

---

## 5. Strategy Guide

### Strategy 1: Trend Following 📈
**Best for:** Strong directional markets (rallies, dumps)

**How it works:** Uses two moving averages (fast 9-period EMA and slow 21-period EMA). When the fast EMA crosses above the slow EMA, that's a bullish signal. When it crosses below, that's bearish. RSI (Relative Strength Index) confirms the signal isn't exhausted.

**When it trades:**
- **LONG:** Fast EMA crosses above Slow EMA + RSI between 35-65 + Price above 50 EMA trend
- **SHORT:** Fast EMA crosses below Slow EMA + RSI between 35-65 + Price below 50 EMA trend

**Risk settings:** 5x leverage, SL at 2x ATR, TP at 8x ATR (wide — trailing stop is the real exit), 1.5% trailing stop activates after +1.5% profit.

**What to expect:** Catches big moves but can miss during choppy sideways markets. This is a "let winners run" strategy.

---

### Strategy 2: Mean Reversion 🎯
**Best for:** Ranging/sideways markets with regular bounces

**How it works:** Uses Bollinger Bands (a statistical envelope around the average price). When price touches the lower band and RSI shows oversold conditions, it buys expecting a bounce back to the middle. Opposite for the upper band.

**When it trades:**
- **LONG:** Price at/below lower Bollinger Band + RSI ≤ 30
- **SHORT:** Price at/above upper Bollinger Band + RSI ≥ 70

**Risk settings:** 3x leverage, SL at 1.5x ATR (tighter since we expect reversal), TP targets the Bollinger middle band, 1% trailing stop.

**What to expect:** Frequent trades in choppy markets. Can get caught in strong trends that keep pushing past the bands.

**Note:** This strategy intentionally does NOT use the trend filter — its whole point is to fade overextensions.

---

### Strategy 3: Momentum Breakout 🚀
**Best for:** After consolidation periods, when markets start moving

**How it works:** Watches a 20-candle price range. When price breaks above the recent high (or below the recent low) with a candle that's 1.5x larger than average, it signals strong momentum. RSI confirms the direction.

**When it trades:**
- **LONG:** Price breaks above 20-candle high + candle > 1.5x average range + RSI > 50
- **SHORT:** Price breaks below 20-candle low + candle > 1.5x average range + RSI < 50

**Risk settings:** 5x leverage, wider 2.5x ATR stop (breakouts need room), very wide 10x ATR TP — trailing stop (2%) is the primary exit.

**What to expect:** Low frequency, high conviction. Best after quiet periods. Can have false breakouts.

---

### Strategy 4: Scalping ⚡ (Default: OFF)
**Best for:** Markets with regular oscillations

**How it works:** Detects quick RSI bounces combined with EMA slope direction. Enters on oversold/overbought conditions when the micro-trend confirms.

**When it trades:**
- **LONG:** RSI(7) ≤ 30 + EMA rising + price bouncing up
- **SHORT:** RSI(7) ≥ 70 + EMA falling + price dropping

**Risk settings:** 3x leverage, tight 1.5x ATR SL, quick 2.5x ATR TP, 1.5% trailing stop.

**Why disabled by default:** 1-minute candle data is noisy for scalping. Can overtrade. Enable if you want higher frequency but expect more whipsaws.

---

### Strategy 5: Keltner Channel 📐 (Default: OFF)
**Best for:** Versatile — works in both ranging and trending markets

**How it works:** Uses Keltner Channels (EMA ± ATR-based width) instead of Bollinger Bands. The key innovation: it **auto-detects Bollinger Squeeze** (when Bollinger Bands contract inside the Keltner Channel), signaling extremely low volatility.

**Two modes (automatic):**
- **Mean Reversion mode** (no squeeze): Trades bounces off channel boundaries when RSI is extreme
- **Breakout mode** (squeeze detected): Trades the explosive move when price breaks outside the channel after a squeeze

**When it trades:**
- **MR LONG:** Price at lower channel + RSI < 30 (bounce)
- **MR SHORT:** Price at upper channel + RSI > 70 (bounce)
- **BO LONG:** Price breaks above upper channel during squeeze release + RSI > 50
- **BO SHORT:** Price breaks below lower channel during squeeze release + RSI < 50

**Risk settings:** 3x leverage. Mean reversion: 1.5x ATR SL, 3x ATR TP, 1% trail. Breakout: 1.5x ATR SL, 5x ATR TP, 2% trail.

**What to expect:** Fewer trades than other strategies but higher quality. The squeeze detection filters out false breakouts.

---

### Strategy 6: BB Squeeze Breakout 💥 (Default: OFF)
**Best for:** Markets transitioning from low to high volatility

**How it works:** Monitors for "Bollinger Band Squeeze" — when Bollinger Bands contract inside Keltner Channels. This indicates a "coiled spring" of compressed volatility. When the squeeze releases (BB expands back outside KC), the strategy enters in the direction of momentum.

**Requires 3 confirmations:**
1. Minimum 8 consecutive squeeze bars (genuine compression, not noise)
2. Momentum oscillator (price vs SMA) confirms direction
3. Range expansion — current candle is 20%+ larger than 10-bar average

**When it trades:**
- **LONG:** Squeeze releases + momentum positive & rising + RSI > 50 + range expansion
- **SHORT:** Squeeze releases + momentum negative & falling + RSI < 50 + range expansion

**Risk settings:** 4x leverage (higher conviction), 2x ATR SL, 8x ATR TP (wide — trailing is primary exit), 2.5% trailing stop.

**What to expect:** Low frequency, high conviction. These trades tend to be explosive. Only enters within 3 bars of squeeze release — won't chase old breakouts.

---

### Strategy 7: Ninja Ambush 🥷 (Default: OFF)
**Best for:** Markets with clear technical structure (support/resistance)

**How it works:** Unlike other strategies that trade immediately, Ninja places **pending orders** at key technical levels and waits. It detects levels from 5 sources:
1. **Swing highs/lows** — local price extremes
2. **Bollinger Band extremes** — statistical outer boundaries
3. **Session levels** — previous hour's high/low
4. **Round psychological numbers** — $100, $150, etc.
5. **Liquidity sweep clusters** — groups of equal lows where stop-losses rest

Levels are scored by **confluence** — when multiple sources agree on the same price level, it scores higher. Only the top-ranked levels get orders.

**When it trades:** Automatically places limit orders at high-confluence levels. Orders execute when price reaches them. Refreshes analysis and cancels/replaces stale orders.

**Risk settings:** Conservative 2x leverage, 2.5x ATR SL, 6x ATR TP, 2% trailing, 24h order expiry. Max 8 pending orders across all markets.

**What to expect:** Patient strategy — orders sit and wait. When they trigger, they tend to have good entry prices at meaningful levels.

---

### Strategy 8: Grid Trading 📊 (Default: OFF)
**Best for:** Sideways/choppy markets with oscillation

**How it works:** Places a grid of buy limit orders below the current price and sell limit orders above it. As price oscillates up and down, it captures small profits at each grid level.

**Grid structure:**
- 5 buy levels below current price (spaced at 0.5x ATR)
- 5 sell levels above current price
- Each order has TP at the next grid level (one spacing away)
- Catastrophic stop at 3x grid spacing
- Auto-refreshes hourly or when price drifts too far from center

**Sizing options:**
- **Flat:** Same size at every level (default)
- **Smooth Martingale:** Each level is 1.3x the previous (gentler than classic 2x doubling)
- **Classic Martingale:** Each level is 2x the previous (aggressive, disabled by default)

**Risk settings:** Conservative 2x leverage, 0.5% equity per grid level, max 2 symbols running grids simultaneously.

**What to expect:** Steady small profits in choppy markets. Can lose significantly in strong directional moves that push past all grid levels.

---

### Strategy 9: Zone Recovery 🛡️ (Default: OFF)
**Best for:** Choppy markets with mean-reverting tendencies

**How it works:** This is a **forex Expert Advisor** pattern. Opens an initial trade, then if it moves against you, opens an **opposing hedge trade** at a larger size. The cycle continues — alternating directions with escalating sizes — until the net P&L of all positions in the "zone" turns positive.

**The key insight:** The larger recovery positions only need a small move to recover the smaller initial losses.

**Sizing modes:**
- **Smooth Martingale (default):** Each recovery level is 1.3x previous (much safer than classic 2x)
- **D'Alembert:** Additive — each level adds base_size (linear, very conservative)
- **Fibonacci:** Uses Fibonacci sequence (1, 1, 2, 3, 5, 8...) for natural progression

**Zone structure:**
- Zone width = 1.5x ATR (adapts to volatility)
- Profit target = 0.5x ATR
- Max 5 recovery levels per zone
- Max 2 active zones across all symbols
- 15% equity cap per zone

**Risk settings:** 3x leverage, 1% equity initial trade, smooth martingale escalation.

**What to expect:** Can recover from losing positions but at the cost of increasing exposure. If the market trends strongly past all 5 recovery levels, the zone is abandoned at a loss. Works best in range-bound conditions.

---

### Strategy 10: HF Scalper ⚡ (Default: OFF)
**Best for:** Maximum trade frequency — "any profit is good profit"

**Philosophy:** 1,000 trades × $1.50 profit = $1,500/day beats 2 trades × $15 = $30/day.

**How it works:** Runs 4 fast signal types across ALL 10 markets every minute:
1. **Micro EMA Cross** — Ultra-fast 3/8 EMA crossover (fires frequently)
2. **RSI Snap** — RSI(5) bouncing from 25/75 extremes
3. **Wick Rejection** — Price dips below local low then reverses
4. **Momentum Burst** — Current candle 1.5x larger than 10-bar average

**Key differences from other strategies:**
- **5-minute cooldown** (vs 2-hour default)
- **No correlation guard** — can trade BTC, ETH, SOL simultaneously
- **Multiple positions per symbol** — up to 5 per side
- **All 10 markets** — maximum opportunity surface
- **Tiny positions** — 0.5% equity (~$50) per trade

**Risk settings:** 5x leverage, very tight 0.5x ATR SL, quick 1x ATR TP, 0.5% trailing stop. Max 15 concurrent positions.

**What to expect:** Many trades, small wins and losses. Profit comes from volume, not individual trade size. Monitor total exposure — 15 positions × $50 = $750 margin in use.

---

## 6. Position Management

### Viewing Positions
Go to the **Positions** tab to see all open trades. Each card shows:
- Symbol, direction (LONG/SHORT), and leverage
- Entry price and current mark price
- Unrealized P&L ($ and %)
- Position type badge (CORE or SAT)
- Pyramid level badge (P1, P2, P3)
- Stop Loss, Take Profit, and Trailing Stop levels

### Position Actions

| Action | What It Does |
|--------|-------------|
| **Modify** | Change SL, TP, or trailing stop on an open position |
| **Close** | Close the entire position at current market price |
| **Partial Close** | Close 10-90% of the position (use the slider) |
| **Pyramid** | Add to a winning position (must be in profit) |
| **Flip** | Close position and immediately open opposite direction |
| **Core/Satellite** | Tag as "core" (conviction hold) or "satellite" (tactical trade) |

### Partial Close
- Use the slider in the expanded panel to choose how much to close (10% to 90%)
- The remaining position keeps its SL/TP/trailing settings
- Realized P&L from the closed portion credits your balance immediately

### Pyramiding (Adding to Winners)
- Only available when the position is in profit
- Each pyramid level adds 50% of the previous size
- Max 3 pyramid levels
- New margin is locked, and entry price recalculates as a weighted average

### Position Flipping
- Closes your current position and immediately opens the opposite direction
- Same size (or specify a custom size)
- Useful when you see the trend reversing

---

## 7. Risk Management

### Automatic Protections

| Protection | How It Works |
|-----------|-------------|
| **Stop Loss** | Automatically closes position when price hits your SL level |
| **Take Profit** | Automatically closes position when price hits your TP level |
| **Trailing Stop** | Follows price in your favor, locks in profit. Activates only after price moves favorably by the trailing %. |
| **Liquidation** | If your loss approaches your margin, the position is liquidated to protect remaining balance |
| **Daily Loss Limit** | If you lose 20% of equity in a day, all trading is paused |
| **Drawdown Protection** | Auto-reduces position sizes at 5% drawdown, stops trading at 10% drawdown |
| **Equity Curve Filter** | If your strategy's equity curve is trending down, automatically reduces position sizes |

### Understanding Trailing Stops
Trailing stops are **profit-activated**, not set from entry:
1. You set a 1.5% trailing stop
2. Position opens — only the fixed SL protects the downside
3. Price moves +1.5% in your favor — trailing stop **activates**
4. From now on, the stop follows the highest/lowest point, always staying 1.5% behind
5. If price reverses 1.5% from the peak, position closes at profit

This lets winners run while eventually locking in gains.

### Position Limits
- **5 positions per side per symbol** — you can have 5 longs AND 5 shorts on SOL simultaneously
- **50 total positions** soft global cap
- **30 pending orders** maximum

### Account Reset
If you want to start fresh, use the reset button in the dashboard header to restore your balance to $10,000 and clear all positions.

---

## 8. Tips & Best Practices

### Getting Started
1. Start with just **Trend Following** and **Mean Reversion** enabled — they complement each other
2. Watch the signals in the **Recent Signals** section of the Bot tab to understand when and why trades fire
3. Check your **Metrics** tab after 20-30 trades to see win rate and profit factor

### Strategy Combinations That Work Well Together

| Combo | Why |
|-------|-----|
| Trend Following + Mean Reversion | Trend catches big moves; Mean Rev profits in between |
| Keltner + BB Squeeze | Keltner handles normal conditions; Squeeze catches explosive moves |
| HF Scalper alone | High-frequency makes money from volume, best run standalone |
| Grid + Ninja | Grid profits from oscillation; Ninja catches key levels |

### What to Watch For
- **Check your equity curve** regularly — if it's trending down, consider disabling underperforming strategies
- **Monitor total margin in use** — too many open positions can leave you without capital for new trades
- **The HF Scalper** can generate many positions quickly — start it alone first to see how it behaves
- **Zone Recovery** increases exposure as it hedges — watch the zone count in the positions tab

### Strategy Performance Monitoring
- **Win Rate > 50%** for scalping strategies, **> 40%** for trend/breakout (they rely on big winners)
- **Profit Factor > 1.0** means you're profitable overall (gross profit / gross loss)
- **Sharpe Ratio > 1.0** indicates good risk-adjusted returns
- **Max Drawdown** shows your worst peak-to-trough decline — keep below 15-20%

### Understanding ATR (Average True Range)
All SL/TP values are described as "ATR multipliers" because they adapt to market volatility:
- **ATR = how much the price typically moves in an hour** (scaled from 1-minute data)
- **SL at 2x ATR** means your stop is 2 hours of typical movement away
- **TP at 8x ATR** means your target is 8 hours of typical movement
- This means stops are wider in volatile markets (more room) and tighter in quiet markets (less noise)

### The "Any Profit Is Good Profit" Approach
If you prefer many small wins over few large ones:
1. Enable **HF Scalper** — it trades every 5 minutes across all markets
2. Keep position sizes small (0.5% equity, ~$50)
3. The tight SL/TP (0.5x / 1.0x ATR) means trades resolve quickly
4. Volume makes the money — not individual trade size
5. Monitor your win rate in Metrics — aim for > 55%

---

*BUDJU Trading System Manual — Last updated March 14, 2026*
