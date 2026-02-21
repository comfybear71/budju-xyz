import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
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

/**
 * Fetch all token balances using Helius DAS API (getAssetsByOwner).
 * Returns a map of mint address -> raw amount, or null if unavailable.
 */
async function fetchBalancesViaHelius(
  walletAddress: string,
): Promise<Map<string, { amount: number; decimals: number }> | null> {
  if (!HELIUS_API_KEY) return null;

  try {
    const response = await fetch(HELIUS_RPC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "budju-balances",
        method: "getAssetsByOwner",
        params: {
          ownerAddress: walletAddress,
          displayOptions: { showFungible: true },
        },
      }),
    });

    if (!response.ok) return null;

    const json = await response.json();
    const items = json?.result?.items;
    if (!Array.isArray(items)) return null;

    const balances = new Map<string, { amount: number; decimals: number }>();

    for (const item of items) {
      if (
        item.interface === "FungibleToken" ||
        item.interface === "FungibleAsset"
      ) {
        const mint = item.id;
        const tokenInfo = item.token_info;
        if (mint && tokenInfo) {
          const decimals = tokenInfo.decimals || 0;
          const rawBalance = Number(tokenInfo.balance || 0);
          balances.set(mint, {
            amount: rawBalance / 10 ** decimals,
            decimals,
          });
        }
      }
    }

    return balances;
  } catch (error) {
    console.error("Helius DAS API error:", error);
    return null;
  }
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
      const balance = await this.getConnection().getBalance(
        publicKey,
        "confirmed",
      );
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      console.error("Error fetching SOL balance:", error);
      return 0;
    }
  },

  // Get token balance via standard SPL method
  async getTokenBalance(
    walletAddress: string,
    tokenAddress: string,
    decimals: number = 6,
  ): Promise<number> {
    try {
      const walletPublicKey = new PublicKey(walletAddress);
      const tokenPublicKey = new PublicKey(tokenAddress);

      const tokenAccountAddress = await getAssociatedTokenAddress(
        tokenPublicKey,
        walletPublicKey,
      );

      const tokenAccount = await getAccount(
        this.getConnection(),
        tokenAccountAddress,
        "confirmed",
      );
      return Number(tokenAccount.amount) / 10 ** decimals;
    } catch (error) {
      const errMsg = (error as any)?.message || String(error);
      if (
        errMsg.includes("TokenAccountNotFound") ||
        errMsg.includes("could not find account")
      ) {
        return 0; // No token account exists
      }
      console.error(`Error fetching token balance for ${tokenAddress}:`, error);
      return 0;
    }
  },

  // Fetch all balances for a wallet
  async fetchWalletBalances(
    walletAddress: string,
    customTokens: { symbol: string; address: string; decimals: number }[] = [
      { symbol: "BUDJU", address: TOKEN_ADDRESS, decimals: 6 },
    ],
  ): Promise<WalletBalance> {
    try {
      // Try Helius DAS API first — single request for all token balances
      const heliusBalances = await fetchBalancesViaHelius(walletAddress);

      if (heliusBalances) {
        // Get SOL balance from the standard RPC (DAS doesn't return native SOL)
        const solBalance = await this.getSolBalance(walletAddress);

        const tokens: TokenBalance[] = customTokens.map((token) => {
          const found = heliusBalances.get(token.address);
          return {
            symbol: token.symbol,
            address: token.address,
            amount: found ? found.amount : 0,
            decimals: token.decimals,
          };
        });

        return { sol: solBalance, tokens };
      }

      // Fallback: fetch individually via standard SPL token methods
      const solBalancePromise = this.getSolBalance(walletAddress);
      const tokenBalancePromises = customTokens.map((token) =>
        this.getTokenBalance(walletAddress, token.address, token.decimals).then(
          (amount) => ({
            symbol: token.symbol,
            address: token.address,
            amount,
            decimals: token.decimals,
          }),
        ),
      );

      const [solBalance, ...tokenBalances] = await Promise.all([
        solBalancePromise,
        ...tokenBalancePromises,
      ]);

      return {
        sol: solBalance,
        tokens: tokenBalances,
      };
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
      try {
        const balances = await this.fetchWalletBalances(
          walletAddress,
          customTokens,
        );
        if (isActive) callback(balances);
      } catch (error) {
        console.error("Balance update failed:", error);
      }
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
