import { useState, useEffect } from "react";
import type { PerpMarket, PerpOrderRequest } from "../../types/perps";
import { createPendingOrder } from "../../services/perpApi";

type OrderMode = "market" | "limit" | "stop";

interface Props {
  markets: PerpMarket[];
  prices: Record<string, number>;
  maxBalance: number;
  onSubmit: (order: PerpOrderRequest) => void;
  loading: boolean;
  initialSymbol?: string;
  hideMarketSelect?: boolean;
  wallet?: string;
}

const PerpOrderForm = ({ markets, prices, maxBalance, onSubmit, loading, initialSymbol, hideMarketSelect, wallet }: Props) => {
  const [symbol, setSymbol] = useState(initialSymbol || markets[0]?.symbol || "SOL-PERP");

  // Update symbol when navigated from positions
  useEffect(() => {
    if (initialSymbol) setSymbol(initialSymbol);
  }, [initialSymbol]);
  const [mode, setMode] = useState<OrderMode>("market");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [leverage, setLeverage] = useState(5);
  const [sizeUsd, setSizeUsd] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [trailingStop, setTrailingStop] = useState("");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [pendingLoading, setPendingLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);

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

  const showFeedback = (msg: string, ok: boolean) => {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleMarketSubmit = () => {
    if (!sizeUsd || parseFloat(sizeUsd) <= 0 || price <= 0) return;

    const order: PerpOrderRequest = {
      symbol,
      direction,
      leverage,
      sizeUsd: parseFloat(sizeUsd),
      entryPrice: price,
    };
    if (stopLoss) order.stopLoss = parseFloat(stopLoss);
    if (takeProfit) order.takeProfit = parseFloat(takeProfit);
    if (trailingStop) order.trailingStopPct = parseFloat(trailingStop);

    onSubmit(order);
  };

  const handlePendingOrder = async (dir: "long" | "short", orderType: "limit" | "stop") => {
    if (!triggerPrice || pendingLoading || !wallet) return;
    const trigger = parseFloat(triggerPrice);
    if (!trigger || trigger <= 0) return;
    setPendingLoading(true);
    try {
      const size = parseFloat(sizeUsd) || 500;
      const slPct = dir === "long" ? 0.98 : 1.02;
      const tpPct = dir === "long" ? 1.04 : 0.96;
      await createPendingOrder({
        symbol,
        direction: dir,
        leverage,
        sizeUsd: size,
        orderType,
        triggerPrice: trigger,
        stopLoss: trigger * slPct,
        takeProfit: trigger * tpPct,
        entryReason: `[manual] ${orderType} order`,
        expiryHours: 24,
      }, wallet);
      const label = dir === "long"
        ? (orderType === "limit" ? "BUY LIMIT" : "BUY STOP")
        : (orderType === "limit" ? "SELL LIMIT" : "SELL STOP");
      showFeedback(`${label} @ $${trigger.toFixed(2)} placed`, true);
    } catch (e: any) {
      showFeedback(e?.message || "Order failed", false);
    }
    setPendingLoading(false);
  };

  const isLoading = loading || pendingLoading;

  return (
    <div className="space-y-3">
      {/* Market selection */}
      {!hideMarketSelect && (
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
      )}

      {/* Order mode tabs */}
      <div className="flex rounded-lg bg-white/[0.04] border border-white/[0.06] p-0.5">
        {(["market", "limit", "stop"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all capitalize ${
              mode === m
                ? "text-blue-300 bg-blue-500/15 border border-blue-500/30"
                : "text-slate-500 hover:text-slate-300 border border-transparent"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Trigger price (limit/stop only) */}
      {mode !== "market" && (
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">
            {mode === "limit" ? "Limit Price" : "Stop Price"}
          </label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              value={triggerPrice}
              onChange={(e) => setTriggerPrice(e.target.value)}
              placeholder={price > 0 ? (price >= 1000 ? price.toFixed(2) : price >= 1 ? price.toFixed(4) : price.toFixed(6)) : "0.00"}
              className="flex-1 bg-slate-800/60 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/40"
            />
            <button
              onClick={() => setTriggerPrice(price >= 1000 ? price.toFixed(2) : price >= 1 ? price.toFixed(4) : price.toFixed(6))}
              className="text-[10px] text-slate-400 hover:text-white px-2 py-2 rounded-lg border border-white/[0.06] hover:bg-white/5 transition-colors"
            >
              Mark
            </button>
          </div>
        </div>
      )}

      {/* Direction (market mode only — limit/stop show buy/sell buttons below) */}
      {mode === "market" && (
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
      )}

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
            className={`flex-1 text-[10px] py-1 rounded transition-colors border ${
              sizeUsd === String(amt)
                ? "bg-white/10 text-white border-white/20"
                : "bg-white/[0.04] text-slate-400 hover:text-white border-white/[0.04]"
            }`}
          >
            ${amt}
          </button>
        ))}
      </div>

      {/* SL / TP / Trailing (market mode only) */}
      {mode === "market" && (
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
      )}

      {/* Submit buttons */}
      {mode === "market" ? (
        <button
          onClick={handleMarketSubmit}
          disabled={isLoading || !sizeUsd || parseFloat(sizeUsd) <= 0 || margin > maxBalance}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-all border ${
            direction === "long"
              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-40"
              : "bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30 disabled:opacity-40"
          }`}
        >
          {isLoading
            ? "Placing..."
            : `${direction === "long" ? "LONG" : "SHORT"} ${symbol} — $${notional.toFixed(0)} @ ${leverage}x`}
        </button>
      ) : mode === "limit" ? (
        <div className="flex gap-2">
          <button
            onClick={() => handlePendingOrder("long", "limit")}
            disabled={isLoading || !triggerPrice}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/40 active:bg-emerald-500/50 disabled:opacity-40 transition-colors"
          >
            BUY LIMIT
          </button>
          <button
            onClick={() => handlePendingOrder("short", "limit")}
            disabled={isLoading || !triggerPrice}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-red-600/30 text-red-300 border border-red-500/40 hover:bg-red-500/40 active:bg-red-500/50 disabled:opacity-40 transition-colors"
          >
            SELL LIMIT
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => handlePendingOrder("long", "stop")}
            disabled={isLoading || !triggerPrice}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/40 active:bg-cyan-500/50 disabled:opacity-40 transition-colors"
          >
            BUY STOP
          </button>
          <button
            onClick={() => handlePendingOrder("short", "stop")}
            disabled={isLoading || !triggerPrice}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-orange-600/30 text-orange-300 border border-orange-500/40 hover:bg-orange-500/40 active:bg-orange-500/50 disabled:opacity-40 transition-colors"
          >
            SELL STOP
          </button>
        </div>
      )}

      {/* Margin warning */}
      {margin > maxBalance && (
        <div className="text-[10px] text-red-400 text-center">
          Insufficient balance. Need ${margin.toFixed(2)} margin, have ${maxBalance.toFixed(2)}.
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`text-[10px] text-center font-bold ${feedback.ok ? "text-emerald-400" : "text-red-400"}`}>
          {feedback.msg}
        </div>
      )}
    </div>
  );
};

export default PerpOrderForm;
