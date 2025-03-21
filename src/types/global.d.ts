import { Transaction, VersionedTransaction } from "@solana/web3.js";

// Define the SolanaWallet interface
interface SolanaWallet {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isConnected?: boolean;
  publicKey?: { toBase58(): string };
  signTransaction(
    transaction: Transaction | VersionedTransaction,
  ): Promise<Transaction | VersionedTransaction>;
  signAllTransactions?(
    transactions: (Transaction | VersionedTransaction)[],
  ): Promise<(Transaction | VersionedTransaction)[]>;
  signAndSendTransaction?(
    transaction: VersionedTransaction,
  ): Promise<{ signature: string }>;
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect(): Promise<void>;
}

// Declare the window interface extensions for Solana wallets
declare global {
  interface Window {
    solana?: SolanaWallet;
    solflare?: SolanaWallet;
  }
}

// Export empty object for TypeScript module system
export {};
