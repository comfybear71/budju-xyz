import { memo } from "react";
import { motion } from "framer-motion";
import { BankData } from "@/types";
import { useAnimationObserver } from "@/hooks/useAnimationObserver";
import SectionTitle from "../common/SectionTitle";
import CopyButton from "../common/CopyButton";

interface BankSectionProps {
  bankData: BankData;
}

const BankSection = ({ bankData }: BankSectionProps) => {
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
    <section className="py-12 bg-black" id="bank-of-budju">
      <div className="container px-4 mx-auto">
        <SectionTitle whiteText="Bank of" blueText="Budju" />

        <motion.div
          ref={ref}
          className="max-w-3xl p-6 mx-auto border border-gray-800 rounded-lg bg-gradient-to-b from-gray-900 to-black"
          variants={containerVariants}
          initial="hidden"
          animate={controls}
        >
          <motion.div variants={itemVariants} className="mb-8">
            <p className="text-gray-300">
              <b>
                The Bank of Budju, is setup by the Dev Team, that uses any
                revenue derived from, Merchandise, Staked Solana Interest, VC's,
                NFT's to invest in the development of the Budju platform, and to
                provide liquidity to the Solana blockchain. The Bank of Budju
                will buyback and burn, too create scarcity and increase token
                price:
              </b>
            </p>
          </motion.div>

          <motion.div variants={itemVariants} className="mb-6">
            <h3 className="mb-2 text-lg font-semibold">
              <span className="text-light-blue">BURNED TOKEN</span>{" "}
              <span className="text-white">ADDRESS</span>
            </h3>
            <CopyButton text={bankData.burnedAddress} />
          </motion.div>

          <motion.div variants={itemVariants} className="mb-6">
            <h3 className="mb-2 text-lg font-semibold">
              <span className="text-light-blue">TOTAL</span>
              <span className="text-white">TOKENS</span>{" "}
              <span className="text-light-blue">BURNED</span>
            </h3>
            <p className="text-xl text-gray-200">
              {bankData.burnedTokens.toLocaleString()} BUDJU
            </p>
          </motion.div>

          <motion.div variants={itemVariants} className="mb-6">
            <h3 className="mb-2 text-lg font-semibold">
              <span className="text-light-blue">TOTAL</span>{" "}
              <span className="text-white">SUPPLY</span>
            </h3>
            <p className="text-xl text-gray-200">
              1,000,000,000 - {bankData.burnedTokens.toLocaleString()} ={" "}
              {bankData.totalSupply.toLocaleString()} BUDJU
            </p>
          </motion.div>

          <motion.div variants={itemVariants} className="mb-6">
            <h3 className="mb-2 text-lg font-semibold">
              <span className="text-light-blue">BANK OF BUDJU</span>{" "}
              <span className="text-white">ADDRESS</span>
            </h3>
            <p className="text-xl text-gray-200">
              <a
                href={`https://solscan.io/account/${bankData.bankAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-light-blue hover:underline"
              >
                bankofbudju.sol
              </a>
            </p>
          </motion.div>

          <motion.div variants={itemVariants} className="mb-6">
            <h3 className="mb-2 text-lg font-semibold">
              <span className="text-white">TOKENS</span>{" "}
              <span className="text-light-blue">HELD</span>
            </h3>
            <ul className="ml-6 list-disc text-gray-200">
              {bankData.tokensHeld.map((token, index) => (
                <li key={index}>
                  <p>{token}</p>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div variants={itemVariants} className="mb-6">
            <h3 className="mb-2 text-lg font-semibold">
              <span className="text-light-blue">BUY BACK</span>{" "}
              <span className="text-white">AMOUNT</span>
            </h3>
            <p className="text-xl text-gray-200">{bankData.buyBackAmount}</p>
          </motion.div>

          <motion.div variants={itemVariants} className="mb-6">
            <h3 className="mb-2 text-lg font-semibold">
              <span className="text-white">CONTRIBUTIONS &</span>{" "}
              <span className="text-light-blue">DONATIONS</span>{" "}
              <span className="text-white">(Support the team)</span>
            </h3>
            <CopyButton text={bankData.donationsAddress} />
          </motion.div>

          <motion.div variants={itemVariants}>
            <h3 className="mb-2 text-lg font-semibold">
              <span className="text-light-blue">LATEST BU</span>
              <span className="text-white">RN DATE</span>
            </h3>
            <p className="text-xl text-gray-200">{bankData.lastBurnDate}</p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default memo(BankSection);
