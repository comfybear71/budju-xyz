/**
 * This module provides utilities for connecting to the Solana blockchain
 * and interacting with wallets.
 */

import { WALLET_ADAPTER_NETWORK, RPC_ENDPOINT } from "@constants/addresses";

// Mock wallet types - these would be replaced with actual types from solana libraries
export type WalletName = "phantom" | "jupiter" | "solflare" | "other";

export interface WalletInfo {
  name: WalletName;
  address: string;
  connected: boolean;
  balance: {
    sol: number;
    budju?: number;
    other?: Record<string, number>;
  };
}

// Mock connection state - this would be replaced with actual connection state
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

// Mock wallets - these would be detected from the browser
export const availableWallets: WalletName[] = [
  "phantom",
  "jupiter",
  "solflare",
];

/**
 * Check if wallets are available in the browser
 */
export const checkWalletsAvailability = async (): Promise<WalletName[]> => {
  // In a real implementation, this would check for wallet extensions
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(availableWallets);
    }, 500);
  });
};

/**
 * Connect to a wallet
 */
export const connectWallet = async (
  walletName: WalletName,
): Promise<ConnectionState> => {
  // In a real implementation, this would use wallet adapters to connect
  return new Promise((resolve) => {
    setTimeout(() => {
      // Generate a random Solana address
      const address = generateMockWalletAddress();

      // Create mock wallet info
      const walletInfo: WalletInfo = {
        name: walletName,
        address,
        connected: true,
        balance: {
          sol: parseFloat((Math.random() * 10).toFixed(4)),
          budju: parseFloat((Math.random() * 100000).toFixed(2)),
        },
      };

      // Return connection state
      resolve({
        ...initialState,
        connected: true,
        wallet: walletInfo,
        error: null,
      });
    }, 1000);
  });
};

/**
 * Disconnect from a wallet
 */
export const disconnectWallet = async (): Promise<ConnectionState> => {
  // In a real implementation, this would disconnect from the wallet
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(initialState);
    }, 500);
  });
};

/**
 * Check if a wallet is connected
 */
export const checkWalletConnection = async (): Promise<ConnectionState> => {
  // In a real implementation, this would check localStorage and wallets
  return new Promise((resolve) => {
    // Check if wallet connection is stored in localStorage
    const savedAddress = localStorage.getItem("budjuWalletAddress");
    const savedWalletName = localStorage.getItem("budjuWalletName");

    if (savedAddress && savedWalletName) {
      // Create mock wallet info
      const walletInfo: WalletInfo = {
        name: savedWalletName as WalletName,
        address: savedAddress,
        connected: true,
        balance: {
          sol: parseFloat((Math.random() * 10).toFixed(4)),
          budju: parseFloat((Math.random() * 100000).toFixed(2)),
        },
      };

      // Return connection state
      resolve({
        ...initialState,
        connected: true,
        wallet: walletInfo,
        error: null,
      });
    } else {
      resolve(initialState);
    }
  });
};

/**
 * Check token balance for a wallet
 */
export const checkTokenBalance = async (
  tokenAddress: string,
): Promise<number> => {
  // In a real implementation, this would query the blockchain
  return new Promise((resolve) => {
    setTimeout(() => {
      // Return mock balance
      if (tokenAddress === "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump") {
        // BUDJU token
        resolve(parseFloat((Math.random() * 100000).toFixed(2)));
      } else {
        // Other token
        resolve(parseFloat((Math.random() * 1000).toFixed(2)));
      }
    }, 500);
  });
};

/**
 * Generate a mock wallet address
 */
export const generateMockWalletAddress = (): string => {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const length = 44; // Solana addresses are typically 44 characters
  let address = "";

  for (let i = 0; i < length; i++) {
    address += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return address;
};

/**
 * Format wallet address for display
 */
export const formatWalletAddress = (address: string): string => {
  if (!address) return "";

  // Return first 4 and last 4 characters
  return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
};
