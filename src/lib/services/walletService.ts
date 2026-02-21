import { TOKEN_ADDRESS } from "@constants/addresses";

// ==========================================
// RPC Proxy — route all Solana calls through the server-side proxy
// so the Helius API key stays server-side (never in the browser).
// Matches the proven FLUB pattern: browser → /api/rpc → Helius/public RPC.
// ==========================================

const RPC_PROXY = "/api/rpc";
const FALLBACK_RPC = "https://api.mainnet-beta.solana.com";

const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// USDC mint address
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

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
 * Make a JSON-RPC call to Solana via the server-side proxy.
 * Falls back to public RPC if the proxy is unreachable.
 */
async function solanaRpc(
  method: string,
  params: unknown[],
): Promise<any> {
  const endpoints = [RPC_PROXY, FALLBACK_RPC];

  for (const endpoint of endpoints) {
    try {
      console.log(`[BUDJU] RPC ${method} → ${endpoint}`);
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
        console.warn(`[BUDJU] RPC ${endpoint} returned ${response.status}, trying next…`);
        continue;
      }

      const json = await response.json();

      if (json.error) {
        console.warn(`[BUDJU] RPC ${endpoint} error: ${json.error.message}, trying next…`);
        continue;
      }

      console.log(`[BUDJU] RPC ${method} success via ${endpoint}`);
      return json.result;
    } catch (error) {
      console.warn(`[BUDJU] RPC ${endpoint} failed:`, error);
      continue;
    }
  }

  console.error(`[BUDJU] All RPC endpoints failed for ${method}`);
  return null;
}

/**
 * Get SOL balance for a wallet address.
 */
async function getSolBalance(walletAddress: string): Promise<number> {
  try {
    const result = await solanaRpc("getBalance", [
      walletAddress,
      { commitment: "confirmed" },
    ]);

    if (result && typeof result.value === "number") {
      const sol = result.value / 1e9;
      console.log(`[BUDJU] SOL balance: ${sol}`);
      return sol;
    }
    return 0;
  } catch (error) {
    console.error("[BUDJU] Error fetching SOL balance:", error);
    return 0;
  }
}

/**
 * Get a single SPL token balance by mint address.
 * Matches the FLUB pattern: getTokenAccountsByOwner with { mint }.
 */
async function getTokenBalance(
  walletAddress: string,
  mintAddress: string,
): Promise<number> {
  try {
    const result = await solanaRpc("getTokenAccountsByOwner", [
      walletAddress,
      { mint: mintAddress },
      { encoding: "jsonParsed", commitment: "confirmed" },
    ]);

    if (result && Array.isArray(result.value) && result.value.length > 0) {
      const info = result.value[0]?.account?.data?.parsed?.info;
      const uiAmount = info?.tokenAmount?.uiAmount || 0;
      console.log(`[BUDJU] Token ${mintAddress}: ${uiAmount}`);
      return uiAmount;
    }
    return 0;
  } catch (error) {
    console.error(`[BUDJU] Error fetching token ${mintAddress}:`, error);
    return 0;
  }
}

const walletService = {
  currentNetwork: "mainnet" as Network,

  switchNetwork(network: Network): void {
    this.currentNetwork = network;
  },

  // Fetch all balances for a wallet — SOL + each token individually by mint
  async fetchWalletBalances(
    walletAddress: string,
    customTokens: { symbol: string; address: string; decimals: number }[] = [
      { symbol: "BUDJU", address: TOKEN_ADDRESS, decimals: 6 },
    ],
  ): Promise<WalletBalance> {
    try {
      console.log("[BUDJU] fetchWalletBalances for:", walletAddress);

      // Ensure USDC is always included
      const hasUsdc = customTokens.some((t) => t.address === USDC_MINT);
      const tokens = hasUsdc
        ? customTokens
        : [...customTokens, { symbol: "USDC", address: USDC_MINT, decimals: 6 }];

      // Fetch SOL + each token in parallel (just like FLUB does)
      const [solBalance, ...tokenBalances] = await Promise.all([
        getSolBalance(walletAddress),
        ...tokens.map((t) => getTokenBalance(walletAddress, t.address)),
      ]);

      const result: TokenBalance[] = tokens.map((t, i) => ({
        symbol: t.symbol,
        address: t.address,
        amount: tokenBalances[i],
        decimals: t.decimals,
      }));

      console.log("[BUDJU] Final balances:", { sol: solBalance, tokens: result });
      return { sol: solBalance, tokens: result };
    } catch (error) {
      console.error("[BUDJU] Error fetching wallet balances:", error);
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
