# ==========================================
# Perpetual Trading — Backtesting Engine
# ==========================================
# Simulates strategy execution against historical price data
# with realistic fees, slippage, and position management.
#
# Uses the EXACT same strategy functions from perp_strategies.py
# to ensure backtest results match live behavior.
#
# Fee model (mirrors perp_engine.py):
#   - Open/close: 0.06% of position size
#   - Slippage: 0.1% simulated (mid-range of 0.05-0.15%)
#   - Borrow fee: 0.01%/hr accumulated
#
# Position sizing uses the same ATR-based risk model
# from perp_strategies.calculate_position_size().
# ==========================================

import os
import sys
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, os.path.dirname(__file__))

# Import strategy functions and helpers directly — no DB dependency
from perp_strategies import (
    strategy_trend_following,
    strategy_mean_reversion,
    strategy_momentum,
    strategy_scalping,
    DEFAULT_STRATEGIES,
    STRATEGY_FUNCS,
    MIN_CANDLES,
    COOLDOWN_MINUTES,
    MAX_POSITION_PCT,
    calculate_position_size,
    atr as calc_atr,
)
from perp_engine import (
    OPEN_CLOSE_FEE_PCT,
    BORROW_FEE_PCT_HR,
    INITIAL_BALANCE,
    calculate_liquidation_price,
    calculate_maintenance_margin,
)


# ── Constants ────────────────────────────────────────────────────────────

BACKTEST_SLIPPAGE_PCT = 0.001   # 0.1% — middle of 0.05-0.15% range
MIN_BARS_WARMUP = 60            # Bars to skip at start for indicator warmup


# ── Simulated Position ──────────────────────────────────────────────────

class SimPosition:
    """A simulated open position tracked during backtest."""

    def __init__(self, direction: str, entry_price: float, size_usd: float,
                 leverage: int, stop_loss: float, take_profit: float,
                 trailing_stop_pct: float, trailing_activation_pct: float,
                 entry_bar: int, entry_fee: float, signal: str):
        self.direction = direction
        self.entry_price = entry_price
        self.size_usd = size_usd
        self.leverage = leverage
        self.margin = size_usd / leverage
        self.stop_loss = stop_loss
        self.take_profit = take_profit
        self.trailing_stop_pct = trailing_stop_pct
        self.trailing_activation_pct = trailing_activation_pct
        self.trailing_stop_price = None
        self.trailing_activated = False
        self.entry_bar = entry_bar
        self.entry_fee = entry_fee
        self.signal = signal
        self.cumulative_borrow_fee = 0.0
        self.bars_held = 0
        self.peak_price = entry_price  # For trailing stop (long)
        self.trough_price = entry_price  # For trailing stop (short)

        # Calculate liquidation price
        self.liquidation_price = calculate_liquidation_price(
            entry_price, leverage, direction
        )

        # Calculate trailing stop activation price
        if trailing_activation_pct and trailing_activation_pct > 0:
            if direction == "long":
                self.activation_price = entry_price * (1 + trailing_activation_pct / 100)
            else:
                self.activation_price = entry_price * (1 - trailing_activation_pct / 100)
        else:
            self.activation_price = None

    def update(self, price: float) -> Optional[str]:
        """Update position with new price. Returns exit_type or None."""
        self.bars_held += 1

        # Accumulate borrow fee every 60 bars (1 hour of 1-min candles)
        if self.bars_held % 60 == 0:
            self.cumulative_borrow_fee += self.size_usd * BORROW_FEE_PCT_HR

        # 1. Liquidation check (highest priority)
        if self.direction == "long" and price <= self.liquidation_price:
            return "liquidation"
        if self.direction == "short" and price >= self.liquidation_price:
            return "liquidation"

        # 2. Stop loss
        if self.stop_loss is not None:
            if self.direction == "long" and price <= self.stop_loss:
                return "stop_loss"
            if self.direction == "short" and price >= self.stop_loss:
                return "stop_loss"

        # 3. Take profit
        if self.take_profit is not None:
            if self.direction == "long" and price >= self.take_profit:
                return "take_profit"
            if self.direction == "short" and price <= self.take_profit:
                return "take_profit"

        # 4. Trailing stop — mirrors perp_engine.update_position_price()
        if self.trailing_stop_pct and self.trailing_stop_pct > 0:
            # Check activation
            if not self.trailing_activated and self.activation_price:
                if self.direction == "long" and price >= self.activation_price:
                    self.trailing_activated = True
                elif self.direction == "short" and price <= self.activation_price:
                    self.trailing_activated = True

            if self.trailing_activated:
                if self.direction == "long":
                    new_trail = price * (1 - self.trailing_stop_pct / 100)
                    if self.trailing_stop_price is None or new_trail > self.trailing_stop_price:
                        self.trailing_stop_price = new_trail
                    if price <= self.trailing_stop_price:
                        return "trailing_stop"
                else:
                    new_trail = price * (1 + self.trailing_stop_pct / 100)
                    if self.trailing_stop_price is None or new_trail < self.trailing_stop_price:
                        self.trailing_stop_price = new_trail
                    if price >= self.trailing_stop_price:
                        return "trailing_stop"

        return None

    def close_pnl(self, exit_price: float) -> Tuple[float, float, float]:
        """Calculate exit P&L. Returns (gross_pnl, total_fees, net_pnl)."""
        # Apply slippage to exit (adverse direction)
        if self.direction == "long":
            fill_price = exit_price * (1 - BACKTEST_SLIPPAGE_PCT)
        else:
            fill_price = exit_price * (1 + BACKTEST_SLIPPAGE_PCT)

        # Gross P&L
        if self.direction == "long":
            pnl_pct = (fill_price - self.entry_price) / self.entry_price
        else:
            pnl_pct = (self.entry_price - fill_price) / self.entry_price
        gross_pnl = self.size_usd * pnl_pct

        # Exit fee
        exit_fee = self.size_usd * OPEN_CLOSE_FEE_PCT

        # Total fees = entry + exit + borrow
        total_fees = self.entry_fee + exit_fee + self.cumulative_borrow_fee

        net_pnl = gross_pnl - total_fees
        return gross_pnl, total_fees, net_pnl


