import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { useTheme } from "@/context/ThemeContext";

// Register Chart.js components
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// Constants
const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY || "";
const RPC_ENDPOINT = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : "https://api.mainnet-beta.solana.com";
const BANK_OF_BUDJU_ADDRESS = "DWUjFtJQtVDu2yPUoQaf3Lhy1SPt6vor5q1i4fqH13Po";

// Solana connection
const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 60000,
});

// Cache
const cache: Record<string, { data: any; expiry: number }> = {};

const getCachedData = (key: string): any | null => {
  const cached = cache[key];
  return cached && Date.now() < cached.expiry ? cached.data : null;
};

const setCachedData = (key: string, data: any, ttl: number): void => {
  cache[key] = { data, expiry: Date.now() + ttl };
};

// Fetch with retry
const retryFetch = async (
  url: string,
  options: RequestInit,
  retries = 3,
  delay = 1000,
): Promise<Response> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok && response.status === 429 && attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, delay * Math.pow(2, attempt)),
        );
        continue;
      }
      if (!response.ok)
        throw new Error(`HTTP error! Status: ${response.status}`);
      return response;
    } catch (error) {
      if (attempt === retries)
        throw new Error(`Failed after ${retries} attempts: ${error}`);
      await new Promise((resolve) =>
        setTimeout(resolve, delay * Math.pow(2, attempt)),
      );
    }
  }
  throw new Error("Unexpected error in retryFetch");
};

// Fetch token price
const fetchTokenPrice = async (tokenAddress: string): Promise<number> => {
  const cacheKey = `price_${tokenAddress}`;
  const cachedPrice = getCachedData(cacheKey);
  if (cachedPrice !== null) return cachedPrice;

  try {
    const response = await retryFetch(
      `https://api.jup.ag/price/v2?ids=${tokenAddress}`,
      {
        headers: { Accept: "application/json" },
      },
    );
    const data = await response.json();
    const price = Number(data.data[tokenAddress]?.price || 0);
    if (!isNaN(price) && price > 0) {
      setCachedData(cacheKey, price, 5 * 60 * 1000); // 5 minutes
      return price;
    }
    throw new Error("No valid price from Jupiter");
  } catch (error) {
    console.error("Error fetching price:", error);
    return 0;
  }
};

// Fetch token metadata
// Well-known token metadata (fallback when Helius DAS API unavailable)
const KNOWN_TOKENS: Record<string, { name: string; symbol: string; logo: string; color: string }> = {
  "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump": {
    name: "BUDJU", symbol: "BUDJU", logo: "/images/tokens/budju.png", color: "bg-pink-500",
  },
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": {
    name: "USD Coin", symbol: "USDC", logo: "/images/tokens/usdc.png", color: "bg-blue-500",
  },
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": {
    name: "Tether USD", symbol: "USDT", logo: "/images/tokens/usdt.png", color: "bg-green-500",
  },
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": {
    name: "Raydium", symbol: "RAY", logo: "/images/tokens/ray.png", color: "bg-purple-500",
  },
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": {
    name: "Wrapped BTC (Portal)", symbol: "wBTC", logo: "/images/tokens/btc.png", color: "bg-orange-500",
  },
};

const fetchTokenMetadata = async (
  tokenAddress: string,
): Promise<{
  name: string;
  symbol: string;
  logo: string;
  color: string;
}> => {
  if (KNOWN_TOKENS[tokenAddress]) return KNOWN_TOKENS[tokenAddress];

  const cacheKey = `metadata_${tokenAddress}`;
  const cachedMetadata = getCachedData(cacheKey);
  if (cachedMetadata !== null) return cachedMetadata;

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
      console.error(`Metadata error for ${tokenAddress}:`, error);
    }
  }

  return {
    name: "Unknown Token",
    symbol: "UNKNOWN",
    logo: "/images/tokens/default.png",
    color: "bg-gray-500",
  };
};

// SOL metadata
const SOL_METADATA = {
  name: "Solana",
  symbol: "SOL",
  logo: "https://cryptologos.cc/logos/solana-sol-logo.png",
  color: "bg-purple-500",
};

// Token holding type
type TokenHolding = {
  name: string;
  symbol: string;
  logo: string;
  amount: number;
  value: number;
  color: string;
};

