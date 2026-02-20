import { motion } from "framer-motion";
import {
  FaSwimmingPool,
  FaExternalLinkAlt,
  FaInfoCircle,
  FaShieldAlt,
} from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";

const POOLS = [
  {
    pair: "SOL / BUDJU",
    base: "SOL",
    quote: "BUDJU",
    address: "D61kHQmy8UxD6ks9L6dsponk5yexomBLdG5QaFxaHYka",
    link: "https://raydium.io/clmm/create-position/?pool_id=D61kHQmy8UxD6ks9L6dsponk5yexomBLdG5QaFxaHYka",
    accent: "cyan",
    description:
      "The primary trading pair. High volume, tighter spreads. Ideal for active LPs who want maximum fee revenue.",
  },
  {
    pair: "USDC / BUDJU",
    base: "USDC",
    quote: "BUDJU",
    address: "HJjgx74kiUK7WnDXppj7DaCu1VmNGRWXb2RakmSRvZXC",
    link: "https://raydium.io/clmm/create-position/?pool_id=HJjgx74kiUK7WnDXppj7DaCu1VmNGRWXb2RakmSRvZXC",
    accent: "emerald",
    description:
      "Stablecoin pair for lower volatility exposure. Great for LPs who prefer a USDC base with steady fee generation.",
  },
];

const TIPS = [
  {
    title: "Set a Wide Range",
    text: "For meme/low-cap tokens, use a wide price range (e.g. ±50–80%) to stay in range through volatility.",
  },
  {
    title: "Start Small",
    text: "Test with a small position first. Understand how concentrated liquidity works before committing large amounts.",
  },
  {
    title: "Monitor & Rebalance",
    text: "Check your position regularly. If price moves out of range, you stop earning fees — rebalance when needed.",
  },
  {
    title: "Understand IL",
    text: "Impermanent loss is amplified in CLMM. The tighter your range, the higher potential fees — but also higher IL risk.",
  },
];

