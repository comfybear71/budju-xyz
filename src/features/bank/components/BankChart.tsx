import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { useTheme } from "@/context/ThemeContext";
import {
  fetchBankHoldings,
  type TokenHolding,
} from "../services/bankHoldings";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const CHART_COLORS = [
  "#FF6384",
  "#36A2EB",
  "#FFCE56",
  "#4BC0C0",
  "#9966FF",
  "#FF9F40",
];

const BankChart = () => {
  const { isDarkMode } = useTheme();
  const [tokenHoldings, setTokenHoldings] = useState<TokenHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const holdings = await fetchBankHoldings();
        // Only chart tokens that have a value
        setTokenHoldings(holdings.filter((h) => h.value > 0));
      } catch (err) {
        setError("Failed to load chart data.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const barData = {
    labels: tokenHoldings.map((t) => t.symbol),
    datasets: [
      {
        label: "Token Value (USD)",
        data: tokenHoldings.map((t) => t.value),
        backgroundColor: tokenHoldings.map(
          (_, i) => CHART_COLORS[i % CHART_COLORS.length],
        ),
        borderColor: isDarkMode ? "#333" : "#E5E7EB",
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { label: string; raw: number }) =>
            `${ctx.label}: $${ctx.raw.toFixed(2)}`,
        },
        backgroundColor: isDarkMode ? "#1F2937" : "#ffffff",
        titleColor: isDarkMode ? "#ffffff" : "#333333",
        bodyColor: isDarkMode ? "#ffffff" : "#333333",
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: "Value (USD)",
          color: isDarkMode ? "#ffffff" : "#333333",
        },
        grid: { color: isDarkMode ? "#374151" : "#E5E7EB" },
        ticks: { color: isDarkMode ? "#ffffff" : "#333333" },
      },
      x: {
        title: {
          display: true,
          text: "Tokens",
          color: isDarkMode ? "#ffffff" : "#333333",
        },
        grid: { color: isDarkMode ? "#374151" : "#E5E7EB" },
        ticks: { color: isDarkMode ? "#ffffff" : "#333333" },
      },
    },
  };

  return (
    <section className="py-16 md:py-24 px-4">
      <div className="max-w-7xl mx-auto">
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
            Token{" "}
            <span className="bg-gradient-to-r from-budju-pink to-budju-blue bg-clip-text text-transparent">
              Value Breakdown
            </span>
          </h2>
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            USD value of each asset held in the treasury
          </p>
        </motion.div>

        {loading && (
          <div
            className={`text-center text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-400"
            }`}
          >
            Loading chart data...
          </div>
        )}
        {error && (
          <div className="text-center text-sm text-red-400">{error}</div>
        )}
        {!loading && !error && tokenHoldings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div
              className={`rounded-2xl border p-6 md:p-8 ${
                isDarkMode
                  ? "bg-[#0c0c20]/60 border-white/[0.06]"
                  : "bg-white/60 border-gray-200/40"
              } backdrop-blur-sm`}
            >
              <div className="max-w-3xl mx-auto">
                <Bar data={barData} options={options} />
              </div>
            </div>
          </motion.div>
        )}
        {!loading && !error && tokenHoldings.length === 0 && (
          <div
            className={`text-center text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-400"
            }`}
          >
            No holdings to chart.
          </div>
        )}
      </div>
    </section>
  );
};

export default BankChart;
