/**
 * This module provides utilities for connecting to the Solana blockchain
 * and interacting with wallets.
 *
 * Supports legacy window-injected wallets (Phantom, Solflare) and
 * Wallet Standard wallets (Jupiter extension, etc.) via @wallet-standard/app.
 */

import { WALLET_ADAPTER_NETWORK, RPC_ENDPOINT } from "@constants/addresses";
import walletService from "@lib/services/walletService";
import { getWallets } from "@wallet-standard/app";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

// Wallet types
export type WalletName = "phantom" | "solflare" | "jupiter" | "other";

export interface WalletInfo {
  name: WalletName;
  address: string;
  connected: boolean;
}

export interface ConnectionState {
  connected: boolean;
  wallet: WalletInfo | null;
  rpcEndpoint: string;
  network: string;
  error: string | null;
}

// Initial connection state
const initialState: ConnectionState = {
  connected: false,
  wallet: null,
  rpcEndpoint: RPC_ENDPOINT,
  network: WALLET_ADAPTER_NETWORK,
  error: null,
};

// Extend Window interface for wallet adapters
interface SolanaWallet {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isJupiter?: boolean;
  isConnected?: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  publicKey: { toString: () => string };
  signTransaction?: (tx: any) => Promise<any>;
  signAndSendTransaction?: (tx: any) => Promise<any>;
  signMessage?: (msg: Uint8Array) => Promise<any>;
}

declare global {
  interface Window {
    solana?: SolanaWallet;
    solflare?: SolanaWallet;
    jupiter?: SolanaWallet;
    phantom?: { solana?: SolanaWallet };
  }
}

// ── Wallet Standard (Jupiter extension) ──────────────────────
// Jupiter wallet extension registers via Wallet Standard instead of
// injecting window.jupiter. We use getWallets() to discover it.

// Cache the resolved Wallet Standard wallet for Jupiter
let _jupiterStandardWallet: any = null;

/** Find Jupiter wallet from Wallet Standard registry */
function findJupiterStandardWallet(): any {
  try {
    const { get } = getWallets();
    const all = get();
    // Jupiter extension registers with name "Jupiter" and supports solana chains
    const jup = all.find(
      (w: any) =>
        w.name?.toLowerCase().includes("jupiter") &&
        w.chains?.some?.((c: string) => c.startsWith("solana:")),
    );
    if (jup) _jupiterStandardWallet = jup;
    return jup || null;
  } catch {
    return null;
  }
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Minimal base58 encoder (no external dependency — "bs58" is only a
 * transitive dep in this project, not a declared one). Used to turn the raw
 * signature bytes a Wallet Standard wallet returns into the base58 string
 * the rest of the app expects (same format Phantom/Solflare return).
 */
function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const digits = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) {
    leadingZeros++;
  }
  let result = BASE58_ALPHABET[0].repeat(leadingZeros);
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

/** Serialize a transaction to the raw bytes the Wallet Standard API expects */
function serializeForSigning(tx: Transaction | VersionedTransaction): Uint8Array {
  if (tx instanceof VersionedTransaction) return tx.serialize();
  // Legacy Transaction isn't signed yet at this point, so signatures can't
  // be required/verified when producing the wire bytes to hand to the wallet.
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false });
}

/** Rebuild a signed transaction object from the bytes the wallet hands back */
function deserializeSigned(
  bytes: Uint8Array,
  original: Transaction | VersionedTransaction,
): Transaction | VersionedTransaction {
  if (original instanceof VersionedTransaction) {
    return VersionedTransaction.deserialize(bytes);
  }
  return Transaction.from(bytes);
}

/**
 * Wrap a Wallet Standard wallet into our SolanaWallet interface.
 *
 * The Wallet Standard sign features (`solana:signTransaction`,
 * `solana:signAndSendTransaction`, `solana:signMessage`) take
 * `{ account, transaction/message: Uint8Array, chain }` input objects and
 * return an *array* of outputs — not a raw transaction object and not a
 * single result. This wrapper translates both directions so the rest of the
 * app can keep treating every wallet the same way it treats Phantom.
 */
