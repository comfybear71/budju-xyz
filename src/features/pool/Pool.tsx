import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaExternalLinkAlt,
  FaSwimmingPool,
  FaExchangeAlt,
  FaChevronDown,
  FaChevronUp,
  FaFire,
} from "react-icons/fa";
import { APP_NAME } from "@constants/config";
import {
  POOL_SOL_BUDJU,
  POOL_USDC_BUDJU,
  TOKEN_ADDRESS,
  RAYDIUM_SWAP_LINK,
} from "@constants/addresses";
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

interface PeriodData {
  volume: number;
  fees: number;
  apr: number;
  priceMin: number;
  priceMax: number;
}

interface PoolLiveData {
  tvl: number;
  feeRate: string;
  type: string;
  price: number;
  mintAmountA: number;
  mintAmountB: number;
  lpBurnPct: number;
  lpPrice: number;
  day: PeriodData;
  week: PeriodData;
  month: PeriodData;
  farmCount: number;
}

interface PoolData extends PoolConfig {
  live: PoolLiveData | null;
  loading: boolean;
}

type Period = "day" | "week" | "month";

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
  "$" +
  n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const fmtCompact = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
};

const isMobileDevice = () =>
  /android|iphone|ipad|ipod/i.test(navigator.userAgent);

const getRaydiumLink = (poolId: string) => {
  const raydiumUrl = `https://raydium.io/clmm/create-position/?pool_id=${poolId}`;
  if (isMobileDevice()) {
    return `https://phantom.app/ul/browse/${encodeURIComponent(raydiumUrl)}`;
  }
  return raydiumUrl;
};

const getSwapLink = () => {
  if (isMobileDevice()) {
    return `https://phantom.app/ul/browse/${encodeURIComponent(RAYDIUM_SWAP_LINK)}`;
  }
  return RAYDIUM_SWAP_LINK;
};

const parsePeriod = (raw: any): PeriodData => ({
  volume: raw?.volume || 0,
  fees: raw?.volumeFee || 0,
  apr: raw?.apr || raw?.feeApr || 0,
  priceMin: raw?.priceMin || 0,
  priceMax: raw?.priceMax || 0,
});

