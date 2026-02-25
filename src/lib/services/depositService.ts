// ============================================================
// USDC Deposit Service
// Reads via raw fetch to /api/rpc (like FLUB)
// Transaction built with @solana/web3.js
// Sent via Phantom's signAndSendTransaction
// ============================================================

import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import { POOL_WALLET, USDC_MINT } from "@constants/addresses";

const USDC_DECIMALS = 6;

// Raw RPC call — same pattern as FLUB's phantom-wallet.js
async function rpcCall(method: string, params: any[]): Promise<any> {
  const res = await fetch("/api/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "RPC error");
  return data.result;
}

// Check if a token account exists via getAccountInfo
async function accountExists(address: string): Promise<boolean> {
  const result = await rpcCall("getAccountInfo", [
    address,
    { encoding: "base64" },
  ]);
  return result?.value !== null;
}

// ── Send USDC Deposit ───────────────────────────────────────

export async function sendUsdcDeposit(
  wallet: any,
  _walletAddress: string,
  amount: number,
): Promise<string> {
  if (!wallet || !wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  if (!POOL_WALLET) {
    throw new Error("Deposit address not configured");
  }

  const usdcMint = new PublicKey(USDC_MINT);
  const destination = new PublicKey(POOL_WALLET);

  // 1. Derive ATAs
  const sourceAta = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
  const destAta = await getAssociatedTokenAddress(usdcMint, destination, true);

  // 2. Check sender has USDC
  const senderHasUsdc = await accountExists(sourceAta.toBase58());
  if (!senderHasUsdc) {
    throw new Error("No USDC token account found in your wallet");
  }

  // 3. Build transaction
  const transaction = new Transaction();

  // Create destination ATA if it doesn't exist
  const destExists = await accountExists(destAta.toBase58());
  if (!destExists) {
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

  // 4. Get blockhash via proxy
  const bhResult = await rpcCall("getLatestBlockhash", [
    { commitment: "finalized" },
  ]);
  transaction.recentBlockhash = bhResult.value.blockhash;
  transaction.feePayer = wallet.publicKey;

  // 5. Sign and send via Phantom
  const { signature } = await wallet.signAndSendTransaction(transaction);
  return signature;
}
