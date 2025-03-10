import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  Liquidity,
  jsonInfo2PoolKeys,
  LiquidityPoolKeys,
  Percent,
} from "@raydium-io/raydium-sdk";
import { getTokenBySymbol } from "@lib/services/tokenRegistry";
import { RPC_ENDPOINT } from "@constants/addresses";
import { getConnectedWallet } from "@lib/services/bankApi";

// Types
export interface SwapParams {
  fromToken: string; // Token symbol (e.g., 'SOL', 'RAY')
  toToken: string; // Token symbol
  amount: number; // Amount in UI format
  slippageTolerance?: number; // As percentage: 0.5 = 0.5%
  wallet: any; // Wallet adapter instance
}

export interface SwapEstimate {
  fromAmount: number;
  toAmount: number;
  estimatedPrice: number;
  priceImpact: number;
  minReceived: number;
  fees: {
    liquidityFee: number;
    networkFee: number;
    totalFee: number;
  };
}

// Cached liquidity pools
const liquidityPoolsCache = new Map<string, LiquidityPoolKeys>();
let lastPoolsUpdate = 0;
const POOLS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Get connection
const getConnection = (): Connection =>
  new Connection(RPC_ENDPOINT, "confirmed");

/**
 * Debug wallet object
 */
const debugWallet = (wallet: any): void => {
  console.log("Wallet debug info (swap):", {
    wallet: wallet,
    publicKey: wallet.publicKey ? wallet.publicKey.toString() : "none",
    signTransaction:
      typeof wallet.signTransaction === "function"
        ? "available"
        : "not available",
    signAllTransactions:
      typeof wallet.signAllTransactions === "function"
        ? "available"
        : "not available",
    isPhantom: wallet.isPhantom || false,
    isSolflare: wallet.isSolflare || false,
  });
};

/**
 * Initialize and get liquidity pools
 */
export const getLiquidityPools = async (): Promise<
  Map<string, LiquidityPoolKeys>
> => {
  const now = Date.now();

  // Return from cache if valid
  if (liquidityPoolsCache.size > 0 && now - lastPoolsUpdate < POOLS_CACHE_TTL) {
    return liquidityPoolsCache;
  }

  try {
    // Clear existing cache
    liquidityPoolsCache.clear();

    // Fetch liquidity pools from Raydium API
    const response = await fetch("https://api.raydium.io/v2/main/pools");

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const pools = await response.json();

    // Convert to pool keys and cache them
    for (const pool of pools.official) {
      try {
        const poolKeys = jsonInfo2PoolKeys(pool) as LiquidityPoolKeys;
        const key = `${pool.baseMint}/${pool.quoteMint}`;
        liquidityPoolsCache.set(key, poolKeys);

        // Also store reverse lookup
        const reverseKey = `${pool.quoteMint}/${pool.baseMint}`;
        liquidityPoolsCache.set(reverseKey, poolKeys);
      } catch (error) {
        console.warn(`Failed to process pool: ${pool.name}`, error);
      }
    }

    lastPoolsUpdate = now;
    return liquidityPoolsCache;
  } catch (error) {
    console.error("Failed to initialize liquidity pools cache:", error);
    return liquidityPoolsCache;
  }
};

/**
 * Get pool for token pair
 */
export const getPoolForPair = async (
  fromTokenAddress: string,
  toTokenAddress: string,
): Promise<LiquidityPoolKeys | null> => {
  await getLiquidityPools();

  // Get direct pool
  const directKey = `${fromTokenAddress}/${toTokenAddress}`;
  return liquidityPoolsCache.get(directKey) || null;
};

/**
 * Estimate swap output
 */