function wrapStandardWallet(stdWallet: any): SolanaWallet | null {
  if (!stdWallet) return null;

  const features = stdWallet.features || {};
  const connectFeature = features["standard:connect"];
  const disconnectFeature = features["standard:disconnect"];

  if (!connectFeature) return null;

  // The sign features need the full WalletAccount object returned by
  // connect(), not just the address string derived from it — keep it.
  let connectedAccount: any = null;

  const getChain = (): string =>
    connectedAccount?.chains?.find((c: string) => c.startsWith("solana:")) ||
    "solana:mainnet";

  // Build a SolanaWallet-compatible wrapper
  const wrapper: SolanaWallet = {
    isJupiter: true,
    isConnected: false,
    publicKey: { toString: () => "" },
    connect: async () => {
      const result = await connectFeature.connect();
      // standard:connect returns { accounts: Account[] }
      const accounts = result?.accounts || [];
      if (accounts.length > 0) {
        const acct = accounts[0];
        connectedAccount = acct;
        // Account.address is a base58 string per the Wallet Standard spec;
        // fall back to deriving it from publicKey bytes just in case.
        let address: string;
        if (typeof acct.address === "string") {
          address = acct.address;
        } else if (acct.publicKey) {
          address = new PublicKey(acct.publicKey).toString();
        } else {
          address = new PublicKey(acct.address).toString();
        }
        // A real PublicKey (not just a toString() shim) so callers that
        // build transactions with wallet.publicKey (feePayer, ATAs, etc.)
        // work the same way they do for Phantom/Solflare.
        wrapper.publicKey = new PublicKey(address);
        wrapper.isConnected = true;
      }
    },
    disconnect: async () => {
      if (disconnectFeature) await disconnectFeature.disconnect();
      wrapper.isConnected = false;
      connectedAccount = null;
    },
  };

  // Wire up transaction signing if available
  const signTxFeature = features["solana:signTransaction"];
  if (signTxFeature) {
    wrapper.signTransaction = async (tx: Transaction | VersionedTransaction) => {
      if (!connectedAccount) throw new Error("Jupiter wallet not connected");
      const [result] = await signTxFeature.signTransaction({
        account: connectedAccount,
        transaction: serializeForSigning(tx),
        chain: getChain(),
      });
      if (!result?.signedTransaction) {
        throw new Error("Jupiter wallet did not return a signed transaction");
      }
      return deserializeSigned(result.signedTransaction, tx);
    };
  }

  const signAndSendFeature = features["solana:signAndSendTransaction"];
  if (signAndSendFeature) {
    wrapper.signAndSendTransaction = async (
      tx: Transaction | VersionedTransaction,
    ) => {
      if (!connectedAccount) throw new Error("Jupiter wallet not connected");
      const [result] = await signAndSendFeature.signAndSendTransaction({
        account: connectedAccount,
        transaction: serializeForSigning(tx),
        chain: getChain(),
      });
      if (!result?.signature) {
        throw new Error("Jupiter wallet did not return a transaction signature");
      }
      return { signature: base58Encode(result.signature) };
    };
  }

  const signMsgFeature = features["solana:signMessage"];
  if (signMsgFeature) {
    wrapper.signMessage = async (msg: Uint8Array) => {
      if (!connectedAccount) throw new Error("Jupiter wallet not connected");
      const [result] = await signMsgFeature.signMessage({
        account: connectedAccount,
        message: msg,
      });
      return result;
    };
  }

  return wrapper;
}

// ── Provider resolution ──────────────────────────────────────

/** Detect if running on a mobile device */
const isMobileDevice = () =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );

/** Wait for wallet provider injection (extensions may delay) */
const waitForProvider = (timeout = 2000): Promise<void> =>
  new Promise((resolve) => {
    if (
      window.phantom?.solana ||
      window.solana ||
      window.solflare ||
      window.jupiter ||
      findJupiterStandardWallet()
    ) {
      resolve();
      return;
    }
    let elapsed = 0;
    const poll = setInterval(() => {
      elapsed += 100;
      if (
        window.phantom?.solana ||
        window.solana ||
        window.solflare ||
        window.jupiter ||
        findJupiterStandardWallet() ||
        elapsed >= timeout
      ) {
        clearInterval(poll);
        resolve();
      }
    }, 100);
  });

/** Get the Phantom wallet adapter (prefers phantom.solana path) */
const getPhantomAdapter = (): SolanaWallet | undefined =>
  window.phantom?.solana || window.solana;

// Cache the wrapped Jupiter adapter itself (not just the raw Wallet
// Standard registry entry). wrapStandardWallet() closes over connection
// state (the connected account, isConnected, publicKey) in local variables,
// so creating a fresh wrapper on every call — as this used to do — threw
// that state away and looked "disconnected" on every call after the first.
let _jupiterWrappedWallet: SolanaWallet | undefined;

