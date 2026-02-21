import { useEffect } from "react";
import { motion } from "motion/react";
import { Link } from "react-router";
import {
  FaUniversity,
  FaFire,
  FaChartLine,
  FaHandHoldingUsd,
  FaCoins,
  FaSeedling,
  FaExternalLinkAlt,
} from "react-icons/fa";
import { APP_NAME } from "@constants/config";
import { BANK_ADDRESS } from "@constants/addresses";
import { ROUTES } from "@/constants/routes";
import CopyToClipboard from "@components/common/CopyToClipboard";
import { BudjuParadeBanner } from "@components/common/ScrollingBanner";
import BankTokens from "./components/BankTokens";
import BankChart from "./components/BankChart";
import BankTransactions from "./components/BankTransactions";
import { useTheme } from "@/context/ThemeContext";

const HOW_IT_WORKS = [
  {
    icon: FaCoins,
    title: "Dev-Funded Treasury",
    desc: "The Bank holds top-tier crypto assets — SOL, BTC, USDC, and more — funded by the developer. This is not community money; it's a personal commitment to the ecosystem.",
    accent: "amber",
  },
  {
    icon: FaSeedling,
    title: "Earn Interest",
    desc: "Staked assets and yield-bearing positions generate real returns over time. The Bank works around the clock, compounding value passively.",
    accent: "emerald",
  },
  {
    icon: FaFire,
    title: "Buy Back & Burn",
    desc: "Interest earned is used to buy BUDJU on the open market and permanently burn it — reducing supply and driving long-term token value.",
    accent: "pink",
  },
  {
    icon: FaHandHoldingUsd,
    title: "Community Deposits",
    desc: "Community members can make voluntary deposits to help accelerate the burn cycle. Every contribution strengthens the BUDJU ecosystem.",
    accent: "cyan",
  },
];

const accentMap: Record<string, { icon: string; iconDark: string; border: string; borderDark: string; bg: string; bgDark: string }> = {
  amber: { icon: "text-amber-600", iconDark: "text-amber-400", border: "border-amber-500/15", borderDark: "border-amber-500/20", bg: "bg-amber-500/10", bgDark: "bg-amber-500/15" },
  emerald: { icon: "text-emerald-600", iconDark: "text-emerald-400", border: "border-emerald-500/15", borderDark: "border-emerald-500/20", bg: "bg-emerald-500/10", bgDark: "bg-emerald-500/15" },
  pink: { icon: "text-budju-pink-dark", iconDark: "text-budju-pink", border: "border-budju-pink/15", borderDark: "border-budju-pink/20", bg: "bg-budju-pink/10", bgDark: "bg-budju-pink/15" },
  cyan: { icon: "text-cyan-600", iconDark: "text-cyan-400", border: "border-cyan-500/15", borderDark: "border-cyan-500/20", bg: "bg-cyan-500/10", bgDark: "bg-cyan-500/15" },
};