export const estimateSwap = async (
  params: SwapParams,
): Promise<SwapEstimate> => {
  const { fromToken, toToken, amount, slippageTolerance = 0.5 } = params;
  const connection = getConnection();

  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  // Get token information
  const fromTokenInfo = await getTokenBySymbol(fromToken);
  const toTokenInfo = await getTokenBySymbol(toToken);

  if (!fromTokenInfo || !toTokenInfo) {
    throw new Error(`Token not found: ${fromTokenInfo ? toToken : fromToken}`);
  }

  // Get pool for this pair
  let pool;
  try {
    pool = await getPoolForPair(fromTokenInfo.address, toTokenInfo.address);
  } catch (error) {
    console.warn(`Error getting pool for ${fromToken}/${toToken}:`, error);
  }

  if (!pool) {
    // Fallback to estimate based on price
    console.log(
      `No pool found for ${fromToken}/${toToken}, using price-based estimate`,
    );
    return await estimateSwapBasedOnPrice(fromToken, toToken, amount);
  }

  try {
    // Convert amount to token units
    const amountIn = amount * Math.pow(10, fromTokenInfo.decimals);

    // Get pool info from chain
    const poolInfo = await Liquidity.fetchInfo({
      connection,
      poolKeys: pool,
    });

    // Determine currency direction
    const currencyIn =
      fromTokenInfo.address === pool.baseMint.toString() ? "base" : "quote";

    // Calculate swap amounts
    const { amountOut, minAmountOut, priceImpact, fee } =
      Liquidity.computeAmountOut({
        poolKeys: pool,
        poolInfo,
        amountIn,
        currencyIn,
        slippage: new Percent(slippageTolerance, 100),
      });

    // Convert to UI amounts
    const toAmount = amountOut / Math.pow(10, toTokenInfo.decimals);
    const minReceived = minAmountOut / Math.pow(10, toTokenInfo.decimals);
    const estimatedPrice = amount / toAmount;

    // Calculate fees
    const feeNumerator = parseInt(fee.numerator.toString());
    const feeDenominator = parseInt(fee.denominator.toString());
    const liquidityFee = (feeNumerator / feeDenominator) * amount;

    return {
      fromAmount: amount,
      toAmount,
      estimatedPrice,
      priceImpact: Number(priceImpact.toFixed(2)),
      minReceived,
      fees: {
        liquidityFee,
        networkFee: 0.000005, // Typical Solana fee in SOL
        totalFee: liquidityFee + 0.000005,
      },
    };
  } catch (error) {
    console.error("Error estimating swap:", error);
    // Fallback to price-based estimate
    return await estimateSwapBasedOnPrice(fromToken, toToken, amount);
  }
};

/**
 * Fallback estimation based on price only
 */
const estimateSwapBasedOnPrice = async (
  fromToken: string,
  toToken: string,
  amount: number,
): Promise<SwapEstimate> => {
  try {
    // Get token price for estimation
    const fromTokenInfo = await getTokenBySymbol(fromToken);
    const toTokenInfo = await getTokenBySymbol(toToken);

    if (!fromTokenInfo || !toTokenInfo) {
      throw new Error(
        `Token not found: ${fromTokenInfo ? toToken : fromToken}`,
      );
    }

    // Get prices from Jupiter API
    let fromPrice = 0;
    let toPrice = 0;

    try {
      const response = await fetch(
        `https://price.jup.ag/v4/price?ids=${fromTokenInfo.address},${toTokenInfo.address}`,
      );
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();
      fromPrice = data.data[fromTokenInfo.address]?.price || 0;
      toPrice = data.data[toTokenInfo.address]?.price || 0;
    } catch (error) {
      console.warn("Error fetching Jupiter prices:", error);
      // Fallback prices
      switch (fromToken) {
        case "SOL":
          fromPrice = 140.0;
          break;
        case "RAY":
          fromPrice = 1.85;
          break;
        case "BUDJU":
          fromPrice = 0.0002;
          break;
        case "USDC":
          fromPrice = 1.0;
          break;
        default:
          fromPrice = 1.0;
      }

      switch (toToken) {
        case "SOL":
          toPrice = 140.0;
          break;
        case "RAY":
          toPrice = 1.85;
          break;
        case "BUDJU":
          toPrice = 0.0002;
          break;
        case "USDC":
          toPrice = 1.0;
          break;
        default:
          toPrice = 1.0;
      }
    }

    if (fromPrice <= 0 || toPrice <= 0) {
      throw new Error("Zero price detected");
    }

    // Calculate based on USD values
    const fromValueUsd = amount * fromPrice;
    const toAmount = fromValueUsd / toPrice;
    const estimatedPrice = amount / toAmount;

    // Estimate reasonable slippage
    const minReceived = toAmount * 0.995; // 0.5% slippage

    // Estimate fees (0.3% is a typical DEX fee)
    const liquidityFee = amount * 0.003;

    return {
      fromAmount: amount,
      toAmount,
      estimatedPrice,
      priceImpact: 0.3, // Reasonable estimate
      minReceived,
      fees: {
        liquidityFee,
        networkFee: 0.000005,
        totalFee: liquidityFee + 0.000005,
      },
    };
  } catch (error) {
    console.error("Error in price-based estimation:", error);

    // Return a default estimation with 1:1 ratio
    return {
      fromAmount: amount,
      toAmount: amount, // 1:1 ratio as fallback
      estimatedPrice: 1,
      priceImpact: 0,
      minReceived: amount * 0.995,
      fees: {
        liquidityFee: amount * 0.003,
        networkFee: 0.000005,
        totalFee: amount * 0.003 + 0.000005,
      },
    };
  }
};

