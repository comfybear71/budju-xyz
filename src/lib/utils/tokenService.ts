import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
} from "@solana/web3.js";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";

// Constants for API keys and endpoints
const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY || "";
const BIRDEYE_API_KEY = import.meta.env.VITE_BIRDEYE_API_KEY || "";
const HELIUS_RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const BIRDEYE_API_ENDPOINT = "https://public-api.birdeye.so/defi/price";
const BIRDEYE_HISTORICAL_API =
  "https://public-api.birdeye.so/defi/history_price";
const BIRDEYE_HOLDERS_API =
  "https://public-api.birdeye.so/defi/token_holder_list";

// Validate API keys
if (!HELIUS_API_KEY || !BIRDEYE_API_KEY) {
  throw new Error("Missing API keys for Helius or BirdEye");
}

// Token and wallet addresses
const TOKEN_ADDRESS = "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump";
const BURN_ADDRESS = "B1opJeR2emYp75spauVHkGXfyxkYSW7GZaN9B3XoUeGK";
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

interface Holder {
  owner: string;
  amount: number;
  percentage: number;
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

// Fetch token price
async function fetchTokenPrice(tokenAddress: string): Promise<number> {
  const cacheKey = `price_${tokenAddress}`;
  const cachedPrice = getCachedData(cacheKey);
  if (cachedPrice !== null) return cachedPrice;

  try {
    const response = await retryFetch(
      `https://api.jup.ag/price/v2?ids=${tokenAddress}`,
      { headers: { Accept: "application/json" } },
    );
    const data = await response.json();
    let price = Number(data.data[tokenAddress]?.price || 0);
    if (!isNaN(price) && price > 0) {
      setCachedData(cacheKey, price, 5 * 60 * 1000);
      return price;
    }

    const birdEyeData = await fetchBirdEyeData(tokenAddress);
    if (birdEyeData.price > 0) {
      setCachedData(cacheKey, birdEyeData.price, 5 * 60 * 1000);
      return birdEyeData.price;
    }

    throw new Error("All price sources failed");
  } catch (error) {
    console.error("Error fetching token price:", error);
    return 0;
  }
}

// Fetch BirdEye data
async function fetchBirdEyeData(
  tokenAddress: string,
): Promise<{ price: number; volume24h: number }> {
  try {
    const response = await retryFetch(
      `${BIRDEYE_API_ENDPOINT}?address=${tokenAddress}`,
      {
        headers: {
          "X-API-KEY": BIRDEYE_API_KEY,
          "x-chain": "solana",
        },
      },
    );
    const data = await response.json();
    return {
      price: Number(data.data?.price || 0),
      volume24h: Number(data.data?.volume || 0),
    };
  } catch (error) {
    console.error("Error fetching BirdEye data:", error);
    return { price: 0, volume24h: 0 };
  }
}

// Fetch token holders
async function fetchTokenHolders(tokenAddress: string): Promise<Holder[]> {
  const cacheKey = `holders_${tokenAddress}`;
  const cachedHolders = getCachedData(cacheKey);
  if (cachedHolders !== null) return cachedHolders;

  try {
    const response = await retryFetch(
      `${BIRDEYE_HOLDERS_API}?address=${tokenAddress}&limit=200`,
      {
        headers: {
          "X-API-KEY": BIRDEYE_API_KEY,
          "x-chain": "solana",
        },
      },
    );
    const data = await response.json();
    const holders = data.data.items.map((item: any) => ({
      owner: item.owner,
      amount: Number(item.amount || 0),
      percentage: Number(item.percentage || 0),
    }));
    setCachedData(cacheKey, holders, 15 * 60 * 1000);
    return holders;
  } catch (error) {
    console.error("Error fetching token holders:", error);
    const { balances } = await fetchTokenSupplyAndBalances(tokenAddress);
    const totalAmount = balances.reduce(
      (sum, balance) => sum + balance.amount,
      0,
    );
    const holders = balances.map((balance) => ({
      owner: balance.owner,
      amount: balance.amount,
      percentage: totalAmount > 0 ? (balance.amount / totalAmount) * 100 : 0,
    }));
    setCachedData(cacheKey, holders, 15 * 60 * 1000);
    return holders;
  }
}

// Fetch token supply and balances
async function fetchTokenSupplyAndBalances(
  tokenAddress: string = TOKEN_ADDRESS,
  burnAddress: string = BURN_ADDRESS,
): Promise<{
  balances: HeliusTokenBalance[];
  totalSupply: number;
  burned: number;
  raydiumVault: number;
  bankOfBudju: number;
  communityVault: number;
}> {
  const cacheKey = `supply_${tokenAddress}`;
  const cachedSupply = getCachedData(cacheKey);
  if (cachedSupply !== null) return cachedSupply;

  try {
    const tokenPublicKey = new PublicKey(tokenAddress);
    const mint = await getMint(connection, tokenPublicKey);
    const totalSupply = Number(mint.supply) / 10 ** mint.decimals;

    const accounts = await connection.getParsedProgramAccounts(
      TOKEN_PROGRAM_ID,
      {
        filters: [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: tokenAddress } },
        ],
      },
    );

