import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

// Constants for API keys and endpoints
const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY || "";
const CRYPTOCOMPARE_API_KEY = import.meta.env.VITE_CRYPTOCOMPARE_API_KEY || "";
const JUPITER_API_KEY = import.meta.env.VITE_JUPITER_API_KEY || "";
const HELIUS_RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

if (!HELIUS_API_KEY) {
  console.warn("Missing HELIUS_API_KEY - holders count will not be available");
}

// Token and wallet addresses
const TOKEN_ADDRESS = "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump";
const BURN_ADDRESS = "B1opJeR2emYp75spauVHkGXfyxkYSW7GZaN9B3XoUeGK";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const RAYDIUM_VAULT_ADDRESS = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1";
const BANK_OF_BUDJU_ADDRESS = "7grCp49j6SExSRud7YA5TdDSbWFyAJjLGif8Syr5CVpc";
const COMMUNITY_VAULT_ADDRESS = "D61kHQmy8UxD6ks9L6dsponk5yexomBLdG5QaFxaHYka";

// Create Solana connection
const connection = new Connection(HELIUS_RPC_ENDPOINT, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 60000,
});

// Interfaces
export interface Transaction {
  id: string;
  type: "deposit" | "withdrawal" | "burn";
  token: string;
  amount: number;
  from: string;
  to: string;
  date: string;
  status: "completed" | "pending";
}

export interface HeliusTokenBalance {
  owner: string;
  amount: number;
}

interface TokenMetrics {
  price: number;
  marketCap: number;
  holders: number;
  volume24h: number;
  totalSupply: number;
  burned: number;
  raydiumVault: number;
  bankOfBudju: number;
  communityVault: number;
  circulatingSupply: number;
}

interface HistoricalPriceData {
  date: string;
  price: number;
  volume: number;
}

interface BurnEvent {
  date: string;
  amount: number;
  txHash: string;
  value: number;
  timestamp?: number;
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

// Optimized retryFetch
async function retryFetch(
  url: string,
  options: RequestInit,
  retries = 3,
  delay = 1000,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
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
        throw new Error(`Failed after ${retries} attempts: ${String(error)}`);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, delay * Math.pow(2, attempt)),
      );
    }
  }
  throw new Error("Unexpected error in retryFetch");
}

// Fetch price, volume and market cap from DexScreener (no API key required)
async function fetchDexScreenerData(
  tokenAddress: string,
): Promise<{ price: number; volume24h: number; priceChange24h: number; marketCap: number; fdv: number }> {
  try {
    const response = await retryFetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      { headers: {} },
    );
    const data = await response.json();
    if (data.pairs && data.pairs.length > 0) {
      // Sort by liquidity to get the most liquid pair
      const pair = [...data.pairs].sort(
        (a: any, b: any) =>
          (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0),
      )[0];
      return {
        price: parseFloat(pair.priceUsd || "0"),
        volume24h: pair.volume?.h24 || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
        marketCap: pair.marketCap || pair.fdv || 0,
        fdv: pair.fdv || 0,
      };
    }
    return { price: 0, volume24h: 0, priceChange24h: 0, marketCap: 0, fdv: 0 };
  } catch (error) {
    console.error("Error fetching DexScreener data:", error);
    return { price: 0, volume24h: 0, priceChange24h: 0, marketCap: 0, fdv: 0 };
  }
}

// Fetch price via Jupiter Price API v3
async function fetchJupiterPrice(tokenAddress: string): Promise<number> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (JUPITER_API_KEY) headers["x-api-key"] = JUPITER_API_KEY;

    const response = await fetch(
      `https://api.jup.ag/price/v3?ids=${tokenAddress}`,
      { headers },
    );
    if (!response.ok) return 0;
    const data = await response.json();
    const price = data?.data?.[tokenAddress]?.usdPrice;
    return price ? Number(price) : 0;
  } catch (error) {
    console.error("Error fetching Jupiter price:", error);
    return 0;
  }
}

// Fetch enriched token data via Jupiter Tokens v2 API
interface JupiterTokenData {
  price: number;
  marketCap: number;
  holders: number;
  volume24h: number;
  liquidity: number;
}

