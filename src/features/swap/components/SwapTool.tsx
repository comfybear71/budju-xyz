import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { gsap } from "gsap";
import { particleBurst } from "@/lib/utils/animation";
import { useTheme } from "@/context/ThemeContext";
import { useWallet } from "@hooks/useWallet";
import { useTrading } from "@hooks/useTrading";
import { getTokenBySymbol } from "@lib/services/tokenRegistry";
import PriceChart from "@components/common/PriceChart";
import RecentTrades from "@components/common/RecentTrades";
import { FaCog, FaTimes } from "react-icons/fa";

const SwapTool = () => {
  const { isDarkMode } = useTheme();
  const { connection, balances } = useWallet();
  const sectionRef = useRef<HTMLDivElement>(null);

  // Trading state
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fromToken, setFromToken] = useState("USDC");
  const [toToken, setToToken] = useState("BUDJU");
  const [timeframe, setTimeframe] = useState("1D");

  // Slippage settings
  const [slippageBps, setSlippageBps] = useState(50);
  const [showSettings, setShowSettings] = useState(false);

  // Success modal state
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTxId, setSuccessTxId] = useState("");
  const [successAction, setSuccessAction] = useState("");

  // Notification state
  const [notification, setNotification] = useState({
    show: false,
    message: "",
    type: "info",
  });

  const {
    loading,
    error,
    estimate,
    chartData,
    chartLoading,
    executeSwap,
    executeDeposit,
    loadChartData,
  } = useTrading(fromToken, toToken, fromAmount, slippageBps);

  const isConnected = connection.connected;

  // Update toAmount when estimate changes
  useEffect(() => {
    const updateToAmount = async () => {
      if (estimate) {
        const toTokenInfo = await getTokenBySymbol(toToken);
        if (toTokenInfo) {
          setToAmount(
            (estimate.outAmount / Math.pow(10, toTokenInfo.decimals)).toFixed(6),
          );
        }
      } else {
        setToAmount("");
      }
    };
    updateToAmount();
  }, [estimate, toToken]);

  const handleTimeframeChange = (newTimeframe: string) => {
    setTimeframe(newTimeframe);
    loadChartData(newTimeframe);
  };

  const handleSwapTokens = () => {
    const tempToken = fromToken;
    setFromToken(toToken);
    setToToken(tempToken);
    const tempAmount = fromAmount;
    setFromAmount(toAmount);
    setToAmount(tempAmount);
  };

  const showNotification = (message: string, type = "info") => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, show: false }));
    }, 5000);
  };

  const setMaxAmount = async () => {
    if (!isConnected) {
      showNotification("Please connect your wallet first", "error");
      return;
    }
    try {
      let maxAmount = 0;
      if (fromToken === "SOL") {
        maxAmount = Math.max(0, balances.sol - 0.01);
      } else {
        const tokenBalance = balances.tokens.find(
          (token) => token.symbol === fromToken,
        );
        if (tokenBalance) maxAmount = tokenBalance.amount;
      }
      if (maxAmount > 0) {
        setFromAmount(maxAmount.toString());
      } else {
        showNotification(`No ${fromToken} balance found in your wallet`, "info");
      }
    } catch (err) {
      console.error("Error setting max amount:", err);
      showNotification("Failed to set maximum amount", "error");
    }
  };

  const handleSwap = async () => {
    if (!isConnected) {
      showNotification("Please connect your wallet first", "error");
      return;
    }
    if (!connection.wallet || !connection.wallet.address) {
      showNotification("Wallet connection issue. Please reconnect.", "error");
      return;
    }
    try {
      const txId = await executeSwap();
      setSuccessTxId(txId);
      setSuccessAction("swap");
      setShowSuccess(true);
      if (sectionRef.current) {
        particleBurst(sectionRef.current, {
          count: 30,
          colors: ["#FF69B4", "#87CEFA", "#FFD700"],
          size: 10,
          duration: 1.5,
        });
      }
      setFromAmount("");
      setToAmount("");
    } catch (err) {
      console.error("Swap error:", err);
      showNotification(
        `Swap failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        "error",
      );
    }
  };

  const cardBg = isDarkMode
    ? "bg-[#0c0c20]/80 border border-white/[0.06]"
    : "bg-white/20 border border-white/30";

  const inputBg = isDarkMode
    ? "bg-white/[0.04] border border-white/[0.06]"
    : "bg-white/30 border border-white/20";

  return (
    <section ref={sectionRef} className="px-4 pb-8">
      <div className="max-w-6xl mx-auto">
        {/* Main layout: Chart left, Swap right */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Chart */}
          <div
            className={`w-full lg:flex-1 rounded-xl p-4 h-[350px] sm:h-[420px] lg:h-[480px] backdrop-blur-sm ${cardBg}`}
          >
            <div className="relative w-full h-full">
              <PriceChart
                data={chartData}
                baseToken={fromToken}
                quoteToken={toToken}
                timeframe={timeframe}
                onTimeframeChange={handleTimeframeChange}
                loading={chartLoading}
                isConnected={isConnected}
              />
            </div>
          </div>

          {/* Swap Form */}
          <div className="w-full lg:w-[340px] flex-shrink-0">
            <div className={`rounded-xl p-4 backdrop-blur-sm ${cardBg}`}>
              {/* Header: Swap label + settings */}
              <div className="flex items-center justify-between mb-4">
                <span className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  Swap
                </span>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>
                    {slippageBps / 100}%
                  </span>
                  <div className="relative">
                    <button
                      onClick={() => setShowSettings(!showSettings)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isDarkMode
                          ? "text-gray-400 hover:text-gray-300 hover:bg-white/[0.06]"
                          : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <FaCog size={12} />
                    </button>

                    {/* Settings Dropdown */}
                    <AnimatePresence>
                      {showSettings && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className={`absolute top-8 right-0 z-20 p-3 rounded-xl shadow-lg w-52 backdrop-blur-md ${
                            isDarkMode
                              ? "bg-[#12122e]/95 border border-white/[0.08]"
                              : "bg-white/90 border border-gray-200"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                              Slippage
                            </span>
                            <button
                              onClick={() => setShowSettings(false)}
                              className={`p-0.5 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                            >
                              <FaTimes size={10} />
                            </button>
                          </div>
                          <div className="flex gap-1.5 mb-2">
                            {[25, 50, 100, 200].map((bps) => (
                              <button
                                key={bps}
                                onClick={() => setSlippageBps(bps)}
                                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-colors ${
                                  slippageBps === bps
                                    ? "bg-budju-blue text-white"
                                    : isDarkMode
                                      ? "bg-white/[0.06] text-gray-400 hover:bg-white/[0.1]"
                                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                              >
                                {bps / 100}%
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0.1"
                              max="10"
                              step="0.1"
                              value={slippageBps / 100}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value);
                                if (!isNaN(value) && value > 0 && value <= 10) {
                                  setSlippageBps(Math.round(value * 100));
                                }
                              }}
                              className={`flex-1 p-1.5 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-budju-blue ${
                                isDarkMode
                                  ? "bg-white/[0.04] text-white border-white/[0.08]"
                                  : "bg-gray-50 text-gray-900 border-gray-200"
                              }`}
                            />
                            <span className={`text-xs ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>
                              %
                            </span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* From Field */}
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>
                    From
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setFromAmount("0")}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                        isDarkMode
                          ? "text-gray-500 bg-white/[0.04] hover:bg-white/[0.08]"
                          : "text-gray-400 bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      0
                    </button>
                    <button
                      onClick={setMaxAmount}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                        isDarkMode
                          ? "text-gray-500 bg-white/[0.04] hover:bg-white/[0.08]"
                          : "text-gray-400 bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      Max
                    </button>
                  </div>
                </div>
                <div className={`rounded-xl p-3 ${inputBg}`}>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        const tokens = ["SOL", "BUDJU", "USDC"];
                        const idx = tokens.indexOf(fromToken);
                        setFromToken(tokens[(idx + 1) % tokens.length]);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg flex-shrink-0 transition-colors ${
                        isDarkMode
                          ? "bg-white/[0.06] hover:bg-white/[0.1]"
                          : "bg-white/40 hover:bg-white/60"
                      }`}
                    >
                      <img
                        src={`/images/tokens/${fromToken.toLowerCase()}.png`}
                        alt={fromToken}
                        className="w-5 h-5"
                      />
                      <span className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                        {fromToken}
                      </span>
                      <svg className={`w-3 h-3 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <input
                      type="text"
                      value={fromAmount}
                      onChange={(e) => setFromAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="0.00"
                      className={`bg-transparent text-right flex-1 min-w-0 focus:outline-none text-base font-mono ${
                        isDarkMode ? "text-white placeholder-gray-600" : "text-gray-900 placeholder-gray-300"
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Swap Arrow */}
              <div className="flex justify-center -my-1 relative z-10">
                <button
                  onClick={handleSwapTokens}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 ${
                    isDarkMode
                      ? "bg-[#0c0c20] border border-white/[0.08] text-budju-blue hover:border-budju-blue/40"
                      : "bg-white border border-gray-200 text-budju-blue hover:border-budju-blue"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </button>
              </div>

              {/* To Field */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>
                    To
                  </span>
                </div>
                <div className={`rounded-xl p-3 ${inputBg}`}>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        const tokens = ["BUDJU", "USDC", "SOL"];
                        const idx = tokens.indexOf(toToken);
                        setToToken(tokens[(idx + 1) % tokens.length]);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg flex-shrink-0 transition-colors ${
                        isDarkMode
                          ? "bg-white/[0.06] hover:bg-white/[0.1]"
                          : "bg-white/40 hover:bg-white/60"
                      }`}
                    >
                      <img
                        src={`/images/tokens/${toToken.toLowerCase()}.png`}
                        alt={toToken}
                        className="w-5 h-5"
                      />
                      <span className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                        {toToken}
                      </span>
                      <svg className={`w-3 h-3 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <input
                      type="text"
                      value={toAmount}
                      onChange={(e) => setToAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="0.00"
                      className={`bg-transparent text-right flex-1 min-w-0 focus:outline-none text-base font-mono ${
                        isDarkMode ? "text-white placeholder-gray-600" : "text-gray-900 placeholder-gray-300"
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Price estimate */}
              {estimate && (
                <div
                  className={`mb-3 px-3 py-2 rounded-lg text-[10px] flex items-center justify-between ${
                    isDarkMode ? "bg-white/[0.03] text-gray-500" : "bg-gray-50 text-gray-500"
                  }`}
                >
                  <span>
                    1 {fromToken} = {estimate.estimatedPrice.toFixed(6)} {toToken}
                  </span>
                  <span>Slippage: {slippageBps / 100}%</span>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mb-3 px-3 py-2 rounded-lg text-xs bg-red-500/10 border border-red-500/20 text-red-400">
                  {error}
                </div>
              )}

              {/* Action Button */}
              <button
                onClick={isConnected ? handleSwap : undefined}
                disabled={!isConnected || loading || !fromAmount || parseFloat(fromAmount) === 0}
                className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-budju-pink to-budju-blue hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {!isConnected
                  ? "Connect Wallet to Swap"
                  : loading
                    ? "Processing..."
                    : `Swap ${fromToken} to ${toToken}`}
              </button>
            </div>
          </div>
        </div>

        {/* Market Activity — below everything */}
        <div className="mt-4">
          <RecentTrades />
        </div>
      </div>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 bg-black/70 px-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`relative p-5 rounded-xl shadow-xl w-full max-w-sm backdrop-blur-md ${
                isDarkMode
                  ? "bg-[#12122e]/95 border border-white/[0.08] text-white"
                  : "bg-white/90 border border-gray-200 text-gray-900"
              }`}
            >
              <button
                className={`absolute top-3 right-3 ${isDarkMode ? "text-gray-500 hover:text-gray-300" : "text-gray-400 hover:text-gray-600"}`}
                onClick={() => setShowSuccess(false)}
              >
                <FaTimes size={14} />
              </button>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-base font-bold mb-1">
                  {successAction === "swap" ? "Swap Successful!" : "Deposit Successful!"}
                </h3>
                <p className={`text-xs mb-3 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                  {successAction === "swap"
                    ? `You have successfully swapped ${fromToken} to ${toToken}.`
                    : `You have successfully deposited ${fromToken} to the Bank of BUDJU.`}
                </p>
                <div
                  className={`px-3 py-2 rounded-lg mb-3 text-[10px] font-mono break-all ${
                    isDarkMode ? "bg-white/[0.04] text-gray-400" : "bg-gray-50 text-gray-500"
                  }`}
                >
                  TX: {successTxId}
                </div>
                <button
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition-colors ${
                    isDarkMode
                      ? "bg-white/[0.06] text-white hover:bg-white/[0.1]"
                      : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                  }`}
                  onClick={() => setShowSuccess(false)}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification.show && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50"
          >
            <div
              className={`px-4 py-2.5 rounded-xl shadow-lg max-w-sm flex items-center gap-3 text-white text-xs font-medium backdrop-blur-md ${
                notification.type === "error"
                  ? "bg-red-500/90"
                  : notification.type === "success"
                    ? "bg-green-500/90"
                    : "bg-budju-blue/90"
              }`}
            >
              <span className="flex-1">{notification.message}</span>
              <button
                onClick={() => setNotification((prev) => ({ ...prev, show: false }))}
                className="flex-shrink-0"
              >
                <FaTimes size={10} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default SwapTool;
