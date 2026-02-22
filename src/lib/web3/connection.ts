/**
 * This module provides utilities for connecting to the Solana blockchain
 * and interacting with wallets.
 */

import { WALLET_ADAPTER_NETWORK, RPC_ENDPOINT } from "@constants/addresses";
import walletService from "@lib/services/walletService";

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
}

declare global {
  interface Window {
    solana?: SolanaWallet;
    solflare?: SolanaWallet;
    jupiter?: SolanaWallet;
    phantom?: { solana?: SolanaWallet };
  }
}

// Detect if running on a mobile device (in-app browser context)
const isMobileDevice = () =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );

// Wait for wallet provider injection (Phantom in-app browser may delay)
const waitForProvider = (timeout = 2000): Promise<void> =>
  new Promise((resolve) => {
    if (
      window.phantom?.solana ||
      window.solana ||
      window.solflare ||
      window.jupiter
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

// Detect available wallets
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

  // Jupiter wallet injects as window.jupiter or as a standard wallet
  if (window.jupiter) {
    available.push("jupiter");
  }

  if (window.solana && !window.solana.isPhantom && !window.solana.isSolflare) {
    available.push("other");
  }

  return available;
};

// Connect to a wallet
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
        walletAdapter = window.jupiter;
        if (!walletAdapter) {
          throw new Error("Jupiter wallet not detected");
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

// Disconnect from a wallet
export const disconnectWallet = async (): Promise<ConnectionState> => {
  try {
    const walletAdapter =
      window.phantom?.solana || window.solana || window.solflare || window.jupiter;
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

// Check if a wallet is connected
export const checkWalletConnection = async (): Promise<ConnectionState> => {
  try {
    const savedAddress = localStorage.getItem("budjuWalletAddress");
    const savedWalletName = localStorage.getItem("budjuWalletName");
    const savedConnected = localStorage.getItem("budjuWalletConnected");

    if (savedAddress && savedWalletName && savedConnected === "true") {
      // Wait for wallet provider injection (Phantom in-app browser may delay)
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
          walletAdapter = window.jupiter;
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

      // On mobile (in-app browser), eagerly reconnect if isConnected is false.
      // In Phantom/Solflare in-app browsers, connect() is auto-approved (no popup).
      // On desktop, require isConnected to avoid showing an unwanted popup.
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
        return initialState; // Wallet address mismatch
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

// Format wallet address for display
export const formatWalletAddress = (address: string): string => {
  if (!address) return "";
  return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
};
