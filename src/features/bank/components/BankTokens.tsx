import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

// Constants for API keys and endpoints
const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY || "";
const HELIUS_RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Validate API keys
if (!HELIUS_API_KEY) {
  throw new Error("Missing API key for Helius");
}

// Bank of Budju address
const BANK_OF_BUDJU_ADDRESS = "7grCp49j6SExSRud7YA5TdDSbWFyAJjLGif8Syr5CVpc";

// Create Solana connection
const connection = new Connection(HELIUS_RPC_ENDPOINT, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 60000,
});

// TokenHolding interface
interface TokenHolding {
  name: string;
  symbol: string;
  logo: string;
  amount: number;
  value: number;
  color: string;
}

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

// Fetch token metadata dynamically using Helius
async function fetchTokenMetadata(tokenAddress: string): Promise<{
  name: string;
  symbol: string;
  logo: string;
  color: string;
}> {
  const cacheKey = `metadata_${tokenAddress}`;
  const cachedMetadata = getCachedData(cacheKey);
  if (cachedMetadata !== null) {
    return cachedMetadata;
  }

  try {
    const response = await retryFetch(HELIUS_RPC_ENDPOINT, {
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
      color: "bg-gray-500", // Default color; can be mapped based on symbol
    };
    setCachedData(cacheKey, metadata, 60 * 60 * 1000); // Cache for 1 hour
    return metadata;
  } catch (error) {
    console.error(`Error fetching metadata for token ${tokenAddress}:`, error);
    return {
      name: "Unknown Token",
      symbol: "UNKNOWN",
      logo: "/images/tokens/default.png",
      color: "bg-gray-500",
    };
  }
}

// Fetch bank holdings for BANK_OF_BUDJU_ADDRESS
async function fetchBankHoldings(): Promise<TokenHolding[]> {
  const cacheKey = `bank_holdings_${BANK_OF_BUDJU_ADDRESS}`;
  const cachedHoldings = getCachedData(cacheKey);
  if (cachedHoldings !== null) {
    return cachedHoldings;
  }

  try {
    // Fetch all token accounts owned by BANK_OF_BUDJU_ADDRESS
    const bankPublicKey = new PublicKey(BANK_OF_BUDJU_ADDRESS);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      bankPublicKey,
      {
        programId: TOKEN_PROGRAM_ID,
      },
    );

    // Process each token account in batches
    const holdings: TokenHolding[] = [];
    const fetchPromises = tokenAccounts.value.map(async (account) => {
      const parsedInfo = account.account.data.parsed.info;
      const tokenAddress = parsedInfo.mint;
      const amount = parsedInfo.tokenAmount.uiAmount || 0;

      // Skip negligible amounts
      if (amount < 0.0001) return;

      // Fetch token price and metadata in parallel
      const [price, metadata] = await Promise.all([
        fetchTokenPrice(tokenAddress),
        fetchTokenMetadata(tokenAddress),
      ]);

      const value = amount * price;

      // Only include holdings with a positive value
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

    // Wait for all fetches to complete
    await Promise.all(fetchPromises);

    // Sort by value (descending)
    const sortedHoldings = holdings.sort((a, b) => b.value - a.value);
    setCachedData(cacheKey, sortedHoldings, 10 * 60 * 1000); // Cache for 10 minutes
    return sortedHoldings;
  } catch (error) {
    console.error("Error fetching bank holdings:", error);
    return [];
  }
}

// BankTokens Component with Image 2 Styling
const BankTokens = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const [tokenHoldings, setTokenHoldings] = useState<TokenHolding[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch bank holdings on component mount
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

  // GSAP animations (simplified to match Image 2's static layout)
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

  // Calculate total bank value
  const totalBankValue = tokenHoldings.reduce(
    (sum, token) => sum + token.value,
    0,
  );

  return (
    <section
      ref={sectionRef}
      className="py-10 bg-[#0a0a0a] text-white" // Dark background like Image 2
    >
      <div className="max-w-5xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <h2 className="text-3xl font-bold mb-2 text-white">BANK HOLDINGS</h2>
          <p className="text-sm text-gray-400">
            Current assets held in the Bank of BUDJU
          </p>
        </motion.div>

        {/* Total Value */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-center mb-8"
        >
          <div className="text-gray-400 text-sm mb-1">Total Bank Assets</div>
          <div className="text-4xl font-bold text-white">
            $
            {totalBankValue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </motion.div>

        {/* Loading/Error State */}
        {loading && (
          <div className="text-center text-gray-400">
            Loading bank holdings...
          </div>
        )}
        {error && (
          <div className="text-center text-red-500">
            {error}{" "}
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
              className="text-blue-400 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Token Cards */}
        {!loading && !error && tokenHoldings.length > 0 && (
          <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {tokenHoldings.map((token, _) => (
              <div
                key={token.symbol + token.name}
                className="token-card bg-[#1a1a1a] rounded-lg shadow-md overflow-hidden"
              >
                {/* Top colored bar */}
                <div className={`h-2 ${token.color}`}></div>

                <div className="p-4">
                  {/* Token header */}
                  <div className="flex items-center mb-4">
                    <img
                      src={token.logo}
                      alt={token.name}
                      className="w-8 h-8 mr-3 rounded-full"
                      onError={(e) => {
                        e.currentTarget.src = "/images/tokens/default.png";
                      }}
                    />
                    <div>
                      <div className="text-white font-bold text-lg">
                        {token.name}
                      </div>
                      <div className="text-gray-400 text-sm">
                        {token.symbol}
                      </div>
                    </div>
                  </div>

                  {/* Token amount */}
                  <div className="mb-2">
                    <div className="text-gray-400 text-xs">Amount</div>
                    <div className="text-white text-base font-mono">
                      {token.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  {/* Token value */}
                  <div className="mb-2">
                    <div className="text-gray-400 text-xs">Value</div>
                    <div className="text-blue-400 text-base font-bold">
                      $
                      {token.value.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  {/* Percentage of total */}
                  <div>
                    <div className="text-gray-400 text-xs">% of Bank</div>
                    <div className="text-white text-base">
                      {((token.value / totalBankValue) * 100).toFixed(1)}%
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${token.color}`}
                      style={{
                        width: `${(token.value / totalBankValue) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Fallback if no holdings */}
        {!loading && !error && tokenHoldings.length === 0 && (
          <div className="text-center text-gray-400">
            No bank holdings found.
          </div>
        )}

        <div className="text-center mt-8 text-gray-400 text-sm max-w-2xl mx-auto">
          All Bank of BUDJU holdings are verifiable on the Solana blockchain and
          regularly updated. Assets are used for token buybacks, burns, and
          ecosystem development.
        </div>
      </div>
    </section>
  );
};

export default BankTokens;
