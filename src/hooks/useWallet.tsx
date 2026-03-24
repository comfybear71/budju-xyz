import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { clearAdminAuth } from "@features/trade/services/tradeApi";
import {
  ConnectionState,
  WalletName,
  checkWalletConnection,
  connectWallet,
  disconnectWallet,
  formatWalletAddress,
  checkWalletsAvailability,
  getWalletProvider,
  WalletInfo,
} from "@lib/web3/connection";
import walletService, {
  WalletBalance,
  Network,
} from "@lib/services/walletService";
import { Transaction, VersionedTransaction, Connection } from "@solana/web3.js";

// Define WalletAdapter to include required transaction methods
interface WalletAdapter {
  signTransaction: (
    transaction: Transaction | VersionedTransaction,
  ) => Promise<Transaction | VersionedTransaction>;
  sendTransaction: (
    transaction: Transaction | VersionedTransaction,
  ) => Promise<string>;
  signAndSendTransaction?: (
    transaction: VersionedTransaction,
  ) => Promise<{ signature: string }>;
}

// Extend WalletInfo with WalletAdapter
interface ExtendedWallet extends WalletInfo, WalletAdapter {}

// Update WalletContextType to use ExtendedWallet
interface WalletContextType {
  connection: ConnectionState & { wallet: ExtendedWallet | null };
  connecting: boolean;
  availableWallets: WalletName[];
  connect: (walletName: WalletName) => Promise<void>;
  disconnect: () => Promise<void>;
  formatAddress: (address: string) => string;
  error: string | null;
  network: Network;
  switchNetwork: (network: Network) => void;
  balances: WalletBalance;
  refreshBalances: () => Promise<void>;
  loadingBalances: boolean;
}

// Create context with default values
const WalletContext = createContext<WalletContextType>({
  connection: {
    connected: false,
    wallet: null,
    rpcEndpoint: "",
    network: "",
    error: null,
  },
  connecting: false,
  availableWallets: [],
  connect: async () => {},
  disconnect: async () => {},
  formatAddress: () => "",
  error: null,
  network: "mainnet",
  switchNetwork: () => {},
  balances: { sol: 0, tokens: [] },
  refreshBalances: async () => {},
  loadingBalances: false,
});

// Hook to use the wallet context
export const useWallet = () => useContext(WalletContext);

// Custom tokens to track
const customTokens = [
  {
    symbol: "BUDJU",
    address: "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump",
    decimals: 6,
  },
];

/** Build ExtendedWallet adapter from connection state using centralized provider resolution */
function buildWalletAdapter(
  connectionState: ConnectionState,
): ExtendedWallet | null {
  if (!connectionState.connected || !connectionState.wallet) return null;
  const walletName = connectionState.wallet.name;

  return {
    ...connectionState.wallet,
    signTransaction: async (tx: Transaction | VersionedTransaction) => {
      const provider = getWalletProvider(walletName);
      if (!provider) throw new Error("No wallet provider found");
      if (typeof provider.signTransaction !== "function") {
        throw new Error("Wallet does not support signTransaction method");
      }
      return await provider.signTransaction(tx);
    },
    sendTransaction: async (tx: Transaction | VersionedTransaction) => {
      const provider = getWalletProvider(walletName);
      if (!provider) throw new Error("No wallet provider found");

      if (tx instanceof Transaction) {
        if (typeof provider.signTransaction !== "function") {
          throw new Error("Wallet does not support signTransaction method");
        }
        const signedTx = await provider.signTransaction(tx);
        const solConnection = new Connection(connectionState.rpcEndpoint);
        return await solConnection.sendRawTransaction(signedTx.serialize());
      }

      if (typeof provider.signAndSendTransaction === "function") {
        const result = await provider.signAndSendTransaction(tx);
        return result.signature;
      } else {
        if (typeof provider.signTransaction !== "function") {
          throw new Error("Wallet does not support signTransaction method");
        }
        const signedTx = await provider.signTransaction(tx);
        const solConnection = new Connection(connectionState.rpcEndpoint);
        return await solConnection.sendRawTransaction(signedTx.serialize());
      }
    },
    signAndSendTransaction: async (tx: VersionedTransaction) => {
      const provider = getWalletProvider(walletName);
      if (!provider) throw new Error("No wallet provider found");

      if (typeof provider.signAndSendTransaction === "function") {
        return await provider.signAndSendTransaction(tx);
      }

      if (typeof provider.signTransaction !== "function") {
        throw new Error("Wallet does not support signTransaction method");
      }
      const signedTx = await provider.signTransaction(tx);
      const solConnection = new Connection(connectionState.rpcEndpoint);
      const signature = await solConnection.sendRawTransaction(
        signedTx.serialize(),
      );
      return { signature };
    },
  };
}

