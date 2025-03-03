import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { BudjuParadeBanner } from "@components/common/ScrollingBanner";
import Button from "@components/common/Button";
import { DEX_LINK } from "@constants/addresses";

const JoinParade = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && imageRef.current && textRef.current) {
      // Create a timeline for animations
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 80%",
          end: "center center",
          toggleActions: "play none none none",
        },
      });

      // Animate the budju image first
      tl.fromTo(
        imageRef.current,
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.8, ease: "back.out(1.7)" },
      );

      // Then animate the overlay text
      tl.fromTo(
        textRef.current.children,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, stagger: 0.2, duration: 0.6 },
        "-=0.4",
      );

      // Add a floating animation to the image
      gsap.to(imageRef.current, {
        y: 15,
        duration: 2.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }
  }, []);

  return (
    <div ref={sectionRef}>
      <div className="py-20 bg-gradient-to-b from-gray-900 to-budju-black">
        <div className="budju-container">
          <div className="relative max-w-2xl mx-auto">
            {/* Main Budju Image */}
            <div className="flex justify-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, type: "spring" }}
                className="relative"
              >
                <img
                  ref={imageRef}
                  src="/images/budju.png"
                  alt="Budju Mascot"
                  className="w-full max-w-md mx-auto"
                />

                {/* Overlay Text */}
                <div
                  ref={textRef}
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                             text-center text-white font-bold"
                >
                  <div className="text-2xl md:text-4xl lg:text-5xl shadow-black text-shadow-lg">
                    <span>JOIN THE BUDJU</span>
                  </div>
                  <div className="text-3xl md:text-5xl lg:text-6xl text-budju-pink shadow-black text-shadow-lg">
                    <span>PARADE</span>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Call to Action */}
            <div className="mt-12 text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="space-y-6"
              >
                <p className="text-xl md:text-2xl text-gray-300">
                  BUDJU isn't just a coin—it's a movement.
                  <br />
                  <span className="text-budju-blue font-semibold">
                    Join us and be part of something extraordinary!
                  </span>
                </p>

                <div className="flex justify-center">
                  <Button
                    as="a"
                    href={DEX_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="lg"
                    className="animate-pulse"
                  >
                    BUY BUDJU NOW
                  </Button>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Scrolling Banner */}
      <BudjuParadeBanner />
    </div>
  );
};

export default JoinParade;
