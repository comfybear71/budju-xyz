import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { FaShoppingCart } from "react-icons/fa";
import Button from "@components/common/Button";
import { useProducts } from "../context/ProductContext";

interface ShopHeroProps {
  onCartClick: () => void;
}

const ShopHero = ({ onCartClick }: ShopHeroProps) => {
  const { cartCount } = useProducts();
  const heroRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (heroRef.current && imagesRef.current) {
      // Create hero animation timeline
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // Animate product images
      const productImages = imagesRef.current.querySelectorAll("img");
      tl.fromTo(
        productImages,
        {
          opacity: 0,
          y: 50,
          scale: 0.8,
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          stagger: 0.1,
          duration: 0.7,
          ease: "back.out(1.7)",
        },
      );

      // Add floating animation to images
      productImages.forEach((img, index) => {
        gsap.to(img, {
          y: 10 * (index % 2 ? 1 : -1),
          rotation: 3 * (index % 2 ? 1 : -1),
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
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
                <span className="text-budju-blue">SHOP</span>{" "}
                <span className="text-white">OF</span>{" "}
                <span className="text-budju-pink">BUDJU</span>
              </h1>

              <p className="text-xl text-gray-300 mb-8">
                Step into the world of BUDJU's Shop, where bold fashion meets
                unstoppable vibes! Rock your favorite stylish clothing and
                exclusive merchandise, all stamped with the iconic BUDJU logo.
              </p>

              <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                <Button as="a" href="#products" size="lg">
                  Shop Now
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  onClick={onCartClick}
                  className="relative"
                >
                  <FaShoppingCart className="mr-2" /> View Cart
                  {cartCount > 0 && (
                    <span className="absolute -top-2 -right-2 bg-budju-pink text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">
                      {cartCount}
                    </span>
                  )}
                </Button>
              </div>

              <div className="mt-8 py-4 px-6 bg-gray-900/70 rounded-xl border border-gray-800">
                <h3 className="text-xl font-bold text-budju-pink mb-2">
                  Payment Options
                </h3>
                <p className="text-gray-300">
                  Pay with Solana, BUDJU tokens, or credit card. NFT holders get
                  exclusive discounts!
                </p>
              </div>
            </motion.div>
          </div>

          {/* Hero Product Showcase */}
          <div ref={imagesRef} className="w-full lg:w-1/2 relative h-96 z-0">
            {/* Ladies Singlet */}
            <div className="absolute top-0 left-0 w-48 h-48 perspective-1000">
              <img
                src="src/assets/images/merch/ladies/singlets/pink-ladies-singlet-top.png"
                alt="Ladies Pink Singlet"
                className="w-full h-full object-contain rounded-xl shadow-lg border-2 border-gray-800"
              />
            </div>

            {/* Mens Singlet */}
            <div className="absolute top-20 right-0 w-48 h-48 perspective-1000">
              <img
                src="src/assets/images/merch/mens/singlets/black-logo-pink-bg-mens-singlet.jpg"
                alt="Mens Pink Singlet"
                className="w-full h-full object-contain rounded-xl shadow-lg border-2 border-gray-800"
              />
            </div>

            {/* Cap */}
            <div className="absolute bottom-0 right-16 w-40 h-40 perspective-1000">
              <img
                src="src/assets/images/merch/caps/pink-cap-white-logo.jpg"
                alt="BUDJU Cap"
                className="w-full h-full object-contain rounded-xl shadow-lg border-2 border-gray-800"
              />
            </div>

            {/* Coffee Mug */}
            <div className="absolute bottom-10 left-16 w-36 h-36 perspective-1000">
              <img
                src="src/assets/images/merch/items/coffee-mug.jpg"
                alt="BUDJU Coffee Mug"
                className="w-full h-full object-contain rounded-xl shadow-lg border-2 border-gray-800"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ShopHero;
