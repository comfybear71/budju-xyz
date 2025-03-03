import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import Button from "@components/common/Button";
import WalletConnect from "@components/common/WalletConnect";
import { DEX_LINK } from "@constants/addresses";

const Hero = () => {
  const heroRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLImageElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (heroRef.current && titleRef.current && logoRef.current) {
      // Create hero animation timeline
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // Animate logo
      tl.fromTo(
        logoRef.current,
        { y: -100, opacity: 0 },
        { y: 0, opacity: 1, duration: 1 },
      );

      // Animate title
      tl.fromTo(
        titleRef.current,
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.8 },
        "-=0.5",
      );

      // Add floating animation to logo
      gsap.to(logoRef.current, {
        y: 15,
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }
  }, []);

  return (
    <div
      ref={heroRef}
      className="relative overflow-hidden min-h-screen flex flex-col items-center justify-center pt-20 pb-8"
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-budju-black via-budju-black to-budju-black/80 z-0"></div>

      {/* Hero content */}
      <div className="z-10 flex flex-col items-center justify-center text-center px-4 max-w-4xl mx-auto">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <img
            ref={logoRef}
            src="src/assets/images/logo.png"
            alt="BUDJU Coin Logo"
            className="w-32 h-32 md:w-48 md:h-48"
          />
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-8"
        >
          <img
            ref={titleRef}
            src="src/assets/images/title_budju.png"
            alt="BUDJU Title"
            className="w-full max-w-lg mx-auto"
          />
        </motion.div>

        {/* Tagline */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-xl md:text-3xl font-bold mb-6 text-gradient"
        >
          Join the BUDJU Parade
        </motion.h2>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="text-lg md:text-xl text-gray-300 mb-8 max-w-2xl"
        >
          BUDJU isn't just a coin—it's a movement, a vibe, a lifestyle. Join the
          heavy hitters and reap massive benefits!
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-6"
        >
          <Button
            as="a"
            href={DEX_LINK}
            target="_blank"
            rel="noopener noreferrer"
            size="lg"
          >
            BUY BUDJU
          </Button>

          <WalletConnect />
        </motion.div>
      </div>

      {/* Decorative elements */}
      <div className="absolute -bottom-16 -left-16 w-32 h-32 md:w-64 md:h-64 bg-budju-pink/20 rounded-full blur-3xl"></div>
      <div className="absolute -top-16 -right-16 w-32 h-32 md:w-64 md:h-64 bg-budju-blue/20 rounded-full blur-3xl"></div>
    </div>
  );
};

export default Hero;
