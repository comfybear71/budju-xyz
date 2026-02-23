// ============================================================
// USDC Deposit Service
// Reads via /api/rpc proxy (Helius), sends via Phantom wallet
// ============================================================

import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  createTransferInstruction,
} from "@solana/spl-token";
import { POOL_WALLET, USDC_MINT } from "@constants/addresses";

const USDC_DECIMALS = 6;

// Use the RPC proxy — routes through Helius server-side, no rate limits
const getRpcUrl = () => {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return origin + "/api/rpc";
};

const getConnection = () =>
  new Connection(getRpcUrl(), {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
  });

// ── Send USDC Deposit ───────────────────────────────────────

export async function sendUsdcDeposit(
  wallet: any,
  _walletAddress: string,
  amount: number,
): Promise<string> {
  if (!wallet || !wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  const depositAddress = POOL_WALLET;
  if (!depositAddress) {
    throw new Error("Deposit address not configured");
  }

  const connection = getConnection();
  const usdcMint = new PublicKey(USDC_MINT);
  const destination = new PublicKey(depositAddress);

  // 1. Get source ATA (sender's USDC account)
  const sourceAta = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);

  try {
    await getAccount(connection, sourceAta);
  } catch {
    throw new Error("No USDC token account found in your wallet");
  }

  // 2. Get destination ATA (pool wallet's USDC account)
  const destAta = await getAssociatedTokenAddress(usdcMint, destination, true);

  // 3. Build transaction
  const transaction = new Transaction();

  // Create destination ATA if it doesn't exist
  try {
    await getAccount(connection, destAta);
  } catch {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        destAta,
        destination,
        usdcMint,
      ),
    );
  }

  // Add transfer instruction
  const tokenAmount = Math.round(amount * Math.pow(10, USDC_DECIMALS));
  transaction.add(
    createTransferInstruction(sourceAta, destAta, wallet.publicKey, tokenAmount),
  );

  // Set blockhash and fee payer
  const latestBlockhash = await connection.getLatestBlockhash();
  transaction.recentBlockhash = latestBlockhash.blockhash;
  transaction.feePayer = wallet.publicKey;

  // 4. Sign and send via Phantom (Phantom uses its own RPC to submit)
  const { signature } = await wallet.signAndSendTransaction(transaction);

  return signature;
}