async function fetchJupiterTokenData(tokenAddress: string): Promise<JupiterTokenData | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (JUPITER_API_KEY) headers["x-api-key"] = JUPITER_API_KEY;

    const response = await fetch(
      `https://api.jup.ag/tokens/v2/search?query=${tokenAddress}`,
      { headers },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const token = Array.isArray(data) ? data[0] : null;
    if (!token) return null;

    return {
      price: token.usdPrice || 0,
      marketCap: token.mcap || 0,
      holders: token.holderCount || 0,
      volume24h: (token.buyVolume24h || 0) + (token.sellVolume24h || 0),
      liquidity: token.liquidity || 0,
    };
  } catch (error) {
    console.error("Error fetching Jupiter token data:", error);
    return null;
  }
}

// Fetch price via GeckoTerminal (free, no key required)
async function fetchGeckoTerminalPrice(tokenAddress: string): Promise<number> {
  try {
    const response = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenAddress}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return 0;
    const data = await response.json();
    const price = data?.data?.attributes?.price_usd;
    return price ? Number(price) : 0;
  } catch (error) {
    console.error("Error fetching GeckoTerminal price:", error);
    return 0;
  }
}

// Fetch total supply via a single lightweight getTokenSupply RPC call
async function fetchTokenSupply(tokenAddress: string): Promise<number> {
  try {
    const response = await fetch(HELIUS_RPC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "supply-query",
        method: "getTokenSupply",
        params: [tokenAddress],
      }),
    });
    const data = await response.json();
    return Number(data.result?.value?.uiAmount || 0);
  } catch (error) {
    console.error("Error fetching token supply:", error);
    return 0;
  }
}

// Fetch token balance for any wallet address
async function fetchTokenBalance(walletAddress: string, tokenAddress: string): Promise<number> {
  try {
    const walletPublicKey = new PublicKey(walletAddress);
    const tokenPublicKey = new PublicKey(tokenAddress);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPublicKey,
      { mint: tokenPublicKey },
    );
    return tokenAccounts.value.reduce(
      (sum, account) =>
        sum + (account.account.data.parsed.info.tokenAmount.uiAmount || 0),
      0,
    );
  } catch (error) {
    console.error(`Error fetching token balance for ${walletAddress}:`, error);
    return 0;
  }
}

// Alias for backward compatibility
const fetchBurnAmount = fetchTokenBalance;

// Fetch holder count using Helius DAS getTokenAccounts (requires API key)
async function fetchHolderCount(tokenAddress: string): Promise<number> {
  if (!HELIUS_API_KEY) return 0;
  try {
    let page = 1;
    let totalCount = 0;
    const limit = 1000;
    while (true) {
      const response = await fetch(HELIUS_RPC_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "holders-query",
          method: "getTokenAccounts",
          params: { page, limit, displayOptions: {}, mint: tokenAddress },
        }),
      });
      const data = await response.json();
      const accounts = data.result?.token_accounts || [];
      totalCount += accounts.length;
      if (accounts.length < limit) break;
      page++;
    }
    return totalCount;
  } catch (error) {
    console.error("Error fetching holder count:", error);
    return 0;
  }
}

// Fetch token price — DexScreener first, Jupiter quote as fallback
async function fetchTokenPrice(tokenAddress: string): Promise<number> {
  const cacheKey = `price_${tokenAddress}`;
  const cachedPrice = getCachedData(cacheKey);
  if (cachedPrice !== null) return cachedPrice;

  try {
    const dexData = await fetchDexScreenerData(tokenAddress);
    if (dexData.price > 0) {
      setCachedData(cacheKey, dexData.price, 5 * 60 * 1000);
      return dexData.price;
    }
    const jupiterPrice = await fetchJupiterPrice(tokenAddress);
    if (jupiterPrice > 0) {
      setCachedData(cacheKey, jupiterPrice, 5 * 60 * 1000);
      return jupiterPrice;
    }
    const geckoPrice = await fetchGeckoTerminalPrice(tokenAddress);
    if (geckoPrice > 0) {
      setCachedData(cacheKey, geckoPrice, 5 * 60 * 1000);
      return geckoPrice;
    }
    return 0;
  } catch (error) {
    console.error("Error fetching token price:", error);
    return 0;
  }
}

