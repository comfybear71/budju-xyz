import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  FaWallet,
  FaSignOutAlt,
  FaChevronDown,
  FaCopy,
  FaExternalLinkAlt,
} from "react-icons/fa";
import Button from "@components/common/Button";
import { useWallet } from "@hooks/useWallet";
import { WalletName } from "@lib/web3/connection";
import { TOKEN_ADDRESS } from "@constants/addresses";

interface WalletConnectProps {
  fullWidth?: boolean;
  size?: "sm" | "md" | "lg";
}

// Wallet icons and names
const walletConfig: Record<WalletName, { name: string; logo: string }> = {
  phantom: {
    name: "Phantom",
    logo: "src/assets/images/wallets/phantom.png",
  },
  jupiter: {
    name: "Jupiter",
    logo: "src/assets/images/wallets/jupiter.png",
  },
  solflare: {
    name: "Solflare",
    logo: "src/assets/images/wallets/solflare.png",
  },
  other: {
    name: "Other",
    logo: "src/assets/images/wallets/default.png",
  },
};

const WalletConnect = ({
  fullWidth = false,
  size = "md",
}: WalletConnectProps) => {
  const {
    connection,
    connecting,
    availableWallets,
    connect,
    disconnect,
    formatAddress,
  } = useWallet();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showCopied, setShowCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Connect to a wallet
  const handleConnect = (walletName: WalletName) => {
    connect(walletName);
    setIsMenuOpen(false);
  };

  // Disconnect from wallet
  const handleDisconnect = () => {
    disconnect();
    setIsMenuOpen(false);
  };

  // Copy wallet address to clipboard
  const copyAddress = () => {
    if (connection.wallet?.address) {
      navigator.clipboard.writeText(connection.wallet.address);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    }
  };

  // Open wallet on Solscan
  const openOnSolscan = () => {
    if (connection.wallet?.address) {
      window.open(
        `https://solscan.io/account/${connection.wallet.address}`,
        "_blank",
      );
    }
  };

  // Toggle wallet dropdown menu
  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  // Size specific classes
  const sizeClasses = {
    sm: "text-sm py-1.5 px-3",
    md: "py-2 px-4",
    lg: "text-lg py-3 px-6",
  };

  return (
    <div
      className={`relative ${fullWidth ? "w-full" : "inline-block"}`}
      ref={menuRef}
    >
      {!connection.connected ? (
        <>
          <Button
            variant="secondary"
            onClick={() => setIsMenuOpen(true)}
            fullWidth={fullWidth}
            size={size}
            leftIcon={<FaWallet />}
            disabled={connecting}
          >
            {connecting ? "Connecting..." : "Connect Wallet"}
          </Button>

          {/* Wallet Selection Dropdown */}
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                className={`absolute z-50 right-0 mt-2 w-64 bg-gray-900 rounded-xl overflow-hidden shadow-xl border border-gray-800 ${
                  fullWidth ? "left-0" : ""
                }`}
              >
                <div className="p-4 border-b border-gray-800">
                  <h3 className="text-white font-bold">Connect Wallet</h3>
                  <p className="text-gray-400 text-sm">
                    Select a wallet to connect to BUDJU
                  </p>
                </div>

                <div className="p-2 max-h-60 overflow-y-auto">
                  {availableWallets.length > 0 ? (
                    availableWallets.map((wallet) => (
                      <button
                        key={wallet}
                        onClick={() => handleConnect(wallet)}
                        className="flex items-center w-full p-3 rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        <img
                          src={walletConfig[wallet].logo}
                          alt={walletConfig[wallet].name}
                          className="w-8 h-8 mr-3"
                        />
                        <span className="text-white">
                          {walletConfig[wallet].name}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-center text-gray-400">
                      No compatible wallets found.
                      <a
                        href="https://phantom.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mt-2 text-budju-blue hover:underline"
                      >
                        Install Phantom
                      </a>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        <>
          <button
            onClick={toggleMenu}
            className={`flex items-center justify-center space-x-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors ${
              sizeClasses[size]
            } ${fullWidth ? "w-full" : ""}`}
          >
            <img
              src={walletConfig[connection.wallet?.name || "other"].logo}
              alt="Wallet"
              className="w-5 h-5"
            />
            <span className="font-mono">
              {formatAddress(connection.wallet?.address || "")}
            </span>
            <FaChevronDown
              className={`transition-transform duration-300 ${isMenuOpen ? "rotate-180" : ""}`}
            />
          </button>

          {/* Connected Wallet Dropdown */}
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                className={`absolute z-50 right-0 mt-2 w-72 bg-gray-900 rounded-xl overflow-hidden shadow-xl border border-gray-800 ${
                  fullWidth ? "left-0" : ""
                }`}
              >
                <div className="p-4 border-b border-gray-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-white font-bold">Connected</h3>
                    <span className="bg-green-500/20 text-green-500 text-xs px-2 py-1 rounded-full">
                      {connection.network}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center">
                    <img
                      src={
                        walletConfig[connection.wallet?.name || "other"].logo
                      }
                      alt="Wallet"
                      className="w-6 h-6 mr-2"
                    />
                    <span className="text-white">
                      {walletConfig[connection.wallet?.name || "other"].name}
                    </span>
                  </div>
                </div>

                {/* Wallet Address */}
                <div className="p-4 border-b border-gray-800">
                  <div className="text-xs text-gray-400 mb-1">Address</div>
                  <div className="flex items-center justify-between">
                    <span className="text-white font-mono text-sm truncate">
                      {connection.wallet?.address.substring(0, 14)}...
                    </span>
                    <div className="flex space-x-2">
                      <button
                        onClick={copyAddress}
                        className="p-1.5 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors relative"
                      >
                        <FaCopy className="text-budju-blue" />
                        {showCopied && (
                          <span className="absolute top-full right-0 mt-1 px-2 py-1 bg-green-500 text-white text-xs rounded">
                            Copied!
                          </span>
                        )}
                      </button>
                      <button
                        onClick={openOnSolscan}
                        className="p-1.5 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        <FaExternalLinkAlt className="text-budju-blue" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Balances */}
                <div className="p-4 border-b border-gray-800">
                  <div className="text-xs text-gray-400 mb-2">Balances</div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <img
                          src="src/assets/images/tokens/sol.png"
                          alt="SOL"
                          className="w-5 h-5 mr-2"
                        />
                        <span className="text-white">SOL</span>
                      </div>
                      <span className="text-white">
                        {connection.wallet?.balance.sol.toFixed(4)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <img
                          src="src/assets/images/logo.png"
                          alt="BUDJU"
                          className="w-5 h-5 mr-2"
                        />
                        <span className="text-white">BUDJU</span>
                      </div>
                      <span className="text-white">
                        {connection.wallet?.balance.budju?.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="p-4">
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      variant="ghost"
                      onClick={handleDisconnect}
                      fullWidth
                      leftIcon={<FaSignOutAlt />}
                    >
                      Disconnect
                    </Button>

                    <Button
                      as="a"
                      href={`https://ape.pro/solana/${TOKEN_ADDRESS}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="primary"
                      fullWidth
                    >
                      Buy BUDJU
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
};

export default WalletConnect;