/* ───────── Component ───────── */
const Pool = () => {
  const { isDarkMode } = useTheme();
  const [pools, setPools] = useState<PoolData[]>(
    POOL_CONFIGS.map((cfg) => ({ ...cfg, live: null, loading: true })),
  );
  const [period, setPeriod] = useState<Period>("day");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [budjuPrice, setBudjuPrice] = useState<string | null>(null);

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
          const m = apiPools.find((p: any) => p.id === pool.address);
          if (!m) return { ...pool, loading: false };

          const feeRate = m.feeRate
            ? `${(m.feeRate * 100).toFixed(2)}%`
            : m.config?.tradeFeeRate
              ? `${(m.config.tradeFeeRate / 10000).toFixed(2)}%`
              : "0.25%";

          return {
            ...pool,
            loading: false,
            live: {
              tvl: m.tvl || 0,
              feeRate,
              type:
                m.type === "Concentrated" ? "CLMM" : m.type || "Standard",
              price: m.price || 0,
              mintAmountA: m.mintAmountA || 0,
              mintAmountB: m.mintAmountB || 0,
              lpBurnPct: m.burnPercent || m.lpMint?.extensions?.burnPercent || 0,
              lpPrice: m.lpPrice || 0,
              day: parsePeriod(m.day),
              week: parsePeriod(m.week),
              month: parsePeriod(m.month),
              farmCount:
                (m.farmUpcomingCount || 0) + (m.farmOngoingCount || 0),
            },
          };
        }),
      );
    } catch (err) {
      console.error("Failed to fetch pool data:", err);
      setPools((prev) => prev.map((p) => ({ ...p, loading: false })));
    }
  }, []);

  /** Fetch live BUDJU price from Raydium */
  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch(
        `https://api-v3.raydium.io/mint/price?mints=${TOKEN_ADDRESS}`,
      );
      const json = await res.json();
      const price = json?.data?.[TOKEN_ADDRESS];
      if (price) setBudjuPrice(price);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchPoolData();
    fetchPrice();
    const id = setInterval(() => {
      fetchPoolData();
      fetchPrice();
    }, 60_000);
    return () => clearInterval(id);
  }, [fetchPoolData, fetchPrice]);

  const totalTVL = pools.reduce((s, p) => s + (p.live?.tvl || 0), 0);
  const totalVol = pools.reduce(
    (s, p) => s + (p.live?.[period]?.volume || 0),
    0,
  );
  const allLoading = pools.every((p) => p.loading);

  const periodLabels: Record<Period, string> = {
    day: "24h",
    week: "7D",
    month: "30D",
  };

  return (
    <main className="min-h-screen">
      {/* ── Header ── */}
      <section className="pt-24 pb-6 px-4">
        <div className="max-w-5xl mx-auto text-center relative">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-budju-pink/10 rounded-full blur-3xl pointer-events-none" />

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10"
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
              className={`text-sm max-w-xl mx-auto mb-5 ${
                isDarkMode ? "text-gray-500" : "text-gray-500"
              }`}
            >
              Provide liquidity on Raydium and earn trading fees. Live data
              refreshes every 60 seconds.
            </p>

            {/* Buy BUDJU on Raydium CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href={getSwapLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-budju-pink to-budju-blue hover:opacity-90 transition-opacity"
              >
                <FaExchangeAlt size={12} />
                Buy BUDJU on Raydium
              </a>
              {budjuPrice && (
                <span
                  className={`text-xs font-mono ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                >
                  BUDJU: ${parseFloat(budjuPrice).toFixed(10)}
                </span>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Summary Stats ── */}
      <section className="px-4 pb-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="text-center"
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
                  <span className={isDarkMode ? "text-gray-600" : "text-gray-300"}>
                    ...
                  </span>
                ) : (
                  fmt(totalTVL)
                )}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-center"
            >
              <span
                className={`text-[10px] uppercase tracking-[0.2em] font-bold ${
                  isDarkMode ? "text-gray-600" : "text-gray-400"
                }`}
              >
                Volume ({periodLabels[period]})
              </span>
              <p
                className={`text-2xl md:text-3xl font-bold font-mono mt-1 ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
              >
                {allLoading ? (
                  <span className={isDarkMode ? "text-gray-600" : "text-gray-300"}>
                    ...
                  </span>
                ) : (
                  fmt(totalVol)
                )}
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Period Toggle ── */}
      <section className="px-4 pb-4">
        <div className="max-w-5xl mx-auto flex justify-center">
          <div
            className={`inline-flex rounded-lg p-0.5 ${
              isDarkMode
                ? "bg-white/[0.03] border border-white/[0.06]"
                : "bg-gray-50 border border-gray-200/60"
            }`}
          >
            {(["day", "week", "month"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                  period === p
                    ? isDarkMode
                      ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/20"
                      : "bg-white text-cyan-700 border border-cyan-200 shadow-sm"
                    : isDarkMode
                      ? "text-gray-500 hover:text-gray-400"
                      : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pool Table / Cards ── */}
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
            <span className="text-right">
              Volume {periodLabels[period]}
            </span>
            <span className="text-right">Fees {periodLabels[period]}</span>
            <span className="text-right">APR {periodLabels[period]}</span>
            <span></span>
          </div>

          {pools.map((pool, index) => {
            const live = pool.live;
            const pd = live?.[period];
            const link = getRaydiumLink(pool.address);
            const isExpanded = expanded === pool.address;

            return (
              <motion.div
                key={pool.address}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + index * 0.1 }}
              >
                {/* ── Desktop row ── */}
                <div
                  className={`hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 items-center px-5 py-4 border-x border-b transition-colors cursor-pointer ${
                    isDarkMode
                      ? "bg-[#0c0c20]/40 border-white/[0.06] hover:bg-[#0c0c20]/70"
                      : "bg-white/60 border-gray-200/60 hover:bg-gray-50"
                  } ${!isExpanded && index === pools.length - 1 ? "rounded-b-xl" : ""}`}
                  onClick={() =>
                    setExpanded(isExpanded ? null : pool.address)
                  }
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
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-bold ${
                            isDarkMode ? "text-white" : "text-gray-900"
                          }`}
                        >
                          {pool.pair}
                        </span>
                        {isExpanded ? (
                          <FaChevronUp
                            className={`w-2.5 h-2.5 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                          />
                        ) : (
                          <FaChevronDown
                            className={`w-2.5 h-2.5 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                          />
                        )}
                      </div>
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
                            {live.lpBurnPct > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-orange-500/10 text-orange-400 flex items-center gap-0.5">
                                <FaFire size={7} />
                                {live.lpBurnPct.toFixed(0)}% burned
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* TVL */}
                  <span
                    className={`text-sm font-mono font-medium text-right ${
                      pool.loading
                        ? isDarkMode
                          ? "text-gray-600"
                          : "text-gray-300"
                        : isDarkMode
                          ? "text-white"
                          : "text-gray-900"
                    }`}
                  >
                    {pool.loading ? "..." : fmt(live?.tvl || 0)}
                  </span>

                  {/* Volume */}
                  <span
                    className={`text-sm font-mono font-medium text-right ${
                      pool.loading
                        ? isDarkMode
                          ? "text-gray-600"
                          : "text-gray-300"
                        : isDarkMode
                          ? "text-gray-300"
                          : "text-gray-700"
                    }`}
                  >
                    {pool.loading ? "..." : fmt(pd?.volume || 0)}
                  </span>

                  {/* Fees */}
                  <span
                    className={`text-sm font-mono font-medium text-right ${
                      pool.loading
                        ? isDarkMode
                          ? "text-gray-600"
                          : "text-gray-300"
                        : "text-green-400"
                    }`}
                  >
                    {pool.loading ? "..." : fmt(pd?.fees || 0, 2)}
                  </span>

                  {/* APR */}
                  <span
                    className={`text-sm font-mono font-bold text-right ${
                      pool.loading
                        ? isDarkMode
                          ? "text-gray-600"
                          : "text-gray-300"
                        : "text-budju-blue"
                    }`}
                  >
                    {pool.loading
                      ? "..."
                      : `${(pd?.apr || 0).toFixed(1)}%`}
                  </span>

                  {/* Action */}
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
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

                {/* ── Desktop Expanded Detail ── */}
                <AnimatePresence>
                  {isExpanded && live && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden hidden md:block"
                    >
                      <div
                        className={`px-5 py-4 border-x border-b ${
                          isDarkMode
                            ? "bg-[#0c0c20]/60 border-white/[0.06]"
                            : "bg-gray-50/60 border-gray-200/60"
                        } ${index === pools.length - 1 ? "rounded-b-xl" : ""}`}
                      >
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {/* Token balances */}
                          <div>
                            <span
                              className={`text-[10px] uppercase tracking-wider font-bold ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                            >
                              Pool {pool.tokenA}
                            </span>
                            <p
                              className={`text-sm font-mono font-medium mt-0.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
                            >
                              {fmtCompact(live.mintAmountA)} {pool.tokenA}
                            </p>
                          </div>
                          <div>
                            <span
                              className={`text-[10px] uppercase tracking-wider font-bold ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                            >
                              Pool {pool.tokenB}
                            </span>
                            <p
                              className={`text-sm font-mono font-medium mt-0.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
                            >
                              {fmtCompact(live.mintAmountB)} {pool.tokenB}
                            </p>
                          </div>
                          {/* LP info */}
                          <div>
                            <span
                              className={`text-[10px] uppercase tracking-wider font-bold ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                            >
                              LP Price
                            </span>
                            <p
                              className={`text-sm font-mono font-medium mt-0.5 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                            >
                              {live.lpPrice > 0
                                ? `$${live.lpPrice.toFixed(2)}`
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <span
                              className={`text-[10px] uppercase tracking-wider font-bold ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                            >
                              LP Burned
                            </span>
                            <p className="text-sm font-mono font-medium mt-0.5 text-orange-400 flex items-center gap-1">
                              {live.lpBurnPct > 0 ? (
                                <>
                                  <FaFire size={10} />
                                  {live.lpBurnPct.toFixed(1)}%
                                </>
                              ) : (
                                <span
                                  className={
                                    isDarkMode
                                      ? "text-gray-600"
                                      : "text-gray-300"
                                  }
                                >
                                  0%
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Period comparison */}
                        <div className="mt-4">
                          <span
                            className={`text-[10px] uppercase tracking-wider font-bold ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                          >
                            Performance Across Periods
                          </span>
                          <div className="grid grid-cols-3 gap-3 mt-2">
                            {(
                              ["day", "week", "month"] as Period[]
                            ).map((p) => {
                              const d = live[p];
                              return (
                                <div
                                  key={p}
                                  className={`p-3 rounded-lg ${
                                    isDarkMode
                                      ? "bg-white/[0.03] border border-white/[0.04]"
                                      : "bg-white border border-gray-200/40"
                                  }`}
                                >
                                  <div
                                    className={`text-[10px] font-bold uppercase mb-1.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                                  >
                                    {periodLabels[p]}
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex justify-between">
                                      <span
                                        className={`text-[10px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                                      >
                                        Volume
                                      </span>
                                      <span
                                        className={`text-[10px] font-mono ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                                      >
                                        {fmt(d.volume)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span
                                        className={`text-[10px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                                      >
                                        Fees
                                      </span>
                                      <span className="text-[10px] font-mono text-green-400">
                                        {fmt(d.fees, 2)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span
                                        className={`text-[10px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                                      >
                                        APR
                                      </span>
                                      <span className="text-[10px] font-mono text-budju-blue font-bold">
                                        {d.apr.toFixed(1)}%
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

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
                              {live.lpBurnPct > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-orange-500/10 text-orange-400 flex items-center gap-0.5">
                                  <FaFire size={6} />
                                  {live.lpBurnPct.toFixed(0)}%
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-lg font-mono font-bold ${
                        pool.loading
                          ? isDarkMode
                            ? "text-gray-600"
                            : "text-gray-300"
                          : "text-budju-blue"
                      }`}
                    >
                      {pool.loading
                        ? "..."
                        : `${(pd?.apr || 0).toFixed(1)}%`}
                      <span
                        className={`block text-[9px] font-sans font-normal text-right ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        APR ({periodLabels[period]})
                      </span>
                    </span>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
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
                            ? isDarkMode
                              ? "text-gray-600"
                              : "text-gray-300"
                            : isDarkMode
                              ? "text-white"
                              : "text-gray-900"
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
                        Vol {periodLabels[period]}
                      </span>
                      <p
                        className={`text-sm font-mono font-medium ${
                          pool.loading
                            ? isDarkMode
                              ? "text-gray-600"
                              : "text-gray-300"
                            : isDarkMode
                              ? "text-gray-300"
                              : "text-gray-700"
                        }`}
                      >
                        {pool.loading ? "..." : fmt(pd?.volume || 0)}
                      </p>
                    </div>
                    <div>
                      <span
                        className={`text-[10px] uppercase tracking-wider ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        Fees {periodLabels[period]}
                      </span>
                      <p
                        className={`text-sm font-mono font-medium ${
                          pool.loading
                            ? isDarkMode
                              ? "text-gray-600"
                              : "text-gray-300"
                            : "text-green-400"
                        }`}
                      >
                        {pool.loading ? "..." : fmt(pd?.fees || 0, 2)}
                      </p>
                    </div>
                  </div>

                  {/* Token amounts (mobile) */}
                  {live && (
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div
                        className={`px-3 py-2 rounded-lg ${isDarkMode ? "bg-white/[0.03]" : "bg-gray-50"}`}
                      >
                        <span
                          className={`text-[9px] uppercase ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                        >
                          {pool.tokenA} in pool
                        </span>
                        <p
                          className={`text-xs font-mono ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                        >
                          {fmtCompact(live.mintAmountA)}
                        </p>
                      </div>
                      <div
                        className={`px-3 py-2 rounded-lg ${isDarkMode ? "bg-white/[0.03]" : "bg-gray-50"}`}
                      >
                        <span
                          className={`text-[9px] uppercase ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                        >
                          {pool.tokenB} in pool
                        </span>
                        <p
                          className={`text-xs font-mono ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                        >
                          {fmtCompact(live.mintAmountB)}
                        </p>
                      </div>
                    </div>
                  )}

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
            Live data from Raydium V3 API. Verify pool addresses before adding
            liquidity. Updates every 60s.
          </p>
        </div>
      </section>
    </main>
  );
};

export default Pool;
