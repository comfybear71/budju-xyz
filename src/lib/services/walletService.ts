import { TOKEN_ADDRESS } from "@constants/addresses";

// Multiple RPC endpoints for fallback — try each until one works
const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY || "";

const MAINNET_RPC_ENDPOINTS: string[] = [
  // Helius (if key available)
  ...(HELIUS_API_KEY
    ? [`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`]
    : []),
  // Public Solana RPC (supports CORS)
  "https://api.mainnet-beta.solana.com",
];

const DEVNET_RPC_ENDPOINTS: string[] = [
  "https://api.devnet.solana.com",
];

const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

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
 * Make a JSON-RPC call to Solana, trying multiple endpoints until one succeeds.
 */
async function solanaRpc(
  method: string,
  params: unknown[],
  network: Network = "mainnet",
): Promise<any> {
  const endpoints =
    network === "mainnet" ? MAINNET_RPC_ENDPOINTS : DEVNET_RPC_ENDPOINTS;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params,
        }),
      });

      if (!response.ok) {
        console.warn(`RPC ${endpoint} returned ${response.status}, trying next...`);
        continue;
      }

      const json = await response.json();

      if (json.error) {
        console.warn(`RPC ${endpoint} error: ${json.error.message}, trying next...`);
        continue;
      }

      return json.result;
    } catch (error) {
      console.warn(`RPC ${endpoint} failed:`, error);
      continue;
    }
  }

  console.error(`All RPC endpoints failed for ${method}`);
  return null;
}

const walletService = {
  currentNetwork: "mainnet" as Network,

  switchNetwork(network: Network): void {
    this.currentNetwork = network;
  },

  // Get SOL balance via raw JSON-RPC
  async getSolBalance(walletAddress: string): Promise<number> {
    try {
      console.log("[BUDJU] getSolBalance for:", walletAddress);
      const result = await solanaRpc(
        "getBalance",
        [walletAddress, { commitment: "confirmed" }],
        this.currentNetwork,
      );

      if (result && typeof result.value === "number") {
        const sol = result.value / 1e9;
        console.log("[BUDJU] SOL balance:", sol);
        return sol;
      }
      console.warn("[BUDJU] getBalance returned unexpected result:", result);
      return 0;
    } catch (error) {
      console.error("[BUDJU] Error fetching SOL balance:", error);
      return 0;
    }
  },

  /**
   * Fetch ALL SPL token balances in a single RPC call.
   * Uses getTokenAccountsByOwner with jsonParsed encoding.
   * Returns a map of mint address -> { amount, decimals }.
   */
  async getAllTokenBalances(
    walletAddress: string,
  ): Promise<Map<string, { amount: number; decimals: number }>> {
    const balances = new Map<string, { amount: number; decimals: number }>();

    try {
      console.log("[BUDJU] getTokenAccountsByOwner for:", walletAddress);
      const result = await solanaRpc(
        "getTokenAccountsByOwner",
        [
          walletAddress,
          { programId: SPL_TOKEN_PROGRAM_ID },
          { encoding: "jsonParsed", commitment: "confirmed" },
        ],
        this.currentNetwork,
      );

      if (result && Array.isArray(result.value)) {
        console.log("[BUDJU] Token accounts found:", result.value.length);
        for (const account of result.value) {
          const info = account?.account?.data?.parsed?.info;
          if (info) {
            const mint: string = info.mint;
            const decimals: number = info.tokenAmount?.decimals || 0;
            const uiAmount: number = info.tokenAmount?.uiAmount || 0;
            balances.set(mint, { amount: uiAmount, decimals });
            console.log(`[BUDJU] Token ${mint}: ${uiAmount} (${decimals} decimals)`);
          }
        }
      } else {
        console.warn("[BUDJU] getTokenAccountsByOwner returned:", result);
      }
    } catch (error) {
      console.error("[BUDJU] Error fetching token accounts:", error);
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
      // 2 RPC calls in parallel: SOL balance + all token accounts
      const [solBalance, tokenMap] = await Promise.all([
        this.getSolBalance(walletAddress),
        this.getAllTokenBalances(walletAddress),
      ]);

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

    updateBalances();
    const interval = setInterval(updateBalances, intervalMs);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  },

  formatAddress(address: string): string {
    if (!address) return "";
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  },

  async copyAddress(address: string): Promise<void> {
    if (!address) throw new Error("No address provided");
    await navigator.clipboard.writeText(address);
  },

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
