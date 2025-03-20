// src/components/common/PriceChart.tsx
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
import { FaChartBar } from "react-icons/fa";

const TokenImage = React.memo(({ baseToken }: { baseToken: string }) => (
  <img
    src={`/images/tokens/${baseToken.toLowerCase()}.png`}
    alt={baseToken}
    className="w-6 h-6 mr-2"
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
    background: "rgba(35, 35, 45, 0.8)",
    text: "rgba(255, 255, 255, 0.8)",
    grid: "rgba(70, 70, 90, 0.4)",
    upColor: "#26a69a",
    downColor: "#ef5350",
    borderUpColor: "#26a69a",
    borderDownColor: "#ef5350",
    wickUpColor: "#26a69a",
    wickDownColor: "#ef5350",
  },
  light: {
    background: "rgba(255, 255, 255, 0.3)",
    text: "rgba(0, 0, 0, 0.8)",
    grid: "rgba(170, 170, 170, 0.3)",
    upColor: "#26a69a",
    downColor: "#ef5350",
    borderUpColor: "#26a69a",
    borderDownColor: "#ef5350",
    wickUpColor: "#26a69a",
    wickDownColor: "#ef5350",
  },
};

const generateDefaultData = (): CandlestickItem[] => {
  const data: CandlestickItem[] = [];
  const basePrice = 664199; // BUDJU per SOL
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

    data.push({
      time: Math.floor(date.getTime() / 1000),
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return data;
};

const PriceChart: React.FC<PriceChartProps> = ({
  data: rawData,
  baseToken,
  quoteToken,
  timeframe,
  onTimeframeChange,
  // loading = false,
  // isConnected = false,
}) => {
  const { isDarkMode } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [showVolume, setShowVolume] = useState(false);

  // Adjust data for SOL/BUDJU pair (inverting if necessary)
  const chartData = useMemo(() => {
    if (!rawData || rawData.length === 0) return generateDefaultData();

    if (baseToken === "SOL" && quoteToken === "BUDJU") {
      const firstClose = rawData[0]?.close || 0;
      if (firstClose > 0 && firstClose < 1) {
        return rawData.map((item) => ({
          time: (typeof item.time === "string"
            ? Math.floor(new Date(item.time).getTime() / 1000)
            : item.time) as Time,
          open: 1 / item.open || 0,
          high: 1 / item.high || 0,
          low: 1 / item.low || 0,
          close: 1 / item.close || 0,
          volume: item.volume,
        }));
      }
    }
    return rawData;
  }, [rawData, baseToken, quoteToken]);

  useEffect(() => {
    if (!chartContainerRef.current || !chartWrapperRef.current || !headerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    }

    const colors = isDarkMode ? chartColors.dark : chartColors.light;

    // Calculate the available height for the chart by subtracting the header height
    const headerHeight = headerRef.current.getBoundingClientRect().height;
    const containerHeight = chartContainerRef.current.clientHeight;
    const chartHeight = containerHeight - headerHeight - 16; // Subtract padding (e.g., 16px for p-4)

    const chart = createChart(chartWrapperRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartHeight, // Use calculated height
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: colors.grid,
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: colors.grid,
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

    // Add candlestick series using addCandlestickSeries (available in 3.8.0)
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: colors.upColor,
      downColor: colors.downColor,
      borderUpColor: colors.borderUpColor,
      borderDownColor: colors.borderDownColor,
      wickUpColor: colors.wickUpColor,
      wickDownColor: colors.wickDownColor,
    });

    // Add histogram series for volume using addHistogramSeries (available in 3.8.0)
    const volumeSeries = chart.addHistogramSeries({
      color: "#26a69a",
      priceFormat: { type: "volume" },
      priceScaleId: "",
      scaleMargins: {
        top: 0.7, // Adjusted to give more space for candlesticks
        bottom: 0,
      },
    });

    const formattedData = chartData.map((item) => ({
      time: (typeof item.time === "string"
        ? Math.floor(new Date(item.time).getTime() / 1000)
        : item.time) as Time,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    }));

    const volumeData = chartData
      .filter((item) => item.volume !== undefined)
      .map((item) => ({
        time: (typeof item.time === "string"
          ? Math.floor(new Date(item.time).getTime() / 1000)
          : item.time) as Time,
        value: item.volume || 0,
        color: item.close >= item.open ? colors.upColor : colors.downColor,
      }));

    candlestickSeries.setData(formattedData);
    volumeSeries.setData(showVolume ? volumeData : []);

    chart.timeScale().fitContent();

    chartRef.current = chart;
    candleSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartWrapperRef.current && chartRef.current && headerRef.current) {
        const newHeaderHeight = headerRef.current.getBoundingClientRect().height;
        const newContainerHeight = chartContainerRef.current.clientHeight;
        const newChartHeight = newContainerHeight - newHeaderHeight - 16; // Adjust for padding

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
  }, [chartData, isDarkMode, showVolume]);

  useEffect(() => {
    if (
      !chartRef.current ||
      !candleSeriesRef.current ||
      !volumeSeriesRef.current
    )
      return;

    const colors = isDarkMode ? chartColors.dark : chartColors.light;

    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
    });

    candleSeriesRef.current.applyOptions({
      upColor: colors.upColor,
      downColor: colors.downColor,
      borderUpColor: colors.borderUpColor,
      borderDownColor: colors.borderDownColor,
      wickUpColor: colors.wickUpColor,
      wickDownColor: colors.wickDownColor,
    });

    const volumeData = chartData
      .filter((item) => item.volume !== undefined)
      .map((item) => ({
        time: (typeof item.time === "string"
          ? Math.floor(new Date(item.time).getTime() / 1000)
          : item.time) as Time,
        value: item.volume || 0,
        color: item.close >= item.open ? colors.upColor : colors.downColor,
      }));

    volumeSeriesRef.current.applyOptions({
      color: "#26a69a",
    });

    volumeSeriesRef.current.setData(showVolume ? volumeData : []);
  }, [isDarkMode, chartData, showVolume]);

  const timeframes = ["15m", "1H", "4H", "1D", "1W"];

  return (
    <div ref={chartContainerRef} className="w-full h-full">
      {/* Header Section (Token Info, Timeframes, etc.) */}
      <div ref={headerRef} className="mb-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center">
              <TokenImage baseToken={baseToken} />
              <span className="text-white text-lg font-bold">
                {baseToken} / {quoteToken}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {timeframes.map((tf) => (
                <button
                  key={tf}
                  onClick={() => onTimeframeChange && onTimeframeChange(tf)}
                  className={`px-3 py-1 rounded-md text-sm transition-colors ${
                    timeframe === tf
                      ? isDarkMode
                        ? "bg-budju-blue text-white"
                        : "bg-white/40 text-white font-bold"
                      : isDarkMode
                        ? "bg-gray-800 text-gray-400 hover:bg-gray-700"
                        : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                >
                  {tf}
                </button>
              ))}
              <button
                onClick={() => setShowVolume(!showVolume)}
                className="text-gray-400 hover:text-gray-200 ml-2"
              >
                <FaChartBar className="w-5 h-5" />
              </button>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="text-white">
              <span className="text-2xl md:text-3xl font-bold">
                {chartData[chartData.length - 1].close.toFixed(4)}
              </span>
              <span
                className={`ml-2 ${
                  chartData[chartData.length - 1].close >=
                  (chartData[chartData.length - 2]?.close || 0)
                    ? "text-green-500"
                    : "text-red-500"
                }`}
              >
                {chartData[chartData.length - 1].close >=
                (chartData[chartData.length - 2]?.close || 0)
                  ? "+"
                  : ""}
                {(
                  ((chartData[chartData.length - 1].close -
                    (chartData[chartData.length - 2]?.close ||
                      chartData[chartData.length - 1].close)) /
                    (chartData[chartData.length - 2]?.close ||
                      chartData[chartData.length - 1].close)) *
                  100
                ).toFixed(2)}
                %
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Chart Wrapper to Handle Overflow */}
      <div ref={chartWrapperRef} className="w-full h-[calc(100%-theme(spacing.16))] overflow-hidden" />
    </div>
  );
};

export default PriceChart;