# ── Core Backtest Engine ─────────────────────────────────────────────────

def backtest_strategy(strategy_name: str, prices: List[float],
                      config: Dict = None, initial_balance: float = 10000,
                      leverage: int = 3) -> Dict:
    """
    Run a single strategy backtest against historical price data.

    Args:
        strategy_name: One of "trend_following", "mean_reversion", "momentum", "scalping"
        prices: List of closing prices at 1-minute intervals (chronological)
        config: Strategy config dict (uses DEFAULT_STRATEGIES[strategy_name] if None)
        initial_balance: Starting balance in USD
        leverage: Default leverage (overridden by config if present)

    Returns:
        Dict with metrics, trades list, and equity curve
    """
    if strategy_name not in STRATEGY_FUNCS:
        raise ValueError(f"Unknown strategy: {strategy_name}. "
                         f"Available: {list(STRATEGY_FUNCS.keys())}")

    strategy_func = STRATEGY_FUNCS[strategy_name]
    strat_config = config or DEFAULT_STRATEGIES.get(strategy_name, {})
    leverage = strat_config.get("leverage", leverage)
    sl_mult = strat_config.get("sl_atr_mult", 2.0)
    tp_mult = strat_config.get("tp_atr_mult", 3.0)
    trailing_pct = strat_config.get("trailing_stop_pct", 0)
    trailing_activation = strat_config.get("trailing_activation_pct", 0)
    cooldown_bars = strat_config.get("cooldown_bars", COOLDOWN_MINUTES)

    if len(prices) < MIN_BARS_WARMUP + MIN_CANDLES:
        raise ValueError(
            f"Need at least {MIN_BARS_WARMUP + MIN_CANDLES} price bars, "
            f"got {len(prices)}"
        )

    # State
    balance = initial_balance
    equity = initial_balance
    peak_equity = initial_balance
    position: Optional[SimPosition] = None
    last_trade_bar = -cooldown_bars  # Allow immediate first trade

    # Results tracking
    trades = []
    equity_curve = []
    daily_returns = []  # For Sharpe calculation

    # Walk through price bars
    for bar_idx in range(MIN_BARS_WARMUP, len(prices)):
        current_price = prices[bar_idx]

        # Calculate current equity
        if position:
            if position.direction == "long":
                unrealized_pct = (current_price - position.entry_price) / position.entry_price
            else:
                unrealized_pct = (position.entry_price - current_price) / position.entry_price
            unrealized_pnl = position.size_usd * unrealized_pct
            equity = balance + position.margin + unrealized_pnl
        else:
            equity = balance

        # Track peak equity and record equity curve (every 60 bars = 1 hour)
        peak_equity = max(peak_equity, equity)
        if bar_idx % 60 == 0:
            equity_curve.append({
                "bar": bar_idx,
                "equity": round(equity, 2),
                "price": current_price,
            })

        # Check open position for exit signals
        if position:
            exit_type = position.update(current_price)
            if exit_type:
                # Close position
                gross_pnl, total_fees, net_pnl = position.close_pnl(current_price)

                # Liquidation: lose entire margin
                if exit_type == "liquidation":
                    net_pnl = -(position.margin + position.entry_fee)
                    total_fees = position.entry_fee + position.cumulative_borrow_fee
                    gross_pnl = net_pnl + total_fees

                # Return margin + P&L to balance
                balance += position.margin + gross_pnl - (
                    position.size_usd * OPEN_CLOSE_FEE_PCT  # exit fee
                )
                if exit_type == "liquidation":
                    balance = equity  # Just set to current equity on liquidation

                trades.append({
                    "entry_bar": position.entry_bar,
                    "exit_bar": bar_idx,
                    "bars_held": position.bars_held,
                    "direction": position.direction,
                    "signal": position.signal,
                    "entry_price": round(position.entry_price, 6),
                    "exit_price": round(current_price, 6),
                    "size_usd": round(position.size_usd, 2),
                    "leverage": position.leverage,
                    "gross_pnl": round(gross_pnl, 4),
                    "total_fees": round(total_fees, 4),
                    "net_pnl": round(net_pnl, 4),
                    "exit_type": exit_type,
                    "borrow_fees": round(position.cumulative_borrow_fee, 4),
                })

                last_trade_bar = bar_idx
                position = None
                continue

        # Try to open a new position (only if flat and cooldown passed)
        if position is None and (bar_idx - last_trade_bar) >= cooldown_bars:
            # Build the price history window the strategy will see
            history = prices[:bar_idx + 1]
            # Only pass the last N bars to match live behavior
            lookback = max(MIN_CANDLES, 100)
            window = history[-lookback:]

            if len(window) < MIN_CANDLES:
                continue

            signal = strategy_func(window, strat_config)
            if not signal:
                continue

            direction = signal["direction"]
            atr_value = signal.get("atr", 0)

            if atr_value <= 0:
                continue

            # Position sizing — same logic as live
            size_usd = calculate_position_size(
                equity, atr_value, current_price, leverage, sl_mult,
                peak_equity=peak_equity
            )
            if size_usd <= 0:
                continue

            # Check margin availability
            margin_needed = size_usd / leverage
            if margin_needed > balance * 0.9:
                continue

            # Apply entry slippage
            if direction == "long":
                fill_price = current_price * (1 + BACKTEST_SLIPPAGE_PCT)
            else:
                fill_price = current_price * (1 - BACKTEST_SLIPPAGE_PCT)

            # Entry fee
            entry_fee = size_usd * OPEN_CLOSE_FEE_PCT

            # Calculate SL/TP
            if direction == "long":
                stop_loss = fill_price - (atr_value * sl_mult)
                take_profit = signal.get("tp_override", fill_price + (atr_value * tp_mult))
            else:
                stop_loss = fill_price + (atr_value * sl_mult)
                take_profit = signal.get("tp_override", fill_price - (atr_value * tp_mult))

            # Deduct margin + entry fee from balance
            balance -= (margin_needed + entry_fee)

            position = SimPosition(
                direction=direction,
                entry_price=fill_price,
                size_usd=size_usd,
                leverage=leverage,
                stop_loss=stop_loss,
                take_profit=take_profit,
                trailing_stop_pct=trailing_pct,
                trailing_activation_pct=trailing_activation,
                entry_bar=bar_idx,
                entry_fee=entry_fee,
                signal=signal.get("signal", ""),
            )

    # Force-close any open position at the end
    if position:
        final_price = prices[-1]
        gross_pnl, total_fees, net_pnl = position.close_pnl(final_price)
        balance += position.margin + gross_pnl - (position.size_usd * OPEN_CLOSE_FEE_PCT)

        trades.append({
            "entry_bar": position.entry_bar,
            "exit_bar": len(prices) - 1,
            "bars_held": position.bars_held,
            "direction": position.direction,
            "signal": position.signal,
            "entry_price": round(position.entry_price, 6),
            "exit_price": round(final_price, 6),
            "size_usd": round(position.size_usd, 2),
            "leverage": position.leverage,
            "gross_pnl": round(gross_pnl, 4),
            "total_fees": round(total_fees, 4),
            "net_pnl": round(net_pnl, 4),
            "exit_type": "end_of_data",
            "borrow_fees": round(position.cumulative_borrow_fee, 4),
        })

    # ── Compute Metrics ──────────────────────────────────────────────
    metrics = _compute_metrics(trades, equity_curve, initial_balance, balance)
    metrics["strategy"] = strategy_name
    metrics["total_bars"] = len(prices)
    metrics["price_start"] = round(prices[0], 6)
    metrics["price_end"] = round(prices[-1], 6)
    metrics["buy_and_hold_pnl"] = round(
        initial_balance * (prices[-1] - prices[0]) / prices[0], 2
    )

    return {
        "metrics": metrics,
        "trades": trades,
        "equity_curve": equity_curve,
    }


