import { useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import { FaExternalLinkAlt, FaSwimmingPool } from "react-icons/fa";
import { APP_NAME } from "@constants/config";
import { POOL_SOL_BUDJU, POOL_USDC_BUDJU } from "@constants/addresses";
import CopyToClipboard from "@components/common/CopyToClipboard";
import { useTheme } from "@/context/ThemeContext";

/* ───────── Types ───────── */
interface PoolConfig {
  name: string;
  pair: string;
  address: string;
  tokenA: string;
  tokenB: string;
  colorA: string;
  colorB: string;
}

interface PoolLiveData {
  tvl: number;
  volume24h: number;
  fees24h: number;
  apr: number;
  feeRate: string;
  type: string;
}

interface PoolData extends PoolConfig {
  live: PoolLiveData | null;
  loading: boolean;
}

/* ───────── Pool configs ───────── */
const POOL_CONFIGS: PoolConfig[] = [
  {
    name: "SOL-BUDJU",
    pair: "SOL / BUDJU",
    address: POOL_SOL_BUDJU,
    tokenA: "SOL",
    tokenB: "BUDJU",
    colorA: "bg-purple-600",
    colorB: "bg-budju-pink",
  },
  {
    name: "USDC-BUDJU",
    pair: "USDC / BUDJU",
    address: POOL_USDC_BUDJU,
    tokenA: "USDC",
    tokenB: "BUDJU",
    colorA: "bg-blue-500",
    colorB: "bg-budju-pink",
  },
];

/* ───────── Helpers ───────── */
const fmt = (n: number, decimals = 0) =>
  "$" + n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Detect mobile/tablet for Phantom deep linking */
const isMobileDevice = () =>
  /android|iphone|ipad|ipod/i.test(navigator.userAgent);

/** Build the Raydium URL — deep link through Phantom on mobile */
const getRaydiumLink = (poolId: string) => {
  const raydiumUrl = `https://raydium.io/clmm/create-position/?pool_id=${poolId}`;
  if (isMobileDevice()) {
    return `https://phantom.app/ul/browse/${encodeURIComponent(raydiumUrl)}`;
  }
  return raydiumUrl;
};

/* ───────── Component ───────── */
const Pool = () => {
  const { isDarkMode } = useTheme();
  const [pools, setPools] = useState<PoolData[]>(
    POOL_CONFIGS.map((cfg) => ({ ...cfg, live: null, loading: true })),
  );

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `Pool of ${APP_NAME} - Liquidity Pools`;
  }, []);

  /** Fetch real pool data from Raydium V3 API */
  const fetchPoolData = useCallback(async () => {
    try {
      const ids = POOL_CONFIGS.map((p) => p.address).join(",");
      const res = await fetch(
        `https://api-v3.raydium.io/pools/info/ids?ids=${ids}`,
        { headers: { accept: "application/json" } },
      );

      if (!res.ok) throw new Error(`API ${res.status}`);

      const json = await res.json();
      const apiPools: any[] = json?.data || [];

      setPools((prev) =>
        prev.map((pool) => {
          const match = apiPools.find((p: any) => p.id === pool.address);
          if (!match) return { ...pool, loading: false };

          const day = match.day || {};
          const feeRate = match.feeRate
            ? `${(match.feeRate * 100).toFixed(2)}%`
            : match.config?.tradeFeeRate
              ? `${(match.config.tradeFeeRate / 10000).toFixed(2)}%`
              : "0.25%";

          return {
            ...pool,
            loading: false,
            live: {
              tvl: match.tvl || 0,
              volume24h: day.volume || 0,
              fees24h: day.volumeFee || 0,
              apr: day.apr || day.feeApr || 0,
              feeRate,
              type: match.type === "Concentrated" ? "CLMM" : match.type || "AMM",
            },
          };
        }),
      );
    } catch (err) {
      console.error("Failed to fetch pool data:", err);
      setPools((prev) => prev.map((p) => ({ ...p, loading: false })));
    }
  }, []);

  useEffect(() => {
    fetchPoolData();
    const id = setInterval(fetchPoolData, 60_000);
    return () => clearInterval(id);
  }, [fetchPoolData]);

  const totalTVL = pools.reduce((s, p) => s + (p.live?.tvl || 0), 0);
  const allLoading = pools.every((p) => p.loading);

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
              Provide liquidity on Raydium and earn trading fees. Real-time data
              from Raydium.
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
              {allLoading ? (
                <span className={isDarkMode ? "text-gray-600" : "text-gray-300"}>Loading...</span>
              ) : (
                fmt(totalTVL)
              )}
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

          {pools.map((pool, index) => {
            const live = pool.live;
            const link = getRaydiumLink(pool.address);

            return (
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
                  } ${index === pools.length - 1 ? "rounded-b-xl" : ""}`}
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
                        {live && (
                          <>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                isDarkMode
                                  ? "bg-cyan-500/10 text-cyan-400"
                                  : "bg-cyan-50 text-cyan-700"
                              }`}
                            >
                              {live.type}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                isDarkMode
                                  ? "bg-white/[0.05] text-gray-400"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {live.feeRate}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* TVL */}
                  <span
                    className={`text-sm font-mono font-medium text-right ${
                      pool.loading
                        ? isDarkMode ? "text-gray-600" : "text-gray-300"
                        : isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {pool.loading ? "..." : fmt(live?.tvl || 0)}
                  </span>

                  {/* Volume */}
                  <span
                    className={`text-sm font-mono font-medium text-right ${
                      pool.loading
                        ? isDarkMode ? "text-gray-600" : "text-gray-300"
                        : isDarkMode ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {pool.loading ? "..." : fmt(live?.volume24h || 0)}
                  </span>

                  {/* Fees */}
                  <span className={`text-sm font-mono font-medium text-right ${
                    pool.loading ? (isDarkMode ? "text-gray-600" : "text-gray-300") : "text-green-400"
                  }`}>
                    {pool.loading ? "..." : fmt(live?.fees24h || 0, 2)}
                  </span>

                  {/* APR */}
                  <span className={`text-sm font-mono font-bold text-right ${
                    pool.loading ? (isDarkMode ? "text-gray-600" : "text-gray-300") : "text-budju-blue"
                  }`}>
                    {pool.loading ? "..." : `${(live?.apr || 0).toFixed(1)}%`}
                  </span>

                  {/* Action */}
                  <a
                    href={link}
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
                          {live && (
                            <>
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                  isDarkMode
                                    ? "bg-cyan-500/10 text-cyan-400"
                                    : "bg-cyan-50 text-cyan-700"
                                }`}
                              >
                                {live.type}
                              </span>
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                  isDarkMode
                                    ? "bg-white/[0.05] text-gray-400"
                                    : "bg-gray-100 text-gray-500"
                                }`}
                              >
                                {live.feeRate}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`text-lg font-mono font-bold ${
                      pool.loading ? (isDarkMode ? "text-gray-600" : "text-gray-300") : "text-budju-blue"
                    }`}>
                      {pool.loading ? "..." : `${(live?.apr || 0).toFixed(1)}%`}
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
                          pool.loading
                            ? isDarkMode ? "text-gray-600" : "text-gray-300"
                            : isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {pool.loading ? "..." : fmt(live?.tvl || 0)}
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
                          pool.loading
                            ? isDarkMode ? "text-gray-600" : "text-gray-300"
                            : isDarkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        {pool.loading ? "..." : fmt(live?.volume24h || 0)}
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
                      <p className={`text-sm font-mono font-medium ${
                        pool.loading ? (isDarkMode ? "text-gray-600" : "text-gray-300") : "text-green-400"
                      }`}>
                        {pool.loading ? "..." : fmt(live?.fees24h || 0, 2)}
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

                  {/* CTA — deep links to Phantom on mobile */}
                  <a
                    href={link}
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
            );
          })}

          {/* Pool addresses - desktop */}
          <div className="hidden md:block mt-6 space-y-2">
            {pools.map((pool) => (
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
            Live data from Raydium. Verify pool addresses before adding
            liquidity. Updates every 60s.
          </p>
        </div>
      </section>
    </main>
  );
};

export default Pool;
