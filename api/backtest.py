from http.server import BaseHTTPRequestHandler
import json
import os
import sys
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.dirname(__file__))

ALLOWED_ORIGINS = ["https://budju.xyz", "https://www.budju.xyz"]
ADMIN_WALLETS = [w.strip() for w in os.getenv("ADMIN_WALLETS", "").split(",") if w.strip()]

VALID_SYMBOLS = [
    "SOL-PERP", "BTC-PERP", "ETH-PERP", "DOGE-PERP", "AVAX-PERP",
    "LINK-PERP", "SUI-PERP", "RENDER-PERP", "JUP-PERP", "WIF-PERP",
]

VALID_STRATEGIES = [
    "trend_following", "mean_reversion", "momentum", "scalping",
    "keltner", "bb_squeeze", "bnf_reversion",
]


SYMBOL_MAP = {
    "BTC-PERP": "BTCUSDT", "ETH-PERP": "ETHUSDT", "SOL-PERP": "SOLUSDT",
    "DOGE-PERP": "DOGEUSDT", "AVAX-PERP": "AVAXUSDT", "LINK-PERP": "LINKUSDT",
    "SUI-PERP": "SUIUSDT", "RENDER-PERP": "RENDERUSDT", "JUP-PERP": "JUPUSDT",
    "WIF-PERP": "WIFUSDT",
}

INTERVAL_MINUTES = {"15m": 15, "1h": 60, "4h": 240, "1d": 1440}


def _fetch_binance_klines(symbol, interval="4h", limit=1000):
    binance_sym = SYMBOL_MAP.get(symbol)
    if not binance_sym:
        raise ValueError(f"No Binance mapping for {symbol}")

    urls = [
        f"https://data-api.binance.vision/api/v3/klines?symbol={binance_sym}&interval={interval}&limit={limit}",
        f"https://api.binance.us/api/v3/klines?symbol={binance_sym}&interval={interval}&limit={limit}",
    ]

    for url in urls:
        try:
            req = Request(url, headers={"User-Agent": "budju-backtest/1.0"})
            with urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())
            return [float(candle[4]) for candle in data]
        except Exception:
            continue

    raise ValueError(f"Could not fetch Binance data for {symbol}")