// Fetch token metrics
export async function fetchHeliusTokenMetrics(
  tokenAddress: string = TOKEN_ADDRESS,
  burnAddress: string = BURN_ADDRESS,
): Promise<TokenMetrics> {
  try {
    const [dexResult, supplyResult, burnedResult, holderResult, jupiterResult, geckoResult, jupTokenResult, raydiumResult, bankResult, communityResult] =
      await Promise.allSettled([
        fetchDexScreenerData(tokenAddress),        // price + marketCap + volume (free, no key)
        fetchTokenSupply(tokenAddress),             // total supply (single lightweight RPC call)
        fetchBurnAmount(burnAddress, tokenAddress), // burned (targeted single lookup)
        fetchHolderCount(tokenAddress),             // holders (Helius DAS, needs API key)
        fetchJupiterPrice(tokenAddress),            // fallback price via Jupiter Price API v3
        fetchGeckoTerminalPrice(tokenAddress),      // fallback price via GeckoTerminal
        fetchJupiterTokenData(tokenAddress),        // enriched data via Jupiter Tokens v2
        fetchTokenBalance(RAYDIUM_VAULT_ADDRESS, tokenAddress),   // Raydium vault balance
        fetchTokenBalance(BANK_OF_BUDJU_ADDRESS, tokenAddress),   // Bank of BUDJU balance
        fetchTokenBalance(COMMUNITY_VAULT_ADDRESS, tokenAddress), // Pool of BUDJU balance
      ]);

    const dex = dexResult.status === "fulfilled"
      ? dexResult.value
      : { price: 0, volume24h: 0, priceChange24h: 0, marketCap: 0, fdv: 0 };
    const totalSupply = supplyResult.status === "fulfilled" ? supplyResult.value : 0;
    const burned = burnedResult.status === "fulfilled" ? burnedResult.value : 0;
    const heliusHolders = holderResult.status === "fulfilled" ? holderResult.value : 0;
    const jupiterPrice = jupiterResult.status === "fulfilled" ? jupiterResult.value : 0;
    const geckoPrice = geckoResult.status === "fulfilled" ? geckoResult.value : 0;
    const jupToken = jupTokenResult.status === "fulfilled" ? jupTokenResult.value : null;
    const raydiumVault = raydiumResult.status === "fulfilled" ? raydiumResult.value : 0;
    const bankOfBudju = bankResult.status === "fulfilled" ? bankResult.value : 0;
    const communityVault = communityResult.status === "fulfilled" ? communityResult.value : 0;

    // Use first available price: DexScreener → Jupiter Price → Jupiter Tokens → GeckoTerminal
    const price = dex.price > 0
      ? dex.price
      : jupiterPrice > 0
        ? jupiterPrice
        : jupToken?.price && jupToken.price > 0
          ? jupToken.price
          : geckoPrice;
    const circulatingSupply = totalSupply - burned - raydiumVault - bankOfBudju - communityVault;
    // Use DexScreener market cap if available, then Jupiter Tokens, else compute from price × supply
    const marketCap = dex.marketCap > 0
      ? dex.marketCap
      : jupToken?.marketCap && jupToken.marketCap > 0
        ? jupToken.marketCap
        : price * circulatingSupply;
    // Use Helius holder count if available, fallback to Jupiter Tokens v2
    const holders = heliusHolders > 0
      ? heliusHolders
      : jupToken?.holders || 0;
    // Use DexScreener volume if available, fallback to Jupiter Tokens v2
    const volume24h = dex.volume24h > 0
      ? dex.volume24h
      : jupToken?.volume24h || 0;

    return {
      price,
      marketCap,
      holders,
      volume24h,
      totalSupply,
      burned,
      raydiumVault,
      bankOfBudju,
      communityVault,
      circulatingSupply,
    };
  } catch (error) {
    console.error("Error in fetchHeliusTokenMetrics:", error);
    return {
      price: 0,
      marketCap: 0,
      holders: 0,
      volume24h: 0,
      totalSupply: 0,
      burned: 0,
      raydiumVault: 0,
      bankOfBudju: 0,
      communityVault: 0,
      circulatingSupply: 0,
    };
  }
}

// Fetch token balances (top holders via Helius DAS getTokenAccounts)
export async function getTokenBalances(
  tokenAddress: string = TOKEN_ADDRESS,
): Promise<HeliusTokenBalance[]> {
  if (!HELIUS_API_KEY) return [];
  try {
    const response = await fetch(HELIUS_RPC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "top-holders-query",
        method: "getTokenAccounts",
        params: { page: 1, limit: 1000, displayOptions: {}, mint: tokenAddress },
      }),
    });
    const data = await response.json();
    // amount is raw (pump.fun tokens have 6 decimals)
    const accounts: Array<{ owner: string; amount: string }> =
      data.result?.token_accounts || [];
    return accounts
      .map((a) => ({ owner: a.owner, amount: Number(a.amount) / 1e6 }))
      .filter((a) => a.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  } catch (error) {
    console.error("Error in getTokenBalances:", error);
    return [];
  }
}

