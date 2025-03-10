import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  createTransferInstruction,
} from "@solana/spl-token";
import { BANK_ADDRESS, RPC_ENDPOINT } from "@constants/addresses";
import {
  getTokenBySymbol,
  getTokenByAddress,
  TokenInfo,
} from "@lib/services/tokenRegistry";

// Types
export interface DepositParams {
  token: string; // Token symbol (e.g., 'SOL', 'BUDJU')
  amount: number; // Amount in UI format
  wallet: any; // Wallet adapter instance
  onProgress?: (step: string, progress: number) => void; // Optional progress callback
}

export interface DepositResult {
  txId: string; // Transaction signature
  token: string; // Token symbol
  amount: number; // Deposited amount
  timestamp: number; // Timestamp of transaction
  status: "success" | "error";
  errorMessage?: string;
}

// Get connection
const getConnection = () =>
  new Connection(RPC_ENDPOINT, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
  });

/**
 * Debug wallet object
 */
const debugWallet = (wallet: any): void => {
  console.log("Wallet debug info:", {
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
 * Verify wallet and get connected wallet adapter
 */
export const getConnectedWallet = (): any => {
  // Check for Phantom wallet
  if (window.solana?.isPhantom && window.solana.isConnected) {
    return window.solana;
  }

  // Check for Solflare wallet
  if (window.solflare?.isSolflare && window.solflare.isConnected) {
    return window.solflare;
  }

  // Check for other wallets
  if (window.solana && !window.solana.isPhantom && window.solana.isConnected) {
    return window.solana;
  }

  throw new Error("No connected wallet found");
};

/**
 * Deposit tokens to the Bank of BUDJU
 */
export const depositTokens = async (
  params: DepositParams,
): Promise<DepositResult> => {
  const { token, amount, wallet, onProgress } = params;
  const connection = getConnection();
  const bankAddress = new PublicKey(BANK_ADDRESS);

  try {
    // Check if wallet is connected and has required methods
    if (!wallet || !wallet.publicKey) {
      console.error("Invalid wallet object:", wallet);
      debugWallet(wallet);

      // Try to get a connected wallet
      const connectedWallet = getConnectedWallet();
      if (!connectedWallet || !connectedWallet.publicKey) {
        throw new Error("Wallet not connected or wallet adapter not ready");
      }
    }

    // Update progress if callback provided
    onProgress?.("Initiating deposit", 0.1);

    // Handle different token types
    let txId: string;

    if (token === "SOL") {
      txId = await depositSOL(amount, wallet, connection, bankAddress);
    } else {
      txId = await depositSPLToken(
        token,
        amount,
        wallet,
        connection,
        bankAddress,
      );
    }

    onProgress?.("Confirming transaction", 0.9);

    // Wait for confirmation
    await connection.confirmTransaction(txId);

    onProgress?.("Deposit completed", 1);

    return {
      txId,
      token,
      amount,
      timestamp: Date.now(),
      status: "success",
    };
  } catch (error) {
    console.error("Deposit failed:", error);
    return {
      txId: "",
      token,
      amount,
      timestamp: Date.now(),
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

/**
 * Deposit SOL to the Bank of BUDJU
 */
const depositSOL = async (
  amount: number,
  wallet: any,
  connection: Connection,
  bankAddress: PublicKey,
): Promise<string> => {
  // Create transaction
  const transaction = new Transaction();

  // Add transfer instruction
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: bankAddress,
      lamports: Math.floor(amount * LAMPORTS_PER_SOL),
    }),
  );

  // Set recent blockhash and fee payer
  const latestBlockhash = await connection.getLatestBlockhash();
  transaction.recentBlockhash = latestBlockhash.blockhash;
  transaction.feePayer = wallet.publicKey;

  // Sign transaction
  let signedTransaction;
  try {
    signedTransaction = await wallet.signTransaction(transaction);
  } catch (error) {
    console.error("Error signing transaction:", error);
    throw new Error(
      `Failed to sign transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  // Send transaction
  const signature = await connection.sendRawTransaction(
    signedTransaction.serialize(),
  );

  return signature;
};

/**
 * Deposit SPL token to the Bank of BUDJU
 */
const depositSPLToken = async (
  tokenSymbol: string,
  amount: number,
  wallet: any,
  connection: Connection,
  bankAddress: PublicKey,
): Promise<string> => {
  // Get token info
  const tokenInfo = await getTokenBySymbol(tokenSymbol);
  if (!tokenInfo) {
    throw new Error(`Token not found: ${tokenSymbol}`);
  }

  const tokenMint = new PublicKey(tokenInfo.address);

  // Create transaction
  const transaction = new Transaction();

  // Get source token account
  const sourceTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    wallet.publicKey,
  );

  // Make sure source token account exists
  try {
    await getAccount(connection, sourceTokenAccount);
  } catch (error) {
    throw new Error(`Token account not found for ${tokenSymbol}`);
  }

  // Get destination token account (Bank's token account)
  const destinationTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    bankAddress,
    true, // Allow owner off curve
  );

  // Check if destination token account exists, create if not
  try {
    await getAccount(connection, destinationTokenAccount);
  } catch (error) {
    // Create associated token account for the bank
    transaction.add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        destinationTokenAccount,
        bankAddress,
        tokenMint,
      ),
    );
  }

  // Calculate token amount with decimals
  const tokenAmount = Math.round(amount * Math.pow(10, tokenInfo.decimals));

  // Add transfer instruction
  transaction.add(
    createTransferInstruction(
      sourceTokenAccount,
      destinationTokenAccount,
      wallet.publicKey,
      tokenAmount,
    ),
  );

  // Set recent blockhash and fee payer
  const latestBlockhash = await connection.getLatestBlockhash();
  transaction.recentBlockhash = latestBlockhash.blockhash;
  transaction.feePayer = wallet.publicKey;

  // Sign transaction
  let signedTransaction;
  try {
    signedTransaction = await wallet.signTransaction(transaction);
  } catch (error) {
    console.error("Error signing transaction:", error);
    throw new Error(
      `Failed to sign transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  // Send transaction
  const signature = await connection.sendRawTransaction(
    signedTransaction.serialize(),
  );

  return signature;
};

/**
 * Get bank token balance
 */
export const getBankBalance = async (
  tokenSymbol?: string,
): Promise<{ [token: string]: number }> => {
  const connection = getConnection();
  const bankAddress = new PublicKey(BANK_ADDRESS);
  const balance: { [token: string]: number } = {};

  // Get SOL balance
  const solBalance = await connection.getBalance(bankAddress);
  balance["SOL"] = solBalance / LAMPORTS_PER_SOL;

  // If specific token requested
  if (tokenSymbol) {
    const tokenInfo = await getTokenBySymbol(tokenSymbol);
    if (tokenInfo) {
      balance[tokenSymbol] = await getSplTokenBalance(
        connection,
        bankAddress,
        tokenInfo.address,
        tokenInfo.decimals,
      );
    }
    return balance;
  }

  // Get BUDJU balance
  const budjuTokenInfo = await getTokenBySymbol("BUDJU");
  if (budjuTokenInfo) {
    balance["BUDJU"] = await getSplTokenBalance(
      connection,
      bankAddress,
      budjuTokenInfo.address,
      budjuTokenInfo.decimals,
    );
  }

  // Get other major tokens like USDC, USDT, etc.
  const majorTokens = ["USDC", "USDT", "RAY"];
  await Promise.all(
    majorTokens.map(async (symbol) => {
      const tokenInfo = await getTokenBySymbol(symbol);
      if (tokenInfo) {
        balance[symbol] = await getSplTokenBalance(
          connection,
          bankAddress,
          tokenInfo.address,
          tokenInfo.decimals,
        );
      }
    }),
  );

  return balance;
};

/**
 * Get SPL token balance for an account
 */
const getSplTokenBalance = async (
  connection: Connection,
  owner: PublicKey,
  tokenAddress: string,
  decimals: number = 6,
): Promise<number> => {
  try {
    const tokenMint = new PublicKey(tokenAddress);
    const tokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      owner,
      true, // Allow owner off curve
    );

    try {
      const account = await getAccount(connection, tokenAccount);
      return Number(account.amount) / Math.pow(10, decimals);
    } catch (error) {
      return 0; // Token account doesn't exist
    }
  } catch (error) {
    console.error(
      `Error fetching SPL token balance for ${tokenAddress}:`,
      error,
    );
    return 0;
  }
};
