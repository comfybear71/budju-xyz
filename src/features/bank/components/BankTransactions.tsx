import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
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
  const [filter, setFilter] = useState<"all" | "deposit" | "withdrawal" | "burn">(
    "all",
  );
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
    <section
      ref={sectionRef}
      className={`py-20 ${isDarkMode ? "bg-gradient-to-b from-budju-black to-gray-900" : "bg-gradient-to-b from-purple-400 to-budju-pink"}`}
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
              RECENT
            </span>{" "}
            <span className="text-budju-blue">TRANSACTIONS</span>
          </h2>
          <p
            className={`text-lg ${isDarkMode ? "text-gray-300" : "text-white"} max-w-3xl mx-auto`}
          >
            Track the latest activity in the Bank of BUDJU
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-3 mb-8">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === "all"
                ? "bg-budju-blue text-white"
                : isDarkMode
                ? "bg-gray-800 text-gray-400 hover:bg-gray-700"
                : "bg-white/30 text-white hover:bg-white/40"
            }`}
          >
            All Transactions
          </button>
          <button
            onClick={() => setFilter("deposit")}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === "deposit"
                ? "bg-green-600 text-white"
                : isDarkMode
                ? "bg-gray-800 text-gray-400 hover:bg-gray-700"
                : "bg-white/30 text-white hover:bg-white/40"
            }`}
          >
            Deposits
          </button>
          <button
            onClick={() => setFilter("withdrawal")}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === "withdrawal"
                ? "bg-yellow-600 text-white"
                : isDarkMode
                ? "bg-gray-800 text-gray-400 hover:bg-gray-700"
                : "bg-white/30 text-white hover:bg-white/40"
            }`}
          >
            Withdrawals
          </button>
          <button
            onClick={() => setFilter("burn")}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === "burn"
                ? "bg-red-600 text-white"
                : isDarkMode
                ? "bg-gray-800 text-gray-400 hover:bg-gray-700"
                : "bg-white/30 text-white hover:bg-white/40"
            }`}
          >
            Burns
          </button>
        </div>

        <div
          className={`max-w-5xl mx-auto overflow-x-auto ${isDarkMode ? "bg-gray-800 border border-gray-700 rounded-xl p-0" : "bg-white/20 border border-white/30 rounded-xl shadow-lg p-0"}`}
        >
          <table ref={tableRef} className="w-full border-collapse">
            <thead>
              <tr className={isDarkMode ? "bg-gray-900" : "bg-white/30"}>
                <th className="py-3 px-4 text-left text-budju-blue font-medium">
                  Type
                </th>
                <th className="py-3 px-4 text-left text-budju-blue font-medium">
                  Token
                </th>
                <th className="py-3 px-4 text-right text-budju-blue font-medium">
                  Amount
                </th>
                <th className="py-3 px-4 text-left text-budju-blue font-medium hidden md:table-cell">
                  From/To
                </th>
                <th className="py-3 px-4 text-left text-budju-blue font-medium">
                  Date
                </th>
                <th className="py-3 px-4 text-center text-budju-blue font-medium">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className={`py-8 text-center ${isDarkMode ? "text-gray-300" : "text-white/80"}`}
                  >
                    Loading transactions...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-red-400">
                    Error: {error}
                  </td>
                </tr>
              ) : filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className={`${
                      isDarkMode
                        ? "border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50"
                        : "border-b border-white/30 last:border-b-0 hover:bg-white/40"
                    } transition-colors`}
                  >
                    <td className={`py-3 px-4 whitespace-nowrap ${isDarkMode ? "text-white" : "text-white"}`}>
                      <div className="flex items-center">
                        <span className="mr-2">
                          {getTransactionIcon(tx.type)}
                        </span>
                        {getTransactionText(tx.type)}
                      </div>
                    </td>
                    <td className={`py-3 px-4 whitespace-nowrap ${isDarkMode ? "text-white" : "text-white"}`}>
                      {tx.token}
                    </td>
                    <td className={`py-3 px-4 text-right whitespace-nowrap font-medium ${isDarkMode ? "text-white" : "text-white"}`}>
                      {tx.amount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      {tx.type === "deposit" ? (
                        <div className="text-sm">
                          <div
                            className={
                              isDarkMode ? "text-gray-300" : "text-white/80"
                            }
                          >
                            From:
                          </div>
                          <div className={`font-mono truncate max-w-[120px] ${isDarkMode ? "text-white" : "text-white"}`}>
                            {tx.from}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm">
                          <div
                            className={
                              isDarkMode ? "text-gray-300" : "text-white/80"
                            }
                          >
                            To:
                          </div>
                          <div className={`font-mono truncate max-w-[120px] ${isDarkMode ? "text-white" : "text-white"}`}>
                            {tx.to}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className={`py-3 px-4 whitespace-nowrap ${isDarkMode ? "text-white" : "text-white"}`}>
                      {new Date(tx.date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <a
                        href={`https://solscan.io/tx/${tx.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-block p-2 ${
                          isDarkMode
                            ? "bg-gray-700 hover:bg-gray-600"
                            : "bg-white/30 hover:bg-white/40"
                        } rounded-lg transition-colors`}
                        title="View transaction on Solscan"
                      >
                        <FaExternalLinkAlt className="text-budju-blue" />
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className={`py-8 text-center ${isDarkMode ? "text-gray-300" : "text-white/80"}`}
                  >
                    No transactions found matching the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div
          className={`text-center mt-6 ${isDarkMode ? "text-gray-300" : "text-white/80"} text-sm`}
        >
          All transactions are recorded on the Solana blockchain and can be
          verified by clicking the details link.
        </div>
      </div>
    </section>
  );
};

export default BankTransactions;