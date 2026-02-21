import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { gsap } from "gsap";
import WalletConnect from "@components/common/WalletConnect";
import { particleBurst } from "@/lib/utils/animation";
import { useTheme } from "@/context/ThemeContext";
import { useWallet } from "@hooks/useWallet";
import { useTrading } from "@hooks/useTrading";
import { getTokenBySymbol } from "@lib/services/tokenRegistry";
import PriceChart from "@components/common/PriceChart";
import { FaChartLine, FaTimes, FaCog } from "react-icons/fa";

const SwapTool = () => {
  const { isDarkMode } = useTheme();
  const { connection, balances } = useWallet();
  const sectionRef = useRef(null);
  const formRef = useRef(null);
  const coinRef = useRef(null);

  // Trading state
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fromToken, setFromToken] = useState("SOL");
  const [toToken, setToToken] = useState("BUDJU");
  const [timeframe, setTimeframe] = useState("1D");

  // Slippage settings
  const [slippageBps, setSlippageBps] = useState(50); // 0.5%
  const [showSettings, setShowSettings] = useState(false);

  // Success modal state
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTxId, setSuccessTxId] = useState("");
  const [successAction, setSuccessAction] = useState("");

  // Chart modal state (for mobile)
  const [showChartModal, setShowChartModal] = useState(false);

  // Notification state
  const [notification, setNotification] = useState({
    show: false,
    message: "",
    type: "info", // "info", "error", "success"
  });

  // Integrate with trading hook
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

  // Check wallet connection status
  const isConnected = connection.connected;

  // Update toAmount when estimate changes
  useEffect(() => {
    const updateToAmount = async () => {
      if (estimate) {
        const toTokenInfo = await getTokenBySymbol(toToken);
        if (toTokenInfo) {
          setToAmount(
            (estimate.outAmount / Math.pow(10, toTokenInfo.decimals)).toFixed(
              6,
            ),
          );
        }
      } else {
        setToAmount("");
      }
    };
    updateToAmount();
  }, [estimate, toToken]);

  // Coin animation
  useEffect(() => {
    if (coinRef.current) {
      gsap.to(coinRef.current, {
        y: -10,
        duration: 1.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
      gsap.to(coinRef.current, {
        rotateY: 360,
        duration: 8,
        repeat: -1,
        ease: "none",
      });
    }
  }, []);

  // Form animations
  useEffect(() => {
    if (formRef.current) {
      const formElements = (formRef.current as HTMLElement).querySelectorAll(
        ".form-element",
      );
      gsap.fromTo(
        formElements,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.1,
          duration: 0.5,
          scrollTrigger: {
            trigger: formRef.current,
            start: "top 80%",
          },
        },
      );
    }
  }, []);

  // Handle timeframe change
  const handleTimeframeChange = (newTimeframe: string) => {
    setTimeframe(newTimeframe);
    loadChartData(newTimeframe);
  };

  // Swap tokens
  const handleSwapTokens = () => {
    const tempToken = fromToken;
    setFromToken(toToken);
    setToToken(tempToken);

    const tempAmount = fromAmount;
    setFromAmount(toAmount);
    setToAmount(tempAmount);
  };

  // Show notification
  const showNotification = (message: string, type = "info") => {
    setNotification({
      show: true,
      message,
      type,
    });

    // Auto-hide after 5 seconds
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, show: false }));
    }, 5000);
  };

  // Set max amount based on wallet balance
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
        if (tokenBalance) {
          maxAmount = tokenBalance.amount;
        }
      }

      if (maxAmount > 0) {
        setFromAmount(maxAmount.toString());
      } else {
        showNotification(
          `No ${fromToken} balance found in your wallet`,
          "info",
        );
      }
    } catch (error) {
      console.error("Error setting max amount:", error);
      showNotification("Failed to set maximum amount", "error");
    }
  };

  // Handle swap execution
  const handleSwap = async () => {
    if (!isConnected) {
      showNotification("Please connect your wallet first", "error");
      return;
    }

    if (!connection.wallet || !connection.wallet.address) {
      showNotification(
        "Wallet connection issue detected. Please reconnect your wallet.",
        "error",
      );
      return;
    }

    try {
      console.log("Executing swap with:", {
        fromToken,
        toToken,
        amount: fromAmount,
        wallet: connection.wallet ? "Connected" : "Not connected",
        slippageBps,
      });

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
    } catch (error) {
      console.error("Swap error:", error);
      showNotification(
        `Swap failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  };

  // Handle deposit execution (placeholder)
  const handleDeposit = async () => {
    if (!isConnected) {
      showNotification("Please connect your wallet first", "error");
      return;
    }

    try {
      const txId = await executeDeposit(fromToken, fromAmount);

      setSuccessTxId(txId);
      setSuccessAction("deposit");
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
    } catch (error) {
      console.error("Deposit error:", error);
      showNotification(
        `Deposit failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  };

  // Debug wallet connection
  const debugWalletConnection = () => {
    console.log("Wallet connection debugging:", {
      isConnected,
      wallet: connection.wallet,
      walletAddress: connection.wallet?.address,
      connectionState: connection,
      phantomAvailable: !!window.solana?.isPhantom,
      solflareAvailable: !!window.solflare?.isSolflare,
      solanaConnected: window.solana?.isConnected,
      solflareConnected: window.solflare?.isConnected,
    });

    showNotification("Wallet debug info logged to console", "info");
  };

  return (
    <section ref={sectionRef} id="swap-tool">
      <div className="budju-container px-4 sm:px-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Trading Form — shows first on mobile, second on desktop */}
          <div className="w-full lg:w-1/3 max-w-md mx-auto lg:mx-0 order-1 lg:order-2">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div
                ref={formRef}
                className={`rounded-xl p-4 sm:p-5 shadow-lg ${
                  isDarkMode
                    ? "bg-gray-800/90 backdrop-blur-sm"
                    : "bg-white/20 backdrop-blur-sm border border-white/30"
                }`}
              >
                {/* Top Bar */}
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center space-x-2 relative">
                    <button
                      onClick={() => setShowSettings(!showSettings)}
                      className={`hover:text-budju-pink-light transition-colors ${
                        isDarkMode ? "text-gray-400" : "text-white/80"
                      }`}
                    >
                      <FaCog className="w-5 h-5" />
                    </button>
                    <span
                      className={`text-sm ${
                        isDarkMode ? "text-gray-400" : "text-white/80"
                      }`}
                    >
                      {slippageBps / 100}%
                    </span>

                    {/* Settings Dropdown */}
                    {showSettings && (
                      <div
                        className={`absolute top-8 left-0 z-20 p-3 rounded-lg shadow-lg w-56 backdrop-blur-sm ${
                          isDarkMode
                            ? "bg-gray-800/90 text-gray-300"
                            : "bg-white/30 text-white border border-white/20"
                        }`}
                      >
                        <div className="mb-3">
                          <label
                            className={`text-sm ${
                              isDarkMode ? "text-gray-300" : "text-white"
                            }`}
                          >
                            Slippage Tolerance
                          </label>
                          <div className="flex mt-2 gap-2">
                            {[25, 50, 100, 200].map((bps) => (
                              <button
                                key={bps}
                                onClick={() => setSlippageBps(bps)}
                                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                                  slippageBps === bps
                                    ? "bg-budju-blue text-white"
                                    : isDarkMode
                                      ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                      : "bg-white/50 text-white hover:bg-white/70"
                                }`}
                              >
                                {bps / 100}%
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label
                            className={`text-sm ${
                              isDarkMode ? "text-gray-300" : "text-white"
                            }`}
                          >
                            Custom
                          </label>
                          <div className="flex mt-1 items-center">
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
                              className={`w-full p-1 text-sm rounded-md border focus:outline-none focus:ring-2 focus:ring-budju-blue ${
                                isDarkMode
                                  ? "bg-gray-700 text-white border-gray-600"
                                  : "bg-white/50 text-white border-white/30"
                              }`}
                            />
                            <span
                              className={`ml-2 ${
                                isDarkMode ? "text-gray-300" : "text-white"
                              }`}
                            >
                              %
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowChartModal(true)}
                    className="sm:hidden text-budju-blue hover:text-budju-blue-light transition-colors"
                  >
                    <FaChartLine className="w-5 h-5" />
                  </button>
                </div>

                {/* From Field */}
                <div className="form-element mb-4 sm:mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <label
                      className={isDarkMode ? "text-gray-400" : "text-white"}
                    >
                      From
                    </label>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setFromAmount("0")}
                        className={`text-xs sm:text-sm px-2 py-1 rounded transition-colors ${
                          isDarkMode
                            ? "text-gray-400 bg-gray-700 hover:bg-gray-600"
                            : "text-white/90 bg-white/30 hover:bg-white/50"
                        }`}
                      >
                        0
                      </button>
                      <button
                        onClick={setMaxAmount}
                        className={`text-xs sm:text-sm px-2 py-1 rounded transition-colors ${
                          isDarkMode
                            ? "text-gray-400 bg-gray-700 hover:bg-gray-600"
                            : "text-white/90 bg-white/30 hover:bg-white/50"
                        }`}
                      >
                        Max
                      </button>
                    </div>
                  </div>
                  <div
                    className={`rounded-lg p-3 flex items-center flex-wrap gap-2 ${
                      isDarkMode
                        ? "bg-gray-700/50"
                        : "bg-white/30 border border-white/20"
                    }`}
                  >
                    <div
                      className={`flex items-center rounded-lg py-2 px-3 mr-2 cursor-pointer transition-colors ${
                        isDarkMode
                          ? "bg-gray-600 hover:bg-gray-500"
                          : "bg-white/40 hover:bg-white/50"
                      }`}
                      onClick={() => {
                        const tokens = ["SOL", "BUDJU", "USDC"];
                        const currentIndex = tokens.indexOf(fromToken);
                        const nextIndex = (currentIndex + 1) % tokens.length;
                        setFromToken(tokens[nextIndex]);
                      }}
                    >
                      <img
                        src={`/images/tokens/${fromToken.toLowerCase()}.png`}
                        alt={fromToken}
                        className="w-5 sm:w-6 h-5 sm:h-6 mr-2"
                      />
                      <span
                        className={
                          isDarkMode ? "text-white" : "text-white font-medium"
                        }
                      >
                        {fromToken}
                      </span>
                      <svg
                        className={`w-4 h-4 ml-2 ${
                          isDarkMode ? "text-gray-400" : "text-white/80"
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={fromAmount}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9.]/g, "");
                        setFromAmount(value);
                      }}
                      placeholder="0.00"
                      className={`bg-transparent text-right flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-budju-blue text-sm sm:text-base truncate ${
                        isDarkMode ? "text-white" : "text-white"
                      }`}
                    />
                  </div>
                </div>

                {/* Arrow Button */}
                <div className="form-element flex justify-center -my-2">
                  <div
                    className={`rounded-full p-2 cursor-pointer transform transition-transform hover:scale-110 ${
                      isDarkMode
                        ? "bg-gray-700 hover:bg-gray-600"
                        : "bg-white/40 hover:bg-white/50"
                    }`}
                    onClick={handleSwapTokens}
                  >
                    <svg
                      className="w-5 sm:w-6 h-5 sm:h-6 text-budju-blue"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                      />
                    </svg>
                  </div>
                </div>

                {/* To Field */}
                <div className="form-element mb-4 sm:mb-6 mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <label
                      className={isDarkMode ? "text-gray-400" : "text-white"}
                    >
                      To
                    </label>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setToAmount("0")}
                        className={`text-xs sm:text-sm px-2 py-1 rounded transition-colors ${
                          isDarkMode
                            ? "text-gray-400 bg-gray-700 hover:bg-gray-600"
                            : "text-white/90 bg-white/30 hover:bg-white/50"
                        }`}
                      >
                        0
                      </button>
                    </div>
                  </div>
                  <div
                    className={`rounded-lg p-3 flex items-center flex-wrap gap-2 ${
                      isDarkMode
                        ? "bg-gray-700/50"
                        : "bg-white/30 border border-white/20"
                    }`}
                  >
                    <div
                      className={`flex items-center rounded-lg py-2 px-3 mr-2 cursor-pointer transition-colors ${
                        isDarkMode
                          ? "bg-gray-600 hover:bg-gray-500"
                          : "bg-white/40 hover:bg-white/50"
                      }`}
                      onClick={() => {
                        const tokens = ["BUDJU", "USDC", "SOL"];
                        const currentIndex = tokens.indexOf(toToken);
                        const nextIndex = (currentIndex + 1) % tokens.length;
                        setToToken(tokens[nextIndex]);
                      }}
                    >
                      <img
                        src={`/images/tokens/${toToken.toLowerCase()}.png`}
                        alt={toToken}
                        className="w-5 sm:w-6 h-5 sm:h-6 mr-2"
                      />
                      <span
                        className={
                          isDarkMode ? "text-white" : "text-white font-medium"
                        }
                      >
                        {toToken}
                      </span>
                      <svg
                        className={`w-4 h-4 ml-2 ${
                          isDarkMode ? "text-gray-400" : "text-white/80"
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={toAmount}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9.]/g, "");
                        setToAmount(value);
                      }}
                      placeholder="0.00"
                      className={`bg-transparent text-right flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-budju-blue text-sm sm:text-base truncate ${
                        isDarkMode ? "text-white" : "text-white"
                      }`}
                    />
                  </div>
                </div>

                {/* Transaction Details */}
                {estimate && (
                  <div
                    className={`form-element mb-4 text-xs sm:text-sm p-3 rounded-lg flex items-center justify-between ${
                      isDarkMode
                        ? "bg-gray-700/50"
                        : "bg-white/20 border border-white/20"
                    }`}
                  >
                    <div className="flex items-center">
                      <span
                        className={
                          isDarkMode ? "text-gray-400" : "text-white/80"
                        }
                      >
                        {fromToken} / {toToken}
                      </span>
                      <span
                        className={`ml-2 ${
                          isDarkMode ? "text-white" : "text-white"
                        }`}
                      >
                        {estimate.estimatedPrice.toFixed(6)}
                      </span>
                      <span
                        className={`ml-2 ${
                          isDarkMode ? "text-gray-400" : "text-white/80"
                        }`}
                      >
                        Slippage: {slippageBps / 100}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Error message */}
                {error && (
                  <div
                    className={`form-element mb-4 p-2 rounded-lg text-xs sm:text-sm ${
                      isDarkMode
                        ? "bg-red-500/20 text-red-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {error}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="form-element flex flex-col gap-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full budju-button-primary text-white py-2 sm:py-3 px-4 rounded-lg font-medium transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base`}
                    onClick={handleSwap}
                    disabled={
                      loading || !fromAmount || parseFloat(fromAmount) === 0
                    }
                  >
                    {loading
                      ? "Processing..."
                      : `Swap ${fromToken} to ${toToken}`}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Chart — shows second on mobile, first on desktop */}
          <div
            className={`w-full lg:w-2/3 rounded-lg p-4 h-[350px] sm:h-[450px] lg:h-[500px] shadow-lg order-2 lg:order-1 ${
              isDarkMode
                ? "bg-gray-900/80 backdrop-blur-sm"
                : "bg-white/20 backdrop-blur-sm border border-white/30"
            }`}
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
        </div>
      </div>

      {/* Chart Modal (Mobile) */}
      <AnimatePresence>
        {showChartModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowChartModal(false)}
            />
            <motion.div
              className={`w-full max-w-md rounded-t-lg p-4 relative h-[90vh] shadow-lg backdrop-blur-sm ${
                isDarkMode
                  ? "bg-gray-900/90 text-white"
                  : "bg-white/20 text-white border-t border-white/30"
              }`}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100) setShowChartModal(false);
              }}
            >
              <div className="w-12 h-1 bg-gray-500 rounded-full mx-auto mb-4" />
              <button
                className={`absolute top-4 right-4 transition-colors ${
                  isDarkMode
                    ? "text-gray-400 hover:text-gray-200"
                    : "text-white/80 hover:text-white"
                }`}
                onClick={() => setShowChartModal(false)}
              >
                <FaTimes className="w-5 h-5" />
              </button>
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/70 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`relative p-4 sm:p-6 rounded-xl shadow-xl w-full max-w-sm sm:max-w-md backdrop-blur-sm ${
              isDarkMode
                ? "bg-gray-900/90 text-white"
                : "bg-white/20 text-white border border-white/30"
            }`}
          >
            <button
              className={`absolute top-3 right-3 transition-colors ${
                isDarkMode
                  ? "text-gray-400 hover:text-gray-200"
                  : "text-white/80 hover:text-white"
              }`}
              onClick={() => setShowSuccess(false)}
            >
              <svg
                className="w-5 sm:w-6 h-5 sm:h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <div className="w-12 sm:w-16 h-12 sm:h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg
                    className="w-6 sm:w-8 h-6 sm:h-8 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <h3
                className={`text-lg sm:text-xl font-bold mb-2 ${
                  isDarkMode ? "text-white" : "text-white"
                }`}
              >
                {successAction === "swap"
                  ? "Swap Successful!"
                  : "Deposit Successful!"}
              </h3>
              <p
                className={`mb-4 text-sm sm:text-base ${
                  isDarkMode ? "text-gray-300" : "text-white/80"
                }`}
              >
                {successAction === "swap"
                  ? `You have successfully swapped ${fromToken} to ${toToken}.`
                  : `You have successfully deposited ${fromToken} to the Bank of BUDJU.`}
              </p>
              <div
                className={`p-2 sm:p-3 rounded-lg mb-4 text-xs sm:text-sm break-all ${
                  isDarkMode
                    ? "bg-gray-800 text-gray-300"
                    : "bg-white/30 text-white/80 border border-white/20"
                }`}
              >
                Transaction ID: {successTxId}
              </div>
              <button
                className={`w-full budju-button-secondary text-white py-2 sm:py-3 rounded-lg font-medium text-sm sm:text-base transition-colors`}
                onClick={() => setShowSuccess(false)}
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

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
              className={`px-4 py-3 rounded-lg shadow-lg max-w-sm w-full flex items-center ${
                notification.type === "error"
                  ? "bg-red-500"
                  : notification.type === "success"
                    ? "bg-green-500"
                    : "bg-budju-blue"
              }`}
            >
              <div className="flex-shrink-0 mr-3">
                {notification.type === "error" ? (
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                ) : notification.type === "success" ? (
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
              </div>
              <div className="flex-1 text-white text-sm">
                {notification.message}
              </div>
              <button
                onClick={() =>
                  setNotification((prev) => ({ ...prev, show: false }))
                }
                className="flex-shrink-0 ml-2 text-white"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default SwapTool;
