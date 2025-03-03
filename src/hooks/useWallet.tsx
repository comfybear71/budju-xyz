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
  WalletInfo,
  checkWalletConnection,
  connectWallet,
  disconnectWallet,
  formatWalletAddress,
  checkWalletsAvailability,
} from "@lib/web3/connection";

// Context interface
interface WalletContextType {
  connection: ConnectionState;
  connecting: boolean;
  availableWallets: WalletName[];
  connect: (walletName: WalletName) => Promise<void>;
  disconnect: () => Promise<void>;
  formatAddress: (address: string) => string;
  error: string | null;
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
});

// Hook to use the wallet context
export const useWallet = () => useContext(WalletContext);

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

  // Connect to wallet
  const connect = useCallback(async (walletName: WalletName) => {
    try {
      setConnecting(true);
      setError(null);

      const connectionState = await connectWallet(walletName);
      setConnection(connectionState);

      // Save connection info to localStorage
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

      // Clear connection info from localStorage
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
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
