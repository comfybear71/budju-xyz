import { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import Button from "@components/common/Button";
import { DEX_LINK } from "@constants/addresses";
import {
  fetchHeliusTokenMetrics,
  fetchHistoricalPriceData,
  TOKEN_ADDRESS,
} from "@/lib/utils/tokenService";

const timeframes = [
  { label: "1D", days: 1, type: "15m" }, // 15-minute intervals for 1 day
  { label: "7D", days: 7, type: "1H" }, // 1-hour intervals for 7 days
  { label: "30D", days: 30, type: "1D" }, // Daily intervals for 30 days
  { label: "ALL", days: 90, type: "1D" }, // Daily intervals for 90 days
];

interface PriceDataPoint {
  date: string;
  price: number;
  volume: number;
}

const PriceChart = () => {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [priceData, setPriceData] = useState<PriceDataPoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [selectedTimeframe, setSelectedTimeframe] = useState(timeframes[2]); // Default to 30D
  const [priceChange, setPriceChange] = useState({ value: 0, percentage: 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(true);

  // Fetch price data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Fetch current price
      const metrics = await fetchHeliusTokenMetrics(TOKEN_ADDRESS);
      setCurrentPrice(metrics.price);

      // Fetch historical price data
      const historicalData = await fetchHistoricalPriceData(
        TOKEN_ADDRESS,
        selectedTimeframe.days,
        selectedTimeframe.type,
      );
      setPriceData(historicalData);

      setLoading(false);
    };

    fetchData();
  }, [selectedTimeframe]);

  // Calculate price change
  useEffect(() => {
    if (priceData.length === 0) return;

    const startPrice = priceData[0].price;
    const endPrice = priceData[priceData.length - 1].price;

    const change = endPrice - startPrice;
    const percentChange = startPrice !== 0 ? (change / startPrice) * 100 : 0;

    setPriceChange({
      value: change,
      percentage: percentChange,
    });
  }, [priceData]);

  // Draw the chart
  const drawChart = useCallback(() => {
    if (!chartRef.current || priceData.length === 0 || dimensions.width === 0)
      return;

    const canvas = chartRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * pixelRatio;
    canvas.height = dimensions.height * pixelRatio;
    ctx.scale(pixelRatio, pixelRatio);
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    const filteredData = priceData;

    let minPrice = Math.min(...filteredData.map((d) => d.price));
    let maxPrice = Math.max(...filteredData.map((d) => d.price));
    const padding = (maxPrice - minPrice) * 0.1;
    minPrice -= padding;
    maxPrice += padding;

    const isMobile = dimensions.width < 480;
    const isTablet = dimensions.width >= 480 && dimensions.width < 768;

    const leftPadding = isMobile ? 60 : 50;
    const rightPadding = 10;
    const topPadding = 20;
    const bottomPadding = 30;

    const chartWidth = dimensions.width - leftPadding - rightPadding;
    const chartHeight = dimensions.height - topPadding - bottomPadding;
    const startX = leftPadding;
    const startY = topPadding;

    // Draw axes
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX, startY + chartHeight);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(startX, startY + chartHeight);
    ctx.lineTo(startX + chartWidth, startY + chartHeight);
    ctx.stroke();

    // Draw price labels (y-axis)
    ctx.fillStyle = "#aaa";
    ctx.font = isMobile ? "10px Arial" : "12px Arial";
    ctx.textAlign = "right";
    const yLabelCount = isMobile ? 3 : isTablet ? 4 : 5;

    for (let i = 0; i <= yLabelCount; i++) {
      const y = startY + chartHeight - i * (chartHeight / yLabelCount);
      const price = minPrice + i * ((maxPrice - minPrice) / yLabelCount);
      const priceText =
        price < 0.0001 ? price.toExponential(2) : price.toFixed(8);

      ctx.fillText(priceText, startX - 5, y + 4);
      ctx.strokeStyle = "#333";
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(startX + chartWidth, y);
      ctx.stroke();
    }

    // Draw date labels (x-axis)
    ctx.textAlign = "center";
    let labelStep = isMobile
      ? Math.max(1, Math.floor(filteredData.length / 3))
      : isTablet
        ? Math.max(1, Math.floor(filteredData.length / 4))
        : Math.max(1, Math.floor(filteredData.length / 5));

    for (let i = 0; i < filteredData.length; i += labelStep) {
      const x = startX + i * (chartWidth / (filteredData.length - 1));
      const date = new Date(filteredData[i].date);
      const label =
        selectedTimeframe.days <= 1
          ? `${date.getHours()}:00`
          : `${date.getDate()}/${date.getMonth() + 1}`;

      ctx.fillText(label, x, startY + chartHeight + 20);
      ctx.strokeStyle = "#333";
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, startY + chartHeight);
      ctx.stroke();
    }

    // Draw price line
    ctx.strokeStyle = priceChange.percentage >= 0 ? "#2ECC40" : "#FF4136";
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < filteredData.length; i++) {
      const x = startX + i * (chartWidth / (filteredData.length - 1));
      const y =
        startY +
        chartHeight -
        ((filteredData[i].price - minPrice) / (maxPrice - minPrice)) *
          chartHeight;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();

    // Fill area under the curve
    ctx.lineTo(startX + chartWidth, startY + chartHeight);
    ctx.lineTo(startX, startY + chartHeight);
    ctx.closePath();
    ctx.fillStyle =
      priceChange.percentage >= 0
        ? "rgba(46, 204, 64, 0.1)"
        : "rgba(255, 65, 54, 0.1)";
    ctx.fill();

    // Draw dots at data points
    if (selectedTimeframe.days <= 7 && !isMobile) {
      ctx.fillStyle = priceChange.percentage >= 0 ? "#2ECC40" : "#FF4136";
      for (let i = 0; i < filteredData.length; i++) {
        const x = startX + i * (chartWidth / (filteredData.length - 1));
        const y =
          startY +
          chartHeight -
          ((filteredData[i].price - minPrice) / (maxPrice - minPrice)) *
            chartHeight;

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [priceData, selectedTimeframe, priceChange, dimensions]);

  // Update dimensions
  const updateDimensions = useCallback(() => {
    if (chartContainerRef.current) {
      const { width } = chartContainerRef.current.getBoundingClientRect();
      const height = Math.min(400, Math.max(250, width * 0.5));
      setDimensions({ width, height });
    }
  }, []);

  useEffect(() => {
    window.addEventListener("resize", updateDimensions);
    updateDimensions();
    return () => window.removeEventListener("resize", updateDimensions);
  }, [updateDimensions]);

  useEffect(() => {
    drawChart();
  }, [drawChart, dimensions]);

  return (
    <section className="py-12 sm:py-16 md:py-20 bg-gradient-to-b">
      <div className="budju-container px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8 md:mb-12"
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 md:mb-4">
            <span className="text-budju-blue">PRICE</span>{" "}
            <span className="text-white">CHART</span>
          </h2>
          <p className="text-base sm:text-lg text-gray-300 max-w-3xl mx-auto">
            Track BUDJU's price performance over time
          </p>
        </motion.div>

        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="budju-card p-3 sm:p-4 md:p-6"
          >
            {loading && (
              <div className="text-center text-gray-400 mb-4">
                Loading chart data...
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6">
              <div>
                <div className="text-sm sm:text-base text-gray-400 mb-1">
                  Current Price
                </div>
                <div className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
                  ${currentPrice.toFixed(8)}
                </div>
                <div
                  className={`text-xs sm:text-sm mt-1 ${priceChange.percentage >= 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {priceChange.percentage >= 0 ? "↑" : "↓"} $
                  {Math.abs(priceChange.value).toFixed(8)} (
                  {priceChange.percentage.toFixed(2)}%)
                  <span className="text-gray-400 ml-2">
                    {selectedTimeframe.label}
                  </span>
                </div>
              </div>

              <div className="flex mt-3 sm:mt-0">
                {timeframes.map((tf) => (
                  <button
                    key={tf.label}
                    className={`px-2 sm:px-3 md:px-4 py-1 sm:py-2 rounded-lg mx-1 text-xs sm:text-sm transition-colors ${
                      selectedTimeframe.label === tf.label
                        ? "bg-budju-blue/20 text-budju-blue"
                        : "text-gray-400 hover:bg-gray-800"
                    }`}
                    onClick={() => setSelectedTimeframe(tf)}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={chartContainerRef}
              className="relative w-full my-2 md:my-4"
            >
              <canvas
                ref={chartRef}
                className="w-full"
                style={{ height: `${dimensions.height}px` }}
              />
            </div>
            <div className="mt-3 sm:mt-4 text-center text-gray-500 text-xs sm:text-sm">
              * Historical price data sourced from Birdeye API
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default PriceChart;
