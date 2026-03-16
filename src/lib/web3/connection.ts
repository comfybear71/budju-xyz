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

/** Wrap a Wallet Standard wallet into our SolanaWallet interface */
function wrapStandardWallet(stdWallet: any): SolanaWallet | null {
  if (!stdWallet) return null;

  const features = stdWallet.features || {};
  const connectFeature = features["standard:connect"];
  const disconnectFeature = features["standard:disconnect"];

  if (!connectFeature) return null;

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
        // Account.address is a Uint8Array (public key bytes) or string
        let address: string;
        if (typeof acct.address === "string") {
          address = acct.address;
        } else if (acct.publicKey) {
          // Some implementations provide publicKey as bytes
          const { PublicKey } = await import("@solana/web3.js");
          address = new PublicKey(acct.publicKey).toString();
        } else {
          const { PublicKey } = await import("@solana/web3.js");
          address = new PublicKey(acct.address).toString();
        }
        wrapper.publicKey = { toString: () => address };
        wrapper.isConnected = true;
      }
    },
    disconnect: async () => {
      if (disconnectFeature) await disconnectFeature.disconnect();
      wrapper.isConnected = false;
    },
  };

  // Wire up transaction signing if available
  const signTxFeature = features["solana:signTransaction"];
  if (signTxFeature) {
    wrapper.signTransaction = async (tx: any) => {
      const result = await signTxFeature.signTransaction(tx);
      return result?.signedTransaction || result;
    };
  }

  const signAndSendFeature = features["solana:signAndSendTransaction"];
  if (signAndSendFeature) {
    wrapper.signAndSendTransaction = async (tx: any) => {
      const result = await signAndSendFeature.signAndSendTransaction(tx);
      return { signature: result?.signature || result };
    };
  }

  const signMsgFeature = features["solana:signMessage"];
  if (signMsgFeature) {
    wrapper.signMessage = async (msg: Uint8Array) => {
      return await signMsgFeature.signMessage(msg);
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

/** Get the Jupiter wallet adapter (window.jupiter or Wallet Standard) */
const getJupiterAdapter = (): SolanaWallet | undefined => {
  // Check legacy window.jupiter first
  if (window.jupiter) return window.jupiter;
  // Check Wallet Standard
  const std = _jupiterStandardWallet || findJupiterStandardWallet();
  return wrapStandardWallet(std) || undefined;
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

/** Check if a wallet is connected (session restore) */
export const checkWalletConnection = async (): Promise<ConnectionState> => {
  try {
    const savedAddress = localStorage.getItem("budjuWalletAddress");
    const savedWalletName = localStorage.getItem("budjuWalletName");
    const savedConnected = localStorage.getItem("budjuWalletConnected");

    if (savedAddress && savedWalletName && savedConnected === "true") {
      await waitForProvider();
      const mobile = isMobileDevice();
      let walletAdapter: SolanaWallet | undefined;

      switch (savedWalletName as WalletName) {
        case "phantom":
          walletAdapter = getPhantomAdapter();
          if (!walletAdapter?.isPhantom) return initialState;
          break;
        case "solflare":
          walletAdapter = window.solflare;
          if (!walletAdapter?.isSolflare) return initialState;
          break;
        case "jupiter":
          walletAdapter = getJupiterAdapter();
          if (!walletAdapter) return initialState;
          break;
        case "other":
          walletAdapter = window.solana;
          if (
            !walletAdapter ||
            walletAdapter.isPhantom ||
            walletAdapter.isSolflare
          )
            return initialState;
          break;
        default:
          return initialState;
      }

      if (!walletAdapter.isConnected) {
        if (mobile) {
          try {
            await walletAdapter.connect();
          } catch {
            return initialState;
          }
        } else {
          return initialState;
        }
      }

      const address = walletAdapter.publicKey.toString();
      if (address !== savedAddress) {
        return initialState;
      }

      return {
        connected: true,
        wallet: {
          name: savedWalletName as WalletName,
          address,
          connected: true,
        },
        rpcEndpoint: RPC_ENDPOINT,
        network: walletService.currentNetwork,
        error: null,
      };
    }

    return initialState;
  } catch (error) {
    console.error("Error checking wallet connection:", error);
    return {
      ...initialState,
      error: "Failed to check wallet connection",
    };
  }
};

/** Format wallet address for display */
export const formatWalletAddress = (address: string): string => {
  if (!address) return "";
  return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
};
