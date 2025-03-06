import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FaWallet,
  FaSignOutAlt,
  FaChevronDown,
  FaCopy,
  FaExternalLinkAlt,
  FaSyncAlt,
  FaExclamationTriangle,
} from "react-icons/fa";
import Button from "@components/common/Button";
import { useWallet } from "@hooks/useWallet";
import { WalletName } from "@lib/web3/connection";
import { TOKEN_ADDRESS } from "@constants/addresses";
import walletService, {
  WalletBalance,
  Network,
  TokenBalance,
} from "@lib/services/walletService";
import { createPortal } from "react-dom";

// Interface for Props
interface WalletConnectProps {
  fullWidth?: boolean;
  size?: "sm" | "md" | "lg";
}

// Wallet configuration
const walletConfig: Record<WalletName, { name: string; logo: string }> = {
  phantom: {
    name: "Phantom",
    logo: "/images/wallets/phantom.png",
  },
  solflare: {
    name: "Solflare",
    logo: "/images/wallets/solflare.png",
  },
  other: {
    name: "Other",
    logo: "/images/wallets/default.png",
  },
};

const networkOptions: Network[] = ["mainnet", "devnet"];

const customTokens = [{ symbol: "BUDJU", address: TOKEN_ADDRESS, decimals: 6 }];

