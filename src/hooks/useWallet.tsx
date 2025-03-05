import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import {
  ConnectionState,
  WalletName,
  checkWalletConnection,
  connectWallet,
  disconnectWallet,
  formatWalletAddress,
  checkWalletsAvailability,
} from "@lib/web3/connection";
import walletService, {
  WalletBalance,
  Network,
} from "@lib/services/walletService";

// Context interface
interface WalletContextType {
  connection: ConnectionState;
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

// Custom tokens to track (extend as needed)
const customTokens = [
  {
    symbol: "BUDJU",
    address: "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump",
    decimals: 6,
  },
  // Add more tokens here, e.g.:
  // { symbol: "USDC", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
];

// Provider component
export const WalletProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [connection, setConnection] = useState<ConnectionState>({
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
        setConnection(connectionState);

        if (connectionState.error) {
          setError(connectionState.error);
        } else {
          setError(null);
        }
      } catch (error) {
        console.error("Error checking connection:", error);
        setError("Failed to check wallet connection");
      } finally {
        setConnecting(false);
      }
    };

    checkConnection();
  }, []);

  // Subscribe to balance updates when connected
  useEffect(() => {
    if (connection.connected && connection.wallet?.address) {
      setLoadingBalances(true);
      walletService.switchNetwork(network); // Ensure network is set

      const unsubscribe = walletService.subscribeToBalanceUpdates(
        connection.wallet.address,
        (newBalances) => {
          setBalances(newBalances);
          setLoadingBalances(false);
        },
        customTokens,
        30000, // Update every 30 seconds
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
      setConnection(connectionState);

      if (connectionState.connected && connectionState.wallet) {
        localStorage.setItem(
          "budjuWalletAddress",
          connectionState.wallet.address,
        );
        localStorage.setItem("budjuWalletName", connectionState.wallet.name);
        localStorage.setItem("budjuWalletConnected", "true");
      }

      if (connectionState.error) {
        setError(connectionState.error);
      }
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

      await disconnectWallet();

      setConnection({
        connected: false,
        wallet: null,
        rpcEndpoint: "",
        network: "",
        error: null,
      });

      localStorage.removeItem("budjuWalletAddress");
      localStorage.removeItem("budjuWalletName");
      localStorage.removeItem("budjuWalletConnected");

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
        refreshBalances(); // Refresh balances on network switch
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
