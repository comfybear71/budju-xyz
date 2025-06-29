import { useRef } from "react";
import { useTheme } from "@/context/ThemeContext";

const TraderPlatform = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={sectionRef} className="py-20">
      <div className="budju-container">
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <h2
                className={`text-2xl md:text-4xl lg:text-5xl font-bold ${
                  isDarkMode ? "text-gray-200" : "text-white"
                }`}
              >
                BUDJU TRADER
              </h2>
              <div className="text-3xl md:text-5xl lg:text-6xl text-budju-pink font-bold">
                DCA BOT
              </div>
            </div>
            
            <p
              className={`text-xl md:text-2xl ${
                isDarkMode ? "text-gray-400" : "text-gray-300"
              } max-w-3xl mx-auto`}
            >
              Automate your crypto investing with our smart Dollar Cost Averaging Bot!
              <br />
              <span className="text-budju-blue font-semibold">
                Set it, forget it, and build wealth consistently over time.
              </span>
            </p>

            <div className={`mt-6 p-4 rounded-lg border-2 border-budju-pink bg-gradient-to-r ${isDarkMode ? 'from-budju-pink/10 to-budju-pink-dark/10' : 'from-budju-pink/20 to-budju-pink-dark/20'} backdrop-blur-sm`}>
              <div className="flex items-center justify-center space-x-2">
                <span className="text-2xl">🎟️</span>
                <p className={`text-lg font-bold ${isDarkMode ? 'text-gray-200' : 'text-white'}`}>
                  <span className="text-budju-pink">Exclusive Access:</span> Hold 1M BUDJU coins to unlock DCA Bot
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mt-12">
              <div className={`p-6 rounded-lg ${isDarkMode ? 'bg-gray-800/50' : 'bg-white/10'} backdrop-blur-sm`}>
                <div className="text-budju-pink text-2xl mb-2">🛠️</div>
                <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-white'}`}>
                  Automate Like a Pro
                </h3>
                <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-300'}`}>
                  Set your strategy and let our DCA Bot buy crypto for you on autopilot!
                </p>
              </div>

              <div className={`p-6 rounded-lg ${isDarkMode ? 'bg-gray-800/50' : 'bg-white/10'} backdrop-blur-sm`}>
                <div className="text-budju-pink text-2xl mb-2">📈</div>
                <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-white'}`}>
                  Ride the Dips
                </h3>
                <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-300'}`}>
                  Grab coins when prices are low and watch your portfolio grow as markets bounce back!
                </p>
              </div>

              <div className={`p-6 rounded-lg ${isDarkMode ? 'bg-gray-800/50' : 'bg-white/10'} backdrop-blur-sm`}>
                <div className="text-budju-pink text-2xl mb-2">💡</div>
                <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-white'}`}>
                  Smart Investing
                </h3>
                <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-300'}`}>
                  DCA takes the emotion out of trading—no FOMO, no panic, just consistent gains!
                </p>
              </div>

              <div className={`p-6 rounded-lg ${isDarkMode ? 'bg-gray-800/50' : 'bg-white/10'} backdrop-blur-sm`}>
                <div className="text-budju-pink text-2xl mb-2">😄</div>
                <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-white'}`}>
                  Easy-Peasy
                </h3>
                <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-300'}`}>
                  User-friendly platform perfect for crypto newbies and seasoned traders alike!
                </p>
              </div>
            </div>

            <div className="flex justify-center pt-8">
              <a
                href="https://trader.budjucoin.com/"
                target="_blank"
                rel="noopener noreferrer"
                className={`
                  inline-flex items-center px-8 py-4 text-lg font-bold rounded-lg
                  bg-gradient-to-r from-budju-pink to-budju-pink-dark
                  text-white hover:from-budju-pink-dark hover:to-budju-pink
                  transform hover:scale-105 transition-all duration-300
                  shadow-lg hover:shadow-xl
                `}
              >
                Start Your DCA Journey 🚀
                <svg
                  className="ml-2 w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TraderPlatform;