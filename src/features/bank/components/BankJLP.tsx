import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaChevronDown,
  FaChevronUp,
  FaInfoCircle,
  FaExternalLinkAlt,
  FaExchangeAlt,
} from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import { useWallet } from "@hooks/useWallet";
import { getWalletProvider } from "@lib/web3/connection";
import { VersionedTransaction, Connection } from "@solana/web3.js";
import WalletConnect from "@components/common/WalletConnect";
import {
  fetchJLPData,
  fetchWalletJLPBalance,
  JLP_MINT,
  type JLPData,
  type PoolAsset,
} from "../services/jlpService";

const JUPITER_PROXY_URL = "/api/jupiter";

// Token options for deposit
const DEPOSIT_TOKENS = [
  {
    symbol: "SOL",
    name: "Solana",
    mint: "So11111111111111111111111111111111111111112",
    decimals: 9,
    logo: "/images/tokens/sol.png",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    logo: "/images/tokens/usdc.png",
  },
];

const BankJLP = () => {
  const { isDarkMode } = useTheme();
  const { connection: walletConnection } = useWallet();
  const isConnected = walletConnection.connected;

  // JLP data state
  const [jlpData, setJlpData] = useState<JLPData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User section state
  const [expanded, setExpanded] = useState(false);
  const [userBalance, setUserBalance] = useState<number>(0);
  const [userBalanceLoading, setUserBalanceLoading] = useState(false);

  // Trading state
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">(
    "deposit",
  );
  const [selectedToken, setSelectedToken] = useState(DEPOSIT_TOKENS[0]);
  const [amount, setAmount] = useState("");
  const [estimatedJLP, setEstimatedJLP] = useState<string>("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);

  // Success modal
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTxId, setSuccessTxId] = useState("");

  // Info tooltip
  const [showInfo, setShowInfo] = useState(false);

  // Fetch JLP data on mount
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchJLPData();
        setJlpData(data);
      } catch (err) {
        console.error("Failed to load JLP data:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load JLP data",
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Fetch user JLP balance when expanded & connected
  useEffect(() => {
    if (expanded && isConnected && walletConnection.wallet?.address) {
      setUserBalanceLoading(true);
      fetchWalletJLPBalance(walletConnection.wallet.address)
        .then(setUserBalance)
        .catch(() => setUserBalance(0))
        .finally(() => setUserBalanceLoading(false));
    }
  }, [expanded, isConnected, walletConnection.wallet?.address]);

  // Fetch quote when amount changes
  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0) {
      setEstimatedJLP("");
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setQuoteLoading(true);
        const inputMint =
          activeTab === "deposit" ? selectedToken.mint : JLP_MINT;
        const outputMint =
          activeTab === "deposit" ? JLP_MINT : selectedToken.mint;
        const decimals =
          activeTab === "deposit" ? selectedToken.decimals : 6;
        const inputAmount = Math.round(
          parseFloat(amount) * Math.pow(10, decimals),
        );

        const res = await fetch(
          `${JUPITER_PROXY_URL}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${inputAmount}&slippageBps=50`,
        );

        if (res.ok) {
          const quote = await res.json();
          const outDecimals =
            activeTab === "deposit" ? 6 : selectedToken.decimals;
          const outAmount =
            Number(quote.outAmount) / Math.pow(10, outDecimals);
          setEstimatedJLP(outAmount.toFixed(6));
        } else {
          setEstimatedJLP("");
        }
      } catch {
        setEstimatedJLP("");
      } finally {
        setQuoteLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [amount, selectedToken, activeTab]);

  // Execute swap
  const handleExecute = useCallback(async () => {
    if (!isConnected || !walletConnection.wallet) return;
    if (!amount || parseFloat(amount) <= 0) return;

    try {
      setSwapLoading(true);
      setSwapError(null);

      const inputMint =
        activeTab === "deposit" ? selectedToken.mint : JLP_MINT;
      const outputMint =
        activeTab === "deposit" ? JLP_MINT : selectedToken.mint;
      const decimals =
        activeTab === "deposit" ? selectedToken.decimals : 6;
      const inputAmount = Math.round(
        parseFloat(amount) * Math.pow(10, decimals),
      );

      // Step 1: Get quote
      const quoteRes = await fetch(
        `${JUPITER_PROXY_URL}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${inputAmount}&slippageBps=50`,
      );

      if (!quoteRes.ok) {
        throw new Error("Failed to get quote");
      }

      const quoteData = await quoteRes.json();

      // Step 2: Get swap transaction
      const swapRes = await fetch(JUPITER_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: walletConnection.wallet.address,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
        }),
      });

      if (!swapRes.ok) {
        throw new Error("Failed to create swap transaction");
      }

      const swapData = await swapRes.json();

      if (!swapData.swapTransaction) {
        throw new Error("No swap transaction received");
      }

      // Step 3: Sign and send
      const txBuffer = Buffer.from(swapData.swapTransaction, "base64");
      const versionedTx = VersionedTransaction.deserialize(txBuffer);

      const provider =
        getWalletProvider();

      if (!provider) throw new Error("No wallet provider found");

      let signature: string;

      if (typeof provider.signAndSendTransaction === "function") {
        const result = await provider.signAndSendTransaction(versionedTx);
        signature = result.signature;
      } else {
        const signedTx = await provider.signTransaction(versionedTx);
        const solConnection = new Connection(walletConnection.rpcEndpoint);
        signature = await solConnection.sendRawTransaction(
          signedTx.serialize(),
        );
      }

      setSuccessTxId(signature);
      setShowSuccess(true);
      setAmount("");
      setEstimatedJLP("");

      // Refresh balances
      if (walletConnection.wallet?.address) {
        fetchWalletJLPBalance(walletConnection.wallet.address).then(
          setUserBalance,
        );
      }
    } catch (err) {
      console.error("Swap failed:", err);
      setSwapError(
        err instanceof Error ? err.message : "Transaction failed",
      );
    } finally {
      setSwapLoading(false);
    }
  }, [
    isConnected,
    walletConnection,
    amount,
    selectedToken,
    activeTab,
  ]);

  if (loading) {
    return (
      <section className="px-4 pb-8">
        <div className="max-w-3xl mx-auto">
          <div
            className={`rounded-2xl p-8 text-center ${
              isDarkMode ? "bg-[#0c0c20]/60" : "bg-white/60"
            }`}
          >
            <div
              className={`text-sm ${
                isDarkMode ? "text-gray-500" : "text-gray-400"
              }`}
            >
              Loading yield vault data...
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (error || !jlpData) {
    return (
      <section className="px-4 pb-8">
        <div className="max-w-3xl mx-auto">
          <div
            className={`rounded-2xl p-8 text-center ${
              isDarkMode ? "bg-[#0c0c20]/60" : "bg-white/60"
            }`}
          >
            <p className="text-red-400 text-sm">
              {error || "Failed to load JLP data"}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 pb-8">
      <div className="max-w-3xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-6"
        >
          <h2
            className={`text-2xl md:text-3xl font-bold font-display mb-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            Yield{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Vault
            </span>
          </h2>
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            Treasury yield powered by Jupiter Perpetuals
          </p>
        </motion.div>

        {/* ── Bank JLP Position Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <div
            className={`rounded-2xl p-[1px] ${
              isDarkMode
                ? "bg-gradient-to-r from-emerald-500/40 via-teal-400/20 to-emerald-500/40"
                : "bg-gradient-to-r from-emerald-500/30 via-teal-400/15 to-emerald-500/30"
            }`}
          >
            <div
              className={`rounded-2xl p-6 ${
                isDarkMode ? "bg-[#0a0a1f]/95" : "bg-white/90"
              } backdrop-blur-sm`}
            >
              {/* Top row: JLP icon + balance + APY badge */}
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <img
                      src="/images/tokens/jlp.svg"
                      alt="JLP"
                      className="w-7 h-7"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        e.currentTarget.parentElement!.innerHTML =
                          '<span class="text-white font-bold text-sm">JLP</span>';
                      }}
                    />
                  </div>
                  <div>
                    <div
                      className={`text-sm font-bold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      Jupiter Liquidity Provider
                    </div>
                    <div
                      className={`text-xs ${
                        isDarkMode ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      Bank JLP Position
                    </div>
                  </div>
                </div>

                {/* APY Badge */}
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowInfo(!showInfo)}
                      className={`p-1.5 rounded-full transition-colors ${
                        isDarkMode
                          ? "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                          : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <FaInfoCircle className="w-3.5 h-3.5" />
                    </button>

                    {/* Info tooltip */}
                    <AnimatePresence>
                      {showInfo && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 5 }}
                          className={`absolute right-0 top-8 z-20 w-72 rounded-xl p-4 text-xs leading-relaxed shadow-xl ${
                            isDarkMode
                              ? "bg-gray-800 text-gray-300 border border-gray-700"
                              : "bg-white text-gray-600 border border-gray-200"
                          }`}
                        >
                          <p className="mb-2">
                            <strong className={isDarkMode ? "text-emerald-400" : "text-emerald-600"}>
                              JLP earns 75% of Jupiter Perps trading fees.
                            </strong>
                          </p>
                          <p className="mb-2">
                            Yield compounds automatically — the JLP token price
                            appreciates over time. No staking or harvesting
                            required.
                          </p>
                          <p>
                            The pool backs leveraged trades (up to 250x) on SOL,
                            ETH, and BTC.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-full px-3 py-1">
                    <span className="text-emerald-400 text-xs font-bold">
                      {jlpData.apy.toFixed(1)}% APY
                    </span>
                  </div>
                </div>
              </div>

              {/* Balance & Value */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <div
                    className={`text-[10px] uppercase tracking-[0.15em] font-bold mb-1 ${
                      isDarkMode
                        ? "text-emerald-400/60"
                        : "text-emerald-600/60"
                    }`}
                  >
                    Balance
                  </div>
                  <div
                    className={`text-xl font-black font-display ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {jlpData.bankBalance > 0
                      ? jlpData.bankBalance.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 4,
                        })
                      : "0.00"}
                    <span
                      className={`text-sm font-normal ml-1.5 ${
                        isDarkMode ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      JLP
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-[10px] uppercase tracking-[0.15em] font-bold mb-1 ${
                      isDarkMode
                        ? "text-emerald-400/60"
                        : "text-emerald-600/60"
                    }`}
                  >
                    Value
                  </div>
                  <div
                    className={`text-xl font-black font-display ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    $
                    {jlpData.bankValue.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  <div
                    className={`text-xs ${
                      isDarkMode ? "text-gray-500" : "text-gray-500"
                    }`}
                  >
                    @ $
                    {jlpData.price.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    per JLP
                  </div>
                </div>
              </div>

              {/* Pool Composition Bar */}
              <div className="mb-5">
                <div
                  className={`text-[10px] uppercase tracking-[0.15em] font-bold mb-2 ${
                    isDarkMode ? "text-gray-500" : "text-gray-500"
                  }`}
                >
                  Pool Composition
                </div>
                <div className="flex rounded-full overflow-hidden h-2.5">
                  {jlpData.poolComposition.map((asset: PoolAsset) => (
                    <div
                      key={asset.symbol}
                      className="transition-all duration-700"
                      style={{
                        width: `${asset.weight}%`,
                        backgroundColor: asset.color,
                      }}
                      title={`${asset.name} — ${asset.weight}%`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  {jlpData.poolComposition.map((asset: PoolAsset) => (
                    <div
                      key={asset.symbol}
                      className="flex items-center gap-1.5"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: asset.color }}
                      />
                      <span
                        className={`text-[10px] ${
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        {asset.symbol} {asset.weight}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Expandable User Section ── */}
              <div
                className={`border-t pt-4 ${
                  isDarkMode ? "border-white/[0.06]" : "border-gray-200/60"
                }`}
              >
                <button
                  onClick={() => setExpanded(!expanded)}
                  className={`w-full flex items-center justify-between py-2 transition-colors ${
                    isDarkMode
                      ? "text-emerald-400 hover:text-emerald-300"
                      : "text-emerald-600 hover:text-emerald-700"
                  }`}
                >
                  <span className="text-sm font-bold">
                    Earn Yield with JLP
                  </span>
                  {expanded ? (
                    <FaChevronUp className="w-3 h-3" />
                  ) : (
                    <FaChevronDown className="w-3 h-3" />
                  )}
                </button>

                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-4">
                        {/* Not connected */}
                        {!isConnected && (
                          <div className="text-center py-6">
                            <p
                              className={`text-sm mb-4 ${
                                isDarkMode
                                  ? "text-gray-400"
                                  : "text-gray-600"
                              }`}
                            >
                              Connect your wallet to deposit into JLP and earn
                              yield from Jupiter Perps trading fees.
                            </p>
                            <WalletConnect />
                          </div>
                        )}

                        {/* Connected */}
                        {isConnected && (
                          <div>
                            {/* User JLP balance */}
                            <div
                              className={`rounded-xl p-4 mb-4 ${
                                isDarkMode
                                  ? "bg-white/[0.03] border border-white/[0.06]"
                                  : "bg-gray-50 border border-gray-200/40"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span
                                  className={`text-xs ${
                                    isDarkMode
                                      ? "text-gray-500"
                                      : "text-gray-500"
                                  }`}
                                >
                                  Your JLP Balance
                                </span>
                                <span
                                  className={`text-sm font-bold ${
                                    isDarkMode ? "text-white" : "text-gray-900"
                                  }`}
                                >
                                  {userBalanceLoading
                                    ? "..."
                                    : `${userBalance.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 6,
                                      })} JLP`}
                                </span>
                              </div>
                              {userBalance > 0 && jlpData.price > 0 && (
                                <div className="text-right">
                                  <span
                                    className={`text-xs ${
                                      isDarkMode
                                        ? "text-gray-500"
                                        : "text-gray-500"
                                    }`}
                                  >
                                    ~$
                                    {(
                                      userBalance * jlpData.price
                                    ).toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Tabs */}
                            <div
                              className={`flex rounded-lg overflow-hidden mb-4 ${
                                isDarkMode
                                  ? "bg-white/[0.04]"
                                  : "bg-gray-100"
                              }`}
                            >
                              {(
                                ["deposit", "withdraw"] as const
                              ).map((tab) => (
                                <button
                                  key={tab}
                                  onClick={() => {
                                    setActiveTab(tab);
                                    setAmount("");
                                    setEstimatedJLP("");
                                    setSwapError(null);
                                  }}
                                  className={`flex-1 py-2 text-xs font-bold capitalize transition-all ${
                                    activeTab === tab
                                      ? isDarkMode
                                        ? "bg-emerald-500/20 text-emerald-400"
                                        : "bg-emerald-500/15 text-emerald-600"
                                      : isDarkMode
                                        ? "text-gray-500 hover:text-gray-300"
                                        : "text-gray-500 hover:text-gray-700"
                                  }`}
                                >
                                  {tab}
                                </button>
                              ))}
                            </div>

                            {/* Token selector */}
                            <div className="flex gap-2 mb-3">
                              {DEPOSIT_TOKENS.map((token) => (
                                <button
                                  key={token.symbol}
                                  onClick={() => {
                                    setSelectedToken(token);
                                    setAmount("");
                                    setEstimatedJLP("");
                                  }}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    selectedToken.symbol === token.symbol
                                      ? isDarkMode
                                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                        : "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"
                                      : isDarkMode
                                        ? "bg-white/[0.04] text-gray-400 border border-white/[0.06] hover:border-white/[0.12]"
                                        : "bg-gray-50 text-gray-600 border border-gray-200/40 hover:border-gray-300"
                                  }`}
                                >
                                  <img
                                    src={token.logo}
                                    alt={token.symbol}
                                    className="w-4 h-4 rounded-full"
                                    onError={(e) => {
                                      e.currentTarget.src =
                                        "/images/tokens/default.svg";
                                    }}
                                  />
                                  {token.symbol}
                                </button>
                              ))}
                            </div>

                            {/* Amount input */}
                            <div
                              className={`rounded-xl p-3 mb-3 ${
                                isDarkMode
                                  ? "bg-white/[0.03] border border-white/[0.06]"
                                  : "bg-gray-50 border border-gray-200/40"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span
                                  className={`text-[10px] uppercase tracking-wider font-bold ${
                                    isDarkMode
                                      ? "text-gray-500"
                                      : "text-gray-500"
                                  }`}
                                >
                                  {activeTab === "deposit"
                                    ? `You pay (${selectedToken.symbol})`
                                    : "You redeem (JLP)"}
                                </span>
                              </div>
                              <input
                                type="text"
                                value={amount}
                                onChange={(e) => {
                                  const value = e.target.value.replace(
                                    /[^0-9.]/g,
                                    "",
                                  );
                                  setAmount(value);
                                  setSwapError(null);
                                }}
                                placeholder="0.00"
                                className={`w-full bg-transparent text-lg font-bold focus:outline-none ${
                                  isDarkMode ? "text-white" : "text-gray-900"
                                }`}
                              />
                            </div>

                            {/* Arrow */}
                            <div className="flex justify-center -my-1 relative z-10">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                  isDarkMode
                                    ? "bg-[#0a0a1f] border border-white/[0.06]"
                                    : "bg-white border border-gray-200/60"
                                }`}
                              >
                                <FaExchangeAlt
                                  className={`w-3 h-3 rotate-90 ${
                                    isDarkMode
                                      ? "text-emerald-400"
                                      : "text-emerald-600"
                                  }`}
                                />
                              </div>
                            </div>

                            {/* Estimated output */}
                            <div
                              className={`rounded-xl p-3 mb-4 mt-1 ${
                                isDarkMode
                                  ? "bg-white/[0.03] border border-white/[0.06]"
                                  : "bg-gray-50 border border-gray-200/40"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span
                                  className={`text-[10px] uppercase tracking-wider font-bold ${
                                    isDarkMode
                                      ? "text-gray-500"
                                      : "text-gray-500"
                                  }`}
                                >
                                  {activeTab === "deposit"
                                    ? "You receive (JLP)"
                                    : `You receive (${selectedToken.symbol})`}
                                </span>
                              </div>
                              <div
                                className={`text-lg font-bold ${
                                  isDarkMode
                                    ? "text-white/60"
                                    : "text-gray-400"
                                }`}
                              >
                                {quoteLoading
                                  ? "Fetching quote..."
                                  : estimatedJLP || "0.00"}
                              </div>
                            </div>

                            {/* Error */}
                            {swapError && (
                              <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                                <p className="text-red-400 text-xs">
                                  {swapError}
                                </p>
                              </div>
                            )}

                            {/* Execute button */}
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={handleExecute}
                              disabled={
                                swapLoading ||
                                !amount ||
                                parseFloat(amount) <= 0 ||
                                quoteLoading
                              }
                              className={`w-full py-3 rounded-xl font-bold text-sm transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${
                                isDarkMode
                                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40"
                                  : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50"
                              }`}
                            >
                              {swapLoading
                                ? "Processing..."
                                : activeTab === "deposit"
                                  ? `Deposit ${selectedToken.symbol} → JLP`
                                  : `Withdraw JLP → ${selectedToken.symbol}`}
                            </motion.button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Success Modal ── */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 bg-black/70 px-4"
            onClick={() => setShowSuccess(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className={`relative rounded-2xl p-6 shadow-xl max-w-md w-full ${
                isDarkMode
                  ? "bg-[#0a0a1f] border border-white/10"
                  : "bg-white"
              }`}
            >
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-emerald-400"
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
                </div>
                <h3
                  className={`text-xl font-bold mb-2 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  Transaction Successful!
                </h3>
                <p
                  className={`text-sm mb-4 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  Your JLP{" "}
                  {activeTab === "deposit" ? "deposit" : "withdrawal"} has been
                  confirmed.
                </p>
                <a
                  href={`https://solscan.io/tx/${successTxId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 text-xs mb-4 ${
                    isDarkMode
                      ? "text-emerald-400 hover:text-emerald-300"
                      : "text-emerald-600 hover:text-emerald-700"
                  }`}
                >
                  View on Solscan
                  <FaExternalLinkAlt className="w-2.5 h-2.5" />
                </a>
                <button
                  onClick={() => setShowSuccess(false)}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${
                    isDarkMode
                      ? "bg-white/10 text-white hover:bg-white/20"
                      : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                  }`}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default BankJLP;
