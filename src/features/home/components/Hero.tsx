import { useRef } from "react";
import WalletConnect from "@components/common/WalletConnect";
// import { DEX_LINK } from "@constants/addresses";
import { useTheme } from "@/context/ThemeContext";

const Hero = () => {
  const { isDarkMode } = useTheme();
  const heroRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const titleRef = useRef<HTMLImageElement>(null);

  return (
    <div
      ref={heroRef}
      className="relative h-auto flex flex-col items-center justify-center pt-20 pb-0" // Changed min-h-screen to h-auto, kept pb-0
    >
      <div className="z-10 flex flex-col items-center justify-center text-center px-4 max-w-4xl mx-auto">
        {/* Logo */}
        <div className="mb-4 relative">
          {" "}
          {/* Reduced mb-6 to mb-4 */}
          <div
            className={`absolute inset-0 ${isDarkMode ? "bg-gray-200/10" : "bg-white/10"} rounded-full blur-xl`}
          ></div>
          <img
            ref={logoRef}
            src="/images/budju.png"
            alt="BUDJU Coin Logo"
            className="w-72 h-72 md:w-108 md:h-108 z-0"
          />
        </div>

        {/* Title */}
        <div className="mb-4 relative -mt-24 md:-mt-36">
          {" "}
          {/* Reduced mb-8 to mb-4 */}
          <div
            className={`absolute inset-0 ${
              isDarkMode
                ? "bg-gradient-to-r from-budju-pink/10 to-budju-pink-dark/10"
                : "bg-gradient-to-r from-budju-pink/20 to-budju-pink-dark/20"
            } rounded-lg blur-xl`}
          ></div>
          <img
            ref={titleRef}
            src={
              isDarkMode
                ? "/images/title_budju_pink.png"
                : "/images/title_budju_white.png"
            }
            alt="BUDJU Title"
            className="w-full max-w-lg mx-auto z-10 relative"
          />
        </div>

        <h2
          className={`text-xl md:text-3xl font-bold mb-4 ${isDarkMode ? "text-gray-200" : "text-white"} drop-shadow-md`} // Reduced mb-6 to mb-4
          style={{ textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}
        >
          Join the BUDJU Parade
        </h2>
        <p
          className={`text-lg md:text-xl ${isDarkMode ? "text-gray-300" : "text-white"} mb-4 max-w-2xl font-medium drop-shadow-md`} // Reduced mb-8 to mb-4
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
        >
          BUDJU isn't just a coin—it's a movement, a vibe, a lifestyle. Join the
          heavy hitters and reap massive benefits!
        </p>
        <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-6">
          <WalletConnect />
        </div>
      </div>
    </div>
  );
};

export default Hero;
