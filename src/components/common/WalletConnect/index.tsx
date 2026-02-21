import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  FaWallet,
  FaSignOutAlt,
  FaChevronDown,
  FaChevronLeft,
  FaCopy,
  FaExternalLinkAlt,
  FaSyncAlt,
  FaExclamationTriangle,
  FaCheck,
  FaExchangeAlt,
  FaRobot,
  FaSwimmingPool,
  FaLock,
  FaCoins,
  FaArrowRight,
} from "react-icons/fa";
import { useWallet } from "@hooks/useWallet";
import { WalletName } from "@lib/web3/connection";
import { TOKEN_ADDRESS } from "@constants/addresses";
import { ROUTES } from "@/constants/routes";
import walletService, {
  WalletBalance,
  Network,
  TokenBalance,
} from "@lib/services/walletService";
import { useTheme } from "@/context/ThemeContext";

const USDC_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BUDJU_REQUIRED = 10_000_000;

interface WalletConnectProps {
  fullWidth?: boolean;
  size?: "sm" | "md" | "lg";
}

type ConnectStep = "action" | "wallet";
type SelectedAction = "swap" | "bot" | "pool" | null;

const walletConfig: Record<
  WalletName,
  { name: string; logo: string; tagline: string; downloadUrl: string }
> = {
  jupiter: {
    name: "Jupiter",
    logo: "/images/wallets/jupiter.png",
    tagline: "Powered by Jupiter",
    downloadUrl: "https://jup.ag/wallet",
  },
  phantom: {
    name: "Phantom",
    logo: "/images/wallets/phantom.png",
    tagline: "Most popular",
    downloadUrl: "https://phantom.app/download",
  },
  solflare: {
    name: "Solflare",
    logo: "/images/wallets/solflare.png",
    tagline: "Full featured",
    downloadUrl: "https://solflare.com/download",
  },
  other: {
    name: "Other",
    logo: "/images/wallets/default.png",
    tagline: "Compatible wallet",
    downloadUrl: "",
  },
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
  const navigate = useNavigate();
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
  const [isMobile, setIsMobile] = useState(false);
  const [inAppBrowser, setInAppBrowser] = useState<WalletName | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Multi-step wizard state
  const [connectStep, setConnectStep] = useState<ConnectStep>("action");
  const [selectedAction, setSelectedAction] = useState<SelectedAction>(null);
  // Store the pending navigation so it survives menu close
  const pendingNavRef = useRef<string | null>(null);

  interface ExtendedWindow extends Window {
    phantom?: any;
    solana?: any;
    solflare?: any;
    jupiter?: any;
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
      } else if (typeof extWindow.jupiter !== "undefined") {
        setInAppBrowser("jupiter");
      } else {
        setInAppBrowser(null);
      }
    };

    checkEnvironment();
    window.addEventListener("resize", checkEnvironment);
    return () => window.removeEventListener("resize", checkEnvironment);
  }, []);

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

  // Reset wizard when menu closes — but DON'T clear pending nav
  useEffect(() => {
    if (!isMenuOpen) {
      setConnectStep("action");
      setSelectedAction(null);
      setConnectionError(null);
    }
  }, [isMenuOpen]);

  // Helper: navigate and close menu (navigate FIRST, then close)
  const goTo = (route: string) => {
    navigate(route);
    // Small delay to let navigation start before closing dropdown
    setTimeout(() => setIsMenuOpen(false), 50);
  };

  const handleSelectAction = (action: SelectedAction) => {
    setSelectedAction(action);
    // Store route for after wallet connection
    if (action === "swap") pendingNavRef.current = ROUTES.SWAP;
    else if (action === "bot") pendingNavRef.current = ROUTES.BANK;
    else if (action === "pool") pendingNavRef.current = ROUTES.POOL;
    setConnectStep("wallet");
    setConnectionError(null);
  };

  const handleConnect = async (walletName: WalletName) => {
    setConnectionError(null);
    const extWindow = window as ExtendedWindow;

    if (inAppBrowser) {
      if (inAppBrowser === walletName) {
        try {
          await connect(walletName);
          // Navigate using the ref (survives state resets)
          if (pendingNavRef.current) {
            goTo(pendingNavRef.current);
            pendingNavRef.current = null;
          }
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
      } else if (walletName === "jupiter") {
        deepLink = `https://jup.ag/wallet`;
      }
      window.location.href = deepLink;
      setIsMenuOpen(false);
    } else {
      let walletProvider: any = null;
      if (walletName === "phantom") {
        walletProvider = extWindow.phantom?.solana || extWindow.solana;
      } else if (walletName === "solflare") {
        walletProvider = extWindow.solflare;
      } else if (walletName === "jupiter") {
        walletProvider = extWindow.jupiter;
      }

      if (!walletProvider) {
        setConnectionError(
          `${walletConfig[walletName].name} not detected. Install it first.`,
        );
        return;
      }

      try {
        await connect(walletName);
        // Navigate using the ref
        if (pendingNavRef.current) {
          goTo(pendingNavRef.current);
          pendingNavRef.current = null;
        }
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
  };

  const handleGetWallet = (walletName: WalletName) => {
    const url = walletConfig[walletName].downloadUrl;
    if (url) {
      if (walletName === "phantom") {
        if (
          /iPad|iPhone|iPod/.test(navigator.userAgent) &&
          !(window as any).MSStream
        ) {
          window.open(
            "https://apps.apple.com/app/phantom-solana-wallet/id1598432977",
            "_blank",
          );
          return;
        } else if (/Android/.test(navigator.userAgent)) {
          window.open(
            "https://play.google.com/store/apps/details?id=app.phantom",
            "_blank",
          );
          return;
        }
      }
      window.open(url, "_blank");
    }
  };

  const sizeClasses = {
    sm: "text-xs py-1.5 px-3",
    md: "text-sm py-2 px-4",
    lg: "text-base py-2.5 px-5",
  };

  const getWalletsToDisplay = (): WalletName[] => {
    if (inAppBrowser) return [inAppBrowser];
    return ["jupiter", "phantom", "solflare"];
  };

  // Derived: BUDJU balance
  const budjuBalance =
    balances.tokens.find((t) => t.symbol === "BUDJU")?.amount ?? 0;
  const hasBudjuAccess = budjuBalance >= BUDJU_REQUIRED;

  // Panel styles
  const panelBg = isDarkMode
    ? "bg-[#0c0c20]/95 border-white/[0.08]"
    : "bg-white/95 border-gray-200/60";
  const dividerColor = isDarkMode
    ? "border-white/[0.06]"
    : "border-gray-200/40";
  const subtextColor = isDarkMode ? "text-gray-500" : "text-gray-400";
  const textColor = isDarkMode ? "text-white" : "text-gray-900";
  const hoverBg = isDarkMode ? "hover:bg-white/[0.04]" : "hover:bg-gray-50";

  const stepNumber = connectStep === "action" ? 1 : 2;

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
            className={`z-50 rounded-xl overflow-hidden border shadow-2xl backdrop-blur-xl ${panelBg} fixed top-14 left-3 right-3 sm:absolute sm:top-auto sm:left-auto sm:right-0 sm:mt-2 sm:w-80`}
          >
            {!connection.connected ? (
              <>
                {/* ========== NOT CONNECTED — WIZARD ========== */}

                {/* Header with step indicator + back */}
                <div className={`px-4 py-3 border-b ${dividerColor}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {connectStep === "wallet" && (
                        <button
                          onClick={() => {
                            setConnectStep("action");
                            setSelectedAction(null);
                            setConnectionError(null);
                          }}
                          className={`p-1 -ml-1 rounded-md transition-colors cursor-pointer ${hoverBg}`}
                        >
                          <FaChevronLeft
                            className={`w-2.5 h-2.5 ${subtextColor}`}
                          />
                        </button>
                      )}
                      <h3
                        className={`text-[10px] font-bold uppercase tracking-widest ${subtextColor}`}
                      >
                        {connectStep === "action"
                          ? "What would you like to do?"
                          : "Choose Your Wallet"}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[1, 2].map((s) => (
                        <div
                          key={s}
                          className={`h-1 rounded-full transition-all duration-300 ${
                            s <= stepNumber
                              ? isDarkMode
                                ? "bg-cyan-400 w-3"
                                : "bg-cyan-600 w-3"
                              : isDarkMode
                                ? "bg-white/10 w-1.5"
                                : "bg-gray-200 w-1.5"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Connection error */}
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

                <AnimatePresence mode="wait">
                  {/* ===== STEP 1: Choose Action ===== */}
                  {connectStep === "action" && (
                    <motion.div
                      key="step-action"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.15 }}
                      className="p-3 space-y-2"
                    >
                      {/* Swap */}
                      <button
                        onClick={() => handleSelectAction("swap")}
                        className={`flex items-center w-full gap-3.5 px-4 py-4 rounded-xl transition-all duration-200 cursor-pointer group border ${
                          isDarkMode
                            ? "bg-gradient-to-r from-cyan-500/[0.06] to-blue-500/[0.03] border-cyan-500/[0.1] hover:border-cyan-500/30 hover:from-cyan-500/[0.12] hover:to-blue-500/[0.06]"
                            : "bg-gradient-to-r from-cyan-50/80 to-blue-50/50 border-cyan-200/30 hover:border-cyan-300/60"
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isDarkMode ? "bg-cyan-500/10" : "bg-cyan-100/80"
                          }`}
                        >
                          <FaExchangeAlt
                            className={`w-4 h-4 ${
                              isDarkMode ? "text-cyan-400" : "text-cyan-600"
                            }`}
                          />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <span
                            className={`text-sm font-bold block ${textColor}`}
                          >
                            Swap
                          </span>
                          <span
                            className={`text-[11px] leading-tight ${subtextColor}`}
                          >
                            Buy BUDJU with SOL or USDC
                          </span>
                        </div>
                        <FaArrowRight
                          className={`w-3 h-3 flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${
                            isDarkMode
                              ? "text-cyan-400/30 group-hover:text-cyan-400/60"
                              : "text-cyan-600/30 group-hover:text-cyan-600/60"
                          }`}
                        />
                      </button>

                      {/* Bot */}
                      <button
                        onClick={() => handleSelectAction("bot")}
                        className={`flex items-center w-full gap-3.5 px-4 py-4 rounded-xl transition-all duration-200 cursor-pointer group border ${
                          isDarkMode
                            ? "bg-gradient-to-r from-emerald-500/[0.06] to-cyan-500/[0.03] border-emerald-500/[0.1] hover:border-emerald-500/30 hover:from-emerald-500/[0.12] hover:to-cyan-500/[0.06]"
                            : "bg-gradient-to-r from-emerald-50/80 to-cyan-50/50 border-emerald-200/30 hover:border-emerald-300/60"
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isDarkMode
                              ? "bg-emerald-500/10"
                              : "bg-emerald-100/80"
                          }`}
                        >
                          <FaRobot
                            className={`w-4 h-4 ${
                              isDarkMode
                                ? "text-emerald-400"
                                : "text-emerald-600"
                            }`}
                          />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <span
                            className={`text-sm font-bold block ${textColor}`}
                          >
                            Trading Bot
                          </span>
                          <span
                            className={`text-[11px] leading-tight ${subtextColor}`}
                          >
                            Automated DCA strategy
                          </span>
                        </div>
                        <FaArrowRight
                          className={`w-3 h-3 flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${
                            isDarkMode
                              ? "text-emerald-400/30 group-hover:text-emerald-400/60"
                              : "text-emerald-600/30 group-hover:text-emerald-600/60"
                          }`}
                        />
                      </button>

                      {/* Pool */}
                      <button
                        onClick={() => handleSelectAction("pool")}
                        className={`flex items-center w-full gap-3.5 px-4 py-4 rounded-xl transition-all duration-200 cursor-pointer group border ${
                          isDarkMode
                            ? "bg-gradient-to-r from-purple-500/[0.06] to-pink-500/[0.03] border-purple-500/[0.1] hover:border-purple-500/30 hover:from-purple-500/[0.12] hover:to-pink-500/[0.06]"
                            : "bg-gradient-to-r from-purple-50/80 to-pink-50/50 border-purple-200/30 hover:border-purple-300/60"
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isDarkMode
                              ? "bg-purple-500/10"
                              : "bg-purple-100/80"
                          }`}
                        >
                          <FaSwimmingPool
                            className={`w-4 h-4 ${
                              isDarkMode
                                ? "text-purple-400"
                                : "text-purple-600"
                            }`}
                          />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <span
                            className={`text-sm font-bold block ${textColor}`}
                          >
                            Liquidity Pools
                          </span>
                          <span
                            className={`text-[11px] leading-tight ${subtextColor}`}
                          >
                            Provide liquidity & earn fees
                          </span>
                        </div>
                        <FaArrowRight
                          className={`w-3 h-3 flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${
                            isDarkMode
                              ? "text-purple-400/30 group-hover:text-purple-400/60"
                              : "text-purple-600/30 group-hover:text-purple-600/60"
                          }`}
                        />
                      </button>

                      {/* 10M BUDJU requirement notice */}
                      <div
                        className={`flex items-start gap-2.5 px-4 py-3 rounded-xl ${
                          isDarkMode
                            ? "bg-amber-500/[0.06] border border-amber-500/10"
                            : "bg-amber-50/80 border border-amber-200/30"
                        }`}
                      >
                        <FaLock
                          className={`w-3 h-3 mt-0.5 flex-shrink-0 ${
                            isDarkMode
                              ? "text-amber-400/60"
                              : "text-amber-600/60"
                          }`}
                        />
                        <div className="flex-1">
                          <span
                            className={`text-[11px] leading-tight block ${
                              isDarkMode
                                ? "text-amber-400/80"
                                : "text-amber-700/70"
                            }`}
                          >
                            Trading Bot requires{" "}
                            <span className="font-bold">10M BUDJU</span>.
                          </span>
                          <span
                            className={`text-[10px] block mb-2 ${
                              isDarkMode
                                ? "text-amber-400/50"
                                : "text-amber-600/50"
                            }`}
                          >
                            Don't have enough? Use Swap to buy BUDJU first.
                          </span>
                          <button
                            onClick={() => goTo(ROUTES.BALANCE)}
                            className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-md transition-all duration-200 cursor-pointer ${
                              isDarkMode
                                ? "bg-cyan-500/10 text-cyan-400/80 hover:bg-cyan-500/20 hover:text-cyan-400 border border-cyan-500/15"
                                : "bg-cyan-50 text-cyan-600/80 hover:bg-cyan-100 hover:text-cyan-700 border border-cyan-200/40"
                            }`}
                          >
                            <FaCoins className="w-2.5 h-2.5" />
                            Check BUDJU Balance
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* ===== STEP 2: Choose Wallet ===== */}
                  {connectStep === "wallet" && (
                    <motion.div
                      key="step-wallet"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      {/* Selected action banner */}
                      <div className={`px-4 py-2.5 border-b ${dividerColor}`}>
                        <div className="flex items-center gap-2">
                          {selectedAction === "swap" && (
                            <FaExchangeAlt
                              className={`w-3 h-3 ${
                                isDarkMode ? "text-cyan-400" : "text-cyan-600"
                              }`}
                            />
                          )}
                          {selectedAction === "bot" && (
                            <FaRobot
                              className={`w-3 h-3 ${
                                isDarkMode
                                  ? "text-emerald-400"
                                  : "text-emerald-600"
                              }`}
                            />
                          )}
                          {selectedAction === "pool" && (
                            <FaSwimmingPool
                              className={`w-3 h-3 ${
                                isDarkMode
                                  ? "text-purple-400"
                                  : "text-purple-600"
                              }`}
                            />
                          )}
                          <span
                            className={`text-[11px] font-semibold ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            }`}
                          >
                            {selectedAction === "swap" &&
                              "Connect to Swap BUDJU"}
                            {selectedAction === "bot" &&
                              "Connect to Trading Bot"}
                            {selectedAction === "pool" &&
                              "Connect to Liquidity Pools"}
                          </span>
                        </div>
                      </div>

                      {/* Wallet list */}
                      <div className="p-2.5 space-y-1">
                        {getWalletsToDisplay().map((wallet) => {
                          const config = walletConfig[wallet];
                          const isDetected =
                            availableWallets.includes(wallet) ||
                            inAppBrowser === wallet;

                          return (
                            <div key={wallet}>
                              <button
                                onClick={() => handleConnect(wallet)}
                                className={`flex items-center w-full gap-3 px-3 py-3.5 rounded-xl transition-all duration-200 cursor-pointer ${hoverBg} group`}
                              >
                                <img
                                  src={config.logo}
                                  alt={config.name}
                                  className="w-10 h-10 rounded-xl"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display =
                                      "none";
                                  }}
                                />
                                <div className="text-left flex-1">
                                  <span
                                    className={`text-sm font-bold block ${textColor}`}
                                  >
                                    {config.name}
                                  </span>
                                  <span
                                    className={`text-[10px] ${subtextColor}`}
                                  >
                                    {config.tagline}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {isDetected && (
                                    <span
                                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                                        isDarkMode
                                          ? "bg-emerald-500/10 text-emerald-400/70"
                                          : "bg-emerald-50 text-emerald-600/70"
                                      }`}
                                    >
                                      Detected
                                    </span>
                                  )}
                                  <FaArrowRight
                                    className={`w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity ${
                                      isDarkMode
                                        ? "text-cyan-400/50"
                                        : "text-cyan-600/50"
                                    }`}
                                  />
                                </div>
                              </button>
                              {!isDetected && !isMobile && (
                                <button
                                  onClick={() => handleGetWallet(wallet)}
                                  className={`ml-13 mb-1 text-[10px] cursor-pointer transition-colors ${
                                    isDarkMode
                                      ? "text-cyan-400/50 hover:text-cyan-400"
                                      : "text-cyan-600/50 hover:text-cyan-600"
                                  }`}
                                >
                                  Install {config.name} &rarr;
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            ) : (
              <>
                {/* ========== CONNECTED STATE ========== */}

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
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <img
                      src={
                        walletConfig[connection.wallet?.name || "other"].logo
                      }
                      alt="Wallet"
                      className="w-7 h-7 rounded-lg"
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

                {/* BUDJU Balance Check + Bot Access */}
                <div className={`px-4 py-3 border-b ${dividerColor}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-widest ${subtextColor}`}
                    >
                      Bot Access
                    </span>
                    {hasBudjuAccess ? (
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          isDarkMode
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-emerald-50 text-emerald-600"
                        }`}
                      >
                        UNLOCKED
                      </span>
                    ) : (
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          isDarkMode
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        LOCKED
                      </span>
                    )}
                  </div>

                  <div
                    className={`flex items-center justify-between rounded-lg px-3 py-2.5 mb-2.5 ${
                      isDarkMode
                        ? "bg-white/[0.03] border border-white/[0.06]"
                        : "bg-gray-50 border border-gray-200/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FaCoins
                        className={`w-3.5 h-3.5 ${
                          hasBudjuAccess
                            ? isDarkMode
                              ? "text-emerald-400"
                              : "text-emerald-600"
                            : isDarkMode
                              ? "text-amber-400"
                              : "text-amber-600"
                        }`}
                      />
                      <div>
                        <span
                          className={`text-xs font-bold block ${textColor}`}
                        >
                          {loadingBalances
                            ? "..."
                            : budjuBalance.toLocaleString()}{" "}
                          BUDJU
                        </span>
                        <span className={`text-[9px] ${subtextColor}`}>
                          {loadingBalances
                            ? "Checking..."
                            : hasBudjuAccess
                              ? "Requirement met"
                              : `Need ${(BUDJU_REQUIRED - budjuBalance).toLocaleString()} more`}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleRefresh}
                      className={`p-1.5 rounded-md transition-all cursor-pointer ${hoverBg}`}
                      disabled={loadingBalances}
                    >
                      <FaSyncAlt
                        className={`w-2.5 h-2.5 ${
                          isDarkMode ? "text-cyan-400/60" : "text-cyan-600/60"
                        } ${loadingBalances ? "animate-spin" : ""}`}
                      />
                    </button>
                  </div>

                  {!hasBudjuAccess && !loadingBalances && (
                    <button
                      onClick={() => goTo(ROUTES.SWAP)}
                      className={`flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                        isDarkMode
                          ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/15 text-cyan-300 hover:from-cyan-500/30 hover:to-blue-500/25 border border-cyan-500/20"
                          : "bg-gradient-to-r from-cyan-50 to-blue-50 text-cyan-700 hover:from-cyan-100 hover:to-blue-100 border border-cyan-200/40"
                      }`}
                    >
                      <FaExchangeAlt className="w-3 h-3" />
                      Buy BUDJU Now
                    </button>
                  )}
                </div>

                {/* Quick Actions */}
                <div className={`px-3 py-3 border-b ${dividerColor}`}>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-widest px-1 mb-2.5 block ${subtextColor}`}
                  >
                    Quick Actions
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => goTo(ROUTES.SWAP)}
                      className={`flex flex-col items-center gap-2 px-2 py-3 rounded-xl text-[10px] font-semibold transition-all duration-200 cursor-pointer group border ${
                        isDarkMode
                          ? "bg-gradient-to-b from-cyan-500/[0.08] to-transparent border-cyan-500/[0.1] hover:border-cyan-500/30"
                          : "bg-gradient-to-b from-cyan-50 to-transparent border-cyan-200/30 hover:border-cyan-300/60"
                      }`}
                    >
                      <FaExchangeAlt
                        className={`w-4 h-4 ${
                          isDarkMode
                            ? "text-cyan-400 group-hover:text-cyan-300"
                            : "text-cyan-600 group-hover:text-cyan-500"
                        }`}
                      />
                      <span className={textColor}>Swap</span>
                    </button>
                    <button
                      onClick={() => goTo(ROUTES.BANK)}
                      className={`flex flex-col items-center gap-2 px-2 py-3 rounded-xl text-[10px] font-semibold transition-all duration-200 cursor-pointer group border ${
                        isDarkMode
                          ? "bg-gradient-to-b from-emerald-500/[0.08] to-transparent border-emerald-500/[0.1] hover:border-emerald-500/30"
                          : "bg-gradient-to-b from-emerald-50 to-transparent border-emerald-200/30 hover:border-emerald-300/60"
                      }`}
                    >
                      <FaRobot
                        className={`w-4 h-4 ${
                          isDarkMode
                            ? "text-emerald-400 group-hover:text-emerald-300"
                            : "text-emerald-600 group-hover:text-emerald-500"
                        }`}
                      />
                      <span className={textColor}>Bot</span>
                    </button>
                    <button
                      onClick={() => goTo(ROUTES.POOL)}
                      className={`flex flex-col items-center gap-2 px-2 py-3 rounded-xl text-[10px] font-semibold transition-all duration-200 cursor-pointer group border ${
                        isDarkMode
                          ? "bg-gradient-to-b from-purple-500/[0.08] to-transparent border-purple-500/[0.1] hover:border-purple-500/30"
                          : "bg-gradient-to-b from-purple-50 to-transparent border-purple-200/30 hover:border-purple-300/60"
                      }`}
                    >
                      <FaSwimmingPool
                        className={`w-4 h-4 ${
                          isDarkMode
                            ? "text-purple-400 group-hover:text-purple-300"
                            : "text-purple-600 group-hover:text-purple-500"
                        }`}
                      />
                      <span className={textColor}>Pool</span>
                    </button>
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
                  </div>
                  {loadingBalances ? (
                    <div className={`text-xs ${subtextColor}`}>Loading...</div>
                  ) : balanceError ? (
                    <div className="text-xs text-red-400">{balanceError}</div>
                  ) : (
                    <div className="space-y-2.5">
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
                <div className="p-2.5">
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
