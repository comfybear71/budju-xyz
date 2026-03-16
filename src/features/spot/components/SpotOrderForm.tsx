import { useState } from "react";
import { motion } from "motion/react";
import { FaShoppingCart, FaMoneyBillWave } from "react-icons/fa";
import { executeBuy, executeSell, type SpotHolding, type PriceData } from "../services/spotApi";

interface SpotOrderFormProps {
  symbol: string;
  price: PriceData | null;
  holding: SpotHolding | null;
  dryRun: boolean;
  onTradeComplete: () => void;
}

export default function SpotOrderForm({ symbol, price, holding, dryRun, onTradeComplete }: SpotOrderFormProps) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [sellPct, setSellPct] = useState("100");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const quickAmounts = [10, 25, 50, 100];
  const quickSellPcts = [25, 50, 75, 100];

  const handleBuy = async () => {
    const usdAmount = parseFloat(amount);
    if (!usdAmount || usdAmount <= 0) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await executeBuy(symbol, usdAmount);
      if (res.success && res.trade) {
        setResult({
          success: true,
          message: `Bought ${res.trade.amount.toFixed(6)} ${symbol} @ $${res.trade.price.toFixed(4)}`,
        });
        setAmount("");
        onTradeComplete();
      } else {
        setResult({ success: false, message: res.error || "Buy failed" });
      }
    } catch (e: any) {
      setResult({ success: false, message: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSell = async () => {
    const pct = parseFloat(sellPct);
    if (!pct || pct <= 0) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await executeSell(symbol, pct);
      if (res.success && res.trade) {
        setResult({
          success: true,
          message: `Sold ${res.trade.amount.toFixed(6)} ${symbol} for $${res.trade.usd_value.toFixed(2)} (PnL: $${res.trade.pnl?.toFixed(2) ?? "0"})`,
        });
        onTradeComplete();
      } else {
        setResult({ success: false, message: res.error || "Sell failed" });
      }
    } catch (e: any) {
      setResult({ success: false, message: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-black/30 rounded-budju border border-white/10 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">{symbol}</h3>
        {dryRun && (
          <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full">
            DRY RUN
          </span>
        )}
      </div>

      {/* Current price */}
      {price && (
        <div className="mb-4 text-center">
          <span className="text-2xl font-bold text-white">
            ${price.price < 0.01 ? price.price.toFixed(6) : price.price.toFixed(2)}
          </span>
          <span className={`ml-2 text-sm ${price.change_pct >= 0 ? "text-green-400" : "text-red-400"}`}>
            {price.change_pct >= 0 ? "+" : ""}{price.change_pct.toFixed(2)}%
          </span>
        </div>
      )}

      {/* Current holding */}
      {holding && (
        <div className="bg-white/5 rounded-lg p-3 mb-4 text-sm">
          <div className="flex justify-between text-white/60">
            <span>Holding</span>
            <span>{holding.amount.toFixed(6)} {symbol}</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Value</span>
            <span>${holding.value.toFixed(2)}</span>
          </div>
          <div className={`flex justify-between ${holding.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            <span>PnL</span>
            <span>{holding.pnl >= 0 ? "+" : ""}${holding.pnl.toFixed(2)} ({holding.pnl_pct.toFixed(1)}%)</span>
          </div>
        </div>
      )}

      {/* Buy / Sell tabs */}
      <div className="flex mb-4 bg-white/5 rounded-lg p-1">
        <button
          onClick={() => setSide("buy")}
          className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
            side === "buy" ? "bg-green-500/20 text-green-400" : "text-white/50 hover:text-white/70"
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setSide("sell")}
          className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
            side === "sell" ? "bg-red-500/20 text-red-400" : "text-white/50 hover:text-white/70"
          }`}
        >
          Sell
        </button>
      </div>

      {side === "buy" ? (
        <>
          <label className="text-xs text-white/50 mb-1 block">Amount (USD)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-lg font-mono focus:outline-none focus:border-budju-blue/50 mb-2"
          />
          <div className="flex gap-2 mb-4">
            {quickAmounts.map((qa) => (
              <button
                key={qa}
                onClick={() => setAmount(qa.toString())}
                className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg py-1.5 text-sm text-white/70 transition-colors"
              >
                ${qa}
              </button>
            ))}
          </div>
          {price && amount && (
            <p className="text-xs text-white/40 mb-3 text-center">
              ~{(parseFloat(amount) / price.price).toFixed(6)} {symbol}
            </p>
          )}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleBuy}
            disabled={loading || !amount || parseFloat(amount) <= 0}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <FaShoppingCart />
            {loading ? "Buying..." : `Buy ${symbol}`}
          </motion.button>
        </>
      ) : (
        <>
          <label className="text-xs text-white/50 mb-1 block">Sell percentage</label>
          <input
            type="number"
            value={sellPct}
            onChange={(e) => setSellPct(e.target.value)}
            min="1"
            max="100"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-lg font-mono focus:outline-none focus:border-budju-blue/50 mb-2"
          />
          <div className="flex gap-2 mb-4">
            {quickSellPcts.map((pct) => (
              <button
                key={pct}
                onClick={() => setSellPct(pct.toString())}
                className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg py-1.5 text-sm text-white/70 transition-colors"
              >
                {pct}%
              </button>
            ))}
          </div>
          {holding && sellPct && (
            <p className="text-xs text-white/40 mb-3 text-center">
              ~{(holding.amount * parseFloat(sellPct) / 100).toFixed(6)} {symbol} (~${(holding.value * parseFloat(sellPct) / 100).toFixed(2)})
            </p>
          )}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSell}
            disabled={loading || !holding || holding.amount <= 0}
            className="w-full bg-red-600 hover:bg-red-500 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <FaMoneyBillWave />
            {loading ? "Selling..." : `Sell ${symbol}`}
          </motion.button>
        </>
      )}

      {/* Result message */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mt-3 p-3 rounded-lg text-sm ${
            result.success
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}
        >
          {result.message}
        </motion.div>
      )}
    </div>
  );
}