def _compute_metrics(trades: List[Dict], equity_curve: List[Dict],
                     initial_balance: float, final_balance: float) -> Dict:
    """Compute backtest performance metrics from trade list."""
    if not trades:
        return {
            "total_trades": 0,
            "total_pnl": 0,
            "win_rate": 0,
            "profit_factor": 0,
            "max_drawdown_pct": 0,
            "sharpe_ratio": 0,
            "recovery_factor": 0,
            "avg_trade_duration_bars": 0,
            "avg_win": 0,
            "avg_loss": 0,
            "fee_impact": 0,
        }

    pnls = [t["net_pnl"] for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]

    total_trades = len(pnls)
    win_count = len(wins)
    loss_count = len(losses)
    win_rate = (win_count / total_trades * 100) if total_trades > 0 else 0

    gross_profit = sum(wins) if wins else 0
    gross_loss = abs(sum(losses)) if losses else 0
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (
        999.0 if gross_profit > 0 else 0
    )

    total_pnl = sum(pnls)
    total_fees = sum(t["total_fees"] for t in trades)

    avg_win = (sum(wins) / win_count) if win_count > 0 else 0
    avg_loss = (abs(sum(losses)) / loss_count) if loss_count > 0 else 0

    # Average trade duration in bars (1 bar = 1 minute)
    durations = [t["bars_held"] for t in trades]
    avg_duration = sum(durations) / len(durations) if durations else 0

    # Max drawdown from equity curve
    max_drawdown_pct = 0.0
    peak = initial_balance
    for point in equity_curve:
        eq = point["equity"]
        peak = max(peak, eq)
        if peak > 0:
            dd = (peak - eq) / peak * 100
            max_drawdown_pct = max(max_drawdown_pct, dd)

    # Also check final balance vs peak
    if peak > 0:
        final_dd = (peak - final_balance) / peak * 100
        max_drawdown_pct = max(max_drawdown_pct, final_dd)

    # Sharpe ratio — annualized from hourly equity snapshots
    if len(equity_curve) >= 2:
        returns = []
        for i in range(1, len(equity_curve)):
            prev_eq = equity_curve[i - 1]["equity"]
            curr_eq = equity_curve[i]["equity"]
            if prev_eq > 0:
                returns.append((curr_eq - prev_eq) / prev_eq)

        if returns:
            mean_r = sum(returns) / len(returns)
            variance = sum((r - mean_r) ** 2 for r in returns) / len(returns)
            std_r = math.sqrt(variance) if variance > 0 else 0

            # Annualize: hourly snapshots → ~8760 hours/year
            sharpe = (mean_r / std_r) * math.sqrt(8760) if std_r > 0 else 0
        else:
            sharpe = 0
    else:
        sharpe = 0

    # Recovery factor = total profit / max drawdown
    max_dd_abs = initial_balance * max_drawdown_pct / 100
    recovery_factor = (total_pnl / max_dd_abs) if max_dd_abs > 0 else (
        999.0 if total_pnl > 0 else 0
    )

    # Exit type breakdown
    exit_types = {}
    for t in trades:
        et = t["exit_type"]
        exit_types[et] = exit_types.get(et, 0) + 1

    return {
        "total_trades": total_trades,
        "winning_trades": win_count,
        "losing_trades": loss_count,
        "win_rate": round(win_rate, 2),
        "profit_factor": round(min(profit_factor, 999), 2),
        "total_pnl": round(total_pnl, 2),
        "total_fees": round(total_fees, 2),
        "fee_impact": round(total_fees, 2),
        "max_drawdown_pct": round(max_drawdown_pct, 2),
        "sharpe_ratio": round(sharpe, 2),
        "recovery_factor": round(min(recovery_factor, 999), 2),
        "avg_trade_duration_bars": round(avg_duration, 1),
        "avg_trade_duration_hrs": round(avg_duration / 60, 2),
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "best_trade": round(max(pnls), 2) if pnls else 0,
        "worst_trade": round(min(pnls), 2) if pnls else 0,
        "final_balance": round(final_balance, 2),
        "return_pct": round((final_balance - initial_balance) / initial_balance * 100, 2),
        "exit_types": exit_types,
    }


