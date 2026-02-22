import { useRef, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { Chart, DoughnutController, ArcElement, Tooltip } from "chart.js";
import type { PortfolioAsset } from "../services/tradeApi";

Chart.register(DoughnutController, ArcElement, Tooltip);

interface Props {
  assets: PortfolioAsset[];
  totalValue: number;
  usdcBalance: number;
  label: string;
  subtitle?: string;
  onSelectAsset?: (code: string) => void;
}

const PortfolioChart = ({
  assets,
  totalValue,
  usdcBalance,
  label,
  subtitle,
  onSelectAsset,
}: Props) => {
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

    // If no data, show empty chart
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
                const pct =
                  totalValue > 0
                    ? ((val / totalValue) * 100).toFixed(1)
                    : "0";
                return ` ${ctx.label}: $${val.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${pct}%)`;
              },
            },
          },
        },
        animation: { animateRotate: true, duration: 800 },
        onClick: hasData && onSelectAsset ? (_event: any, elements: any[]) => {
          if (elements.length > 0) {
            const idx = elements[0].index;
            const code = chartData.labels[idx];
            if (code) onSelectAsset(code);
          }
        } : undefined,
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
    >
      {/* Chart */}
      <div className="relative mx-auto" style={{ maxWidth: 180 }}>
        <canvas ref={canvasRef} />
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-xl font-bold font-display text-white">
            ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] text-slate-500">{label}</div>
        </div>
      </div>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-center text-xs text-slate-500 mt-2">{subtitle}</p>
      )}
    </motion.div>
  );
};

export default PortfolioChart;
