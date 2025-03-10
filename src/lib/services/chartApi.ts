import { RPC_ENDPOINT } from "@constants/addresses";

export interface CandlestickData {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ChartOptions {
  baseToken: string;
  quoteToken: string;
  timeframe: string;
  limit?: number;
}

// Cache for chart data
const chartDataCache = new Map<
  string,
  { data: CandlestickData[]; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Generate a sample dataset for when API data isn't available
 */
const generateSampleData = (
  basePrice: number,
  days: number,
): CandlestickData[] => {
  const result: CandlestickData[] = [];
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(now.getDate() - i);

    const volatility = 0.02;
    const changePercent = (Math.random() * 2 - 1) * volatility;
    const baseForDay = basePrice * (1 + (changePercent * (days - i)) / 10);

    const open = baseForDay * (1 + (Math.random() * 0.01 - 0.005));
    const close = baseForDay * (1 + (Math.random() * 0.01 - 0.005));
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    const volume = Math.floor(Math.random() * 1000) + 500;

    result.push({
      time: Math.floor(date.getTime() / 1000),
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return result;
};

/**
 * Get chart data for a token pair
 */
export const getChartData = async (
  options: ChartOptions,
): Promise<CandlestickData[]> => {
  const { baseToken, quoteToken, timeframe, limit = 100 } = options;
  const cacheKey = `${baseToken}/${quoteToken}/${timeframe}`;

  // Check cache
  const cachedData = chartDataCache.get(cacheKey);
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
    return cachedData.data;
  }

  try {
    // CryptoCompare API key (get from https://min-api.cryptocompare.com/)
    const CRYPTOCOMPARE_API_KEY =
      import.meta.env.VITE_CRYPTOCOMPARE_API_KEY || "";
    if (!CRYPTOCOMPARE_API_KEY) {
      throw new Error("CryptoCompare API key not configured");
    }

    // Set token symbols
    let fsym = baseToken; // Base token symbol (e.g., "SOL", "RAY")
    let tsym = quoteToken === "USDC" ? "USD" : quoteToken; // Quote token symbol (e.g., "USD", "RAY")

    // Basic validation for tokens
    const supportedTokens = ["SOL", "RAY", "BUDJU", "USD", "USDC"];
    if (!supportedTokens.includes(fsym)) {
      console.warn(`Base token ${fsym} may not be supported by CryptoCompare`);
    }
    if (!supportedTokens.includes(quoteToken) && quoteToken !== "USDC") {
      console.warn(`Quote token ${tsym} may not be supported by CryptoCompare`);
    }

    // Determine endpoint and aggregation
    let endpoint: string;
    let aggregate: number;
    let adjustedLimit: number;

    switch (timeframe) {
      case "15m":
        endpoint = "histominute";
        aggregate = 15; // 15 minutes
        adjustedLimit = Math.min(limit, 2000); // Max 2000 points
        break;
      case "1H":
        endpoint = "histominute";
        aggregate = 60; // 60 minutes
        adjustedLimit = Math.min(limit, 2000);
        break;
      case "4H":
        endpoint = "histominute";
        aggregate = 240; // 4 hours
        adjustedLimit = Math.min(limit, 2000);
        break;
      case "1D":
        endpoint = "histohour";
        aggregate = 24; // 24 hours = 1 day
        adjustedLimit = Math.min(limit, 2000); // Max 2000 hours
        break;
      case "1W":
        endpoint = "histoday";
        aggregate = 7; // 7 days = 1 week
        adjustedLimit = Math.min(limit, 2000); // Max 2000 days
        break;
      default:
        throw new Error(`Unsupported timeframe: ${timeframe}`);
    }

    // Fetch data from CryptoCompare
    const response = await fetch(
      `https://min-api.cryptocompare.com/data/v2/${endpoint}?fsym=${fsym}&tsym=btc&limit=${adjustedLimit}&aggregate=${aggregate}&api_key=${CRYPTOCOMPARE_API_KEY}`,
      {
        headers: {
          accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `API error: ${response.status} - ${await response.text()}`,
      );
    }

    const data = await response.json();

    if (
      data.Response !== "Success" ||
      !data.Data ||
      !Array.isArray(data.Data.Data)
    ) {
      throw new Error(
        `Invalid response from CryptoCompare: ${data.Message || "Unknown error"}`,
      );
    }

    // Format CryptoCompare OHLCV data
    const chartData: CandlestickData[] = data.Data.Data.map((item: any) => ({
      time: item.time, // Already in seconds
      open: parseFloat(item.open) || 0,
      high: parseFloat(item.high) || 0,
      low: parseFloat(item.low) || 0,
      close: parseFloat(item.close) || 0,
      volume: parseFloat(item.volumefrom) || 0, // Volume in base token
    }));

    // Filter out invalid data (e.g., all zeros)
    const validData = chartData.filter(
      (item) =>
        item.open > 0 || item.high > 0 || item.low > 0 || item.close > 0,
    );

    if (validData.length === 0) {
      throw new Error("No valid data points returned");
    }

    // Update cache
    chartDataCache.set(cacheKey, {
      data: validData,
      timestamp: Date.now(),
    });

    return validData;
  } catch (error) {
    console.error("Error fetching chart data from CryptoCompare:", error);

    // Generate sample data as fallback
    let basePrice = 0;
    if (baseToken === "SOL" && quoteToken === "RAY") {
      basePrice = 75.5;
    } else if (baseToken === "SOL" && quoteToken === "USDC") {
      basePrice = 140.5;
    } else if (baseToken === "RAY" && quoteToken === "USDC") {
      basePrice = 1.85;
    } else if (baseToken === "BUDJU" && quoteToken === "USDC") {
      basePrice = 0.0002;
    } else {
      basePrice = 1.0;
    }

    const days = timeframeToDays(timeframe, limit);
    const sampleData = generateSampleData(basePrice, days);

    chartDataCache.set(cacheKey, {
      data: sampleData,
      timestamp: Date.now(),
    });

    return sampleData;
  }
};

/**
 * Convert timeframe to seconds
 */
const getTimeframeSeconds = (timeframe: string): number => {
  switch (timeframe) {
    case "15m":
      return 15 * 60;
    case "1H":
      return 60 * 60;
    case "4H":
      return 4 * 60 * 60;
    case "1D":
      return 24 * 60 * 60;
    case "1W":
      return 7 * 24 * 60 * 60;
    default:
      return 24 * 60 * 60; // Default to 1 day
  }
};

/**
 * Convert timeframe to days for sample data
 */
const timeframeToDays = (timeframe: string, limit: number): number => {
  switch (timeframe) {
    case "15m":
      return Math.min(2, Math.ceil((limit * 15) / (60 * 24)));
    case "1H":
      return Math.min(7, Math.ceil(limit / 24));
    case "4H":
      return Math.min(30, Math.ceil((limit * 4) / 24));
    case "1D":
      return Math.min(100, limit);
    case "1W":
      return Math.min(200, limit * 7);
    default:
      return 30;
  }
};
