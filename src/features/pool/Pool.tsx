import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { FaExternalLinkAlt, FaSwimmingPool } from "react-icons/fa";
import { APP_NAME } from "@constants/config";
import { POOL_SOL_BUDJU, POOL_USDC_BUDJU } from "@constants/addresses";
import CopyToClipboard from "@components/common/CopyToClipboard";
import { useTheme } from "@/context/ThemeContext";

/* ───────── Pool data ───────── */
interface PoolData {
  name: string;
  pair: string;
  address: string;
  url: string;
  tokenA: string;
  tokenB: string;
  colorA: string;
  colorB: string;
  feeRate: string;
  tvl: number;
  volume24h: number;
  fees24h: number;
  apr: number;
}

const POOLS: PoolData[] = [
  {
    name: "SOL-BUDJU",
    pair: "SOL / BUDJU",
    address: POOL_SOL_BUDJU,
    url: `https://raydium.io/clmm/create-position/?pool_id=${POOL_SOL_BUDJU}`,
    tokenA: "SOL",
    tokenB: "BUDJU",
    colorA: "bg-purple-600",
    colorB: "bg-budju-pink",
    feeRate: "0.25%",
    tvl: 162450,
    volume24h: 28750,
    fees24h: 71.87,
    apr: 24.8,
  },
  {
    name: "USDC-BUDJU",
    pair: "USDC / BUDJU",
    address: POOL_USDC_BUDJU,
    url: `https://raydium.io/clmm/create-position/?pool_id=${POOL_USDC_BUDJU}`,
    tokenA: "USDC",
    tokenB: "BUDJU",
    colorA: "bg-blue-500",
    colorB: "bg-budju-pink",
    feeRate: "0.25%",
    tvl: 85440,
    volume24h: 13406,
    fees24h: 33.52,
    apr: 18.6,
  },
];

