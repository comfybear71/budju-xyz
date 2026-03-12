import { useState, useEffect } from "react";
import type { PerpMarket, PerpOrderRequest } from "../../types/perps";

interface Props {
  markets: PerpMarket[];
  prices: Record<string, number>;
  maxBalance: number;
  onSubmit: (order: PerpOrderRequest) => void;
  loading: boolean;
}

const PerpOrderForm = ({ markets, prices, maxBalance, onSubmit, loading }: Props) => {
  const [symbol, setSymbol] = useState(markets[0]?.symbol || "SOL-PERP");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [leverage, setLeverage] = useState(5);
  const [sizeUsd, setSizeUsd] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [trailingStop, setTrailingStop] = useState("");
  const [entryReason, setEntryReason] = useState("");

  const market = markets.find((m) => m.symbol === symbol);
  const maxLev = market?.max_leverage || 50;
  const price = prices[symbol] || 0;
  const margin = sizeUsd ? parseFloat(sizeUsd) / leverage : 0;
  const notional = sizeUsd ? parseFloat(sizeUsd) : 0;

  // Auto-suggest SL/TP based on ATR-like approach (2% SL, 3% TP default)
  useEffect(() => {
    if (price > 0 && !stopLoss && !takeProfit) {
      if (direction === "long") {
        setStopLoss((price * 0.98).toFixed(market?.tick_size ? -Math.log10(market.tick_size) : 2));
        setTakeProfit((price * 1.03).toFixed(market?.tick_size ? -Math.log10(market.tick_size) : 2));
      } else {
        setStopLoss((price * 1.02).toFixed(market?.tick_size ? -Math.log10(market.tick_size) : 2));
        setTakeProfit((price * 0.97).toFixed(market?.tick_size ? -Math.log10(market.tick_size) : 2));
      }
    }
  }, [symbol, direction, price]);

  const handleSubmit = () => {
    if (!sizeUsd || parseFloat(sizeUsd) <= 0 || price <= 0) return;

    const order: PerpOrderRequest = {
      symbol,
      direction,
      leverage,
      sizeUsd: parseFloat(sizeUsd),
      entryPrice: price,
      entryReason,
    };
    if (stopLoss) order.stopLoss = parseFloat(stopLoss);
    if (takeProfit) order.takeProfit = parseFloat(takeProfit);
    if (trailingStop) order.trailingStopPct = parseFloat(trailingStop);

    onSubmit(order);
  };

  return (
    <div className="space-y-3">
      {/* Market selection */}
      <div>
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Market</label>
        <select
          value={symbol}
          onChange={(e) => { setSymbol(e.target.value); setStopLoss(""); setTakeProfit(""); }}
          className="w-full mt-1 bg-slate-800/60 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500/40"
        >
          {markets.map((m) => (
            <option key={m.symbol} value={m.symbol}>
              {m.symbol} {prices[m.symbol] ? `— $${prices[m.symbol].toLocaleString()}` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Direction */}
      <div>
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Direction</label>
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => { setDirection("long"); setStopLoss(""); setTakeProfit(""); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${
              direction === "long"
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : "bg-slate-800/40 text-slate-400 border-white/[0.04] hover:text-emerald-400"
            }`}
          >
            LONG
          </button>
          <button
            onClick={() => { setDirection("short"); setStopLoss(""); setTakeProfit(""); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${
              direction === "short"
                ? "bg-red-500/20 text-red-300 border-red-500/40"
                : "bg-slate-800/40 text-slate-400 border-white/[0.04] hover:text-red-400"
            }`}
          >
            SHORT
          </button>
        </div>
      </div>

      {/* Size & Leverage */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">Size (USD)</label>
          <input
            type="number"
            value={sizeUsd}
            onChange={(e) => setSizeUsd(e.target.value)}
            placeholder="100"
            className="w-full mt-1 bg-slate-800/60 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500/40"
          />
          {margin > 0 && (
            <div className="text-[10px] text-slate-500 mt-0.5">Margin: ${margin.toFixed(2)}</div>
          )}
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">Leverage ({leverage}x)</label>
          <input
            type="range"
            min={2}
            max={maxLev}
            value={leverage}
            onChange={(e) => setLeverage(parseInt(e.target.value))}
            className="w-full mt-3 accent-red-500"
          />
          <div className="flex justify-between text-[10px] text-slate-600">
            <span>2x</span>
            <span>{maxLev}x</span>
          </div>
        </div>
      </div>

      {/* Quick size buttons */}
      <div className="flex gap-1">
        {[100, 250, 500, 1000, 2000].map((amt) => (
          <button
            key={amt}
            onClick={() => setSizeUsd(String(amt))}
            className="flex-1 text-[10px] py-1 rounded bg-white/[0.04] text-slate-400 hover:text-white transition-colors border border-white/[0.04]"
          >
            ${amt}
          </button>
        ))}
      </div>

      {/* SL / TP / Trailing */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-red-400 uppercase tracking-wider">Stop Loss</label>
          <input
            type="number"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            placeholder="0.00"
            className="w-full mt-1 bg-slate-800/60 border border-red-500/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/40"
          />
        </div>
        <div>
          <label className="text-[10px] text-emerald-400 uppercase tracking-wider">Take Profit</label>
          <input
            type="number"
            value={takeProfit}
            onChange={(e) => setTakeProfit(e.target.value)}
            placeholder="0.00"
            className="w-full mt-1 bg-slate-800/60 border border-emerald-500/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/40"
          />
        </div>
        <div>
          <label className="text-[10px] text-blue-400 uppercase tracking-wider">Trail %</label>
          <input
            type="number"
            value={trailingStop}
            onChange={(e) => setTrailingStop(e.target.value)}
            placeholder="2.0"
            className="w-full mt-1 bg-slate-800/60 border border-blue-500/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/40"
          />
        </div>
      </div>

      {/* Entry reason */}
      <div>
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Entry Reason (optional)</label>
        <input
          type="text"
          value={entryReason}
          onChange={(e) => setEntryReason(e.target.value)}
          placeholder="e.g., EMA crossover + RSI oversold"
          className="w-full mt-1 bg-slate-800/60 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/40"
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={loading || !sizeUsd || parseFloat(sizeUsd) <= 0 || margin > maxBalance}
        className={`w-full py-3 rounded-xl text-sm font-bold transition-all border ${
          direction === "long"
            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-40"
            : "bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30 disabled:opacity-40"
        }`}
      >
        {loading
          ? "Placing..."
          : `${direction === "long" ? "LONG" : "SHORT"} ${symbol} — $${notional.toFixed(0)} @ ${leverage}x`}
      </button>

      {margin > maxBalance && (
        <div className="text-[10px] text-red-400 text-center">
          Insufficient balance. Need ${margin.toFixed(2)} margin, have ${maxBalance.toFixed(2)}.
        </div>
      )}
    </div>
  );
};

export default PerpOrderForm;