# ── Multi-Strategy / Multi-Symbol Backtest ────────────────────────────

def backtest_all_strategies(prices_by_symbol: Dict[str, List[float]],
                            initial_balance: float = 10000) -> Dict:
    """
    Run all strategies across all symbols. Returns comparative results.

    Args:
        prices_by_symbol: Dict mapping symbol (e.g. "BTC-PERP") to price lists
        initial_balance: Starting balance for each strategy backtest

    Returns:
        Dict with per-strategy results and comparative summary
    """
    results = {}

    for strategy_name, strat_config in DEFAULT_STRATEGIES.items():
        if not strat_config.get("enabled"):
            results[strategy_name] = {"skipped": True, "reason": "disabled"}
            continue

        markets = strat_config.get("markets", [])
        strategy_results = {}

        for symbol in markets:
            if symbol not in prices_by_symbol:
                strategy_results[symbol] = {"skipped": True, "reason": "no price data"}
                continue

            prices = prices_by_symbol[symbol]
            if len(prices) < MIN_BARS_WARMUP + MIN_CANDLES:
                strategy_results[symbol] = {
                    "skipped": True,
                    "reason": f"insufficient data ({len(prices)} bars)",
                }
                continue

            try:
                result = backtest_strategy(
                    strategy_name, prices,
                    config=strat_config,
                    initial_balance=initial_balance,
                )
                strategy_results[symbol] = result
            except Exception as e:
                strategy_results[symbol] = {"error": str(e)}

        results[strategy_name] = strategy_results

    # Build comparative summary
    summary = []
    for strat_name, strat_results in results.items():
        if isinstance(strat_results, dict) and strat_results.get("skipped"):
            continue
        for symbol, result in strat_results.items():
            if isinstance(result, dict) and "metrics" in result:
                m = result["metrics"]
                summary.append({
                    "strategy": strat_name,
                    "symbol": symbol,
                    "total_trades": m["total_trades"],
                    "total_pnl": m["total_pnl"],
                    "win_rate": m["win_rate"],
                    "profit_factor": m["profit_factor"],
                    "max_drawdown_pct": m["max_drawdown_pct"],
                    "sharpe_ratio": m["sharpe_ratio"],
                    "return_pct": m["return_pct"],
                })

    # Sort summary by total P&L descending
    summary.sort(key=lambda x: x["total_pnl"], reverse=True)

    return {
        "strategies": results,
        "summary": summary,
    }