// Fetch historical price data via GeckoTerminal (free, no key required)
export async function fetchHistoricalPriceData(
  tokenAddress: string = TOKEN_ADDRESS,
  days: number,
  _type: string = "1D",
): Promise<HistoricalPriceData[]> {
  try {
    // Step 1: find the top pool for this token
    const poolsResp = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenAddress}/pools?page=1`,
      { headers: { Accept: "application/json;version=20230302" } },
    );
    const poolsData = await poolsResp.json();
    const pools: any[] = poolsData.data || [];
    if (pools.length === 0) throw new Error("No pools found for token");

    // pool id format: "solana_POOL_ADDRESS"
    const poolAddress = pools[0].id.split("_")[1];

    // Step 2: fetch daily OHLCV
    const ohlcvResp = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/day?limit=${Math.min(days, 1000)}`,
      { headers: { Accept: "application/json;version=20230302" } },
    );
    const ohlcvData = await ohlcvResp.json();
    const ohlcvList: number[][] =
      ohlcvData.data?.attributes?.ohlcv_list || [];

    // GeckoTerminal returns [timestamp, open, high, low, close, volume], newest first
    return ohlcvList
      .map(([timestamp, , , , close, volume]) => ({
        date: new Date(timestamp * 1000).toISOString().split("T")[0],
        price: close,
        volume,
      }))
      .reverse();
  } catch (error) {
    console.error("Error fetching historical price data:", error);
    const today = new Date();
    let price = (await fetchTokenPrice(tokenAddress)) || 0.00015;
    if (price <= 0) price = 0.00015;
    const fallbackData: HistoricalPriceData[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      const changePercent = (Math.random() * 10 - 5) * (1 - i / days);
      if (i !== days - 1) price = price * (1 + changePercent / 100);
      fallbackData.push({
        date: date.toISOString().split("T")[0],
        price,
        volume: Math.floor(Math.random() * 50000) + 10000,
      });
    }
    return fallbackData;
  }
}

// Fetch burn events
export async function fetchBurnEvents(
  burnAddress: string = BURN_ADDRESS,
  tokenAddress: string = TOKEN_ADDRESS,
): Promise<BurnEvent[]> {
  const cacheKey = `burn_${burnAddress}_${tokenAddress}`;
  const cachedBurnEvents = getCachedData(cacheKey);
  if (cachedBurnEvents !== null) return cachedBurnEvents;

  try {
    const burnBalance = await fetchBurnBalance(burnAddress, tokenAddress);
    const signatures = await fetchRecentSignatures(burnAddress, 20);
    const burnEvents =
      signatures.length === 0
        ? await createFallbackBurnEvent(burnBalance, tokenAddress)
        : await processBurnTransactions(signatures, burnAddress, tokenAddress);

    setCachedData(cacheKey, burnEvents, 10 * 60 * 1000);
    return burnEvents.length > 0
      ? burnEvents
      : await createFallbackBurnEvent(burnBalance, tokenAddress);
  } catch (error) {
    console.error("Error fetching burn events:", error);
    const burnBalance = await fetchBurnBalance(burnAddress, tokenAddress);
    const fallbackEvents = await createFallbackBurnEvent(
      burnBalance,
      tokenAddress,
    );
    setCachedData(cacheKey, fallbackEvents, 10 * 60 * 1000);
    return fallbackEvents;
  }
}

// Helper functions for burn events
async function fetchRecentSignatures(
  address: string,
  limit = 20,
): Promise<any[]> {
  try {
    const response = await fetch(HELIUS_RPC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "signatures-query",
        method: "getSignaturesForAddress",
        params: [address, { limit }],
      }),
    });
    const data = await response.json();
    return data.result || [];
  } catch (error) {
    console.error("Error fetching signatures:", error);
    return [];
  }
}

async function fetchBurnBalance(
  burnAddress: string,
  tokenAddress: string,
): Promise<number> {
  try {
    const burnPublicKey = new PublicKey(burnAddress);
    const tokenPublicKey = new PublicKey(tokenAddress);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      burnPublicKey,
      { mint: tokenPublicKey },
    );
    return tokenAccounts.value.reduce(
      (sum, account) =>
        sum + (account.account.data.parsed.info.tokenAmount.uiAmount || 0),
      0,
    );
  } catch (error) {
    console.error("Error fetching burn balance:", error);
    return 0;
  }
}