/** Get the Jupiter wallet adapter (window.jupiter or Wallet Standard) */
const getJupiterAdapter = (): SolanaWallet | undefined => {
  // Check legacy window.jupiter first (Jupiter Mobile in-app browser)
  if (window.jupiter) return window.jupiter;
  // Check Wallet Standard (Jupiter browser extension)
  const std = _jupiterStandardWallet || findJupiterStandardWallet();
  if (!std) return undefined;
  if (!_jupiterWrappedWallet) {
    _jupiterWrappedWallet = wrapStandardWallet(std) || undefined;
  }
  return _jupiterWrappedWallet;
};

/**
 * Get the active wallet provider by name.
 * Exported so useWallet.tsx and tradeApi.ts can use it for signing.
 */
export const getWalletProvider = (walletName?: WalletName): SolanaWallet | null => {
  if (walletName === "phantom") return getPhantomAdapter() || null;
  if (walletName === "solflare") return window.solflare || null;
  if (walletName === "jupiter") return getJupiterAdapter() || null;
  if (walletName === "other") return window.solana || null;
  // No name specified — try all in priority order
  return getPhantomAdapter() || window.solflare || getJupiterAdapter() || window.solana || null;
};

// ── Public API ───────────────────────────────────────────────

/** Detect available wallets */
export const checkWalletsAvailability = async (): Promise<WalletName[]> => {
  await waitForProvider();
  const available: WalletName[] = [];

  const phantom = getPhantomAdapter();
  if (phantom?.isPhantom) {
    available.push("phantom");
  }

  if (window.solflare?.isSolflare) {
    available.push("solflare");
  }

  // Jupiter: check window.jupiter OR Wallet Standard
  if (window.jupiter || findJupiterStandardWallet()) {
    available.push("jupiter");
  }

  if (window.solana && !window.solana.isPhantom && !window.solana.isSolflare) {
    available.push("other");
  }

  return available;
};

/** Connect to a wallet */
export const connectWallet = async (
  walletName: WalletName,
): Promise<ConnectionState> => {
  try {
    let walletAdapter: SolanaWallet | undefined;

    switch (walletName) {
      case "phantom":
        walletAdapter = getPhantomAdapter();
        if (!walletAdapter?.isPhantom) {
          throw new Error("Phantom wallet not detected");
        }
        break;
      case "solflare":
        walletAdapter = window.solflare;
        if (!walletAdapter?.isSolflare) {
          throw new Error("Solflare wallet not detected");
        }
        break;
      case "jupiter":
        walletAdapter = getJupiterAdapter();
        if (!walletAdapter) {
          throw new Error("Jupiter wallet not detected. Install the Jupiter browser extension or open budju.xyz in Jupiter Mobile's browser.");
        }
        break;
      case "other":
        walletAdapter = window.solana;
        if (
          !walletAdapter ||
          walletAdapter.isPhantom ||
          walletAdapter.isSolflare
        ) {
          throw new Error("No compatible 'other' wallet detected");
        }
        break;
      default:
        throw new Error(`Unsupported wallet: ${walletName}`);
    }

    await walletAdapter.connect();
    const address = walletAdapter.publicKey.toString();
    const network = walletService.currentNetwork;

    return {
      connected: true,
      wallet: {
        name: walletName,
        address,
        connected: true,
      },
      rpcEndpoint: RPC_ENDPOINT,
      network,
      error: null,
    };
  } catch (error) {
    console.error("Error connecting to wallet:", error);
    return {
      ...initialState,
      error:
        error instanceof Error ? error.message : "Failed to connect to wallet",
    };
  }
};

/** Disconnect from a wallet */
export const disconnectWallet = async (): Promise<ConnectionState> => {
  try {
    const walletAdapter = getWalletProvider();
    if (walletAdapter && walletAdapter.disconnect) {
      await walletAdapter.disconnect();
    }

    return initialState;
  } catch (error) {
    console.error("Error disconnecting from wallet:", error);
    return {
      ...initialState,
      error: "Failed to disconnect from wallet",
    };
  }
};

/** Check if a wallet is connected (no session restore — DB is source of truth) */
export const checkWalletConnection = async (): Promise<ConnectionState> => {
  return initialState;
};

/** Format wallet address for display */
export const formatWalletAddress = (address: string): string => {
  if (!address) return "";
  return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
};
