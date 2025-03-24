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
import { useTheme } from "@/context/ThemeContext";

// Placeholder USDC address (replace with actual Solana USDC address)
const USDC_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

interface WalletConnectProps {
  fullWidth?: boolean;
  size?: "sm" | "md" | "lg";
}

const walletConfig: Record<WalletName, { name: string; logo: string }> = {
  phantom: { name: "Phantom", logo: "/images/wallets/phantom.png" },
  solflare: { name: "Solflare", logo: "/images/wallets/solflare.png" },
  other: { name: "Other", logo: "/images/wallets/default.png" },
};

const networkOptions: Network[] = ["mainnet", "devnet"];
const customTokens = [
  { symbol: "BUDJU", address: TOKEN_ADDRESS, decimals: 6 },
  { symbol: "USDC", address: USDC_ADDRESS, decimals: 6 }, // Add USDC here
];

const WalletConnect = ({
  fullWidth = false,
  size = "md",
}: WalletConnectProps) => {
  const { isDarkMode } = useTheme();
  const { connection, connecting, availableWallets, connect, disconnect } =
    useWallet();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showCopied, setShowCopied] = useState(false);
  const [balances, setBalances] = useState<WalletBalance>({
    sol: 0,
    tokens: [],
  });
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<Network>("mainnet");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [inAppBrowser, setInAppBrowser] = useState<WalletName | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  interface ExtendedWindow extends Window {
    phantom?: any;
    solana?: any;
    solflare?: any;
  }

  // Detect mobile device and in-app browser
  useEffect(() => {
    const checkEnvironment = () => {
      const isMobileDevice =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        );
      setIsMobile(isMobileDevice);

      const extWindow = window as ExtendedWindow;
      if (
        typeof extWindow.phantom !== "undefined" ||
        (typeof extWindow.solana !== "undefined" && extWindow.solana?.isPhantom)
      ) {
        console.log("Detected Phantom in-app browser");
        setInAppBrowser("phantom");
      } else if (
        typeof extWindow.solflare !== "undefined" ||
        (typeof extWindow.solana !== "undefined" &&
          extWindow.solana?.isSolflare)
      ) {
        console.log("Detected Solflare in-app browser");
        setInAppBrowser("solflare");
      } else {
        setInAppBrowser(null);
      }
    };

    checkEnvironment();
    window.addEventListener("resize", checkEnvironment);
    return () => window.removeEventListener("resize", checkEnvironment);
  }, []);

  // Check wallet support (desktop only)
  useEffect(() => {
    if (!isMobile) {
      const extWindow = window as ExtendedWindow;
      const hasWalletProvider =
        typeof extWindow.solana !== "undefined" ||
        typeof extWindow.phantom !== "undefined" ||
        typeof extWindow.solflare !== "undefined";
      setIsSupported(hasWalletProvider);
    }
  }, [isMobile]);

  // Auto-connect to the wallet if we're in its in-app browser
  useEffect(() => {
    const autoConnectInAppBrowser = async () => {
      if (inAppBrowser && !connection.connected) {
        console.log(`Auto-connecting to ${inAppBrowser} in-app browser`);
        try {
          await connect(inAppBrowser);
        } catch (error) {
          console.error("Auto-connect error:", error);
        }
      }
    };

    if (!localStorage.getItem("manualDisconnect")) {
      autoConnectInAppBrowser();
    }
  }, [inAppBrowser, connection.connected, connect]);

  useEffect(() => {
    if (connection.connected) {
      localStorage.removeItem("manualDisconnect");
    }
  }, [connection.connected]);

  // Update balances on connection
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

  // Handle clicks outside menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleConnect = async (walletName: WalletName) => {
    setConnectionError(null);
    const extWindow = window as ExtendedWindow;

    if (inAppBrowser) {
      if (inAppBrowser === walletName) {
        try {
          await connect(walletName);
          setIsMenuOpen(false);
        } catch (error) {
          console.error("Connection error:", error);
          setConnectionError(
            error instanceof Error
              ? error.message
              : "Failed to connect. Please try again.",
          );
        }
      } else {
        setConnectionError(
          `You're currently in ${walletConfig[inAppBrowser].name}'s browser. Please use ${walletConfig[inAppBrowser].name} or open this page in a different browser.`,
        );
      }
      return;
    }

    if (isMobile && !inAppBrowser) {
      const targetUrl = `${window.location.origin}/swap`;
      const refUrl = window.location.origin;
      let deepLink = "";
      if (walletName === "phantom") {
        deepLink = `https://phantom.app/ul/browse/${encodeURIComponent(targetUrl)}?ref=${encodeURIComponent(refUrl)}`;
      } else if (walletName === "solflare") {
        deepLink = `https://solflare.com/ul/v1/browse/${encodeURIComponent(targetUrl)}?ref=${encodeURIComponent(refUrl)}`;
      }
      console.log(`Generated ${walletName} deep link:`, deepLink);
      window.location.href = deepLink;
      setIsMenuOpen(false);
    } else {
      let walletProvider: any = null;
      if (walletName === "phantom") {
        walletProvider = extWindow.phantom?.solana || extWindow.solana;
      } else if (walletName === "solflare") {
        walletProvider = extWindow.solflare;
      }

      if (!walletProvider) {
        setConnectionError(
          `${walletConfig[walletName].name} not detected. Please ensure it's installed.`,
        );
        return;
      }

      try {
        await connect(walletName);
        setIsMenuOpen(false);
      } catch (error) {
        console.error("Connection error:", error);
        setConnectionError(
          error instanceof Error
            ? error.message
            : "Failed to connect. Please try again.",
        );
      }
    }
  };

  const handleDisconnect = async () => {
    try {
      localStorage.setItem("manualDisconnect", "true");
      await disconnect();
      setIsMenuOpen(false);
    } catch (error) {
      console.error("Error during disconnect:", error);
      alert("There was an issue disconnecting. Please try again.");
    }
  };

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

  const handleNetworkChange = (network: Network) => {
    setSelectedNetwork(network);
    walletService.switchNetwork(network);
    handleRefresh();
  };

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

  const openOnSolscan = () => {
    if (connection.wallet?.address) {
      walletService.openSolscan(connection.wallet.address);
    }
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
    if (!isMenuOpen) {
      setConnectionError(null);
    }
  };

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

  const sizeClasses = {
    sm: "text-sm py-1.5 px-3",
    md: "py-2 px-4",
    lg: "text-lg py-3 px-6",
  };

  const getWalletsToDisplay = () => {
    if (inAppBrowser) {
      return [inAppBrowser];
    }
    if (isMobile) {
      return ["phantom", "solflare"];
    }
    return availableWallets;
  };

  const WalletSelectionContent = () => (
    <>
      <div className="p-4 border-b border-gray-800">
        <h3 className={isDarkMode ? "text-white" : "text-gray-900"}>
          Connect Wallet
        </h3>
        <p className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
          {inAppBrowser
            ? `Connect to ${walletConfig[inAppBrowser].name}`
            : "Select a wallet to connect to BUDJU"}
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

      {!isSupported && !isMobile && !inAppBrowser && (
        <div className="p-3 bg-yellow-900/40 border-b border-gray-800">
          <div className="flex items-start text-yellow-400">
            <FaExclamationTriangle className="mr-2 mt-0.5" />
            <div>
              <span className="text-sm block">
                No wallet detected on this device.
              </span>
              <span className="text-xs block mt-1">
                Install a wallet extension (desktop) or open this page in your
                wallet app's browser (mobile, e.g., Phantom or Solflare).
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="p-2 max-h-60 overflow-y-auto">
        {getWalletsToDisplay().length > 0 ? (
          getWalletsToDisplay().map((wallet) => (
            <div key={wallet} className="mb-2">
              <button
                onClick={() => handleConnect(wallet as WalletName)}
                className={`flex items-center w-full p-3 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-gray-800" : "hover:bg-gray-200"
                }`}
              >
                <img
                  src={walletConfig[wallet as WalletName].logo}
                  alt={walletConfig[wallet as WalletName].name}
                  className="w-8 h-8 mr-3"
                />
                <span className={isDarkMode ? "text-white" : "text-gray-900"}>
                  {walletConfig[wallet as WalletName].name}
                </span>
              </button>
              {!isSupported && !isMobile && !inAppBrowser && (
                <button
                  onClick={() => handleGetWallet(wallet as WalletName)}
                  className="ml-11 mt-1 text-xs text-budju-blue hover:underline"
                >
                  Download {walletConfig[wallet as WalletName].name}
                </button>
              )}
            </div>
          ))
        ) : (
          <div
            className={`p-3 text-center ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
          >
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
          <button
            onClick={toggleMenu}
            className={`group relative flex items-center justify-center space-x-2 ${
              isDarkMode
                ? "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                : "bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
            } text-white rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 ${sizeClasses[size]} ${
              fullWidth ? "w-full" : ""
            }`}
            disabled={connecting}
          >
            <span
              className={`absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_center,_rgba(255,255,255,${
                isDarkMode ? "0.2" : "0.3"
              })_0%,_rgba(255,255,255,0)_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
            />
            <FaWallet />
            <span className="font-semibold">
              {connecting ? "Connecting..." : "Connect Wallet"}
            </span>
          </button>

          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                className={`absolute z-50 mt-2 w-64 ${
                  isDarkMode
                    ? "bg-gray-900 border-gray-800"
                    : "bg-gray-100 border-gray-300"
                } rounded-xl overflow-hidden shadow-xl border left-1/2 transform -translate-x-1/2`}
              >
                <WalletSelectionContent />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        <>
          <button
            onClick={toggleMenu}
            className={`group relative flex items-center justify-center space-x-2 ${
              isDarkMode
                ? "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                : "bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
            } text-white rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 ${sizeClasses[size]} ${
              fullWidth ? "w-full" : ""
            }`}
          >
            <span
              className={`absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_center,_rgba(255,255,255,${
                isDarkMode ? "0.2" : "0.3"
              })_0%,_rgba(255,255,255,0)_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
            />
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
                className={`absolute z-50 mt-2 w-72 ${
                  isDarkMode
                    ? "bg-gray-900 border-gray-800"
                    : "bg-gray-100 border-gray-300"
                } rounded-xl overflow-hidden shadow-xl border left-1/2 transform -translate-x-1/2`}
              >
                <div className="p-4 border-b border-gray-800">
                  <div className="flex items-center justify-between">
                    <h3 className={isDarkMode ? "text-white" : "text-gray-900"}>
                      Connected
                    </h3>
                    <select
                      value={selectedNetwork}
                      onChange={(e) =>
                        handleNetworkChange(e.target.value as Network)
                      }
                      className={`text-xs px-2 py-1 rounded-full border ${
                        isDarkMode
                          ? "bg-gray-800 text-white border-gray-700"
                          : "bg-gray-200 text-gray-900 border-gray-400"
                      }`}
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
                    <span
                      className={isDarkMode ? "text-white" : "text-gray-900"}
                    >
                      {walletConfig[connection.wallet?.name || "other"].name}
                    </span>
                  </div>
                </div>

                <div className="p-4 border-b border-gray-800">
                  <div
                    className={isDarkMode ? "text-gray-400" : "text-gray-600"}
                  >
                    Address
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-sm truncate max-w-[160px] ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {connection.wallet?.address.substring(0, 14)}...
                    </span>
                    <div className="flex space-x-2">
                      <button
                        onClick={copyAddress}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isDarkMode
                            ? "bg-gray-800 hover:bg-gray-700"
                            : "bg-gray-200 hover:bg-gray-300"
                        } relative`}
                      >
                        <FaCopy className="text-budju-blue" />
                        {showCopied && (
                          <span
                            className={`absolute top-full right-0 mt-1 px-2 py-1 text-xs rounded ${
                              isDarkMode
                                ? "bg-green-600 text-white"
                                : "bg-green-500 text-gray-900"
                            }`}
                          >
                            Copied!
                          </span>
                        )}
                      </button>
                      <button
                        onClick={openOnSolscan}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isDarkMode
                            ? "bg-gray-800 hover:bg-gray-700"
                            : "bg-gray-200 hover:bg-gray-300"
                        }`}
                      >
                        <FaExternalLinkAlt className="text-budju-blue" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-b border-gray-800">
                  <div className="flex justify-between items-center mb-2">
                    <div
                      className={isDarkMode ? "text-gray-400" : "text-gray-600"}
                    >
                      Balances
                    </div>
                    <button
                      onClick={handleRefresh}
                      className={`p-1 rounded-full transition-colors ${
                        isDarkMode
                          ? "bg-gray-800 hover:bg-gray-700"
                          : "bg-gray-200 hover:bg-gray-300"
                      }`}
                      disabled={loadingBalances}
                    >
                      <FaSyncAlt
                        className={`text-budju-blue ${loadingBalances ? "animate-spin" : ""}`}
                      />
                    </button>
                  </div>
                  {loadingBalances ? (
                    <div
                      className={isDarkMode ? "text-gray-400" : "text-gray-600"}
                    >
                      Loading balances...
                    </div>
                  ) : balanceError ? (
                    <div className="text-red-400">{balanceError}</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center">
                          <img
                            src="/images/tokens/sol.png"
                            alt="SOL"
                            className="w-5 h-5 mr-2"
                          />
                          <span
                            className={
                              isDarkMode ? "text-white" : "text-gray-900"
                            }
                          >
                            SOL
                          </span>
                        </div>
                        <span
                          className={
                            isDarkMode ? "text-white" : "text-gray-900"
                          }
                        >
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
                                  ? "/images/logo.svg"
                                  : token.symbol === "USDC"
                                    ? "/images/tokens/usdc.png"
                                    : "/images/tokens/default.png"
                              }
                              alt={token.symbol}
                              className="w-5 h-5 mr-2"
                            />
                            <span
                              className={
                                isDarkMode ? "text-white" : "text-gray-900"
                              }
                            >
                              {token.symbol}
                            </span>
                          </div>
                          <span
                            className={
                              isDarkMode ? "text-white" : "text-gray-900"
                            }
                          >
                            {token.amount.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <Button
                    variant="ghost"
                    onClick={handleDisconnect}
                    fullWidth
                    leftIcon={<FaSignOutAlt />}
                  >
                    Disconnect
                  </Button>
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
