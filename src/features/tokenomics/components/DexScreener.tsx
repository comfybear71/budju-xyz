import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";

const DexScreener = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && iframeContainerRef.current) {
      // Animate iframe container on scroll
      gsap.fromTo(
        iframeContainerRef.current,
        {
          opacity: 0,
          y: 30,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: iframeContainerRef.current,
            start: "top 80%",
          },
        },
      );
    }
  }, []);

  return (
    <section
      ref={sectionRef}
      className="py-20 bg-gradient-to-b from-gray-900 to-budju-black"
    >
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-budju-blue">Dex</span>
            <span className="text-white">Screener</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Live trading data from DexScreener
          </p>
        </motion.div>

        <div
          ref={iframeContainerRef}
          className="max-w-5xl mx-auto rounded-xl overflow-hidden border border-gray-800 shadow-budju"
        >
          <div className="relative w-full" style={{ paddingBottom: "65%" }}>
            <iframe
              src="https://dexscreener.com/solana/6pmhvxg7a3wcekbpgjgmvivbg1nufsz9na7caqsjxmez?embed=1&loadChartSettings=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=0&chartType=usd&interval=15"
              className="absolute top-0 left-0 w-full h-full"
              title="BUDJU DexScreener Chart"
              frameBorder="0"
            ></iframe>
          </div>
        </div>

        <div className="text-center mt-6 text-gray-400 text-sm">
          Powered by DexScreener - Real-time DEX trading data and charts
        </div>
      </div>
    </section>
  );
};

export default DexScreener;