def _cors_origin(headers) -> str:
    origin = headers.get("Origin", "")
    return origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        origin = _cors_origin(self.headers)
        try:
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)

            strategy = params.get("strategy", [None])[0]
            symbol = params.get("symbol", [None])[0]
            source = params.get("source", ["db"])[0]
            interval = params.get("interval", ["4h"])[0]
            periods = int(params.get("periods", ["4320"])[0])
            periods = min(periods, 20160)

            if source == "binance" and strategy and symbol:
                body = self._run_binance(strategy, symbol, interval)
            elif not strategy and not symbol:
                body = self._run_all()
            elif strategy and symbol:
                body = self._run_single(strategy, symbol, periods)
            elif strategy:
                body = self._run_strategy_all_symbols(strategy, periods)
            else:
                body = self._run_symbol_all_strategies(symbol, periods)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(json.dumps(body, default=str).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", origin)
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def _run_binance(self, strategy, symbol, interval):
        if strategy not in VALID_STRATEGIES:
            return {"error": f"Invalid strategy. Valid: {VALID_STRATEGIES}"}
        if symbol not in VALID_SYMBOLS:
            return {"error": f"Invalid symbol. Valid: {VALID_SYMBOLS}"}
        if interval not in INTERVAL_MINUTES:
            return {"error": f"Invalid interval. Valid: {list(INTERVAL_MINUTES.keys())}"}

        prices = _fetch_binance_klines(symbol, interval, limit=1000)

        import perp_strategies
        from perp_backtest import backtest_strategy, DEFAULT_STRATEGIES

        config = DEFAULT_STRATEGIES.get(strategy)
        if not config:
            return {"error": f"Unknown strategy: {strategy}"}

        candle_min = INTERVAL_MINUTES[interval]
        old_cm = perp_strategies.CANDLE_MINUTES
        perp_strategies.CANDLE_MINUTES = candle_min
        try:
            result = backtest_strategy(strategy, prices, config=config, initial_balance=10000)
        finally:
            perp_strategies.CANDLE_MINUTES = old_cm

        days = len(prices) * candle_min / 1440
        return {
            "source": "binance",
            "strategy": strategy,
            "symbol": symbol,
            "interval": interval,
            "candles": len(prices),
            "days": round(days, 1),
            "metrics": result["metrics"],
            "trade_count": len(result["trades"]),
            "trades": result["trades"][:50],
        }

    def _run_single(self, strategy, symbol, periods):
        if strategy not in VALID_STRATEGIES:
            return {"error": f"Invalid strategy. Valid: {VALID_STRATEGIES}"}
        if symbol not in VALID_SYMBOLS:
            return {"error": f"Invalid symbol. Valid: {VALID_SYMBOLS}"}

        from perp_backtest import run_backtest_from_db
        result = run_backtest_from_db(strategy, symbol, periods=periods)
        return {
            "strategy": strategy,
            "symbol": symbol,
            "periods": periods,
            "metrics": result["metrics"],
            "trade_count": len(result["trades"]),
            "trades": result["trades"][:50],
        }

    def _run_strategy_all_symbols(self, strategy, periods):
        if strategy not in VALID_STRATEGIES:
            return {"error": f"Invalid strategy. Valid: {VALID_STRATEGIES}"}

        from perp_backtest import run_backtest_from_db
        results = []
        for symbol in VALID_SYMBOLS:
            try:
                result = run_backtest_from_db(strategy, symbol, periods=periods)
                m = result["metrics"]
                results.append({
                    "symbol": symbol,
                    "total_trades": m["total_trades"],
                    "total_pnl": m["total_pnl"],
                    "win_rate": m["win_rate"],
                    "profit_factor": m["profit_factor"],
                    "max_drawdown_pct": m["max_drawdown_pct"],
                    "avg_win": m["avg_win"],
                    "avg_loss": m["avg_loss"],
                    "total_fees": m["total_fees"],
                    "return_pct": m["return_pct"],
                })
            except Exception as e:
                results.append({"symbol": symbol, "error": str(e)})

        results.sort(key=lambda x: x.get("total_pnl", -9999), reverse=True)
        return {"strategy": strategy, "periods": periods, "results": results}

    def _run_symbol_all_strategies(self, symbol, periods):
        if symbol not in VALID_SYMBOLS:
            return {"error": f"Invalid symbol. Valid: {VALID_SYMBOLS}"}

        from perp_backtest import run_backtest_from_db
        results = []
        for strategy in VALID_STRATEGIES:
            try:
                result = run_backtest_from_db(strategy, symbol, periods=periods)
                m = result["metrics"]
                results.append({
                    "strategy": strategy,
                    "total_trades": m["total_trades"],
                    "total_pnl": m["total_pnl"],
                    "win_rate": m["win_rate"],
                    "profit_factor": m["profit_factor"],
                    "max_drawdown_pct": m["max_drawdown_pct"],
                    "avg_win": m["avg_win"],
                    "avg_loss": m["avg_loss"],
                    "total_fees": m["total_fees"],
                    "return_pct": m["return_pct"],
                })
            except Exception as e:
                results.append({"strategy": strategy, "error": str(e)})

        results.sort(key=lambda x: x.get("total_pnl", -9999), reverse=True)
        return {"symbol": symbol, "periods": periods, "results": results}

    def _run_all(self):
        from perp_backtest import run_backtest_from_db
        summary = []
        for strategy in VALID_STRATEGIES:
            for symbol in VALID_SYMBOLS:
                try:
                    result = run_backtest_from_db(strategy, symbol, periods=4320)
                    m = result["metrics"]
                    summary.append({
                        "strategy": strategy,
                        "symbol": symbol,
                        "total_trades": m["total_trades"],
                        "total_pnl": m["total_pnl"],
                        "win_rate": m["win_rate"],
                        "profit_factor": m["profit_factor"],
                        "return_pct": m["return_pct"],
                        "total_fees": m["total_fees"],
                    })
                except Exception:
                    pass

        summary.sort(key=lambda x: x.get("total_pnl", -9999), reverse=True)

        total_pnl = sum(r.get("total_pnl", 0) for r in summary)
        total_fees = sum(r.get("total_fees", 0) for r in summary)
        winners = [r for r in summary if r.get("total_pnl", 0) > 0]
        losers = [r for r in summary if r.get("total_pnl", 0) <= 0]

        return {
            "periods": 4320,
            "total_combos": len(summary),
            "profitable_combos": len(winners),
            "losing_combos": len(losers),
            "total_pnl": round(total_pnl, 2),
            "total_fees": round(total_fees, 2),
            "top_5": summary[:5],
            "bottom_5": summary[-5:] if len(summary) >= 5 else summary,
            "all": summary,
        }

    def do_OPTIONS(self):
        origin = _cors_origin(self.headers)
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        pass
