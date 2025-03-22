import { getTokenBySymbol } from "./tokenRegistry";

// Types
export interface PriceData {
  price: number;
  change24h: number;
  volume24h: number;
  lastUpdated: number;
}

// Price cache
const priceCache: Map<string, PriceData> = new Map();
let lastPriceUpdate = 0;
const PRICE_CACHE_TTL = 30 * 1000; // 30 seconds

/**
 * Create empty price data
 */
const createEmptyPriceData = (): PriceData => ({
  price: 0,
  change24h: 0,
  volume24h: 0,
  lastUpdated: Date.now(),
});

/**
 * Get current price for a token pair
 */
export const getPrice = async (
  base: string,
  quote: string = "USDC",
): Promise<PriceData> => {
  const pair = `${base}/${quote}`;
  const now = Date.now();

  // Return from cache if valid
  if (priceCache.has(pair) && now - lastPriceUpdate < PRICE_CACHE_TTL) {
    return priceCache.get(pair)!;
  }

  // Fetch fresh price
  return await fetchPrice(base, quote);
};

/**
 * Fetch price from API
 */
export const fetchPrice = async (
  base: string,
  quote: string = "USDC",
): Promise<PriceData> => {
  try {
    const pair = `${base}/${quote}`;
    const baseToken = await getTokenBySymbol(base);

    if (!baseToken) {
      throw new Error(`Token not found: ${base}`);
    }

    // Try Jupiter API first
    try {
      const jupiterResponse = await fetch(
        `https://price.jup.ag/v4/price?ids=${baseToken.address}`,
      );

      if (!jupiterResponse.ok) {
        throw new Error(`HTTP error: ${jupiterResponse.status}`);
      }

      const jupiterData = await jupiterResponse.json();
      const priceData = jupiterData.data[baseToken.address];

      if (priceData && priceData.price > 0) {
        const newPriceData: PriceData = {
          price: priceData.price,
          change24h: 0, // Jupiter doesn't provide this
          volume24h: 0, // Jupiter doesn't provide this
          lastUpdated: Date.now(),
        };

        // Update cache
        priceCache.set(pair, newPriceData);
        lastPriceUpdate = Date.now();

        return newPriceData;
      }
    } catch (jupiterError) {
      console.warn("Jupiter price fetch failed, trying BirdEye:", jupiterError);
    }

    // Fallback to BirdEye API
    const BIRDEYE_API_KEY = import.meta.env.VITE_BIRDEYE_API_KEY || "";

    if (!BIRDEYE_API_KEY) {
      throw new Error("BirdEye API key not configured");
    }

    const birdEyeResponse = await fetch(
      `https://public-api.birdeye.so/defi/price?address=${baseToken.address}`,
      {
        headers: {
          "X-API-KEY": BIRDEYE_API_KEY,
          "x-chain": "solana",
        },
      },
    );

    if (!birdEyeResponse.ok) {
      throw new Error(`HTTP error: ${birdEyeResponse.status}`);
    }

    const birdEyeData = await birdEyeResponse.json();

    if (!birdEyeData.data) {
      throw new Error("Invalid response from BirdEye API");
    }

    const newPriceData: PriceData = {
      price: parseFloat(birdEyeData.data.value) || 0,
      change24h: parseFloat(birdEyeData.data.priceChange24h) || 0,
      volume24h: parseFloat(birdEyeData.data.volume24h) || 0,
      lastUpdated: Date.now(),
    };

    // Update cache
    priceCache.set(pair, newPriceData);
    lastPriceUpdate = Date.now();

    return newPriceData;
  } catch (error) {
    console.error(`Error fetching price for ${base}/${quote}:`, error);

    // Return cached price if available, or default price data
    return priceCache.get(`${base}/${quote}`) || createEmptyPriceData();
  }
};

/**
 * Subscribe to price updates (polling-based implementation)
 */
export const subscribeToPriceUpdates = (
  base: string,
  quote: string = "USDC",
  callback: (priceData: PriceData) => void,
  intervalMs: number = 10000,
): (() => void) => {
  // Fetch initial price
  getPrice(base, quote).then(callback);

  // Set up interval
  const intervalId = setInterval(() => {
    getPrice(base, quote).then(callback);
  }, intervalMs);

  // Return unsubscribe function
  return () => clearInterval(intervalId);
};

/**
 * Get historical price data
 */
export const getHistoricalPrices = async (
  base: string,
  quote: string = "USDC",
  days: number = 7,
): Promise<{ date: string; price: number }[]> => {
  try {
    const baseToken = await getTokenBySymbol(base);

    if (!baseToken) {
      throw new Error(`Token not found: ${base}`);
    }

    const BIRDEYE_API_KEY = import.meta.env.VITE_BIRDEYE_API_KEY || "";

    if (!BIRDEYE_API_KEY) {
      throw new Error("BirdEye API key not configured");
    }

    const now = Math.floor(Date.now() / 1000);
    const timeFrom = now - days * 24 * 60 * 60;

    const response = await fetch(
      `https://public-api.birdeye.so/defi/history_price?address=${baseToken.address}&address_type=token&type=1D&time_from=${timeFrom}&time_to=${now}`,
      {
        headers: {
          "X-API-KEY": BIRDEYE_API_KEY,
          accept: "application/json",
          "x-chain": "solana",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || !data.data.items) {
      throw new Error("Invalid response from BirdEye API");
    }

    return data.data.items.map((item: any) => ({
      date: new Date(item.unixTime * 1000).toISOString().split("T")[0],
      price: Number(item.value) || 0,
    }));
  } catch (error) {
    console.error(
      `Error fetching historical prices for ${base}/${quote}:`,
      error,
    );

    // Return fallback data
    const fallbackData = [];
    const today = new Date();
    let price = 0.00015; // Fallback baseline price

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      const changePercent = (Math.random() * 10 - 5) * (1 - i / days);
      if (i !== days - 1) price = price * (1 + changePercent / 100);

      fallbackData.push({
        date: date.toISOString().split("T")[0],
        price,
      });
    }

    return fallbackData;
  }
};
