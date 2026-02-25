import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import {
  FaExternalLinkAlt,
  FaArrowUp,
  FaArrowDown,
  FaFire,
} from "react-icons/fa";
import { Transaction, fetchBankTransactions } from "@lib/utils/tokenService";
import { useTheme } from "@/context/ThemeContext";

const BankTransactions = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<
    "all" | "deposit" | "withdrawal" | "burn"
  >("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTransactions = async () => {
      try {
        setLoading(true);
        const txs = await fetchBankTransactions(); // Uses default BANK_OF_BUDJU_ADDRESS
        // Filter out transactions with amount 0
        const filteredTxs = txs.filter((tx) => tx.amount !== 0);
        setTransactions(filteredTxs);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, []);

  useEffect(() => {
    if (sectionRef.current && tableRef.current && !loading) {
      const rows = tableRef.current.querySelectorAll("tbody tr");
      gsap.fromTo(
        rows,
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.05,
          duration: 0.4,
          ease: "power1.out",
          scrollTrigger: {
            trigger: tableRef.current,
            start: "top 80%",
          },
        },
      );
    }
  }, [transactions, loading]);

  const getTransactionIcon = (type: Transaction["type"]) => {
    switch (type) {
      case "deposit":
        return <FaArrowDown className="text-green-400" />;
      case "withdrawal":
        return <FaArrowUp className="text-yellow-400" />;
      case "burn":
        return <FaFire className="text-red-400" />;
    }
  };

  const getTransactionText = (type: Transaction["type"]) => {
    switch (type) {
      case "deposit":
        return <span className="text-green-400">Deposit</span>;
      case "withdrawal":
        return <span className="text-yellow-400">Withdrawal</span>;
      case "burn":
        return <span className="text-red-400">Burn</span>;
    }
  };

  const filteredTransactions =
    filter === "all"
      ? transactions
      : transactions.filter((tx) => tx.type === filter);

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
            Full{" "}
            <span className="bg-gradient-to-r from-cyan-400 to-budju-blue bg-clip-text text-transparent">
              Transparency
            </span>
          </h2>
          <p
            className={`text-sm max-w-lg mx-auto ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            Every deposit, withdrawal, and burn is recorded on-chain. Click any
            transaction to verify it on Solscan.
          </p>
        </motion.div>

        {/* Filter Pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {(
            [
              { key: "all", label: "All", active: "bg-gradient-to-r from-cyan-500 to-budju-blue text-white" },
              { key: "deposit", label: "Deposits", active: "bg-emerald-500 text-white" },
              { key: "withdrawal", label: "Withdrawals", active: "bg-amber-500 text-white" },
              { key: "burn", label: "Burns", active: "bg-red-500 text-white" },
            ] as const
          ).map((btn) => (
            <button
              key={btn.key}
              onClick={() => setFilter(btn.key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                filter === btn.key
                  ? btn.active
                  : isDarkMode
                    ? "bg-white/[0.05] text-gray-400 hover:bg-white/[0.1] border border-white/[0.06]"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-200"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Transaction Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div
            className={`rounded-2xl border overflow-hidden ${
              isDarkMode
                ? "bg-[#0c0c20]/60 border-white/[0.06]"
                : "bg-white/60 border-gray-200/40"
            } backdrop-blur-sm overflow-x-auto`}
          >
            <table ref={tableRef} className="w-full border-collapse">
              <thead>
                <tr
                  className={
                    isDarkMode
                      ? "bg-white/[0.03] border-b border-white/[0.06]"
                      : "bg-gray-50/50 border-b border-gray-200/40"
                  }
                >
                  <th
                    className={`py-3 px-4 text-left text-[10px] uppercase tracking-[0.15em] font-bold ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    Type
                  </th>
                  <th
                    className={`py-3 px-4 text-left text-[10px] uppercase tracking-[0.15em] font-bold ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    Token
                  </th>
                  <th
                    className={`py-3 px-4 text-right text-[10px] uppercase tracking-[0.15em] font-bold ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    Amount
                  </th>
                  <th
                    className={`py-3 px-4 text-left text-[10px] uppercase tracking-[0.15em] font-bold hidden md:table-cell ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    From / To
                  </th>
                  <th
                    className={`py-3 px-4 text-left text-[10px] uppercase tracking-[0.15em] font-bold ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    Date
                  </th>
                  <th
                    className={`py-3 px-4 text-center text-[10px] uppercase tracking-[0.15em] font-bold ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    Verify
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className={`py-12 text-center text-sm ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      Loading transactions...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-sm text-red-400"
                    >
                      {error}
                    </td>
                  </tr>
                ) : filteredTransactions.length > 0 ? (
                  filteredTransactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className={`${
                        isDarkMode
                          ? "border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03]"
                          : "border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50"
                      } transition-colors`}
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getTransactionIcon(tx.type)}
                          {getTransactionText(tx.type)}
                        </div>
                      </td>
                      <td
                        className={`py-3 px-4 whitespace-nowrap text-sm font-medium ${
                          isDarkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        {tx.token}
                      </td>
                      <td
                        className={`py-3 px-4 text-right whitespace-nowrap text-sm font-mono font-bold ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {tx.amount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 hidden md:table-cell">
                        <div
                          className={`font-mono text-xs truncate max-w-[140px] ${
                            isDarkMode ? "text-gray-500" : "text-gray-400"
                          }`}
                        >
                          {tx.type === "deposit" ? tx.from : tx.to}
                        </div>
                      </td>
                      <td
                        className={`py-3 px-4 whitespace-nowrap text-xs ${
                          isDarkMode ? "text-gray-500" : "text-gray-500"
                        }`}
                      >
                        {new Date(tx.date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <a
                          href={`https://solscan.io/tx/${tx.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                            isDarkMode
                              ? "text-cyan-400/60 hover:text-cyan-400 hover:bg-white/[0.06]"
                              : "text-cyan-600/60 hover:text-cyan-600 hover:bg-gray-100"
                          }`}
                          title="Verify on Solscan"
                        >
                          <FaExternalLinkAlt className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className={`py-12 text-center text-sm ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      No transactions found for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        <p
          className={`text-center mt-6 text-xs ${
            isDarkMode ? "text-gray-600" : "text-gray-400"
          }`}
        >
          Every transaction is permanently recorded on the Solana blockchain.
          Click the verify icon to confirm any entry on Solscan.
        </p>
      </div>
    </section>
  );
};

export default BankTransactions;
