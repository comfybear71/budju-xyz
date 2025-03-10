import { Connection, PublicKey } from "@solana/web3.js";
import { RPC_ENDPOINT } from "@constants/addresses";

// Types
export interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
}

// In-memory cache
const tokenCache = new Map<string, TokenInfo>();
const tokenSymbolMap = new Map<string, TokenInfo>();
let lastCacheUpdate = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Base tokens to always include
const baseTokens: TokenInfo[] = [
  {
    symbol: "SOL",
    name: "Solana",
    address: "So11111111111111111111111111111111111111112",
    decimals: 9,
    logoURI: "/images/tokens/sol.png",
    tags: ["base"],
  },
  {
    symbol: "BUDJU",
    name: "BUDJU Token",
    address: "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump",
    decimals: 6,
    logoURI: "/images/tokens/budju.png",
    tags: ["budju"],
  },
  {
    symbol: "RAY",
    name: "Raydium",
    address: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    decimals: 6,
    logoURI: "/images/tokens/ray.png",
    tags: ["dex"],
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    logoURI: "/images/tokens/usdc.png",
    tags: ["stablecoin"],
  },
];

/**
 * Initialize token registry
 */
export const initializeTokenRegistry = async (): Promise<void> => {
  const now = Date.now();

  // Return early if cache is still valid
  if (
    tokenCache.size > 0 &&
    tokenSymbolMap.size > 0 &&
    now - lastCacheUpdate < CACHE_TTL
  ) {
    return;
  }

  try {
    // Add base tokens
    for (const token of baseTokens) {
      tokenCache.set(token.address, token);
      tokenSymbolMap.set(token.symbol, token);
    }

    // Fetch token list from Solana token list
    try {
      const response = await fetch(
        "https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json",
      );

      if (response.ok) {
        const tokenList = await response.json();

        // Cache tokens
        for (const token of tokenList.tokens) {
          if (!tokenCache.has(token.address)) {
            const tokenInfo: TokenInfo = {
              symbol: token.symbol,
              name: token.name,
              address: token.address,
              decimals: token.decimals,
              logoURI: token.logoURI,
              tags: token.tags,
            };

            tokenCache.set(token.address, tokenInfo);
            tokenSymbolMap.set(token.symbol, tokenInfo);
          }
        }
      } else {
        console.warn(`Failed to fetch token list: ${response.status}`);
      }
    } catch (error) {
      console.warn("Error fetching token list:", error);
    }

    lastCacheUpdate = now;
  } catch (error) {
    console.error("Failed to initialize token registry:", error);
  }
};

/**
 * Add custom token to registry
 */
export const addCustomToken = (token: TokenInfo): void => {
  tokenCache.set(token.address, token);
  tokenSymbolMap.set(token.symbol, token);
};

/**
 * Get token by address
 */
export const getTokenByAddress = async (
  address: string,
): Promise<TokenInfo | null> => {
  // Initialize if not already done
  if (tokenCache.size === 0) {
    await initializeTokenRegistry();
  }

  return tokenCache.get(address) || null;
};

/**
 * Get token by symbol
 */
export const getTokenBySymbol = async (
  symbol: string,
): Promise<TokenInfo | null> => {
  // Initialize if not already done
  if (tokenSymbolMap.size === 0) {
    await initializeTokenRegistry();
  }

  return tokenSymbolMap.get(symbol) || null;
};

/**
 * Search tokens by query
 */
export const searchTokens = async (query: string): Promise<TokenInfo[]> => {
  // Initialize if not already done
  if (tokenCache.size === 0) {
    await initializeTokenRegistry();
  }

  const normalizedQuery = query.toLowerCase();

  return Array.from(tokenCache.values()).filter(
    (token) =>
      token.symbol.toLowerCase().includes(normalizedQuery) ||
      token.name.toLowerCase().includes(normalizedQuery) ||
      token.address.toLowerCase().includes(normalizedQuery),
  );
};
