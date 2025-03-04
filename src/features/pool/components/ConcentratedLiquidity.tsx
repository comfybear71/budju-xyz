import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";

const ConcentratedLiquidity = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw the concentrated liquidity visualization
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions with device pixel ratio for retina displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Draw coordinate system
    const padding = 40;
    const width = rect.width - padding * 2;
    const height = rect.height - padding * 2;
    const xAxis = height + padding;
    const yAxis = padding;

    // Animation timeline
    const timeline = gsap.timeline();

    // Draw axes
    const drawAxes = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 2;

      // X-axis
      ctx.beginPath();
      ctx.moveTo(padding, xAxis);
      ctx.lineTo(width + padding, xAxis);
      ctx.stroke();

      // Y-axis
      ctx.beginPath();
      ctx.moveTo(yAxis, padding);
      ctx.lineTo(yAxis, height + padding);
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

    // Draw traditional AMM curve
    const drawTraditionalCurve = () => {
      const x0 = padding;
      const y0 = xAxis;
      const xMax = width + padding;

      ctx.beginPath();
      ctx.moveTo(x0, y0);

      for (let x = x0; x <= xMax; x++) {
        // y = k/x where k is the constant product
        const k = 5000000;
        const relativeX = (x - x0) / width;
        const price = 50 + relativeX * 200;
        const liquidity = k / price;
        const normalizedLiquidity = Math.min(1, liquidity / 20000);
        const y = y0 - normalizedLiquidity * height;

        ctx.lineTo(x, y);
      }

      ctx.strokeStyle = "#87CEFA88"; // Light blue with transparency
      ctx.lineWidth = 3;
      ctx.stroke();

      // Label for traditional curve
      ctx.fillStyle = "#87CEFA";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "left";
      ctx.fillText("Traditional AMM", x0 + 20, y0 - height / 2);
    };

    // Draw concentrated liquidity visualization
    const drawConcentratedLiquidity = () => {
      // Center position ranges
      const rangeStart = padding + width * 0.3;
      const rangeEnd = padding + width * 0.7;

      // Draw background rectangle
      ctx.fillStyle = "#FF69B433"; // Pink with transparency
      ctx.fillRect(rangeStart, padding, rangeEnd - rangeStart, height);

      // Draw border
      ctx.strokeStyle = "#FF69B4";
      ctx.lineWidth = 2;
      ctx.strokeRect(rangeStart, padding, rangeEnd - rangeStart, height);

      // Draw liquidity distribution
      ctx.beginPath();
      ctx.moveTo(rangeStart, xAxis);

      // Left side of concentration (rising)
      for (let x = rangeStart; x <= (rangeStart + rangeEnd) / 2; x++) {
        const progress =
          (x - rangeStart) / ((rangeStart + rangeEnd) / 2 - rangeStart);
        const y = xAxis - height * 0.8 * progress;
        ctx.lineTo(x, y);
      }

      // Right side of concentration (falling)
      for (let x = (rangeStart + rangeEnd) / 2; x <= rangeEnd; x++) {
        const progress =
          (x - (rangeStart + rangeEnd) / 2) /
          (rangeEnd - (rangeStart + rangeEnd) / 2);
        const y = xAxis - height * 0.8 * (1 - progress);
        ctx.lineTo(x, y);
      }

      ctx.lineTo(rangeEnd, xAxis);
      ctx.closePath();

      ctx.fillStyle = "#FF69B480"; // Pink with more opacity
      ctx.fill();

      // Draw concentrated curve
      ctx.beginPath();
      ctx.moveTo(rangeStart, xAxis);

      // Left side of concentration (rising)
      for (let x = rangeStart; x <= (rangeStart + rangeEnd) / 2; x++) {
        const progress =
          (x - rangeStart) / ((rangeStart + rangeEnd) / 2 - rangeStart);
        const y = xAxis - height * 0.8 * progress;
        ctx.lineTo(x, y);
      }

      // Right side of concentration (falling)
      for (let x = (rangeStart + rangeEnd) / 2; x <= rangeEnd; x++) {
        const progress =
          (x - (rangeStart + rangeEnd) / 2) /
          (rangeEnd - (rangeStart + rangeEnd) / 2);
        const y = xAxis - height * 0.8 * (1 - progress);
        ctx.lineTo(x, y);
      }

      ctx.strokeStyle = "#FF69B4"; // Hot pink
      ctx.lineWidth = 4;
      ctx.stroke();

      // Label for concentrated liquidity
      ctx.fillStyle = "#FF69B4";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.fillText(
        "Concentrated Liquidity",
        (rangeStart + rangeEnd) / 2,
        padding + 20,
      );

      // Price range labels
      ctx.fillStyle = "#fff";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Min Price", rangeStart, xAxis + 15);
      ctx.fillText("Max Price", rangeEnd, xAxis + 15);
    };

    // Animate the visualization
    timeline
      .add(() => drawAxes())
      .add(() => drawTraditionalCurve(), "+=0.5")
      .add(() => drawConcentratedLiquidity(), "+=1");

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
      id="concentrated-liquidity"
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
            <span className="text-white">Concentrated</span>{" "}
            <span className="text-budju-pink">Liquidity</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Understanding the power of focused liquidity positions
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
          {/* Left Column: Visualization */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
          >
            <div className="budju-card p-4 aspect-video">
              <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{ width: "100%", height: "100%" }}
              ></canvas>
            </div>
          </motion.div>

          {/* Right Column: Text Explanation */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <h3 className="text-2xl font-bold mb-6 text-budju-pink">
              The Future of Liquidity Providing
            </h3>

            <div className="space-y-6">
              <div className="bg-gray-900/50 rounded-lg p-5 border border-gray-800">
                <h4 className="text-xl font-semibold text-white mb-3">
                  What is Concentrated Liquidity?
                </h4>
                <p className="text-gray-300">
                  Unlike traditional liquidity pools that spread funds across
                  the entire price range (0 to ∞), concentrated liquidity allows
                  you to focus your capital within a specific price range. This
                  dramatically increases capital efficiency and potential
                  returns.
                </p>
              </div>

              <div className="bg-gray-900/50 rounded-lg p-5 border border-gray-800">
                <h4 className="text-xl font-semibold text-white mb-3">
                  Benefits for BUDJU Liquidity Providers
                </h4>
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <span className="text-budju-pink mr-2 text-xl">•</span>
                    <div>
                      <span className="font-medium text-white">
                        Higher APRs
                      </span>
                      <p className="text-gray-400">
                        Earn significantly higher fees per unit of capital
                        compared to traditional pools.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="text-budju-pink mr-2 text-xl">•</span>
                    <div>
                      <span className="font-medium text-white">
                        Customization
                      </span>
                      <p className="text-gray-400">
                        Set your own price range based on your market outlook
                        for BUDJU.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="text-budju-pink mr-2 text-xl">•</span>
                    <div>
                      <span className="font-medium text-white">
                        Multiple Positions
                      </span>
                      <p className="text-gray-400">
                        Create multiple positions with different ranges to
                        optimize your strategy.
                      </p>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="bg-budju-pink/10 rounded-lg p-5 border border-budju-pink/30">
                <h4 className="text-xl font-semibold text-white mb-3">
                  Important Considerations
                </h4>
                <p className="text-gray-300 mb-3">
                  With concentrated liquidity, your position will only earn fees
                  when the market price is within your chosen range. Once the
                  price moves outside your range, your position becomes
                  inactive.
                </p>
                <p className="text-gray-300">
                  This is why monitoring and rebalancing your positions is
                  crucial for maximizing returns in concentrated liquidity
                  pools.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default ConcentratedLiquidity;
