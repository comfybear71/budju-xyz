import { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import Button from "@components/common/Button";
import { DEX_LINK } from "@constants/addresses";

// Dummy price data for the chart
// In a real application, this would come from a blockchain API
const generateDummyPriceData = () => {
  const today = new Date();
  const data = [];
  let price = 0.00015; // Starting price

  // Generate 30 days of price data
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(today.getDate() - i);

    // Add some randomness to the price
    // More likely to go up than down to simulate a generally positive trend
    const changePercent = Math.random() * 10 - 3; // -3% to +7% daily change
    price = price * (1 + changePercent / 100);

    data.push({
      date: date.toISOString().split("T")[0],
      price: price,
      volume: Math.floor(Math.random() * 50000) + 10000,
    });
  }

  return data;
};

const timeframes = [
  { label: "1D", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "ALL", days: 30 }, // Using our full dataset for the 'ALL' option
];

const PriceChart = () => {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [priceData] = useState(generateDummyPriceData());
  const [selectedTimeframe, setSelectedTimeframe] = useState(timeframes[2]); // Default to 30D
  const [priceChange, setPriceChange] = useState({ value: 0, percentage: 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Calculate price change for selected timeframe
  useEffect(() => {
    if (priceData.length === 0) return;

    const currentPrice = priceData[priceData.length - 1].price;
    const startIndex = Math.max(0, priceData.length - selectedTimeframe.days);
    const startPrice = priceData[startIndex].price;

    const change = currentPrice - startPrice;
    const percentChange = (change / startPrice) * 100;

    setPriceChange({
      value: change,
      percentage: percentChange,
    });
  }, [priceData, selectedTimeframe]);

  // Draw the price chart - extracted as a callback to prevent recreating on every render
  const drawChart = useCallback(() => {
    if (!chartRef.current || priceData.length === 0 || dimensions.width === 0)
      return;

    const canvas = chartRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions based on device pixel ratio for sharper rendering
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * pixelRatio;
    canvas.height = dimensions.height * pixelRatio;

    // Scale all drawing operations by the device pixel ratio
    ctx.scale(pixelRatio, pixelRatio);

    // Set the CSS size
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;

    // Clear the canvas
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    // Filter data based on selected timeframe
    const startIndex = Math.max(0, priceData.length - selectedTimeframe.days);
    const filteredData = priceData.slice(startIndex);

    // Find min and max price for scaling
    let minPrice = Math.min(...filteredData.map((d) => d.price));
    let maxPrice = Math.max(...filteredData.map((d) => d.price));

    // Add some padding
    const padding = (maxPrice - minPrice) * 0.1;
    minPrice -= padding;
    maxPrice += padding;

    // Determine chart dimensions based on screen size
    // Increase left padding for price labels on smaller screens
    const isMobile = dimensions.width < 480;
    const isTablet = dimensions.width >= 480 && dimensions.width < 768;

    const leftPadding = isMobile ? 60 : 50;
    const rightPadding = 10;
    const topPadding = 20;
    const bottomPadding = 30;

    // Set chart dimensions
    const chartWidth = dimensions.width - leftPadding - rightPadding;
    const chartHeight = dimensions.height - topPadding - bottomPadding;
    const startX = leftPadding;
    const startY = topPadding;

    // Draw axes
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;

    // Y-axis
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX, startY + chartHeight);
    ctx.stroke();

    // X-axis
    ctx.beginPath();
    ctx.moveTo(startX, startY + chartHeight);
    ctx.lineTo(startX + chartWidth, startY + chartHeight);
    ctx.stroke();

    // Draw price labels (y-axis)
    ctx.fillStyle = "#aaa";
    // Adjust font size based on screen size
    ctx.font = isMobile ? "10px Arial" : "12px Arial";
    ctx.textAlign = "right";

    // Determine number of y-axis labels based on screen height
    const yLabelCount = isMobile ? 3 : isTablet ? 4 : 5;

    for (let i = 0; i <= yLabelCount; i++) {
      const y = startY + chartHeight - i * (chartHeight / yLabelCount);
      const price = minPrice + i * ((maxPrice - minPrice) / yLabelCount);

      // Format price based on its value for better readability
      let priceText;
      if (price < 0.0001) {
        priceText = price.toExponential(2);
      } else {
        priceText = price.toFixed(8);
      }

      ctx.fillText(priceText, startX - 5, y + 4);

      // Grid line
      ctx.strokeStyle = "#333";
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(startX + chartWidth, y);
      ctx.stroke();
    }

    // Draw date labels (x-axis)
    ctx.textAlign = "center";

    // Determine label frequency based on timeframe and screen width
    let labelStep;
    if (isMobile) {
      labelStep = Math.max(1, Math.floor(filteredData.length / 3));
    } else if (isTablet) {
      labelStep = Math.max(1, Math.floor(filteredData.length / 4));
    } else {
      labelStep = Math.max(1, Math.floor(filteredData.length / 5));
    }

    for (let i = 0; i < filteredData.length; i += labelStep) {
      const x = startX + i * (chartWidth / (filteredData.length - 1));
      const date = new Date(filteredData[i].date);

      // Format date label based on timeframe
      let label;
      if (selectedTimeframe.days <= 1) {
        // For 1D, show hours
        label = date.getHours() + ":00";
      } else {
        // For longer timeframes, show date
        label = date.getDate() + "/" + (date.getMonth() + 1);
      }

      ctx.fillText(label, x, startY + chartHeight + 20);

      // Grid line
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

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
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

  // Update dimensions whenever container size changes
  const updateDimensions = useCallback(() => {
    if (chartContainerRef.current) {
      const { width } = chartContainerRef.current.getBoundingClientRect();
      // Calculate height based on aspect ratio (responsive)
      const height = Math.min(400, Math.max(250, width * 0.5)); // Min height 250px, Max height 400px

      setDimensions({ width, height });
    }
  }, []);

  // Handle window resize to make the chart responsive
  useEffect(() => {
    window.addEventListener("resize", updateDimensions);
    // Initial setup
    updateDimensions();

    return () => window.removeEventListener("resize", updateDimensions);
  }, [updateDimensions]);

  // Update chart when dimensions or data changes
  useEffect(() => {
    drawChart();
  }, [drawChart, dimensions]);

  // Get the most recent price
  const currentPrice =
    priceData.length > 0 ? priceData[priceData.length - 1].price : 0;

  return (
    <section className="py-12 sm:py-16 md:py-20 bg-gradient-to-b from-gray-900 to-budju-black">
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
            {/* Price Header */}
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

              {/* Timeframe Selector */}
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

            {/* Chart Canvas Container - Controls aspect ratio */}
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

            {/* Action Buttons */}
            <div className="mt-4 sm:mt-6 md:mt-8 flex flex-col xs:flex-row justify-center space-y-3 xs:space-y-0 xs:space-x-4 sm:space-x-6">
              <Button
                as="a"
                href={DEX_LINK}
                target="_blank"
                rel="noopener noreferrer"
                size="lg"
                className="text-sm sm:text-base py-2 sm:py-3 px-4 sm:px-6 w-full xs:w-auto"
              >
                Buy BUDJU
              </Button>

              <Button
                as="a"
                href="https://dexscreener.com/solana/6pmhvxg7a3wcekbpgjgmvivbg1nufsz9na7caqsjxmez"
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                size="lg"
                className="text-sm sm:text-base py-2 sm:py-3 px-4 sm:px-6 w-full xs:w-auto"
              >
                View on DexScreener
              </Button>
            </div>

            <div className="mt-3 sm:mt-4 text-center text-gray-500 text-xs sm:text-sm">
              * Chart data is for demonstration purposes. Live price data is
              displayed at the top of the chart.
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default PriceChart;
