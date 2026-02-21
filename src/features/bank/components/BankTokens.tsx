import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useTheme } from "@/context/ThemeContext";

// Constants for API keys and endpoints
const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY || "";
const RPC_ENDPOINT = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : "https://api.mainnet-beta.solana.com";

// Bank of Budju address
const BANK_OF_BUDJU_ADDRESS = "DWUjFtJQtVDu2yPUoQaf3Lhy1SPt6vor5q1i4fqH13Po";

// Create Solana connection
const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 60000,
});

// Simple in-memory cache
const cache: Record<string, { data: any; expiry: number }> = {};

function getCachedData(key: string): any | null {
  const cached = cache[key];
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }
  return null;
}

function setCachedData(key: string, data: any, ttl: number): void {
  cache[key] = { data, expiry: Date.now() + ttl };
}

// Optimized retryFetch with exponential backoff
async function retryFetch(
  url: string,
  options: RequestInit,
  retries = 3,
  delay = 1000,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429 && attempt < retries) {
          await new Promise((resolve) =>
            setTimeout(resolve, delay * Math.pow(2, attempt)),
          );
          continue;
        }
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response;
    } catch (error) {
      if (attempt === retries) {
        if (error instanceof Error) {
          throw new Error(`Failed after ${retries} attempts: ${error.message}`);
        } else {
          throw new Error(`Failed after ${retries} attempts: ${String(error)}`);
        }
      }
      await new Promise((resolve) =>
        setTimeout(resolve, delay * Math.pow(2, attempt)),
      );
    }
  }
  throw new Error("Unexpected error in retryFetch");
}

// Fetch token price with caching
async function fetchTokenPrice(tokenAddress: string): Promise<number> {
  const cacheKey = `price_${tokenAddress}`;
  const cachedPrice = getCachedData(cacheKey);
  if (cachedPrice !== null) {
    return cachedPrice;
  }

  try {
    const response = await retryFetch(
      `https://api.jup.ag/price/v2?ids=${tokenAddress}`,
      { headers: { Accept: "application/json" } },
    );
    const data = await response.json();
    const price = Number(data.data[tokenAddress]?.price || 0);
    if (!isNaN(price) && price > 0) {
      setCachedData(cacheKey, price, 5 * 60 * 1000); // Cache for 5 minutes
      return price;
    }
    throw new Error("No valid price from Jupiter");
  } catch (error) {
    console.error("Error fetching token price:", error);
    return 0;
  }
}

// Well-known token metadata (fallback when Helius DAS API unavailable)
const KNOWN_TOKENS: Record<string, { name: string; symbol: string; logo: string; color: string }> = {
  "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump": {
    name: "BUDJU",
    symbol: "BUDJU",
    logo: "/images/tokens/budju.png",
    color: "bg-pink-500",
  },
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": {
    name: "USD Coin",
    symbol: "USDC",
    logo: "/images/tokens/usdc.png",
    color: "bg-blue-500",
  },
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": {
    name: "Tether USD",
    symbol: "USDT",
    logo: "/images/tokens/usdt.png",
    color: "bg-green-500",
  },
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": {
    name: "Raydium",
    symbol: "RAY",
    logo: "/images/tokens/ray.png",
    color: "bg-purple-500",
  },
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": {
    name: "Wrapped BTC (Portal)",
    symbol: "wBTC",
    logo: "/images/tokens/btc.png",
    color: "bg-orange-500",
  },
};

// Fetch token metadata — uses known tokens first, then Helius DAS API
async function fetchTokenMetadata(tokenAddress: string): Promise<{
  name: string;
  symbol: string;
  logo: string;
  color: string;
}> {
  // Check known tokens first
  if (KNOWN_TOKENS[tokenAddress]) {
    return KNOWN_TOKENS[tokenAddress];
  }

  const cacheKey = `metadata_${tokenAddress}`;
  const cachedMetadata = getCachedData(cacheKey);
  if (cachedMetadata !== null) {
    return cachedMetadata;
  }

  // Only attempt Helius DAS API if we have an API key
  if (HELIUS_API_KEY) {
    try {
      const heliusEndpoint = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
      const response = await retryFetch(heliusEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "token-metadata",
          method: "getAsset",
          params: { id: tokenAddress },
        }),
      });
      const data = await response.json();
      const tokenData = data.result?.content?.metadata || {};
      const metadata = {
        name: tokenData.name || "Unknown Token",
        symbol: tokenData.symbol || "UNKNOWN",
        logo: data.result?.content?.links?.image || "/images/tokens/default.png",
        color: "bg-gray-500",
      };
      setCachedData(cacheKey, metadata, 60 * 60 * 1000);
      return metadata;
    } catch (error) {
      console.error(`Error fetching metadata for token ${tokenAddress}:`, error);
    }
  }

  return {
    name: "Unknown Token",
    symbol: "UNKNOWN",
    logo: "/images/tokens/default.png",
    color: "bg-gray-500",
  };
}

