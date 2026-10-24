import { useRef, useEffect, useMemo } from "react";
import { Chart, DoughnutController, ArcElement, Tooltip } from "chart.js";
import type { LiveLeaderboardEntry } from "../services/tradeApi";

Chart.register(DoughnutController, ArcElement, Tooltip);

interface Props {
  entries: LiveLeaderboardEntry[];
  combinedValue: number;
}

// Fixed palette (not per-wallet identity — just enough distinct hues to tell
// slices apart). Cycled if there are ever more wallets than colors.
const PALETTE = [
  "#FFD700", // budju-yellow
  "#87CEFA", // budju-blue
  "#FF69B4", // budju-pink
  "#34d399", // emerald
  "#a78bfa", // violet
  "#fb923c", // orange
  "#60a5fa", // sky
  "#f472b6", // pink
];

/**
 * Cumulative total doughnut — every connected wallet's own current value as
 * one slice of the combined, non-custodial total. BUDJU doesn't hold any of
 * this; it's purely a live visualization of each wallet's own account value
 * stacked together. Mirrors PortfolioChart.tsx's doughnut pattern.
 */
const LeaderboardDoughnut = ({ entries, combinedValue }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const chartData = useMemo(() => {
    const filtered = entries.filter((e) => e.totalValue > 0);
    return {
      labels: filtered.map((e) => e.walletShort),
      values: filtered.map((e) => e.totalValue),
      colors: filtered.map((_, i) => PALETTE[i % PALETTE.length]),
    };
  }, [entries]);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

    const hasData = chartData.values.length > 0;

    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: hasData ? chartData.labels : ["No data"],
        datasets: [
          {
            data: hasData ? chartData.values : [1],
            backgroundColor: hasData ? chartData.colors : ["#1e293b"],
            borderWidth: 0,
            hoverBorderWidth: 2,
            hoverBorderColor: "#fff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "70%",
        plugins: {
          tooltip: {
            enabled: hasData,
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed;
                const pct = combinedValue > 0 ? ((val / combinedValue) * 100).toFixed(1) : "0";
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
  }, [chartData, combinedValue]);

  return (
    <div className="relative mx-auto" style={{ maxWidth: 170 }}>
      <canvas ref={canvasRef} />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-lg font-bold font-display text-white">
          ${combinedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
        <div className="text-[9px] text-slate-500 text-center px-2">Combined Total</div>
      </div>
    </div>
  );
};

export default LeaderboardDoughnut;
