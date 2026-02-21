import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  FaWallet,
  FaCheckCircle,
  FaLock,
  FaExchangeAlt,
  FaSyncAlt,
  FaRobot,
  FaExternalLinkAlt,
} from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import { useWallet } from "@/hooks/useWallet";
import { ROUTES } from "@/constants/routes";
import { TOKEN_ADDRESS } from "@/constants/addresses";

const BUDJU_REQUIRED = 10_000_000;

const Balance = () => {
  const { isDarkMode } = useTheme();
  const {
    connection,
    connecting,
    availableWallets,
    connect,
    balances,
    loadingBalances,
    refreshBalances,
  } = useWallet();

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      ),
    );
  }, []);

  const budjuBalance =
    balances.tokens.find((t) => t.symbol === "BUDJU")?.amount ?? 0;
  const hasBudjuAccess = budjuBalance >= BUDJU_REQUIRED;
  const needed = BUDJU_REQUIRED - budjuBalance;

  const handleConnectPhantom = useCallback(async () => {
    if (isMobile) {
      const targetUrl = window.location.href;
      const refUrl = window.location.origin;
      window.location.href = `https://phantom.app/ul/browse/${encodeURIComponent(targetUrl)}?ref=${encodeURIComponent(refUrl)}`;
    } else {
      try {
        await connect("phantom");
      } catch {
        // handled by wallet context
      }
    }
  }, [isMobile, connect]);

  const handleViewInPhantom = useCallback(() => {
    // Deep link to view the BUDJU token in Phantom
    if (isMobile) {
      window.location.href = `https://phantom.app/ul/browse/${encodeURIComponent(`https://solscan.io/token/${TOKEN_ADDRESS}`)}`;
    } else {
      window.open(`https://solscan.io/token/${TOKEN_ADDRESS}`, "_blank");
    }
  }, [isMobile]);

  const progressPercent = Math.min((budjuBalance / BUDJU_REQUIRED) * 100, 100);

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <div
            className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 ${
              isDarkMode ? "bg-cyan-500/10" : "bg-cyan-100/80"
            }`}
          >
            <FaWallet
              className={`w-6 h-6 ${
                isDarkMode ? "text-cyan-400" : "text-cyan-600"
              }`}
            />
          </div>
          <h1
            className={`text-2xl md:text-3xl font-bold font-display mb-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            BUDJU{" "}
            <span className="bg-gradient-to-r from-cyan-400 to-budju-blue bg-clip-text text-transparent">
              Balance
            </span>
          </h1>
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            Check your BUDJU balance and bot access status
          </p>
        </motion.div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div
            className={`rounded-2xl p-[1px] ${
              isDarkMode
                ? "bg-gradient-to-b from-cyan-500/30 via-white/[0.06] to-transparent"
                : "bg-gradient-to-b from-cyan-500/20 via-gray-200/40 to-transparent"
            }`}
          >
            <div
              className={`rounded-2xl overflow-hidden ${
                isDarkMode ? "bg-[#0a0a1f]/95" : "bg-white/90"
              } backdrop-blur-sm`}
            >
              {!connection.connected ? (
                /* ========== NOT CONNECTED ========== */
                <div className="px-6 py-10 text-center">
                  <div
                    className={`w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center ${
                      isDarkMode ? "bg-white/[0.04]" : "bg-gray-100"
                    }`}
                  >
                    <FaWallet
                      className={`w-7 h-7 ${
                        isDarkMode ? "text-gray-600" : "text-gray-300"
                      }`}
                    />
                  </div>
                  <h2
                    className={`text-lg font-bold mb-2 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    Connect Your Wallet
                  </h2>
                  <p
                    className={`text-sm mb-6 ${
                      isDarkMode ? "text-gray-500" : "text-gray-500"
                    }`}
                  >
                    Connect your wallet to check your BUDJU balance and bot
                    access status.
                  </p>

                  {/* Connect buttons */}
                  <div className="space-y-2.5">
                    <button
                      onClick={handleConnectPhantom}
                      disabled={connecting}
                      className={`flex items-center justify-center gap-3 w-full px-5 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer ${
                        isDarkMode
                          ? "bg-gradient-to-r from-purple-600/30 to-purple-500/20 text-white border border-purple-500/20 hover:border-purple-500/40"
                          : "bg-gradient-to-r from-purple-50 to-purple-100/60 text-gray-900 border border-purple-200/40 hover:border-purple-300/60"
                      }`}
                    >
                      <img
                        src="/images/wallets/phantom.png"
                        alt="Phantom"
                        className="w-5 h-5 rounded"
                      />
                      {connecting ? "Connecting..." : "Connect with Phantom"}
                    </button>

                    {!isMobile && availableWallets.includes("solflare") && (
                      <button
                        onClick={() => connect("solflare")}
                        disabled={connecting}
                        className={`flex items-center justify-center gap-3 w-full px-5 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer ${
                          isDarkMode
                            ? "bg-white/[0.04] text-white border border-white/[0.08] hover:border-white/[0.15]"
                            : "bg-gray-50 text-gray-900 border border-gray-200/60 hover:border-gray-300"
                        }`}
                      >
                        <img
                          src="/images/wallets/solflare.png"
                          alt="Solflare"
                          className="w-5 h-5 rounded"
                        />
                        Connect with Solflare
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* ========== CONNECTED ========== */
                <div>
                  {/* Balance Display */}
                  <div className="px-6 pt-6 pb-5 text-center">
                    <p
                      className={`text-[10px] uppercase tracking-[0.2em] font-bold mb-3 ${
                        isDarkMode ? "text-cyan-400/70" : "text-cyan-600/70"
                      }`}
                    >
                      Your BUDJU Balance
                    </p>
                    <div className="flex items-center justify-center gap-3 mb-1">
                      <p
                        className={`text-4xl md:text-5xl font-black font-mono ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {loadingBalances
                          ? "..."
                          : budjuBalance.toLocaleString()}
                      </p>
                      <button
                        onClick={refreshBalances}
                        disabled={loadingBalances}
                        className={`p-2 rounded-lg transition-all cursor-pointer ${
                          isDarkMode
                            ? "hover:bg-white/[0.06]"
                            : "hover:bg-gray-100"
                        }`}
                      >
                        <FaSyncAlt
                          className={`w-3.5 h-3.5 ${
                            isDarkMode ? "text-cyan-400/60" : "text-cyan-600/60"
                          } ${loadingBalances ? "animate-spin" : ""}`}
                        />
                      </button>
                    </div>
                    <p
                      className={`text-sm font-semibold ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      BUDJU
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="px-6 pb-5">
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-widest ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        Bot Access Progress
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold ${
                          hasBudjuAccess
                            ? isDarkMode
                              ? "text-emerald-400"
                              : "text-emerald-600"
                            : isDarkMode
                              ? "text-amber-400"
                              : "text-amber-600"
                        }`}
                      >
                        {progressPercent.toFixed(1)}%
                      </span>
                    </div>
                    <div
                      className={`h-2.5 rounded-full overflow-hidden ${
                        isDarkMode ? "bg-white/[0.06]" : "bg-gray-100"
                      }`}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercent}%` }}
                        transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                        className={`h-full rounded-full ${
                          hasBudjuAccess
                            ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                            : "bg-gradient-to-r from-amber-500 to-yellow-400"
                        }`}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span
                        className={`text-[10px] ${
                          isDarkMode ? "text-gray-600" : "text-gray-300"
                        }`}
                      >
                        0
                      </span>
                      <span
                        className={`text-[10px] font-mono ${
                          isDarkMode ? "text-gray-600" : "text-gray-300"
                        }`}
                      >
                        10,000,000
                      </span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div
                    className={`mx-6 mb-5 rounded-xl px-4 py-3.5 flex items-center gap-3 ${
                      hasBudjuAccess
                        ? isDarkMode
                          ? "bg-emerald-500/[0.08] border border-emerald-500/15"
                          : "bg-emerald-50/80 border border-emerald-200/40"
                        : isDarkMode
                          ? "bg-amber-500/[0.08] border border-amber-500/15"
                          : "bg-amber-50/80 border border-amber-200/40"
                    }`}
                  >
                    {hasBudjuAccess ? (
                      <FaCheckCircle
                        className={`w-5 h-5 flex-shrink-0 ${
                          isDarkMode ? "text-emerald-400" : "text-emerald-600"
                        }`}
                      />
                    ) : (
                      <FaLock
                        className={`w-4 h-4 flex-shrink-0 ${
                          isDarkMode ? "text-amber-400" : "text-amber-600"
                        }`}
                      />
                    )}
                    <div>
                      <p
                        className={`text-sm font-bold ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {hasBudjuAccess
                          ? "Bot Access Unlocked"
                          : "Bot Access Locked"}
                      </p>
                      <p
                        className={`text-xs ${
                          isDarkMode ? "text-gray-500" : "text-gray-500"
                        }`}
                      >
                        {hasBudjuAccess
                          ? "You meet the 10M BUDJU requirement"
                          : `You need ${needed.toLocaleString()} more BUDJU`}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="px-6 pb-6 space-y-2.5">
                    {!hasBudjuAccess && (
                      <>
                        {/* Buy with SOL */}
                        <Link
                          to={ROUTES.SWAP}
                          className={`flex items-center justify-center gap-2.5 w-full px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                            isDarkMode
                              ? "bg-gradient-to-r from-cyan-500/25 to-blue-500/20 text-white border border-cyan-500/20 hover:border-cyan-500/40"
                              : "bg-gradient-to-r from-cyan-50 to-blue-50 text-gray-900 border border-cyan-200/40 hover:border-cyan-300/60"
                          }`}
                        >
                          <FaExchangeAlt className="w-3.5 h-3.5" />
                          Buy BUDJU with SOL
                        </Link>

                        {/* Buy with USDC */}
                        <Link
                          to={ROUTES.SWAP}
                          className={`flex items-center justify-center gap-2.5 w-full px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                            isDarkMode
                              ? "bg-white/[0.04] text-white border border-white/[0.08] hover:border-white/[0.15]"
                              : "bg-gray-50 text-gray-900 border border-gray-200/60 hover:border-gray-300"
                          }`}
                        >
                          <img
                            src="/images/tokens/usdc.png"
                            alt="USDC"
                            className="w-4 h-4 rounded-full"
                          />
                          Buy BUDJU with USDC
                        </Link>
                      </>
                    )}

                    {hasBudjuAccess && (
                      <Link
                        to={ROUTES.BANK}
                        className="hero-btn-primary flex items-center justify-center gap-2.5 w-full px-4 py-3.5 rounded-xl text-sm font-bold"
                      >
                        <FaRobot className="w-3.5 h-3.5" />
                        Go to Trading Bot
                      </Link>
                    )}

                    {/* View in Phantom / Solscan */}
                    <button
                      onClick={handleViewInPhantom}
                      className={`flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
                        isDarkMode
                          ? "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]"
                          : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <FaExternalLinkAlt className="w-2.5 h-2.5" />
                      {isMobile
                        ? "View in Phantom"
                        : "View on Solscan"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Balance;