const Bank = () => {
  const { isDarkMode } = useTheme();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `Bank of ${APP_NAME} — Treasury Holdings`;

    const metaDescription = document.querySelector('meta[name="description"]');
    const desc =
      "The Bank of BUDJU holds top crypto assets, earns interest, and uses the returns to buy back and burn BUDJU — driving scarcity and long-term value.";
    if (metaDescription) {
      metaDescription.setAttribute("content", desc);
    } else {
      const el = document.createElement("meta");
      el.name = "description";
      el.content = desc;
      document.head.appendChild(el);
    }
  }, []);

  return (
    <main className="flex flex-col">
      {/* ── Hero ── */}
      <section className="pt-28 pb-8 md:pt-36 md:pb-12 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <FaUniversity
                className={`w-7 h-7 ${
                  isDarkMode ? "text-amber-400" : "text-amber-600"
                }`}
              />
              <h1
                className={`text-4xl md:text-5xl lg:text-6xl font-bold font-display ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                Bank of{" "}
                <span className="bg-gradient-to-r from-amber-400 via-budju-pink to-budju-blue bg-clip-text text-transparent">
                  BUDJU
                </span>
              </h1>
            </div>
            <p
              className={`text-base md:text-lg max-w-2xl mx-auto mb-8 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              A developer-funded treasury holding top crypto assets. Interest
              earned buys back BUDJU and burns it — reducing supply and growing
              value for every holder.
            </p>

            {/* Bank Address Card */}
            <div className="max-w-xl mx-auto">
              <div
                className={`rounded-2xl p-[1px] ${
                  isDarkMode
                    ? "bg-gradient-to-r from-amber-500/40 via-amber-400/20 to-amber-500/40"
                    : "bg-gradient-to-r from-amber-500/30 via-amber-400/15 to-amber-500/30"
                }`}
              >
                <div
                  className={`rounded-2xl px-5 py-4 ${
                    isDarkMode ? "bg-[#0a0a1f]/95" : "bg-white/90"
                  } backdrop-blur-sm`}
                >
                  <p
                    className={`text-[10px] uppercase tracking-[0.2em] font-bold mb-2 ${
                      isDarkMode ? "text-amber-400/60" : "text-amber-600/60"
                    }`}
                  >
                    Treasury Address
                  </p>
                  <div className="flex items-center gap-2">
                    <code
                      className={`text-xs md:text-sm font-mono truncate flex-1 ${
                        isDarkMode ? "text-gray-300" : "text-gray-700"
                      }`}
                    >
                      {BANK_ADDRESS}
                    </code>
                    <CopyToClipboard text={BANK_ADDRESS} />
                    <a
                      href={`https://solscan.io/account/${BANK_ADDRESS}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`p-2 rounded-full transition-colors ${
                        isDarkMode
                          ? "text-amber-400 hover:bg-white/10"
                          : "text-amber-600 hover:bg-gray-100"
                      }`}
                      aria-label="View on Solscan"
                    >
                      <FaExternalLinkAlt className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Holdings ── */}
      <BankTokens />

      <div className="budju-section-divider" />

      {/* ── How It Works ── */}
      <section className="py-12 md:py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className={`text-2xl md:text-3xl font-bold font-display text-center mb-10 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            How the{" "}
            <span className="bg-gradient-to-r from-amber-400 to-budju-pink bg-clip-text text-transparent">
              Bank
            </span>{" "}
            Works
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {HOW_IT_WORKS.map((item, index) => {
              const a = accentMap[item.accent];
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className={`rounded-xl border p-5 text-center ${
                    isDarkMode ? a.borderDark : a.border
                  } ${
                    isDarkMode ? "bg-[#0c0c20]/60" : "bg-white/60"
                  } backdrop-blur-sm transition-all duration-300 ${
                    isDarkMode
                      ? "hover:border-white/[0.12]"
                      : "hover:border-gray-300/60"
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
                      isDarkMode ? a.bgDark : a.bg
                    }`}
                  >
                    <item.icon
                      className={`w-5 h-5 ${isDarkMode ? a.iconDark : a.icon}`}
                    />
                  </div>
                  <h3
                    className={`text-sm font-bold mb-1.5 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {item.title}
                  </h3>
                  <p
                    className={`text-xs leading-relaxed ${
                      isDarkMode ? "text-gray-500" : "text-gray-500"
                    }`}
                  >
                    {item.desc}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="budju-section-divider" />

      {/* ── Chart ── */}
      <BankChart />

      {/* ── Banner ── */}
      <BudjuParadeBanner />

      <div className="budju-section-divider" />

      {/* ── Transactions ── */}
      <BankTransactions />

      {/* ── Bottom CTA ── */}
      <section className="py-16 md:py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <div
              className={`rounded-2xl p-[1px] max-w-2xl mx-auto ${
                isDarkMode
                  ? "bg-gradient-to-r from-amber-500/40 via-budju-pink/30 to-budju-blue/40"
                  : "bg-gradient-to-r from-amber-500/30 via-budju-pink/20 to-budju-blue/30"
              }`}
            >
              <div
                className={`rounded-2xl px-8 py-10 ${
                  isDarkMode ? "bg-[#0a0a1f]/95" : "bg-white/90"
                } backdrop-blur-sm`}
              >
                <FaChartLine
                  className={`w-8 h-8 mx-auto mb-4 ${
                    isDarkMode ? "text-amber-400" : "text-amber-600"
                  }`}
                />
                <h3
                  className={`text-xl md:text-2xl font-bold font-display mb-3 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  Want to Help Build the Ecosystem?
                </h3>
                <p
                  className={`text-sm mb-6 max-w-md mx-auto ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  Community deposits accelerate the burn cycle. Send SOL, BUDJU,
                  USDC, or any Solana token to the treasury address above. Every
                  contribution is tracked on-chain.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    to={ROUTES.SWAP}
                    className={`inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-bold text-sm transition-all duration-300 hover:scale-105 ${
                      isDarkMode
                        ? "bg-gradient-to-r from-amber-400 to-budju-pink text-white shadow-lg shadow-amber-400/20 hover:shadow-amber-400/40"
                        : "bg-gradient-to-r from-amber-500 to-budju-pink text-white shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50"
                    }`}
                  >
                    <FaCoins className="w-4 h-4" />
                    Get BUDJU
                  </Link>
                  <a
                    href={`https://solscan.io/account/${BANK_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-bold text-sm border transition-all duration-300 hover:scale-105 ${
                      isDarkMode
                        ? "border-white/10 text-white hover:border-white/20"
                        : "border-gray-300 text-gray-900 hover:border-gray-500"
                    }`}
                  >
                    <FaExternalLinkAlt className="w-3.5 h-3.5" />
                    View on Solscan
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
};

export default Bank;
