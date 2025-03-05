import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY || "";
const BIRDEYE_API_KEY = import.meta.env.VITE_BIRDEYE_API_KEY || "";
const HELIUS_RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const BIRDEYE_API_ENDPOINT = "https://public-api.birdeye.so/defi/price";
const JUPITER_PRICE_API = "https://api.jup.ag/price/v2";

const TOKEN_ADDRESS = "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump";
const BURN_ADDRESS = "7grCp49j6SExSRud7YA5TdDSbWFyAJjLGif8Syr5CVpc";
const RAYDIUM_VAULT_ADDRESS = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"; // Replace with actual address
const BANK_OF_BUDJU_ADDRESS = "7grCp49j6SExSRud7YA5TdDSbWFyAJjLGif8Syr5CVpc"; // Replace with actual address

const connection = new Connection(HELIUS_RPC_ENDPOINT, "confirmed");

export interface HeliusTokenBalance {
  owner: string;
  amount: number;
}

interface TokenMetrics {
  price: number;
  marketCap: number;
  holders: number;
  volume24h: number;
  totalSupply: number;
  burned: number;
  raydiumVault: number;
  bankOfBudju: number;
}

async function fetchTokenPrice(tokenAddress: string): Promise<number> {
  try {
    const response = await fetch(`${JUPITER_PRICE_API}?ids=${tokenAddress}`, {
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch price from Jupiter: ${response.status} ${response.statusText}`,
      );
    }
    const data = await response.json();
    console.log("Jupiter API response:", data);
    let price = Number(data.data[tokenAddress]?.price || 0);
    if (isNaN(price) || price === 0) {
      const birdEyeData = await fetchBirdEyeData(tokenAddress);
      price = birdEyeData.price;
      console.log("Falling back to BirdEye price:", price);
    }
    return isNaN(price) ? 0 : price;
  } catch (error) {
    console.error("Error fetching token price from Jupiter:", error);
    const birdEyeData = await fetchBirdEyeData(tokenAddress);
    console.log("Using BirdEye price as fallback:", birdEyeData.price);
    return birdEyeData.price;
  }
}

async function fetchBirdEyeData(
  tokenAddress: string,
): Promise<{ price: number; volume24h: number }> {
  try {
    const response = await fetch(
      `${BIRDEYE_API_ENDPOINT}?address=${tokenAddress}`,
      {
        headers: {
          "X-API-KEY": BIRDEYE_API_KEY,
        },
      },
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch data from BirdEye: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }
    const data = await response.json();
    console.log("BirdEye API response:", data);
    return {
      price: Number(data.data.price || 0),
      volume24h: Number(data.data.volume || 0),
    };
  } catch (error) {
    console.error("Error fetching BirdEye data:", error);
    return { price: 0, volume24h: 0 };
  }
}

async function fetchTokenSupplyAndBalances(
  tokenAddress: string = TOKEN_ADDRESS,
  burnAddress: string = BURN_ADDRESS,
): Promise<{
  balances: HeliusTokenBalance[];
  totalSupply: number;
  burned: number;
  raydiumVault: number;
  bankOfBudju: number;
}> {
  try {
    console.log("Received tokenAddress:", tokenAddress);
    console.log("Received burnAddress:", burnAddress);

    const tokenPublicKey = new PublicKey(tokenAddress);
    const burnPublicKey = burnAddress ? new PublicKey(burnAddress) : null;
    const raydiumVaultPublicKey = RAYDIUM_VAULT_ADDRESS
      ? new PublicKey(RAYDIUM_VAULT_ADDRESS)
      : null;
    const bankOfBudjuPublicKey = BANK_OF_BUDJU_ADDRESS
      ? new PublicKey(BANK_OF_BUDJU_ADDRESS)
      : null;

    const mint = await getMint(connection, tokenPublicKey);
    const totalSupply = Number(mint.supply) / 10 ** mint.decimals;

    const tokenAccounts = await connection.getParsedProgramAccounts(
      TOKEN_PROGRAM_ID,
      {
        filters: [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: tokenAddress } },
        ],
      },
    );

    const balances: HeliusTokenBalance[] = tokenAccounts.map((account) => {
      const parsedInfo = account.account.data as { parsed: { info: any } };
      return {
        owner: parsedInfo.parsed.info.owner,
        amount: parsedInfo.parsed.info.tokenAmount.uiAmount || 0,
      };
    });

    const activeBalances = balances.filter(
      (balance) => balance.amount > 0.0001,
    );
    console.log("Raw balances:", balances);
    console.log("Active balances (non-zero, > 0.0001):", activeBalances);
    console.log(
      "Unique holders:",
      new Set(activeBalances.map((b) => b.owner)).size,
    );

    const burned = burnPublicKey
      ? balances
          .filter((balance) => balance.owner === burnAddress)
          .reduce((sum, balance) => sum + (balance.amount || 0), 0)
      : 0;

    const raydiumVault = raydiumVaultPublicKey
      ? balances
          .filter((balance) => balance.owner === RAYDIUM_VAULT_ADDRESS)
          .reduce((sum, balance) => sum + (balance.amount || 0), 0)
      : 0;

    const bankOfBudju = bankOfBudjuPublicKey
      ? balances
          .filter((balance) => balance.owner === BANK_OF_BUDJU_ADDRESS)
          .reduce((sum, balance) => sum + (balance.amount || 0), 0)
      : 0;

    return {
      balances: activeBalances,
      totalSupply,
      burned,
      raydiumVault,
      bankOfBudju,
    };
  } catch (error) {
    console.error("Error fetching token supply and balances:", error);
    throw error;
  }
}

export async function fetchHeliusTokenMetrics(
  tokenAddress: string = TOKEN_ADDRESS,
  burnAddress: string = BURN_ADDRESS,
): Promise<TokenMetrics> {
  try {
    const price = await fetchTokenPrice(tokenAddress);
    const birdEyeData = await fetchBirdEyeData(tokenAddress);
    const { balances, totalSupply, burned, raydiumVault, bankOfBudju } =
      await fetchTokenSupplyAndBalances(tokenAddress, burnAddress);

    const holders = new Set(balances.map((b) => b.owner)).size;
    const circulatingSupply = totalSupply - burned - raydiumVault - bankOfBudju;
    const marketCap = price * circulatingSupply;

    return {
      price,
      marketCap,
      holders,
      volume24h: birdEyeData.volume24h,
      totalSupply,
      burned,
      raydiumVault,
      bankOfBudju,
    };
  } catch (error) {
    console.error("Error in fetchHeliusTokenMetrics:", error);
    throw error;
  }
}

export async function getTokenBalances(
  tokenAddress: string = TOKEN_ADDRESS,
): Promise<HeliusTokenBalance[]> {
  try {
    const { balances } = await fetchTokenSupplyAndBalances(tokenAddress, "");
    return balances;
  } catch (error) {
    console.error("Error in getTokenBalances:", error);
    throw error;
  }
}

export { TOKEN_ADDRESS, BURN_ADDRESS };
