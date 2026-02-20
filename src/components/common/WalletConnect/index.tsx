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
  FaCheck,
} from "react-icons/fa";
import { useWallet } from "@hooks/useWallet";
import { WalletName } from "@lib/web3/connection";
import { TOKEN_ADDRESS } from "@constants/addresses";
import walletService, {
  WalletBalance,
  Network,
  TokenBalance,
} from "@lib/services/walletService";
import { useTheme } from "@/context/ThemeContext";

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
  { symbol: "USDC", address: USDC_ADDRESS, decimals: 6 },
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
        setInAppBrowser("phantom");
      } else if (
        typeof extWindow.solflare !== "undefined" ||
        (typeof extWindow.solana !== "undefined" &&
          extWindow.solana?.isSolflare)
      ) {
        setInAppBrowser("solflare");
      } else {
        setInAppBrowser(null);
      }
    };

    checkEnvironment();
    window.addEventListener("resize", checkEnvironment);
    return () => window.removeEventListener("resize", checkEnvironment);
  }, []);

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

  useEffect(() => {
    const autoConnectInAppBrowser = async () => {
      if (isMobile && inAppBrowser && !connection.connected) {
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
  }, [isMobile, inAppBrowser, connection.connected, connect]);

  useEffect(() => {
    if (connection.connected) {
      localStorage.removeItem("manualDisconnect");
    }
  }, [connection.connected]);

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
          setConnectionError(
            error instanceof Error
              ? error.message
              : "Failed to connect. Please try again.",
          );
        }
      } else {
        setConnectionError(
          `You're in ${walletConfig[inAppBrowser].name}'s browser. Use ${walletConfig[inAppBrowser].name} or switch browsers.`,
        );
      }
      return;
    }

    if (isMobile && !inAppBrowser) {
      const targetUrl = window.location.href;
      const refUrl = window.location.origin;
      let deepLink = "";
      if (walletName === "phantom") {
        deepLink = `https://phantom.app/ul/browse/${encodeURIComponent(targetUrl)}?ref=${encodeURIComponent(refUrl)}`;
      } else if (walletName === "solflare") {
        deepLink = `https://solflare.com/ul/v1/browse/${encodeURIComponent(targetUrl)}?ref=${encodeURIComponent(refUrl)}`;
      }
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
          `${walletConfig[walletName].name} not detected. Install it first.`,
        );
        return;
      }

      try {
        await connect(walletName);
        setIsMenuOpen(false);
      } catch (error) {
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
      } catch {
        setBalanceError("Failed to refresh");
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
        console.error("Failed to copy:", error);
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
    if (!isMenuOpen) setConnectionError(null);
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
    sm: "text-xs py-1.5 px-3",
    md: "text-sm py-2 px-4",
    lg: "text-base py-2.5 px-5",
  };

  const getWalletsToDisplay = () => {
    if (inAppBrowser) return [inAppBrowser];
    if (isMobile) return ["phantom", "solflare"];
    return availableWallets;
  };

  // Panel styles
  const panelBg = isDarkMode
    ? "bg-[#0c0c20]/95 border-white/[0.08]"
    : "bg-white/95 border-gray-200/60";
  const dividerColor = isDarkMode ? "border-white/[0.06]" : "border-gray-200/40";
  const subtextColor = isDarkMode ? "text-gray-500" : "text-gray-400";
  const textColor = isDarkMode ? "text-white" : "text-gray-900";
  const hoverBg = isDarkMode ? "hover:bg-white/[0.04]" : "hover:bg-gray-50";

  return (
    <div
      className={`relative ${fullWidth ? "w-full" : "inline-block"}`}
      ref={menuRef}
    >
      {/* Connect / Connected Button */}
      <button
        onClick={toggleMenu}
        disabled={connecting}
        className={`wallet-btn group relative flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-300 cursor-pointer ${sizeClasses[size]} ${
          fullWidth ? "w-full" : ""
        } ${
          connection.connected
            ? isDarkMode
              ? "bg-[#0c0c20]/80 border border-cyan-500/20 text-white hover:border-cyan-500/40 hover:shadow-[0_0_15px_rgba(6,182,212,0.1)]"
              : "bg-white/80 border border-cyan-500/20 text-gray-900 hover:border-cyan-500/40"
            : isDarkMode
              ? "wallet-connect-btn text-white"
              : "wallet-connect-btn-light text-gray-900"
        }`}
      >
        {connection.connected ? (
          <>
            <div className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </div>
            <img
              src={walletConfig[connection.wallet?.name || "other"].logo}
              alt="Wallet"
              className="w-4 h-4 rounded-sm"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <span className="font-mono text-xs">
              {walletService.formatAddress(connection.wallet?.address || "")}
            </span>
            <FaChevronDown
              className={`w-2.5 h-2.5 transition-transform duration-300 ${
                isDarkMode ? "text-gray-500" : "text-gray-400"
              } ${isMenuOpen ? "rotate-180" : ""}`}
            />
          </>
        ) : (
          <>
            <FaWallet className="w-3.5 h-3.5" />
            <span>{connecting ? "Connecting..." : "Connect"}</span>
          </>
        )}
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={`absolute z-50 mt-2 w-72 rounded-xl overflow-hidden border shadow-2xl backdrop-blur-xl ${panelBg} right-0`}
          >
            {!connection.connected ? (
              <>
                <div className={`px-4 py-3 border-b ${dividerColor}`}>
                  <h3
                    className={`text-[10px] font-bold uppercase tracking-widest ${subtextColor}`}
                  >
                    Connect Wallet
                  </h3>
                </div>

                {connectionError && (
                  <div
                    className={`px-4 py-2.5 border-b ${dividerColor} ${
                      isDarkMode ? "bg-red-500/5" : "bg-red-50"
                    }`}
                  >
                    <div className="flex items-start gap-2 text-red-400">
                      <FaExclamationTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span className="text-[11px] leading-tight">
                        {connectionError}
                      </span>
                    </div>
                  </div>
                )}

                {!isSupported && !isMobile && !inAppBrowser && (
                  <div
                    className={`px-4 py-2.5 border-b ${dividerColor} ${
                      isDarkMode ? "bg-amber-500/5" : "bg-amber-50"
                    }`}
                  >
                    <div className="flex items-start gap-2 text-amber-400">
                      <FaExclamationTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span className="text-[11px] leading-tight">
                        No wallet detected. Install a wallet extension or open
                        in your wallet's browser.
                      </span>
                    </div>
                  </div>
                )}

                <div className="p-2">
                  {getWalletsToDisplay().length > 0 ? (
                    getWalletsToDisplay().map((wallet) => (
                      <div key={wallet}>
                        <button
                          onClick={() => handleConnect(wallet as WalletName)}
                          className={`flex items-center w-full gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 cursor-pointer ${hoverBg} group`}
                        >
                          <img
                            src={walletConfig[wallet as WalletName].logo}
                            alt={walletConfig[wallet as WalletName].name}
                            className="w-8 h-8 rounded-lg"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                          <div className="text-left">
                            <span
                              className={`text-sm font-semibold block ${textColor}`}
                            >
                              {walletConfig[wallet as WalletName].name}
                            </span>
                            <span className={`text-[10px] ${subtextColor}`}>
                              {wallet === "phantom"
                                ? "Most popular"
                                : wallet === "solflare"
                                  ? "Full featured"
                                  : "Compatible wallet"}
                            </span>
                          </div>
                          <span
                            className={`ml-auto text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity ${
                              isDarkMode
                                ? "text-cyan-400/50"
                                : "text-cyan-600/50"
                            }`}
                          >
                            &rarr;
                          </span>
                        </button>
                        {!isSupported && !isMobile && !inAppBrowser && (
                          <button
                            onClick={() =>
                              handleGetWallet(wallet as WalletName)
                            }
                            className={`ml-11 mb-1 text-[10px] cursor-pointer ${
                              isDarkMode
                                ? "text-cyan-400/60 hover:text-cyan-400"
                                : "text-cyan-600/60 hover:text-cyan-600"
                            }`}
                          >
                            Download{" "}
                            {walletConfig[wallet as WalletName].name}
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className={`p-3 text-center ${subtextColor}`}>
                      <p className="text-xs mb-2">
                        No compatible wallets found.
                      </p>
                      <a
                        href="https://phantom.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-xs ${
                          isDarkMode
                            ? "text-cyan-400 hover:text-cyan-300"
                            : "text-cyan-600 hover:text-cyan-500"
                        }`}
                      >
                        Install Phantom &rarr;
                      </a>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Connected Header */}
                <div className={`px-4 py-3 border-b ${dividerColor}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-widest ${
                          isDarkMode
                            ? "text-emerald-400/70"
                            : "text-emerald-600/70"
                        }`}
                      >
                        Connected
                      </span>
                    </div>
                    <select
                      value={selectedNetwork}
                      onChange={(e) =>
                        handleNetworkChange(e.target.value as Network)
                      }
                      className={`text-[10px] font-mono px-2 py-1 rounded-md border cursor-pointer ${
                        isDarkMode
                          ? "bg-white/[0.03] text-gray-400 border-white/[0.06]"
                          : "bg-gray-50 text-gray-600 border-gray-200/60"
                      }`}
                    >
                      {networkOptions.map((network) => (
                        <option key={network} value={network}>
                          {network.charAt(0).toUpperCase() + network.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Wallet Info */}
                <div className={`px-4 py-3 border-b ${dividerColor}`}>
                  <div className="flex items-center gap-2.5 mb-2">
                    <img
                      src={
                        walletConfig[connection.wallet?.name || "other"].logo
                      }
                      alt="Wallet"
                      className="w-6 h-6 rounded-md"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <span className={`text-sm font-semibold ${textColor}`}>
                      {walletConfig[connection.wallet?.name || "other"].name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-[11px] truncate max-w-[160px] ${subtextColor}`}
                    >
                      {connection.wallet?.address.substring(0, 16)}...
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={copyAddress}
                        className={`p-1.5 rounded-md transition-all duration-200 cursor-pointer ${hoverBg}`}
                      >
                        {showCopied ? (
                          <FaCheck
                            className={`w-3 h-3 ${
                              isDarkMode
                                ? "text-emerald-400"
                                : "text-emerald-600"
                            }`}
                          />
                        ) : (
                          <FaCopy
                            className={`w-3 h-3 ${
                              isDarkMode
                                ? "text-cyan-400/60"
                                : "text-cyan-600/60"
                            }`}
                          />
                        )}
                      </button>
                      <button
                        onClick={openOnSolscan}
                        className={`p-1.5 rounded-md transition-all duration-200 cursor-pointer ${hoverBg}`}
                      >
                        <FaExternalLinkAlt
                          className={`w-3 h-3 ${
                            isDarkMode
                              ? "text-cyan-400/60"
                              : "text-cyan-600/60"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Balances */}
                <div className={`px-4 py-3 border-b ${dividerColor}`}>
                  <div className="flex justify-between items-center mb-2.5">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-widest ${subtextColor}`}
                    >
                      Balances
                    </span>
                    <button
                      onClick={handleRefresh}
                      className={`p-1 rounded-md transition-all duration-200 cursor-pointer ${hoverBg}`}
                      disabled={loadingBalances}
                    >
                      <FaSyncAlt
                        className={`w-2.5 h-2.5 ${
                          isDarkMode ? "text-cyan-400/60" : "text-cyan-600/60"
                        } ${loadingBalances ? "animate-spin" : ""}`}
                      />
                    </button>
                  </div>
                  {loadingBalances ? (
                    <div className={`text-xs ${subtextColor}`}>Loading...</div>
                  ) : balanceError ? (
                    <div className="text-xs text-red-400">{balanceError}</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <img
                            src="/images/tokens/sol.png"
                            alt="SOL"
                            className="w-5 h-5 rounded-full"
                          />
                          <span
                            className={`text-xs font-semibold ${textColor}`}
                          >
                            SOL
                          </span>
                        </div>
                        <span
                          className={`text-xs font-mono font-bold ${textColor}`}
                        >
                          {balances.sol.toFixed(4)}
                        </span>
                      </div>
                      {balances.tokens.map((token: TokenBalance) => (
                        <div
                          key={token.address}
                          className="flex justify-between items-center"
                        >
                          <div className="flex items-center gap-2">
                            <img
                              src={
                                token.symbol === "BUDJU"
                                  ? "/images/tokens/budju.png"
                                  : token.symbol === "USDC"
                                    ? "/images/tokens/usdc.png"
                                    : "/images/tokens/sol.png"
                              }
                              alt={token.symbol}
                              className="w-5 h-5 rounded-full"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                            <span
                              className={`text-xs font-semibold ${textColor}`}
                            >
                              {token.symbol}
                            </span>
                          </div>
                          <span
                            className={`text-xs font-mono font-bold ${textColor}`}
                          >
                            {token.amount.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Disconnect */}
                <div className="p-2">
                  <button
                    onClick={handleDisconnect}
                    className={`flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                      isDarkMode
                        ? "text-gray-500 hover:text-red-400 hover:bg-red-500/5"
                        : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                    }`}
                  >
                    <FaSignOutAlt className="w-3 h-3" />
                    Disconnect
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WalletConnect;
