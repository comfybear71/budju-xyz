import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import Button from "@components/common/Button";
import { FaExchangeAlt, FaInfoCircle, FaCoins } from "react-icons/fa";
import { BANK_ADDRESS } from "@constants/addresses";
import CopyToClipboard from "@components/common/CopyToClipboard";
import WalletConnect from "@components/common/WalletConnect";
import { particleBurst } from "@/lib/utils/animation";

const BankDeposit = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const coinRef = useRef<HTMLDivElement>(null);
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState("SOL");
  const [isConnected, setIsConnected] = useState(false);

  // Check wallet connection status (simulated for now)
  useEffect(() => {
    const walletConnected =
      localStorage.getItem("budjuWalletConnected") === "true";
    setIsConnected(walletConnected);
  }, []);

  // Coin animation
  useEffect(() => {
    if (coinRef.current) {
      gsap.to(coinRef.current, {
        y: -10,
        duration: 1.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      // Add rotation
      gsap.to(coinRef.current, {
        rotateY: 360,
        duration: 8,
        repeat: -1,
        ease: "none",
      });
    }
  }, []);

  // Form animations
  useEffect(() => {
    if (formRef.current) {
      const formElements = formRef.current.querySelectorAll(".form-element");

      gsap.fromTo(
        formElements,
        {
          opacity: 0,
          y: 20,
        },
        {
          opacity: 1,
          y: 0,
          stagger: 0.1,
          duration: 0.5,
          scrollTrigger: {
            trigger: formRef.current,
            start: "top 80%",
          },
        },
      );
    }
  }, []);

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // For demo purposes, show success animation
    if (sectionRef.current) {
      // Create particle burst effect
      particleBurst(sectionRef.current, {
        count: 30,
        colors: ["#FF69B4", "#87CEFA", "#FFD700"],
        size: 10,
        duration: 1.5,
      });

      // Show success message
      alert(
        `Thank you for your deposit of ${amount} ${token} to the Bank of BUDJU!`,
      );

      // Reset form
      setAmount("");
    }
  };

  return (
    <section
      ref={sectionRef}
      id="deposit"
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
            <span className="text-white">MAKE A</span>{" "}
            <span className="text-budju-pink">DEPOSIT</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Support the BUDJU ecosystem by making a deposit to the Bank of BUDJU
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
          {/* Deposit Form */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <form
              ref={formRef}
              onSubmit={handleSubmit}
              className="budju-card p-6"
            >
              <h3 className="text-2xl font-bold mb-6 text-center">
                <span className="text-budju-blue">Fuel the</span>{" "}
                <span className="text-white">Future</span>
              </h3>

              {/* Connect Wallet First */}
              {!isConnected && (
                <div className="form-element bg-gray-800/50 rounded-xl p-6 mb-6 text-center">
                  <p className="text-gray-300 mb-4">
                    Connect your wallet to make a deposit
                  </p>
                  <WalletConnect fullWidth />
                </div>
              )}

              {/* Token Selection */}
              <div className="form-element mb-6">
                <label className="block text-gray-400 mb-2">Select Token</label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setToken("SOL")}
                    className={`flex items-center justify-center py-3 px-4 rounded-lg transition-colors ${
                      token === "SOL"
                        ? "bg-budju-blue text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    <img
                      src="/images/tokens/sol.png"
                      alt="SOL"
                      className="w-5 h-5 mr-2"
                    />
                    SOL
                  </button>
                  <button
                    type="button"
                    onClick={() => setToken("BUDJU")}
                    className={`flex items-center justify-center py-3 px-4 rounded-lg transition-colors ${
                      token === "BUDJU"
                        ? "bg-budju-pink text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    <img
                      src="/images/logo.png"
                      alt="BUDJU"
                      className="w-5 h-5 mr-2"
                    />
                    BUDJU
                  </button>
                  <button
                    type="button"
                    onClick={() => setToken("USDC")}
                    className={`flex items-center justify-center py-3 px-4 rounded-lg transition-colors ${
                      token === "USDC"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    <img
                      src="/images/tokens/usdc.png"
                      alt="USDC"
                      className="w-5 h-5 mr-2"
                    />
                    USDC
                  </button>
                </div>
              </div>

              {/* Amount Input */}
              <div className="form-element mb-6">
                <label className="block text-gray-400 mb-2">Amount</label>
                <div className="relative">
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={!isConnected}
                    placeholder={`Enter amount in ${token}`}
                    className="budju-input w-full"
                  />
                  <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400">
                    {token}
                  </span>
                </div>
              </div>

              {/* Deposit Method */}
              <div className="form-element mb-6">
                <label className="block text-gray-400 mb-2">
                  Deposit Method
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-gray-800 p-4 rounded-lg">
                    <div className="flex items-center">
                      <input
                        type="radio"
                        id="wallet"
                        name="method"
                        value="wallet"
                        defaultChecked
                        className="mr-3"
                      />
                      <label htmlFor="wallet" className="flex-1">
                        <div className="text-white font-medium">
                          Direct wallet deposit
                        </div>
                        <div className="text-gray-400 text-sm">
                          Deposit directly from your connected wallet
                        </div>
                      </label>
                    </div>
                  </div>
                  <div className="bg-gray-800 p-4 rounded-lg">
                    <div className="flex items-center">
                      <input
                        type="radio"
                        id="manual"
                        name="method"
                        value="manual"
                        className="mr-3"
                      />
                      <label htmlFor="manual" className="flex-1">
                        <div className="text-white font-medium">
                          Manual transfer
                        </div>
                        <div className="text-gray-400 text-sm">
                          Send tokens directly to the bank address
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="form-element mb-6 text-sm text-gray-400 bg-gray-800/30 p-4 rounded-lg flex items-start">
                <FaInfoCircle className="text-budju-blue mr-2 mt-1 flex-shrink-0" />
                <div>
                  <p className="mb-2">
                    The Bank of BUDJU plays a crucial role in maintaining the
                    ecosystem's health by:
                  </p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Regularly burning tokens to reduce supply</li>
                    <li>Providing liquidity to DEX platforms</li>
                    <li>Supporting development of the BUDJU platform</li>
                  </ul>
                </div>
              </div>

              {/* Submit Button */}
              <div className="form-element">
                <Button
                  type="submit"
                  disabled={!isConnected || !amount}
                  fullWidth
                  size="lg"
                >
                  Make Deposit
                </Button>

                {!isConnected && (
                  <p className="text-center text-gray-400 text-sm mt-3">
                    Connect your wallet to make a deposit
                  </p>
                )}
              </div>
            </form>
          </motion.div>

          {/* Manual Deposit Info */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-center flex flex-col items-center"
          >
            <div ref={coinRef} className="mb-8 relative perspective-1000">
              <img
                src="/images/logo.png"
                alt="BUDJU Coin"
                className="w-40 h-40"
              />
            </div>

            <div className="budju-card p-6 text-left w-full">
              <h3 className="text-xl font-bold mb-4 text-center">
                <span className="text-white">Manual</span>{" "}
                <span className="text-budju-pink">Transfer</span>
              </h3>

              <p className="text-gray-300 mb-6">
                You can also deposit directly by sending tokens to the Bank of
                BUDJU address:
              </p>

              <div className="bg-gray-800/50 p-3 rounded-lg mb-6">
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

              <div className="space-y-3 mb-6">
                <div className="bg-gray-800/30 p-3 rounded-lg flex items-center">
                  <FaCoins className="text-yellow-500 mr-3" />
                  <div>
                    <div className="text-white">Accepted tokens:</div>
                    <div className="text-gray-400 text-sm">
                      SOL, BUDJU, USDC, and other Solana tokens
                    </div>
                  </div>
                </div>

                <div className="bg-gray-800/30 p-3 rounded-lg flex items-center">
                  <FaExchangeAlt className="text-green-500 mr-3" />
                  <div>
                    <div className="text-white">Transaction note:</div>
                    <div className="text-gray-400 text-sm">
                      Include "BUDJU BANK" in transaction memo if available
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center text-gray-300 text-sm">
                <p className="font-medium text-budju-blue mb-1">
                  BIG DEPOSITS = EPIC REWARDS
                </p>
                <p>
                  All depositors will be recognized in future BUDJU project
                  developments!
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default BankDeposit;
