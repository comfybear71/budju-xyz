import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  HELIUS_API_KEY,
  HELIUS_RPC,
  BANK_ADDRESS,
} from "@constants/addresses";

// ── Config ──────────────────────────────────────────────
// Use Helius RPC if key is available, otherwise use the /api/rpc proxy
// (the proxy keeps the Helius key server-side and avoids 403 from the
// public api.mainnet-beta.solana.com endpoint)
const RPC_ENDPOINT = HELIUS_API_KEY
  ? HELIUS_RPC
  : `${window.location.origin}/api/rpc`;

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 60000,
});

// ── Types ───────────────────────────────────────────────
export interface TokenHolding {
  name: string;
  symbol: string;
  logo: string;
  amount: number;
  value: number;
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

// ── Fetch with retry ────────────────────────────────────
async function retryFetch(
  url: string,
  options: RequestInit,
  retries = 3,
  delay = 1000,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429 && attempt < retries) {
          await new Promise((r) =>
            setTimeout(r, delay * Math.pow(2, attempt)),
          );
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      if (attempt === retries) {
        throw error instanceof Error
          ? error
          : new Error(String(error));
      }
      await new Promise((r) => setTimeout(r, delay * Math.pow(2, attempt)));
    }
  }
  throw new Error("Unexpected error in retryFetch");
}

// ── Known tokens (instant metadata, no API call) ────────
const KNOWN_TOKENS: Record<
  string,
  { name: string; symbol: string; logo: string; color: string }
> = {
  "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump": {
    name: "BUDJU",
    symbol: "BUDJU",
    logo: "/images/tokens/budju.png",
    color: "bg-pink-500",
  },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    name: "USD Coin",
    symbol: "USDC",
    logo: "/images/tokens/usdc.png",
    color: "bg-blue-500",
  },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
    name: "Tether USD",
    symbol: "USDT",
    logo: "/images/tokens/usdt.png",
    color: "bg-green-500",
  },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: {
    name: "Jupiter",
    symbol: "JUP",
    logo: "/images/tokens/jup.svg",
    color: "bg-emerald-500",
  },
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": {
    name: "Wrapped BTC",
    symbol: "wBTC",
    logo: "/images/tokens/btc.svg",
    color: "bg-orange-500",
  },
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": {
    name: "Raydium",
    symbol: "RAY",
    logo: "/images/tokens/ray.svg",
    color: "bg-purple-500",
  },
  "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4": {
    name: "Jupiter Perps LP",
    symbol: "JLP",
    logo: "/images/tokens/jlp.svg",
    color: "bg-emerald-500",
  },
};

const SOL_METADATA = {
  name: "Solana",
  symbol: "SOL",
  logo: "/images/tokens/sol.png",
  color: "bg-violet-500",
};

// ── Price fetch (DexScreener → Jupiter v3 → GeckoTerminal) ──
// Same fallback chain as tokenService.ts — uses plain fetch, no retryFetch
const JUPITER_API_KEY = import.meta.env.VITE_JUPITER_API_KEY || "";

async function fetchDexScreenerPrice(mintAddress: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`,
    );
    if (!res.ok) return 0;
    const data = await res.json();
    if (data.pairs && data.pairs.length > 0) {
      const pair = [...data.pairs].sort(
        (a: any, b: any) =>
          (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0),
      )[0];
      return parseFloat(pair.priceUsd || "0");
    }
  } catch {
    // silent
  }
  return 0;
}

async function fetchJupiterPrice(mintAddress: string): Promise<number> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (JUPITER_API_KEY) headers["x-api-key"] = JUPITER_API_KEY;

    const res = await fetch(
      `https://api.jup.ag/price/v3?ids=${mintAddress}`,
      { headers },
    );
    if (!res.ok) return 0;
    const data = await res.json();
    const price = data?.data?.[mintAddress]?.usdPrice;
    return price ? Number(price) : 0;
  } catch {
    return 0;
  }
}