async function processBurnTransactions(
  signatures: any[],
  burnAddress: string,
  tokenAddress: string,
): Promise<BurnEvent[]> {
  try {
    if (signatures.length === 0) return [];
    const signatureStrings = signatures.map((sig) => sig.signature);

    // Fetch transactions individually using the standard getTransaction RPC method
    const txRequests = signatureStrings.map((sig, i) => ({
      jsonrpc: "2.0",
      id: `tx-${i}`,
      method: "getTransaction",
      params: [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
    }));

    const responses = await Promise.all(
      txRequests.map((req) =>
        fetch(HELIUS_RPC_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        })
          .then((r) => r.json())
          .catch(() => ({ result: null })),
      ),
    );
    const transactions = responses.map((r) => r.result);
    const price = await fetchTokenPrice(tokenAddress);
    const burnEvents: BurnEvent[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const sig = signatures[i];
      if (!tx) continue;

      let isBurnTransaction = false;
      let burnAmount = 0;

      if (tx.meta && tx.meta.postTokenBalances && tx.meta.preTokenBalances) {
        const preBalanceMap = new Map();
        for (const pre of tx.meta.preTokenBalances) {
          if (pre.mint === tokenAddress) {
            preBalanceMap.set(
              pre.accountIndex,
              pre.uiTokenAmount.uiAmount || 0,
            );
          }
        }
        for (const post of tx.meta.postTokenBalances) {
          if (
            post.mint === tokenAddress &&
            tx.transaction.message.accountKeys[post.accountIndex] ===
              burnAddress
          ) {
            const preBalance = preBalanceMap.get(post.accountIndex) || 0;
            const postBalance = post.uiTokenAmount.uiAmount || 0;
            const diff = postBalance - preBalance;
            if (diff > 0) {
              isBurnTransaction = true;
              burnAmount += diff;
            }
          }
        }
      }

      if (isBurnTransaction && burnAmount > 0) {
        const timestamp = sig.blockTime * 1000;
        const date = new Date(timestamp).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        burnEvents.push({
          date,
          amount: burnAmount,
          txHash: sig.signature,
          value: burnAmount * price,
          timestamp,
        });
      }
    }
    return burnEvents.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch (error) {
    console.error("Error processing burn transactions:", error);
    return [];
  }
}

async function createFallbackBurnEvent(
  burnAmount: number,
  tokenAddress: string,
): Promise<BurnEvent[]> {
  if (burnAmount <= 0) return [];
  try {
    const price = await fetchTokenPrice(tokenAddress);
    return [
      {
        date: new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        amount: burnAmount,
        txHash: "N/A (Aggregated from balances)",
        value: burnAmount * price,
        timestamp: Date.now(),
      },
    ];
  } catch (error) {
    console.error("Error creating fallback burn event:", error);
    return [];
  }
}

// Fetch bank transactions (Fixed TypeScript error)
export async function fetchBankTransactions(
  bankAddress: string = BANK_OF_BUDJU_ADDRESS,
  tokenAddress: string = TOKEN_ADDRESS,
  limit: number = 10,
): Promise<Transaction[]> {
  const cacheKey = `transactions_${bankAddress}_${tokenAddress}_${limit}`;
  const cachedTransactions = getCachedData(cacheKey);
  if (cachedTransactions !== null) return cachedTransactions;

  try {
    const bankPublicKey = new PublicKey(bankAddress);
    const signatures = await connection.getSignaturesForAddress(bankPublicKey, {
      limit,
    });
    if (signatures.length === 0) {
      console.warn(`No transactions found for address: ${bankAddress}`);
      return [];
    }

    const transactionsPromises = signatures.map((sig) =>
      connection.getParsedTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      }),
    );
    const txDetails = await Promise.all(transactionsPromises);

    const transactions: Transaction[] = txDetails
      .filter(
        (transaction): transaction is ParsedTransactionWithMeta =>
          transaction !== null && transaction.meta !== null,
      )
      .map((transaction) => {
        let token = "SOL";
        let amount = 0;
        let fromAddress =
          transaction.transaction.message.accountKeys[0].pubkey.toBase58();
        let toAddress =
          transaction.transaction.message.accountKeys[1]?.pubkey.toBase58() ||
          "";

        const tokenInstruction =
          transaction.transaction.message.instructions.find(
            (ix) =>
              "programId" in ix &&
              ix.programId.toBase58() === TOKEN_PROGRAM_ID.toBase58(),
          );

        if (tokenInstruction && "parsed" in tokenInstruction) {
          const parsed = tokenInstruction.parsed;
          if (parsed.type === "transfer" && parsed.info.mint === tokenAddress) {
            token = "BUDJU";
            amount = Number(parsed.info.amount) / 1e6;
            fromAddress = parsed.info.source;
            toAddress = parsed.info.destination;
          } else if (
            parsed.type === "burn" &&
            parsed.info.mint === tokenAddress
          ) {
            token = "BUDJU";
            amount = Number(parsed.info.amount) / 1e6;
            fromAddress = parsed.info.authority;
            toAddress = BURN_ADDRESS;
          }
        } else if (
          transaction.meta?.preBalances &&
          transaction.meta?.postBalances
        ) {
          const bankIndex =
            transaction.transaction.message.accountKeys.findIndex(
              (key) => key.pubkey.toBase58() === bankAddress,
            );
          if (bankIndex !== -1) {
            const preBalance = transaction.meta.preBalances[bankIndex] || 0;
            const postBalance = transaction.meta.postBalances[bankIndex] || 0;
            amount = Math.abs(preBalance - postBalance) / 1e9;
          }
        }

        const type = determineTransactionType(
          fromAddress,
          toAddress,
          bankAddress,
          transaction,
          // tokenAddress,
        );

        console.log({
          txId: transaction.transaction.signatures[0],
          type,
          token,
          amount,
          from: fromAddress,
          to: toAddress,
          instructions: transaction.transaction.message.instructions.map(
            (ix) => ({
              programId:
                "programId" in ix ? ix.programId.toBase58() : "unknown",
              type: "parsed" in ix ? ix.parsed?.type : "unparsed",
            }),
          ),
        });

        return {
          id: transaction.transaction.signatures[0],
          type,
          token,
          amount,
          from: fromAddress,
          to: toAddress,
          date: new Date((transaction.blockTime || 0) * 1000)
            .toISOString()
            .split("T")[0],
          status: "completed" as const, // Fix: Use 'as const' to narrow the type to "completed"
        } as Transaction; // Explicitly assert as Transaction to satisfy TypeScript
      })
      .filter((tx) => tx.amount > 0);

    const sortedTransactions = transactions.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    setCachedData(cacheKey, sortedTransactions, 5 * 60 * 1000);
    return sortedTransactions;
  } catch (error) {
    console.error("Error fetching bank transactions:", error);
    return [];
  }
}