# ── Report Generation ────────────────────────────────────────────────────

def generate_backtest_report(results: Dict) -> str:
    """
    Generate a human-readable backtest report string.

    Args:
        results: Output from backtest_strategy() or backtest_all_strategies()

    Returns:
        Formatted report string
    """
    lines = []
    lines.append("=" * 60)
    lines.append("  BACKTEST REPORT")
    lines.append("=" * 60)

    # Single strategy result
    if "metrics" in results:
        _append_strategy_report(lines, results)
    # Multi-strategy result
    elif "summary" in results:
        lines.append("")
        lines.append("COMPARATIVE SUMMARY")
        lines.append("-" * 60)
        lines.append(f"{'Strategy':<20} {'Symbol':<12} {'Trades':>6} {'PnL':>10} {'WR%':>6} {'PF':>6} {'DD%':>6}")
        lines.append("-" * 60)
        for row in results["summary"]:
            lines.append(
                f"{row['strategy']:<20} {row['symbol']:<12} "
                f"{row['total_trades']:>6} {row['total_pnl']:>10.2f} "
                f"{row['win_rate']:>5.1f}% {row['profit_factor']:>6.2f} "
                f"{row['max_drawdown_pct']:>5.1f}%"
            )
        lines.append("-" * 60)
        lines.append("")

        # Detailed per-strategy reports
        for strat_name, strat_results in results.get("strategies", {}).items():
            if isinstance(strat_results, dict) and strat_results.get("skipped"):
                lines.append(f"[{strat_name}] SKIPPED — {strat_results.get('reason', 'disabled')}")
                lines.append("")
                continue
            for symbol, result in strat_results.items():
                if isinstance(result, dict) and "metrics" in result:
                    lines.append(f"--- {strat_name} on {symbol} ---")
                    _append_strategy_report(lines, result)
                    lines.append("")

    lines.append("=" * 60)
    return "\n".join(lines)