/* ───────── Helpers ───────── */
const fmt = (n: number, decimals = 0) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/* ───────── Component ───────── */
const Pool = () => {
  const { isDarkMode } = useTheme();
  const [poolData, setPoolData] = useState(POOLS);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `Pool of ${APP_NAME} - Liquidity Pools`;
  }, []);

  // Simulate data refresh (replace with real API later)
  useEffect(() => {
    const refresh = () => {
      setPoolData(
        POOLS.map((p) => {
          const v = 0.98 + Math.random() * 0.04;
          return {
            ...p,
            tvl: Math.round(p.tvl * v),
            volume24h: Math.round(p.volume24h * v),
            fees24h: parseFloat((p.fees24h * v).toFixed(2)),
            apr: parseFloat((p.apr * v).toFixed(1)),
          };
        }),
      );
    };
    refresh();
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, []);

  const totalTVL = poolData.reduce((s, p) => s + p.tvl, 0);

  return (
    <main className="min-h-screen">
      {/* ── Header ── */}
      <section className="pt-24 pb-10 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center justify-center gap-3 mb-3">
              <FaSwimmingPool
                className={`w-6 h-6 ${isDarkMode ? "text-cyan-400" : "text-cyan-600"}`}
              />
              <h1
                className={`text-3xl md:text-4xl lg:text-5xl font-bold font-display ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                Liquidity{" "}
                <span className="bg-gradient-to-r from-cyan-400 via-budju-blue to-budju-pink bg-clip-text text-transparent">
                  Pools
                </span>
              </h1>
            </div>
            <p
              className={`text-sm max-w-xl mx-auto ${
                isDarkMode ? "text-gray-500" : "text-gray-500"
              }`}
            >
              Provide liquidity on Raydium CLMM and earn trading fees.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Total TVL ── */}
      <section className="px-4 pb-6">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            <span
              className={`text-[10px] uppercase tracking-[0.2em] font-bold ${
                isDarkMode ? "text-gray-600" : "text-gray-400"
              }`}
            >
              Total Value Locked
            </span>
            <p
              className={`text-2xl md:text-3xl font-bold font-mono mt-1 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {fmt(totalTVL)}
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Pool Table (desktop) / Cards (mobile) ── */}
      <section className="px-4 pb-16">
        <div className="max-w-5xl mx-auto">
          {/* Desktop table header */}
          <div
            className={`hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wider rounded-t-xl ${
              isDarkMode
                ? "bg-[#0c0c20]/80 text-gray-500 border border-white/[0.06]"
                : "bg-gray-50 text-gray-400 border border-gray-200/60"
            }`}
          >
            <span>Pool</span>
            <span className="text-right">TVL</span>
            <span className="text-right">Volume 24h</span>
            <span className="text-right">Fees 24h</span>
            <span className="text-right">APR</span>
            <span></span>
          </div>

          {poolData.map((pool, index) => (
            <motion.div
              key={pool.address}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + index * 0.1 }}
            >
              {/* ── Desktop row ── */}
              <div
                className={`hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 items-center px-5 py-4 border-x border-b transition-colors ${
                  isDarkMode
                    ? "bg-[#0c0c20]/40 border-white/[0.06] hover:bg-[#0c0c20]/70"
                    : "bg-white/60 border-gray-200/60 hover:bg-gray-50"
                } ${index === poolData.length - 1 ? "rounded-b-xl" : ""}`}
              >
                {/* Pair */}
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <div
                      className={`w-8 h-8 rounded-full ${pool.colorA} flex items-center justify-center z-10 text-[10px] font-bold text-white`}
                    >
                      {pool.tokenA}
                    </div>
                    <div
                      className={`w-8 h-8 rounded-full ${pool.colorB} flex items-center justify-center text-[10px] font-bold text-white`}
                    >
                      {pool.tokenB}
                    </div>
                  </div>
                  <div>
                    <span
                      className={`text-sm font-bold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {pool.pair}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          isDarkMode
                            ? "bg-cyan-500/10 text-cyan-400"
                            : "bg-cyan-50 text-cyan-700"
                        }`}
                      >
                        CLMM
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          isDarkMode
                            ? "bg-white/[0.05] text-gray-400"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {pool.feeRate}
                      </span>
                    </div>
                  </div>
                </div>

                {/* TVL */}
                <span
                  className={`text-sm font-mono font-medium text-right ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {fmt(pool.tvl)}
                </span>

                {/* Volume */}
                <span
                  className={`text-sm font-mono font-medium text-right ${
                    isDarkMode ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {fmt(pool.volume24h)}
                </span>

                {/* Fees */}
                <span className="text-sm font-mono font-medium text-right text-green-400">
                  {fmt(pool.fees24h, 2)}
                </span>

                {/* APR */}
                <span className="text-sm font-mono font-bold text-right text-budju-blue">
                  {pool.apr.toFixed(1)}%
                </span>

                {/* Action */}
                <a
                  href={pool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg transition-all ${
                    isDarkMode
                      ? "bg-gradient-to-r from-cyan-500/20 to-budju-blue/20 text-cyan-400 hover:from-cyan-500/30 hover:to-budju-blue/30 border border-cyan-500/20"
                      : "bg-gradient-to-r from-cyan-50 to-blue-50 text-cyan-700 hover:from-cyan-100 hover:to-blue-100 border border-cyan-200"
                  }`}
                >
                  Add Liquidity
                  <FaExternalLinkAlt className="w-2.5 h-2.5" />
                </a>
              </div>

              {/* ── Mobile card ── */}
              <div
                className={`md:hidden rounded-xl border p-5 mb-3 ${
                  isDarkMode
                    ? "bg-[#0c0c20]/60 border-white/[0.06]"
                    : "bg-white/60 border-gray-200/40"
                } backdrop-blur-sm`}
              >
                {/* Pair header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      <div
                        className={`w-9 h-9 rounded-full ${pool.colorA} flex items-center justify-center z-10 text-[10px] font-bold text-white`}
                      >
                        {pool.tokenA}
                      </div>
                      <div
                        className={`w-9 h-9 rounded-full ${pool.colorB} flex items-center justify-center text-[10px] font-bold text-white`}
                      >
                        {pool.tokenB}
                      </div>
                    </div>
                    <div>
                      <span
                        className={`text-base font-bold ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {pool.pair}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                            isDarkMode
                              ? "bg-cyan-500/10 text-cyan-400"
                              : "bg-cyan-50 text-cyan-700"
                          }`}
                        >
                          CLMM
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                            isDarkMode
                              ? "bg-white/[0.05] text-gray-400"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {pool.feeRate}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-lg font-mono font-bold text-budju-blue">
                    {pool.apr.toFixed(1)}%
                    <span
                      className={`block text-[9px] font-sans font-normal text-right ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      APR
                    </span>
                  </span>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div>
                    <span
                      className={`text-[10px] uppercase tracking-wider ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      TVL
                    </span>
                    <p
                      className={`text-sm font-mono font-medium ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {fmt(pool.tvl)}
                    </p>
                  </div>
                  <div>
                    <span
                      className={`text-[10px] uppercase tracking-wider ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      Vol 24h
                    </span>
                    <p
                      className={`text-sm font-mono font-medium ${
                        isDarkMode ? "text-gray-300" : "text-gray-700"
                      }`}
                    >
                      {fmt(pool.volume24h)}
                    </p>
                  </div>
                  <div>
                    <span
                      className={`text-[10px] uppercase tracking-wider ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      Fees 24h
                    </span>
                    <p className="text-sm font-mono font-medium text-green-400">
                      {fmt(pool.fees24h, 2)}
                    </p>
                  </div>
                </div>

                {/* Pool address */}
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 ${
                    isDarkMode ? "bg-white/[0.03]" : "bg-gray-50"
                  }`}
                >
                  <code
                    className={`text-[10px] font-mono truncate flex-1 ${
                      isDarkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    {pool.address}
                  </code>
                  <CopyToClipboard
                    text={pool.address}
                    iconSize={12}
                    showPopup={false}
                  />
                </div>

                {/* CTA */}
                <a
                  href={pool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center justify-center gap-2 w-full text-sm font-bold py-3 rounded-xl transition-all ${
                    isDarkMode
                      ? "bg-gradient-to-r from-cyan-500/20 to-budju-blue/20 text-cyan-400 hover:from-cyan-500/30 hover:to-budju-blue/30 border border-cyan-500/20"
                      : "bg-gradient-to-r from-cyan-50 to-blue-50 text-cyan-700 hover:from-cyan-100 hover:to-blue-100 border border-cyan-200"
                  }`}
                >
                  Add Liquidity on Raydium
                  <FaExternalLinkAlt className="w-3 h-3" />
                </a>
              </div>
            </motion.div>
          ))}

          {/* Pool addresses - desktop */}
          <div className="hidden md:block mt-6 space-y-2">
            {poolData.map((pool) => (
              <div
                key={pool.address}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg ${
                  isDarkMode ? "bg-white/[0.02]" : "bg-gray-50/50"
                }`}
              >
                <span
                  className={`text-xs font-medium w-28 ${
                    isDarkMode ? "text-gray-500" : "text-gray-400"
                  }`}
                >
                  {pool.name}
                </span>
                <code
                  className={`text-xs font-mono flex-1 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  {pool.address}
                </code>
                <CopyToClipboard
                  text={pool.address}
                  iconSize={12}
                  showPopup={false}
                />
              </div>
            ))}
          </div>

          {/* Footer note */}
          <p
            className={`text-center mt-6 text-[11px] ${
              isDarkMode ? "text-gray-600" : "text-gray-400"
            }`}
          >
            Concentrated liquidity (CLMM) on Raydium. Verify pool addresses
            before adding liquidity.
          </p>
        </div>
      </section>
    </main>
  );
};

export default Pool;