// Provider component
export const WalletProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [connection, setConnection] = useState<
    ConnectionState & { wallet: ExtendedWallet | null }
  >({
    connected: false,
    wallet: null,
    rpcEndpoint: "",
    network: "",
    error: null,
  });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableWallets, setAvailableWallets] = useState<WalletName[]>([]);
  const [network, setNetwork] = useState<Network>("mainnet");
  const [balances, setBalances] = useState<WalletBalance>({
    sol: 0,
    tokens: [],
  });
  const [loadingBalances, setLoadingBalances] = useState(false);

  // Check for available wallets
  useEffect(() => {
    const checkWallets = async () => {
      try {
        const wallets = await checkWalletsAvailability();
        setAvailableWallets(wallets);
      } catch (error) {
        console.error("Error checking wallets:", error);
        setAvailableWallets([]);
      }
    };
    checkWallets();
  }, []);

  // Check for existing connection on mount
  useEffect(() => {
    const checkConnection = async () => {
      try {
        setConnecting(true);
        const connectionState = await checkWalletConnection();
        const walletAdapter = buildWalletAdapter(connectionState);
        setConnection({ ...connectionState, wallet: walletAdapter });
        if (connectionState.error) setError(connectionState.error);
        else setError(null);
      } catch (error) {
        console.error("Error checking connection:", error);
        setError("Failed to check wallet connection");
      } finally {
        setConnecting(false);
      }
    };
    checkConnection();
  }, []);

  // Subscribe to balance updates
  useEffect(() => {
    if (connection.connected && connection.wallet?.address) {
      setLoadingBalances(true);
      walletService.switchNetwork(network);
      const unsubscribe = walletService.subscribeToBalanceUpdates(
        connection.wallet.address,
        (newBalances) => {
          setBalances(newBalances);
          setLoadingBalances(false);
        },
        customTokens,
        30000,
      );
      return () => unsubscribe();
    } else {
      setBalances({ sol: 0, tokens: [] });
      setLoadingBalances(false);
    }
  }, [connection.connected, connection.wallet?.address, network]);

  // Connect to wallet
  const connect = useCallback(async (walletName: WalletName) => {
    try {
      setConnecting(true);
      setError(null);

      const connectionState = await connectWallet(walletName);
      const walletAdapter = buildWalletAdapter(connectionState);

      setConnection({ ...connectionState, wallet: walletAdapter });

      if (connectionState.error) setError(connectionState.error);
    } catch (error) {
      console.error("Error connecting to wallet:", error);
      setError("Failed to connect to wallet");
    } finally {
      setConnecting(false);
    }
  }, []);

  // Disconnect from wallet
  const disconnect = useCallback(async () => {
    try {
      setConnecting(true);
      clearAdminAuth(); // Reset cached signature & denial state
      await disconnectWallet();
      setConnection({
        connected: false,
        wallet: null,
        rpcEndpoint: "",
        network: "",
        error: null,
      });
      setError(null);
    } catch (error) {
      console.error("Error disconnecting from wallet:", error);
      setError("Failed to disconnect from wallet");
    } finally {
      setConnecting(false);
    }
  }, []);

  // Switch network
  const switchNetwork = useCallback(
    (newNetwork: Network) => {
      setNetwork(newNetwork);
      walletService.switchNetwork(newNetwork);
      if (connection.connected && connection.wallet?.address) {
        refreshBalances();
      }
    },
    [connection.connected, connection.wallet?.address],
  );

  // Refresh balances manually
  const refreshBalances = useCallback(async () => {
    if (connection.connected && connection.wallet?.address) {
      setLoadingBalances(true);
      setError(null);
      try {
        const newBalances = await walletService.fetchWalletBalances(
          connection.wallet.address,
          customTokens,
        );
        setBalances(newBalances);
      } catch (error) {
        console.error("Error refreshing balances:", error);
        setError("Failed to refresh balances");
      } finally {
        setLoadingBalances(false);
      }
    }
  }, [connection.connected, connection.wallet?.address]);

  return (
    <WalletContext.Provider
      value={{
        connection,
        connecting,
        availableWallets,
        connect,
        disconnect,
        formatAddress: formatWalletAddress,
        error,
        network,
        switchNetwork,
        balances,
        refreshBalances,
        loadingBalances,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
