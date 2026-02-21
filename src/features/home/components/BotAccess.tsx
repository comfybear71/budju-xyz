import { useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  FaRobot,
  FaChartLine,
  FaShieldAlt,
  FaBrain,
  FaWallet,
  FaPlay,
} from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import { ROUTES } from "@/constants/routes";

const features = [
  {
    icon: FaWallet,
    title: "Deposit & Go",
    description:
      "Deposit your funds and the bot takes over. No manual trading required — it works while you sleep.",
    accent: "text-cyan-400",
  },
  {
    icon: FaChartLine,
    title: "Dollar Cost Averaging",
    description:
      "The bot uses a DCA strategy — automatically buying at regular intervals to reduce risk and smooth out volatility.",
    accent: "text-emerald-400",
  },
  {
    icon: FaShieldAlt,
    title: "Very Low Risk",
    description:
      "DCA is one of the safest trading strategies. No risky leveraged bets — just consistent, disciplined accumulation.",
    accent: "text-blue-400",
  },
  {
    icon: FaBrain,
    title: "AI-Enhanced (Coming Soon)",
    description:
      "Future upgrades will add AI-powered market analysis to optimise DCA timing and entry points.",
    accent: "text-purple-400",
  },
];

// Video URL: checks env var first, then falls back to Vercel Blob
const BOT_VIDEO_URL =
  import.meta.env.VITE_BOT_VIDEO_URL ||
  "https://efxrfrxecvegqgub.public.blob.vercel-storage.com/125d289f782c4097b96b6f21de40c7ad.mov";

