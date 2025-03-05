import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import {
  FaExternalLinkAlt,
  FaArrowUp,
  FaArrowDown,
  FaFire,
} from "react-icons/fa";
import { Transaction, fetchBankTransactions } from "@lib/utils/tokenService"; // Adjust path

const BankTransactions = () => {
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
        const txs = await fetchBankTransactions(); // Uses defaults from TokenService
        setTransactions(txs);
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
      className="py-20 bg-gradient-to-b from-budju-black to-gray-900"
    >
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-white">RECENT</span>{" "}
            <span className="text-budju-blue">TRANSACTIONS</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Track the latest activity in the Bank of BUDJU
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-3 mb-8">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg transition-colors ${filter === "all" ? "bg-budju-blue text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
          >
            All Transactions
          </button>
          {/* <button
            onClick={() => setFilter("deposit")}
            className={`px-4 py-2 rounded-lg transition-colors ${filter === "deposit" ? "bg-green-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
          >
            Deposits
          </button>
          <button
            onClick={() => setFilter("withdrawal")}
            className={`px-4 py-2 rounded-lg transition-colors ${filter === "withdrawal" ? "bg-yellow-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
          >
            Withdrawals
          </button>
          <button
            onClick={() => setFilter("burn")}
            className={`px-4 py-2 rounded-lg transition-colors ${filter === "burn" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
          >
            Burns
          </button> */}
        </div>

        <div className="max-w-5xl mx-auto overflow-x-auto budju-card p-0">
          <table ref={tableRef} className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-900/70">
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
                  <td colSpan={6} className="py-8 text-center text-gray-400">
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
                    className="border-b border-gray-800 last:border-b-0 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="mr-2">
                          {getTransactionIcon(tx.type)}
                        </span>
                        {getTransactionText(tx.type)}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">{tx.token}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap font-medium">
                      {tx.amount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      {tx.type === "deposit" ? (
                        <div className="text-sm">
                          <div className="text-gray-400">From:</div>
                          <div className="font-mono truncate max-w-[120px]">
                            {tx.from}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm">
                          <div className="text-gray-400">To:</div>
                          <div className="font-mono truncate max-w-[120px]">
                            {tx.to}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {new Date(tx.date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <a
                        href={`https://solscan.io/tx/${tx.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                        title="View transaction on Solscan"
                      >
                        <FaExternalLinkAlt className="text-budju-blue" />
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    No transactions found matching the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="text-center mt-6 text-gray-400 text-sm">
          All transactions are recorded on the Solana blockchain and can be
          verified by clicking the details link.
        </div>
      </div>
    </section>
  );
};

export default BankTransactions;
