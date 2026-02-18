import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import WalletConnect from "@components/common/WalletConnect";
import { particleBurst } from "@/lib/utils/animation";
import { useTheme } from "@/context/ThemeContext";
import { useWallet } from "@hooks/useWallet";
import { useTrading } from "@hooks/useTrading";
import { initializeTokenRegistry } from "@lib/services/tokenRegistry";
import PriceChart from "@components/common/PriceChart";

const BankDeposit = () => {
  const { isDarkMode } = useTheme();
  const { connection } = useWallet();
  const sectionRef = useRef(null);
  const formRef = useRef(null);
  const coinRef = useRef(null);

  // Trading state
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fromToken, setFromToken] = useState("SOL");
  const [toToken, setToToken] = useState("RAY");
  const [timeframe, setTimeframe] = useState("1D");

  // Success modal state
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTxId, setSuccessTxId] = useState("");
  const [successAction, setSuccessAction] = useState("");

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

      // Add rotation
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
        {
          opacity: 0,
          y: 20,
        },
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
    <section
      ref={sectionRef}
      id="deposit"
      className={`py-20 ${isDarkMode ? "bg-gradient-to-b from-budju-black to-gray-900" : "bg-gradient-to-b from-purple-400 to-budju-pink-light"}`}
    >
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className={isDarkMode ? "text-white" : "text-budju-white"}>
              MAKE A
            </span>{" "}
            <span className="text-budju-pink">DEPOSIT</span>
          </h2>
          <p
            className={`text-lg ${isDarkMode ? "text-gray-300" : "text-white"} max-w-3xl mx-auto`}
          >
            Support the BUDJU ecosystem by making a deposit to the Bank of BUDJU
          </p>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Trading Chart Area */}
          <div className="lg:flex-1 order-last lg:order-none bg-gray-900/80 backdrop-blur-sm rounded-lg p-4 h-96 overflow-hidden shadow-lg">
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

          {/* Trading Form */}
          <div
            className="lg:w-1/3 order-first lg:order-none max-w-md mx-auto lg:mx-0"
            style={{ backdropFilter: "blur(8px)" }}
          >
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div
                ref={formRef}
                className={`rounded-xl p-5 ${isDarkMode ? "budju-card" : "bg-white/20 border border-white/30 shadow-lg"}`}
              >
                <h3 className="text-xl font-bold mb-4 text-center">
                  <span
                    className={isDarkMode ? "text-white" : "text-budju-white"}
                  >
                    Token
                  </span>{" "}
                  <span className="text-budju-pink">Exchange</span>
                </h3>

                {/* From Field */}
                <div className="form-element mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <label
                      className={isDarkMode ? "text-gray-400" : "text-white"}
                    >
                      From
                    </label>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setFromAmount("0")}
                        className={`text-sm px-2 py-1 rounded ${isDarkMode ? "text-gray-400 bg-gray-800" : "text-white/90 bg-white/30"}`}
                      >
                        0
                      </button>
                      <button
                        onClick={() =>
                          alert("Max balance feature would be implemented here")
                        }
                        className={`text-sm px-2 py-1 rounded ${isDarkMode ? "text-gray-400 bg-gray-800" : "text-white/90 bg-white/30"}`}
                      >
                        Max
                      </button>
                      <button
                        onClick={() =>
                          alert("50% balance feature would be implemented here")
                        }
                        className={`text-sm px-2 py-1 rounded ${isDarkMode ? "text-gray-400 bg-gray-800" : "text-white/90 bg-white/30"}`}
                      >
                        50%
                      </button>
                    </div>
                  </div>
                  <div
                    className={`rounded-lg p-3 flex items-center ${isDarkMode ? "bg-gray-800" : "bg-white/30 border border-white/20"}`}
                  >
                    <div
                      className={`flex items-center rounded-lg py-2 px-3 mr-3 cursor-pointer ${isDarkMode ? "bg-gray-700" : "bg-white/40"}`}
                      onClick={() => {
                        // Token selector would open here
                        const tokens = ["SOL", "BUDJU", "USDC"];
                        const currentIndex = tokens.indexOf(fromToken);
                        const nextIndex = (currentIndex + 1) % tokens.length;
                        setFromToken(tokens[nextIndex]);
                      }}
                    >
                      <img
                        src={`/images/tokens/${fromToken.toLowerCase()}.png`}
                        alt={fromToken}
                        className="w-6 h-6 mr-2"
                        onError={(e) => {
                          e.currentTarget.src =
                            "/images/tokens/token-placeholder.png";
                        }}
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
                        // Allow only numbers and decimal point
                        const value = e.target.value.replace(/[^0-9.]/g, "");
                        setFromAmount(value);
                      }}
                      placeholder="0.00"
                      className={`bg-transparent text-right flex-1 focus:outline-none ${isDarkMode ? "text-white" : "text-white"}`}
                    />
                    <span className="text-gray-400 ml-2">
                      ~$
                      {estimate?.fromAmount
                        ? (
                            estimate.fromAmount * (estimate.estimatedPrice || 1)
                          ).toFixed(2)
                        : "0"}
                    </span>
                  </div>
                </div>

                {/* Arrow Button */}
                <div className="form-element flex justify-center -my-2">
                  <div
                    className={`rounded-full p-2 cursor-pointer transform transition-transform hover:scale-110 ${isDarkMode ? "bg-gray-800" : "bg-white/40"}`}
                    onClick={handleSwapTokens}
                  >
                    <svg
                      className="w-6 h-6 text-blue-400"
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
                <div className="form-element mb-6 mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <label
                      className={isDarkMode ? "text-gray-400" : "text-white"}
                    >
                      To
                    </label>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setToAmount("0")}
                        className={`text-sm px-2 py-1 rounded ${isDarkMode ? "text-gray-400 bg-gray-800" : "text-white/90 bg-white/30"}`}
                      >
                        0
                      </button>
                      <button
                        onClick={() =>
                          alert("Max balance feature would be implemented here")
                        }
                        className={`text-sm px-2 py-1 rounded ${isDarkMode ? "text-gray-400 bg-gray-800" : "text-white/90 bg-white/30"}`}
                      >
                        Max
                      </button>
                      <button
                        onClick={() =>
                          alert("50% balance feature would be implemented here")
                        }
                        className={`text-sm px-2 py-1 rounded ${isDarkMode ? "text-gray-400 bg-gray-800" : "text-white/90 bg-white/30"}`}
                      >
                        50%
                      </button>
                    </div>
                  </div>
                  <div
                    className={`rounded-lg p-3 flex items-center ${isDarkMode ? "bg-gray-800" : "bg-white/30 border border-white/20"}`}
                  >
                    <div
                      className={`flex items-center rounded-lg py-2 px-3 mr-3 cursor-pointer ${isDarkMode ? "bg-gray-700" : "bg-white/40"}`}
                      onClick={() => {
                        // Token selector would open here
                        const tokens = ["RAY", "BUDJU", "USDC"];
                        const currentIndex = tokens.indexOf(toToken);
                        const nextIndex = (currentIndex + 1) % tokens.length;
                        setToToken(tokens[nextIndex]);
                      }}
                    >
                      <img
                        src={`/images/tokens/${toToken.toLowerCase()}.png`}
                        alt={toToken}
                        className="w-6 h-6 mr-2"
                        onError={(e) => {
                          e.currentTarget.src =
                            "/images/tokens/token-placeholder.png";
                        }}
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
                        // Allow only numbers and decimal point
                        const value = e.target.value.replace(/[^0-9.]/g, "");
                        setToAmount(value);
                      }}
                      placeholder="0.00"
                      className={`bg-transparent text-right flex-1 focus:outline-none ${isDarkMode ? "text-white" : "text-white"}`}
                    />
                    <span className="text-gray-400 ml-2">
                      ~$
                      {estimate?.toAmount
                        ? (
                            estimate.toAmount / (estimate.estimatedPrice || 1)
                          ).toFixed(2)
                        : "0"}
                    </span>
                  </div>
                </div>

                {/* Transaction details */}
                {estimate && (
                  <div
                    className={`form-element mb-4 text-sm p-3 rounded-lg ${isDarkMode ? "bg-gray-800/50" : "bg-white/20"}`}
                  >
                    <div className="flex justify-between mb-1">
                      <span
                        className={
                          isDarkMode ? "text-gray-400" : "text-white/80"
                        }
                      >
                        Rate:
                      </span>
                      <span
                        className={isDarkMode ? "text-white" : "text-white"}
                      >
                        1 {fromToken} ={" "}
                        {(1 / estimate.estimatedPrice).toFixed(6)} {toToken}
                      </span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span
                        className={
                          isDarkMode ? "text-gray-400" : "text-white/80"
                        }
                      >
                        Fee:
                      </span>
                      <span
                        className={isDarkMode ? "text-white" : "text-white"}
                      >
                        ~{estimate.fees.liquidityFee.toFixed(6)} {fromToken}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span
                        className={
                          isDarkMode ? "text-gray-400" : "text-white/80"
                        }
                      >
                        Min received:
                      </span>
                      <span
                        className={isDarkMode ? "text-white" : "text-white"}
                      >
                        {estimate.minReceived.toFixed(6)} {toToken}
                      </span>
                    </div>
                  </div>
                )}

                {/* Error message */}
                {error && (
                  <div className="form-element mb-4 p-2 bg-red-500/20 text-red-400 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="form-element flex flex-col gap-2">
                  {!isConnected ? (
                    <WalletConnect fullWidth />
                  ) : (
                    <>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full bg-budju-blue hover:bg-blue-600 text-white py-3 px-4 rounded-lg font-medium transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
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
                        className="w-full bg-budju-pink hover:bg-pink-600 text-white py-3 px-4 rounded-lg font-medium transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleDeposit}
                        disabled={
                          loading || !fromAmount || parseFloat(fromAmount) === 0
                        }
                      >
                        {loading
                          ? "Processing..."
                          : `Deposit ${fromToken} to Bank`}
                      </motion.button>

                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/70">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`relative p-6 rounded-xl shadow-xl max-w-md w-full ${isDarkMode ? "bg-gray-900" : "bg-white"}`}
          >
            <button
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
              onClick={() => setShowSuccess(false)}
            >
              <svg
                className="w-6 h-6"
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
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-green-500"
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
                className={`text-xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                {successAction === "swap"
                  ? "Swap Successful!"
                  : "Deposit Successful!"}
              </h3>
              <p
                className={`mb-4 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
              >
                {successAction === "swap"
                  ? `You have successfully swapped ${fromToken} to ${toToken}.`
                  : `You have successfully deposited ${fromToken} to the Bank of BUDJU.`}
              </p>
              <div
                className={`p-3 rounded-lg mb-4 text-sm break-all ${isDarkMode ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-600"}`}
              >
                Transaction ID: {successTxId}
              </div>
              <button
                className="w-full bg-budju-blue hover:bg-blue-600 text-white py-3 rounded-lg font-medium"
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

export default BankDeposit;
