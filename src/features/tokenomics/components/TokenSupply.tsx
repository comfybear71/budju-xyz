import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import {
  fetchHeliusTokenMetrics,
  TOKEN_ADDRESS,
  BURN_ADDRESS,
} from "@/lib/utils/tokenService";

gsap.registerPlugin();

interface TokenAllocation {
  name: string;
  percentage: number;
  color: string;
  value: number;
}

const TokenSupply = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [tokenAllocation, setTokenAllocation] = useState<TokenAllocation[]>([]);
  const [totalSupply, setTotalSupply] = useState<number>(0);
  const [burnedTokens, setBurnedTokens] = useState<number>(0);
  const [raydiumVault, setRaydiumVault] = useState<number>(0);
  const [bankOfBudju, setBankOfBudju] = useState<number>(0);
  const [communityVault, setcommunityVault] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchTokenSupplyData = async () => {
    try {
      setLoading(true);
      const metrics = await fetchHeliusTokenMetrics(
        TOKEN_ADDRESS,
        BURN_ADDRESS,
      );
      console.log("Fetched token metrics for supply:", metrics);

      const totalSupply = metrics.totalSupply;
      const burned = metrics.burned;
      const raydiumVault = metrics.raydiumVault;
      const bankOfBudju = metrics.bankOfBudju;
      const communityVault = metrics.communityVault;
      const circulatingSupply =
        totalSupply - burned - raydiumVault - bankOfBudju - communityVault;

      const realAllocation: TokenAllocation[] = [
        {
          name: "Circ. Supply",
          percentage: (circulatingSupply / totalSupply) * 100,
          color: "#87CEFA", // Light blue
          value: circulatingSupply,
        },
        {
          name: "Burned Tokens",
          percentage: (burned / totalSupply) * 100,
          color: "#FF4136", // Red
          value: burned,
        },
        {
          name: "Raydium Vault",
          percentage: (raydiumVault / totalSupply) * 100,
          color: "#2ECC40", // Green
          value: raydiumVault,
        },
        {
          name: "Bank of BUDJU",
          percentage: (bankOfBudju / totalSupply) * 100,
          color: "#FF851B", // Orange
          value: bankOfBudju,
        },
        {
          name: "Pool of BUDJU",
          percentage: (communityVault / totalSupply) * 100,
          color: "#FF69B4", // Hot Pink
          value: communityVault,
        },
      ].filter((item) => item.value > 0); // Filter out zero-value categories

      setTokenAllocation(realAllocation);
      setTotalSupply(totalSupply);
      setBurnedTokens(burned);
      setRaydiumVault(raydiumVault);
      setBankOfBudju(bankOfBudju);
      setcommunityVault(communityVault);
    } catch (error) {
      console.error("Error fetching token supply data:", error);
      setTokenAllocation([
        {
          name: "Circ. Supply",
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
        {
          name: "Bank of BUDJU",
          percentage: 0.06,
          color: "#FF851B",
          value: 600_000,
        },
        {
          name: "Pool of BUDJU",
          percentage: 0.06,
          color: "#FF69B4",
          value: 600_000,
        },
      ]);
      setTotalSupply(1_000_000_000);
      setBurnedTokens(15_600_000);
      setRaydiumVault(89_400_000);
      setBankOfBudju(600_000);
      setcommunityVault(600_000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokenSupplyData();
    const interval = setInterval(fetchTokenSupplyData, 300000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (chartRef.current && !loading && tokenAllocation.length > 0) {
      chartRef.current.innerHTML = "";

      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.setAttribute("viewBox", "0 0 100 100");
      chartRef.current.appendChild(svg);

      const center = { x: 50, y: 50 };
      const radius = 40;
      let cumulativeAngle = 0;

      tokenAllocation.forEach((segment) => {
        const startAngle = cumulativeAngle;
        const angle = (segment.percentage / 100) * 360;
        cumulativeAngle += angle;
        const endAngle = cumulativeAngle;

        const startRad = (startAngle - 90) * (Math.PI / 180);
        const endRad = (endAngle - 90) * (Math.PI / 180);

        const x1 = center.x + radius * Math.cos(startRad);
        const y1 = center.y + radius * Math.sin(startRad);
        const x2 = center.x + radius * Math.cos(endRad);
        const y2 = center.y + radius * Math.sin(endRad);

        const largeArc = angle > 180 ? 1 : 0;

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

        path.setAttribute("data-name", segment.name);
        path.setAttribute("data-percentage", segment.percentage.toFixed(2));

        gsap.fromTo(
          path,
          { scale: 0, transformOrigin: "center" },
          {
            scale: 1,
            duration: 0.8,
            ease: "back.out(1.7)",
            delay: tokenAllocation.indexOf(segment) * 0.1 + 0.2,
          },
        );

        svg.appendChild(path);
      });

      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("cx", center.x.toString());
      circle.setAttribute("cy", center.y.toString());
      circle.setAttribute("r", "25");
      circle.setAttribute("fill", "#1f2937");
      circle.setAttribute("stroke", "#121212");
      circle.setAttribute("stroke-width", "0.5");
      svg.appendChild(circle);

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
  }, [tokenAllocation, loading]);

  const remainingSupply =
    totalSupply - burnedTokens - raydiumVault - bankOfBudju - communityVault;

  return (
    <section ref={sectionRef} className="py-20 bg-gradient-to-b">
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

        {loading && (
          <div className="text-center text-gray-400 mb-6">
            Loading supply data...
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="aspect-square max-w-md mx-auto"
          >
            <div ref={chartRef} className="w-full h-full"></div>
          </motion.div>

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
                        {item.percentage.toFixed(2)}%
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
                    {totalSupply.toLocaleString()} BUDJU
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-300">Burned Tokens:</span>
                  <span className="text-red-400 font-medium">
                    {burnedTokens.toLocaleString()} BUDJU
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-300">Raydium Vault:</span>
                  <span className="text-green-400 font-medium">
                    {raydiumVault.toLocaleString()} BUDJU
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-300">Bank of BUDJU:</span>
                  <span className="text-orange-400 font-medium">
                    {bankOfBudju.toLocaleString()} BUDJU
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-300">Pool of BUDJU:</span>
                  <span className="text-pink-400 font-medium">
                    {communityVault.toLocaleString()} BUDJU
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Circ. Supply:</span>
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
