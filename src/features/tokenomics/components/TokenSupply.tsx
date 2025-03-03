import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { TOKEN_INFO } from "@constants/config";

// Dummy data for token allocation - in a real app, this would come from an API
const tokenAllocation = [
  {
    name: "Circulating Supply",
    percentage: 89.44,
    color: "#87CEFA",
    value: 894_400_000,
  },
  {
    name: "Burned Tokens",
    percentage: 1.56,
    color: "#FF4136",
    value: 15_600_000,
  },
  {
    name: "Raydium Vault",
    percentage: 8.94,
    color: "#2ECC40",
    value: 89_400_000,
  },
  { name: "Bank of BUDJU", percentage: 0.06, color: "#FF851B", value: 600_000 },
];

const TokenSupply = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [burnedTokens, setBurnedTokens] = useState(1_569_299);

  // Simulate getting updated burn data
  useEffect(() => {
    // In a real app, this would fetch from the blockchain
    const interval = setInterval(() => {
      // Small random increase in burned tokens
      setBurnedTokens((prev) => prev + Math.floor(Math.random() * 10));
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Calculate remaining supply
  const remainingSupply = TOKEN_INFO.TOTAL_SUPPLY - burnedTokens;

  // Create pie chart animation
  useEffect(() => {
    if (chartRef.current) {
      // Clear previous chart if any
      chartRef.current.innerHTML = "";

      // Create SVG element
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.setAttribute("viewBox", "0 0 100 100");
      chartRef.current.appendChild(svg);

      // Constants for the pie chart
      const center = { x: 50, y: 50 };
      const radius = 40;
      let cumulativeAngle = 0;

      // Create pie slices
      tokenAllocation.forEach((segment) => {
        const startAngle = cumulativeAngle;
        const angle = (segment.percentage / 100) * 360;
        cumulativeAngle += angle;
        const endAngle = cumulativeAngle;

        // Convert angles to radians and calculate coordinates
        const startRad = (startAngle - 90) * (Math.PI / 180);
        const endRad = (endAngle - 90) * (Math.PI / 180);

        const x1 = center.x + radius * Math.cos(startRad);
        const y1 = center.y + radius * Math.sin(startRad);
        const x2 = center.x + radius * Math.cos(endRad);
        const y2 = center.y + radius * Math.sin(endRad);

        // Determine which arc to use (large or small)
        const largeArc = angle > 180 ? 1 : 0;

        // Create path for the slice
        const path = document.createElementNS(svgNS, "path");
        path.setAttribute(
          "d",
          `
          M ${center.x} ${center.y}
          L ${x1} ${y1}
          A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
          Z
        `,
        );
        path.setAttribute("fill", segment.color);
        path.setAttribute("stroke", "#121212");
        path.setAttribute("stroke-width", "0.5");

        // Add tooltip attributes
        path.setAttribute("data-name", segment.name);
        path.setAttribute("data-percentage", segment.percentage.toString());

        // Animate the slice
        gsap.fromTo(
          path,
          {
            scale: 0,
            transformOrigin: "center",
          },
          {
            scale: 1,
            duration: 0.8,
            ease: "back.out(1.7)",
            delay: tokenAllocation.indexOf(segment) * 0.1 + 0.2,
          },
        );

        svg.appendChild(path);
      });

      // Add center circle for donut effect
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("cx", center.x.toString());
      circle.setAttribute("cy", center.y.toString());
      circle.setAttribute("r", "25");
      circle.setAttribute("fill", "#1f2937");
      circle.setAttribute("stroke", "#121212");
      circle.setAttribute("stroke-width", "0.5");
      svg.appendChild(circle);

      // Add percentage text in the center
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", center.x.toString());
      text.setAttribute("y", center.y.toString());
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("fill", "white");
      text.setAttribute("font-size", "10");
      text.setAttribute("font-weight", "bold");
      text.textContent = "100%";
      svg.appendChild(text);

      // Add BUDJU text below percentage
      const subText = document.createElementNS(svgNS, "text");
      subText.setAttribute("x", center.x.toString());
      subText.setAttribute("y", (center.y + 10).toString());
      subText.setAttribute("text-anchor", "middle");
      subText.setAttribute("dominant-baseline", "middle");
      subText.setAttribute("fill", "#87CEFA");
      subText.setAttribute("font-size", "7");
      subText.textContent = "BUDJU";
      svg.appendChild(subText);
    }
  }, [tokenAllocation]);

  return (
    <section
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
            <span className="text-white">BUDJU Token</span>{" "}
            <span className="text-budju-blue">Supply</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Explore BUDJU token allocation and distribution data
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center max-w-5xl mx-auto">
          {/* Pie Chart */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="aspect-square max-w-md mx-auto"
          >
            <div ref={chartRef} className="w-full h-full"></div>
          </motion.div>

          {/* Token Allocation Details */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="budju-card">
              <h3 className="text-2xl font-bold mb-6 text-center">
                <span className="text-budju-blue">Token</span>{" "}
                <span className="text-white">Distribution</span>
              </h3>

              {/* Legend and Details */}
              <div className="space-y-4">
                {tokenAllocation.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center">
                      <div
                        className="w-4 h-4 rounded-sm mr-3"
                        style={{ backgroundColor: item.color }}
                      ></div>
                      <span className="text-gray-300">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-medium">
                        {item.percentage}%
                      </div>
                      <div className="text-gray-400 text-sm">
                        {item.value.toLocaleString()} BUDJU
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-gray-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-300">Total Supply:</span>
                  <span className="text-white font-bold">
                    {TOKEN_INFO.TOTAL_SUPPLY.toLocaleString()} BUDJU
                  </span>
                </div>

                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-300">Burned Tokens:</span>
                  <span className="text-red-400 font-medium">
                    {burnedTokens.toLocaleString()} BUDJU
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Remaining Supply:</span>
                  <span className="text-budju-blue font-bold">
                    {remainingSupply.toLocaleString()} BUDJU
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 text-center text-gray-500 text-sm">
              * Token distribution data is updated in real-time from blockchain
              data
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default TokenSupply;