const BotAccess = () => {
  const { isDarkMode } = useTheme();
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoAvailable, setVideoAvailable] = useState(!!BOT_VIDEO_URL);

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
            <FaRobot
              className={`w-6 h-6 ${
                isDarkMode ? "text-cyan-400" : "text-cyan-600"
              }`}
            />
            <h2
              className={`text-3xl md:text-4xl lg:text-5xl font-bold font-display ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              The{" "}
              <span className="bg-gradient-to-r from-cyan-400 via-budju-blue to-budju-pink bg-clip-text text-transparent">
                Trading Bot
              </span>
            </h2>
          </div>
          <p
            className={`text-base max-w-2xl mx-auto mb-2 ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            Deposit your funds and let the bot trade on your behalf using a
            proven Dollar Cost Averaging strategy. Low risk, fully automated,
            powered by Solana.
          </p>
        </motion.div>

        {/* How It Works — 3 Steps */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mb-12"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                step: "01",
                title: "Hold 10M BUDJU",
                desc: "Your entry ticket. Hold 10 million BUDJU in your wallet to unlock bot access.",
                color: isDarkMode ? "text-amber-400" : "text-amber-600",
                border: isDarkMode
                  ? "border-amber-500/20"
                  : "border-amber-500/15",
              },
              {
                step: "02",
                title: "Deposit Funds",
                desc: "Connect your wallet and deposit. The bot takes it from here — no manual trading needed.",
                color: isDarkMode ? "text-cyan-400" : "text-cyan-600",
                border: isDarkMode
                  ? "border-cyan-500/20"
                  : "border-cyan-500/15",
              },
              {
                step: "03",
                title: "Bot Trades for You",
                desc: "The system uses DCA to trade on your behalf — buying consistently to reduce risk over time.",
                color: isDarkMode ? "text-emerald-400" : "text-emerald-600",
                border: isDarkMode
                  ? "border-emerald-500/20"
                  : "border-emerald-500/15",
              },
            ].map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.1 + index * 0.1 }}
                className={`rounded-xl border p-5 text-center ${item.border} ${
                  isDarkMode
                    ? "bg-[#0c0c20]/60"
                    : "bg-white/60"
                } backdrop-blur-sm`}
              >
                <span
                  className={`text-3xl font-black font-mono ${item.color} opacity-40`}
                >
                  {item.step}
                </span>
                <h3
                  className={`text-base font-bold mt-2 mb-1.5 ${
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
            ))}
          </div>
        </motion.div>

        {/* Entry Requirement Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mb-12"
        >
          <div
            className={`rounded-2xl p-[1px] ${
              isDarkMode
                ? "bg-gradient-to-r from-amber-500/50 via-yellow-400/30 to-amber-500/50"
                : "bg-gradient-to-r from-amber-500/40 via-yellow-400/25 to-amber-500/40"
            }`}
          >
            <div
              className={`rounded-2xl px-6 md:px-10 py-6 md:py-8 text-center ${
                isDarkMode ? "bg-[#0a0a1f]/95" : "bg-white/90"
              } backdrop-blur-sm`}
            >
              <p
                className={`text-[10px] uppercase tracking-[0.2em] font-bold mb-3 ${
                  isDarkMode ? "text-amber-400/70" : "text-amber-600/70"
                }`}
              >
                Entry Requirement
              </p>
              <p
                className={`text-3xl md:text-4xl lg:text-5xl font-black font-display mb-3 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                <span
                  className={`font-mono ${
                    isDarkMode ? "text-amber-400" : "text-amber-600"
                  }`}
                >
                  10,000,000
                </span>{" "}
                BUDJU
              </p>
              <p
                className={`text-sm md:text-base max-w-xl mx-auto mb-6 ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                Hold 10 million BUDJU in your connected wallet to unlock access
                to the automated trading bot. Deposit your funds and the system
                trades on your behalf using Dollar Cost Averaging — a very low
                risk strategy. This is your ticket into the most exciting
                trading board on Solana.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to={ROUTES.SWAP}
                  className="hero-btn-primary text-center text-sm font-bold px-8 py-3 rounded-xl inline-flex items-center justify-center gap-2"
                >
                  <FaRobot className="w-3.5 h-3.5" />
                  Get BUDJU Now
                </Link>
                <Link
                  to={ROUTES.HOW_TO_BUY}
                  className={`hero-btn-secondary text-center text-sm font-bold px-8 py-3 rounded-xl ${
                    !isDarkMode
                      ? "text-gray-900 border-gray-300 hover:border-gray-900"
                      : ""
                  }`}
                >
                  How to Buy
                </Link>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Bot Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.2 + index * 0.08 }}
              className={`rounded-xl border p-5 ${
                isDarkMode
                  ? "bg-[#0c0c20]/60 border-white/[0.06] hover:border-white/[0.12]"
                  : "bg-white/60 border-gray-200/40 hover:border-gray-300/60"
              } backdrop-blur-sm transition-all duration-300`}
            >
              <feature.icon className={`w-5 h-5 ${feature.accent} mb-3`} />
              <h3
                className={`text-sm font-bold mb-1.5 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {feature.title}
              </h3>
              <p
                className={`text-xs leading-relaxed ${
                  isDarkMode ? "text-gray-500" : "text-gray-500"
                }`}
              >
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Bot Video Showcase */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mt-12"
        >
          <div className="text-center mb-6">
            <p
              className={`text-[10px] uppercase tracking-[0.2em] font-bold ${
                isDarkMode ? "text-cyan-400/70" : "text-cyan-600/70"
              }`}
            >
              See It In Action
            </p>
            <h3
              className={`text-xl md:text-2xl font-bold mt-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              Bot{" "}
              <span className="bg-gradient-to-r from-cyan-400 to-budju-blue bg-clip-text text-transparent">
                Dashboard
              </span>{" "}
              Preview
            </h3>
          </div>

          <div
            className={`relative rounded-2xl overflow-hidden border ${
              isDarkMode
                ? "bg-[#0c0c20]/80 border-white/[0.08]"
                : "bg-white/60 border-gray-200/40"
            } backdrop-blur-sm`}
          >
            {/* Gradient glow behind video */}
            <div
              className={`absolute -inset-1 rounded-2xl blur-xl opacity-30 ${
                isDarkMode
                  ? "bg-gradient-to-r from-cyan-500/20 via-budju-blue/20 to-budju-pink/20"
                  : "bg-gradient-to-r from-cyan-500/10 via-budju-blue/10 to-budju-pink/10"
              }`}
            />

            <div className="relative aspect-video w-full">
              {BOT_VIDEO_URL && videoAvailable ? (
                <>
                  {!isVideoPlaying ? (
                    <div
                      className="absolute inset-0 flex items-center justify-center cursor-pointer group z-10"
                      onClick={() => setIsVideoPlaying(true)}
                    >
                      {/* Thumbnail overlay */}
                      <div
                        className={`absolute inset-0 ${
                          isDarkMode
                            ? "bg-gradient-to-b from-[#0c0c20]/40 via-transparent to-[#0c0c20]/60"
                            : "bg-gradient-to-b from-white/20 via-transparent to-white/40"
                        }`}
                      />
                      {/* Play button */}
                      <div
                        className={`relative w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${
                          isDarkMode
                            ? "bg-white/10 backdrop-blur-sm border border-white/20 group-hover:bg-white/20"
                            : "bg-black/10 backdrop-blur-sm border border-black/10 group-hover:bg-black/20"
                        }`}
                      >
                        <FaPlay
                          className={`w-6 h-6 md:w-7 md:h-7 ml-1 ${
                            isDarkMode ? "text-white" : "text-gray-900"
                          }`}
                        />
                      </div>
                      <p
                        className={`absolute bottom-6 text-xs font-medium ${
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        Click to play
                      </p>
                    </div>
                  ) : null}
                  <video
                    src={BOT_VIDEO_URL}
                    className="w-full h-full object-cover"
                    controls={isVideoPlaying}
                    autoPlay={isVideoPlaying}
                    playsInline
                    onPlay={() => setIsVideoPlaying(true)}
                    onError={() => setVideoAvailable(false)}
                    poster=""
                  />
                </>
              ) : (
                <div
                  className={`w-full h-full flex flex-col items-center justify-center ${
                    isDarkMode ? "bg-[#0c0c20]" : "bg-gray-50"
                  }`}
                >
                  <div
                    className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center mb-4 ${
                      isDarkMode
                        ? "bg-white/5 border border-white/10"
                        : "bg-gray-100 border border-gray-200"
                    }`}
                  >
                    <FaPlay
                      className={`w-6 h-6 md:w-7 md:h-7 ml-1 ${
                        isDarkMode ? "text-cyan-400/40" : "text-cyan-600/40"
                      }`}
                    />
                  </div>
                  <p
                    className={`text-sm font-medium ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    Bot Demo Video
                  </p>
                  <p
                    className={`text-xs mt-1 ${
                      isDarkMode ? "text-gray-600" : "text-gray-300"
                    }`}
                  >
                    Coming Soon
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default BotAccess;