// Fetch bank holdings
const fetchBankHoldings = async (): Promise<TokenHolding[]> => {
  const cacheKey = `bank_holdings_${BANK_OF_BUDJU_ADDRESS}`;
  const cachedHoldings = getCachedData(cacheKey);
  if (cachedHoldings !== null) return cachedHoldings;

  try {
    const bankPublicKey = new PublicKey(BANK_OF_BUDJU_ADDRESS);
    const solBalanceLamports = await connection.getBalance(bankPublicKey);
    const solAmount = solBalanceLamports / 1e9;
    const solPrice = await fetchTokenPrice(
      "So11111111111111111111111111111111111111112",
    );
    const solHolding: TokenHolding = {
      ...SOL_METADATA,
      amount: solAmount,
      value: solAmount * solPrice,
    };

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      bankPublicKey,
      { programId: TOKEN_PROGRAM_ID },
    );
    const holdings: TokenHolding[] = [solHolding];
    const fetchPromises = tokenAccounts.value.map(async (account) => {
      const info = account.account.data.parsed.info;
      const tokenAddress = info.mint;
      const amount = info.tokenAmount.uiAmount || 0;
      if (amount < 0.0001) return;

      const [price, metadata] = await Promise.all([
        fetchTokenPrice(tokenAddress),
        fetchTokenMetadata(tokenAddress),
      ]);
      const value = amount * price;
      if (value > 0) holdings.push({ ...metadata, amount, value });
    });

    await Promise.all(fetchPromises);
    const sortedHoldings = holdings.sort((a, b) => b.value - a.value);
    setCachedData(cacheKey, sortedHoldings, 10 * 60 * 1000); // 10 minutes
    return sortedHoldings;
  } catch (error) {
    console.error("Error fetching holdings:", error);
    return [];
  }
};

// Colors
const chartColors = [
  "#FF6384",
  "#36A2EB",
  "#FFCE56",
  "#4BC0C0",
  "#9966FF",
  "#FF9F40",
];

// Component
const BankChart = () => {
  const { isDarkMode } = useTheme();
  const [tokenHoldings, setTokenHoldings] = useState<TokenHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const holdings = await fetchBankHoldings();
        setTokenHoldings(holdings);
      } catch (err) {
        setError("Failed to load holdings.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const barData = {
    labels: tokenHoldings.map((t) => t.symbol),
    datasets: [
      {
        label: "Token Value (USD)",
        data: tokenHoldings.map((t) => t.value),
        backgroundColor: tokenHoldings.map(
          (_, i) => chartColors[i % chartColors.length],
        ),
        borderColor: isDarkMode ? "#333" : "#E5E7EB",
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.label}: $${ctx.raw.toFixed(2)}`,
        },
        backgroundColor: isDarkMode ? "#1F2937" : "#ffffff",
        titleColor: isDarkMode ? "#ffffff" : "#333333",
        bodyColor: isDarkMode ? "#ffffff" : "#333333",
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: "Value (USD)",
          color: isDarkMode ? "#ffffff" : "#333333",
        },
        grid: {
          color: isDarkMode ? "#374151" : "#E5E7EB",
        },
        ticks: {
          color: isDarkMode ? "#ffffff" : "#333333",
        },
      },
      x: {
        title: {
          display: true,
          text: "Tokens",
          color: isDarkMode ? "#ffffff" : "#333333",
        },
        grid: {
          color: isDarkMode ? "#374151" : "#E5E7EB",
        },
        ticks: {
          color: isDarkMode ? "#ffffff" : "#333333",
        },
      },
    },
  };

  return (
    <section
      className={`py-20 ${
        isDarkMode ? "bg-gradient-to-b" : "bg-gradient-to-b"
      }`}
    >
      <div className="max-w-5xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-2">
            <span className={isDarkMode ? "text-white" : "text-budju-white"}>
              CURRENT
            </span>{" "}
            <span className="text-budju-pink">TOKEN VALUES</span>
          </h2>
          <p
            className={`text-sm ${isDarkMode ? "text-gray-400" : "text-white/80"}`}
          >
            Current value of tokens in Bank of BUDJU
          </p>
        </motion.div>
        {loading && (
          <div
            className={`text-center ${isDarkMode ? "text-gray-400" : "text-white/80"}`}
          >
            Loading...
          </div>
        )}
        {error && (
          <div
            className={`text-center ${isDarkMode ? "text-red-400" : "text-red-400"}`}
          >
            {error}
          </div>
        )}
        {!loading && !error && tokenHoldings.length > 0 && (
          <div className="flex justify-center">
            <div style={{ width: "100%", maxWidth: "800px" }}>
              <Bar data={barData} options={options} />
            </div>
          </div>
        )}
        {!loading && !error && tokenHoldings.length === 0 && (
          <div
            className={`text-center ${isDarkMode ? "text-gray-400" : "text-white/80"}`}
          >
            No holdings found.
          </div>
        )}
      </div>
    </section>
  );
};

export default BankChart;
