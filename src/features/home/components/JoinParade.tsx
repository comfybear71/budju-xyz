import { useRef } from "react";
import { BudjuParadeBanner } from "@components/common/ScrollingBanner";
// import Button from "@components/common/Button"; // Still imported but not used unless needed elsewhere
import WalletConnect from "@components/common/WalletConnect"; // Added import
import { useTheme } from "@/context/ThemeContext";

const JoinParade = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={sectionRef}>
      <div className="py-20">
        <div className="budju-container">
          <div className="relative max-w-2xl mx-auto">
            <div className="flex justify-center">
              <div className="relative">
                <img
                  ref={imageRef}
                  src="/images/logo_girls.svg"
                  alt="Budju Mascot"
                  className="w-full max-w-md mx-auto"
                />
              </div>
            </div>
            <div className="mt-12 text-center">
              <div ref={textRef} className="space-y-4">
                <div
                  className={`text-2xl md:text-4xl lg:text-5xl font-bold ${
                    isDarkMode ? "text-gray-200" : "text-white"
                  }`}
                >
                  JOIN THE BUDJU
                </div>
                <div className="text-3xl md:text-5xl lg:text-6xl text-budju-pink font-bold">
                  PARADE
                </div>
                <p
                  className={`text-xl md:text-2xl ${
                    isDarkMode ? "text-gray-400" : "text-gray-300"
                  }`}
                >
                  BUDJU isn't just a coin—it's a movement.
                  <br />
                  <span className="text-budju-blue font-semibold">
                    Join us and be part of something extraordinary!
                  </span>
                </p>
                <div className="flex justify-center">
                  <WalletConnect size="lg" /> {/* Replaced Button with WalletConnect */}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <BudjuParadeBanner />
    </div>
  );
};

export default JoinParade;