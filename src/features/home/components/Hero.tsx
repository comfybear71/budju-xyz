import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import WalletConnect from "@components/common/WalletConnect";
import { DEX_LINK } from "@constants/addresses";
import Web3Background from "@components/common/Web3Background";

const Hero = () => {
  const heroRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const titleContainerRef = useRef<HTMLDivElement>(null);

  // State to cycle through different title variants
  const [activeTitle, setActiveTitle] = useState(0);
  const titles = [
    "/images/title_budju1.svg",
    "/images/title_budju2.svg",
    "/images/title_budju3.svg",
    "/images/title_budju4.svg",
  ];

  useEffect(() => {
    if (heroRef.current && logoRef.current && titleContainerRef.current) {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // Animate logo
      tl.fromTo(
        logoRef.current,
        { y: -100, opacity: 0 },
        { y: 0, opacity: 1, duration: 1 },
      );

      // Animate title container with 3D rotation
      tl.fromTo(
        titleContainerRef.current,
        {
          opacity: 0,
          scale: 0.8,
          rotationX: 45,
          rotationY: 15,
          transformPerspective: 1000,
        },
        {
          opacity: 1,
          scale: 1,
          rotationX: 0,
          rotationY: 0,
          duration: 1.2,
        },
        "-=0.5",
      );

      // Logo floating animation
      gsap.to(logoRef.current, {
        y: 15,
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      // Title cycling animation
      const titleAnimation = () => {
        gsap.to(titleContainerRef.current, {
          rotationY: 360,
          duration: 1.5,
          ease: "power2.inOut",
          onComplete: () => {
            setActiveTitle((prev) => (prev + 1) % titles.length);
            gsap.set(titleContainerRef.current, { rotationY: 0 });
          },
        });
      };

      // Start title cycling every 3 seconds
      const interval = setInterval(titleAnimation, 3000);
      return () => clearInterval(interval);
    }
  }, [titles.length]);

  return (
    <Web3Background>
      <div
        ref={heroRef}
        className="relative min-h-screen flex flex-col items-center justify-center pt-20 pb-8"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30 z-0"></div>

        <div className="z-10 flex flex-col items-center justify-center text-center px-4 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 relative"
          >
            <div className="absolute inset-0 bg-white/10 rounded-full blur-xl"></div>
            <img
              ref={logoRef}
              src="/images/logo.png"
              alt="BUDJU Coin Logo"
              className="w-32 h-32 md:w-48 md:h-48 relative z-10 drop-shadow-lg"
            />
          </motion.div>

          {/* Title container with 3D effects */}
          <motion.div
            ref={titleContainerRef}
            className="mb-8 relative"
            style={{
              transformStyle: "preserve-3d",
              perspective: 1000,
            }}
          >
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-budju-pink/20 to-budju-pink-dark/20 rounded-lg blur-xl"></div>

            <img
              src={titles[activeTitle]}
              alt="BUDJU Title"
              className="w-full max-w-lg mx-auto drop-shadow-2xl relative z-10 transition-all duration-300"
              style={{
                filter: "drop-shadow(0 0 15px rgba(255, 105, 180, 0.5))",
              }}
            />
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="text-xl md:text-3xl font-bold mb-6 text-white drop-shadow-md"
            style={{ textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}
          >
            Join the BUDJU Parade
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="text-lg md:text-xl text-white mb-8 max-w-2xl font-medium drop-shadow-md"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
          >
            BUDJU isn't just a coin—it's a movement, a vibe, a lifestyle. Join
            the heavy hitters and reap massive benefits!
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
              className="inline-block text-white font-bold text-lg py-3 px-8 rounded-budju 
                bg-gradient-to-r from-budju-pink-dark to-budju-pink 
                hover:from-budju-pink hover:to-budju-pink-dark
                transition-all duration-300 transform hover:scale-105 hover:translate-y-[-2px]
                shadow-lg hover:shadow-xl border-2 border-white/20 
                active:scale-95 active:shadow-md"
              style={{
                textShadow: "0 1px 2px rgba(0,0,0,0.3)",
              }}
            >
              BUY BUDJU
            </a>
            <WalletConnect />
          </motion.div>
        </div>

        <div className="absolute bottom-10 left-10 w-24 h-24 bg-white/10 rounded-full blur-xl animate-pulse-slow"></div>
        <div className="absolute top-20 right-10 w-16 h-16 bg-white/10 rounded-full blur-xl animate-pulse-slow"></div>
      </div>
    </Web3Background>
  );
};

export default Hero;