// Static metadata for SOL
const SOL_METADATA = {
  name: "Solana",
  symbol: "SOL",
  logo: "https://cryptologos.cc/logos/solana-sol-logo.png", // Public SOL logo
  color: "bg-purple-500",
};

// TokenHolding interface
interface TokenHolding {
  name: string;
  symbol: string;
  logo: string;
  amount: number;
  value: number;
  color: string;
}

// Fetch bank holdings including SOL
async function fetchBankHoldings(): Promise<TokenHolding[]> {
  const cacheKey = `bank_holdings_${BANK_OF_BUDJU_ADDRESS}`;
  const cachedHoldings = getCachedData(cacheKey);
  if (cachedHoldings !== null) {
    return cachedHoldings;
  }

  try {
    const bankPublicKey = new PublicKey(BANK_OF_BUDJU_ADDRESS);

    // Fetch SOL balance
    const solBalanceLamports = await connection.getBalance(bankPublicKey);
    const solAmount = solBalanceLamports / 1e9; // Convert lamports to SOL
    const solPrice = await fetchTokenPrice(
      "So11111111111111111111111111111111111111112",
    ); // SOL mint address
    const solHolding: TokenHolding = {
      ...SOL_METADATA,
      amount: solAmount,
      value: solAmount * solPrice,
    };

    // Fetch SPL token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      bankPublicKey,
      { programId: TOKEN_PROGRAM_ID },
    );

    const holdings: TokenHolding[] = [solHolding]; // Start with SOL
    const fetchPromises = tokenAccounts.value.map(async (account) => {
      const parsedInfo = account.account.data.parsed.info;
      const tokenAddress = parsedInfo.mint;
      const amount = parsedInfo.tokenAmount.uiAmount || 0;

      if (amount < 0.0001) return; // Skip negligible amounts

      const [price, metadata] = await Promise.all([
        fetchTokenPrice(tokenAddress),
        fetchTokenMetadata(tokenAddress),
      ]);

      const value = amount * price;
      if (value > 0) {
        holdings.push({
          name: metadata.name,
          symbol: metadata.symbol,
          logo: metadata.logo,
          amount,
          value,
          color: metadata.color,
        });
      }
    });

    await Promise.all(fetchPromises);

    const sortedHoldings = holdings.sort((a, b) => b.value - a.value);
    setCachedData(cacheKey, sortedHoldings, 10 * 60 * 1000); // Cache for 10 minutes
    return sortedHoldings;
  } catch (error) {
    console.error("Error fetching bank holdings:", error);
    return [];
  }
}

