import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  HELIUS_API_KEY,
  HELIUS_RPC,
  BANK_ADDRESS,
} from "@constants/addresses";

// ── Config ──────────────────────────────────────────────
const JLP_MINT = "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4";
const JLP_DECIMALS = 6;
const JUPITER_API_KEY = import.meta.env.VITE_JUPITER_API_KEY || "";

const RPC_ENDPOINT = HELIUS_API_KEY
  ? HELIUS_RPC
  : `${window.location.origin}/api/rpc`;

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 60000,
});

// ── Types ───────────────────────────────────────────────
export interface JLPData {
  price: number;
  bankBalance: number;
  bankValue: number;
  apy: number;
  poolComposition: PoolAsset[];
}

export interface PoolAsset {
  symbol: string;
  name: string;
  weight: number;
  color: string;
}

// ── Cache ───────────────────────────────────────────────
const cache: Record<string, { data: unknown; expiry: number }> = {};

function getCached<T>(key: string): T | null {
  const entry = cache[key];
  return entry && Date.now() < entry.expiry ? (entry.data as T) : null;
}

function setCache(key: string, data: unknown, ttlMs: number): void {
  cache[key] = { data, expiry: Date.now() + ttlMs };
}

// ── Pool composition (target weights from Jupiter) ──────
const POOL_COMPOSITION: PoolAsset[] = [
  { symbol: "SOL", name: "Solana", weight: 40, color: "#9945FF" },
  { symbol: "USDC", name: "USD Coin", weight: 26, color: "#2775CA" },
  { symbol: "ETH", name: "Ethereum", weight: 12, color: "#627EEA" },
  { symbol: "wBTC", name: "Wrapped BTC", weight: 12, color: "#F7931A" },
  { symbol: "USDT", name: "Tether", weight: 10, color: "#26A17B" },
];

// ── Price fetch (Jupiter v3 → DexScreener fallback) ─────
async function fetchJLPPrice(): Promise<number> {
  const cacheKey = "jlp_price";
  const cached = getCached<number>(cacheKey);
  if (cached !== null) return cached;

  // Try Jupiter Price API v3
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (JUPITER_API_KEY) headers["x-api-key"] = JUPITER_API_KEY;

    const res = await fetch(`https://api.jup.ag/price/v3?ids=${JLP_MINT}`, {
      headers,
    });
    if (res.ok) {
      const data = await res.json();
      const price = data?.data?.[JLP_MINT]?.usdPrice;
      if (price && Number(price) > 0) {
        const p = Number(price);
        setCache(cacheKey, p, 5 * 60 * 1000);
        return p;
      }
    }
  } catch {
    // fall through
  }

  // Fallback: DexScreener
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${JLP_MINT}`,
    );
    if (res.ok) {
      const data = await res.json();
      if (data.pairs && data.pairs.length > 0) {
        const pair = [...data.pairs].sort(
          (a: any, b: any) =>
            (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0),
        )[0];
        const price = parseFloat(pair.priceUsd || "0");
        if (price > 0) {
          setCache(cacheKey, price, 5 * 60 * 1000);
          return price;
        }
      }
    }
  } catch {
    // fall through
  }

  return 0;
}

// ── Bank JLP balance ────────────────────────────────────
async function fetchBankJLPBalance(): Promise<number> {
  const cacheKey = "jlp_bank_balance";
  const cached = getCached<number>(cacheKey);
  if (cached !== null) return cached;

  try {
    const bankKey = new PublicKey(BANK_ADDRESS);
    const jlpMint = new PublicKey(JLP_MINT);

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      bankKey,
      { programId: TOKEN_PROGRAM_ID },
    );

    for (const acct of tokenAccounts.value) {
      const info = acct.account.data.parsed.info;
      if (info.mint === jlpMint.toBase58()) {
        const balance = info.tokenAmount.uiAmount || 0;
        setCache(cacheKey, balance, 5 * 60 * 1000);
        return balance;
      }
    }
  } catch (err) {
    console.error("Failed to fetch bank JLP balance:", err);
  }

  setCache(cacheKey, 0, 2 * 60 * 1000);
  return 0;
}

// ── Wallet JLP balance ──────────────────────────────────
export async function fetchWalletJLPBalance(
  walletAddress: string,
): Promise<number> {
  const cacheKey = `jlp_wallet_${walletAddress}`;
  const cached = getCached<number>(cacheKey);
  if (cached !== null) return cached;

  try {
    const walletKey = new PublicKey(walletAddress);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletKey,
      { programId: TOKEN_PROGRAM_ID },
    );

    for (const acct of tokenAccounts.value) {
      const info = acct.account.data.parsed.info;
      if (info.mint === JLP_MINT) {
        const balance = info.tokenAmount.uiAmount || 0;
        setCache(cacheKey, balance, 30 * 1000); // shorter cache for user
        return balance;
      }
    }
  } catch (err) {
    console.error("Failed to fetch wallet JLP balance:", err);
  }

  return 0;
}

// ── APY fetch (DefiLlama → fallback static) ─────────────
async function fetchJLPApy(): Promise<number> {
  const cacheKey = "jlp_apy";
  const cached = getCached<number>(cacheKey);
  if (cached !== null) return cached;

  // Try DefiLlama yields API
  try {
    const res = await fetch("https://yields.llama.fi/pools");
    if (res.ok) {
      const data = await res.json();
      // Find Jupiter Perps JLP pool
      const jlpPool = data.data?.find(
        (pool: any) =>
          pool.project === "jupiter-perps" &&
          pool.symbol?.toUpperCase().includes("JLP"),
      );
      if (jlpPool && jlpPool.apy > 0) {
        const apy = jlpPool.apy;
        setCache(cacheKey, apy, 30 * 60 * 1000);
        return apy;
      }
    }
  } catch {
    // fall through
  }

  // Fallback: reasonable estimate based on historical averages
  const fallbackApy = 22.5;
  setCache(cacheKey, fallbackApy, 60 * 60 * 1000);
  return fallbackApy;
}

// ── Main fetch ──────────────────────────────────────────
export async function fetchJLPData(): Promise<JLPData> {
  const cacheKey = "jlp_data";
  const cached = getCached<JLPData>(cacheKey);
  if (cached) return cached;

  const [price, bankBalance, apy] = await Promise.all([
    fetchJLPPrice(),
    fetchBankJLPBalance(),
    fetchJLPApy(),
  ]);

  const data: JLPData = {
    price,
    bankBalance,
    bankValue: bankBalance * price,
    apy,
    poolComposition: POOL_COMPOSITION,
  };

  setCache(cacheKey, data, 5 * 60 * 1000);
  return data;
}

// Re-export for use in components
export { JLP_MINT, JLP_DECIMALS, POOL_COMPOSITION };
