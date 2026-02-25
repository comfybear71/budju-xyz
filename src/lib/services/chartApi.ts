import {
  POOL_SOL_BUDJU,
  POOL_USDC_BUDJU,
} from "@constants/addresses";

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
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * Map token pair to a GeckoTerminal Solana pool address
 */
const getPoolAddress = (
  baseToken: string,
  quoteToken: string,
): string | null => {
  const pair = `${baseToken}/${quoteToken}`;
  const reversePair = `${quoteToken}/${baseToken}`;

  const pools: Record<string, string> = {
    "SOL/BUDJU": POOL_SOL_BUDJU,
    "BUDJU/SOL": POOL_SOL_BUDJU,
    "USDC/BUDJU": POOL_USDC_BUDJU,
    "BUDJU/USDC": POOL_USDC_BUDJU,
  };

  return pools[pair] || pools[reversePair] || null;
};

/**
 * Map UI timeframe to GeckoTerminal OHLCV timeframe parameter
 * GeckoTerminal supports: day, hour, minute (with aggregate)
 */
const getGeckoTimeframe = (
  timeframe: string,
): { tf: string; aggregate: number } => {
  switch (timeframe) {
    case "15m":
      return { tf: "minute", aggregate: 15 };
    case "1H":
      return { tf: "hour", aggregate: 1 };
    case "4H":
      return { tf: "hour", aggregate: 4 };
    case "1D":
      return { tf: "day", aggregate: 1 };
    case "1W":
      return { tf: "day", aggregate: 1 };
    default:
      return { tf: "day", aggregate: 1 };
  }
};

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
 * Get chart data for a token pair using GeckoTerminal API
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

  const poolAddress = getPoolAddress(baseToken, quoteToken);
  if (!poolAddress) {
    console.warn(`No pool address for ${baseToken}/${quoteToken}, using sample data`);
    return getFallbackData(baseToken, quoteToken, timeframe, limit);
  }

  try {
    const { tf, aggregate } = getGeckoTimeframe(timeframe);
    const adjustedLimit = timeframe === "1W" ? Math.min(limit, 200) : Math.min(limit, 1000);

    // GeckoTerminal OHLCV endpoint
    const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/${tf}?aggregate=${aggregate}&limit=${adjustedLimit}&currency=usd`;

    const response = await fetch(url, {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`GeckoTerminal API error: ${response.status}`);
    }

    const json = await response.json();
    const ohlcvList = json?.data?.attributes?.ohlcv_list;

    if (!ohlcvList || !Array.isArray(ohlcvList) || ohlcvList.length === 0) {
      throw new Error("No OHLCV data returned from GeckoTerminal");
    }

    // GeckoTerminal returns: [timestamp, open, high, low, close, volume]
    // Data comes in reverse chronological order, so we reverse it
    const chartData: CandlestickData[] = ohlcvList
      .map((item: number[]) => ({
        time: item[0], // Already in seconds
        open: item[1],
        high: item[2],
        low: item[3],
        close: item[4],
        volume: item[5],
      }))
      .filter(
        (item: CandlestickData) =>
          item.open > 0 || item.high > 0 || item.low > 0 || item.close > 0,
      )
      .sort((a: CandlestickData, b: CandlestickData) => a.time - b.time);

    if (chartData.length === 0) {
      throw new Error("No valid data points after filtering");
    }

    // Update cache
    chartDataCache.set(cacheKey, {
      data: chartData,
      timestamp: Date.now(),
    });

    return chartData;
  } catch (error) {
    console.error("Error fetching chart data from GeckoTerminal:", error);
    return getFallbackData(baseToken, quoteToken, timeframe, limit);
  }
};

/**
 * Fallback sample data when API is unavailable
 */
const getFallbackData = (
  baseToken: string,
  quoteToken: string,
  timeframe: string,
  limit: number,
): CandlestickData[] => {
  let basePrice = 0;
  if (
    (baseToken === "SOL" && quoteToken === "BUDJU") ||
    (baseToken === "BUDJU" && quoteToken === "SOL")
  ) {
    basePrice = 0.00015; // SOL price in BUDJU terms (USD equivalent)
  } else if (baseToken === "SOL" && quoteToken === "USDC") {
    basePrice = 170;
  } else if (
    (baseToken === "BUDJU" && quoteToken === "USDC") ||
    (baseToken === "USDC" && quoteToken === "BUDJU")
  ) {
    basePrice = 0.0002;
  } else {
    basePrice = 1.0;
  }

  const days = timeframeToDays(timeframe, limit);
  const sampleData = generateSampleData(basePrice, days);

  chartDataCache.set(`${baseToken}/${quoteToken}/${timeframe}`, {
    data: sampleData,
    timestamp: Date.now(),
  });

  return sampleData;
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