/**
 * Execute token swap
 */
export const executeSwap = async (params: SwapParams): Promise<string> => {
  const {
    fromToken,
    toToken,
    amount,
    slippageTolerance = 0.5,
    wallet,
  } = params;
  const connection = getConnection();

  // Validate wallet
  if (!wallet || !wallet.publicKey) {
    debugWallet(wallet);

    // Try to get a connected wallet
    try {
      const connectedWallet = getConnectedWallet();
      if (!connectedWallet || !connectedWallet.publicKey) {
        throw new Error("Wallet not connected");
      }
    } catch (error) {
      throw new Error("Wallet not connected");
    }
  }

  const fromTokenInfo = await getTokenBySymbol(fromToken);
  const toTokenInfo = await getTokenBySymbol(toToken);

  if (!fromTokenInfo || !toTokenInfo) {
    throw new Error(`Token not found: ${fromTokenInfo ? toToken : fromToken}`);
  }

  const pool = await getPoolForPair(fromTokenInfo.address, toTokenInfo.address);

  if (!pool) {
    throw new Error(`No liquidity pool found for ${fromToken}/${toToken}`);
  }

  // Convert amount to token units
  const amountIn = Math.floor(amount * Math.pow(10, fromTokenInfo.decimals));

  // Get pool info from chain
  const poolInfo = await Liquidity.fetchInfo({
    connection,
    poolKeys: pool,
  });

  // Determine currency direction
  const currencyIn =
    fromTokenInfo.address === pool.baseMint.toString() ? "base" : "quote";

  // Create swap instruction
  const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
    connection,
    poolKeys: pool,
    userKeys: {
      tokenAccounts: [], // Will be retrieved inside the function
      owner: wallet.publicKey,
    },
    amountIn,
    currencyIn,
    slippage: new Percent(slippageTolerance, 100),
  });

  if (!innerTransactions || innerTransactions.length === 0) {
    throw new Error("Failed to create swap instructions");
  }

  // Create and sign transaction
  const transactions: Transaction[] = innerTransactions.map((instruction) =>
    new Transaction().add(...instruction.instructions),
  );

  // Set recent blockhash
  const latestBlockhash = await connection.getLatestBlockhash();
  transactions.forEach((tx) => {
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = latestBlockhash.blockhash;
  });

  // Sign all transactions
  let signedTransactions;
  try {
    signedTransactions = await wallet.signAllTransactions(transactions);
  } catch (error) {
    console.error("Error signing transactions:", error);
    throw new Error(
      `Failed to sign transactions: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  if (!signedTransactions || signedTransactions.length === 0) {
    throw new Error("No signed transactions to send");
  }

  // Send transactions
  const signatures = [];
  for (const tx of signedTransactions) {
    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature);
    signatures.push(signature);
  }

  if (signatures.length === 0) {
    throw new Error("No transaction signatures returned");
  }

  return signatures[0]; // Return the first transaction signature
};