async function fetchGeckoPrice(mintAddress: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mintAddress}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return 0;
    const data = await res.json();
    const price = data?.data?.attributes?.price_usd;
    return price ? Number(price) : 0;
  } catch {
    return 0;
  }
}

async function fetchTokenPrice(mintAddress: string): Promise<number> {
  const cacheKey = `price_${mintAddress}`;
  const cached = getCached<number>(cacheKey);
  if (cached !== null) return cached;

  // Try DexScreener first (free, no key, most reliable)
  let price = await fetchDexScreenerPrice(mintAddress);
  if (price > 0) {
    setCache(cacheKey, price, 5 * 60 * 1000);
    return price;
  }

  // Fallback to Jupiter v3
  price = await fetchJupiterPrice(mintAddress);
  if (price > 0) {
    setCache(cacheKey, price, 5 * 60 * 1000);
    return price;
  }

  // Fallback to GeckoTerminal
  price = await fetchGeckoPrice(mintAddress);
  if (price > 0) {
    setCache(cacheKey, price, 5 * 60 * 1000);
    return price;
  }

  return 0;
}

// ── Metadata fetch ──────────────────────────────────────
async function fetchTokenMetadata(
  mintAddress: string,
): Promise<{ name: string; symbol: string; logo: string; color: string }> {
  if (KNOWN_TOKENS[mintAddress]) return KNOWN_TOKENS[mintAddress];

  const cacheKey = `meta_${mintAddress}`;
  const cached = getCached<(typeof KNOWN_TOKENS)[string]>(cacheKey);
  if (cached) return cached;

  // Try DAS API via Helius (direct) or the RPC proxy
  try {
    const res = await retryFetch(RPC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "meta",
        method: "getAsset",
        params: { id: mintAddress },
      }),
    });
    const data = await res.json();
    const md = data.result?.content?.metadata || {};
    if (md.name) {
      const meta = {
        name: md.name,
        symbol: md.symbol || "???",
        logo:
          data.result?.content?.links?.image || "/images/tokens/default.svg",
        color: "bg-gray-500",
      };
      setCache(cacheKey, meta, 60 * 60 * 1000);
      return meta;
    }
  } catch {
    // fall through to default
  }

  return {
    name: "Unknown Token",
    symbol: "???",
    logo: "/images/tokens/default.svg",
    color: "bg-gray-500",
  };
}

// ── Main fetch — throws on failure ──────────────────────
export async function fetchBankHoldings(): Promise<TokenHolding[]> {
  const cacheKey = `holdings_${BANK_ADDRESS}`;
  const cached = getCached<TokenHolding[]>(cacheKey);
  if (cached) return cached;

  const bankKey = new PublicKey(BANK_ADDRESS);

  // SOL balance
  const solLamports = await connection.getBalance(bankKey);
  const solAmount = solLamports / 1e9;
  const solPrice = await fetchTokenPrice(
    "So11111111111111111111111111111111111111112",
  );
  const holdings: TokenHolding[] = [
    { ...SOL_METADATA, amount: solAmount, value: solAmount * solPrice },
  ];

  // SPL token accounts
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    bankKey,
    { programId: TOKEN_PROGRAM_ID },
  );

  await Promise.all(
    tokenAccounts.value.map(async (acct) => {
      const info = acct.account.data.parsed.info;
      const mint: string = info.mint;
      const amount: number = info.tokenAmount.uiAmount || 0;
      if (amount < 0.0001) return;

      const [price, meta] = await Promise.all([
        fetchTokenPrice(mint),
        fetchTokenMetadata(mint),
      ]);

      // Include tokens even if price is 0 — shows the holding exists
      holdings.push({ ...meta, amount, value: amount * price });
    }),
  );

  // Sort by value descending, but keep zero-value items at the bottom
  const sorted = holdings.sort((a, b) => b.value - a.value);
  setCache(cacheKey, sorted, 10 * 60 * 1000);
  return sorted;
}
