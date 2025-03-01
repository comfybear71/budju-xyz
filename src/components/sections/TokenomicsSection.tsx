import { memo } from "react";
import { motion } from "framer-motion";
import { TokenData } from "@/types";
import { useAnimationObserver } from "@/hooks/useAnimationObserver";
import SectionTitle from "../common/SectionTitle";
import CopyButton from "../common/CopyButton";

interface TokenomicsSectionProps {
  tokenData: TokenData;
  isLoading: boolean;
}

const TokenomicsSection = ({
  tokenData,
  isLoading,
}: TokenomicsSectionProps) => {
  const [ref, controls] = useAnimationObserver();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <section className="py-12 bg-black" id="tokenomics">
      <div className="container px-4 mx-auto">
        <SectionTitle whiteText="Token" blueText="omics" />

        <motion.div
          ref={ref}
          className="max-w-3xl p-6 mx-auto border border-gray-800 rounded-lg bg-gradient-to-b from-gray-900 to-black"
          variants={containerVariants}
          initial="hidden"
          animate={controls}
        >
          <motion.div variants={itemVariants} className="mb-6">
            <p className="text-gray-300 text-center mb-8">
              Two budju's fell down a hole. One said, "It's dark in here isn't
              it?" The other replied, "I don't know; I can't see."
            </p>
          </motion.div>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-10 h-10 border-t-2 border-blue-500 rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              <motion.div variants={itemVariants} className="mb-6">
                <h3 className="mb-2 text-lg font-semibold">
                  <span className="text-white">TOTAL</span>{" "}
                  <span className="text-light-blue">SUPPLY</span>
                </h3>
                <p className="text-xl text-gray-200">
                  {tokenData?.supply.toLocaleString()} {tokenData?.symbol}
                </p>
              </motion.div>

              <motion.div variants={itemVariants} className="mb-6">
                <h3 className="mb-2 text-lg font-semibold">
                  <span className="text-light-blue">TOKEN</span>{" "}
                  <span className="text-white">ADDRESS</span>
                </h3>
                <CopyButton text="2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump" />
              </motion.div>

              <motion.div variants={itemVariants} className="mb-6">
                <h3 className="mb-2 text-lg font-semibold">
                  <span className="text-white">No. of TOKEN</span>{" "}
                  <span className="text-light-blue">HOLDERS</span>
                </h3>
                <p className="text-xl text-gray-200">
                  {tokenData?.holders.toLocaleString()}
                </p>
              </motion.div>

              <motion.div variants={itemVariants} className="mb-6">
                <h3 className="mb-2 text-lg font-semibold">
                  <span className="text-light-blue">MARKET</span>{" "}
                  <span className="text-white">CAP</span>
                </h3>
                <p className="text-xl text-gray-200">
                  $
                  {tokenData?.marketCap.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  {tokenData?.currency}
                </p>
              </motion.div>

              <motion.div variants={itemVariants} className="mb-6">
                <h3 className="mb-2 text-lg font-semibold">
                  <span className="text-white">BUDJU TOKEN</span>{" "}
                  <span className="text-light-blue">PRICE</span>
                </h3>
                <p className="text-xl text-gray-200">
                  $
                  {tokenData?.pricePerToken.toLocaleString(undefined, {
                    minimumFractionDigits: 8,
                    maximumFractionDigits: 8,
                  })}{" "}
                  {tokenData?.currency}
                </p>
              </motion.div>

              <motion.div variants={itemVariants} className="mb-6">
                <h3 className="mb-2 text-lg font-semibold">
                  <span className="text-light-blue">RAYDIUM </span>{" "}
                  <span className="text-white">VAULT</span>
                </h3>
                <p className="text-gray-200">QUANTITY: 89,405,685.28</p>
                <p className="text-gray-200">PERCENTAGE: 8.94%</p>
                <p className="text-gray-200">VALUE: $23,402.66 USDC</p>
              </motion.div>

              <motion.div variants={itemVariants} className="mb-6">
                <h3 className="mb-2 text-lg font-semibold">
                  <span className="text-light-blue">FIRST</span>{" "}
                  <span className="text-white">CREATED</span>
                </h3>
                <p className="text-gray-200">{tokenData?.firstCreated}</p>
              </motion.div>

              <motion.div variants={itemVariants}>
                <h3 className="mb-2 text-lg font-semibold">
                  <span className="text-white">SOLANA</span>{" "}
                  <span className="text-light-blue">BLOCKCHAIN</span>
                </h3>
                <a
                  href="https://solscan.io/token/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-light-blue hover:underline"
                >
                  View on Solscan
                </a>
              </motion.div>
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
};

export default memo(TokenomicsSection);
