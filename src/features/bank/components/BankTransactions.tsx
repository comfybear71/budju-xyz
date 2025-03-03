import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import {
  FaExternalLinkAlt,
  FaArrowUp,
  FaArrowDown,
  FaFire,
} from "react-icons/fa";

// Transaction type definition
export interface Transaction {
  id: string;
  type: "deposit" | "withdrawal" | "burn";
  token: string;
  amount: number;
  from: string;
  to: string;
  date: string;
  status: "completed" | "pending";
}

// Sample transaction data
const sampleTransactions: Transaction[] = [
  {
    id: "3pDo7xKjnFkmNmAHrHLfEkG8zXcXJvCUXHFv24qfMdCSzEbJRRYHbKGEHZUEMETaJWjfAiE",
    type: "burn",
    token: "BUDJU",
    amount: 1069299,
    from: "bankofbudju.sol",
    to: "B1opJeR2emYp75spauVHkGXfyxkYSW7GZaN9B3XoUeGK",
    date: "2025-02-26",
    status: "completed",
  },
  {
    id: "5KtW8c7pYMEEzTVDDsG2vKH8NaFbFSB84n4FUc1CUGkYAEJKqaWjX9xMrRjcszMhFHU2Kja",
    type: "deposit",
    token: "SOL",
    amount: 5.25,
    from: "hGwKcLfR9...7Xjb",
    to: "bankofbudju.sol",
    date: "2025-02-24",
    status: "completed",
  },
  {
    id: "7dHJf76FZQeMRbxztkXguZF4CJ9LsYmzj63rvA9pL4cWq8Sz57LUFrkXyUE52FjPKWs3YMu",
    type: "deposit",
    token: "USDC",
    amount: 500,
    from: "rPzF8nQx1...9wVS",
    to: "bankofbudju.sol",
    date: "2025-02-22",
    status: "completed",
  },
  {
    id: "5xHq8qBpNtXV2Cs6mBXuuhrLrwpVkqx3QQmE7Lp3yHhUDdzCsRznXYeGagjDVpJi9FavANq",
    type: "burn",
    token: "BUDJU",
    amount: 500000,
    from: "bankofbudju.sol",
    to: "B1opJeR2emYp75spauVHkGXfyxkYSW7GZaN9B3XoUeGK",
    date: "2025-02-15",
    status: "completed",
  },
  {
    id: "9FHgRjZK3t5y7xc2bLs9uUJpnVSqsQMz1P8DfrQWc1YXu6AvHTX7BEmz2X4HqNPL5gM8ErC",
    type: "deposit",
    token: "BUDJU",
    amount: 250000,
    from: "3WvhF9p4...g5Y2",
    to: "bankofbudju.sol",
    date: "2025-02-10",
    status: "completed",
  },
  {
    id: "2ZjH7xC8wFUQGpJdmbf5vEhK72rXnT9asSq6PvgN1yBcuVLkw3G4DTmMXePH8FRyAhW7e6V",
    type: "withdrawal",
    token: "SOL",
    amount: 1.5,
    from: "bankofbudju.sol",
    to: "raydium_liquidity.sol",
    date: "2025-02-05",
    status: "completed",
  },
];

const BankTransactions = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [transactions, _] = useState<Transaction[]>(sampleTransactions);
  const [filter, setFilter] = useState<
    "all" | "deposit" | "withdrawal" | "burn"
  >("all");

  // Apply filter
  const filteredTransactions =
    filter === "all"
      ? transactions
      : transactions.filter((tx) => tx.type === filter);

  useEffect(() => {
    if (sectionRef.current && tableRef.current) {
      const rows = tableRef.current.querySelectorAll("tbody tr");

      // Animate rows on scroll
      gsap.fromTo(
        rows,
        {
          opacity: 0,
          y: 10,
        },
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
  }, [filteredTransactions]);

  // Format transaction type for display
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

        {/* Filters */}
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === "all"
                ? "bg-budju-blue text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            All Transactions
          </button>
          <button
            onClick={() => setFilter("deposit")}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === "deposit"
                ? "bg-green-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            Deposits
          </button>
          <button
            onClick={() => setFilter("withdrawal")}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === "withdrawal"
                ? "bg-yellow-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            Withdrawals
          </button>
          <button
            onClick={() => setFilter("burn")}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === "burn"
                ? "bg-red-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            Burns
          </button>
        </div>

        {/* Transactions Table */}
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
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx, _) => (
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
