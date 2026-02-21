// Token addresses
export const TOKEN_ADDRESS =
  import.meta.env.VITE_TOKEN_ADDRESS ||
  "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump";

export const BURN_ADDRESS =
  import.meta.env.VITE_BURN_ADDRESS ||
  "B1opJeR2emYp75spauVHkGXfyxkYSW7GZaN9B3XoUeGK";

export const BURN_ADDRESS_ACCOUNT =
  import.meta.env.VITE_BURN_ADDRESS_ACCOUNT ||
  "9NNvJ9eQwZjWWwzBA5dybi5wgtuZ2FUbwq7jjkRgarJf";
  
export const BANK_ADDRESS =
  import.meta.env.VITE_BANK_ADDRESS ||
  "DWUjFtJQtVDu2yPUoQaf3Lhy1SPt6vor5q1i4fqH13Po";

// Platform links
export const DEX_LINK =
  "https://budjucoin.com/swap";
export const SOLSCAN_LINK =
  "https://solscan.io/token/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump";
export const DEXSCREENER_LINK =
  "https://dexscreener.com/solana/6pmhvxg7a3wcekbpgjgmvivbg1nufsz9na7caqsjxmez";
export const SHOP_URL =
  import.meta.env.VITE_SHOP_URL || "https://shop-of-budjus.myspreadshop.com.au";
export const BURN_URL = 
  "https://solscan.io/account/9NNvJ9eQwZjWWwzBA5dybi5wgtuZ2FUbwq7jjkRgarJf";

// NFT config
export const NFT_TARGET_HOLDERS = Number(
  import.meta.env.VITE_NFT_TARGET_HOLDERS || 1000,
);

// RPC endpoints
export const RPC_ENDPOINT =
  import.meta.env.VITE_RPC_ENDPOINT || "https://api.mainnet-beta.solana.com";
export const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY || "";
export const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Wallet config
export const WALLET_ADAPTER_NETWORK = "mainnet-beta"; // or 'devnet'

// Pool addresses (Raydium AMM — main liquidity)
export const POOL_SOL_BUDJU = "6PMhvxG7a3wceKBpGJgMVivBG1NUfSz9nA7CaQsJxMEZ";
export const POOL_SOL_BUDJU_CLMM = "D61kHQmy8UxD6ks9L6dsponk5yexomBLdG5QaFxaHYka";
export const POOL_USDC_BUDJU = "HJjgx74kiUK7WnDXppj7DaCu1VmNGRWXb2RakmSRvZXC";

//Referral link
export const REFERRAL_LINKS = {
  SWYFTX: "https://trade.swyftx.com/register/?promoRef=rf_LFGXdRrCyKR3CdDmcuTHEw",
  COINBASE: "https://coinbase.com/join/6JNXAB8?src=ios-link",
  COINSPOT: "https://www.coinspot.com.au/join/REFCCB6ME",
  TOKOCRYPTO: "https://www.tokocrypto.com/account/signup?ref=A2749149",
};
