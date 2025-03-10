import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import WalletConnect from "@components/common/WalletConnect";
import { DEX_LINK } from "@constants/addresses";
import { useTheme } from "@/context/ThemeContext";

const Hero = () => {
  const { isDarkMode } = useTheme();
  const heroRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const titleContainerRef = useRef<HTMLDivElement>(null);
  const [activeTitle, setActiveTitle] = useState(0);
  const titles = [
    "/images/title_budju1.svg",
    "/images/title_budju2.svg",
    "/images/title_budju3.svg",
    "/images/title_budju4.svg",
    "/images/title_budju5.svg",
  ];

  useEffect(() => {
    if (heroRef.current && logoRef.current && titleContainerRef.current) {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(
        logoRef.current,
        { y: -100, opacity: 0 },
        { y: 0, opacity: 1, duration: 1 },
      );
      tl.fromTo(
        titleContainerRef.current,
        {
          opacity: 0,
          scale: 0.8,
          rotationX: 45,
          rotationY: 15,
          transformPerspective: 1000,
        },
        { opacity: 1, scale: 1, rotationX: 0, rotationY: 0, duration: 1.2 },
        "-=0.5",
      );
      gsap.to(logoRef.current, {
        y: 15,
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
      const titleAnimation = () => {
        gsap.to(titleContainerRef.current, {
          duration: 1.5,
          opacity: 0,
          ease: "power2.inOut",
          onComplete: () => {
            setActiveTitle((prev) => (prev + 1) % titles.length);
            gsap.fromTo(
              titleContainerRef.current,
              { opacity: 0 },
              { opacity: 1, duration: 0.5, ease: "power2.inOut" },
            );
          },
        });
      };
      const interval = setInterval(titleAnimation, 3000);
      return () => clearInterval(interval);
    }
  }, [titles.length]);

  return (
    <div
      ref={heroRef}
      className="relative min-h-screen flex flex-col items-center justify-center pt-20 pb-8"
    >
      <div className="z-10 flex flex-col items-center justify-center text-center px-4 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 relative"
        >
          <div
            className={`absolute inset-0 ${isDarkMode ? "bg-gray-200/10" : "bg-white/10"} rounded-full blur-xl`}
          ></div>
          <img
            ref={logoRef}
            src="/images/logo_girls.svg"
            alt="BUDJU Coin Logo"
            className="w-32 h-32 md:w-48 md:h-48 relative z-10 drop-shadow-lg"
          />
        </motion.div>
        <motion.div
          ref={titleContainerRef}
          className="mb-8 relative"
          style={{ transformStyle: "preserve-3d", perspective: 1000 }}
        >
          <div
            className={`absolute inset-0 ${
              isDarkMode
                ? "bg-gradient-to-r from-budju-pink/10 to-budju-pink-dark/10"
                : "bg-gradient-to-r from-budju-pink/20 to-budju-pink-dark/20"
            } rounded-lg blur-xl`}
          ></div>
          <img
            src={titles[activeTitle]}
            alt="BUDJU Title"
            className="w-full max-w-lg mx-auto drop-shadow-2xl relative z-10 transition-all duration-300"
            style={{ filter: "drop-shadow(0 0 15px rgba(255, 105, 180, 0.5))" }}
          />
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className={`text-xl md:text-3xl font-bold mb-6 ${isDarkMode ? "text-gray-200" : "text-white"} drop-shadow-md`}
          style={{ textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}
        >
          Join the BUDJU Parade
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className={`text-lg md:text-xl ${isDarkMode ? "text-gray-300" : "text-white"} mb-8 max-w-2xl font-medium drop-shadow-md`}
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
        >
          BUDJU isn't just a coin—it's a movement, a vibe, a lifestyle. Join the
          heavy hitters and reap massive benefits!
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-6"
        >
          <a
            href={DEX_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-block group relative font-bold text-lg py-1 px-8 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 hover:shadow-xl cursor-pointer ${
              isDarkMode
                ? "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                : "bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white"
            } border-2 ${
              isDarkMode ? "border-gray-600/20" : "border-white/20"
            } active:scale-95 active:shadow-md`}
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.transform = "scale(1.05)")
            }
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <span
              className={`absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_center,_rgba(255,255,255,${
                isDarkMode ? "0.2" : "0.3"
              })_0%,_rgba(255,255,255,0)_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
            />
            BUY BUDJU
          </a>
          <WalletConnect />
        </motion.div>
      </div>
    </div>
  );
};

export default Hero;
