import { useRef, useState, useEffect } from "react";
import { Link } from "react-router";
import { useTheme } from "@/context/ThemeContext";
import { ROUTES } from "@/constants/routes";
import { motion } from "framer-motion";
import {
  fetchHeliusTokenMetrics,
  TOKEN_ADDRESS,
} from "@/lib/utils/tokenService";

interface LiveMetrics {
  price: number;
  marketCap: number;
  volume24h: number;
  holders: number;
}

const Hero = () => {
  const { isDarkMode } = useTheme();
  const heroRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        const data = await fetchHeliusTokenMetrics();
        setMetrics({
          price: data.price,
          marketCap: data.marketCap,
          volume24h: data.volume24h,
          holders: data.holders,
        });
      } catch {
        // Fallback handled by null state
      }
    };
    loadMetrics();
    const interval = setInterval(loadMetrics, 60000);
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (p: number) => {
    if (p < 0.01) return `$${p.toFixed(8)}`;
    if (p < 1) return `$${p.toFixed(4)}`;
    return `$${p.toFixed(2)}`;
  };

  const formatCompact = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };

  return (
    <div
      ref={heroRef}
      className="relative min-h-[95vh] flex items-center pt-20 pb-12 px-4"
    >
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
        {/* Left Column — Text Content */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="z-10 flex flex-col items-center lg:items-start text-center lg:text-left order-2 lg:order-1"
        >
          {/* Bot Status Badge */}
          <div
            className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-sm font-semibold mb-8 ${
              isDarkMode
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30"
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Bot Active on Solana
          </div>

          {/* Heading */}
          <h1
            className={`font-display text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black leading-[1.1] mb-6 tracking-tight ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            The BUDJU{" "}
            <span className="bg-gradient-to-r from-cyan-400 via-budju-blue to-budju-pink bg-clip-text text-transparent">
              Trading Bot
            </span>
          </h1>

          {/* Subtitle */}
          <p
            className={`text-lg md:text-xl mb-10 max-w-lg leading-relaxed font-medium ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            Automated trading, real-time analytics, and a complete DeFi
            ecosystem — all built on Solana. The bot that works while you sleep.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mb-12">
            <Link
              to={ROUTES.SWAP}
              className="hero-btn-primary text-center text-base font-bold px-10 py-4 rounded-xl"
            >
              Launch Trading Bot
            </Link>
            <a
              href="#ecosystem"
              className={`hero-btn-secondary text-center text-base font-bold px-10 py-4 rounded-xl ${
                !isDarkMode
                  ? "text-gray-900 border-gray-300 hover:border-gray-900"
                  : ""
              }`}
            >
              Explore Ecosystem
            </a>
          </div>

          {/* Live Metrics Bar */}
          <div
            className={`w-full max-w-lg rounded-2xl p-[1px] ${
              isDarkMode
                ? "bg-gradient-to-r from-cyan-500/30 via-budju-blue/20 to-budju-pink/30"
                : "bg-gradient-to-r from-cyan-500/20 via-budju-blue/15 to-budju-pink/20"
            }`}
          >
            <div
              className={`rounded-2xl px-5 py-4 ${
                isDarkMode ? "bg-[#0a0a1f]/90" : "bg-white/80"
              } backdrop-blur-sm`}
            >
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p
                    className={`text-[10px] uppercase tracking-widest font-semibold mb-1 ${
                      isDarkMode ? "text-cyan-400/70" : "text-cyan-600/70"
                    }`}
                  >
                    Price
                  </p>
                  <p
                    className={`text-sm md:text-base font-bold font-mono ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {metrics ? formatPrice(metrics.price) : "—"}
                  </p>
                </div>
                <div>
                  <p
                    className={`text-[10px] uppercase tracking-widest font-semibold mb-1 ${
                      isDarkMode ? "text-cyan-400/70" : "text-cyan-600/70"
                    }`}
                  >
                    Mkt Cap
                  </p>
                  <p
                    className={`text-sm md:text-base font-bold font-mono ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {metrics ? formatCompact(metrics.marketCap) : "—"}
                  </p>
                </div>
                <div>
                  <p
                    className={`text-[10px] uppercase tracking-widest font-semibold mb-1 ${
                      isDarkMode ? "text-cyan-400/70" : "text-cyan-600/70"
                    }`}
                  >
                    Holders
                  </p>
                  <p
                    className={`text-sm md:text-base font-bold font-mono ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {metrics ? metrics.holders.toLocaleString() : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right Column — Bot Terminal Visual */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
          className="z-10 flex flex-col items-center justify-center order-1 lg:order-2 relative"
        >
          {/* Glow effect behind the terminal */}
          <div
            className="absolute w-[500px] h-[500px] rounded-full"
            style={{
              background: isDarkMode
                ? "radial-gradient(circle, rgba(6,182,212,0.12) 0%, rgba(255,105,180,0.08) 40%, transparent 70%)"
                : "radial-gradient(circle, rgba(6,182,212,0.08) 0%, rgba(255,105,180,0.05) 40%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />

          {/* Trading Terminal Card */}
          <div
            className={`relative w-full max-w-md rounded-2xl overflow-hidden ${
              isDarkMode
                ? "bg-[#0c0c20]/80 border border-white/[0.06]"
                : "bg-white/70 border border-gray-200/60"
            } backdrop-blur-xl shadow-2xl`}
          >
            {/* Terminal Header */}
            <div
              className={`flex items-center justify-between px-5 py-3 border-b ${
                isDarkMode ? "border-white/[0.06]" : "border-gray-200/60"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                </div>
                <span
                  className={`text-xs font-mono ml-2 ${
                    isDarkMode ? "text-gray-500" : "text-gray-400"
                  }`}
                >
                  budju-bot v2.1
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                <span
                  className={`text-[10px] font-mono ${
                    isDarkMode ? "text-emerald-400" : "text-emerald-600"
                  }`}
                >
                  LIVE
                </span>
              </div>
            </div>

            {/* Terminal Body */}
            <div className="p-5 space-y-4">
              {/* Mascot + Branding */}
              <div className="flex items-center gap-4 mb-2">
                <div className="relative">
                  <div className="animate-float">
                    <img
                      src="/images/budju.png"
                      alt="BUDJU Bot"
                      className="w-16 h-16 rounded-xl"
                    />
                  </div>
                </div>
                <div>
                  <h3
                    className={`font-display font-bold text-lg ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    BUDJU Bot
                  </h3>
                  <p
                    className={`text-xs font-mono ${
                      isDarkMode ? "text-cyan-400/80" : "text-cyan-600/80"
                    }`}
                  >
                    Solana DeFi Ecosystem
                  </p>
                </div>
              </div>

              {/* Simulated Trading Activity */}
              <div className="space-y-2">
                <TerminalLine
                  isDarkMode={isDarkMode}
                  label="STATUS"
                  value="Monitoring SOL/BUDJU pair"
                  color="emerald"
                  delay={0}
                />
                <TerminalLine
                  isDarkMode={isDarkMode}
                  label="POOL"
                  value="Raydium V4 — Active"
                  color="cyan"
                  delay={0.3}
                />
                <TerminalLine
                  isDarkMode={isDarkMode}
                  label="SIGNAL"
                  value="Buy zone detected"
                  color="emerald"
                  delay={0.6}
                />
                <TerminalLine
                  isDarkMode={isDarkMode}
                  label="NETWORK"
                  value="Solana Mainnet — 400ms"
                  color="blue"
                  delay={0.9}
                />
              </div>

              {/* Token Address */}
              <div
                className={`mt-3 rounded-lg px-3 py-2 font-mono text-[10px] ${
                  isDarkMode
                    ? "bg-white/[0.03] text-gray-500"
                    : "bg-gray-100/60 text-gray-400"
                }`}
              >
                <span
                  className={`${isDarkMode ? "text-cyan-400/60" : "text-cyan-600/60"}`}
                >
                  CA:
                </span>{" "}
                {TOKEN_ADDRESS.slice(0, 20)}...{TOKEN_ADDRESS.slice(-8)}
              </div>
            </div>
          </div>

          {/* Script Logo underneath */}
          <div className="relative mt-6">
            <img
              src={
                isDarkMode
                  ? "/images/title_budju_pink.png"
                  : "/images/title_budju_white.png"
              }
              alt="BUDJU"
              className="w-full max-w-[200px] mx-auto opacity-60"
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

/* Terminal Line Component */
const TerminalLine = ({
  isDarkMode,
  label,
  value,
  color,
  delay,
}: {
  isDarkMode: boolean;
  label: string;
  value: string;
  color: "emerald" | "cyan" | "blue" | "pink";
  delay: number;
}) => {
  const colorMap = {
    emerald: isDarkMode ? "text-emerald-400" : "text-emerald-600",
    cyan: isDarkMode ? "text-cyan-400" : "text-cyan-600",
    blue: isDarkMode ? "text-blue-400" : "text-blue-600",
    pink: isDarkMode ? "text-budju-pink" : "text-budju-pink-dark",
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.5 + delay }}
      className={`flex items-center gap-2 font-mono text-xs ${
        isDarkMode ? "text-gray-400" : "text-gray-500"
      }`}
    >
      <span
        className={`${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
      >
        &gt;
      </span>
      <span className={`${colorMap[color]} font-semibold uppercase text-[10px] tracking-wide min-w-[52px]`}>
        {label}
      </span>
      <span>{value}</span>
    </motion.div>
  );
};

export default Hero;