// BankTokens Component with Dark Mode Support
const BankTokens = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const [tokenHoldings, setTokenHoldings] = useState<TokenHolding[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBankHoldings = async () => {
      try {
        setLoading(true);
        const holdings = await fetchBankHoldings();
        setTokenHoldings(holdings);
      } catch (err) {
        console.error("Failed to load bank holdings:", err);
        setError("Failed to load bank holdings. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    loadBankHoldings();
  }, []);

  useEffect(() => {
    if (sectionRef.current && cardsRef.current && tokenHoldings.length > 0) {
      const cards = cardsRef.current.querySelectorAll(".token-card");

      gsap.fromTo(
        cards,
        { opacity: 0, y: 20, scale: 0.95 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          stagger: 0.1,
          duration: 0.6,
          ease: "power2.out",
        },
      );

      cards.forEach((card) => {
        card.addEventListener("mouseenter", () => {
          gsap.to(card, {
            y: -5,
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.3)",
            duration: 0.3,
          });
        });

        card.addEventListener("mouseleave", () => {
          gsap.to(card, {
            y: 0,
            boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
            duration: 0.5,
            ease: "elastic.out(1, 0.5)",
          });
        });
      });
    }
  }, [tokenHoldings]);

  const totalBankValue = tokenHoldings.reduce(
    (sum, token) => sum + token.value,
    0,
  );

  return (
    <section ref={sectionRef} className="py-16 md:py-24 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <h2
            className={`text-2xl md:text-3xl font-bold font-display mb-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            Treasury{" "}
            <span className="bg-gradient-to-r from-amber-400 to-budju-blue bg-clip-text text-transparent">
              Holdings
            </span>
          </h2>
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            Live on-chain balances — fully verifiable on Solscan
          </p>
        </motion.div>

        {/* Total Value */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-center mb-10"
        >
          <p
            className={`text-[10px] uppercase tracking-[0.2em] font-bold mb-1 ${
              isDarkMode ? "text-amber-400/60" : "text-amber-600/60"
            }`}
          >
            Total Bank Assets
          </p>
          <div
            className={`text-4xl md:text-5xl font-black font-display ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {loading ? (
              <span
                className={`text-2xl ${
                  isDarkMode ? "text-gray-500" : "text-gray-400"
                }`}
              >
                Loading...
              </span>
            ) : (
              `$${totalBankValue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            )}
          </div>
        </motion.div>

        {/* Error state */}
        {error && (
          <div className="text-center mb-8">
            <p className="text-red-400 text-sm mb-2">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                fetchBankHoldings()
                  .then(setTokenHoldings)
                  .catch((err) => {
                    console.error(err);
                    setError(
                      "Failed to load bank holdings. Please try again later.",
                    );
                  })
                  .finally(() => setLoading(false));
              }}
              className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors ${
                isDarkMode
                  ? "bg-white/10 text-white hover:bg-white/20"
                  : "bg-gray-100 text-gray-900 hover:bg-gray-200"
              }`}
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div
            className={`text-center text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-400"
            }`}
          >
            Fetching holdings from the Solana blockchain...
          </div>
        )}

        {/* Token Cards */}
        {!loading && !error && tokenHoldings.length > 0 && (
          <div
            ref={cardsRef}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {tokenHoldings.map((token, index) => (
              <motion.div
                key={token.symbol + token.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className={`token-card rounded-xl border p-5 ${
                  isDarkMode
                    ? "bg-[#0c0c20]/60 border-white/[0.06] hover:border-white/[0.12]"
                    : "bg-white/60 border-gray-200/40 hover:border-gray-300/60"
                } backdrop-blur-sm transition-all duration-300`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <img
                    src={token.logo}
                    alt={token.name}
                    className="w-10 h-10 rounded-full"
                    onError={(e) => {
                      e.currentTarget.src = "/images/tokens/default.png";
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className={`font-bold text-sm truncate ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {token.name}
                    </div>
                    <div
                      className={`text-xs ${
                        isDarkMode ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      {token.symbol}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-sm font-bold ${
                        isDarkMode ? "text-amber-400" : "text-amber-600"
                      }`}
                    >
                      $
                      {token.value.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div
                      className={`text-xs ${
                        isDarkMode ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      {totalBankValue > 0
                        ? `${((token.value / totalBankValue) * 100).toFixed(1)}%`
                        : "—"}
                    </div>
                  </div>
                </div>
                <div
                  className={`flex items-center justify-between text-xs mb-2 ${
                    isDarkMode ? "text-gray-500" : "text-gray-500"
                  }`}
                >
                  <span>Amount</span>
                  <span
                    className={`font-mono ${
                      isDarkMode ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {token.amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}
                  </span>
                </div>
                <div
                  className={`h-1.5 rounded-full overflow-hidden ${
                    isDarkMode ? "bg-white/[0.06]" : "bg-gray-200/60"
                  }`}
                >
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-budju-pink rounded-full transition-all duration-700"
                    style={{
                      width:
                        totalBankValue > 0
                          ? `${(token.value / totalBankValue) * 100}%`
                          : "0%",
                    }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {!loading && !error && tokenHoldings.length === 0 && (
          <div
            className={`text-center text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-400"
            }`}
          >
            No holdings found for this address.
          </div>
        )}
      </div>
    </section>
  );
};

export default BankTokens;
