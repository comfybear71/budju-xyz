import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

const tabs = ["Swyftx", "Coinbase", "Coinspot"];

const StepByStep = () => {
  const { isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState(tabs[0]);

  const swyftxSteps = {
    toSolana: [
      "Visit swyftx.com.au and click 'Sign Up' to create an account.",
      "Complete KYC by providing your email, phone number, and a government-issued ID (e.g., passport or driver’s license). Verify your identity via the on-screen prompts.",
      "Deposit AUD using PayID: Go to 'Wallets' > 'Deposit AUD' > Select 'PayID'. Copy the unique PayID email provided and use it in your bank app to send funds instantly.",
      "Convert AUD to SOL: Navigate to 'Trade' > Select 'Buy' > Choose 'SOL' (Solana). Enter the amount of AUD to spend, review, and confirm the purchase.",
      "Send SOL to your Solana wallet: Open your Phantom wallet, copy your SOL address. In Swyftx, go to 'Wallets' > 'Withdraw' > Select 'SOL'. Paste your Phantom address, enter the amount, and confirm the withdrawal.",
    ],
    toBank: [
      "Send SOL from your Solana wallet to Swyftx: In Phantom, select 'Send', paste your Swyftx SOL deposit address (found in 'Wallets' > 'Deposit' > 'SOL'), enter the amount, and confirm.",
      "Convert SOL to AUD: Go to 'Trade' > 'Sell' > Select 'SOL'. Enter the amount to sell, review, and confirm the sale to AUD.",
      "Withdraw AUD to your bank: Navigate to 'Wallets' > 'Withdraw AUD' > Enter your bank details (BSB and account number). Specify the amount and submit. Funds typically arrive within 1-2 business days.",
    ],
  };

  const coinbaseSteps = {
    toSolana: [
      "Visit coinbase.com and click 'Sign Up' to create an account with your email and a password.",
      "Complete KYC: Go to 'Settings' > 'Identity Verification'. Upload a government-issued ID (e.g., passport or driver’s license) and follow the verification steps.",
      "Deposit AUD using PayID: Coinbase doesn’t directly support PayID, so use a linked bank account. Go to 'Assets' > 'Deposit' > 'AUD'. Link your bank via PayID manually through your bank app using Coinbase’s provided details (this may vary by region). Funds may take 1-3 business days.",
      "Convert AUD to SOL: Go to 'Trade' > Select 'Buy' > Choose 'SOL' (Solana). Enter the AUD amount, preview, and confirm the purchase.",
      "Send SOL to your Solana wallet: Open Phantom, copy your SOL address. In Coinbase, go to 'Assets' > 'Solana' > 'Send'. Paste the Phantom address, enter the amount, and confirm the transfer.",
    ],
    toBank: [
      "Send SOL from your Solana wallet to Coinbase: In Phantom, click 'Send', paste your Coinbase SOL deposit address (from 'Assets' > 'Solana' > 'Deposit'), enter the amount, and confirm.",
      "Convert SOL to AUD: Go to 'Trade' > 'Sell' > Select 'SOL'. Enter the amount to sell, preview, and confirm the sale to AUD.",
      "Withdraw AUD to your bank: Navigate to 'Assets' > 'Withdraw' > 'AUD'. Select your linked bank account, enter the amount, and confirm. Funds typically arrive in 1-3 business days.",
    ],
  };

  const coinspotSteps = {
    toSolana: [
      "Visit coinspot.com.au and click 'Register' to create an account with your email and a password.",
      "Complete KYC: Go to 'My Account' > 'Verification'. Submit your email, phone number, and a government-issued ID (e.g., driver’s license or passport). Follow the prompts to verify your identity.",
      "Deposit AUD using PayID: Go to 'Wallets' > 'Deposit AUD' > Select 'PayID'. Copy the provided PayID email and use it in your bank app to deposit funds instantly.",
      "Convert AUD to SOL: Navigate to 'Buy/Sell' > Search for 'SOL' (Solana). Select 'Buy SOL', enter the AUD amount, and confirm the purchase.",
      "Send SOL to your Solana wallet: Open Phantom, copy your SOL address. In Coinspot, go to 'Wallets' > 'Withdraw' > Select 'SOL'. Paste your Phantom address, enter the amount, and confirm the withdrawal.",
    ],
    toBank: [
      "Send SOL from your Solana wallet to Coinspot: In Phantom, click 'Send', paste your Coinspot SOL deposit address (from 'Wallets' > 'Deposit' > 'SOL'), enter the amount, and confirm.",
      "Convert SOL to AUD: Go to 'Buy/Sell' > Search for 'SOL'. Select 'Sell SOL', enter the amount to sell, and confirm the sale to AUD.",
      "Withdraw AUD to your bank: Navigate to 'Wallets' > 'Withdraw AUD' > Select 'Bank Transfer'. Enter your bank details (BSB and account number), specify the amount, and submit. Funds typically arrive within 1-2 business days.",
    ],
  };

  return (
    <section className="py-20">
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2
            className={`text-3xl md:text-4xl font-bold mb-4 ${
              isDarkMode ? "text-white" : "text-budju-white"
            }`}
          >
            How to Buy SOL and Cash Out
          </h2>
          <p
            className={`text-lg ${
              isDarkMode ? "text-gray-300" : "text-white"
            } max-w-3xl mx-auto`}
          >
            Follow these steps to set up a centralized exchange account, deposit fiat via PayID, convert to SOL, send to a Solana wallet, and reverse the process to cash out.
          </p>
        </motion.div>

        {/* Tabbed Interface */}
        <div className="max-w-4xl mx-auto">
          {/* Tab Headers */}
          <div className="flex">
            {tabs.map((tab, index) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 px-4 text-lg font-semibold rounded-t-lg transition-all duration-300 ${
                  activeTab === tab
                    ? `${
                        isDarkMode ? "bg-gray-100 text-gray-900" : "bg-white text-gray-900"
                      }`
                    : `${
                        isDarkMode
                          ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                      } ${
                        index === 0
                          ? "rounded-tl-lg"
                          : index === tabs.length - 1
                          ? "rounded-tr-lg"
                          : ""
                      }`
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div
            className={`p-6 rounded-b-lg ${
              isDarkMode ? "bg-gray-100 text-gray-900" : "bg-white text-gray-900"
            } border-t-0 shadow-md`}
          >
            <AnimatePresence mode="wait">
              {activeTab === "Swyftx" && (
                <motion.div
                  key="swyftx"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <h3 className="text-2xl font-bold mb-4">
                    Swyftx: From Fiat to Solana Wallet
                  </h3>
                  <ul className="list-disc pl-6 space-y-2">
                    {swyftxSteps.toSolana.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                  <h3 className="text-2xl font-bold mt-8 mb-4">
                    Swyftx: From Solana Wallet to Bank
                  </h3>
                  <ul className="list-disc pl-6 space-y-2">
                    {swyftxSteps.toBank.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                </motion.div>
              )}
              {activeTab === "Coinbase" && (
                <motion.div
                  key="coinbase"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <h3 className="text-2xl font-bold mb-4">
                    Coinbase: From Fiat to Solana Wallet
                  </h3>
                  <ul className="list-disc pl-6 space-y-2">
                    {coinbaseSteps.toSolana.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                  <h3 className="text-2xl font-bold mt-8 mb-4">
                    Coinbase: From Solana Wallet to Bank
                  </h3>
                  <ul className="list-disc pl-6 space-y-2">
                    {coinbaseSteps.toBank.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                </motion.div>
              )}
              {activeTab === "Coinspot" && (
                <motion.div
                  key="coinspot"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <h3 className="text-2xl font-bold mb-4">
                    Coinspot: From Fiat to Solana Wallet
                  </h3>
                  <ul className="list-disc pl-6 space-y-2">
                    {coinspotSteps.toSolana.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                  <h3 className="text-2xl font-bold mt-8 mb-4">
                    Coinspot: From Solana Wallet to Bank
                  </h3>
                  <ul className="list-disc pl-6 space-y-2">
                    {coinspotSteps.toBank.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-center mt-16"
        >
          <p
            className={
              isDarkMode
                ? "text-gray-400 mt-4 text-lg"
                : "text-white/80 mt-4 text-lg"
            }
          >
            Need help? Join our{" "}
            <a
              href="http://t.me/budjucoingroup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-budju-blue hover:underline"
            >
              Telegram
            </a>{" "}
            for support!
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default StepByStep;