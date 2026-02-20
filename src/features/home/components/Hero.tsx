import { useRef } from "react";
import { Link } from "react-router";
import { useTheme } from "@/context/ThemeContext";
import { ROUTES } from "@/constants/routes";

const Hero = () => {
  const { isDarkMode } = useTheme();
  const heroRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={heroRef}
      className="relative min-h-[90vh] flex items-center pt-24 pb-12 px-4"
    >
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
        {/* Left Column — Text Content */}
        <div className="z-10 flex flex-col items-center lg:items-start text-center lg:text-left order-2 lg:order-1">
          {/* Live on Solana Badge */}
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-6 ${
              isDarkMode
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-green-500/15 text-green-700 border border-green-500/30"
            }`}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-green-pulse absolute inline-flex h-full w-full rounded-full bg-green-500"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            Live on Solana
          </div>

          {/* Heading */}
          <h1
            className={`font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            The Complete{" "}
            <span className="bg-gradient-to-r from-budju-pink via-budju-pink-light to-budju-blue bg-clip-text text-transparent">
              BUDJU
            </span>{" "}
            Ecosystem
          </h1>

          {/* Subtitle */}
          <p
            className={`text-lg md:text-xl mb-8 max-w-xl leading-relaxed ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            BUDJU isn't just a coin — it's a movement, a vibe, a lifestyle.
            Trade, stake, collect NFTs, and join the most vibrant community on Solana.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mb-10">
            <Link
              to={ROUTES.SWAP}
              className="budju-btn-gradient text-center text-base px-8 py-3.5"
            >
              Start Trading
            </Link>
            <a
              href="#ecosystem"
              className={`budju-btn-outline text-center text-base px-8 py-3.5 ${
                !isDarkMode ? "text-budju-pink-dark border-budju-pink-dark/50 hover:border-budju-pink-dark" : ""
              }`}
            >
              Explore Ecosystem
            </a>
          </div>

          {/* Quick Stats Row */}
          <div className="flex flex-wrap justify-center lg:justify-start gap-6 md:gap-10">
            <div>
              <p className={`text-sm font-medium ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>
                Network
              </p>
              <p className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Solana
              </p>
            </div>
            <div className={`w-px ${isDarkMode ? "bg-gray-700" : "bg-gray-300"}`}></div>
            <div>
              <p className={`text-sm font-medium ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>
                Total Supply
              </p>
              <p className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                1B BUDJU
              </p>
            </div>
            <div className={`w-px ${isDarkMode ? "bg-gray-700" : "bg-gray-300"}`}></div>
            <div>
              <p className={`text-sm font-medium ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>
                Community
              </p>
              <p className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Growing
              </p>
            </div>
          </div>
        </div>

        {/* Right Column — Mascot + Script Logo */}
        <div className="z-10 flex flex-col items-center justify-center order-1 lg:order-2 relative">
          {/* Pink glow behind mascot */}
          <div
            className="absolute w-72 h-72 md:w-96 md:h-96 rounded-full animate-pulse-glow"
            style={{
              background: isDarkMode
                ? "radial-gradient(circle, rgba(255,105,180,0.2) 0%, rgba(255,105,180,0) 70%)"
                : "radial-gradient(circle, rgba(255,105,180,0.15) 0%, rgba(255,105,180,0) 70%)",
              filter: "blur(30px)",
            }}
          ></div>

          {/* Mascot with float animation */}
          <div className="animate-float relative">
            <img
              src="/images/budju.png"
              alt="BUDJU Mascot"
              className="w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 relative z-10 drop-shadow-2xl"
            />
          </div>

          {/* Script Logo underneath */}
          <div className="relative -mt-10 md:-mt-16">
            <img
              src={
                isDarkMode
                  ? "/images/title_budju_pink.png"
                  : "/images/title_budju_white.png"
              }
              alt="BUDJU"
              className="w-full max-w-xs md:max-w-sm mx-auto relative z-10"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hero;
