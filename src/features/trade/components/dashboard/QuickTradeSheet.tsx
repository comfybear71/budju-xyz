import { useState, useEffect, useRef } from "react";
import type { PerpOrderRequest, PerpMarket } from "../../types/perps";
import type { StrategyOpportunity } from "../../utils/strategyDetectors";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (order: PerpOrderRequest) => Promise<void>;
  prefill: StrategyOpportunity | null;
  markets: PerpMarket[];
  prices: Record<string, number>;
  maxBalance: number;
  isLive: boolean;
  loading: boolean;
}

const QuickTradeSheet = ({ isOpen, onClose, onSubmit, prefill, markets, prices, maxBalance, isLive, loading }: Props) => {
  const [sizeUsd, setSizeUsd] = useState("100");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [leverage, setLeverage] = useState(5);
  const [symbol, setSymbol] = useState("SOL-PERP");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Prefill from signal
  useEffect(() => {
    if (!prefill) return;
    setSymbol(prefill.market);
    setDirection(prefill.direction);
    setLeverage(parseInt(prefill.leverage) || 5);
    setSizeUsd("100");
    setStopLoss("");
    setTakeProfit("");
    setShowAdvanced(false);
    setConfirmLive(false);
  }, [prefill]);

  // Focus size input when sheet opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const price = prices[symbol] || 0;
  const market = markets.find((m) => m.symbol === symbol);
  const maxLev = market?.max_leverage || 50;
  const margin = sizeUsd ? parseFloat(sizeUsd) / leverage : 0;
  const canSubmit = !loading && parseFloat(sizeUsd) > 0 && margin <= maxBalance && price > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (isLive && !confirmLive) {
      setConfirmLive(true);
      return;
    }

    const order: PerpOrderRequest = {
      symbol,
      direction,
      leverage,
      sizeUsd: parseFloat(sizeUsd),
      entryPrice: price,
    };
    if (stopLoss) order.stopLoss = parseFloat(stopLoss);
    if (takeProfit) order.takeProfit = parseFloat(takeProfit);

    await onSubmit(order);
    onClose();
  };

  if (!isOpen) return null;

  const dirColor = direction === "long" ? "emerald" : "red";

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-50 lg:hidden" onClick={onClose} />

      {/* Sheet — bottom drawer on mobile, side panel on desktop */}
      <div className={`fixed z-50 bg-[#0f172a] border-t lg:border-l lg:border-t-0 border-white/[0.08] shadow-2xl transition-transform duration-300 ${
        isOpen ? "translate-y-0 lg:translate-x-0" : "translate-y-full lg:translate-x-full"
      } bottom-0 left-0 right-0 lg:bottom-auto lg:left-auto lg:top-0 lg:right-0 lg:w-80 lg:h-full rounded-t-2xl lg:rounded-none`}>
        <div className="p-4 space-y-3 max-h-[85vh] lg:max-h-full overflow-y-auto">
          {/* Handle bar (mobile) */}
          <div className="flex justify-center lg:hidden">
            <div className="w-10 h-1 rounded-full bg-slate-600" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              {prefill ? `${prefill.strategy} — ${prefill.base}` : "Quick Trade"}
            </h3>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-sm">✕</button>
          </div>

          {/* Signal context */}
          {prefill && (
            <div className="text-[10px] text-slate-400 bg-slate-800/40 rounded-lg p-2 border border-white/[0.04]">
              {prefill.headline}
              <div className="mt-0.5 text-slate-500">Entry: {prefill.entryZone}</div>
            </div>
          )}

          {/* Direction toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setDirection("long"); setConfirmLive(false); }}
              className={`py-2.5 rounded-xl text-sm font-bold transition-all border ${
                direction === "long"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-slate-800/40 text-slate-500 border-white/[0.04] hover:text-emerald-400"
              }`}
            >
              LONG
            </button>
            <button
              onClick={() => { setDirection("short"); setConfirmLive(false); }}
              className={`py-2.5 rounded-xl text-sm font-bold transition-all border ${
                direction === "short"
                  ? "bg-red-500/20 text-red-300 border-red-500/40"
                  : "bg-slate-800/40 text-slate-500 border-white/[0.04] hover:text-red-400"
              }`}
            >
              SHORT
            </button>
          </div>

          {/* Size input */}
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Size (USD)</label>
            <input
              ref={inputRef}
              type="number"
              value={sizeUsd}
              onChange={(e) => { setSizeUsd(e.target.value); setConfirmLive(false); }}
              placeholder="100"
              className="w-full mt-1 px-3 py-2.5 rounded-xl bg-slate-800/60 border border-white/[0.06] text-white text-sm font-bold outline-none focus:border-blue-500/40 transition-colors"
            />
            {/* Quick size buttons */}
            <div className="flex gap-1.5 mt-1.5">
              {[50, 100, 250, 500, 1000].map((s) => (
                <button
                  key={s}
                  onClick={() => setSizeUsd(s.toString())}
                  className={`flex-1 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                    sizeUsd === s.toString()
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                      : "bg-slate-800/40 text-slate-500 border-white/[0.04] hover:text-white"
                  }`}
                >
                  ${s}
                </button>
              ))}
            </div>
          </div>

          {/* Leverage slider */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Leverage</label>
              <span className="text-[11px] font-bold text-white">{leverage}x</span>
            </div>
            <input
              type="range"
              min={2}
              max={maxLev}
              value={leverage}
              onChange={(e) => setLeverage(parseInt(e.target.value))}
              className="w-full mt-1 accent-blue-500"
            />
            <div className="flex justify-between text-[9px] text-slate-600">
              <span>2x</span>
              <span>{maxLev}x</span>
            </div>
          </div>

          {/* Margin info */}
          <div className="flex items-center justify-between text-[10px] bg-slate-800/30 rounded-lg px-3 py-2 border border-white/[0.04]">
            <span className="text-slate-500">Margin required</span>
            <span className={`font-bold ${margin > maxBalance ? "text-red-400" : "text-white"}`}>
              ${margin.toFixed(2)}
              {margin > maxBalance && <span className="text-red-400 ml-1">(exceeds balance)</span>}
            </span>
          </div>

          {/* Advanced SL/TP */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showAdvanced ? "Hide" : "Show"} SL/TP
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-red-400 uppercase">Stop Loss</label>
                <input
                  type="number"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder={price > 0 ? (direction === "long" ? (price * 0.98).toFixed(2) : (price * 1.02).toFixed(2)) : ""}
                  className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-slate-800/60 border border-red-500/20 text-white text-[11px] outline-none focus:border-red-500/40"
                />
              </div>
              <div>
                <label className="text-[9px] text-emerald-400 uppercase">Take Profit</label>
                <input
                  type="number"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  placeholder={price > 0 ? (direction === "long" ? (price * 1.03).toFixed(2) : (price * 0.97).toFixed(2)) : ""}
                  className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-slate-800/60 border border-emerald-500/20 text-white text-[11px] outline-none focus:border-emerald-500/40"
                />
              </div>
            </div>
          )}

          {/* Submit button */}
          {confirmLive ? (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full py-3 rounded-xl text-sm font-bold bg-red-600/30 text-red-200 border-2 border-red-500/60 hover:bg-red-600/50 transition-all animate-pulse disabled:opacity-40"
            >
              CONFIRM LIVE {direction.toUpperCase()} — REAL MONEY
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-all border disabled:opacity-40 ${
                direction === "long"
                  ? `bg-${dirColor}-500/20 text-${dirColor}-300 border-${dirColor}-500/40 hover:bg-${dirColor}-500/30`
                  : `bg-${dirColor}-500/20 text-${dirColor}-300 border-${dirColor}-500/40 hover:bg-${dirColor}-500/30`
              } ${
                direction === "long"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
                  : "bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30"
              }`}
            >
              {loading ? "Placing..." : `${direction.toUpperCase()} ${symbol.replace("-PERP", "")} — $${sizeUsd || "0"} @ ${leverage}x`}
            </button>
          )}

          {/* Current price */}
          {price > 0 && (
            <div className="text-center text-[10px] text-slate-500">
              Current: ${price >= 1 ? price.toFixed(2) : price.toFixed(6)}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default QuickTradeSheet;