const LiquidityPools = () => {
  const { isDarkMode } = useTheme();

  return (
    <section className="py-16 md:py-24 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <FaSwimmingPool
              className={`w-6 h-6 ${
                isDarkMode ? "text-blue-400" : "text-blue-600"
              }`}
            />
            <h2
              className={`text-3xl md:text-4xl lg:text-5xl font-bold font-display ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              Liquidity{" "}
              <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-budju-pink bg-clip-text text-transparent">
                Pools
              </span>
            </h2>
          </div>
          <p
            className={`text-base max-w-2xl mx-auto ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            Provide liquidity on Raydium CLMM and earn trading fees. Two pools
            available — choose your preferred pair and start earning.
          </p>
        </motion.div>

        {/* Pool Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
          {POOLS.map((pool, index) => (
            <motion.a
              key={pool.address}
              href={pool.link}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className={`group relative rounded-2xl p-[1px] transition-all duration-300 ${
                pool.accent === "cyan"
                  ? isDarkMode
                    ? "bg-gradient-to-br from-cyan-500/40 via-cyan-500/10 to-cyan-500/40 hover:from-cyan-500/60 hover:to-cyan-500/60"
                    : "bg-gradient-to-br from-cyan-500/30 via-cyan-500/10 to-cyan-500/30 hover:from-cyan-500/50 hover:to-cyan-500/50"
                  : isDarkMode
                    ? "bg-gradient-to-br from-emerald-500/40 via-emerald-500/10 to-emerald-500/40 hover:from-emerald-500/60 hover:to-emerald-500/60"
                    : "bg-gradient-to-br from-emerald-500/30 via-emerald-500/10 to-emerald-500/30 hover:from-emerald-500/50 hover:to-emerald-500/50"
              }`}
            >
              <div
                className={`rounded-2xl p-6 md:p-8 h-full ${
                  isDarkMode ? "bg-[#0a0a1f]/95" : "bg-white/90"
                } backdrop-blur-sm transition-all duration-300 group-hover:translate-y-[-2px]`}
              >
                {/* Pool Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        pool.accent === "cyan"
                          ? isDarkMode
                            ? "bg-cyan-500/10"
                            : "bg-cyan-500/10"
                          : isDarkMode
                            ? "bg-emerald-500/10"
                            : "bg-emerald-500/10"
                      }`}
                    >
                      <FaSwimmingPool
                        className={`w-5 h-5 ${
                          pool.accent === "cyan"
                            ? isDarkMode
                              ? "text-cyan-400"
                              : "text-cyan-600"
                            : isDarkMode
                              ? "text-emerald-400"
                              : "text-emerald-600"
                        }`}
                      />
                    </div>
                    <div>
                      <h3
                        className={`text-xl font-bold font-display ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {pool.pair}
                      </h3>
                      <span
                        className={`text-[10px] uppercase tracking-[0.15em] font-bold ${
                          pool.accent === "cyan"
                            ? isDarkMode
                              ? "text-cyan-400/60"
                              : "text-cyan-600/60"
                            : isDarkMode
                              ? "text-emerald-400/60"
                              : "text-emerald-600/60"
                        }`}
                      >
                        Raydium CLMM
                      </span>
                    </div>
                  </div>
                  <FaExternalLinkAlt
                    className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity ${
                      isDarkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  />
                </div>

                {/* Description */}
                <p
                  className={`text-sm leading-relaxed mb-5 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {pool.description}
                </p>

                {/* Pool Address */}
                <div
                  className={`rounded-lg px-3 py-2 font-mono text-[10px] mb-4 ${
                    isDarkMode
                      ? "bg-white/[0.03] text-gray-500"
                      : "bg-gray-100/60 text-gray-400"
                  }`}
                >
                  <span
                    className={`${
                      pool.accent === "cyan"
                        ? isDarkMode
                          ? "text-cyan-400/60"
                          : "text-cyan-600/60"
                        : isDarkMode
                          ? "text-emerald-400/60"
                          : "text-emerald-600/60"
                    }`}
                  >
                    Pool:
                  </span>{" "}
                  {pool.address.slice(0, 16)}...{pool.address.slice(-8)}
                </div>

                {/* CTA */}
                <div
                  className={`inline-flex items-center gap-2 text-sm font-bold ${
                    pool.accent === "cyan"
                      ? isDarkMode
                        ? "text-cyan-400"
                        : "text-cyan-600"
                      : isDarkMode
                        ? "text-emerald-400"
                        : "text-emerald-600"
                  } group-hover:gap-3 transition-all`}
                >
                  Add Liquidity
                  <span className="transition-transform group-hover:translate-x-1">
                    &rarr;
                  </span>
                </div>
              </div>
            </motion.a>
          ))}
        </div>

        {/* Best Practices Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <div
            className={`rounded-2xl p-[1px] ${
              isDarkMode
                ? "bg-gradient-to-r from-blue-500/30 via-blue-500/10 to-blue-500/30"
                : "bg-gradient-to-r from-blue-500/20 via-blue-500/5 to-blue-500/20"
            }`}
          >
            <div
              className={`rounded-2xl px-6 md:px-10 py-8 ${
                isDarkMode ? "bg-[#0a0a1f]/95" : "bg-white/90"
              } backdrop-blur-sm`}
            >
              {/* Tips Header */}
              <div className="flex items-center gap-3 mb-6">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    isDarkMode ? "bg-blue-500/10" : "bg-blue-500/10"
                  }`}
                >
                  <FaShieldAlt
                    className={`w-4 h-4 ${
                      isDarkMode ? "text-blue-400" : "text-blue-600"
                    }`}
                  />
                </div>
                <div>
                  <h3
                    className={`text-lg font-bold font-display ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    LP Best Practices
                  </h3>
                  <p
                    className={`text-xs ${
                      isDarkMode ? "text-gray-500" : "text-gray-500"
                    }`}
                  >
                    Concentrated liquidity tips for BUDJU pools
                  </p>
                </div>
              </div>

              {/* Tips Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {TIPS.map((tip, index) => (
                  <motion.div
                    key={tip.title}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: 0.2 + index * 0.06 }}
                    className={`rounded-xl border p-4 ${
                      isDarkMode
                        ? "bg-white/[0.02] border-white/[0.06]"
                        : "bg-gray-50/60 border-gray-200/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <FaInfoCircle
                        className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                          isDarkMode ? "text-blue-400/60" : "text-blue-500/60"
                        }`}
                      />
                      <div>
                        <h4
                          className={`text-sm font-bold mb-1 ${
                            isDarkMode ? "text-white" : "text-gray-900"
                          }`}
                        >
                          {tip.title}
                        </h4>
                        <p
                          className={`text-xs leading-relaxed ${
                            isDarkMode ? "text-gray-500" : "text-gray-500"
                          }`}
                        >
                          {tip.text}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default LiquidityPools;