def _append_strategy_report(lines: List[str], result: Dict):
    """Append a single strategy's metrics to the report lines."""
    m = result["metrics"]
    lines.append("")
    lines.append(f"  Strategy: {m.get('strategy', 'N/A')}")
    lines.append(f"  Price range: {m.get('price_start', 'N/A')} -> {m.get('price_end', 'N/A')}")
    lines.append(f"  Total bars: {m.get('total_bars', 'N/A')}")
    lines.append("")
    lines.append("  PERFORMANCE")
    lines.append(f"    Total PnL:          ${m['total_pnl']:>10.2f}")
    lines.append(f"    Return:             {m['return_pct']:>9.2f}%")
    lines.append(f"    Buy & Hold PnL:     ${m.get('buy_and_hold_pnl', 0):>10.2f}")
    lines.append(f"    Final Balance:      ${m['final_balance']:>10.2f}")
    lines.append("")
    lines.append("  TRADE STATS")
    lines.append(f"    Total Trades:       {m['total_trades']:>6}")
    lines.append(f"    Win Rate:           {m['win_rate']:>5.1f}%")
    lines.append(f"    Profit Factor:      {m['profit_factor']:>6.2f}")
    lines.append(f"    Avg Win:            ${m['avg_win']:>10.2f}")
    lines.append(f"    Avg Loss:           ${m['avg_loss']:>10.2f}")
    lines.append(f"    Best Trade:         ${m['best_trade']:>10.2f}")
    lines.append(f"    Worst Trade:        ${m['worst_trade']:>10.2f}")
    lines.append(f"    Avg Duration:       {m['avg_trade_duration_hrs']:>6.1f} hrs")
    lines.append("")
    lines.append("  RISK")
    lines.append(f"    Max Drawdown:       {m['max_drawdown_pct']:>5.1f}%")
    lines.append(f"    Sharpe Ratio:       {m['sharpe_ratio']:>6.2f}")
    lines.append(f"    Recovery Factor:    {m['recovery_factor']:>6.2f}")
    lines.append("")
    lines.append("  COSTS")
    lines.append(f"    Total Fees:         ${m['total_fees']:>10.2f}")
    lines.append(f"    Fee Impact:         ${m['fee_impact']:>10.2f}")
    lines.append("")
    lines.append("  EXIT TYPES")
    for exit_type, count in m.get("exit_types", {}).items():
        lines.append(f"    {exit_type:<20} {count:>4}")


