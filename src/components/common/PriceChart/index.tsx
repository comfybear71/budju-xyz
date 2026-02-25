import { useRef, useEffect, useMemo, useState } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  ColorType,
  Time,
} from "lightweight-charts";
import { useTheme } from "@/context/ThemeContext";
import React from "react";

const TokenImage = React.memo(({ baseToken }: { baseToken: string }) => (
  <img
    src={`/images/tokens/${baseToken.toLowerCase()}.png`}
    alt={baseToken}
    className="w-5 h-5 mr-1.5"
    onError={(e) => {
      (e.target as HTMLImageElement).src =
        "/images/tokens/token-placeholder.png";
    }}
  />
));

export interface CandlestickItem {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface PriceChartProps {
  data?: CandlestickItem[];
  baseToken: string;
  quoteToken: string;
  timeframe: string;
  onTimeframeChange?: (timeframe: string) => void;
  loading?: boolean;
  isConnected?: boolean;
}

const chartColors = {
  dark: {
    background: "rgba(12, 12, 32, 0.6)",
    text: "rgba(255, 255, 255, 0.5)",
    grid: "rgba(255, 255, 255, 0.03)",
    lineColor: "#3b82f6",
    areaTopColor: "rgba(59, 130, 246, 0.3)",
    areaBottomColor: "rgba(59, 130, 246, 0.01)",
  },
  light: {
    background: "rgba(255, 255, 255, 0.3)",
    text: "rgba(0, 0, 0, 0.6)",
    grid: "rgba(170, 170, 170, 0.15)",
    lineColor: "#3b82f6",
    areaTopColor: "rgba(59, 130, 246, 0.3)",
    areaBottomColor: "rgba(59, 130, 246, 0.01)",
  },
};

/**
 * Format very small USD prices like $0.000009138 as $0.0₅9138
 */
const formatSmallPrice = (price: number): string => {
  if (price >= 0.01) return price.toFixed(4);
  if (price <= 0) return "0.0000";

  const str = price.toFixed(12);
  const [, decimal] = str.split(".");
  let leadingZeros = 0;
  for (const ch of decimal) {
    if (ch === "0") leadingZeros++;
    else break;
  }

  const significantDigits = decimal.slice(leadingZeros, leadingZeros + 4);
  return `0.0${subscriptDigit(leadingZeros)}${significantDigits}`;
};

const subscriptDigit = (n: number): string => {
  const subscripts = "₀₁₂₃₄₅₆₇₈₉";
  return String(n)
    .split("")
    .map((d) => subscripts[parseInt(d)])
    .join("");
};

const generateDefaultData = (): CandlestickItem[] => {
  const data: CandlestickItem[] = [];
  const basePrice = 0.000009;
  const now = new Date();

  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(now.getDate() - i);

    const volatility = 0.02;
    const changePercent = (Math.random() * 2 - 1) * volatility;
    const baseForDay = basePrice * (1 + (changePercent * (30 - i)) / 10);

    const open = baseForDay * (1 + (Math.random() * 0.01 - 0.005));
    const close = baseForDay * (1 + (Math.random() * 0.01 - 0.005));
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    const volume = Math.floor(Math.random() * 1000) + 500;

    data.push({ time: Math.floor(date.getTime() / 1000), open, high, low, close, volume });
  }

  return data;
};

const PriceChart: React.FC<PriceChartProps> = ({
  data: rawData,
  baseToken,
  quoteToken,
  timeframe,
  onTimeframeChange,
}) => {
  const { isDarkMode } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  const chartData = useMemo(() => {
    if (!rawData || rawData.length === 0) return generateDefaultData();
    return rawData;
  }, [rawData]);

  useEffect(() => {
    if (
      !chartContainerRef.current ||
      !chartWrapperRef.current ||
      !headerRef.current
    )
      return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      areaSeriesRef.current = null;
    }

    const colors = isDarkMode ? chartColors.dark : chartColors.light;

    const headerHeight = headerRef.current.getBoundingClientRect().height;
    const containerHeight = chartContainerRef.current.clientHeight;
    const chartHeight = containerHeight - headerHeight - 8;

    const chart = createChart(chartWrapperRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: colors.text,
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "transparent",
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
          width: 1,
          style: 2,
        },
        horzLine: {
          color: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
          width: 1,
          style: 2,
        },
      },
      rightPriceScale: {
        borderColor: "transparent",
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    // Area (shaded line) chart
    const areaSeries = chart.addAreaSeries({
      lineColor: colors.lineColor,
      topColor: colors.areaTopColor,
      bottomColor: colors.areaBottomColor,
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
    });

    const formattedData = chartData.map((item) => ({
      time: (typeof item.time === "string"
        ? Math.floor(new Date(item.time).getTime() / 1000)
        : item.time) as Time,
      value: item.close,
    }));

    areaSeries.setData(formattedData);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    areaSeriesRef.current = areaSeries;

    const handleResize = () => {
      if (
        chartContainerRef.current &&
        chartWrapperRef.current &&
        chartRef.current &&
        headerRef.current
      ) {
        const newHeaderHeight =
          headerRef.current.getBoundingClientRect().height;
        const newContainerHeight = chartContainerRef.current.clientHeight;
        const newChartHeight = newContainerHeight - newHeaderHeight - 8;

        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: newChartHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [chartData, isDarkMode]);

  useEffect(() => {
    if (!chartRef.current || !areaSeriesRef.current) return;

    const colors = isDarkMode ? chartColors.dark : chartColors.light;

    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
    });

    areaSeriesRef.current.applyOptions({
      lineColor: colors.lineColor,
      topColor: colors.areaTopColor,
      bottomColor: colors.areaBottomColor,
    });
  }, [isDarkMode]);

  const timeframes = ["15m", "1H", "4H", "1D", "1W"];

  const lastPrice = chartData.length > 0 ? chartData[chartData.length - 1].close : 0;
  const prevPrice = chartData.length > 1 ? chartData[chartData.length - 2].close : lastPrice;
  const priceChange = prevPrice > 0 ? ((lastPrice - prevPrice) / prevPrice) * 100 : 0;
  const isPositive = priceChange >= 0;

  return (
    <div ref={chartContainerRef} className="w-full h-full">
      {/* Header */}
      <div ref={headerRef} className="mb-2">
        {/* Row 1: Token pair + price */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              <TokenImage baseToken={baseToken} />
              <span className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                {baseToken}/{quoteToken}
              </span>
            </div>
          </div>

          {lastPrice > 0 && (
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                ${formatSmallPrice(lastPrice)}
              </span>
              <span
                className={`text-xs font-bold ${isPositive ? "text-green-400" : "text-red-400"}`}
              >
                {isPositive ? "+" : ""}{priceChange.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* Row 2: Timeframe buttons — always horizontal */}
        <div className="flex items-center gap-1.5">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange && onTimeframeChange(tf)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                timeframe === tf
                  ? isDarkMode
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "bg-blue-50 text-blue-600 border border-blue-200"
                  : isDarkMode
                    ? "text-gray-500 hover:text-gray-400 hover:bg-white/[0.04]"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div
        ref={chartWrapperRef}
        className="w-full h-[calc(100%-theme(spacing.16))] overflow-hidden rounded-lg"
      />
    </div>
  );
};

export default PriceChart;
