import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import Button from "@components/common/Button";
import WalletConnect from "@components/common/WalletConnect";

const NFTHero = () => {
  const heroRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const imagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (heroRef.current && titleRef.current && imagesRef.current) {
      // Create animation timeline
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // Animate title
      tl.fromTo(
        titleRef.current,
        { opacity: 0, y: -50 },
        { opacity: 1, y: 0, duration: 1 },
      );

      // Animate NFT images
      const nftImages = imagesRef.current.querySelectorAll("img");
      tl.fromTo(
        nftImages,
        { opacity: 0, scale: 0.8, y: 30 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          stagger: 0.15,
          duration: 0.7,
          ease: "back.out(1.7)",
        },
        "-=0.5",
      );

      // Add floating animation to NFT images
      nftImages.forEach((img, index) => {
        gsap.to(img, {
          y: 10 * (index % 2 ? 1 : -1),
          rotation: 5 * (index % 2 ? 1 : -1),
          duration: 2 + index * 0.2,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: index * 0.1,
        });
      });
    }
  }, []);

  return (
    <section
      ref={heroRef}
      className="pt-28 pb-16 bg-gradient-to-b from-budju-black to-gray-900 overflow-hidden"
    >
      <div className="budju-container relative">
        {/* Decorative elements */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-budju-pink/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-32 -left-20 w-64 h-64 bg-budju-blue/20 rounded-full blur-3xl"></div>

        <div className="flex flex-col lg:flex-row items-center gap-12">
          {/* Hero Text */}
          <div className="w-full lg:w-1/2 lg:pr-6 z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1
                ref={titleRef}
                className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6"
              >
                <span className="text-budju-blue">BUDJU</span>{" "}
                <span className="text-white">NFT</span>{" "}
                <span className="text-budju-pink">COLLECTION</span>
              </h1>

              <p className="text-xl text-gray-300 mb-8">
                Own a piece of the BUDJU universe with our exclusive,
                limited-edition NFT collection. Each BUDJU NFT is uniquely
                designed with special traits and benefits for holders.
              </p>

              <p className="text-lg text-budju-blue mb-8">
                <span className="font-bold text-white">Coming Soon:</span> Mint
                your very own BUDJU character once we reach 1,000 token holders!
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button as="a" href="#mint" size="lg">
                  Mint Details
                </Button>

                <WalletConnect />
              </div>
            </motion.div>
          </div>

          {/* Hero NFT Images */}
          <div ref={imagesRef} className="w-full lg:w-1/2 relative h-96 z-0">
            <div className="absolute top-0 left-0 w-60 h-60 perspective-1000">
              <img
                src="/images/budju00.png"
                alt="BUDJU NFT 1"
                className="w-full h-full object-contain rounded-xl shadow-lg border-2 border-gray-800"
              />
            </div>

            <div className="absolute top-20 right-0 w-56 h-56 perspective-1000">
              <img
                src="/images/budju01.png"
                alt="BUDJU NFT 2"
                className="w-full h-full object-contain rounded-xl shadow-lg border-2 border-gray-800"
              />
            </div>

            <div className="absolute bottom-0 right-16 w-64 h-64 perspective-1000">
              <img
                src="/images/budju02.png"
                alt="BUDJU NFT 3"
                className="w-full h-full object-contain rounded-xl shadow-lg border-2 border-gray-800"
              />
            </div>

            <div className="absolute bottom-10 left-16 w-52 h-52 perspective-1000">
              <img
                src="/images/budju03.png"
                alt="BUDJU NFT 4"
                className="w-full h-full object-contain rounded-xl shadow-lg border-2 border-gray-800"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default NFTHero;