# ── API Helper ───────────────────────────────────────────────────────────

def run_backtest_from_db(strategy_name: str, symbol: str,
                         periods: int = 1440,
                         initial_balance: float = 10000) -> Dict:
    """
    Fetch price history from MongoDB and run a backtest.
    Called by the API endpoint.

    Args:
        strategy_name: Strategy to test
        symbol: Market symbol (e.g. "BTC-PERP")
        periods: Number of 1-min candles to fetch
        initial_balance: Starting balance

    Returns:
        Backtest results dict
    """
    from perp_strategies import get_price_series

    prices = get_price_series(symbol, count=periods)
    if len(prices) < MIN_BARS_WARMUP + MIN_CANDLES:
        raise ValueError(
            f"Insufficient price data for {symbol}: have {len(prices)} candles, "
            f"need at least {MIN_BARS_WARMUP + MIN_CANDLES}. "
            f"Wait for more data to accumulate or reduce periods."
        )

    config = DEFAULT_STRATEGIES.get(strategy_name)
    if not config:
        raise ValueError(f"Unknown strategy: {strategy_name}")

    return backtest_strategy(
        strategy_name, prices,
        config=config,
        initial_balance=initial_balance,
    )


# ── Standalone Runner ────────────────────────────────────────────────────

if __name__ == "__main__":
    import random

    print("=" * 60)
    print("  BACKTEST — Standalone Test with Synthetic Data")
    print("=" * 60)
    print()

    # Generate synthetic price data that mimics crypto behavior:
    # Random walk with drift, volatility clusters, and mean reversion
    def generate_synthetic_prices(base_price: float, num_bars: int,
                                  volatility: float = 0.001,
                                  drift: float = 0.0) -> List[float]:
        """Generate synthetic 1-min price data with realistic characteristics."""
        prices = [base_price]
        vol = volatility
        for _ in range(num_bars - 1):
            # GARCH-like volatility clustering
            vol = 0.9 * vol + 0.1 * volatility * (1 + abs(random.gauss(0, 1)))
            # Random walk with slight drift
            change = random.gauss(drift, vol)
            new_price = prices[-1] * (1 + change)
            prices.append(max(new_price, base_price * 0.5))  # Floor at 50% of start
        return prices

    # Generate 24 hours of 1-min data for a few markets
    random.seed(42)  # Reproducible results
    test_prices = {
        "BTC-PERP": generate_synthetic_prices(65000, 1440, volatility=0.0008),
        "SOL-PERP": generate_synthetic_prices(150, 1440, volatility=0.0015),
        "ETH-PERP": generate_synthetic_prices(3500, 1440, volatility=0.001),
    }

    print(f"Generated synthetic data:")
    for symbol, prices in test_prices.items():
        pct_change = (prices[-1] - prices[0]) / prices[0] * 100
        print(f"  {symbol}: {prices[0]:.2f} -> {prices[-1]:.2f} ({pct_change:+.2f}%)")
    print()

    # Run individual strategy backtests
    for strategy_name in STRATEGY_FUNCS:
        config = DEFAULT_STRATEGIES[strategy_name]
        if not config.get("enabled"):
            print(f"[{strategy_name}] SKIPPED (disabled)")
            continue

        for symbol in ["BTC-PERP", "SOL-PERP", "ETH-PERP"]:
            if symbol not in config.get("markets", []):
                continue
            try:
                result = backtest_strategy(
                    strategy_name, test_prices[symbol],
                    config=config,
                )
                m = result["metrics"]
                print(f"[{strategy_name}] {symbol}: "
                      f"{m['total_trades']} trades, "
                      f"PnL=${m['total_pnl']:.2f}, "
                      f"WR={m['win_rate']:.1f}%, "
                      f"PF={m['profit_factor']:.2f}, "
                      f"DD={m['max_drawdown_pct']:.1f}%, "
                      f"Fees=${m['total_fees']:.2f}")
            except Exception as e:
                print(f"[{strategy_name}] {symbol}: ERROR — {e}")

    print()

    # Run full comparative backtest
    print("Running full comparative backtest...")
    full_results = backtest_all_strategies(test_prices)
    report = generate_backtest_report(full_results)
    print(report)
