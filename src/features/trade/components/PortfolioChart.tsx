import { useRef, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { Chart, DoughnutController, ArcElement, Tooltip } from "chart.js";
import { useTheme } from "@/context/ThemeContext";
import type { PortfolioAsset } from "../services/tradeApi";

Chart.register(DoughnutController, ArcElement, Tooltip);

interface Props {
  assets: PortfolioAsset[];
  totalValue: number;
  usdcBalance: number;
  label: string;
  subtitle?: string;
}

const PortfolioChart = ({
  assets,
  totalValue,
  usdcBalance,
  label,
  subtitle,
}: Props) => {
  const { isDarkMode } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const chartData = useMemo(() => {
    const filtered = assets.filter((a) => a.usdValue > 0);
    return {
      labels: filtered.map((a) => a.code),
      values: filtered.map((a) => a.usdValue),
      colors: filtered.map((a) => a.color),
    };
  }, [assets]);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: chartData.labels,
        datasets: [
          {
            data: chartData.values,
            backgroundColor: chartData.colors,
            borderWidth: 0,
            hoverBorderWidth: 2,
            hoverBorderColor: "#fff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "72%",
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed;
                const pct = totalValue > 0 ? ((val / totalValue) * 100).toFixed(1) : "0";
                return ` ${ctx.label}: $${val.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${pct}%)`;
              },
            },
          },
        },
        animation: { animateRotate: true, duration: 800 },
      },
    });

    return () => {
      chartRef.current?.destroy();
    };
  }, [chartData, totalValue]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={`rounded-xl border p-5 ${
        isDarkMode
          ? "bg-[#0c0c20]/60 border-white/[0.06]"
          : "bg-white/60 border-gray-200/40"
      } backdrop-blur-sm`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3
            className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {label}
          </h3>
          {subtitle && (
            <p
              className={`text-xs ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
            >
              {subtitle}
            </p>
          )}
        </div>
        <div className="text-right">
          <div
            className={`text-xs ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
          >
            USDC
          </div>
          <div
            className={`text-sm font-bold font-mono ${isDarkMode ? "text-green-400" : "text-green-600"}`}
          >
            ${usdcBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="relative mx-auto" style={{ maxWidth: 220 }}>
        <canvas ref={canvasRef} />
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div
            className={`text-lg font-bold font-display ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div
            className={`text-[10px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
          >
            {chartData.labels.length} assets
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default PortfolioChart;