// Main Component
const WalletConnect = ({
  fullWidth = false,
  size = "md",
}: WalletConnectProps) => {
  const { connection, connecting, availableWallets, connect, disconnect } =
    useWallet();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false); // For mobile modal
  const [showCopied, setShowCopied] = useState(false);
  const [balances, setBalances] = useState<WalletBalance>({
    sol: 0,
    tokens: [],
  });
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<Network>("mainnet");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Define types for window extensions
  interface ExtendedWindow extends Window {
    phantom?: any;
    solana?: any;
    solflare?: any;
  }

  // Check if device/browser supports wallets
  const [isSupported, setIsSupported] = useState(true);

  // Detect if device is mobile or tablet
  useEffect(() => {
    const checkDevice = () => {
      const userAgent = navigator.userAgent;
      const isMobileOrTabletDevice =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          userAgent,
        ) || window.innerWidth <= 1024; // Tablets typically up to 1024px
      setIsMobileOrTablet(isMobileOrTabletDevice);
    };

    checkDevice();
    window.addEventListener("resize", checkDevice);
    return () => window.removeEventListener("resize", checkDevice);
  }, []);

  // Check for wallet compatibility on mount
  useEffect(() => {
    const extWindow = window as ExtendedWindow;
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isAndroidMobileBrowser =
      /Android/.test(navigator.userAgent) &&
      /Chrome\/[.0-9]*Mobile/.test(navigator.userAgent) &&
      !/wv/.test(navigator.userAgent);
    setIsSupported(
      !isIOS &&
        (!isAndroidMobileBrowser ||
          typeof extWindow.solana !== "undefined" ||
          typeof extWindow.phantom !== "undefined"),
    );
  }, []);

  // Fetch and subscribe to balance updates
  useEffect(() => {
    if (connection.connected && connection.wallet?.address) {
      setLoadingBalances(true);
      setBalanceError(null);

      walletService.switchNetwork(selectedNetwork);

      const unsubscribe = walletService.subscribeToBalanceUpdates(
        connection.wallet.address,
        (newBalances) => {
          setBalances(newBalances);
          setLoadingBalances(false);
        },
        customTokens,
        30000,
      );

      return () => unsubscribe();
    } else {
      setBalances({ sol: 0, tokens: [] });
      setLoadingBalances(false);
      setBalanceError(null);
    }
  }, [connection.connected, connection.wallet?.address, selectedNetwork]);

  // Manual refresh
  const handleRefresh = async () => {
    if (connection.wallet?.address) {
      setLoadingBalances(true);
      setBalanceError(null);
      try {
        const newBalances = await walletService.fetchWalletBalances(
          connection.wallet.address,
          customTokens,
        );
        setBalances(newBalances);
      } catch (error) {
        setBalanceError("Failed to refresh balances");
        console.error("Refresh error:", error);
      } finally {
        setLoadingBalances(false);
      }
    }
  };

  // Network switch
  const handleNetworkChange = (network: Network) => {
    setSelectedNetwork(network);
    walletService.switchNetwork(network);
    handleRefresh();
  };

  // Close menu/modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
        setIsModalOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Connect to a wallet with error handling
  const handleConnect = async (walletName: WalletName) => {
    setConnectionError(null);
    const extWindow = window as ExtendedWindow;

    let walletExists = false;
    if (walletName === "phantom") {
      walletExists =
        typeof extWindow.phantom !== "undefined" ||
        (typeof extWindow.solana !== "undefined" &&
          extWindow.solana?.isPhantom === true);
    } else if (walletName === "solflare") {
      walletExists = typeof extWindow.solflare !== "undefined";
    }

    if (!walletExists) {
      setConnectionError(
        `${walletConfig[walletName].name} extension not detected`,
      );
      return;
    }

    try {
      await connect(walletName);
      setIsMenuOpen(false);
      setIsModalOpen(false);
    } catch (error) {
      console.error("Connection error:", error);
      if (error instanceof Error) {
        setConnectionError(error.message);
      } else {
        setConnectionError("Failed to connect. Please try again.");
      }
    }
  };

  // Disconnect from wallet
  const handleDisconnect = () => {
    disconnect();
    setIsMenuOpen(false);
    setIsModalOpen(false);
  };

  // Copy wallet address to clipboard
  const copyAddress = async () => {
    if (connection.wallet?.address) {
      try {
        await walletService.copyAddress(connection.wallet.address);
        setShowCopied(true);
        setTimeout(() => setShowCopied(false), 2000);
      } catch (error) {
        console.error("Failed to copy address:", error);
      }
    }
  };

  // Open wallet on Solscan
  const openOnSolscan = () => {
    if (connection.wallet?.address) {
      walletService.openSolscan(connection.wallet.address);
    }
  };

  // Toggle wallet dropdown or modal
  const toggleMenu = () => {
    if (isMobileOrTablet) {
      setIsModalOpen(!isModalOpen);
    } else {
      setIsMenuOpen(!isMenuOpen);
    }
    if (!isMenuOpen && !isModalOpen) {
      setConnectionError(null);
    }
  };

  // Size-specific classes
  const sizeClasses = {
    sm: "text-sm py-1.5 px-3",
    md: "py-2 px-4",
    lg: "text-lg py-3 px-6",
  };

  // Redirect to app store or web store based on device
  const handleGetWallet = (walletName: WalletName) => {
    if (walletName === "phantom") {
      if (
        /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        !(window as any).MSStream
      ) {
        window.open(
          "https://apps.apple.com/app/phantom-solana-wallet/id1598432977",
          "_blank",
        );
      } else if (/Android/.test(navigator.userAgent)) {
        window.open(
          "https://play.google.com/store/apps/details?id=app.phantom",
          "_blank",
        );
      } else {
        window.open("https://phantom.app/download", "_blank");
      }
    } else if (walletName === "solflare") {
      window.open("https://solflare.com/download", "_blank");
    }
  };

  // Wallet selection content (used for both dropdown and modal)
  const WalletSelectionContent = () => (
    <>
      <div className="p-4 border-b border-gray-800">
        <h3 className="text-white font-bold">Connect Wallet</h3>
        <p className="text-gray-400 text-sm">
          Select a wallet to connect to BUDJU
        </p>
      </div>

      {connectionError && (
        <div className="p-3 bg-red-900/40 border-b border-gray-800">
          <div className="flex items-center text-red-400">
            <FaExclamationTriangle className="mr-2" />
            <span className="text-sm">{connectionError}</span>
          </div>
        </div>
      )}

      {!isSupported && (
        <div className="p-3 bg-yellow-900/40 border-b border-gray-800">
          <div className="flex items-start text-yellow-400">
            <FaExclamationTriangle className="mr-2 mt-0.5" />
            <div>
              <span className="text-sm block">
                Your device or browser may not support wallet extensions.
              </span>
              <span className="text-xs block mt-1">
                Please install a Solana wallet app and use its built-in browser.
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="p-2 max-h-60 overflow-y-auto">
        {availableWallets.length > 0 ? (
          availableWallets.map((wallet) => (
            <div key={wallet} className="mb-2">
              <button
                onClick={() => handleConnect(wallet)}
                className="flex items-center w-full p-3 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <img
                  src={walletConfig[wallet].logo}
                  alt={walletConfig[wallet].name}
                  className="w-8 h-8 mr-3"
                />
                <span className="text-white">{walletConfig[wallet].name}</span>
              </button>
              {!isSupported && (
                <button
                  onClick={() => handleGetWallet(wallet)}
                  className="ml-11 mt-1 text-xs text-budju-blue hover:underline"
                >
                  Download {walletConfig[wallet].name}
                </button>
              )}
            </div>
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
    </>
  );

  return (
    <div
      className={`relative ${fullWidth ? "w-full" : "inline-block"}`}
      ref={menuRef}
    >
      {!connection.connected ? (
        <>
          {/* Updated Button with Web3 Styling */}
          <button
            onClick={toggleMenu}
            className={`group relative flex items-center justify-center space-x-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 ${
              sizeClasses[size]
            } ${fullWidth ? "w-full" : ""}`}
            disabled={connecting}
          >
            <span className="absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.2)_0%,_rgba(255,255,255,0)_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
            <FaWallet className="text-white" />
            <span className="font-semibold">
              {connecting ? "Connecting..." : "Connect Wallet"}
            </span>
          </button>

          {/* Dropdown for Desktop */}
          {!isMobileOrTablet && (
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
                  <WalletSelectionContent />
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* Modal for Mobile/Tablet */}
          {isMobileOrTablet &&
            isModalOpen &&
            createPortal(
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className="w-11/12 max-w-sm bg-gray-900 rounded-xl overflow-hidden shadow-xl border border-gray-800"
                >
                  <div className="flex justify-end p-2">
                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="text-gray-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <WalletSelectionContent />
                </motion.div>
              </div>,
              document.body,
            )}
        </>
      ) : (
        <>
          <button
            onClick={toggleMenu}
            className={`group relative flex items-center justify-center space-x-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 ${
              sizeClasses[size]
            } ${fullWidth ? "w-full" : ""}`}
          >
            <span className="absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.2)_0%,_rgba(255,255,255,0)_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
            <img
              src={walletConfig[connection.wallet?.name || "other"].logo}
              alt="Wallet"
              className="w-5 h-5"
            />
            <span className="font-mono">
              {walletService.formatAddress(connection.wallet?.address || "")}
            </span>
            <FaChevronDown
              className={`transition-transform duration-300 ${isMenuOpen ? "rotate-180" : ""}`}
            />
          </button>

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
                    <select
                      value={selectedNetwork}
                      onChange={(e) =>
                        handleNetworkChange(e.target.value as Network)
                      }
                      className="bg-gray-800 text-white text-xs px-2 py-1 rounded-full border border-gray-700"
                    >
                      {networkOptions.map((network) => (
                        <option key={network} value={network}>
                          {network.charAt(0).toUpperCase() + network.slice(1)}
                        </option>
                      ))}
                    </select>
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

                <div className="p-4 border-b border-gray-800">
                  <div className="text-xs text-gray-400 mb-1">Address</div>
                  <div className="flex items-center justify-between">
                    <span className="text-white font-mono text-sm truncate max-w-[160px]">
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

                <div className="p-4 border-b border-gray-800">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-xs text-gray-400">Balances</div>
                    <button
                      onClick={handleRefresh}
                      className="p-1 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors"
                      disabled={loadingBalances}
                    >
                      <FaSyncAlt
                        className={`text-budju-blue ${loadingBalances ? "animate-spin" : ""}`}
                      />
                    </button>
                  </div>
                  {loadingBalances ? (
                    <div className="text-center text-gray-400">
                      Loading balances...
                    </div>
                  ) : balanceError ? (
                    <div className="text-center text-red-400">
                      {balanceError}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center">
                          <img
                            src="/images/tokens/sol.png"
                            alt="SOL"
                            className="w-5 h-5 mr-2"
                          />
                          <span className="text-white">SOL</span>
                        </div>
                        <span className="text-white">
                          {balances.sol.toFixed(4)}
                        </span>
                      </div>
                      {balances.tokens.map((token: TokenBalance) => (
                        <div
                          key={token.address}
                          className="flex justify-between items-center"
                        >
                          <div className="flex items-center">
                            <img
                              src={
                                token.symbol === "BUDJU"
                                  ? "/images/logo.png"
                                  : "/images/tokens/default.png"
                              }
                              alt={token.symbol}
                              className="w-5 h-5 mr-2"
                            />
                            <span className="text-white">{token.symbol}</span>
                          </div>
                          <span className="text-white">
                            {token.amount.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

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
