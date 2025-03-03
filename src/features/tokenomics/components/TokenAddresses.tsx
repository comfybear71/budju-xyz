import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { FaCopy, FaExternalLinkAlt } from "react-icons/fa";
import CopyToClipboard from "@components/common/CopyToClipboard";
import {
  TOKEN_ADDRESS,
  BURN_ADDRESS,
  BANK_ADDRESS,
  SOLSCAN_LINK,
} from "@constants/addresses";

const TokenAddresses = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && cardsRef.current) {
      const cards = cardsRef.current.querySelectorAll(".address-card");

      // Animate cards on scroll
      gsap.fromTo(
        cards,
        {
          opacity: 0,
          y: 30,
        },
        {
          opacity: 1,
          y: 0,
          stagger: 0.2,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: cardsRef.current,
            start: "top 80%",
          },
        },
      );
    }
  }, []);

  return (
    <section
      ref={sectionRef}
      className="py-20 bg-gradient-to-b from-budju-black to-gray-900"
    >
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-white">Important</span>{" "}
            <span className="text-budju-blue">Addresses</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Key BUDJU contract addresses and links
          </p>
        </motion.div>

        <div
          ref={cardsRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto"
        >
          {/* Token Address Card */}
          <div className="address-card budju-card hover:border-budju-blue transition-all duration-300">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-4">
                <span className="text-budju-blue">TOKEN</span>{" "}
                <span className="text-white">ADDRESS</span>
              </h3>

              <div className="bg-gray-800/50 p-3 rounded-lg mb-4">
                <div className="mb-2 text-gray-400 text-sm">
                  BUDJU main token contract:
                </div>
                <div className="flex items-center">
                  <code className="text-sm text-gray-300 font-mono truncate flex-1">
                    {TOKEN_ADDRESS}
                  </code>
                  <CopyToClipboard text={TOKEN_ADDRESS} />
                </div>
              </div>

              <div className="flex justify-between items-center mt-4">
                <span className="text-gray-400 text-sm">Network</span>
                <span className="text-budju-blue">Solana</span>
              </div>

              <div className="mt-6">
                <a
                  href={SOLSCAN_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 px-4 rounded-lg transition-colors duration-300"
                >
                  <FaExternalLinkAlt className="mr-2" />
                  View on Solscan
                </a>
              </div>
            </div>
          </div>

          {/* Burn Address Card */}
          <div className="address-card budju-card hover:border-budju-pink transition-all duration-300">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-4">
                <span className="text-budju-pink">BURN</span>{" "}
                <span className="text-white">ADDRESS</span>
              </h3>

              <div className="bg-gray-800/50 p-3 rounded-lg mb-4">
                <div className="mb-2 text-gray-400 text-sm">
                  BUDJU burn address:
                </div>
                <div className="flex items-center">
                  <code className="text-sm text-gray-300 font-mono truncate flex-1">
                    {BURN_ADDRESS}
                  </code>
                  <CopyToClipboard text={BURN_ADDRESS} />
                </div>
              </div>

              <div className="flex justify-between items-center mt-4">
                <span className="text-gray-400 text-sm">Total Burned</span>
                <span className="text-red-400">1,569,299 BUDJU</span>
              </div>

              <div className="mt-6">
                <a
                  href={`https://solscan.io/account/${BURN_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 px-4 rounded-lg transition-colors duration-300"
                >
                  <FaExternalLinkAlt className="mr-2" />
                  View Burn Address
                </a>
              </div>
            </div>
          </div>

          {/* Bank Address Card */}
          <div className="address-card budju-card hover:border-green-500 transition-all duration-300 lg:col-span-1 md:col-span-2 lg:col-start-3 lg:row-start-1">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-4">
                <span className="text-green-500">BANK</span>{" "}
                <span className="text-white">OF BUDJU</span>
              </h3>

              <div className="bg-gray-800/50 p-3 rounded-lg mb-4">
                <div className="mb-2 text-gray-400 text-sm">
                  Bank of BUDJU address:
                </div>
                <div className="flex items-center">
                  <code className="text-sm text-gray-300 font-mono truncate flex-1">
                    {BANK_ADDRESS}
                  </code>
                  <CopyToClipboard text={BANK_ADDRESS} />
                </div>
              </div>

              <div className="flex justify-between items-center mt-4">
                <span className="text-gray-400 text-sm">Last Burn Date</span>
                <span className="text-green-400">26th FEB 2025</span>
              </div>

              <div className="mt-6">
                <a
                  href={`https://solscan.io/account/${BANK_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 px-4 rounded-lg transition-colors duration-300"
                >
                  <FaExternalLinkAlt className="mr-2" />
                  View Bank Address
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-10 text-gray-400 text-sm max-w-2xl mx-auto">
          Note: Always verify contract addresses by checking official BUDJU
          social media channels. Never send funds directly to contract addresses
          - use DEX platforms for buying BUDJU.
        </div>
      </div>
    </section>
  );
};

export default TokenAddresses;
