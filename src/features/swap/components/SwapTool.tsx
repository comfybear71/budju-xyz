// src/features/swap/SwapTool.tsx
import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { gsap } from "gsap";
import WalletConnect from "@components/common/WalletConnect";
import { particleBurst } from "@/lib/utils/animation";
import { useTheme } from "@/context/ThemeContext";
import { useWallet } from "@hooks/useWallet";
import { useTrading } from "@hooks/useTrading";
import { initializeTokenRegistry } from "@lib/services/tokenRegistry";
import PriceChart from "@components/common/PriceChart";
import { FaChartLine, FaTimes, FaCog } from "react-icons/fa";

const SwapTool = () => {
  const { isDarkMode } = useTheme();
  const { connection } = useWallet();
  const sectionRef = useRef(null);
  const formRef = useRef(null);
  const coinRef = useRef(null);

  // Trading state
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fromToken, setFromToken] = useState("SOL");
  const [toToken, setToToken] = useState("BUDJU");
  const [timeframe, setTimeframe] = useState("1D");

  // Success modal state
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTxId, setSuccessTxId] = useState("");
  const [successAction, setSuccessAction] = useState("");

  // Chart modal state (for mobile)
  const [showChartModal, setShowChartModal] = useState(false);

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
  } = useTrading(fromToken, toToken, fromAmount);

  // Initialize token registry on mount
  useEffect(() => {
    initializeTokenRegistry();
  }, []);

  // Check wallet connection status
  const isConnected = connection.connected;

  // Update toAmount when estimate changes
  useEffect(() => {
    if (estimate) {
      setToAmount(estimate.toAmount.toFixed(6));
    } else {
      setToAmount("");
    }
  }, [estimate]);

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

  // Handle swap execution
  const handleSwap = async () => {
    if (!isConnected) {
      alert("Please connect your wallet first");
      return;
    }

    if (!connection.wallet || !connection.wallet.address) {
      alert("Wallet connection issue detected. Please reconnect your wallet.");
      return;
    }

    try {
      console.log("Executing swap with:", {
        fromToken,
        toToken,
        amount: fromAmount,
        wallet: connection.wallet ? "Connected" : "Not connected",
      });

      const txId = await executeSwap();

      // Set success state
      setSuccessTxId(txId);
      setSuccessAction("swap");
      setShowSuccess(true);

      // Success animation
      if (sectionRef.current) {
        particleBurst(sectionRef.current, {
          count: 30,
          colors: ["#FF69B4", "#87CEFA", "#FFD700"],
          size: 10,
          duration: 1.5,
        });
      }

      // Reset form
      setFromAmount("");
      setToAmount("");
    } catch (error) {
      console.error("Swap error:", error);
      alert(
        `Swap failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  // Handle deposit execution
  const handleDeposit = async () => {
    if (!isConnected) {
      alert("Please connect your wallet first");
      return;
    }

    if (!connection.wallet || !connection.wallet.address) {
      alert("Wallet connection issue detected. Please reconnect your wallet.");
      return;
    }

    try {
      console.log("Executing deposit with:", {
        token: fromToken,
        amount: fromAmount,
        wallet: connection.wallet ? "Connected" : "Not connected",
      });

      const txId = await executeDeposit(fromToken, fromAmount);

      // Set success state
      setSuccessTxId(txId);
      setSuccessAction("deposit");
      setShowSuccess(true);

      // Success animation
      if (sectionRef.current) {
        particleBurst(sectionRef.current, {
          count: 30,
          colors: ["#FF69B4", "#87CEFA", "#FFD700"],
          size: 10,
          duration: 1.5,
        });
      }

      // Reset form
      setFromAmount("");
    } catch (error) {
      console.error("Deposit error:", error);
      alert(
        `Deposit failed: ${error instanceof Error ? error.message : "Unknown error"}`,
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
  };

  return (
    <section ref={sectionRef} id="swap-tool">
      <div className="budju-container px-4 sm:px-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Chart (Visible on Larger Screens) */}
          <div className="hidden md:block md:w-2/3 bg-gray-900/80 backdrop-blur-sm rounded-lg p-4 h-[500px] shadow-lg">
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

          {/* Trading Form */}
          <div className="w-full md:w-1/3 max-w-md mx-auto md:mx-0">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div
                ref={formRef}
                className={`rounded-xl p-4 sm:p-5 ${isDarkMode ? "budju-card" : "bg-white/20 border border-white/30 shadow-lg"}`}
              >
                {/* Top Bar with Settings and Chart Icon (Chart Icon Visible on Mobile Only) */}
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center space-x-2">
                    {/* Placeholder for Settings (Gear Icon) */}
                    <button
                      onClick={() => alert("Settings coming soon!")}
                      className="text-gray-400 hover:text-gray-200"
                    >
                      <FaCog className="w-5 h-5" />
                    </button>
                    {/* Slippage Tolerance Placeholder */}
                    <span className="text-gray-400 text-sm">0.5%</span>
                  </div>
                  {/* Chart Icon (Visible on Mobile Only) */}
                  <button
                    onClick={() => setShowChartModal(true)}
                    className="md:hidden text-blue-400 hover:text-blue-300"
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
                        className={`text-xs sm:text-sm px-2 py-1 rounded ${isDarkMode ? "text-gray-400 bg-gray-800" : "text-white/90 bg-white/30"}`}
                      >
                        0
                      </button>
                      <button
                        onClick={() =>
                          alert("Max balance feature would be implemented here")
                        }
                        className={`text-xs sm:text-sm px-2 py-1 rounded ${isDarkMode ? "text-gray-400 bg-gray-800" : "text-white/90 bg-white/30"}`}
                      >
                        Max
                      </button>
                      <button
                        onClick={() =>
                          alert("50% balance feature would be implemented here")
                        }
                        className={`text-xs sm:text-sm px-2 py-1 rounded ${isDarkMode ? "text-gray-400 bg-gray-800" : "text-white/90 bg-white/30"}`}
                      >
                        50%
                      </button>
                    </div>
                  </div>
                  <div
                    className={`rounded-lg p-3 flex items-center flex-wrap gap-2 ${isDarkMode ? "bg-gray-800" : "bg-white/30 border border-white/20"}`}
                  >
                    <div
                      className={`flex items-center rounded-lg py-2 px-3 mr-2 cursor-pointer ${isDarkMode ? "bg-gray-700" : "bg-white/40"}`}
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
                        className="w-4 h-4 ml-2 text-gray-400"
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
                      className={`bg-transparent text-right flex-1 min-w-0 focus:outline-none text-sm sm:text-base truncate ${isDarkMode ? "text-white" : "text-white"}`}
                    />
                    {/* Removed the ~$ value */}
                  </div>
                </div>

                {/* Arrow Button */}
                <div className="form-element flex justify-center -my-2">
                  <div
                    className={`rounded-full p-2 cursor-pointer transform transition-transform hover:scale-110 ${isDarkMode ? "bg-gray-800" : "bg-white/40"}`}
                    onClick={handleSwapTokens}
                  >
                    <svg
                      className="w-5 sm:w-6 h-5 sm:h-6 text-blue-400"
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
                        className={`text-xs sm:text-sm px-2 py-1 rounded ${isDarkMode ? "text-gray-400 bg-gray-800" : "text-white/90 bg-white/30"}`}
                      >
                        0
                      </button>
                      <button
                        onClick={() =>
                          alert("Max balance feature would be implemented here")
                        }
                        className={`text-xs sm:text-sm px-2 py-1 rounded ${isDarkMode ? "text-gray-400 bg-gray-800" : "text-white/90 bg-white/30"}`}
                      >
                        Max
                      </button>
                      <button
                        onClick={() =>
                          alert("50% balance feature would be implemented here")
                        }
                        className={`text-xs sm:text-sm px-2 py-1 rounded ${isDarkMode ? "text-gray-400 bg-gray-800" : "text-white/90 bg-white/30"}`}
                      >
                        50%
                      </button>
                    </div>
                  </div>
                  <div
                    className={`rounded-lg p-3 flex items-center flex-wrap gap-2 ${isDarkMode ? "bg-gray-800" : "bg-white/30 border border-white/20"}`}
                  >
                    <div
                      className={`flex items-center rounded-lg py-2 px-3 mr-2 cursor-pointer ${isDarkMode ? "bg-gray-700" : "bg-white/40"}`}
                      onClick={() => {
                        const tokens = ["BUDJU", "USDC"];
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
                        className="w-4 h-4 ml-2 text-gray-400"
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
                      className={`bg-transparent text-right flex-1 min-w-0 focus:outline-none text-sm sm:text-base truncate ${isDarkMode ? "text-white" : "text-white"}`}
                    />
                    {/* Removed the ~$ value */}
                  </div>
                </div>

                {/* Transaction Details */}
                {estimate && (
                  <div
                    className={`form-element mb-4 text-xs sm:text-sm p-3 rounded-lg ${isDarkMode ? "bg-gray-800/50" : "bg-white/20"} flex items-center justify-between`}
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
                        className={`ml-2 ${isDarkMode ? "text-white" : "text-white"}`}
                      >
                        {(1 / estimate.estimatedPrice).toFixed(6)}
                      </span>
                      <span className={`ml-2 text-red-400`}>-0.00003%</span>
                    </div>
                  </div>
                )}

                {/* Error message */}
                {error && (
                  <div className="form-element mb-4 p-2 bg-red-500/20 text-red-400 rounded-lg text-xs sm:text-sm">
                    {error}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="form-element flex flex-col gap-2">
                  {!isConnected ? (
                    <WalletConnect fullWidth size="sm" />
                  ) : (
                    <>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full bg-budju-blue hover:bg-blue-600 text-white py-2 sm:py-3 px-4 rounded-lg font-medium transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                        onClick={handleSwap}
                        disabled={
                          loading || !fromAmount || parseFloat(fromAmount) === 0
                        }
                      >
                        {loading
                          ? "Processing..."
                          : `Swap ${fromToken} to ${toToken}`}
                      </motion.button>

                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full bg-budju-pink hover:bg-pink-600 text-white py-2 sm:py-3 px-4 rounded-lg font-medium transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                        onClick={handleDeposit}
                        disabled={
                          loading || !fromAmount || parseFloat(fromAmount) === 0
                        }
                      >
                        {loading
                          ? "Processing..."
                          : `Deposit ${fromToken} to Bank`}
                      </motion.button>

                      {/* Debug button - can be removed in production */}
                      <button
                        className="mt-2 p-2 bg-gray-700/50 text-white/70 rounded text-xs"
                        onClick={debugWalletConnection}
                      >
                        Debug Connection
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Chart Modal (Visible on Mobile Only) */}
      <AnimatePresence>
        {showChartModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Overlay */}
            <motion.div
              className="absolute inset-0 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowChartModal(false)}
            />

            {/* Modal Content */}
            <motion.div
              className={`w-full max-w-md bg-gray-900/80 backdrop-blur-sm rounded-t-lg p-4 relative h-[90vh] ${isDarkMode ? "text-white" : "text-gray-900"}`}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(event, info) => {
                if (info.offset.y > 100) {
                  setShowChartModal(false);
                }
              }}
            >
              {/* Drag Handle */}
              <div className="w-12 h-1 bg-gray-500 rounded-full mx-auto mb-4" />

              {/* Close Button */}
              <button
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
                onClick={() => setShowChartModal(false)}
              >
                <FaTimes className="w-5 h-5" />
              </button>

              {/* Chart */}
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
            className={`relative p-4 sm:p-6 rounded-xl shadow-xl w-full max-w-sm sm:max-w-md ${isDarkMode ? "bg-gray-900" : "bg-white"}`}
          >
            <button
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
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
                className={`text-lg sm:text-xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                {successAction === "swap"
                  ? "Swap Successful!"
                  : "Deposit Successful!"}
              </h3>
              <p
                className={`mb-4 text-sm sm:text-base ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
              >
                {successAction === "swap"
                  ? `You have successfully swapped ${fromToken} to ${toToken}.`
                  : `You have successfully deposited ${fromToken} to the Bank of BUDJU.`}
              </p>
              <div
                className={`p-2 sm:p-3 rounded-lg mb-4 text-xs sm:text-sm break-all ${isDarkMode ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-600"}`}
              >
                Transaction ID: {successTxId}
              </div>
              <button
                className="w-full bg-budju-blue hover:bg-blue-600 text-white py-2 sm:py-3 rounded-lg font-medium text-sm sm:text-base"
                onClick={() => setShowSuccess(false)}
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </section>
  );
};

export default SwapTool;