function determineTransactionType(
  from: string,
  to: string,
  bankAddress: string,
  transaction: ParsedTransactionWithMeta,
  // tokenAddress: string,
): "deposit" | "withdrawal" | "burn" {
  const incineratorAddress = "1nc1nerator11111111111111111111111111111111";

  const tokenInstruction = transaction.transaction.message.instructions.find(
    (ix) =>
      "programId" in ix &&
      ix.programId.toBase58() === TOKEN_PROGRAM_ID.toBase58(),
  );
  if (tokenInstruction && "parsed" in tokenInstruction) {
    if (tokenInstruction.parsed.type === "burn") {
      console.log(
        `Detected burn instruction for tx: ${transaction.transaction.signatures[0]}`,
      );
      return "burn";
    }
  }

  if (to === incineratorAddress || to === BURN_ADDRESS) {
    console.log(
      `Detected burn to address: ${to} for tx: ${transaction.transaction.signatures[0]}`,
    );
    return "burn";
  }

  if (from === bankAddress && to !== bankAddress) {
    console.log(
      `Detected withdrawal for tx: ${transaction.transaction.signatures[0]}`,
    );
    return "withdrawal";
  }

  if (to === bankAddress && from !== bankAddress) {
    console.log(
      `Detected deposit for tx: ${transaction.transaction.signatures[0]}`,
    );
    return "deposit";
  }

  console.warn(
    `Unclassified transaction for tx: ${transaction.transaction.signatures[0]}, defaulting to deposit`,
  );
  return "deposit";
}

export { TOKEN_ADDRESS, BURN_ADDRESS };
