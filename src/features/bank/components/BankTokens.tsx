import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { useTheme } from "@/context/ThemeContext";
import {
  fetchBankHoldings,
  type TokenHolding,
} from "../services/bankHoldings";
import HoldingsTierSelector from "./HoldingsTierSelector";

const BankTokens = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
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
    <section ref={sectionRef} className="pt-8 pb-16 md:pt-12 md:pb-24 px-4">
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

        {/* Tiered Holdings */}
        {!loading && !error && tokenHoldings.length > 0 && (
          <HoldingsTierSelector
            holdings={tokenHoldings}
            totalBankValue={totalBankValue}
          />
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
