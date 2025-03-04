import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";

const RebalanceGuide = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<HTMLCanvasElement>(null);

  // Draw the rebalancing visualization
  useEffect(() => {
    if (!graphRef.current) return;

    const canvas = graphRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions with device pixel ratio for retina displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Make the canvas dimensions match the display size
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    // Animation timeline
    const timeline = gsap.timeline();

    // Drawing constants
    const padding = 40;
    const width = rect.width - padding * 2;
    const height = rect.height - padding * 2;
    const xAxis = height + padding;
    // const yAxis = padding;

    // Draw coordinate system
    const drawAxes = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background
      ctx.fillStyle = "#111111";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;

      // Vertical grid lines
      for (let x = padding; x <= width + padding; x += width / 10) {
        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, xAxis);
        ctx.stroke();
      }

      // Horizontal grid lines
      for (let y = padding; y <= xAxis; y += height / 8) {
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width + padding, y);
        ctx.stroke();
      }

      // Axes
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 2;

      // X-axis
      ctx.beginPath();
      ctx.moveTo(padding, xAxis);
      ctx.lineTo(width + padding, xAxis);
      ctx.stroke();

      // Y-axis
      ctx.beginPath();
      ctx.moveTo(padding, padding);
      ctx.lineTo(padding, xAxis);
      ctx.stroke();

      // X-axis label
      ctx.fillStyle = "#fff";
      ctx.font = "14px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Price", width / 2 + padding, xAxis + 25);

      // Y-axis label
      ctx.save();
      ctx.translate(15, height / 2 + padding);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("Liquidity", 0, 0);
      ctx.restore();
    };

    // Initial price line
    const drawPriceLine = (x: number) => {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, xAxis);
      ctx.stroke();

      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = "#fff";
      ctx.fillText("Current Price", x, padding - 10);
    };

    // Draw position range
    const drawPositionRange = (
      startX: number,
      endX: number,
      label: string,
      color: string | CanvasGradient | CanvasPattern,
    ) => {
      // Fill the position range
      ctx.fillStyle = color;
      ctx.fillRect(startX, padding, endX - startX, height);

      // Draw borders
      if (typeof color === "string") {
        ctx.strokeStyle = color.replace("0.2", "1");
      } else {
        ctx.strokeStyle = color;
      }
      ctx.lineWidth = 2;

      // Left border
      ctx.beginPath();
      ctx.moveTo(startX, padding);
      ctx.lineTo(startX, xAxis);
      ctx.stroke();

      // Right border
      ctx.beginPath();
      ctx.moveTo(endX, padding);
      ctx.lineTo(endX, xAxis);
      ctx.stroke();

      // Label
      ctx.fillStyle = "#fff";
      ctx.fillText(label, (startX + endX) / 2, padding + 20);
    };

    // Animate the rebalancing process
    timeline
      .add(() => {
        drawAxes();

        // Initial price line
        const initialPriceX = padding + width * 0.3;
        drawPriceLine(initialPriceX);

        // Initial position range (out of range)
        drawPositionRange(
          padding + width * 0.6,
          padding + width * 0.9,
          "Current Position",
          "rgba(255, 105, 180, 0.2)", // Pink
        );
      })

      // Move price line to show price moving out of range
      .to({}, 1, {
        onUpdate: function () {
          drawAxes();

          // Moving price line
          const progress = this.progress();
          const priceX = padding + width * (0.3 + progress * 0.4);
          drawPriceLine(priceX);

          // Position out of range
          drawPositionRange(
            padding + width * 0.6,
            padding + width * 0.9,
            "Current Position (Out of Range)",
            "rgba(255, 105, 180, 0.2)", // Pink
          );
        },
      })

      // Show rebalancing the position
      .to({}, 1, {
        onUpdate: function () {
          drawAxes();

          // Price line
          const priceX = padding + width * 0.7;
          drawPriceLine(priceX);

          // Old position fading out
          const progress = this.progress();
          const oldOpacity = 0.2 * (1 - progress);

          drawPositionRange(
            padding + width * 0.6,
            padding + width * 0.9,
            "Old Position",
            `rgba(255, 105, 180, ${oldOpacity})`, // Pink fading
          );

          // New position fading in
          const newOpacity = 0.2 * progress;

          drawPositionRange(
            padding + width * 0.5,
            padding + width * 0.8,
            "New Position",
            `rgba(135, 206, 250, ${newOpacity})`, // Blue appearing
          );
        },
      })

      // Show final rebalanced position
      .add(() => {
        drawAxes();

        // Final price line
        const priceX = padding + width * 0.7;
        drawPriceLine(priceX);

        // Rebalanced position (in range now)
        drawPositionRange(
          padding + width * 0.5,
          padding + width * 0.8,
          "Rebalanced Position (In Range)",
          "rgba(135, 206, 250, 0.2)", // Blue
        );
      });

    // Redraw on resize
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      timeline.restart();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <section
      id="rebalance"
      ref={sectionRef}
      className="py-20 bg-gradient-to-b from-gray-900 to-budju-black"
    >
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-white">Rebalancing Your</span>{" "}
            <span className="text-budju-blue">Position</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Maximize your earnings by maintaining active liquidity
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
          {/* Left Column: Rebalancing Visualization */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
          >
            <div className="budju-card p-4">
              <h3 className="text-xl font-bold text-white mb-4 text-center">
                Rebalancing Visualization
              </h3>
              <canvas ref={graphRef} className="w-full h-64"></canvas>
            </div>
          </motion.div>

          {/* Right Column: Text Content */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <h3 className="text-2xl font-bold mb-6 text-budju-blue">
              Why Rebalance Your Position?
            </h3>

            <div className="space-y-6">
              <div className="bg-gray-900/50 rounded-lg p-5 border border-gray-800">
                <h4 className="text-xl font-semibold text-white mb-3">
                  What is Rebalancing?
                </h4>
                <p className="text-gray-300">
                  Rebalancing is the process of adjusting your liquidity
                  position's price range to ensure it stays active as market
                  prices fluctuate. Since concentrated liquidity only earns fees
                  when the market price is within your chosen range, rebalancing
                  is essential for maximizing returns.
                </p>
              </div>

              <div className="bg-gray-900/50 rounded-lg p-5 border border-gray-800">
                <h4 className="text-xl font-semibold text-white mb-3">
                  When to Rebalance
                </h4>
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <span className="text-budju-blue mr-2 text-xl">•</span>
                    <div>
                      <span className="font-medium text-white">
                        Price Moves Out of Range
                      </span>
                      <p className="text-gray-400">
                        When BUDJU's price moves outside your position's range,
                        your liquidity becomes inactive and stops earning fees.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="text-budju-blue mr-2 text-xl">•</span>
                    <div>
                      <span className="font-medium text-white">
                        Market Trend Changes
                      </span>
                      <p className="text-gray-400">
                        If you notice a shift in BUDJU's price trend, adjust
                        your range to align with the new expected trading range.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="text-budju-blue mr-2 text-xl">•</span>
                    <div>
                      <span className="font-medium text-white">
                        Approaching Range Edge
                      </span>
                      <p className="text-gray-400">
                        Even if the price is still in range but approaching the
                        boundaries, consider rebalancing to prevent going out of
                        range.
                      </p>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="bg-budju-blue/10 rounded-lg p-5 border border-budju-blue/30">
                <h4 className="text-xl font-semibold text-white mb-3">
                  How to Rebalance
                </h4>
                <ol className="space-y-3">
                  <li className="flex">
                    <span className="text-budju-blue mr-3 font-bold">1.</span>
                    <p className="text-gray-300">
                      First, collect any accumulated fees from your current
                      position
                    </p>
                  </li>
                  <li className="flex">
                    <span className="text-budju-blue mr-3 font-bold">2.</span>
                    <p className="text-gray-300">
                      Remove part or all of your liquidity from the out-of-range
                      position
                    </p>
                  </li>
                  <li className="flex">
                    <span className="text-budju-blue mr-3 font-bold">3.</span>
                    <p className="text-gray-300">
                      Create a new position with a price range that includes the
                      current market price
                    </p>
                  </li>
                  <li className="flex">
                    <span className="text-budju-blue mr-3 font-bold">4.</span>
                    <p className="text-gray-300">
                      Consider setting new minimum and maximum prices based on
                      updated market analysis
                    </p>
                  </li>
                </ol>
              </div>

              <div className="bg-budju-pink/10 rounded-lg p-5 border border-budju-pink/30">
                <h4 className="text-xl font-semibold text-white mb-3">
                  Rebalancing Strategy for BUDJU
                </h4>
                <p className="text-gray-300">
                  Many successful BUDJU liquidity providers monitor the token's
                  price action daily and rebalance when necessary. Some create
                  multiple smaller positions with overlapping ranges instead of
                  one large position, making it easier to adjust to market
                  conditions.
                </p>
                <p className="text-gray-300 mt-3">
                  Remember that each rebalancing requires transaction fees, so
                  balance the frequency of rebalancing against the cost of
                  transactions.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default RebalanceGuide;