    const balances: HeliusTokenBalance[] = accounts
      .map((account) => {
        const parsedInfo = account.account.data as { parsed: { info: any } };
        return {
          owner: parsedInfo.parsed.info.owner,
          amount: parsedInfo.parsed.info.tokenAmount.uiAmount || 0,
        };
      })
      .filter((balance) => balance.amount > 0.0001);

    const sumBalancesForOwner = (ownerAddress: string): number =>
      balances
        .filter((balance) => balance.owner === ownerAddress)
        .reduce((sum, balance) => sum + (balance.amount || 0), 0);

    const result = {
      balances,
      totalSupply,
      burned: burnAddress ? sumBalancesForOwner(burnAddress) : 0,
      raydiumVault: RAYDIUM_VAULT_ADDRESS
        ? sumBalancesForOwner(RAYDIUM_VAULT_ADDRESS)
        : 0,
      bankOfBudju: BANK_OF_BUDJU_ADDRESS
        ? sumBalancesForOwner(BANK_OF_BUDJU_ADDRESS)
        : 0,
      communityVault: COMMUNITY_VAULT_ADDRESS
        ? sumBalancesForOwner(COMMUNITY_VAULT_ADDRESS)
        : 0,
    };

    setCachedData(cacheKey, result, 10 * 60 * 1000);
    return result;
  } catch (error) {
    console.error("Error fetching token supply and balances:", error);
    return {
      balances: [],
      totalSupply: 0,
      burned: 0,
      raydiumVault: 0,
      bankOfBudju: 0,
      communityVault: 0,
    };
  }
}

// Fetch token metrics
export async function fetchHeliusTokenMetrics(
  tokenAddress: string = TOKEN_ADDRESS,
  burnAddress: string = BURN_ADDRESS,
): Promise<TokenMetrics> {
  try {
    const results = await Promise.allSettled([
      fetchTokenPrice(tokenAddress),
      fetchBirdEyeData(tokenAddress),
      fetchTokenSupplyAndBalances(tokenAddress, burnAddress),
      fetchTokenHolders(tokenAddress),
    ]);

    const [priceResult, birdEyeResult, supplyResult, holdersResult] = results;
    const price = priceResult.status === "fulfilled" ? priceResult.value : 0;
    const birdEyeData =
      birdEyeResult.status === "fulfilled"
        ? birdEyeResult.value
        : { price: 0, volume24h: 0 };
    const supplyData =
      supplyResult.status === "fulfilled"
        ? supplyResult.value
        : {
            balances: [],
            totalSupply: 0,
            burned: 0,
            raydiumVault: 0,
            bankOfBudju: 0,
            communityVault: 0,
          };
    const holders =
      holdersResult.status === "fulfilled" ? holdersResult.value : [];

    const circulatingSupply = supplyData.totalSupply - supplyData.burned;
    return {
      price,
      marketCap: price * circulatingSupply,
      holders: holders.length,
      volume24h: birdEyeData.volume24h,
      totalSupply: supplyData.totalSupply,
      burned: supplyData.burned,
      raydiumVault: supplyData.raydiumVault,
      bankOfBudju: supplyData.bankOfBudju,
      communityVault: supplyData.communityVault,
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

// Fetch token balances
export async function getTokenBalances(
  tokenAddress: string = TOKEN_ADDRESS,
): Promise<HeliusTokenBalance[]> {
  try {
    const holders = await fetchTokenHolders(tokenAddress);
    return holders.map((h) => ({ owner: h.owner, amount: h.amount }));
  } catch (error) {
    console.error("Error in getTokenBalances:", error);
    const { balances } = await fetchTokenSupplyAndBalances(tokenAddress);
    return balances;
  }
}

// Fetch historical price data
export async function fetchHistoricalPriceData(
  tokenAddress: string = TOKEN_ADDRESS,
  days: number,
  type: string = "1D",
): Promise<HistoricalPriceData[]> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const timeFrom = now - days * 24 * 60 * 60;
    const response = await retryFetch(
      `${BIRDEYE_HISTORICAL_API}?address=${tokenAddress}&address_type=token&type=${type}&time_from=${timeFrom}&time_to=${now}`,
      {
        headers: {
          "X-API-KEY": BIRDEYE_API_KEY,
          accept: "application/json",
          "x-chain": "solana",
        },
      },
    );
    const data = await response.json();
    return (data.data.items || []).map((item: any) => ({
      date: new Date(item.unixTime * 1000).toISOString().split("T")[0],
      price: Number(item.value || 0),
      volume: Number(item.volume || 0),
    }));
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
    const response = await fetch(HELIUS_RPC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "batch-tx-details",
        method: "getTransactions",
        params: [
          signatureStrings,
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
        ],
      }),
    });
    const data = await response.json();
    const transactions = data.result?.transactions || [];
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
