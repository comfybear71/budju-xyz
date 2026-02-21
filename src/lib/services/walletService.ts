import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TOKEN_ADDRESS, RPC_ENDPOINT } from "@constants/addresses";

const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY || "";
const HELIUS_RPC_ENDPOINT = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : "";
const DEVNET_RPC_ENDPOINT = "https://api.devnet.solana.com";

// Use Helius if key is available, otherwise fall back to public RPC
const mainnetEndpoint = HELIUS_RPC_ENDPOINT || RPC_ENDPOINT;

// Network configurations
const networks: Record<string, Connection> = {
  mainnet: new Connection(mainnetEndpoint, "confirmed"),
  devnet: new Connection(DEVNET_RPC_ENDPOINT, "confirmed"),
};

export type Network = "mainnet" | "devnet";

export interface TokenBalance {
  symbol: string;
  address: string;
  amount: number;
  decimals: number;
}

export interface WalletBalance {
  sol: number;
  tokens: TokenBalance[];
}

export interface WalletData {
  address: string;
  name: string;
  balance: WalletBalance;
}

const walletService = {
  // Current network
  currentNetwork: "mainnet" as Network,

  // Switch network
  switchNetwork(network: Network): void {
    if (networks[network]) {
      this.currentNetwork = network;
    } else {
      throw new Error(`Unsupported network: ${network}`);
    }
  },

  // Get current connection
  getConnection(): Connection {
    return networks[this.currentNetwork];
  },

  // Get SOL balance
  async getSolBalance(walletAddress: string): Promise<number> {
    try {
      const publicKey = new PublicKey(walletAddress);
      const balance = await this.getConnection().getBalance(publicKey);
      return balance / 1e9;
    } catch (error) {
      console.error("Error fetching SOL balance:", error);
      return 0;
    }
  },

  /**
   * Fetch ALL token balances in a single RPC call using getParsedTokenAccountsByOwner.
   * Returns a map of mint address -> { amount, decimals }.
   * Works reliably on both Helius and public RPC endpoints.
   */
  async getAllTokenBalances(
    walletAddress: string,
  ): Promise<Map<string, { amount: number; decimals: number }>> {
    const balances = new Map<string, { amount: number; decimals: number }>();

    try {
      const publicKey = new PublicKey(walletAddress);
      const response = await this.getConnection().getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID },
      );

      for (const account of response.value) {
        const parsed = account.account.data.parsed;
        if (parsed?.info) {
          const mint: string = parsed.info.mint;
          const decimals: number = parsed.info.tokenAmount?.decimals || 0;
          const uiAmount: number = parsed.info.tokenAmount?.uiAmount || 0;
          balances.set(mint, { amount: uiAmount, decimals });
        }
      }
    } catch (error) {
      console.error("Error fetching token accounts:", error);
    }

    return balances;
  },

  // Fetch all balances for a wallet
  async fetchWalletBalances(
    walletAddress: string,
    customTokens: { symbol: string; address: string; decimals: number }[] = [
      { symbol: "BUDJU", address: TOKEN_ADDRESS, decimals: 6 },
    ],
  ): Promise<WalletBalance> {
    try {
      // Fetch SOL + all tokens in parallel (only 2 RPC calls total)
      const [solBalance, tokenMap] = await Promise.all([
        this.getSolBalance(walletAddress),
        this.getAllTokenBalances(walletAddress),
      ]);

      // Map the requested tokens from the results
      const tokens: TokenBalance[] = customTokens.map((token) => {
        const found = tokenMap.get(token.address);
        return {
          symbol: token.symbol,
          address: token.address,
          amount: found ? found.amount : 0,
          decimals: token.decimals,
        };
      });

      return { sol: solBalance, tokens };
    } catch (error) {
      console.error("Error fetching wallet balances:", error);
      return { sol: 0, tokens: [] };
    }
  },

  // Subscribe to balance updates
  subscribeToBalanceUpdates(
    walletAddress: string,
    callback: (balances: WalletBalance) => void,
    customTokens: { symbol: string; address: string; decimals: number }[] = [
      { symbol: "BUDJU", address: TOKEN_ADDRESS, decimals: 6 },
    ],
    intervalMs: number = 30000,
  ): () => void {
    let isActive = true;

    const updateBalances = async () => {
      const balances = await this.fetchWalletBalances(
        walletAddress,
        customTokens,
      );
      if (isActive) callback(balances);
    };

    updateBalances(); // Initial fetch
    const interval = setInterval(updateBalances, intervalMs);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  },

  // Format address for display
  formatAddress(address: string): string {
    if (!address) return "";
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  },

  // Copy address to clipboard
  async copyAddress(address: string): Promise<void> {
    if (!address) throw new Error("No address provided");
    await navigator.clipboard.writeText(address);
  },

  // Open Solscan link
  openSolscan(address: string): void {
    if (!address) return;
    const baseUrl =
      this.currentNetwork === "mainnet"
        ? "https://solscan.io/account"
        : "https://solscan.io/account?cluster=devnet";
    window.open(`${baseUrl}/${address}`, "_blank");
  },
};

export default walletService;
