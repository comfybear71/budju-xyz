// ============================================================
// USDC Deposit Service — Direct port of FLUB's phantom-wallet.js
// Zero library dependencies. Builds raw SPL Token Transfer tx.
// ============================================================

import { POOL_WALLET, USDC_MINT } from "@constants/addresses";

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// ── Base58 Decode (FLUB: _base58Decode) ─────────────────────

function base58Decode(str: string): Uint8Array {
  const ALPHABET =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const c = ALPHABET.indexOf(str[i]);
    if (c < 0) throw new Error(`Invalid base58 char: ${str[i]}`);
    for (let j = 0; j < bytes.length; j++) bytes[j] *= 58;
    bytes[0] += c;
    let carry = 0;
    for (let j = 0; j < bytes.length; j++) {
      bytes[j] += carry;
      carry = bytes[j] >> 8;
      bytes[j] &= 0xff;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length && str[i] === "1"; i++) {
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

// ── Find Token Account (FLUB: _findTokenAccount) ────────────

async function findTokenAccount(
  rpcUrl: string,
  owner: string,
  mint: string,
): Promise<string | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [owner, { mint }, { encoding: "jsonParsed" }],
      }),
    });
    const data = await response.json();
    const accounts = data.result?.value || [];
    if (accounts.length === 0) return null;
    return accounts[0].pubkey;
  } catch {
    return null;
  }
}

// ── Build SPL Transfer Tx (FLUB: _buildSplTransferTx) ───────

function buildSplTransferTx(
  feePayer: string,
  fromAta: string,
  toAta: string,
  amount: number,
  recentBlockhash: string,
): { serialize: () => Uint8Array; message: { serialize: () => Uint8Array } } {
  const feePayerBytes = base58Decode(feePayer);
  const fromBytes = base58Decode(fromAta);
  const toBytes = base58Decode(toAta);
  const ownerBytes = feePayerBytes;
  const programBytes = base58Decode(TOKEN_PROGRAM_ID);
  const blockhashBytes = base58Decode(recentBlockhash);

  // SPL Token Transfer instruction (instruction index 3)
  // Data: [3] + little-endian u64 amount
  const data = new Uint8Array(9);
  data[0] = 3; // Transfer instruction
  let remaining = amount;
  for (let i = 1; i < 9; i++) {
    data[i] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }

  // Header: num_required_signatures(1), num_readonly_signed(0), num_readonly_unsigned(1)
  const header = new Uint8Array([1, 0, 1]);

  // Account keys: [feePayer/owner, fromAta, toAta, tokenProgram]
  const numKeys = 4;
  const accountKeys = new Uint8Array(numKeys * 32);
  accountKeys.set(feePayerBytes, 0);
  accountKeys.set(fromBytes, 32);
  accountKeys.set(toBytes, 64);
  accountKeys.set(programBytes, 96);

  // Instruction: programIdIndex=3, accounts=[1,2,0], data
  const instruction = new Uint8Array([
    3, // program ID index (tokenProgram is at index 3)
    3, // num accounts
    1,
    2,
    0, // account indices: from(1), to(2), owner(0)
    data.length, // data length
    ...data,
  ]);

  // Assemble the message
  const message = new Uint8Array([
    ...header,
    numKeys,
    ...accountKeys,
    ...blockhashBytes,
    1, // num instructions
    ...instruction,
  ]);

  // Create a transaction object that Phantom can sign
  const transaction = {
    serialize: () => {
      const sigCount = new Uint8Array([1]);
      const sigPlaceholder = new Uint8Array(64);
      const full = new Uint8Array(
        sigCount.length + sigPlaceholder.length + message.length,
      );
      full.set(sigCount, 0);
      full.set(sigPlaceholder, sigCount.length);
      full.set(message, sigCount.length + sigPlaceholder.length);
      return full;
    },
    message: { serialize: () => message },
  };

  return transaction;
}

// ── Send USDC Deposit (FLUB: sendUsdcDeposit) ───────────────

export async function sendUsdcDeposit(
  provider: any,
  walletAddress: string,
  amount: number,
): Promise<string> {
  if (!provider) {
    throw new Error("Wallet not connected");
  }

  const depositAddress = POOL_WALLET;
  if (!depositAddress) {
    throw new Error("Deposit address not configured");
  }

  const rpcUrl = "/api/rpc";

  // 1. Find the sender's USDC token account
  const senderAta = await findTokenAccount(rpcUrl, walletAddress, USDC_MINT);
  if (!senderAta) {
    throw new Error("No USDC token account found in your wallet");
  }

  // 2. Find the recipient's USDC token account
  const recipientAta = await findTokenAccount(
    rpcUrl,
    depositAddress,
    USDC_MINT,
  );
  if (!recipientAta) {
    throw new Error(
      "Deposit address USDC account not found. Please contact admin.",
    );
  }

  // 3. Build the transaction using raw bytes (USDC has 6 decimals)
  const usdcAmount = Math.round(amount * 1_000_000);

  // Get recent blockhash
  const bhResponse = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getLatestBlockhash",
      params: [{ commitment: "finalized" }],
    }),
  });
  const bhData = await bhResponse.json();
  if (bhData.error)
    throw new Error("Failed to get blockhash: " + bhData.error.message);
  const blockhash = bhData.result.value.blockhash;

  // Build a legacy transaction with SPL Token Transfer instruction
  const tx = buildSplTransferTx(
    walletAddress,
    senderAta,
    recipientAta,
    usdcAmount,
    blockhash,
  );

  // 4. Sign and send via Phantom (uses Phantom's own RPC)
  const { signature } = await provider.signAndSendTransaction(tx);
  return signature;
}

// ── Get USDC Balance ────────────────────────────────────────

export async function getUsdcBalance(walletAddress: string): Promise<number> {
  try {
    const response = await fetch("/api/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          walletAddress,
          { mint: USDC_MINT },
          { encoding: "jsonParsed" },
        ],
      }),
    });
    const data = await response.json();
    const accounts = data.result?.value || [];
    if (accounts.length === 0) return 0;
    return (
      accounts[0].account.data.parsed.info.tokenAmount.uiAmount || 0
    );
  } catch {
    return 0;
  }
}
