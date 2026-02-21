import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { useTheme } from "@/context/ThemeContext";
import {
  fetchBankHoldings,
  type TokenHolding,
} from "../services/bankHoldings";

const BankTokens = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const [tokenHoldings, setTokenHoldings] = useState<TokenHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const holdings = await fetchBankHoldings();
        setTokenHoldings(holdings);
      } catch (err) {
        console.error("Failed to load bank holdings:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load holdings",
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (sectionRef.current && cardsRef.current && tokenHoldings.length > 0) {
      const cards = cardsRef.current.querySelectorAll(".token-card");
      gsap.fromTo(
        cards,
        { opacity: 0, y: 20, scale: 0.95 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          stagger: 0.1,
          duration: 0.6,
          ease: "power2.out",
        },
      );
    }
  }, [tokenHoldings]);

  const totalBankValue = tokenHoldings.reduce(
    (sum, token) => sum + token.value,
    0,
  );

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    fetchBankHoldings()
      .then(setTokenHoldings)
      .catch((err) => {
        console.error(err);
        setError(
          err instanceof Error ? err.message : "Failed to load holdings",
        );
      })
      .finally(() => setLoading(false));
  };

  return (
    <section ref={sectionRef} className="py-16 md:py-24 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <h2
            className={`text-2xl md:text-3xl font-bold font-display mb-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            Treasury{" "}
            <span className="bg-gradient-to-r from-amber-400 to-budju-blue bg-clip-text text-transparent">
              Holdings
            </span>
          </h2>
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            Live on-chain balances — fully verifiable on Solscan
          </p>
        </motion.div>

        {/* Total Value */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-center mb-10"
        >
          <p
            className={`text-[10px] uppercase tracking-[0.2em] font-bold mb-1 ${
              isDarkMode ? "text-amber-400/60" : "text-amber-600/60"
            }`}
          >
            Total Bank Assets
          </p>
          <div
            className={`text-4xl md:text-5xl font-black font-display ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {loading ? (
              <span
                className={`text-2xl ${
                  isDarkMode ? "text-gray-500" : "text-gray-400"
                }`}
              >
                Loading...
              </span>
            ) : (
              `$${totalBankValue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            )}
          </div>
        </motion.div>

        {/* Error state */}
        {error && (
          <div className="text-center mb-8">
            <p className="text-red-400 text-sm mb-2">{error}</p>
            <button
              onClick={handleRetry}
              className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors ${
                isDarkMode
                  ? "bg-white/10 text-white hover:bg-white/20"
                  : "bg-gray-100 text-gray-900 hover:bg-gray-200"
              }`}
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div
            className={`text-center text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-400"
            }`}
          >
            Fetching holdings from the Solana blockchain...
          </div>
        )}

        {/* Token Cards */}
        {!loading && !error && tokenHoldings.length > 0 && (
          <div
            ref={cardsRef}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {tokenHoldings.map((token, index) => (
              <motion.div
                key={token.symbol + token.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className={`token-card rounded-xl border p-5 ${
                  isDarkMode
                    ? "bg-[#0c0c20]/60 border-white/[0.06] hover:border-white/[0.12]"
                    : "bg-white/60 border-gray-200/40 hover:border-gray-300/60"
                } backdrop-blur-sm transition-all duration-300`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <img
                    src={token.logo}
                    alt={token.name}
                    className="w-10 h-10 rounded-full"
                    onError={(e) => {
                      e.currentTarget.src = "/images/tokens/default.svg";
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className={`font-bold text-sm truncate ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {token.name}
                    </div>
                    <div
                      className={`text-xs ${
                        isDarkMode ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      {token.symbol}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-sm font-bold ${
                        isDarkMode ? "text-amber-400" : "text-amber-600"
                      }`}
                    >
                      $
                      {token.value.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div
                      className={`text-xs ${
                        isDarkMode ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      {totalBankValue > 0
                        ? `${((token.value / totalBankValue) * 100).toFixed(1)}%`
                        : "—"}
                    </div>
                  </div>
                </div>
                <div
                  className={`flex items-center justify-between text-xs mb-2 ${
                    isDarkMode ? "text-gray-500" : "text-gray-500"
                  }`}
                >
                  <span>Amount</span>
                  <span
                    className={`font-mono ${
                      isDarkMode ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {token.amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}
                  </span>
                </div>
                <div
                  className={`h-1.5 rounded-full overflow-hidden ${
                    isDarkMode ? "bg-white/[0.06]" : "bg-gray-200/60"
                  }`}
                >
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-budju-pink rounded-full transition-all duration-700"
                    style={{
                      width:
                        totalBankValue > 0
                          ? `${(token.value / totalBankValue) * 100}%`
                          : "0%",
                    }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {!loading && !error && tokenHoldings.length === 0 && (
          <div
            className={`text-center text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-400"
            }`}
          >
            No holdings found for this address.
          </div>
        )}
      </div>
    </section>
  );
};

export default BankTokens;
